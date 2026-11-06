import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Request checks, kept free of I/O so each rule has its own test. Threat model: docs/security.md.
 */

export const COOKIE = 'ainstorm_ui';

/** Host header must name this daemon (blocks DNS rebinding: a foreign name resolving to 127.0.0.1). */
export function allowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** Origin of a browser request must be the daemon itself; requests from other sites are refused. */
export function allowedOrigin(origin: string | undefined, port: number): boolean {
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

/** Constant-time comparison; hashing first makes lengths equal. */
export function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function bearer(authorization: string | undefined): string | null {
  const match = /^Bearer ([0-9a-f]{64})$/.exec(authorization ?? '');
  return match ? match[1]! : null;
}

export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export const newSecret = (): string => randomBytes(32).toString('hex');

/** How long a browser stays signed in after opening a one-time link */
export const UI_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Where signed-in UI sessions are kept between daemon runs: hashes of the cookie values only, never the values. */
export interface UiSessionStore {
  load(): { hash: string; expiresAt: number }[];
  add(hash: string, expiresAt: number): void;
  remove(hash: string): void;
}

const hashOf = (session: string) => createHash('sha256').update(session).digest('hex');

/**
 * One-time links that turn into a UI cookie: issued to an authenticated client (the plugin),
 * valid for a short time, usable once. A UI session lasts UI_SESSION_TTL_MS; with a store it survives a restart.
 */
export class UiSessions {
  /** One-time code → when it expires and the local path the browser lands on */
  private readonly codes = new Map<string, { expires: number; target: string }>();
  /** Hash of the cookie value → when it expires */
  private readonly sessions = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly store: UiSessionStore | null;
  readonly sessionTtlMs: number;

  constructor(ttlMs = 60_000, now: () => number = Date.now, store: UiSessionStore | null = null, sessionTtlMs = UI_SESSION_TTL_MS) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.store = store;
    this.sessionTtlMs = sessionTtlMs;
    for (const { hash, expiresAt } of store?.load() ?? []) {
      if (expiresAt >= now()) this.sessions.set(hash, expiresAt);
      else store?.remove(hash);
    }
  }

  /** `target` is a path the daemon chose itself (never taken from a request), where the browser lands after signing in. */
  issueCode(target = '/'): string {
    const code = newSecret();
    this.codes.set(code, { expires: this.now() + this.ttlMs, target });
    return code;
  }

  /** Whether a code can still be redeemed, without using it (the GET of a link must not use it: browsers prefetch links). */
  usable(code: string): boolean {
    const entry = this.codes.get(code);
    return entry !== undefined && entry.expires >= this.now();
  }

  /** Where the browser goes after redeeming the code; read before redeem(), which forgets the code. */
  targetOf(code: string): string {
    return this.codes.get(code)?.target ?? '/';
  }

  /** Exchange a code for a session value; null when it is unknown, used or expired. */
  redeem(code: string): string | null {
    const expires = this.codes.get(code)?.expires;
    this.codes.delete(code);
    for (const [c, entry] of this.codes) if (entry.expires < this.now()) this.codes.delete(c);
    if (expires === undefined || expires < this.now()) return null;
    const session = newSecret();
    const hash = hashOf(session);
    const until = this.now() + this.sessionTtlMs;
    this.sessions.set(hash, until);
    this.store?.add(hash, until);
    return session;
  }

  // Looked up by hash: a guess cannot steer the lookup towards a stored value, so no constant-time comparison is needed
  valid(session: string | null): boolean {
    if (session === null) return false;
    const hash = hashOf(session);
    const until = this.sessions.get(hash);
    if (until === undefined) return false;
    if (until >= this.now()) return true;
    this.sessions.delete(hash);
    this.store?.remove(hash);
    return false;
  }
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  // same-origin, not no-referrer: with no-referrer browsers send "Origin: null" on form posts, which the CSRF check refuses
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};
