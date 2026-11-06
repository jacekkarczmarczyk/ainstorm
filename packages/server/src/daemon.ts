import {
  applySessionOp, checkPrompt, deliveriesText, EngineError, MapEngine, sessionContext, takeDeliveries, UserCommand,
  type ChangeRecord, type MapSnapshot, type PathOptions, type UserChangeRecord,
} from '@ainstorm/core';
import { homedir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import { loadSnapshot, saveChange } from './store.ts';

// Project paths in the map may start with ~ and use either slash; on Windows they compare case-insensitively
const PATH_OPTIONS: PathOptions = { home: homedir(), windows: process.platform === 'win32' };

/**
 * The map held by the daemon: MapEngine in memory, written through to SQLite after every change,
 * and a list of listeners (SSE clients) told about each new state.
 */
export class Daemon {
  private readonly engine: MapEngine;
  private readonly db: DatabaseSync;
  private readonly listeners = new Set<(snapshot: MapSnapshot) => void>();

  constructor(db: DatabaseSync, now?: () => string) {
    this.db = db;
    this.engine = new MapEngine(loadSnapshot(db), now);
  }

  snapshot(): MapSnapshot {
    return this.engine.state;
  }

  reserveChangeId(): number {
    return this.engine.reserveChangeId();
  }

  /** Validated user command; throws ZodError or EngineError on bad input. */
  execute(input: unknown, changeId?: number): UserChangeRecord {
    return this.commit(this.engine.execute(UserCommand.parse(input), changeId));
  }

  revert(changeId: number): UserChangeRecord | null {
    const record = this.engine.revert(changeId);
    return record ? this.commit(record) : null;
  }

  markCopied(changeId: number): UserChangeRecord {
    return this.commit(this.engine.markCopied(changeId));
  }

  /** An MCP tool call or a hook of a Claude session; the session id comes from the proxy or hook, not from the model. */
  sessionOp(sessionId: string, input: unknown): Record<string, unknown> {
    const { record, value } = applySessionOp(this.engine, sessionId, input, PATH_OPTIONS);
    this.commit(record);
    return value;
  }

  /** Context for SessionStart and the context tool; null when the session is not registered. */
  context(sessionId: string): string | null {
    return sessionContext(this.engine.state, sessionId);
  }

  /** UI changes not yet seen by the session, as text for a hook; marks them delivered. */
  takeDeliveries(sessionId: string): string | null {
    const { events, record } = takeDeliveries(this.engine, sessionId);
    if (events.length) this.commit(record);
    return deliveriesText(this.engine.state, events);
  }

  /** UserPromptSubmit: block a copied prompt meant for another session, or already delivered. */
  checkPrompt(sessionId: string, prompt: string): string | null {
    const { block, record } = checkPrompt(this.engine, sessionId, prompt);
    if (block === null) this.commit(record);
    return block;
  }

  subscribe(listener: (snapshot: MapSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit<R extends ChangeRecord>(record: R): R {
    saveChange(this.db, this.engine.state, record);
    for (const listener of this.listeners) listener(this.engine.state);
    return record;
  }
}

export { EngineError };
