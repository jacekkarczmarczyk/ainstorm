import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Shared by the plugin's hook and MCP scripts. Only Node built-ins: the plugin is copied into Claude Code's
 * plugin cache and must run without this repository. The daemon address is fixed to the loopback interface.
 */

export const DIR = join(homedir(), '.ainstorm');
export const PORT = Number(process.env.AINSTORM_PORT ?? 4477);
const BASE = `http://127.0.0.1:${PORT}`;

export type Api = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>;

export function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Token from the user's private config; empty when ainstorm has never run (calls then fail and hooks stay silent). */
export const readToken = (): string => readJsonFile<{ token?: string }>(join(DIR, 'config.json'))?.token ?? '';

/** The token is read on each call: on the very first session it only exists once the daemon has started. */
export function createApi(token?: string, port = PORT, timeoutMs = 3000): Api {
  return async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token ?? readToken()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? null : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data;
  };
}

export async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start the daemon in the background when it does not answer. Its entry point is recorded by the daemon itself
 * in the user's private directory on first run; nothing here comes from the session or the network.
 */
export async function ensureDaemon(): Promise<boolean> {
  if (await healthy()) return true;
  const entry = readJsonFile<{ entry?: string }>(join(DIR, 'daemon.json'))?.entry;
  if (!entry) return false;
  const child = spawn(process.execPath, [entry], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 150));
    if (await healthy()) return true;
  }
  return false;
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
