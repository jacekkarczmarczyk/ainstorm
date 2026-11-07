import { isClosed, type MapEvent, type Session, type SessionStatus, type Task } from './model.ts';
import { needsUser } from './status.ts';
import { matchesQuery } from './text.ts';
import { pathTo, type TaskIndex } from './tree.ts';

export const isSessionOpen = (s: Session) => s.archivedAt === null && s.status !== 'ended';

/** The status shown for a session: an archived one shows that instead of its last status */
export const sessionStatusKey = (s: Pick<Session, 'archivedAt' | 'status'>): SessionStatus | 'archived' => (s.archivedAt ? 'archived' : s.status);

/** Overview numbers of a project; archived sessions and tasks are left out (the index holds no archived tasks). */
export function projectStats(index: TaskIndex, sessions: readonly Session[], projectKey: string) {
  const open = sessions.filter(s => s.projectKey === projectKey && isSessionOpen(s));
  const tasks = [...index.byId.values()].filter(t => t.projectKey === projectKey);
  const closed = tasks.filter(t => isClosed(t.status)).length;
  return {
    open: open.length,
    waiting: open.filter(s => s.status === 'waiting').length,
    deferred: tasks.filter(t => t.status === 'deferred').length,
    closed, total: tasks.length, ratio: tasks.length ? closed / tasks.length : 0,
  };
}

/** Latest map change touching the session (via MCP, a hook or the UI); with no changes, the session start. */
export function lastActivityAt(session: Session, events: readonly MapEvent[]): string {
  let last = session.startedAt;
  for (const e of events) {
    const touches = e.sessionId === session.id || (e.delivery?.sessionIds.includes(session.id) ?? false);
    if (touches && e.at > last) last = e.at;
  }
  return last;
}

export interface SessionSummary {
  session: Session;
  total: number;
  closed: number;
  ratio: number;
  /** Tasks of the session waiting for the user */
  forUser: number;
  deferred: number;
  /** Top-most tasks in the tree the session worked on */
  rootIds: string[];
  lastActivityAt: string;
  /** Ended and all its tasks closed: safe to archive */
  readyToArchive: boolean;
}

export function summarizeSession(session: Session, index: TaskIndex, events: readonly MapEvent[]): SessionSummary {
  const tasks = [...index.byId.values()].filter(t => t.sessionIds.includes(session.id));
  const closed = tasks.filter(t => isClosed(t.status)).length;
  const rootIds = [...new Set(tasks.map(t => pathTo(index, t.id)[0]!.id))];
  return {
    session,
    total: tasks.length,
    closed,
    ratio: tasks.length === 0 ? 0 : closed / tasks.length,
    forUser: tasks.filter(needsUser).length,
    deferred: tasks.filter(t => t.status === 'deferred').length,
    rootIds,
    lastActivityAt: lastActivityAt(session, events),
    readyToArchive: session.status === 'ended' && session.archivedAt === null && tasks.length > 0 && closed === tasks.length,
  };
}

export type SessionSort = 'lastActivity' | 'started';

export interface SessionListOptions {
  query: string;
  sort: SessionSort;
  includeArchived: boolean;
  projectKey?: string;
}

/** Sessions for the list view: project and text filter (id, title, session tasks), newest first. */
export function listSessions(summaries: readonly SessionSummary[], index: TaskIndex, options: SessionListOptions): SessionSummary[] {
  const taskText = (sessionId: string) => [...index.byId.values()]
    .filter(t => t.sessionIds.includes(sessionId))
    .map(t => `${t.id} ${t.title}`);
  const key = (s: SessionSummary) => (options.sort === 'started' ? s.session.startedAt : s.lastActivityAt);
  return summaries
    .filter(s => options.includeArchived || s.session.archivedAt === null)
    .filter(s => options.projectKey === undefined || s.session.projectKey === options.projectKey)
    .filter(s => matchesQuery(options.query, s.session.id, s.session.title, ...taskText(s.session.id)))
    .sort((a, b) => key(b).localeCompare(key(a)) || a.session.id.localeCompare(b.session.id));
}

export interface RunMark {
  sessionId: string;
  /** true on the task being worked on right now; false on its ancestors */
  self: boolean;
  paused: boolean;
  /** The session is between turns (idle or waiting on the user): this is what it last worked on */
  idle: boolean;
  runningTaskId: string;
}

/** Work going on right now: not paused, not just the last thing an idle session worked on. */
export const isWorking = (mark: RunMark | undefined): boolean => mark !== undefined && !mark.paused && !mark.idle;

const RANK: Partial<Record<Session['status'], number>> = { active: 0, paused: 1, waiting: 2, idle: 2 };

