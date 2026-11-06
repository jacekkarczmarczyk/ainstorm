import { z } from 'zod';
import {
  Delivery, isClosed, MapSnapshot, ProjectKey, Session, SessionId, Task, TaskId, TaskStatus,
  type Actor, type EventType, type MapEvent, type Project,
} from './model.ts';
import { withCommit } from './commitMessage.ts';
import { issueNumber } from './github.ts';
import { isSessionOpen, targetSessions } from './sessions.ts';
import { openQuestions } from './status.ts';
import { buildTaskIndex, descendants, wouldCreateParentCycle } from './tree.ts';

/**
 * Changes the user makes in the UI. Each one is a single change with an id, so it can be undone,
 * delivered to sessions and referenced in a copied prompt. Validated by the daemon at the HTTP boundary.
 */
export const UserCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setStatus'), taskId: TaskId, to: TaskStatus, notify: z.boolean() }),
  z.object({ type: z.literal('archiveTask'), taskId: TaskId, notify: z.boolean() }),
  z.object({ type: z.literal('setProjectFocus'), projectKey: ProjectKey, taskId: TaskId.nullable() }),
  z.object({ type: z.literal('answerQuestion'), taskId: TaskId, questionId: z.string().min(1).max(100), answer: z.string().min(1).max(5000) }),
  z.object({ type: z.literal('promoteTask'), taskId: TaskId, blocksId: TaskId }),
  /** Move under another parent (null = top level); cycles are rejected */
  z.object({ type: z.literal('moveTask'), taskId: TaskId, parentId: TaskId.nullable(), notify: z.boolean() }),
  z.object({ type: z.literal('archiveSession'), sessionId: SessionId }),
  z.object({ type: z.literal('restoreSession'), sessionId: SessionId }),
  /** Run, Pause and Go ahead are prompts the user pastes; only recorded */
  z.object({ type: z.literal('requestSession'), request: z.enum(['run', 'pause', 'goAhead']), taskId: TaskId, sessionId: SessionId.nullable() }),
  /** Ask the session whether an open question still applies; only recorded, the session answers or closes it */
  z.object({ type: z.literal('recheckQuestion'), taskId: TaskId, questionId: z.string().min(1).max(100), notify: z.boolean() }),
  /** The user's decision on their own task: yes hands it to Claude, no drops it */
  z.object({ type: z.literal('decideTask'), taskId: TaskId, approve: z.boolean(), note: z.string().max(2000), notify: z.boolean() }),
  /** The commit message a code task intends to make (end of its description) */
  z.object({ type: z.literal('setCommitMessage'), taskId: TaskId, message: z.string().max(5000), notify: z.boolean() }),
  /** Ask the session to create or close the task's GitHub issue (with gh); only recorded and delivered */
  z.object({ type: z.literal('requestIssue'), taskId: TaskId, request: z.enum(['create', 'close']), notify: z.boolean() }),
  /** Bulk actions on tasks selected in the tree: one change, undone as a whole */
  z.object({ type: z.literal('setStatusMany'), taskIds: z.array(TaskId).min(1).max(100), to: TaskStatus, notify: z.boolean() }),
  z.object({ type: z.literal('moveMany'), taskIds: z.array(TaskId).min(1).max(100), parentId: TaskId.nullable(), notify: z.boolean() }),
  /** Run several tasks in order with one pasted prompt (ticked in the tree); only recorded, one change for all */
  z.object({ type: z.literal('requestRunMany'), taskIds: z.array(TaskId).min(1).max(20), sessionId: SessionId.nullable() }),
]);
export type UserCommand = z.infer<typeof UserCommand>;

/** What a change touched: the daemon writes exactly these rows; ids refer to the engine state after the change. */
export interface ChangeRecord {
  /** Id of a user change (undoable, referenced by prompts); null for changes made by sessions and hooks */
  changeId: number | null;
  taskIds: string[];
  sessionIds: string[];
  projectKeys: string[];
  addedEventIds: number[];
  removedEventIds: number[];
  updatedEventIds: number[];
}

/** A change made by the user: always has an id */
export type UserChangeRecord = ChangeRecord & { changeId: number };

