import type { MapSnapshot } from '@ainstorm/core';

/**
 * An import replaces whole projects: the chosen projects are cleared and filled from the file, every other project
 * and its sessions stay as they are. Event ids continue after the ones the database keeps; change ids and delivery
 * are dropped, since they belong to UI changes of another database.
 */
export interface ProjectImport {
  /** Projects to clear before writing (those of the import that already exist) */
  clear: string[];
  /** What to write after clearing */
  data: MapSnapshot;
}

export function planProjectImport(current: MapSnapshot, incoming: MapSnapshot, only?: readonly string[]): ProjectImport {
  const keys = new Set(incoming.projects.map(p => p.key).filter(k => !only?.length || only.includes(k)));
  const projects = incoming.projects.filter(p => keys.has(p.key));
  const tasks = incoming.tasks.filter(t => keys.has(t.projectKey));
  const sessions = incoming.sessions.filter(s => keys.has(s.projectKey));
  const taskIds = new Set(tasks.map(t => t.id));
  const clear = current.projects.filter(p => keys.has(p.key)).map(p => p.key);
  // Ids of events that stay (other projects) are kept; the imported ones continue after them
  const clearedTasks = new Set(current.tasks.filter(t => clear.includes(t.projectKey)).map(t => t.id));
  let nextId = Math.max(0, ...current.events.filter(e => !clearedTasks.has(e.taskId)).map(e => e.id)) + 1;
  const events = incoming.events
    .filter(e => taskIds.has(e.taskId))
    .map(e => ({ ...e, id: nextId++, changeId: null, delivery: null }));
  return { clear, data: { projects, tasks, sessions, events } };
}
