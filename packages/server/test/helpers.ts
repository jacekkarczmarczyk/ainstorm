import { MapSnapshot, type Task } from '@ainstorm/core';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';

const FIXTURE = join(import.meta.dirname, '..', '..', 'web', 'src', 'fixtures', 'map.json');

/** The fictional map of the web fixtures, parsed fresh on every call */
export const fixture = () => MapSnapshot.parse(JSON.parse(readFileSync(FIXTURE, 'utf8')));

const T0 = '2026-11-01T10:00:00.000Z';
export const makeTask = (id: string, projectKey: string): Task => ({
  id, projectKey, title: id, description: '', status: 'todo', type: null, areas: [], owner: 'claude', ask: null,
  parentId: null, fromId: null, deps: [], planPath: null, planRef: null, branch: null, issue: null, pr: null, deferReason: null,
  criteria: [], decisions: [], commits: [], sessionIds: [], questions: [], archivedAt: null, createdAt: T0, updatedAt: T0, version: 1,
});

export interface Reply { status: number; headers: Record<string, string | string[] | undefined>; body: string; bytes: Buffer }
export interface CallOptions { method?: string; headers?: Record<string, string>; body?: unknown; form?: string; file?: Buffer }

/** A raw request to the daemon: the path goes out exactly as written (no URL normalisation by a client) */
export function call(port: number, path: string, options: CallOptions = {}): Promise<Reply> {
  const body = options.file ?? options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port, path, method: options.method ?? 'GET',
      headers: {
        Host: `127.0.0.1:${port}`,
        ...(options.file !== undefined ? { 'Content-Type': 'application/octet-stream' }
          : options.form !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const bytes = Buffer.concat(chunks);
        resolve({ status: res.statusCode!, headers: res.headers, body: bytes.toString('utf8'), bytes });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}
