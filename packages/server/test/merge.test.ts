import type { MapSnapshot } from '@ainstorm/core';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db.ts';
import { planProjectImport } from '../src/merge.ts';
import { clearProject, loadSnapshot, saveSnapshot } from '../src/store.ts';
import { fixture, makeTask } from './helpers.ts';

const T0 = '2026-11-01T10:00:00.000Z';

function seeded() {
  const db = openDatabase(':memory:');
  saveSnapshot(db, {
    projects: [
      { key: 'AIN', name: 'ainstorm', paths: ['~/ainstorm'], focusTaskId: null, areas: ['web'], repoUrl: 'https://github.com/o/ainstorm' },
      { key: 'PRJ', name: 'old', paths: [], focusTaskId: null, areas: [], repoUrl: null },
    ],
    sessions: [],
    tasks: [makeTask('AIN-1', 'AIN'), makeTask('PRJ-999', 'PRJ')],
    events: [
      { id: 5, at: T0, sessionId: null, taskId: 'AIN-1', type: 'create', text: 'x', actor: 'claude', changeId: 1004, delivery: null },
      { id: 9, at: T0, sessionId: null, taskId: 'PRJ-999', type: 'create', text: 'old', actor: 'claude', changeId: null, delivery: null },
    ],
  });
  return db;
}

function run(db: ReturnType<typeof openDatabase>, incoming: MapSnapshot, only?: string[]) {
  const plan = planProjectImport(loadSnapshot(db), incoming, only);
  plan.clear.forEach(key => clearProject(db, key));
  saveSnapshot(db, plan.data);
  return plan;
}

describe('project import', () => {
  it('replaces the imported projects and leaves the others untouched', () => {
    const db = seeded();
    const plan = run(db, fixture());
    expect(plan.clear).toEqual(['PRJ']);
    const after = loadSnapshot(db);
    expect(after.tasks.some(t => t.id === 'PRJ-999')).toBe(false);
    expect(after.projects.find(p => p.key === 'PRJ')!.name).toBe('shop');
    expect(after.projects.find(p => p.key === 'AIN')).toMatchObject({ name: 'ainstorm', areas: ['web'], repoUrl: 'https://github.com/o/ainstorm' });
    expect(after.tasks.some(t => t.id === 'AIN-1')).toBe(true);
    expect(after.events.find(e => e.id === 5)!.changeId).toBe(1004);
    expect(after.events.filter(e => e.taskId.startsWith('PRJ-') || e.taskId.startsWith('PP-')).every(e => e.id > 5 && e.changeId === null)).toBe(true);
  });

  it('imports only the projects asked for', () => {
    const db = seeded();
    run(db, fixture(), ['PP']);
    const after = loadSnapshot(db);
    expect(after.projects.map(p => p.key).sort()).toEqual(['AIN', 'PP', 'PRJ']);
    expect(after.tasks.some(t => t.id === 'PRJ-999')).toBe(true);
  });

  it('imports the same file twice to the same result', () => {
    const db = seeded();
    run(db, fixture());
    const once = loadSnapshot(db);
    run(db, fixture());
    const twice = loadSnapshot(db);
    expect(twice.tasks).toEqual(once.tasks);
    expect(twice.events.length).toBe(once.events.length);
  });
});
