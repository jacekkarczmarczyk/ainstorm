import { describe, expect, it } from 'vitest';
import { allowedHost, allowedOrigin, bearer, readCookie, sameSecret, UiSessions, type UiSessionStore } from '../src/security.ts';

describe('request checks', () => {
  it('allows only this daemon as Host (DNS rebinding)', () => {
    expect(allowedHost('127.0.0.1:4477', 4477)).toBe(true);
    expect(allowedHost('localhost:4477', 4477)).toBe(true);
    expect(allowedHost('evil.example:4477', 4477)).toBe(false);
    expect(allowedHost('127.0.0.1:80', 4477)).toBe(false);
    expect(allowedHost('127.0.0.1', 4477)).toBe(false);
    expect(allowedHost(undefined, 4477)).toBe(false);
  });

  it('allows only this daemon as Origin', () => {
    expect(allowedOrigin('http://127.0.0.1:4477', 4477)).toBe(true);
    expect(allowedOrigin('http://localhost:4477', 4477)).toBe(true);
    expect(allowedOrigin('https://127.0.0.1:4477', 4477)).toBe(false);
    expect(allowedOrigin('http://evil.example', 4477)).toBe(false);
    expect(allowedOrigin('null', 4477)).toBe(false);
    expect(allowedOrigin(undefined, 4477)).toBe(false);
  });

  it('parses the bearer token strictly and compares secrets', () => {
    const token = 'a'.repeat(64);
    expect(bearer(`Bearer ${token}`)).toBe(token);
    expect(bearer(`Bearer ${token} `)).toBeNull();
    expect(bearer('Basic abc')).toBeNull();
    expect(bearer(undefined)).toBeNull();
    expect(sameSecret(token, token)).toBe(true);
    expect(sameSecret(token, 'b'.repeat(64))).toBe(false);
    expect(sameSecret(token, 'short')).toBe(false);
  });

  it('reads one cookie by name', () => {
    expect(readCookie('a=1; ainstorm_ui=xyz; b=2', 'ainstorm_ui')).toBe('xyz');
    expect(readCookie('xainstorm_ui=1', 'ainstorm_ui')).toBeNull();
    expect(readCookie(undefined, 'ainstorm_ui')).toBeNull();
  });
});

describe('one-time UI links', () => {
  it('redeem once, then never again', () => {
    const sessions = new UiSessions();
    const code = sessions.issueCode();
    const session = sessions.redeem(code);
    expect(session).toMatch(/^[0-9a-f]{64}$/);
    expect(sessions.valid(session)).toBe(true);
    expect(sessions.redeem(code)).toBeNull();
    expect(sessions.valid('f'.repeat(64))).toBe(false);
    expect(sessions.valid(null)).toBe(false);
  });

  it('expire', () => {
    let now = 0;
    const sessions = new UiSessions(1000, () => now);
    const code = sessions.issueCode();
    now = 1001;
    expect(sessions.redeem(code)).toBeNull();
    expect(sessions.redeem('guess')).toBeNull();
  });
});

describe('UI sessions', () => {
  // An in-memory stand-in for the ui_sessions table
  const memoryStore = () => {
    const rows = new Map<string, number>();
    const store: UiSessionStore = {
      load: () => [...rows].map(([hash, expiresAt]) => ({ hash, expiresAt })),
      add: (hash, expiresAt) => { rows.set(hash, expiresAt); },
      remove: hash => { rows.delete(hash); },
    };
    return { rows, store };
  };

  it('survive a restart, and the store holds only a hash of the cookie', () => {
    const { rows, store } = memoryStore();
    const before = new UiSessions(1000, () => 0, store);
    const cookie = before.redeem(before.issueCode())!;
    expect(rows.size).toBe(1);
    expect([...rows.keys()][0]).not.toBe(cookie);
    expect(new UiSessions(1000, () => 0, store).valid(cookie)).toBe(true);
  });

  it('expire, and expired ones leave the store', () => {
    const { rows, store } = memoryStore();
    let now = 0;
    const sessions = new UiSessions(1000, () => now, store, 5000);
    const cookie = sessions.redeem(sessions.issueCode())!;
    now = 5000;
    expect(sessions.valid(cookie)).toBe(true);
    now = 5001;
    expect(sessions.valid(cookie)).toBe(false);
    expect(rows.size).toBe(0);
    // Loading drops what expired while the daemon was down
    store.add('a'.repeat(64), 10);
    new UiSessions(1000, () => now, store);
    expect(rows.size).toBe(0);
  });
});
