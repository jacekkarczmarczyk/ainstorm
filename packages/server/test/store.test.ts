import { MapSnapshot } from '@ainstorm/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Daemon } from '../src/daemon.ts';
import { openDatabase } from '../src/db.ts';
import { loadSnapshot, saveSnapshot } from '../src/store.ts';

const FIXTURE = join(import.meta.dirname, '..', '..', 'web', 'src', 'fixtures', 'map.json');
const fixture = () => MapSnapshot.parse(JSON.parse(readFileSync(FIXTURE, 'utf8')));

describe('store', () => {
  it('migrates an empty database', () => {
    const db = openDatabase(':memory:');
    expect(loadSnapshot(db)).toEqual({ projects: [], tasks: [], sessions: [], events: [] });
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(3);
  });

  it('round-trips the whole real-data fixture', () => {
    const db = openDatabase(':memory:');
    const snapshot = fixture();
    saveSnapshot(db, snapshot);
    expect(loadSnapshot(db)).toEqual(snapshot);
  });

  it('persists each change, its undo and a copied prompt', () => {
    const db = openDatabase(':memory:');
    saveSnapshot(db, fixture());
    const daemon = new Daemon(db, () => '2026-11-06T12:00:00.000Z');
    const task = daemon.snapshot().tasks.find(t => t.status === 'todo' && t.sessionIds.length > 0)!;

    const { changeId } = daemon.execute({ type: 'setStatus', taskId: task.id, to: 'done', notify: true });
    expect(loadSnapshot(db)).toEqual(daemon.snapshot());
    expect(loadSnapshot(db).tasks.find(t => t.id === task.id)!.status).toBe('done');

    daemon.markCopied(changeId);
    expect(loadSnapshot(db).events.at(-1)!.delivery!.state).toBe('copied');

    daemon.revert(changeId);
    expect(loadSnapshot(db)).toEqual(daemon.snapshot());
    expect(loadSnapshot(db).tasks.find(t => t.id === task.id)!.status).toBe('todo');
  });

  it('keeps change ids growing after a restart', () => {
    const db = openDatabase(':memory:');
    saveSnapshot(db, fixture());
    const first = new Daemon(db);
    const task = first.snapshot().tasks[0]!;
    const { changeId } = first.execute({ type: 'setStatus', taskId: task.id, to: 'blocked', notify: false });
    expect(new Daemon(db).reserveChangeId()).toBeGreaterThan(changeId);
  });

  it('rejects invalid commands without touching the database', () => {
    const db = openDatabase(':memory:');
    saveSnapshot(db, fixture());
    const daemon = new Daemon(db);
    const before = loadSnapshot(db);
    expect(() => daemon.execute({ type: 'setStatus', taskId: 'x; DROP TABLE tasks', to: 'done', notify: true })).toThrow();
    expect(() => daemon.execute({ type: 'nope' })).toThrow();
    expect(loadSnapshot(db)).toEqual(before);
  });
});
