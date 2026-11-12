import type { MapSnapshot } from '@ainstorm/core';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { latestSchemaVersion, openDatabase } from './db.ts';
import { loadSnapshot } from './store.ts';

/**
 * Backup archive of the map: a consistent copy of the database (VACUUM INTO, so changes still in the WAL file are
 * included), without the signed-in UI sessions, gzipped and encrypted with a password.
 *
 * File: "AINBAK" | version (1 byte) | salt (16) | IV (12) | AES-256-GCM ciphertext | tag (16).
 * Version 1: key = scrypt(password, salt, N=2^17, r=8, p=1). The header is authenticated as additional data.
 */

export class BackupError extends Error {}

const MAGIC = Buffer.from('AINBAK', 'ascii');
const VERSION = 1;
const HEADER = MAGIC.length + 1 + 16 + 12;
const TAG = 16;
const KDF = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'ascii');
// The decompressed database may not grow past this (a crafted archive must not fill memory)
const MAX_DATABASE = 512 * 1024 * 1024;

const key = (password: string, salt: Buffer) => scryptSync(password.normalize('NFC'), salt, 32, KDF);

export function encryptBackup(plain: Buffer, password: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', key(password, salt), iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

export function decryptBackup(file: Buffer, password: string): Buffer {
  if (file.length < HEADER + TAG || !file.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupError('Not an ainstorm backup file');
  if (file[MAGIC.length] !== VERSION) throw new BackupError('Backup file of an unknown version');
  const header = file.subarray(0, HEADER);
  const salt = header.subarray(MAGIC.length + 1, MAGIC.length + 17);
  const iv = header.subarray(MAGIC.length + 17);
  const decipher = createDecipheriv('aes-256-gcm', key(password, salt), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(file.subarray(file.length - TAG));
  try {
    return Buffer.concat([decipher.update(file.subarray(HEADER, file.length - TAG)), decipher.final()]);
  } catch {
    throw new BackupError('Wrong password or damaged file');
  }
}

/** Remove a database file and the files SQLite keeps next to it. */
function removeDatabase(file: string) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(file + suffix, { force: true });
}

const tempName = (dir: string, what: string) => join(dir, `${what}-${process.pid}-${randomBytes(6).toString('hex')}.tmp.db`);

/** A consistent copy of the database as bytes, without the UI sessions (cookie hashes of this machine). */
export function databaseCopy(db: DatabaseSync, dir: string): Buffer {
  const file = tempName(dir, 'backup');
  try {
    db.prepare('VACUUM INTO ?').run(file);
    const copy = new DatabaseSync(file);
    try {
      copy.exec('DELETE FROM ui_sessions');
      copy.exec('VACUUM');
    } finally {
      copy.close();
    }
    return readFileSync(file);
  } finally {
    removeDatabase(file);
  }
}

export function createBackup(db: DatabaseSync, dir: string, password: string): Buffer {
  return encryptBackup(gzipSync(databaseCopy(db, dir)), password);
}

/**
 * Decrypt and check a backup and return the map in it. A backup made by an older version is migrated;
 * one from a newer version, a damaged database or data that does not validate is refused.
 */
export function readBackup(file: Buffer, password: string, dir: string): MapSnapshot {
  let database: Buffer;
  try {
    database = gunzipSync(decryptBackup(file, password), { maxOutputLength: MAX_DATABASE });
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('Damaged backup file');
  }
  if (!database.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) throw new BackupError('Damaged backup file');

  const temp = tempName(dir, 'restore');
  try {
    writeFileSync(temp, database, { mode: 0o600 });
    const raw = new DatabaseSync(temp);
    let version: number;
    let integrity: string;
    try {
      version = Number((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
      integrity = String((raw.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check);
    } catch {
      throw new BackupError('Damaged backup file');
    } finally {
      raw.close();
    }
    if (integrity !== 'ok') throw new BackupError('Damaged backup file');
    if (version > latestSchemaVersion()) throw new BackupError('The backup comes from a newer version of ainstorm; update it first');
    const db = openDatabase(temp);
    try {
      return loadSnapshot(db);
    } catch {
      throw new BackupError('The backup does not hold a valid map');
    } finally {
      db.close();
    }
  } finally {
    removeDatabase(temp);
  }
}

/** File name with the time, safe on every system: ainstorm-2026-11-12T20-15-00Z */
export const stamp = (iso: string) => iso.replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
