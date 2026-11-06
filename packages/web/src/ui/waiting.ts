import type { Session, Task } from '@ainstorm/core';

/**
 * What a waiting session needs from the user: a decision, an action of theirs, approval of a prepared plan,
 * or an answer to a permission prompt in the terminal.
 */
export type WaitingKind = 'decision' | 'action' | 'start' | 'permission';

export interface WaitingInfo {
  kind: WaitingKind;
  since: string;
  task: Task | null;
  /** Tool and detail of a terminal permission prompt */
  tool: string | null;
  detail: string | null;
}

export function waitingKind(task: Task): Exclude<WaitingKind, 'permission'> {
  if (task.owner === 'claude') return 'start';
  return task.ask === 'action' ? 'action' : 'decision';
}

/** Describe why the session waits; null when it does not wait or its task is gone. */
export function describeWaiting(session: Session, findTask: (id: string) => Task | undefined): WaitingInfo | null {
  const waiting = session.status === 'waiting' ? session.waiting : null;
  if (!waiting) return null;
  if (waiting.kind === 'permission') return { kind: 'permission', since: waiting.since, task: null, tool: waiting.tool, detail: waiting.detail };
  const task = findTask(waiting.taskId);
  return task ? { kind: waitingKind(task), since: waiting.since, task, tool: null, detail: null } : null;
}
