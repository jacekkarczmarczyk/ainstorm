import { z } from 'zod';
import { EngineError, type ChangeContext, type ChangeRecord, type MapEngine } from './engine.ts';
import {
  Ask, isClosed, Owner, ProjectKey, TaskId, TaskStatus, TaskType,
  type EventType, type MapEvent, type MapSnapshot, type Project, type Session, type Task,
} from './model.ts';
import { GITHUB_REPO } from './github.ts';
import { matchProject, type PathOptions } from './paths.ts';
import { parseHeader } from './prompts.ts';
import { shortId } from './text.ts';
import { buildTaskIndex, wouldCreateDepCycle, wouldCreateParentCycle } from './tree.ts';

/**
 * Changes made by a Claude session: through MCP tools (Claude decides) and hooks (automatic).
 * Every operation names its session; the daemon takes the session id from the MCP proxy or the hook input,
 * never from the model, so a session cannot write as another one.
 */

const Text = (max: number) => z.string().trim().min(1).max(max);
const Sha = z.string().regex(/^[0-9a-f]{7,40}$/);

const TaskFields = {
  description: z.string().max(20000).optional(),
  type: TaskType.nullable().optional(),
  areas: z.array(Text(60)).max(20).optional(),
  owner: Owner.optional(),
  ask: Ask.nullable().optional(),
  planPath: z.string().max(1000).nullable().optional(),
  planRef: z.string().max(200).nullable().optional(),
  branch: z.string().max(200).nullable().optional(),
  issue: z.string().max(100).nullable().optional(),
  pr: z.string().max(100).nullable().optional(),
  deferReason: z.object({ summary: Text(200), detail: z.string().max(5000).default('') }).nullable().optional(),
  criteria: z.array(Text(500)).max(30).optional(),
};

export const SessionOp = z.discriminatedUnion('op', [
  /** SessionStart hook: register the session in the project its working directory belongs to */
  z.object({ op: z.literal('start'), cwd: z.string().min(1).max(1000), source: z.enum(['startup', 'resume', 'clear', 'compact']) }),
  /** SessionEnd hook */
  z.object({ op: z.literal('end') }),
  /** UserPromptSubmit and PostToolUse hooks: the session works (and is no longer waiting) */
  z.object({ op: z.literal('active') }),
  /** Stop hook: the turn ended; the session stays "waiting" if Claude said it waits on the user */
  z.object({ op: z.literal('stop') }),
  z.object({ op: z.literal('setTitle'), title: Text(200) }),
  z.object({ op: z.literal('setRunning'), taskId: TaskId.nullable() }),
  /** Claude ends its turn and waits for the user on this task (a decision, an action or approval to start) */
  z.object({ op: z.literal('wait'), taskId: TaskId }),
  /** Notification hook: Claude Code shows a permission prompt in the terminal */
  z.object({ op: z.literal('waitPermission'), tool: Text(200), detail: z.string().max(500).default('') }),
  z.object({ op: z.literal('createTask'), title: Text(200), parentId: TaskId.nullable().optional(), fromId: TaskId.nullable().optional(), status: TaskStatus.optional(), ...TaskFields }),
  z.object({ op: z.literal('updateTask'), taskId: TaskId, expectedVersion: z.number().int().positive().optional(), title: Text(200).optional(), status: TaskStatus.optional(), parentId: TaskId.nullable().optional(), ...TaskFields }),
  z.object({ op: z.literal('link'), taskId: TaskId, dependsOn: TaskId, remove: z.boolean().default(false) }),
  /** PostToolUse hook on `git commit`, or Claude; without a task, the task the session is running */
  z.object({ op: z.literal('addCommit'), taskId: TaskId.optional(), sha: Sha, message: z.string().max(500) }),
  z.object({ op: z.literal('addDecision'), taskId: TaskId, summary: Text(200), detail: z.string().max(5000).default('') }),
  z.object({ op: z.literal('setCriterion'), taskId: TaskId, index: z.number().int().nonnegative(), done: z.boolean() }),
  z.object({ op: z.literal('askQuestion'), taskId: TaskId, text: Text(5000), options: z.array(Text(300)).min(2).max(20).nullable().default(null), multi: z.boolean().default(false) }),
  /** The question no longer applies (e.g. after "Still relevant?"); the reason is shown to the user */
  z.object({ op: z.literal('dismissQuestion'), taskId: TaskId, questionId: Text(100), reason: Text(1000) }),
  /** A new area for the project (MCP tool with "ask" permission): only after the user agreed to it */
  z.object({ op: z.literal('createArea'), name: Text(60) }),
  /** The project's GitHub repository (MCP tool with "ask" permission); null removes it */
  z.object({ op: z.literal('setRepo'), url: z.string().regex(GITHUB_REPO, 'Expected https://github.com/<owner>/<repo>').nullable() }),
  /** The user's focus in the project (/ainstorm:focus): only on the user's request; null clears it */
  z.object({ op: z.literal('setFocus'), taskId: TaskId.nullable() }),
  /** Register a project (MCP tool with "ask" permission); the session is registered with it right away */
  z.object({ op: z.literal('createProject'), key: ProjectKey, name: Text(100), path: z.string().min(1).max(1000) }),
]);
export type SessionOp = z.infer<typeof SessionOp>;

