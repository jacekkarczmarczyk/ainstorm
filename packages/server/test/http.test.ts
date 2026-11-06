import type { MapSnapshot } from '@ainstorm/core';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Daemon } from '../src/daemon.ts';
import { openDatabase } from '../src/db.ts';
import { createHttpServer } from '../src/http.ts';
import { listenLoopback } from '../src/index.ts';
import { saveSnapshot } from '../src/store.ts';
import { call as callPort, fixture, type CallOptions } from './helpers.ts';

const TOKEN = 'c'.repeat(64);

let server: Server;
let port: number;
let daemon: Daemon;

const call = (path: string, options?: CallOptions) => callPort(port, path, options);
const auth = { Authorization: `Bearer ${TOKEN}` };

async function newCode(): Promise<string> {
  const link = JSON.parse((await call('/api/open-link', { method: 'POST', headers: auth })).body) as { url: string };
  return new URL(link.url).searchParams.get('code')!;
}
const redeem = (code: string, origin = `http://127.0.0.1:${port}`) =>
  call('/open', { method: 'POST', form: `code=${code}`, headers: { Origin: origin } });

async function uiCookie(): Promise<string> {
  const opened = await redeem(await newCode());
  return String(opened.headers['set-cookie']).split(';')[0]!;
}

beforeEach(async () => {
  const db = openDatabase(':memory:');
  saveSnapshot(db, fixture());
  daemon = new Daemon(db);
  server = createHttpServer({ daemon, token: TOKEN, staticDir: null });
  port = await listenLoopback(server, 0);
});
afterEach(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));

