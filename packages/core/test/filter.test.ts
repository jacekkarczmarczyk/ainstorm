import { describe, expect, it } from 'vitest';
import {
  cycleRule, EMPTY_FILTER, facetCounts, facetValues, filterFromQuery, filterToQuery, isFilterActive, isQuickFilterOn, nextOwner,
  matchRuleSet, taskMatches, toggleQuickFilter, treeRows, type TaskFilter,
} from '../src/filter.ts';
import { buildTaskIndex } from '../src/tree.ts';
import { makeTask } from './factory.ts';

const tasks = [
  makeTask('P-1', { type: 'build', areas: ['php'], title: 'Cart and payments rework' }),
  makeTask('P-2', { parentId: 'P-1', status: 'done', title: 'Spike' }),
  makeTask('P-3', { parentId: 'P-1', type: 'fix', areas: ['mail'], title: 'Zamieniony temat maili', description: 'PricingExpired' }),
  makeTask('P-4', { parentId: 'P-3', status: 'dropped', owner: 'me', ask: 'decision' }),
  makeTask('P-5', { status: 'done' }),
  makeTask('P-6', { parentId: 'P-5', status: 'done' }),
];
const index = buildTaskIndex(tasks);
const facets = facetValues(index);
const get = (id: string) => index.byId.get(id)!;
const filter = (patch: Partial<TaskFilter>): TaskFilter => ({ ...EMPTY_FILTER, ...patch });

describe('rules', () => {
  it('cycles off → show → hide → off without mutating input', () => {
    const empty = {};
    const show = cycleRule(empty, 'fix');
    const hide = cycleRule(show, 'fix');
    expect(show).toEqual({ fix: 1 });
    expect(hide).toEqual({ fix: -1 });
    expect(cycleRule(hide, 'fix')).toEqual({});
    expect(empty).toEqual({});
  });

  it('includes any of the shown values and excludes hidden ones', () => {
    expect(matchRuleSet({}, ['a'])).toBe(true);
    expect(matchRuleSet({ a: 1, b: 1 }, ['b'])).toBe(true);
    expect(matchRuleSet({ a: 1 }, ['b'])).toBe(false);
    expect(matchRuleSet({ a: -1 }, ['a', 'b'])).toBe(false);
    expect(matchRuleSet({ a: -1 }, [])).toBe(true);
    expect(matchRuleSet({ a: 1, b: -1 }, ['a', 'b'])).toBe(false);
  });

  it('knows when a filter is active', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive(filter({ text: '  ' }))).toBe(false);
    expect(isFilterActive(filter({ text: 'x' }))).toBe(true);
    expect(isFilterActive(filter({ owner: 'claude' }))).toBe(true);
    expect(isFilterActive(filter({ area: { php: -1 } }))).toBe(true);
  });
});

describe('taskMatches', () => {
  it('uses inherited type and areas', () => {
    expect(facets.valuesOf(get('P-4'), 'type')).toEqual(['fix']);
    expect(facets.valuesOf(get('P-4'), 'area')).toEqual(['php', 'mail']);
    expect(facets.valuesOf(get('P-5'), 'type')).toEqual([]);
    expect(taskMatches(get('P-2'), filter({ type: { build: 1 } }), facets)).toBe(true);
  });

  it('hides excluded statuses', () => {
    const f = filter({ status: { dropped: -1, done: -1 } });
    expect(taskMatches(get('P-4'), f, facets)).toBe(false);
    expect(taskMatches(get('P-3'), f, facets)).toBe(true);
  });

  it('searches id, title and description without diacritics', () => {
    expect(taskMatches(get('P-3'), filter({ text: 'temat MAILI' }), facets)).toBe(true);
    expect(taskMatches(get('P-3'), filter({ text: 'pricingexpired' }), facets)).toBe(true);
    expect(taskMatches(get('P-1'), filter({ text: 'p-1' }), facets)).toBe(true);
    expect(taskMatches(get('P-1'), filter({ text: 'migracja maili' }), facets)).toBe(false);
  });

  it('shows the tasks of one owner, switched in turn: both, the user\'s, Claude\'s', () => {
    expect(taskMatches(get('P-3'), filter({ owner: 'claude' }), facets)).toBe(true);
    expect(taskMatches(get('P-3'), filter({ owner: 'me' }), facets)).toBe(false);
    // Closed ones too: P-4 is the user's and dropped
    expect(taskMatches(get('P-4'), filter({ owner: 'me' }), facets)).toBe(true);
    expect([nextOwner(null), nextOwner('me'), nextOwner('claude')]).toEqual(['me', 'claude', null]);
  });
});