export interface SessionOpResult {
  record: ChangeRecord;
  /** Created task id, registered project key, etc. */
  value: Record<string, unknown>;
}

const SESSION_UNKNOWN = 'This session is not registered: its directory belongs to no ainstorm project. Ask the user for a project key and name, then register it.';

/** Apply one operation of a session. Throws EngineError for unknown ids, broken rules and stale versions. */
export function applySessionOp(engine: MapEngine, sessionId: string, input: unknown, paths: PathOptions = {}): SessionOpResult {
  const op = SessionOp.parse(input);
  const state = engine.state;
  const findSession = () => state.sessions.find(s => s.id === sessionId);
  const session = (): Session => {
    const s = findSession();
    if (!s) throw new EngineError(SESSION_UNKNOWN, 'not_found');
    return s;
  };
  /** A task of the session's project, for writing */
  const task = (id: string): Task => {
    const t = engine.task(id);
    if (t.projectKey !== session().projectKey) throw new EngineError(`${id} belongs to another project`, 'invalid');
    if (t.archivedAt !== null) throw new EngineError(`${id} is deleted`, 'invalid');
    return t;
  };
  /** Areas must be known to the project; a new one is proposed to the user and added with area_create */
  const checkAreas = (areas: readonly string[] | undefined) => {
    if (!areas?.length) return;
    const known = projectAreas(state, session().projectKey);
    const unknown = areas.filter(a => !known.includes(a));
    if (unknown.length) {
      throw new EngineError(`Unknown area: ${unknown.join(', ')}. Known areas: ${known.join(', ') || 'none yet'}. `
        + 'Use a known one, or propose the new area to the user and add it with area_create.', 'invalid');
    }
  };
  const join = (ctx: ChangeContext, t: Task) => {
    if (!t.sessionIds.includes(sessionId)) t.sessionIds.push(sessionId);
    ctx.task(t);
  };
  const run = <R extends Record<string, unknown>>(actor: 'claude' | 'hook', work: (ctx: ChangeContext) => R): SessionOpResult => {
    const { record, result } = engine.record(sessionId, actor, work);
    return { record, value: result };
  };

  switch (op.op) {
    case 'start': {
      const existing = findSession();
      const project = existing ? state.projects.find(p => p.key === existing.projectKey) : matchProject(op.cwd, state.projects, paths);
      if (!project) return { record: emptyRecord(), value: { project: null } };
      return run('hook', ctx => {
        const s = existing ?? newSession(state, sessionId, project.key, ctx.now);
        s.status = 'active';
        s.waiting = null;
        if (op.source === 'compact') s.compactions += 1;
        ctx.session(s);
        return { project: project.key, created: !existing };
      });
    }
    case 'end':
      return run('hook', ctx => {
        const s = session();
        s.status = 'ended';
        s.waiting = null;
        ctx.session(s);
        return {};
      });
    case 'active':
      return run('hook', ctx => {
        const s = session();
        s.status = 'active';
        s.waiting = null;
        ctx.session(s);
        return {};
      });
    case 'stop':
      return run('hook', ctx => {
        const s = session();
        // A turn cannot end while a permission prompt is open: it was answered (a refusal runs no tool, so
        // PostToolUse never cleared it). Waiting on a task of the user's lasts beyond the turn.
        if (s.waiting?.kind === 'permission') s.waiting = null;
        s.status = s.waiting ? 'waiting' : 'idle';
        ctx.session(s);
        return { status: s.status };
      });
    case 'setTitle':
      return run('claude', ctx => {
        const s = session();
        s.title = op.title;
        ctx.session(s);
        return {};
      });
    case 'setRunning':
      return run('claude', ctx => {
        const s = session();
        if (op.taskId !== null) join(ctx, task(op.taskId));
        s.runningTaskId = op.taskId;
        ctx.session(s);
        if (op.taskId !== null) ctx.log({ taskId: op.taskId, type: 'run', text: 'running', delivery: null });
        return {};
      });
    case 'wait':
      return run('claude', ctx => {
        const s = session();
        const t = task(op.taskId);
        join(ctx, t);
        s.waiting = { kind: 'task', taskId: t.id, since: ctx.now };
        s.status = 'waiting';
        ctx.session(s);
        ctx.log({ taskId: t.id, type: 'wait', text: t.title, delivery: null });
        return {};
      });
    case 'waitPermission':
      return run('hook', ctx => {
        const s = session();
        s.waiting = { kind: 'permission', tool: op.tool, detail: op.detail, since: ctx.now };
        s.status = 'waiting';
        ctx.session(s);
        return {};
      });
    case 'createTask': {
      const s = session();
      for (const ref of [op.parentId, op.fromId]) if (ref) task(ref);
      checkAreas(op.areas);
      return run('claude', ctx => {
        const id = nextTaskId(state.tasks, s.projectKey);
        const deferred = op.deferReason ? 'deferred' : undefined;
        const t: Task = {
          id, projectKey: s.projectKey, title: op.title, description: op.description ?? '', status: op.status ?? deferred ?? 'todo',
          type: op.type ?? null, areas: op.areas ?? [], owner: op.owner ?? 'claude', ask: op.ask ?? null,
          parentId: op.parentId ?? null, fromId: op.fromId ?? null, deps: [], planPath: op.planPath ?? null, planRef: op.planRef ?? null,
          branch: op.branch ?? null, issue: op.issue ?? null, pr: op.pr ?? null, deferReason: op.deferReason ?? null,
          criteria: (op.criteria ?? []).map(text => ({ text, done: false })), decisions: [], commits: [], sessionIds: [sessionId],
          questions: [], archivedAt: null, createdAt: ctx.now, updatedAt: ctx.now, version: 0,
        };
        state.tasks.push(t);
        ctx.task(t);
        ctx.log({ taskId: id, type: t.status === 'deferred' ? 'defer' : 'create', text: t.title, delivery: null });
        return { taskId: id };
      });
    }
    case 'updateTask': {
      const t = task(op.taskId);
      checkAreas(op.areas?.filter(a => !t.areas.includes(a)));
      if (op.expectedVersion !== undefined && op.expectedVersion !== t.version) {
        throw new EngineError(`${t.id} changed meanwhile (version ${t.version}, expected ${op.expectedVersion}); read it again`, 'conflict');
      }
      if (op.parentId !== undefined) {
        if (op.parentId !== null) task(op.parentId);
        if (wouldCreateParentCycle(buildTaskIndex(state.tasks), t.id, op.parentId)) throw new EngineError(`${t.id} cannot be moved under its own subtask`, 'invalid');
      }
      return run('claude', ctx => {
        const from = t.status;
        const { op: _op, taskId: _id, expectedVersion: _v, criteria, ...fields } = op;
        Object.assign(t, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)));
        if (criteria) t.criteria = criteria.map(text => ({ text, done: t.criteria.find(c => c.text === text)?.done ?? false }));
        if (op.deferReason && op.status === undefined) t.status = 'deferred';
        join(ctx, t);
        if (t.status !== from) {
          ctx.log({ taskId: t.id, type: statusEvent(t.status), text: `${from} → ${t.status}`, delivery: null });
          if (isClosed(t.status)) engine.resolveWaiting(t).forEach(ctx.session);
        }
        // Done with unticked criteria looks unfinished in the map: tell Claude, which can tick them or reopen
        const unticked = t.status === 'done' ? t.criteria.filter(c => !c.done).map(c => c.text) : [];
        return unticked.length
          ? { version: t.version, warning: `${t.id} is done but these "done when" criteria are not ticked: ${unticked.join('; ')}. Tick the ones you verified with criterion_set.` }
          : { version: t.version };
      });
    }
    case 'link': {
      const t = task(op.taskId);
      task(op.dependsOn);
      if (!op.remove && wouldCreateDepCycle(buildTaskIndex(state.tasks), t.id, op.dependsOn)) {
        throw new EngineError(`${t.id} → ${op.dependsOn} would make a dependency cycle`, 'invalid');
      }
      return run('claude', ctx => {
        t.deps = op.remove ? t.deps.filter(d => d !== op.dependsOn) : [...new Set([...t.deps, op.dependsOn])];
        join(ctx, t);
        return {};
      });
    }
    case 'addCommit': {
      const s = session();
      const taskId = op.taskId ?? s.runningTaskId;
      if (!taskId) return { record: emptyRecord(), value: { attached: false } };
      const t = task(taskId);
      if (t.commits.some(c => c.sha === op.sha)) return { record: emptyRecord(), value: { attached: false } };
      return run(op.taskId ? 'claude' : 'hook', ctx => {
        t.commits.push({ sha: op.sha, message: op.message, state: 'live', intoSha: null, note: null });
        join(ctx, t);
        ctx.log({ taskId: t.id, type: 'commit', text: `${op.sha.slice(0, 9)} ${op.message}`.trim(), delivery: null });
        return { attached: true, taskId: t.id };
      });
    }
    case 'addDecision': {
      const t = task(op.taskId);
      return run('claude', ctx => {
        t.decisions.push({ at: ctx.now, summary: op.summary, detail: op.detail });
        join(ctx, t);
        return {};
      });
    }
    case 'setCriterion': {
      const t = task(op.taskId);
      const criterion = t.criteria[op.index];
      if (!criterion) throw new EngineError(`${t.id} has no criterion ${op.index}`, 'not_found');
      return run('claude', ctx => {
        criterion.done = op.done;
        join(ctx, t);
        return {};
      });
    }
    case 'askQuestion': {
      const t = task(op.taskId);
      return run('claude', ctx => {
        const id = `q${t.questions.length + 1}`;
        t.questions.push({ id, sessionId, text: op.text, options: op.options, multi: op.multi, askedAt: ctx.now, answer: null, dismissed: null });
        join(ctx, t);
        ctx.log({ taskId: t.id, type: 'wait', text: op.text, delivery: null });
        return { questionId: id };
      });
    }
    case 'dismissQuestion': {
      const t = task(op.taskId);
      const question = engine.question(t, op.questionId);
      if (question.answer || question.dismissed) throw new EngineError(`Question ${question.id} is already closed`, 'invalid');
      return run('claude', ctx => {
        question.dismissed = { at: ctx.now, reason: op.reason };
        join(ctx, t);
        ctx.log({ taskId: t.id, type: 'answer', text: `closed: ${op.reason}`, delivery: null });
        return {};
      });
    }
    case 'createArea': {
      const s = session();
      const project = state.projects.find(p => p.key === s.projectKey)!;
      if (projectAreas(state, project.key).includes(op.name)) return { record: emptyRecord(), value: { area: op.name, created: false } };
      return run('claude', ctx => {
        project.areas = [...project.areas, op.name];
        ctx.project(project);
        return { area: op.name, created: true };
      });
    }
    case 'setRepo': {
      const s = session();
      const project = state.projects.find(p => p.key === s.projectKey)!;
      return run('claude', ctx => {
        project.repoUrl = op.url;
        ctx.project(project);
        return { repoUrl: project.repoUrl };
      });
    }
    case 'setFocus': {
      const s = session();
      const project = state.projects.find(p => p.key === s.projectKey)!;
      const t = op.taskId === null ? null : task(op.taskId);
      return run('claude', ctx => {
        project.focusTaskId = t?.id ?? null;
        ctx.project(project);
        if (t) ctx.log({ taskId: t.id, type: 'focus', text: 'project focus', delivery: null });
        return { focus: project.focusTaskId };
      });
    }
    case 'createProject': {
      if (state.projects.some(p => p.key === op.key)) throw new EngineError(`Project ${op.key} already exists`, 'invalid');
      return run('claude', ctx => {
        const project: Project = { key: op.key, name: op.name, paths: [op.path], focusTaskId: null, areas: [], repoUrl: null };
        state.projects.push(project);
        ctx.project(project);
        const s = findSession() ?? newSession(state, sessionId, project.key, ctx.now);
        s.status = 'active';
        ctx.session(s);
        return { project: project.key };
      });
    }
  }
}