interface UndoEntry {
  tasks: Task[];
  sessions: Session[];
  focus: { projectKey: string; taskId: string | null } | null;
  eventIds: number[];
}

export type NewEvent = Omit<MapEvent, 'id' | 'at' | 'changeId' | 'actor' | 'sessionId' | 'delivery'> & { delivery: z.input<typeof Delivery> | null };

/** not_found → 404, invalid → 409 (breaks a rule), conflict → 409 (stale expected version) */
export type EngineErrorCode = 'not_found' | 'invalid' | 'conflict';

/** What a session change may do: log events and mark the rows it touched (a touched task gets a new version). */
export interface ChangeContext {
  readonly now: string;
  log(e: NewEvent): void;
  task(t: Task): void;
  session(s: Session): void;
  project(p: Project): void;
  event(e: MapEvent): void;
}

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(message: string, code: EngineErrorCode) {
    super(message);
    this.code = code;
  }
}

/**
 * The map in memory plus every rule for changing it: events, delivery to sessions and undo.
 * Pure (no I/O); the daemon persists what each change touched, the UI fixture keeps it in memory.
 */
export class MapEngine {
  readonly state: MapSnapshot;
  private nextEventId: number;
  private nextChangeId: number;
  private readonly undo = new Map<number, UndoEntry>();
  private readonly now: () => string;

  constructor(initial: MapSnapshot, now: () => string = () => new Date().toISOString()) {
    this.now = now;
    // parse() returns a deep copy, so the caller's snapshot is never mutated
    this.state = MapSnapshot.parse(initial);
    this.nextEventId = Math.max(0, ...this.state.events.map(e => e.id)) + 1;
    this.nextChangeId = Math.max(999, ...this.state.events.map(e => e.changeId ?? 0)) + 1;
  }

  /** Reserve the id of the next change, so its prompt can be shown and copied before the change is made. */
  reserveChangeId(): number {
    return this.nextChangeId++;
  }

