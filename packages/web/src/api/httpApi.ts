import { MapSnapshot } from '@ainstorm/core';
import type { ConnectionState, MapApi } from './types.ts';

/** The daemon refused the UI cookie: the map has to be opened again through a one-time link. */
export class NotAuthenticatedError extends Error {}

const RETRY_MS = 3000;

/**
 * MapApi over the daemon's HTTP API on the same origin. Changes made anywhere (UI, Claude sessions, hooks)
 * arrive as full snapshots over SSE. EventSource reconnects by itself while the daemon is down; a refused
 * reconnection (signed out, or an error) closes it for good, so that case is checked and retried here.
 */
export function createHttpApi(): MapApi {
  const listeners = new Set<(s: MapSnapshot) => void>();
  const connection = new Set<(state: ConnectionState) => void>();
  let source: EventSource | null = null;
  let state: ConnectionState = 'live';

  const setState = (next: ConnectionState) => {
    if (next === state) return;
    state = next;
    connection.forEach(listener => listener(next));
  };

  /** A signed-out answer switches the UI to the sign-in screen; another error carries the daemon's message. */
  async function checked(response: Response): Promise<Response> {
    if (response.status === 401) {
      setState('auth');
      throw new NotAuthenticatedError('Not authenticated');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? `HTTP ${response.status}`);
    }
    return response;
  }

  async function call<T>(path: string, body?: unknown): Promise<T> {
    const response = await checked(await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    }));
    return await response.json() as T;
  }

  /** The stream was refused: signed out (stays so until a new link), otherwise try again in a moment. */
  async function recover() {
    try {
      if ((await fetch('/api/snapshot', { credentials: 'same-origin' })).status === 401) {
        setState('auth');
        return;
      }
    } catch {
      // The daemon is still down
    }
    setTimeout(() => { if (listeners.size > 0 && source === null) connect(); }, RETRY_MS);
  }

  function connect() {
    const current = new EventSource('/events');
    source = current;
    current.addEventListener('open', () => setState('live'));
    current.addEventListener('snapshot', event => {
      const snapshot = MapSnapshot.parse(JSON.parse((event as MessageEvent<string>).data));
      listeners.forEach(listener => listener(snapshot));
    });
    current.addEventListener('error', () => {
      if (state === 'auth') return;
      setState('reconnecting');
      if (current.readyState === EventSource.CLOSED) {
        source = null;
        void recover();
      }
    });
  }

  return {
    async load() {
      return MapSnapshot.parse(await call('/api/snapshot'));
    },
    async reserveChangeId() {
      return (await call<{ changeId: number }>('/api/reserve', {})).changeId;
    },
    async execute(command, changeId) {
      return call('/api/commands', { command, changeId });
    },
    async revert(changeId) {
      await call(`/api/changes/${changeId}/revert`, {});
    },
    async markCopied(changeId) {
      await call(`/api/changes/${changeId}/copied`, {});
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!source) connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          source?.close();
          source = null;
        }
      };
    },
    onConnection(listener) {
      connection.add(listener);
    },
    async backup(password) {
      const response = await checked(await fetch('/api/backup', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      }));
      const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'ainstorm.ainbak';
      return { file: await response.blob(), name };
    },
    async restore(file, password) {
      // Header values are ASCII: the password goes as base64 of its UTF-8 bytes
      const encoded = btoa(Array.from(new TextEncoder().encode(password), b => String.fromCharCode(b)).join(''));
      const response = await checked(await fetch('/api/restore', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Ainstorm-Password': encoded }, body: file,
      }));
      return await response.json() as { before: string };
    },
  };
}
