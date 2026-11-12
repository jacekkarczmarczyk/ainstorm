import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackupError, createBackup, decryptBackup, encryptBackup, readBackup } from '../src/backup.ts';
import { Daemon } from '../src/daemon.ts';
import { latestSchemaVersion, openDatabase } from '../src/db.ts';
import { loadSnapshot, saveSnapshot, uiSessionStore } from '../src/store.ts';
import { fixture } from './helpers.ts';

const PASSWORD = 'correct horse ąę';
const NOW = '2026-11-12T20:15:00.000Z';

let dir: string;
let opened: DatabaseSync[] = [];
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ainstorm-backup-')); });
// Open files cannot be removed on Windows
afterEach(() => {
  opened.forEach(db => db.close());
  opened = [];
  rmSync(dir, { recursive: true, force: true });
});

function filledDaemon() {
  const db = openDatabase(join(dir, 'ainstorm.db'));
  opened.push(db);
  saveSnapshot(db, fixture());
  return { db, daemon: new Daemon(db, () => NOW) };
}

describe('backup archive', () => {
  it('encrypts so that neither the database nor gzip is visible, and decrypts with the password', () => {
    const plain = Buffer.from('SQLite format 3\0 and the rest');
    const file = encryptBackup(plain, PASSWORD);
    expect(file.subarray(0, 6).toString('ascii')).toBe('AINBAK');
    expect(file.includes(Buffer.from('SQLite'))).toBe(false);
    expect(decryptBackup(file, PASSWORD)).toEqual(plain);
    // A fresh salt and IV every time
    expect(encryptBackup(plain, PASSWORD).equals(file)).toBe(false);
  });

  it('refuses a wrong password, a changed byte, a changed header and a foreign file', () => {
    const file = encryptBackup(Buffer.from('data'), PASSWORD);
    expect(() => decryptBackup(file, 'wrong password')).toThrow('Wrong password or damaged file');
    const body = Buffer.from(file);
    body[body.length - 20]! ^= 1;
    expect(() => decryptBackup(body, PASSWORD)).toThrow('Wrong password or damaged file');
    const header = Buffer.from(file);
    header[10]! ^= 1;
    expect(() => decryptBackup(header, PASSWORD)).toThrow('Wrong password or damaged file');
    expect(() => decryptBackup(Buffer.from('SQLite format 3\0 plain database'), PASSWORD)).toThrow('Not an ainstorm backup file');
    const version = Buffer.from(file);
    version[6] = 9;
    expect(() => decryptBackup(version, PASSWORD)).toThrow('unknown version');
  });

  it('holds the map with changes still in the WAL file, without the UI sessions, and leaves no temporary files', () => {
    const { db, daemon } = filledDaemon();
    uiSessionStore(db).add('a'.repeat(64), Date.now() + 60_000);
    const task = daemon.snapshot().tasks.find(t => t.status === 'todo')!;
    daemon.execute({ type: 'setStatus', taskId: task.id, to: 'done', notify: false });

    const file = createBackup(db, dir, PASSWORD);
    // The decrypted content is a plain SQLite database with the map and no UI sessions
    const database = gunzipSync(decryptBackup(file, PASSWORD));
    expect(database.subarray(0, 15).toString('ascii')).toBe('SQLite format 3');
    writeFileSync(join(dir, 'copy.db'), database);
    const copy = new DatabaseSync(join(dir, 'copy.db'));
    expect(copy.prepare('SELECT COUNT(*) AS n FROM ui_sessions').get()).toEqual({ n: 0 });
    copy.close();
    rmSync(join(dir, 'copy.db'));

    const snapshot = readBackup(file, PASSWORD, dir);
    expect(snapshot).toEqual(daemon.snapshot());
    expect(snapshot.tasks.find(t => t.id === task.id)!.status).toBe('done');
    expect(readdirSync(dir).filter(f => f !== 'ainstorm.db' && !f.startsWith('ainstorm.db-'))).toEqual([]);
  });

  it('refuses a backup from a newer schema and a damaged database', () => {
    const newer = new DatabaseSync(join(dir, 'newer.db'));
    newer.exec(`PRAGMA user_version = ${latestSchemaVersion() + 1}`);
    newer.close();
    const newerFile = encryptBackup(gzipSync(readFileSync(join(dir, 'newer.db'))), PASSWORD);
    expect(() => readBackup(newerFile, PASSWORD, dir)).toThrow('newer version');
    expect(() => readBackup(encryptBackup(gzipSync(Buffer.from('not a database')), PASSWORD), PASSWORD, dir)).toThrow('Damaged backup file');
    expect(() => readBackup(encryptBackup(Buffer.from('not gzip'), PASSWORD), PASSWORD, dir)).toThrow(BackupError);
  });
});

describe('restore', () => {
  it('replaces the map, keeps the UI sessions and the map as it was, and tells the listeners', () => {
    const { db, daemon } = filledDaemon();
    const file = daemon.backup(PASSWORD, dir).file;
    uiSessionStore(db).add('b'.repeat(64), Date.now() + 60_000);
    const original = structuredClone(daemon.snapshot());
    const task = original.tasks.find(t => t.status === 'todo')!;
    daemon.execute({ type: 'setStatus', taskId: task.id, to: 'done', notify: false });
    const changed = structuredClone(daemon.snapshot());

    const seen: unknown[] = [];
    daemon.subscribe(s => seen.push(s));
    const before = daemon.restore(file, PASSWORD, dir);

    expect(before).toBe('before-restore-2026-11-12T20-15-00Z.db');
    expect(daemon.snapshot()).toEqual(original);
    expect(loadSnapshot(db)).toEqual(original);
    expect(seen).toEqual([original]);
    expect(uiSessionStore(db).load().map(s => s.hash)).toEqual(['b'.repeat(64)]);
    const kept = openDatabase(join(dir, before));
    expect(loadSnapshot(kept)).toEqual(changed);
    kept.close();
  });

  it('changes nothing when the password is wrong', () => {
    const { db, daemon } = filledDaemon();
    const file = daemon.backup(PASSWORD, dir).file;
    const task = daemon.snapshot().tasks.find(t => t.status === 'todo')!;
    daemon.execute({ type: 'setStatus', taskId: task.id, to: 'done', notify: false });
    const changed = structuredClone(daemon.snapshot());
    expect(() => daemon.restore(file, 'wrong password', dir)).toThrow(BackupError);
    expect(daemon.snapshot()).toEqual(changed);
    expect(loadSnapshot(db)).toEqual(changed);
    expect(readdirSync(dir).some(f => f.startsWith('before-restore-'))).toBe(false);
  });

  it('names the archive after the time', () => {
    const { daemon } = filledDaemon();
    expect(daemon.backup(PASSWORD, dir).name).toBe('ainstorm-2026-11-12T20-15-00Z.ainbak');
  });
});