  execute(command: UserCommand, changeId?: number, actor: Actor = 'user'): UserChangeRecord {
    const id = changeId ?? this.reserveChangeId();
    switch (command.type) {
      case 'setStatus': {
        const t = this.task(command.taskId);
        const from = t.status;
        return this.change(id, actor, [t.id], this.waitingOn(t.id), null, log => {
          t.status = command.to;
          this.touch(t);
          if (isClosed(command.to)) this.resolveWaiting(t);
          log({ taskId: t.id, type: statusEvent(command.to), text: `${from} → ${command.to}`, delivery: this.delivery(t, command.notify) });
        });
      }
      case 'archiveTask': {
        const t = this.task(command.taskId);
        const all = [t, ...descendants(buildTaskIndex(this.state.tasks), t.id)];
        return this.change(id, actor, all.map(x => x.id), [], null, log => {
          const at = this.now();
          all.forEach(x => { x.archivedAt = at; this.touch(x); });
          log({ taskId: t.id, type: 'archive', text: all.length > 1 ? `with ${all.length - 1} subtasks` : '', delivery: this.delivery(t, command.notify) });
        });
      }
      case 'setProjectFocus': {
        const project = this.state.projects.find(p => p.key === command.projectKey);
        if (!project) throw new EngineError(`Unknown project ${command.projectKey}`, 'not_found');
        if (command.taskId !== null) this.task(command.taskId);
        return this.change(id, actor, [], [], project.key, log => {
          project.focusTaskId = command.taskId;
          if (command.taskId !== null) log({ taskId: command.taskId, type: 'focus', text: 'project focus', delivery: { state: 'none', sessionIds: [] } });
        });
      }
      case 'answerQuestion': {
        const t = this.task(command.taskId);
        const question = this.question(t, command.questionId);
        if (question.answer) throw new EngineError(`Question ${question.id} is already answered`, 'invalid');
        return this.change(id, actor, [t.id], this.waitingOn(t.id), null, log => {
          question.answer = { text: command.answer, at: this.now() };
          // Answering the last question of a decision task closes it
          if (t.owner === 'me' && t.ask === 'decision' && openQuestions(t).length === 0 && !isClosed(t.status)) {
            t.status = 'done';
            this.resolveWaiting(t);
          }
          this.touch(t);
          log({ taskId: t.id, type: 'answer', text: command.answer, delivery: this.questionDelivery(question.sessionId, true) });
        });
      }
      case 'promoteTask': {
        const t = this.task(command.taskId);
        this.task(command.blocksId);
        return this.change(id, actor, [t.id], [], null, log => {
          t.status = 'todo';
          this.touch(t);
          log({ taskId: t.id, type: 'promote', text: `blocks ${command.blocksId}`, delivery: this.delivery(t, true) });
        });
      }
      case 'moveTask': {
        const t = this.task(command.taskId);
        if (command.parentId !== null) this.task(command.parentId);
        if (wouldCreateParentCycle(buildTaskIndex(this.state.tasks), t.id, command.parentId)) {
          throw new EngineError(`${t.id} cannot be moved under its own subtask`, 'invalid');
        }
        const from = t.parentId;
        return this.change(id, actor, [t.id], [], null, log => {
          t.parentId = command.parentId;
          this.touch(t);
          log({ taskId: t.id, type: 'status', text: `moved: ${from ?? 'top level'} → ${command.parentId ?? 'top level'}`, delivery: this.delivery(t, command.notify) });
        });
      }
      case 'recheckQuestion': {
        const t = this.task(command.taskId);
        const question = this.question(t, command.questionId);
        return this.change(id, actor, [], [], null, log => {
          log({ taskId: t.id, type: 'recheck', text: question.text, delivery: this.questionDelivery(question.sessionId, command.notify) });
        });
      }
      case 'decideTask': {
        const t = this.task(command.taskId);
        if (t.owner !== 'me' || isClosed(t.status)) throw new EngineError(`${t.id} is not an open task of yours`, 'invalid');
        return this.change(id, actor, [t.id], this.waitingOn(t.id), null, log => {
          if (command.approve) {
            t.owner = 'claude';
            t.ask = null;
          } else {
            t.status = 'dropped';
          }
          this.touch(t);
          this.resolveWaiting(t);
          const note = command.note.trim();
          log({ taskId: t.id, type: command.approve ? 'answer' : 'drop', text: `${command.approve ? 'decided: yes' : 'decided: no'}${note ? ` — ${note}` : ''}`, delivery: this.delivery(t, command.notify) });
        });
      }
      case 'archiveSession':
      case 'restoreSession': {
        const s = this.session(command.sessionId);
        return this.change(id, actor, [], [s.id], null, () => {
          s.archivedAt = command.type === 'archiveSession' ? this.now() : null;
        });
      }
      case 'requestSession': {
        this.task(command.taskId);
        if (command.sessionId !== null) this.session(command.sessionId);
        return this.change(id, actor, [], [], null, log => {
          const type: EventType = command.request === 'pause' ? 'pause' : 'run';
          log({ taskId: command.taskId, type, text: command.request, delivery: { state: 'copied', sessionIds: command.sessionId ? [command.sessionId] : [] } });
        });
      }
      case 'setCommitMessage': {
        const t = this.task(command.taskId);
        return this.change(id, actor, [t.id], [], null, log => {
          t.description = withCommit(t.description, command.message);
          this.touch(t);
          const subject = command.message.trim().split('\n')[0] ?? '';
          log({ taskId: t.id, type: 'edit', text: subject ? `commit message: ${subject}` : 'commit message removed', delivery: this.delivery(t, command.notify) });
        });
      }
      case 'requestIssue': {
        const t = this.task(command.taskId);
        const repo = this.state.projects.find(p => p.key === t.projectKey)?.repoUrl ?? null;
        if (!repo) throw new EngineError(`Project ${t.projectKey} has no GitHub repository`, 'invalid');
        const n = issueNumber(t.issue, repo);
        if (command.request === 'create' && n !== null) throw new EngineError(`${t.id} already has issue #${n}`, 'invalid');
        if (command.request === 'close' && n === null) throw new EngineError(`${t.id} has no issue`, 'invalid');
        return this.change(id, actor, [], [], null, log => {
          log({ taskId: t.id, type: 'issue', text: command.request === 'create' ? 'create issue' : `close issue #${n}`, delivery: this.delivery(t, command.notify) });
        });
      }
      case 'setStatusMany': {
        const tasks = [...new Set(command.taskIds)].map(taskId => this.task(taskId)).filter(t => t.status !== command.to);
        if (tasks.length === 0) throw new EngineError(`All tasks are already ${command.to}`, 'invalid');
        const waiting = [...new Set(tasks.flatMap(t => this.waitingOn(t.id)))];
        return this.change(id, actor, tasks.map(t => t.id), waiting, null, log => {
          for (const t of tasks) {
            const from = t.status;
            t.status = command.to;
            this.touch(t);
            if (isClosed(command.to)) this.resolveWaiting(t);
            log({ taskId: t.id, type: statusEvent(command.to), text: `${from} → ${command.to}`, delivery: this.delivery(t, command.notify) });
          }
        });
      }
      case 'moveMany': {
        const tasks = [...new Set(command.taskIds)].map(taskId => this.task(taskId)).filter(t => t.parentId !== command.parentId);
        if (command.parentId !== null) this.task(command.parentId);
        const index = buildTaskIndex(this.state.tasks);
        const cycle = tasks.find(t => wouldCreateParentCycle(index, t.id, command.parentId));
        if (cycle) throw new EngineError(`${cycle.id} cannot be moved under its own subtask`, 'invalid');
        if (tasks.length === 0) throw new EngineError('All tasks are already there', 'invalid');
        return this.change(id, actor, tasks.map(t => t.id), [], null, log => {
          for (const t of tasks) {
            const from = t.parentId;
            t.parentId = command.parentId;
            this.touch(t);
            log({ taskId: t.id, type: 'status', text: `moved: ${from ?? 'top level'} → ${command.parentId ?? 'top level'}`, delivery: this.delivery(t, command.notify) });
          }
        });
      }
      case 'requestRunMany': {
        const taskIds = [...new Set(command.taskIds)];
        taskIds.forEach(taskId => this.task(taskId));
        if (command.sessionId !== null) this.session(command.sessionId);
        return this.change(id, actor, [], [], null, log => {
          taskIds.forEach((taskId, i) => log({
            taskId, type: 'run', text: `run ${i + 1}/${taskIds.length}`,
            delivery: { state: 'copied', sessionIds: command.sessionId ? [command.sessionId] : [] },
          }));
        });
      }
    }
  }

