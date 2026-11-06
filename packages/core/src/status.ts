import { isClosed, type Task, type TaskStatus } from './model.ts';
import { descendants, type TaskIndex } from './tree.ts';

// Types for which closing without a commit is suspicious (a code change is expected)
const CODE_TYPES: ReadonlySet<string> = new Set(['feat', 'fix', 'refactor', 'perf']);

export type UnusualReason = 'dropped-to-done' | 'open-subtasks' | 'open-criteria' | 'no-commits';

/**
 * Why a status change looks like a mistake, or null when it is ordinary.
 * The UI asks for confirmation; the skill tells Claude to clarify the change with the user.
 */
export function unusualTransition(index: TaskIndex, task: Task, to: TaskStatus, effectiveType: string | null): UnusualReason | null {
  if (to !== 'done' || task.status === 'done') return null;
  if (task.status === 'dropped') return 'dropped-to-done';
  if (descendants(index, task.id).some(t => !isClosed(t.status))) return 'open-subtasks';
  if (task.criteria.some(c => !c.done)) return 'open-criteria';
  const hasLiveCommit = task.commits.some(c => c.state === 'live');
  if (task.owner === 'claude' && effectiveType !== null && CODE_TYPES.has(effectiveType)
    && index.children(task.id).length === 0 && !hasLiveCommit) return 'no-commits';
  return null;
}

/** A task waiting for the user: their own open task or an unanswered question from Claude. */
export function needsUser(task: Task): boolean {
  if (task.archivedAt !== null) return false;
  if (task.owner === 'me' && !isClosed(task.status)) return true;
  return openQuestions(task).length > 0;
}

/** Dependencies the task still waits for: those not closed (a missing or deleted task does not block either). */
export function openDeps(task: Task, find: (id: string) => Task | undefined): string[] {
  return task.deps.filter(id => {
    const dep = find(id);
    return dep !== undefined && dep.archivedAt === null && !isClosed(dep.status);
  });
}

export const openQuestions =(task: Task) => task.questions.filter(q => q.answer === null && q.dismissed === null);
