import { isClosed, type Task } from './model.ts';

/** Task tree index (archived tasks excluded): fast lookup by id and by parent. */
export interface TaskIndex {
  readonly byId: ReadonlyMap<string, Task>;
  children(id: string): readonly Task[];
  roots(projectKey?: string): readonly Task[];
}

const NO_CHILDREN: readonly Task[] = [];

export function buildTaskIndex(tasks: readonly Task[]): TaskIndex {
  const byId = new Map<string, Task>();
  const childMap = new Map<string, Task[]>();
  const rootList: Task[] = [];
  for (const task of tasks) {
    if (task.archivedAt === null) byId.set(task.id, task);
  }
  for (const task of byId.values()) {
    // A task whose parent is outside the index (archived or missing) becomes a root, so it never disappears
    if (task.parentId !== null && byId.has(task.parentId)) {
      const list = childMap.get(task.parentId);
      if (list) list.push(task);
      else childMap.set(task.parentId, [task]);
    } else {
      rootList.push(task);
    }
  }
  return {
    byId,
    children: id => childMap.get(id) ?? NO_CHILDREN,
    roots: projectKey => (projectKey === undefined ? rootList : rootList.filter(t => t.projectKey === projectKey)),
  };
}

/** Path from the root to the task (inclusive). Safe against cycles in corrupted data. */
export function pathTo(index: TaskIndex, id: string): Task[] {
  const path: Task[] = [];
  const seen = new Set<string>();
  let current = index.byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId === null ? undefined : index.byId.get(current.parentId);
  }
  return path;
}

/**
 * 1-based position of the task in the outline of its project, e.g. [1, 3, 2] for the second subtask
 * of the third subtask of the first top-level task. Display only: it changes when tasks move.
 */
export function outlinePosition(index: TaskIndex, id: string): number[] {
  return pathTo(index, id).map((task, i, path) => {
    const siblings = i === 0 ? index.roots(task.projectKey) : index.children(path[i - 1]!.id);
    return siblings.indexOf(task) + 1;
  });
}

/** All descendants in depth-first order. */
export function descendants(index: TaskIndex, id: string): Task[] {
  const result: Task[] = [];
  const stack = [...index.children(id)].reverse();
  const seen = new Set<string>([id]);
  while (stack.length) {
    const task = stack.pop()!;
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    result.push(task);
    stack.push(...[...index.children(task.id)].reverse());
  }
  return result;
}

export interface Progress {
  closed: number;
  total: number;
  /** 0–1; 0 for a task without subtasks */
  ratio: number;
}

export function progress(index: TaskIndex, id: string): Progress {
  const all = descendants(index, id);
  const closed = all.filter(t => isClosed(t.status)).length;
  return { closed, total: all.length, ratio: all.length === 0 ? 0 : closed / all.length };
}

type InheritableKey = 'type' | 'branch' | 'planPath';

export interface Inherited<T> {
  value: T;
  /** Id of the ancestor the value comes from; null when it is set on the task itself */
  fromId: string | null;
}

/** Field value from the task or from the nearest ancestor that has it. */
export function inherited<K extends InheritableKey>(index: TaskIndex, id: string, key: K): Inherited<NonNullable<Task[K]>> | null {
  const path = pathTo(index, id);
  for (let i = path.length - 1; i >= 0; i--) {
    const task = path[i]!;
    const value = task[key];
    if (value !== null) return { value: value as NonNullable<Task[K]>, fromId: task.id === id ? null : task.id };
  }
  return null;
}

/** The task's areas including inherited ones; each area once, with where it comes from. */
export function effectiveAreas(index: TaskIndex, id: string): Inherited<string>[] {
  const result: Inherited<string>[] = [];
  for (const task of pathTo(index, id)) {
    for (const area of task.areas) {
      if (!result.some(a => a.value === area)) result.push({ value: area, fromId: task.id === id ? null : task.id });
    }
  }
  return result;
}

/** Whether making newParentId the parent of taskId creates a cycle (including moving under its own descendant). */
export function wouldCreateParentCycle(index: TaskIndex, taskId: string, newParentId: string | null): boolean {
  if (newParentId === null) return false;
  if (newParentId === taskId) return true;
  return pathTo(index, newParentId).some(t => t.id === taskId);
}

/** Tasks that may become the new parent of taskId: everything except itself and its descendants. */
export function possibleParents(index: TaskIndex, taskId: string): Task[] {
  const excluded = new Set([taskId, ...descendants(index, taskId).map(t => t.id)]);
  return [...index.byId.values()].filter(t => !excluded.has(t.id));
}

/** Whether adding the dependency taskId → depId creates a cycle in the dependency graph. */
export function wouldCreateDepCycle(index: TaskIndex, taskId: string, depId: string): boolean {
  if (taskId === depId) return true;
  const stack = [depId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(index.byId.get(id)?.deps ?? []));
  }
  return false;
}
