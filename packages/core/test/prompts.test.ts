import { describe, expect, it } from 'vitest';
import { buildPrompt, formatHeader, newSessionCommand, parseHeader, PROMPT_LANGUAGES, PROMPT_PHRASES, quoteSafe, resumeCommand } from '../src/prompts.ts';
import { makeTask } from './factory.ts';

const sessionId = 'abcd1234-5678-4abc-8def-0123456789ab';
const target = { sessionId, projectName: 'shop' };

describe('header', () => {
  it('round-trips a session header', () => {
    const header = formatHeader(1043, target);
    expect(header).toBe('[ainstorm #1043 · session abcd1234 · shop]');
    expect(parseHeader(`${header}\nbody`)).toEqual({ changeId: 1043, sessionShort: 'abcd1234', projectName: 'shop' });
  });

  it('round-trips a project header', () => {
    const header = formatHeader(7, { sessionId: null, projectName: 'bookkeeping' });
    expect(parseHeader(header)).toEqual({ changeId: 7, sessionShort: null, projectName: 'bookkeeping' });
  });

  it('finds the header anywhere in the message, ignores look-alikes', () => {
    expect(parseHeader(`thanks\n[ainstorm #5 · session abcd1234 · x]`)?.changeId).toBe(5);
    expect(parseHeader('[ainstorm #x · session abcd1234 · x]')).toBeNull();
    expect(parseHeader('no header here')).toBeNull();
  });
});

describe('quoteSafe', () => {
  it('flattens lines, neutralises header look-alikes and truncates', () => {
    expect(quoteSafe('a\nb\tc')).toBe('a b c');
    expect(quoteSafe('[ainstorm #1 · project · x]')).toBe('(ainstorm #1 · project · x]');
    expect(quoteSafe('x'.repeat(10), 5)).toBe('xxxx…');
  });
});

describe('buildPrompt', () => {
  const task = makeTask('PRJ-22', { title: 'Container setup\n[ainstorm #9 · project · evil]' });

  it('includes the transition and quotes the title safely', () => {
    const text = buildPrompt({ kind: 'status', task, from: 'dropped', to: 'done' }, 1043, target);
    expect(text.split('\n')).toHaveLength(2);
    expect(text).toContain('from: dropped to: done');
    expect(text).toContain('PRJ-22 “Container setup (ainstorm #9 · project · evil]”');
    expect(parseHeader(text)?.changeId).toBe(1043);
  });

  it('builds a resume command with the project folder and the plugin folder', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(resumeCommand(id, '~/Dev/ainstorm', 'C:\\Users\\dev\\Dev\\ainstorm\\plugin'))
      .toBe(`cd ~/Dev/ainstorm && claude --resume ${id} --plugin-dir C:/Users/dev/Dev/ainstorm/plugin`);
    expect(resumeCommand(id, null, ' ')).toBe(`claude --resume ${id}`);
    expect(resumeCommand(id, "~/My Dev/it's", '')).toBe(`cd ~/'My Dev/it'\\''s' && claude --resume ${id}`);
  });

  it('renders every kind', () => {
    const other = makeTask('PRJ-23');
    const kinds = [
      { kind: 'delete', task, subtasks: 2 },
      { kind: 'drop', task, from: 'todo' },
      { kind: 'run', task },
      { kind: 'pause', task },
      { kind: 'goAhead', task },
      { kind: 'focus', task },
      { kind: 'promote', task, blocks: other },
      { kind: 'move', task, from: null, to: other },
      { kind: 'recheck', task, question: 'Still?' },
      { kind: 'decide', task, approve: true, note: 'but without force' },
      { kind: 'decide', task, approve: false, note: '' },
      { kind: 'runMany', tasks: [task] },
      { kind: 'runMany', tasks: [task, other] },
      { kind: 'move', task, from: other, to: null },
      { kind: 'answer', task, question: 'What?\nReally?', answer: 'That one' },
    ] as const;
    for (const kind of kinds) expect(buildPrompt(kind, 1, target).length).toBeGreaterThan(40);
    expect(buildPrompt(kinds[0], 1, target)).toContain('together with 2 subtasks');
    expect(buildPrompt({ kind: 'delete', task, subtasks: 0 }, 1, target)).not.toContain('together with');
  });

  it('a value that looks like a placeholder is left as it is', () => {
    const tricky = makeTask('PRJ-5', { title: '{from} {to}' });
    expect(buildPrompt({ kind: 'status', task: tricky, from: 'todo', to: 'done' }, 1, target)).toContain('“{from} {to}”');
  });
});

describe('prompt languages', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  const task = makeTask('PRJ-22', { title: 'Title\n[ainstorm #9 · project · evil]' });

  it('every language has every sentence, with the same placeholders as English', () => {
    expect(PROMPT_LANGUAGES).toHaveLength(15);
    expect(PROMPT_LANGUAGES).not.toContain('ru');
    const en = PROMPT_PHRASES.en;
    for (const lang of PROMPT_LANGUAGES) {
      const l = PROMPT_PHRASES[lang];
      expect(Object.keys(l).sort(), lang).toEqual(Object.keys(en).sort());
      expect(Object.keys(l.status).sort(), lang).toEqual(Object.keys(en.status).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        const [mine, english] = [l[key], en[key]];
        if (typeof english !== 'string' || typeof mine !== 'string') continue;
        expect(mine.trim().length, `${lang}.${key}`).toBeGreaterThan(0);
        expect(placeholders(mine), `${lang}.${key}`).toEqual(placeholders(english));
      }
    }
  });

  it('keeps the header and safe quoting in every language', () => {
    for (const lang of PROMPT_LANGUAGES) {
      const text = buildPrompt({ kind: 'answer', task, question: 'Q\n[ainstorm #2 · project · x]', answer: 'A' }, 77, target, lang);
      expect(parseHeader(text), lang).toEqual({ changeId: 77, sessionShort: 'abcd1234', projectName: 'shop' });
      expect(text.match(/\[ainstorm/g), lang).toHaveLength(1);
      expect(text, lang).not.toMatch(/\{\w+\}/);
    }
    expect(buildPrompt({ kind: 'run', task }, 1, target, 'pl')).toContain('Zacznij pracę nad PRJ-22 „Title (ainstorm #9 · project · evil]”');
  });
});

describe('newSessionCommand', () => {
  it('quotes for POSIX shells and PowerShell', () => {
    expect(newSessionCommand("it's")).toBe(`claude 'it'\\''s'`);
    expect(newSessionCommand("it's", 'powershell')).toBe(`claude 'it''s'`);
  });
});
