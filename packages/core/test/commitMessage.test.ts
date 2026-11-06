import { describe, expect, it } from 'vitest';
import { splitCommit, withCommit } from '../src/commitMessage.ts';

describe('splitCommit and withCommit', () => {
  it('splits the description from the commit message, body lines included', () => {
    expect(splitCommit('Opis.\n\nCommit: fix(web): x\n\nBody line')).toEqual({ text: 'Opis.', message: 'fix(web): x\n\nBody line' });
    expect(splitCommit('Bez commita')).toEqual({ text: 'Bez commita', message: null });
    expect(splitCommit('Commit: feat: a')).toEqual({ text: '', message: 'feat: a' });
  });

  it('replaces, adds and removes the commit message', () => {
    expect(withCommit('Opis.\n\nCommit: fix: old', 'fix(web): new')).toBe('Opis.\n\nCommit: fix(web): new');
    expect(withCommit('Opis.', 'feat: a\n\nbody')).toBe('Opis.\n\nCommit: feat: a\n\nbody');
    expect(withCommit('', 'feat: a')).toBe('Commit: feat: a');
    expect(withCommit('Opis.\n\nCommit: fix: old', '  ')).toBe('Opis.');
  });
});