/**
 * Changes from the UI the session has not seen yet, as events. Marks them delivered to this session,
 * so each change reaches the session once (via a hook's additional context).
 */
export function takeDeliveries(engine: MapEngine, sessionId: string): { events: MapEvent[]; record: ChangeRecord } {
  const { record, result } = engine.record(sessionId, 'hook', ctx => {
    const due = engine.state.events.filter(e => e.delivery?.state === 'pending'
      && e.delivery.sessionIds.includes(sessionId) && !e.delivery.deliveredTo.includes(sessionId));
    due.forEach(e => markDelivered(ctx, e, sessionId));
    return due;
  });
  return { events: result, record };
}

function markDelivered(ctx: ChangeContext, e: MapEvent, sessionId: string) {
  const delivery = e.delivery!;
  if (!delivery.deliveredTo.includes(sessionId)) delivery.deliveredTo.push(sessionId);
  if (delivery.sessionIds.every(id => delivery.deliveredTo.includes(id))) delivery.state = 'delivered';
  ctx.event(e);
}

export type PromptCheck = { block: null; record: ChangeRecord } | { block: string; record: ChangeRecord };

/**
 * UserPromptSubmit: a prompt copied from the UI carries a header naming its change and target.
 * Blocks it when pasted into another session or project, twice, or after the change was undone.
 * A message without the header is an ordinary prompt and passes.
 */