describe('facetCounts', () => {
  it('counts inherited values', () => {
    expect(Object.fromEntries(facetCounts([...index.byId.values()], 'area', facets))).toEqual({ php: 4, mail: 2 });
  });
});

describe('treeRows', () => {
  const base = { facets, collapsed: new Set<string>(), hideClosedBranches: false, filter: EMPTY_FILTER };

  it('flattens the tree with depth', () => {
    expect(treeRows(index, base).map(r => `${r.depth}:${r.task.id}`)).toEqual(['0:P-1', '1:P-2', '1:P-3', '2:P-4', '0:P-5', '1:P-6']);
  });

  it('respects collapsed nodes', () => {
    const rows = treeRows(index, { ...base, collapsed: new Set(['P-1']) });
    expect(rows.map(r => r.task.id)).toEqual(['P-1', 'P-5', 'P-6']);
    expect(rows[0]!.hasChildren).toBe(true);
  });

  it('hides fully closed branches on request', () => {
    expect(treeRows(index, { ...base, hideClosedBranches: true }).map(r => r.task.id)).toEqual(['P-1', 'P-3']);
  });

  it('keeps ancestors of matches as context and expands them even when collapsed', () => {
    const rows = treeRows(index, { ...base, collapsed: new Set(['P-1']), filter: filter({ text: 'PricingExpired' }) });
    expect(rows.map(r => [r.task.id, r.contextOnly])).toEqual([['P-1', true], ['P-3', false]]);
  });

  it('offers to expand only where a child would show (children hidden by the filter do not count)', () => {
    const rows = treeRows(index, { ...base, filter: filter({ text: 'PricingExpired' }) });
    expect(rows.map(r => [r.task.id, r.hasChildren])).toEqual([['P-1', true], ['P-3', false]]);
  });

  it('limits to a project', () => {
    const multi = buildTaskIndex([...tasks, makeTask('Q-1')]);
    expect(treeRows(multi, { ...base, facets: facetValues(multi), projectKey: 'Q' }).map(r => r.task.id)).toEqual(['Q-1']);
  });
});

describe('filter in the URL', () => {
  it('round-trips through query parameters', () => {
    const f = filter({ text: 'invoices', owner: 'me', type: { fix: 1, idea: -1 }, status: { done: -1, dropped: -1 }, area: { 'admin panel': 1 } });
    const query = filterToQuery(f);
    expect(query).toEqual({ q: 'invoices', owner: 'me', type: ['fix', '!idea'], status: ['!done', '!dropped'], area: ['admin panel'] });
    expect(filterFromQuery(query)).toEqual(f);
  });

  it('is empty for an empty filter and ignores junk', () => {
    expect(filterToQuery(EMPTY_FILTER)).toEqual({});
    expect(filterFromQuery({ type: 'fix', mine: 'yes', owner: 'you', q: ['a', 'b'], status: ['', '!', 7], page: '2' }))
      .toEqual({ ...EMPTY_FILTER, type: { fix: 1 }, text: 'a' });
  });
});

describe('quick filters', () => {
  it('turn a status preset on, recognise it, and clear it on a second click', () => {
    const open = toggleQuickFilter(EMPTY_FILTER, 'open');
    expect(open.status).toEqual({ todo: 1, in_progress: 1, blocked: 1, deferred: 1 });
    expect(isQuickFilterOn(open, 'open')).toBe(true);
    expect(isQuickFilterOn(open, 'inProgress')).toBe(false);
    expect(toggleQuickFilter(open, 'open').status).toEqual({});
    expect(toggleQuickFilter(open, 'inProgress').status).toEqual({ in_progress: 1, blocked: 1 });
  });

  it('is off once the status rules are refined by hand', () => {
    expect(isQuickFilterOn(filter({ status: { todo: 1, in_progress: 1, blocked: 1 } }), 'open')).toBe(false);
  });
});
