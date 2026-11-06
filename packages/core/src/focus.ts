import { isClosed, type Project, type Session, type Task } from './model.ts';
import { isSessionOpen } from './sessions.ts';
import { needsUser } from './status.ts';
import { descendants, pathTo, progress, type Progress, type TaskIndex } from './tree.ts';

export interface FocusLevel {
  task: Task;
  progress: Progress;
  /** Open children of this level, without the branch that leads to the focus */
  open: Task[];
}

export interface Blocker {
  task: Task;
  dep: Task;
}

export interface FocusView {
  focus: Task;
  path: Task[];
  subtasks: Task[];
  progress: Progress;
  /** Levels above the focus, nearest first */
  levels: FocusLevel[];
  /** Deferred tasks found while working in this tree */
  parked: Task[];
  /** Open tasks in this tree waiting for a deferred task */
  blockers: Blocker[];
  forUser: Task[];
  /** Open sessions running somewhere inside the focus subtree */
  sessions: Session[];
}

/** The user's focus in a project: where they are, what is left around it and what needs them. */
export function focusView(index: TaskIndex, project: Project, sessions: readonly Session[]): FocusView | null {
  if (project.focusTaskId === null) return null;
  const focus = index.byId.get(project.focusTaskId);
  if (!focus) return null;
  const path = pathTo(index, focus.id);
  const root = path[0]!;
  const tree = [root, ...descendants(index, root.id)];
  const inTree = new Set(tree.map(t => t.id));
  const inFocus = new Set([focus.id, ...descendants(index, focus.id).map(t => t.id)]);
  const levels = path.slice(0, -1).map((task, i) => ({
    task,
    progress: progress(index, task.id),
    open: index.children(task.id).filter(t => !isClosed(t.status) && t.id !== path[i + 1]!.id),
  })).reverse();
  const blockers = tree.flatMap(task => task.deps
    .map(id => index.byId.get(id))
    .filter((dep): dep is Task => dep !== undefined && dep.status === 'deferred' && !isClosed(task.status))
    .map(dep => ({ task, dep })));
  return {
    focus,
    path,
    subtasks: [...index.children(focus.id)],
    progress: progress(index, focus.id),
    levels,
    parked: [...index.byId.values()].filter(t => t.status === 'deferred' && t.fromId !== null && inTree.has(t.fromId)),
    blockers,
    forUser: tree.filter(needsUser),
    sessions: sessions.filter(s => isSessionOpen(s) && s.runningTaskId !== null && inFocus.has(s.runningTaskId)),
  };
}
