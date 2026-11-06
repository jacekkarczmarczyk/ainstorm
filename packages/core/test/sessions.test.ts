import { describe, expect, it } from 'vitest';
import {
  isSessionOpen, isWorking, lastActivityAt, listSessions, projectStats, queuedRuns, runMarks, sessionHighlights, sessionStatusKey, sessionTasks,
  summarizeSession, targetSessions,
} from '../src/sessions.ts';
import { buildTaskIndex } from '../src/tree.ts';
import { makeEvent, makeSession, makeTask } from './factory.ts';

const s1 = makeSession({ title: 'Cart and payments rework', startedAt: '2026-10-22T03:10:00.000Z', status: 'active', runningTaskId: 'P-3' });
const s2 = makeSession({ title: 'Invoice import', startedAt: '2026-11-03T04:05:00.000Z', status: 'ended' });
const s3 = makeSession({ title: 'Stara', startedAt: '2026-10-01T00:00:00.000Z', status: 'ended', archivedAt: '2026-10-02T00:00:00.000Z' });
const s4 = makeSession({ status: 'paused', runningTaskId: 'P-2' });

const tasks = [
  makeTask('P-1', { sessionIds: [s1.id] }),
  makeTask('P-2', { parentId: 'P-1', sessionIds: [s1.id], status: 'done' }),
  makeTask('P-3', { parentId: 'P-1', sessionIds: [s1.id], title: 'Imported invoices' }),
  makeTask('P-4', { parentId: 'P-3', owner: 'me', sessionIds: [s1.id] }),
  makeTask('P-5', { status: 'deferred', sessionIds: [s1.id] }),
  makeTask('K-1', { status: 'done', sessionIds: [s2.id] }),
];
const index = buildTaskIndex(tasks);

describe('lastActivityAt', () => {
  it('uses events of the session and deliveries to it', () => {
    const events = [
      makeEvent(1, { sessionId: s1.id, at: '2026-11-05T10:00:00.000Z' }),
      makeEvent(2, { sessionId: null, at: '2026-11-06T09:00:00.000Z', delivery: { state: 'pending', sessionIds: [s1.id], deliveredTo: [] } }),
      makeEvent(3, { sessionId: s2.id, at: '2026-11-07T09:00:00.000Z' }),
    ];
    expect(lastActivityAt(s1, events)).toBe('2026-11-06T09:00:00.000Z');
    expect(lastActivityAt(s3, events)).toBe(s3.startedAt);
  });
});

describe('summarizeSession', () => {
  it('summarises tasks of the session', () => {
    const summary = summarizeSession(s1, index, []);
    expect(summary).toMatchObject({ total: 5, closed: 1, forUser: 1, deferred: 1, rootIds: ['P-1', 'P-5'], readyToArchive: false });
    expect(summary.ratio).toBeCloseTo(0.2);
  });

  it('marks an ended session with all tasks closed as ready to archive', () => {
    expect(summarizeSession(s2, index, []).readyToArchive).toBe(true);
    expect(summarizeSession(makeSession({ status: 'ended' }), index, []).readyToArchive).toBe(false);
  });
});

describe('listSessions', () => {
  const summaries = [s1, s2, s3].map(s => summarizeSession(s, index, []));
  const options = { query: '', sort: 'started' as const, includeArchived: false };

  it('sorts newest first and hides archived by default', () => {
    expect(listSessions(summaries, index, options).map(s => s.session.title)).toEqual(['Invoice import', 'Cart and payments rework']);
    expect(listSessions(summaries, index, { ...options, includeArchived: true })).toHaveLength(3);
  });

  it('searches title, id and task titles', () => {
    expect(listSessions(summaries, index, { ...options, query: 'invoices' }).map(s => s.session.title)).toEqual(['Cart and payments rework']);
    expect(listSessions(summaries, index, { ...options, query: s2.id.slice(-12) }).map(s => s.session.title)).toEqual(['Invoice import']);
  });

  it('filters by project', () => {
    expect(listSessions(summaries, index, { ...options, projectKey: 'NONE' })).toEqual([]);
  });
});

describe('runMarks', () => {
  it('marks the running task and its ancestors, active over paused', () => {
    const marks = runMarks(index, [s4, s1]);
    expect(marks.get('P-3')).toMatchObject({ sessionId: s1.id, self: true, paused: false });
    expect(marks.get('P-1')).toMatchObject({ sessionId: s1.id, self: false });
    expect(marks.get('P-2')).toMatchObject({ sessionId: s4.id, self: true, paused: true });
    expect(marks.has('P-4')).toBe(false);
  });

  it('ignores closed sessions', () => {
    expect(runMarks(index, [{ ...s1, status: 'ended' }]).size).toBe(0);
  });

  it('marks what an idle or waiting session last worked on, below active work', () => {
    const idle = { ...s1, status: 'idle' as const };
    expect(runMarks(index, [idle]).get('P-3')).toMatchObject({ self: true, idle: true, paused: false });
    expect(isWorking(runMarks(index, [idle]).get('P-3'))).toBe(false);
    expect(isWorking(runMarks(index, [s1]).get('P-3'))).toBe(true);
    expect(runMarks(index, [{ ...idle, id: 'other' }, s1]).get('P-3')).toMatchObject({ sessionId: s1.id, idle: false });
  });
});

