import { describe, expect, it } from 'vitest';
import { isInside, matchProject, normalizePath } from '../src/paths.ts';
import { makeProject } from './factory.ts';

describe('normalizePath', () => {
  it('normalises Windows paths', () => {
    const win = { windows: true };
    expect(normalizePath('C:\\Users\\dev\\Dev\\', win)).toBe('c:/users/dev/dev');
    expect(normalizePath('/c/Users/dev', win)).toBe('c:/users/dev');
    expect(normalizePath('C://Users//x', win)).toBe('c:/users/x');
  });

  it('keeps POSIX paths case-sensitive', () => {
    expect(normalizePath('/home/dev/dev/')).toBe('/home/dev/dev');
    expect(normalizePath('/c/Users')).toBe('/c/Users');
    expect(normalizePath('/')).toBe('/');
  });

  it('expands ~', () => {
    expect(normalizePath('~/dev/x', { home: 'C:\\Users\\dev', windows: true })).toBe('c:/users/dev/dev/x');
    expect(normalizePath('~', { home: '/home/j/' })).toBe('/home/j');
    expect(normalizePath('~other/x', { home: '/home/j' })).toBe('~other/x');
  });
});

describe('isInside', () => {
  it('is segment-aware', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b/c', '/a/b')).toBe(true);
    expect(isInside('/a/bc', '/a/b')).toBe(false);
    expect(isInside('/a', '/')).toBe(true);
  });
});

describe('matchProject', () => {
  const options = { home: 'C:/Users/dev', windows: true };
  const pp = makeProject({ key: 'PP', paths: ['~/dev/office/bookkeeping'] });
  const web = makeProject({ key: 'WEB', paths: ['~/dev/office/bookkeeping/web'] });
  const prj = makeProject({ key: 'PRJ', paths: ['~/dev/shop/shop', 'D:/mirror/shop'] });

  it('picks the longest matching root', () => {
    expect(matchProject('C:\\Users\\dev\\Dev\\office\\bookkeeping\\web\\src', [pp, web, prj], options)?.key).toBe('WEB');
    expect(matchProject('c:/users/dev/dev/office/bookkeeping', [pp, web, prj], options)?.key).toBe('PP');
    expect(matchProject('d:/MIRROR/shop/api', [pp, web, prj], options)?.key).toBe('PRJ');
  });

  it('returns null outside every project', () => {
    expect(matchProject('C:/Users/dev/Dev/office/bookkeepingx', [pp], options)).toBeNull();
  });
});