  /** Undo a change made in the UI. Returns null when it is unknown or already reverted. */
  revert(changeId: number): UserChangeRecord | null {
    const entry = this.undo.get(changeId);
    if (!entry) return null;
    this.undo.delete(changeId);
    const restore = <T extends { id: string }>(list: T[], saved: T[]) => list.map(x => saved.find(s => s.id === x.id) ?? x);
    this.state.tasks = restore(this.state.tasks, entry.tasks);
    this.state.sessions = restore(this.state.sessions, entry.sessions);
    if (entry.focus) {
      const project = this.state.projects.find(p => p.key === entry.focus!.projectKey);
      if (project) project.focusTaskId = entry.focus.taskId;
    }
    this.state.events = this.state.events.filter(e => !entry.eventIds.includes(e.id));
    return {
      changeId, taskIds: entry.tasks.map(t => t.id), sessionIds: entry.sessions.map(s => s.id),
      projectKeys: entry.focus ? [entry.focus.projectKey] : [], addedEventIds: [], removedEventIds: entry.eventIds, updatedEventIds: [],
    };
  }

  /** The user copied the prompt for a change instead of relying on automatic delivery. */
  markCopied(changeId: number): UserChangeRecord {
    const updated = this.state.events.filter(e => e.changeId === changeId && e.delivery?.state === 'pending');
    updated.forEach(e => { e.delivery!.state = 'copied'; });
    return { changeId, taskIds: [], sessionIds: [], projectKeys: [], addedEventIds: [], removedEventIds: [], updatedEventIds: updated.map(e => e.id) };
  }

  task(id: string): Task {
    const found = this.state.tasks.find(t => t.id === id);
    if (!found) throw new EngineError(`Unknown task ${id}`, 'not_found');
    return found;
  }

  session(id: string): Session {
    const found = this.state.sessions.find(s => s.id === id);
    if (!found) throw new EngineError(`Unknown session ${id}`, 'not_found');
    return found;
  }

