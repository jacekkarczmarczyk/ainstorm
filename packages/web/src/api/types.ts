import type { MapSnapshot, UserCommand } from '@ainstorm/core';

/**
 * Commands the UI sends to the daemon (schema and rules in core). The HTTP client and the in-memory
 * fixture implement the same interface; nothing in the UI knows which one it talks to.
 */
export type Command = UserCommand;

export interface CommandResult {
  /** Id of the change; null for commands that are not delivered to sessions */
  changeId: number | null;
}

export interface MapApi {
  load(): Promise<MapSnapshot>;
  /**
   * Reserve the id of the next change, so a prompt can be shown and copied before the change is made
   * (the prompt header must carry the id the hook will check). Pass it to execute().
   */
  reserveChangeId(): Promise<number>;
  execute(command: Command, changeId?: number): Promise<CommandResult>;
  /** Undo a change made in the UI (while its toast is visible) */
  revert(changeId: number): Promise<void>;
  /** The user copied the prompt for a change instead of relying on automatic delivery */
  markCopied(changeId: number): Promise<void>;
  /** Called with a fresh snapshot after every change, including changes made by sessions */
  subscribe(listener: (snapshot: MapSnapshot) => void): () => void;
  /** State of the live connection, for APIs that have one (the daemon; not the in-memory fixture) */
  onConnection?(listener: (state: ConnectionState) => void): void;
}

/** live: updates arrive; reconnecting: the daemon does not answer, the map may be out of date; auth: signed out */
export type ConnectionState = 'live' | 'reconnecting' | 'auth';