describe('queuedRuns', () => {
  const run = (id: number, taskId: string, text: string, changeId = 2000) =>
    makeEvent(id, { taskId, type: 'run', text, changeId, actor: 'user', delivery: { state: 'copied', sessionIds: [s1.id], deliveredTo: [] } });
  const todo = (id: string, status: 'todo' | 'done' | 'in_progress' = 'todo') => makeTask(id, { status });

  it('counts the open tasks ahead in the same sent queue', () => {
    const tasks = [todo('A'), todo('B', 'done'), todo('C'), todo('D')];
    const events = [run(1, 'A', 'run 1/4'), run(2, 'B', 'run 2/4'), run(3, 'C', 'run 3/4'), run(4, 'D', 'run 4/4')];
    const q = queuedRuns(tasks, events, new Map());
    expect([...q].map(([id, x]) => [id, x.ahead])).toEqual([['A', 0], ['C', 1], ['D', 2]]);
    expect(q.get('A')!.sessionIds).toEqual([s1.id]);
  });

  it('drops tasks the session started or works on, and uses only the latest queue of a task', () => {
    const tasks = [todo('A', 'in_progress'), todo('B'), todo('C')];
    const events = [run(1, 'A', 'run 1/3'), run(2, 'B', 'run 2/3'), run(3, 'C', 'run 3/3'), run(4, 'C', 'run 1/1', 2001)];
    const working = new Map([['B', { sessionId: s1.id, self: true, paused: false, idle: false, runningTaskId: 'B' }]]);
    const q = queuedRuns(tasks, events, working);
    expect([...q].map(([id, x]) => [id, x.ahead])).toEqual([['C', 0]]);
    // A single Run (not a queue) is not shown as queued
    expect(queuedRuns([todo('X')], [makeEvent(9, { taskId: 'X', type: 'run', text: 'run', changeId: 2002 })], new Map()).size).toBe(0);
  });
});

describe('sessionTasks and sessionHighlights', () => {
  it('keeps only the session’s tasks and picks what is moving and what needs the user', () => {
    const own = sessionTasks(tasks, s1.id);
    expect(own.map(t => t.id)).toEqual(['P-1', 'P-2', 'P-3', 'P-4', 'P-5']);
    const scoped = buildTaskIndex(own);
    const highlights = sessionHighlights(scoped, runMarks(scoped, [s1]));
    expect(highlights.working.map(t => t.id)).toEqual(['P-3']);
    expect(highlights.forUser.map(t => t.id)).toEqual(['P-4']);
  });

  it('turns parents from outside the session into roots', () => {
    const own = sessionTasks([...tasks, makeTask('P-9', { parentId: 'P-1', sessionIds: [s2.id] })], s2.id);
    expect(buildTaskIndex(own).roots().map(t => t.id)).toEqual(['K-1', 'P-9']);
  });
});

describe('targetSessions', () => {
  it('finds open sessions linked to the task or its ancestors', () => {
    const child = makeTask('P-9', { parentId: 'P-1' });
    const withChild = buildTaskIndex([...tasks, child]);
    expect(targetSessions(withChild, child, [s1, s2, s3]).map(s => s.id)).toEqual([s1.id]);
    expect(isSessionOpen(s2)).toBe(false);
  });
});

describe('sessionStatusKey', () => {
  it('shows archived sessions as archived, others by their status', () => {
    expect([s1, s2, s3, s4].map(sessionStatusKey)).toEqual(['active', 'ended', 'archived', 'paused']);
  });
});

describe('projectStats', () => {
  it('counts open and waiting sessions and the tasks of the project', () => {
    const sessions = [
      makeSession({ projectKey: 'P', status: 'waiting' }),
      makeSession({ projectKey: 'P', status: 'active' }),
      makeSession({ projectKey: 'P', status: 'ended' }),
      makeSession({ projectKey: 'P', status: 'waiting', archivedAt: '2026-11-02T00:00:00.000Z' }),
      makeSession({ projectKey: 'K', status: 'waiting' }),
    ];
    const stats = projectStats(index, sessions, 'P');
    expect(stats).toMatchObject({ open: 2, waiting: 1, deferred: 1, closed: 1, total: 5 });
    expect(stats.ratio).toBeCloseTo(0.2);
    expect(projectStats(index, [], 'X')).toMatchObject({ open: 0, total: 0, ratio: 0 });
  });
});
