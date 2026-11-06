import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/** The daemon listens here and nowhere else; not configurable on purpose (see docs/security.md). */
export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 4477;

const Config = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });
export type Config = z.infer<typeof Config>;

export interface Paths {
  dir: string;
  config: string;
  database: string;
  /** Where the daemon's entry point is recorded, so the plugin's SessionStart hook can start it */
  daemon: string;
}

export function defaultPaths(dir = join(homedir(), '.ainstorm')): Paths {
  return { dir, config: join(dir, 'config.json'), database: join(dir, 'ainstorm.db'), daemon: join(dir, 'daemon.json') };
}

/**
 * Make the data directory private to the current user. On Windows the inherited ACL is replaced
 * by full control for the user only (fixed arguments, nothing from requests); elsewhere mode 0700.
 */
function restrictDir(dir: string) {
  if (process.platform === 'win32') {
    execFileSync('icacls', [dir, '/inheritance:r', '/grant:r', `${userInfo().username}:(OI)(CI)F`], { stdio: 'ignore', windowsHide: true });
  } else {
    chmodSync(dir, 0o700);
  }
}

/** Read the config, creating the directory and a fresh 256-bit token on first run. The token is never logged. */
export function loadConfig(paths: Paths): Config {
  if (!existsSync(paths.dir)) {
    mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
    restrictDir(paths.dir);
  }
  if (existsSync(paths.config)) return Config.parse(JSON.parse(readFileSync(paths.config, 'utf8')));
  const config: Config = { token: randomBytes(32).toString('hex') };
  writeFileSync(paths.config, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return config;
}
