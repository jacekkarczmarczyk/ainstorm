import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

/**
 * Open (or create) the database and bring its schema up to date. `:memory:` gives a throwaway
 * database for tests. Migrations are plain numbered SQL files applied in order, each in a transaction.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}

const migrationFiles = () => readdirSync(MIGRATIONS_DIR).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();

/** Schema version after all migrations of this build (a backup from a later one cannot be read) */
export const latestSchemaVersion = (): number => Math.max(0, ...migrationFiles().map(f => Number(f.slice(0, 3))));

function migrate(db: DatabaseSync) {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  for (const file of migrationFiles()) {
    const version = Number(file.slice(0, 3));
    if (version <= current) continue;
    transaction(db, () => {
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      // PRAGMA does not take parameters; version is a number parsed from a fixed file name pattern
      db.exec(`PRAGMA user_version = ${version}`);
    });
  }
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
