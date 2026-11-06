import { describe, expect, it } from 'vitest';
import { allowedHost, allowedOrigin, bearer, readCookie, sameSecret, UiSessions } from '../src/security.ts';

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
