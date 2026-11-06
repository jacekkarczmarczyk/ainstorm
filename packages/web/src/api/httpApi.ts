import { MapSnapshot } from '@ainstorm/core';
import type { MapApi } from './types.ts';

/** The daemon refused the UI cookie: the map has to be opened again through a one-time link. */
export class NotAuthenticatedError extends Error {}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (response.status === 401) throw new NotAuthenticatedError('Not authenticated');
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

/**
 * MapApi over the daemon's HTTP API on the same origin. Changes made anywhere (UI, Claude sessions, hooks)
 * arrive as full snapshots over SSE; EventSource reconnects by itself after a daemon restart.
 */
export function createHttpApi(): MapApi {
  const listeners = new Set<(s: MapSnapshot) => void>();
  let source: EventSource | null = null;

  const connect = () => {
    source = new EventSource('/events');
    source.addEventListener('snapshot', event => {
      const snapshot = MapSnapshot.parse(JSON.parse((event as MessageEvent<string>).data));
      listeners.forEach(listener => listener(snapshot));
    });
  };

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
  };
}
