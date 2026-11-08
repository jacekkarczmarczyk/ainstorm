import { isClosed, TASK_STATUSES, type MapEvent, type Task, type TaskStatus } from './model.ts';

export interface ClosedEntry {
  task: Task;
  /** When it left the open tasks (the "Open" filter): its latest change from an open status to a closed one */
  closedAt: string;
}

const isStatus = (s: string | undefined): s is TaskStatus => (TASK_STATUSES as readonly string[]).includes(s ?? '');
/** The user's decision on a task of theirs closes it (a no is logged as a drop, a yes as an answer) */
const DECIDED = /^decided: /;

/**
 * Whether the event took the task out of the open tasks. Open and closed come from isClosed alone, as for the "Open"
 * filter, so a new status needs no change here: a status change "from → to" counts when from is open and to closed
 * (done → dropped does not: it was not open). The user's decision on their task closes it too.
 */
function leftOpen(e: MapEvent): boolean {
  const [from, to, ...rest] = e.text.split(' → ');
  if (isStatus(from) && isStatus(to) && rest.length === 0) return !isClosed(from) && isClosed(to);
  return DECIDED.test(e.text);
}

/** The closed tasks of a project, by when they left the open ones, the latest first. */
export function closedHistory(tasks: readonly Task[], events: readonly MapEvent[], projectKey: string): ClosedEntry[] {
  const closed = new Map<string, string>();
  for (const e of events) if (leftOpen(e)) closed.set(e.taskId, e.at);
  return tasks
    .filter(t => t.projectKey === projectKey && isClosed(t.status) && t.archivedAt === null)
    // Without such an event (closed some other way), its last change
    .map(task => ({ task, closedAt: closed.get(task.id) ?? task.updatedAt }))
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt));
}