  question(t: Task, id: string) {
    const found = t.questions.find(q => q.id === id);
    if (!found) throw new EngineError(`Unknown question ${id}`, 'not_found');
    return found;
  }

  /** Runs a mutation, saving what it touches so the change can be reverted. */
  private change(changeId: number, actor: Actor, taskIds: string[], sessionIds: string[], focusProject: string | null, mutate: (log: (e: NewEvent) => void) => void): UserChangeRecord {
    const entry: UndoEntry = {
      tasks: taskIds.map(id => Task.parse(this.task(id))),
      sessions: sessionIds.map(id => Session.parse(this.session(id))),
      focus: focusProject === null ? null : { projectKey: focusProject, taskId: this.state.projects.find(p => p.key === focusProject)?.focusTaskId ?? null },
      eventIds: [],
    };
    mutate(e => entry.eventIds.push(this.addEvent(e, actor, null, changeId)));
    this.undo.set(changeId, entry);
    return {
      changeId, taskIds, sessionIds, projectKeys: focusProject === null ? [] : [focusProject],
      addedEventIds: entry.eventIds, removedEventIds: [], updatedEventIds: [],
    };
  }

  /**
   * A change made by a Claude session or a hook: logged with its session and saved, but not undoable from the UI.
   * The work reports what it touches through the context, so new tasks and sessions are saved too.
   */
  record<R>(sessionId: string | null, actor: Actor, work: (ctx: ChangeContext) => R): { record: ChangeRecord; result: R } {
    const record: ChangeRecord = { changeId: null, taskIds: [], sessionIds: [], projectKeys: [], addedEventIds: [], removedEventIds: [], updatedEventIds: [] };
    const add = (list: string[], id: string) => { if (!list.includes(id)) list.push(id); };
    const ctx: ChangeContext = {
      now: this.now(),
      log: e => { record.addedEventIds.push(this.addEvent(e, actor, sessionId, null)); },
      task: t => { if (!record.taskIds.includes(t.id)) this.touch(t); add(record.taskIds, t.id); },
      session: s => add(record.sessionIds, s.id),
      project: p => add(record.projectKeys, p.key),
      event: e => { if (!record.updatedEventIds.includes(e.id)) record.updatedEventIds.push(e.id); },
    };
    const result = work(ctx);
    return { record, result };
  }

  private addEvent(e: NewEvent, actor: Actor, sessionId: string | null, changeId: number | null): number {
    const id = this.nextEventId++;
    this.state.events.push({ ...e, delivery: e.delivery ? Delivery.parse(e.delivery) : null, id, at: this.now(), sessionId, actor, changeId });
    return id;
  }

  private touch(t: Task) {
    t.version += 1;
    t.updatedAt = this.now();
  }

  private delivery(t: Task, notify: boolean): z.input<typeof Delivery> {
    const sessionIds = targetSessions(buildTaskIndex(this.state.tasks), t, this.state.sessions).map(s => s.id);
    if (sessionIds.length === 0) return { state: 'none', sessionIds };
    return { state: notify ? 'pending' : 'copied', sessionIds };
  }

  /** Answers and rechecks go only to the session that asked, if it is still open. */
  private questionDelivery(sessionId: string | null, notify: boolean): z.input<typeof Delivery> {
    const open = sessionId !== null && this.state.sessions.some(s => s.id === sessionId && isSessionOpen(s));
    if (!open) return { state: 'none', sessionIds: [] };
    return { state: notify ? 'pending' : 'copied', sessionIds: [sessionId] };
  }

  private waitingOn(taskId: string): string[] {
    return this.state.sessions.filter(s => s.waiting?.kind === 'task' && s.waiting.taskId === taskId).map(s => s.id);
  }

  /** Sessions waiting on a task stop waiting once it is closed; returns them so callers can save them. */
  resolveWaiting(t: Task): Session[] {
    const released: Session[] = [];
    for (const s of this.state.sessions) {
      if (s.waiting?.kind === 'task' && s.waiting.taskId === t.id) {
        s.waiting = null;
        s.status = 'idle';
        released.push(s);
      }
    }
    return released;
  }
}

const statusEvent = (to: Task['status']): EventType => (to === 'done' ? 'done' : to === 'dropped' ? 'drop' : 'status');