describe('daemon over HTTP', () => {
  it('listens on the loopback address only', () => {
    expect(server.address()).toMatchObject({ address: '127.0.0.1' });
  });

  it('answers health without data and sends security headers', async () => {
    const reply = await call('/health');
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ name: 'ainstorm', ok: true });
    expect(reply.headers['content-security-policy']).toContain("default-src 'self'");
    expect(reply.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses a foreign Host even with a valid token (DNS rebinding)', async () => {
    expect((await call('/api/snapshot', { headers: { ...auth, Host: `evil.example:${port}` } })).status).toBe(403);
    expect((await call('/health', { headers: { Host: 'evil.example' } })).status).toBe(403);
  });

  it('refuses requests without a token or with a wrong one', async () => {
    expect((await call('/api/snapshot')).status).toBe(401);
    expect((await call('/api/snapshot', { headers: { Authorization: `Bearer ${'d'.repeat(64)}` } })).status).toBe(401);
    expect((await call('/events')).status).toBe(401);
    expect((await call('/api/open-link', { method: 'POST' })).status).toBe(401);
  });

  it('serves the snapshot and applies a command with the token', async () => {
    const snapshot = JSON.parse((await call('/api/snapshot', { headers: auth })).body) as MapSnapshot;
    const task = snapshot.tasks.find(t => t.status === 'todo')!;
    const { changeId } = JSON.parse((await call('/api/reserve', { method: 'POST', headers: auth })).body) as { changeId: number };
    const reply = await call('/api/commands', { method: 'POST', headers: auth, body: { command: { type: 'setStatus', taskId: task.id, to: 'done', notify: true }, changeId } });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ changeId });
    expect(daemon.snapshot().tasks.find(t => t.id === task.id)!.status).toBe('done');
    expect((await call(`/api/changes/${changeId}/revert`, { method: 'POST', headers: auth })).status).toBe(200);
    expect(daemon.snapshot().tasks.find(t => t.id === task.id)!.status).toBe('todo');
  });

  it('rejects invalid input with 400 and unknown tasks with 404', async () => {
    expect((await call('/api/commands', { method: 'POST', headers: auth, body: { command: { type: 'drop table' } } })).status).toBe(400);
    expect((await call('/api/commands', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: undefined })).status).toBe(400);
    expect((await call('/api/commands', { method: 'POST', headers: auth, body: { command: { type: 'setStatus', taskId: 'PRJ-9999', to: 'done', notify: true } } })).status).toBe(404);
  });

  it('gives the UI a cookie only through a one-time link, and a prefetch does not use it', async () => {
    expect((await call('/open?code=guess')).status).toBe(403);
    const code = await newCode();
    // Opening the link (or a browser prefetching it) only shows the button
    for (let i = 0; i < 2; i++) {
      const page = await call(`/open?code=${code}`);
      expect(page.status).toBe(200);
      expect(page.headers['set-cookie']).toBeUndefined();
      expect(page.body).toContain('method="post"');
    }
    // The button posts the code from the daemon's own page; another site cannot
    expect((await redeem(code, 'http://evil.example')).status).toBe(403);
    const opened = await redeem(code);
    expect(opened.status).toBe(303);
    expect(String(opened.headers['set-cookie'])).toMatch(/HttpOnly; SameSite=Strict/);
    expect((await redeem(code)).status).toBe(403);
    expect((await call(`/open?code=${code}`)).status).toBe(403);
  });

  it('lets the UI read with its cookie but change only from its own origin (CSRF)', async () => {
    const cookie = await uiCookie();
    expect((await call('/api/snapshot', { headers: { Cookie: cookie } })).status).toBe(200);
    const reserve = (origin?: string) => call('/api/reserve', { method: 'POST', headers: { Cookie: cookie, ...(origin ? { Origin: origin } : {}) } });
    expect((await reserve()).status).toBe(403);
    expect((await reserve('http://evil.example')).status).toBe(403);
    expect((await reserve(`http://127.0.0.1:${port}`)).status).toBe(200);
  });

  it('runs session operations for Claude sessions, and checks copied prompts', async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const ops = (body: unknown) => call(`/api/sessions/${sessionId}/ops`, { method: 'POST', headers: auth, body });
    const project = daemon.snapshot().projects.find(p => p.key === 'PRJ')!;
    const start = await ops({ op: 'start', cwd: project.paths[0]!.replace('~', (await import('node:os')).homedir()), source: 'startup' });
    expect(JSON.parse(start.body)).toEqual({ project: 'PRJ', created: true });
    const created = JSON.parse((await ops({ op: 'createTask', title: 'Z sesji' })).body) as { taskId: string };
    expect(daemon.snapshot().tasks.find(t => t.id === created.taskId)!.sessionIds).toEqual([sessionId]);
    expect(JSON.parse((await call(`/api/sessions/${sessionId}/context`, { headers: auth })).body).context).toContain(created.taskId);
    expect((await ops({ op: 'updateTask', taskId: created.taskId, expectedVersion: 99, title: 'x' })).status).toBe(409);
    const check = await call(`/api/sessions/${sessionId}/prompt`, { method: 'POST', headers: auth, body: { prompt: '[ainstorm #1 · session 00000000 · shop]\nx' } });
    expect(JSON.parse(check.body).block).toMatch(/another session/);
  });

  it('does not let the UI act as a Claude session', async () => {
    const cookie = await uiCookie();
    const reply = await call('/api/sessions/33333333-3333-4333-8333-333333333333/ops', {
      method: 'POST', headers: { Cookie: cookie, Origin: `http://127.0.0.1:${port}` }, body: { op: 'end' },
    });
    expect(reply.status).toBe(403);
    expect((await call('/api/sessions/not-a-uuid/ops', { method: 'POST', headers: auth, body: { op: 'end' } })).status).toBe(404);
  });

  it('a link asked for by a session opens that session; the target cannot be chosen from outside', async () => {
    const session = fixture().sessions[0]!;
    const link = async (body: unknown) => new URL((JSON.parse((await call('/api/open-link', { method: 'POST', headers: auth, body })).body) as { url: string }).url).searchParams.get('code')!;
    expect((await redeem(await link({ sessionId: session.id }))).headers.location).toBe(`/s/${session.id.slice(0, 8)}/tree`);
    // An unknown session, or no session, lands on the start page
    expect((await redeem(await link({ sessionId: '00000000-0000-4000-8000-000000000000' }))).headers.location).toBe('/');
    expect((await redeem(await newCode())).headers.location).toBe('/');
    // Only a session id is accepted; anything that could name another place is refused
    expect((await call('/api/open-link', { method: 'POST', headers: auth, body: { sessionId: 'https://evil.example' } })).status).toBe(400);
    const code = await newCode();
    expect((await call('/open', { method: 'POST', form: `code=${code}&target=https://evil.example`, headers: { Origin: `http://127.0.0.1:${port}` } })).headers.location).toBe('/');
  });

  it('does not let the UI issue links', async () => {
    const cookie = await uiCookie();
    expect((await call('/api/open-link', { method: 'POST', headers: { Cookie: cookie, Origin: `http://127.0.0.1:${port}` } })).status).toBe(403);
  });
});
