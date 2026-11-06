import { describe, expect, it } from 'vitest';
import {
  buildTaskIndex, descendants, effectiveAreas, inherited, outlinePosition, pathTo, possibleParents, progress,
  wouldCreateDepCycle, wouldCreateParentCycle,
} from '../src/tree.ts';
import { makeTask } from './factory.ts';

const tasks = [
  makeTask('PRJ-1', { type: 'build', areas: ['php'], branch: 'dev', planPath: '/plans/a.md' }),
  makeTask('PRJ-2', { parentId: 'PRJ-1', status: 'done' }),
  makeTask('PRJ-3', { parentId: 'PRJ-1', areas: ['mail', 'php'], branch: 'feature' }),
  makeTask('PRJ-4', { parentId: 'PRJ-3', status: 'dropped' }),
  makeTask('PRJ-5', { parentId: 'PRJ-3', type: 'fix' }),
  makeTask('PP-1'),
];

describe('buildTaskIndex', () => {
  it('groups children and roots per project', () => {
    const index = buildTaskIndex(tasks);
    expect(index.children('PRJ-1').map(t => t.id)).toEqual(['PRJ-2', 'PRJ-3']);
    expect(index.roots().map(t => t.id)).toEqual(['PRJ-1', 'PP-1']);
    expect(index.roots('PP').map(t => t.id)).toEqual(['PP-1']);
    expect(index.children('PRJ-2')).toEqual([]);
  });

  it('skips archived tasks and turns orphans into roots', () => {
    const index = buildTaskIndex([
      makeTask('A-1', { archivedAt: '2026-11-02T00:00:00.000Z' }),
      makeTask('A-2', { parentId: 'A-1' }),
      makeTask('A-3', { parentId: 'A-404' }),
    ]);
    expect(index.byId.has('A-1')).toBe(false);
    expect(index.roots().map(t => t.id)).toEqual(['A-2', 'A-3']);
  });
});

describe('pathTo and descendants', () => {
  const index = buildTaskIndex(tasks);

  it('returns the path from the root', () => {
    expect(pathTo(index, 'PRJ-5').map(t => t.id)).toEqual(['PRJ-1', 'PRJ-3', 'PRJ-5']);
    expect(pathTo(index, 'NOPE-1')).toEqual([]);
  });

  it('returns descendants depth-first', () => {
    expect(descendants(index, 'PRJ-1').map(t => t.id)).toEqual(['PRJ-2', 'PRJ-3', 'PRJ-4', 'PRJ-5']);
  });

  it('survives a parent cycle in corrupted data', () => {
    const cyclic = buildTaskIndex([makeTask('C-1', { parentId: 'C-2' }), makeTask('C-2', { parentId: 'C-1' })]);
    expect(pathTo(cyclic, 'C-1').map(t => t.id)).toEqual(['C-2', 'C-1']);
    expect(descendants(cyclic, 'C-1').map(t => t.id)).toEqual(['C-2']);
  });
});

describe('outlinePosition', () => {
  it('numbers tasks within their project and parent', () => {
    const index = buildTaskIndex(tasks);
    expect(outlinePosition(index, 'PRJ-1')).toEqual([1]);
    expect(outlinePosition(index, 'PRJ-5')).toEqual([1, 2, 2]);
    expect(outlinePosition(index, 'PP-1')).toEqual([1]);
    expect(outlinePosition(index, 'NOPE-1')).toEqual([]);
  });
});

describe('progress', () => {
  it('counts done and dropped as closed', () => {
    const index = buildTaskIndex(tasks);
    expect(progress(index, 'PRJ-1')).toEqual({ closed: 2, total: 4, ratio: 0.5 });
    expect(progress(index, 'PRJ-5')).toEqual({ closed: 0, total: 0, ratio: 0 });
  });
});

describe('inheritance', () => {
  const index = buildTaskIndex(tasks);

  it('takes the nearest value and reports its source', () => {
    expect(inherited(index, 'PRJ-5', 'type')).toEqual({ value: 'fix', fromId: null });
    expect(inherited(index, 'PRJ-4', 'type')).toEqual({ value: 'build', fromId: 'PRJ-1' });
    expect(inherited(index, 'PRJ-4', 'branch')).toEqual({ value: 'feature', fromId: 'PRJ-3' });
    expect(inherited(index, 'PP-1', 'planPath')).toBeNull();
  });

  it('merges areas without duplicates', () => {
    expect(effectiveAreas(index, 'PRJ-4')).toEqual([
      { value: 'php', fromId: 'PRJ-1' },
      { value: 'mail', fromId: 'PRJ-3' },
    ]);
  });
});

describe('cycle detection', () => {
  const index = buildTaskIndex([
    ...tasks,
    makeTask('PRJ-6', { deps: ['PRJ-7'] }),
    makeTask('PRJ-7', { deps: ['PRJ-8'] }),
    makeTask('PRJ-8'),
  ]);

  it('rejects moving a task under itself or its descendant', () => {
    expect(wouldCreateParentCycle(index, 'PRJ-3', 'PRJ-3')).toBe(true);
    expect(wouldCreateParentCycle(index, 'PRJ-3', 'PRJ-5')).toBe(true);
    expect(wouldCreateParentCycle(index, 'PRJ-5', 'PRJ-2')).toBe(false);
    expect(wouldCreateParentCycle(index, 'PRJ-5', null)).toBe(false);
  });

  it('offers only parents that keep the tree acyclic', () => {
    expect(possibleParents(index, 'PRJ-3').map(t => t.id)).not.toContain('PRJ-5');
    expect(possibleParents(index, 'PRJ-3').map(t => t.id)).not.toContain('PRJ-3');
    expect(possibleParents(index, 'PRJ-3').map(t => t.id)).toContain('PRJ-2');
  });

  it('rejects dependency cycles', () => {
    expect(wouldCreateDepCycle(index, 'PRJ-8', 'PRJ-6')).toBe(true);
    expect(wouldCreateDepCycle(index, 'PRJ-6', 'PRJ-6')).toBe(true);
    expect(wouldCreateDepCycle(index, 'PRJ-6', 'PRJ-8')).toBe(false);
  });
});