export function checkPrompt(engine: MapEngine, sessionId: string, prompt: string): PromptCheck {
  const header = parseHeader(prompt);
  const pass = (): PromptCheck => ({ block: null, record: emptyRecord() });
  if (!header) return pass();
  const state = engine.state;
  const session = state.sessions.find(s => s.id === sessionId);
  const project = session ? state.projects.find(p => p.key === session.projectKey) : undefined;
  const block = (reason: string): PromptCheck => ({ block: `ainstorm: ${reason}`, record: emptyRecord() });

  if (header.sessionShort !== null && header.sessionShort !== shortId(sessionId)) {
    const target = state.sessions.find(s => shortId(s.id) === header.sessionShort);
    return block(`this prompt is for another session${target ? ` („${target.title}”, ${header.sessionShort})` : ` (${header.sessionShort})`}. Paste it there.`);
  }
  if (project && header.projectName !== project.name) return block(`this prompt is for project ${header.projectName}, this session works in ${project.name}.`);
  const events = state.events.filter(e => e.changeId === header.changeId);
  if (events.length === 0) {
    const fate = engine.changeFate(header.changeId);
    if (fate === 'undone') return block(`change #${header.changeId} was undone in the map, so there is nothing to do.`);
    if (fate === 'unconfirmed') {
      return block(`change #${header.changeId} was never confirmed in the map: its dialog was closed without confirming, so nothing changed. `
        + 'Make the change again in the map, confirm it, and paste the new prompt.');
    }
    return block(`change #${header.changeId} does not exist in the map.`);
  }
  if (events.every(e => e.delivery?.deliveredTo.includes(sessionId))) return block(`change #${header.changeId} was already delivered to this session.`);

  const { record } = engine.record(sessionId, 'hook', ctx => {
    for (const e of events) {
      if (!e.delivery) continue;
      if (!e.delivery.sessionIds.includes(sessionId)) e.delivery.sessionIds.push(sessionId);
      markDelivered(ctx, e, sessionId);
    }
  });
  return { block: null, record };
}

