import { z } from 'zod';
import { GITHUB_REPO } from './github.ts';

// Schemas are the single source of the data shape: input validation (API, MCP) and TS types both come from here.

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'deferred', 'done', 'dropped'] as const;
export const TaskStatus = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatus>;

// Conventional Commits plus security and idea
export const TASK_TYPES = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'ci', 'build', 'security', 'idea'] as const;
export const TaskType = z.enum(TASK_TYPES);
export type TaskType = z.infer<typeof TaskType>;

export const Owner = z.enum(['claude', 'me']);
export type Owner = z.infer<typeof Owner>;

/**
 * What the owner of a task is asked for. A user's task: an action or a decision. A Claude task with "proposal":
 * Claude first presents an opinion and options; asking that question makes it the user's decision.
 */
export const Ask = z.enum(['action', 'decision', 'proposal']);
export type Ask = z.infer<typeof Ask>;

export const COMMIT_STATES = ['live', 'squashed', 'amended', 'rebased', 'removed'] as const;
export const CommitState = z.enum(COMMIT_STATES);
export type CommitState = z.infer<typeof CommitState>;

export const SESSION_STATUSES = ['waiting', 'active', 'paused', 'idle', 'ended'] as const;
export const SessionStatus = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const EVENT_TYPES = [
  'session', 'plan', 'create', 'done', 'defer', 'block', 'focus', 'status', 'promote',
  'commit', 'archive', 'restore', 'drop', 'wait', 'run', 'pause', 'answer', 'recheck', 'edit', 'issue',
] as const;
export const EventType = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventType>;

export const Actor = z.enum(['claude', 'user', 'hook']);
export type Actor = z.infer<typeof Actor>;

export const DELIVERY_STATES = ['pending', 'delivered', 'copied', 'none'] as const;
export const DeliveryState = z.enum(DELIVERY_STATES);
export type DeliveryState = z.infer<typeof DeliveryState>;

const IsoTime = z.iso.datetime({ offset: true });
const Sha = z.string().regex(/^[0-9a-f]{7,40}$/);
export const TaskId = z.string().regex(/^[A-Z][A-Z0-9]{0,9}-\d+$/);
export const ProjectKey = z.string().regex(/^[A-Z][A-Z0-9]{0,9}$/);
export const SessionId = z.uuid();

export const Commit = z.object({
  sha: Sha,
  message: z.string().max(500),
  state: CommitState,
  intoSha: Sha.nullable(),
  note: z.string().max(500).nullable(),
});
export type Commit = z.infer<typeof Commit>;

export const Criterion = z.object({ text: z.string().min(1).max(500), done: z.boolean() });
export type Criterion = z.infer<typeof Criterion>;

export const Decision = z.object({ at: IsoTime, summary: z.string().min(1).max(200), detail: z.string().max(5000) });
export type Decision = z.infer<typeof Decision>;

export const DeferReason = z.object({ summary: z.string().min(1).max(200), detail: z.string().max(5000) });
export type DeferReason = z.infer<typeof DeferReason>;

export const Answer = z.object({ text: z.string().min(1).max(5000), at: IsoTime });
export type Answer = z.infer<typeof Answer>;

export const Question = z.object({
  id: z.string().min(1),
  sessionId: SessionId.nullable(),
  text: z.string().min(1).max(5000),
  options: z.array(z.string().min(1).max(300)).max(20).nullable(),
  multi: z.boolean(),
  askedAt: IsoTime,
  answer: Answer.nullable(),
  /** Closed by Claude without an answer, e.g. no longer relevant after "Still relevant?" */
  dismissed: z.object({ at: IsoTime, reason: z.string().min(1).max(1000) }).nullable().default(null),
});
export type Question = z.infer<typeof Question>;

export const Task = z.object({
  id: TaskId,
  projectKey: ProjectKey,
  title: z.string().min(1).max(200),
  description: z.string().max(20000),
  status: TaskStatus,
  type: TaskType.nullable(),
  areas: z.array(z.string().min(1).max(60)),
  owner: Owner,
  ask: Ask.nullable(),
  parentId: TaskId.nullable(),
  fromId: TaskId.nullable(),
  deps: z.array(TaskId),
  planPath: z.string().max(1000).nullable(),
  planRef: z.string().max(200).nullable(),
  branch: z.string().max(200).nullable(),
  issue: z.string().max(100).nullable(),
  pr: z.string().max(100).nullable(),
  deferReason: DeferReason.nullable(),
  criteria: z.array(Criterion),
  decisions: z.array(Decision),
  commits: z.array(Commit),
  sessionIds: z.array(SessionId),
  questions: z.array(Question),
  archivedAt: IsoTime.nullable(),
  createdAt: IsoTime,
  updatedAt: IsoTime,
  version: z.number().int().nonnegative(),
});
export type Task = z.infer<typeof Task>;

/**
 * Why a session has stopped and needs the user: a task of theirs (decision, action or approval to start),
 * or a permission prompt in the terminal (detected by a hook; answered in the terminal, not in the UI).
 */
export const Waiting = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), taskId: TaskId, since: IsoTime }),
  z.object({ kind: z.literal('permission'), since: IsoTime, tool: z.string().min(1).max(200), detail: z.string().max(500) }),
]);
export type Waiting = z.infer<typeof Waiting>;

export const Session = z.object({
  id: SessionId,
  projectKey: ProjectKey,
  title: z.string().min(1).max(200),
  status: SessionStatus,
  startedAt: IsoTime,
  archivedAt: IsoTime.nullable(),
  runningTaskId: TaskId.nullable(),
  waiting: Waiting.nullable(),
  note: z.string().max(1000).nullable(),
  compactions: z.number().int().nonnegative(),
});
export type Session = z.infer<typeof Session>;

export const Project = z.object({
  key: ProjectKey,
  name: z.string().min(1).max(100),
  paths: z.array(z.string().min(1)),
  focusTaskId: TaskId.nullable(),
  /** Areas registered with area_create; areas already used by tasks of the project count as known too */
  areas: z.array(z.string().min(1).max(60)).default([]),
  /** GitHub repository of the project: #1234 and the Issue field of tasks link to its issues */
  repoUrl: z.string().regex(GITHUB_REPO).nullable().default(null),
});
export type Project = z.infer<typeof Project>;

/**
 * Where a change from the UI goes: the target sessions, and those that already received it.
 * The state is 'delivered' once every target session has it.
 */
export const Delivery = z.object({
  state: DeliveryState,
  sessionIds: z.array(SessionId),
  deliveredTo: z.array(SessionId).default([]),
});
export type Delivery = z.infer<typeof Delivery>;

export const MapEvent = z.object({
  id: z.number().int().positive(),
  at: IsoTime,
  sessionId: SessionId.nullable(),
  taskId: TaskId,
  type: EventType,
  text: z.string().max(2000),
  actor: Actor,
  changeId: z.number().int().positive().nullable(),
  delivery: Delivery.nullable(),
});
export type MapEvent = z.infer<typeof MapEvent>;

/** The whole map in memory: what the UI gets from the API and computes its views from. */
export const MapSnapshot = z.object({
  projects: z.array(Project),
  tasks: z.array(Task),
  sessions: z.array(Session),
  events: z.array(MapEvent),
});
export type MapSnapshot = z.infer<typeof MapSnapshot>;

export const isClosed = (status: TaskStatus): boolean => status === 'done' || status === 'dropped';

/** Run applies to Claude's open tasks only: not the user's, closed or deferred ones */
export const canRun = (task: Pick<Task, 'owner' | 'status'>): boolean => task.owner === 'claude' && !isClosed(task.status) && task.status !== 'deferred';
