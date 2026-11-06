import { describe, expect, it } from 'vitest';
import { canRun } from '../src/model.ts';
import { needsUser, openDeps, openQuestions, unusualTransition } from '../src/status.ts';
import { buildTaskIndex } from '../src/tree.ts';
import { makeTask } from './factory.ts';

describe('canRun', () => {
  it('runs only open tasks of Claude that are not deferred', () => {
    expect(canRun(makeTask('P-1'))).toBe(true);
    expect(canRun(makeTask('P-1', { status: 'blocked' }))).toBe(true);
    expect(canRun(makeTask('P-1', { owner: 'me' }))).toBe(false);
    expect(canRun(makeTask('P-1', { status: 'deferred' }))).toBe(false);
    expect(canRun(makeTask('P-1', { status: 'done' }))).toBe(false);
    expect(canRun(makeTask('P-1', { status: 'dropped' }))).toBe(false);
  });
});

const commit = { sha: 'abc1234', message: 'fix', state: 'live' as const, intoSha: null, note: null };
const question = (answered: boolean) => ({
  id: 'q1', sessionId: null, text: 'Which?', options: null, multi: false, askedAt: '2026-11-01T10:00:00.000Z',
  answer: answered ? { text: 'This', at: '2026-11-01T11:00:00.000Z' } : null, dismissed: null,
});

describe('unusualTransition', () => {
  const tasks = [
    makeTask('P-1', { status: 'dropped' }),
    makeTask('P-2'),
    makeTask('P-3', { parentId: 'P-2' }),
    makeTask('P-4', { type: 'fix' }),
    makeTask('P-5', { type: 'fix', commits: [commit] }),
    makeTask('P-6', { type: 'fix', owner: 'me' }),
    makeTask('P-7', { type: 'docs' }),
    makeTask('P-8', { type: 'fix', commits: [{ ...commit, state: 'squashed' }] }),
  ];
  const index = buildTaskIndex(tasks);
  const get = (id: string) => index.byId.get(id)!;

  it('flags dropped → done', () => {
    expect(unusualTransition(index, get('P-1'), 'done', null)).toBe('dropped-to-done');
  });

  it('flags done with open subtasks', () => {
    expect(unusualTransition(index, get('P-2'), 'done', null)).toBe('open-subtasks');
  });

  it('flags a code task closed without a live commit', () => {
    expect(unusualTransition(index, get('P-4'), 'done', 'fix')).toBe('no-commits');
    expect(unusualTransition(index, get('P-8'), 'done', 'fix')).toBe('no-commits');
  });

  it('accepts ordinary changes', () => {
    expect(unusualTransition(index, get('P-5'), 'done', 'fix')).toBeNull();
    expect(unusualTransition(index, get('P-6'), 'done', 'fix')).toBeNull();
    expect(unusualTransition(index, get('P-7'), 'done', 'docs')).toBeNull();
    expect(unusualTransition(index, get('P-1'), 'todo', null)).toBeNull();
    expect(unusualTransition(index, get('P-3'), 'done', null)).toBeNull();
  });
});

describe('unusual transition: unticked criteria', () => {
  it('warns when a task with unticked criteria is marked done', () => {
    const task = makeTask('P-1', { criteria: [{ text: 'tests', done: true }, { text: 'lint', done: false }] });
    expect(unusualTransition(buildTaskIndex([task]), task, 'done', null)).toBe('open-criteria');
    const ticked = { ...task, criteria: task.criteria.map(c => ({ ...c, done: true })) };
    expect(unusualTransition(buildTaskIndex([ticked]), ticked, 'done', null)).toBeNull();
  });
});

describe('openDeps', () => {
  it('keeps only dependencies that are still open', () => {
    const tasks = new Map([
      ['P-2', makeTask('P-2', { status: 'done' })],
      ['P-3', makeTask('P-3')],
      ['P-4', makeTask('P-4', { archivedAt: '2026-11-02T00:00:00.000Z' })],
    ]);
    expect(openDeps(makeTask('P-1', { deps: ['P-2', 'P-3', 'P-4', 'P-9'] }), id => tasks.get(id))).toEqual(['P-3']);
  });
});

describe('needsUser', () => {
  it('is true for the user’s open tasks and unanswered questions', () => {
    expect(needsUser(makeTask('P-1', { owner: 'me' }))).toBe(true);
    expect(needsUser(makeTask('P-1', { owner: 'me', status: 'done' }))).toBe(false);
    expect(needsUser(makeTask('P-1', { questions: [question(false)] }))).toBe(true);
    expect(needsUser(makeTask('P-1', { questions: [question(true)] }))).toBe(false);
    expect(needsUser(makeTask('P-1', { owner: 'me', archivedAt: '2026-11-02T00:00:00.000Z' }))).toBe(false);
  });

  it('lists open questions only', () => {
    expect(openQuestions(makeTask('P-1', { questions: [question(true), question(false)] }))).toHaveLength(1);
  });

  it('does not count a question Claude dismissed', () => {
    const dismissed = { ...question(false), dismissed: { at: '2026-11-01T12:00:00.000Z', reason: 'done meanwhile' } };
    expect(needsUser(makeTask('P-1', { questions: [dismissed] }))).toBe(false);
  });
});