function newSession(state: MapEngine['state'], id: string, projectKey: string, now: string): Session {
  const session: Session = {
    id, projectKey, title: `Session ${shortId(id)}`, status: 'active', startedAt: now, archivedAt: null,
    runningTaskId: null, waiting: null, note: null, compactions: 0,
  };
  state.sessions.push(session);
  return session;
}

/** Areas known to a project: registered ones and those its tasks already use, sorted. */
export function projectAreas(state: MapSnapshot, projectKey: string): string[] {
  const registered = state.projects.find(p => p.key === projectKey)?.areas ?? [];
  const used = state.tasks.filter(t => t.projectKey === projectKey && t.archivedAt === null).flatMap(t => t.areas);
  return [...new Set([...registered, ...used])].sort((a, b) => a.localeCompare(b));
}

/** Next free number in the project, counting deleted tasks too, so ids are never reused. */
export function nextTaskId(tasks: readonly Task[], projectKey: string): string {
  const prefix = `${projectKey}-`;
  const max = Math.max(0, ...tasks.filter(t => t.id.startsWith(prefix)).map(t => Number(t.id.slice(prefix.length))));
  return `${prefix}${max + 1}`;
}

const emptyRecord = (): ChangeRecord => ({ changeId: null, taskIds: [], sessionIds: [], projectKeys: [], addedEventIds: [], removedEventIds: [], updatedEventIds: [] });
const statusEvent = (to: Task['status']): EventType => (to === 'done' ? 'done' : to === 'dropped' ? 'drop' : to === 'deferred' ? 'defer' : to === 'blocked' ? 'block' : 'status');
