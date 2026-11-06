import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Daemon } from '../src/daemon.ts';
import { openDatabase } from '../src/db.ts';
import { createHttpServer } from '../src/http.ts';
import { listenLoopback } from '../src/index.ts';
import { call } from './helpers.ts';

// The built UI is served without a login, so no path may reach a file outside its folder
const SECRET = 'SECRET-CONTENT';
let base: string;
let server: Server;
let port: number;

const get = (path: string) => call(port, path);

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'ainstorm-static-'));
  const dist = join(base, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ainstorm</title>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  // Next to the UI folder: a file and a folder whose name starts like it
  writeFileSync(join(base, 'secret.txt'), SECRET);
  mkdirSync(join(base, 'dist-other'));
  writeFileSync(join(base, 'dist-other', 'secret.txt'), SECRET);
  server = createHttpServer({ daemon: new Daemon(openDatabase(':memory:')), token: 'c'.repeat(64), staticDir: dist });
  port = await listenLoopback(server, 0);
});
afterAll(async () => {
  await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
  rmSync(base, { recursive: true, force: true });
});

describe('static files', () => {
  it('serves files of the UI folder and the SPA entry for other paths', async () => {
    expect(await get('/assets/app.js')).toMatchObject({ status: 200, body: 'console.log(1)' });
    expect((await get('/s/abcd1234/tree')).body).toContain('<title>ainstorm</title>');
  });

  it.each([
    '/../secret.txt',
    '/assets/../../secret.txt',
    '/%2e%2e/secret.txt',
    '/%2E%2E%2Fsecret.txt',
    '/..%2fsecret.txt',
    '/..%5csecret.txt',
    '/%2e%2e%5c%2e%2e%5csecret.txt',
    '/../dist-other/secret.txt',
    '/%2e%2e/dist-other/secret.txt',
    '/assets/..%2f..%2fdist-other%2fsecret.txt',
    '/secret.txt%00.js',
  ])('never serves a file outside the UI folder: %s', async path => {
    const reply = await get(path);
    expect(reply.body).not.toContain(SECRET);
    expect([200, 400, 404]).toContain(reply.status);
  });

  it('answers a malformed escape with 400, not a server error', async () => {
    expect((await get('/%E0%A4%A')).status).toBe(400);
  });
});
