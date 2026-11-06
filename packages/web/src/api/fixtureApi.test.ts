import type { MapSnapshot } from '@ainstorm/core';
import { describe, expect, it, vi } from 'vitest';
import { createFixtureApi } from './fixtureApi.ts';

// The rules live in core (MapEngine, tested there); here only the MapApi wrapper
const T0 = '2026-11-01T10:00:00.000Z';
const snapshot: MapSnapshot = {
  projects: [{ key: 'P', name: 'p', paths: [], focusTaskId: null, areas: [], repoUrl: null }],
  tasks: [{
    id: 'P-1', projectKey: 'P', title: 'one', description: '', status: 'todo', type: null, areas: [], owner: 'claude', ask: null,
    parentId: null, fromId: null, deps: [], planPath: null, planRef: null, branch: null, issue: null, pr: null, deferReason: null,
    criteria: [], decisions: [], commits: [], sessionIds: [], questions: [], archivedAt: null, createdAt: T0, updatedAt: T0, version: 1,
  }],
  sessions: [],
  events: [],
};

describe('fixture api', () => {
  it('notifies subscribers with a copy after each change and its undo', async () => {
    const api = createFixtureApi(snapshot);
    const listener = vi.fn<(s: MapSnapshot) => void>();
    const unsubscribe = api.subscribe(listener);
    const { changeId } = await api.execute({ type: 'setStatus', taskId: 'P-1', to: 'done', notify: true });
    expect(listener.mock.calls[0]![0].tasks[0]!.status).toBe('done');
    await api.revert(changeId!);
    expect(listener.mock.calls[1]![0].tasks[0]!.status).toBe('todo');
    await api.revert(changeId!);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await api.execute({ type: 'setStatus', taskId: 'P-1', to: 'done', notify: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('loads a copy, so callers cannot change its state', async () => {
    const api = createFixtureApi(snapshot);
    (await api.load()).tasks[0]!.title = 'changed';
    expect((await api.load()).tasks[0]!.title).toBe('one');
  });
});
