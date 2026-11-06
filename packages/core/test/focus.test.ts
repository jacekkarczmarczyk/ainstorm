import { describe, expect, it } from 'vitest';
import { focusView } from '../src/focus.ts';
import { matchesQuery, normalizeText, shortId } from '../src/text.ts';
import { buildTaskIndex } from '../src/tree.ts';
import { makeProject, makeSession, makeTask } from './factory.ts';

const tasks = [
  makeTask('P-1'),
  makeTask('P-2', { parentId: 'P-1', status: 'done' }),
  makeTask('P-3', { parentId: 'P-1' }),
  makeTask('P-4', { parentId: 'P-3', deps: ['P-9'] }),
  makeTask('P-5', { parentId: 'P-3', owner: 'me' }),
  makeTask('P-6', { parentId: 'P-1' }),
  makeTask('P-9', { status: 'deferred', fromId: 'P-4' }),
  makeTask('P-10', { status: 'deferred', fromId: 'X-1' }),
];
const index = buildTaskIndex(tasks);

describe('focusView', () => {
  it('returns null without a focus or with a missing one', () => {
    expect(focusView(index, makeProject(), [])).toBeNull();
    expect(focusView(index, makeProject({ focusTaskId: 'P-404' }), [])).toBeNull();
  });

  it('describes the focus and what is around it', () => {
    const running = makeSession({ status: 'active', runningTaskId: 'P-4' });
    const elsewhere = makeSession({ status: 'active', runningTaskId: 'P-6' });
    const view = focusView(index, makeProject({ focusTaskId: 'P-3' }), [running, elsewhere])!;
    expect(view.path.map(t => t.id)).toEqual(['P-1', 'P-3']);
    expect(view.subtasks.map(t => t.id)).toEqual(['P-4', 'P-5']);
    expect(view.progress).toEqual({ closed: 0, total: 2, ratio: 0 });
    expect(view.levels.map(l => [l.task.id, l.open.map(t => t.id)])).toEqual([['P-1', ['P-6']]]);
    expect(view.parked.map(t => t.id)).toEqual(['P-9']);
    expect(view.blockers.map(b => `${b.task.id}>${b.dep.id}`)).toEqual(['P-4>P-9']);
    expect(view.forUser.map(t => t.id)).toEqual(['P-5']);
    expect(view.sessions.map(s => s.id)).toEqual([running.id]);
  });
});

describe('text', () => {
  it('normalises Polish characters', () => {
    expect(normalizeText('Zażółć GĘŚLĄ jaźń, Łódź')).toBe('zazolc gesla jazn, lodz');
  });

  it('matches all words in any order', () => {
    expect(matchesQuery('lodz faktura', 'Faktura', 'Łódź')).toBe(true);
    expect(matchesQuery('', 'anything')).toBe(true);
    expect(matchesQuery('missing', 'Faktura')).toBe(false);
  });

  it('shortens session ids', () => {
    expect(shortId('abcd1234-5678-4abc-8def-0123456789ab')).toBe('abcd1234');
  });
});
