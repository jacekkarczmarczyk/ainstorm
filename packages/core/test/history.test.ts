import { describe, expect, it } from 'vitest';
import { closedHistory } from '../src/history.ts';
import { makeEvent, makeTask } from './factory.ts';

describe('closed history', () => {
  it('lists the closed tasks of the project by when they left the open ones, latest first', () => {
    const tasks = [
      makeTask('PRJ-1', { status: 'done' }),
      makeTask('PRJ-2', { status: 'dropped' }),
      makeTask('PRJ-3', { status: 'done', updatedAt: '2026-11-03T09:00:00.000Z' }), // no event says when
      makeTask('PRJ-4', { status: 'dropped' }),
      makeTask('PRJ-5', { status: 'todo' }),
      makeTask('PRJ-6', { status: 'done', archivedAt: '2026-11-04T00:00:00.000Z' }),
      makeTask('PP-1', { status: 'done' }),
    ];
    const events = [
      makeEvent(1, { taskId: 'PRJ-1', type: 'done', text: 'todo → done', at: '2026-11-02T10:00:00.000Z' }),
      // Reopened and done again: the latest closing counts
      makeEvent(2, { taskId: 'PRJ-1', type: 'status', text: 'done → todo', at: '2026-11-02T11:00:00.000Z' }),
      makeEvent(3, { taskId: 'PRJ-1', type: 'done', text: 'in_progress → done', at: '2026-11-02T12:00:00.000Z' }),
      makeEvent(4, { taskId: 'PRJ-2', type: 'drop', text: 'blocked → dropped', at: '2026-11-01T10:00:00.000Z' }),
      // Done → dropped: it was not open before, so it does not move
      makeEvent(5, { taskId: 'PRJ-2', type: 'drop', text: 'done → dropped', at: '2026-11-05T10:00:00.000Z' }),
      // The user's decision of no; an answer to a question is no status change
      makeEvent(6, { taskId: 'PRJ-4', type: 'drop', text: 'decided: no — not now', at: '2026-11-02T08:00:00.000Z' }),
      makeEvent(7, { taskId: 'PRJ-3', type: 'answer', text: 'Which one? → done', at: '2026-11-06T08:00:00.000Z' }),
    ];
    expect(closedHistory(tasks, events, 'PRJ').map(e => [e.task.id, e.closedAt])).toEqual([
      ['PRJ-3', '2026-11-03T09:00:00.000Z'],
      ['PRJ-1', '2026-11-02T12:00:00.000Z'],
      ['PRJ-4', '2026-11-02T08:00:00.000Z'],
      ['PRJ-2', '2026-11-01T10:00:00.000Z'],
    ]);
  });
});