/** Where to show work: the task a session is running and all its ancestors (idle sessions: what they last worked on). */
export function runMarks(index: TaskIndex, sessions: readonly Session[]): Map<string, RunMark> {
  const marks = new Map<string, RunMark>();
  // Active sessions win over paused ones, and both over idle ones, when sessions share a path
  const ordered = sessions
    .filter(s => isSessionOpen(s) && s.runningTaskId !== null && RANK[s.status] !== undefined)
    .sort((a, b) => RANK[a.status]! - RANK[b.status]!);
  for (const session of ordered) {
    const path = pathTo(index, session.runningTaskId!);
    path.forEach((task, i) => {
      const self = i === path.length - 1;
      const existing = marks.get(task.id);
      if (existing && (existing.self || !self)) return;
      marks.set(task.id, {
        sessionId: session.id, self, paused: session.status === 'paused',
        idle: session.status === 'idle' || session.status === 'waiting', runningTaskId: session.runningTaskId!,
      });
    });
  }
  return marks;
}

export interface QueuedRun {
  /** Open tasks sent to the same session earlier that it has not started either */
  ahead: number;
  sessionIds: string[];
}

/** A Run request from the UI: "run" for one task, "run i/n" for tasks sent together in one prompt */
const RUN_REQUEST = /^run(?: \d+\/\d+)?$/;
/** The session's own queue (session_queue): the tasks it takes up next, in order */
const SESSION_QUEUE = /^queued \d+\/\d+$/;

/**
 * Tasks the user asked a session to run that it has not started yet, in the order they were sent: one Run prompt
 * after another, or several tasks in one prompt. A request is used up once the session starts the task (it records
 * a run event of its own) or the task is closed or in progress; a reverted request has no event left.
 * Requests without a session (a command for a new one) are queued only with the tasks sent along with them.
 */
export function queuedRuns(tasks: readonly Task[], events: readonly MapEvent[], marks: ReadonlyMap<string, RunMark>): Map<string, QueuedRun> {
  const byId = new Map(tasks.map(t => [t.id, t]));
  // The latest request per task (a Run from the UI, or the session queueing it itself), unless the session started the
  // task after it
  const latest = new Map<string, MapEvent>();
  for (const e of events) {
    if (e.type !== 'run') continue;
    const request = e.actor === 'user' ? e.changeId !== null && RUN_REQUEST.test(e.text) : e.sessionId !== null && SESSION_QUEUE.test(e.text);
    if (request) latest.set(e.taskId, e);
    else if (e.actor !== 'user' && e.sessionId !== null && (latest.get(e.taskId)?.id ?? Infinity) < e.id) latest.delete(e.taskId);
  }
  const waiting = (id: string) => {
    const t = byId.get(id);
    const mark = marks.get(id);
    return t !== undefined && t.archivedAt === null && !isClosed(t.status) && t.status !== 'in_progress' && !(mark?.self && !mark.idle);
  };
  const sessionsOf = (e: MapEvent) => e.delivery?.sessionIds ?? (e.sessionId ? [e.sessionId] : []);
  const queueOf = (e: MapEvent) => sessionsOf(e)[0] ?? `change ${e.changeId}`;
  const result = new Map<string, QueuedRun>();
  for (const [taskId, e] of latest) {
    if (!waiting(taskId)) continue;
    // Event ids follow the order of sending, and within one prompt the order of its tasks
    const ahead = [...latest.values()].filter(o => queueOf(o) === queueOf(e) && o.id < e.id && waiting(o.taskId)).length;
    result.set(taskId, { ahead, sessionIds: sessionsOf(e) });
  }
  return result;
}

/** The session is a boundary: its view contains only its own tasks (parents outside it become roots). */
export function sessionTasks(tasks: readonly Task[], sessionId: string): Task[] {
  return tasks.filter(t => t.sessionIds.includes(sessionId));
}

export interface SessionHighlights {
  /** In progress, or being run by a session right now */
  working: Task[];
  /** Waiting for the user: their own open tasks and unanswered questions */
  forUser: Task[];
}

/** The tasks worth showing on a session card: what is moving and what needs the user. */
export function sessionHighlights(index: TaskIndex, marks: ReadonlyMap<string, RunMark>): SessionHighlights {
  const tasks = [...index.byId.values()];
  return {
    working: tasks.filter(t => !isClosed(t.status) && (t.status === 'in_progress' || marks.get(t.id)?.self === true)),
    forUser: tasks.filter(needsUser),
  };
}

/** Open sessions linked to the task or its ancestors: where changes made in the UI are sent. */
export function targetSessions(index: TaskIndex, task: Task, sessions: readonly Session[]): Session[] {
  const linked = new Set(pathTo(index, task.id).flatMap(t => t.sessionIds));
  return sessions.filter(s => isSessionOpen(s) && linked.has(s.id));
}
