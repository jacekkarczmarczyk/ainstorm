import type { MapEvent, Project, Session, Task } from '../src/model.ts';

const T0 = '2026-11-01T10:00:00.000Z';

export function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    projectKey: id.split('-')[0]!,
    title: `Task ${id}`,
    description: '',
    status: 'todo',
    type: null,
    areas: [],
    owner: 'claude',
    ask: null,
    parentId: null,
    fromId: null,
    deps: [],
    planPath: null,
    planRef: null,
    branch: null,
    issue: null,
    pr: null,
    deferReason: null,
    criteria: [],
    decisions: [],
    commits: [],
    sessionIds: [],
    questions: [],
    archivedAt: null,
    createdAt: T0,
    updatedAt: T0,
    version: 1,
    ...overrides,
  };
}

let sessionSeq = 0;
export function makeSession(overrides: Partial<Session> = {}): Session {
  sessionSeq++;
  return {
    id: `00000000-0000-4000-8000-${String(sessionSeq).padStart(12, '0')}`,
    projectKey: 'PRJ',
    title: `Session ${sessionSeq}`,
    status: 'idle',
    startedAt: T0,
    archivedAt: null,
    runningTaskId: null,
    waiting: null,
    note: null,
    compactions: 0,
    continuedFrom: null,
    claudeTitle: null,
    ...overrides,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return { key: 'PRJ', name: 'shop', paths: [], focusTaskId: null, areas: [], repoUrl: null, ...overrides };
}

export function makeEvent(id: number, overrides: Partial<MapEvent> = {}): MapEvent {
  return {
    id,
    at: T0,
    sessionId: null,
    taskId: 'PRJ-1',
    type: 'status',
    text: '',
    actor: 'claude',
    changeId: null,
    delivery: null,
    ...overrides,
  };
}
