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

/**
 * One-time links that turn into a UI cookie: issued to an authenticated client (the plugin),
 * valid for a short time, usable once. UI sessions live in memory; a daemon restart asks for a new link.
 */
export class UiSessions {
  private readonly codes = new Map<string, number>();
  private readonly sessions = new Set<string>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(ttlMs = 60_000, now: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  issueCode(): string {
    const code = newSecret();
    this.codes.set(code, this.now() + this.ttlMs);
    return code;
  }

  /** Whether a code can still be redeemed, without using it (the GET of a link must not use it: browsers prefetch links). */
  usable(code: string): boolean {
    const expires = this.codes.get(code);
    return expires !== undefined && expires >= this.now();
  }

  /** Exchange a code for a session value; null when it is unknown, used or expired. */
  redeem(code: string): string | null {
    const expires = this.codes.get(code);
    this.codes.delete(code);
    for (const [c, at] of this.codes) if (at < this.now()) this.codes.delete(c);
    if (expires === undefined || expires < this.now()) return null;
    const session = newSecret();
    this.sessions.add(session);
    return session;
  }

  valid(session: string | null): boolean {
    if (session === null) return false;
    for (const s of this.sessions) if (sameSecret(s, session)) return true;
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
