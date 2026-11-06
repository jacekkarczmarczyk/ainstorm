import { PROMPT_PHRASES, type PromptLanguage, type PromptPhrases } from './promptLanguages.ts';
import type { Task, TaskStatus } from './model.ts';
import { shortId } from './text.ts';

/**
 * Prompts copied from the UI into a Claude session. The header has a fixed, language-independent
 * format so the UserPromptSubmit hook can reject a prompt pasted into the wrong session or twice.
 * The body is in the chosen prompt language; user-provided text only appears quoted.
 */

export interface PromptTarget {
  /** Session the prompt is meant for; null when no open session works on the task */
  sessionId: string | null;
  projectName: string;
}

export interface PromptHeader {
  changeId: number;
  /** First 8 characters of the session id, or null for a project-wide prompt */
  sessionShort: string | null;
  projectName: string;
}

const HEADER_RE = /^\[ainstorm #(\d+) · (?:session ([0-9a-f]{8})|project) · ([^\]\n]{1,100})\]$/m;

export function formatHeader(changeId: number, target: PromptTarget): string {
  const who = target.sessionId === null ? 'project' : `session ${shortId(target.sessionId)}`;
  return `[ainstorm #${changeId} · ${who} · ${quoteSafe(target.projectName, 100)}]`;
}

/** Header of an ainstorm prompt, or null when the message is not one. */
export function parseHeader(message: string): PromptHeader | null {
  const match = HEADER_RE.exec(message);
  if (!match) return null;
  return { changeId: Number(match[1]), sessionShort: match[2] ?? null, projectName: match[3]! };
}

/** One line, no header look-alikes, bounded length: text from the map is data, never structure. */
export function quoteSafe(text: string, max = 200): string {
  const oneLine = text.replace(/[\r\n\t]+/g, ' ').replace(/\[ainstorm/gi, '(ainstorm').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

export type PromptKind =
  | { kind: 'status'; task: Task; from: TaskStatus; to: TaskStatus }
  | { kind: 'delete'; task: Task; subtasks: number }
  | { kind: 'drop'; task: Task; from: TaskStatus }
  | { kind: 'run'; task: Task }
  | { kind: 'pause'; task: Task }
  | { kind: 'goAhead'; task: Task }
  | { kind: 'focus'; task: Task }
  | { kind: 'promote'; task: Task; blocks: Task }
  | { kind: 'move'; task: Task; from: Task | null; to: Task | null }
  | { kind: 'answer'; task: Task; question: string; answer: string }
  | { kind: 'recheck'; task: Task; question: string }
  | { kind: 'decide'; task: Task; approve: boolean; note: string }
  | { kind: 'runMany'; tasks: readonly Task[] }
  | { kind: 'commitMessage'; task: Task; message: string }
  | { kind: 'issue'; task: Task; request: 'create' | 'close'; repoUrl: string; number: number | null }
  | { kind: 'statusMany'; tasks: readonly Task[]; to: TaskStatus }
  | { kind: 'moveMany'; tasks: readonly Task[]; to: Task | null };

export { PROMPT_LANGUAGES, PROMPT_PHRASES, isPromptLanguage, type PromptLanguage } from './promptLanguages.ts';

/** Fills {name} placeholders in one pass, so a value is never read as a placeholder itself. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (all, name: string) => (name in values ? String(values[name]) : all));
}

function render(p: PromptKind, l: PromptPhrases, ref: (t: Task) => string, q: (s: string) => string): string {
  const s = l.status;
  switch (p.kind) {
    case 'status': return fill(l.statusChanged, { task: ref(p.task), from: s[p.from], to: s[p.to] });
    case 'delete': return fill(p.subtasks > 0 ? l.deletedWithSubtasks : l.deleted, { task: ref(p.task), n: p.subtasks });
    case 'drop': return fill(l.dropped, { task: ref(p.task), from: s[p.from] });
    case 'run': return fill(l.run, { task: ref(p.task) });
    case 'pause': return fill(l.pause, { task: ref(p.task) });
    case 'goAhead': return fill(l.goAhead, { task: ref(p.task) });
    case 'focus': return fill(l.focus, { task: ref(p.task) });
    case 'promote': return fill(l.promote, { task: ref(p.task), blocks: p.blocks.id });
    case 'move': return fill(l.moved, {
      task: ref(p.task),
      to: p.to ? fill(l.under, { task: ref(p.to) }) : l.topLevel,
      from: p.from ? fill(l.wasUnder, { id: p.from.id }) : l.wasTopLevel,
    });
    case 'answer': return fill(l.answer, { task: ref(p.task), question: q(p.question), answer: q(p.answer) });
    case 'recheck': return fill(l.recheck, { task: ref(p.task), question: q(p.question) });
    case 'runMany':
      if (p.tasks.length === 1) return fill(l.run, { task: ref(p.tasks[0]!) });
      return [l.runManyIntro, ...p.tasks.map((t, i) => `${i + 1}. ${ref(t)}`), l.runManyOutro].join('\n');
    case 'commitMessage':
      return p.message.trim() ? fill(l.commitSet, { task: ref(p.task), message: q(p.message) }) : fill(l.commitRemoved, { task: ref(p.task) });
    case 'issue':
      return p.request === 'create'
        ? fill(l.issueCreate, { repo: q(p.repoUrl), task: ref(p.task) })
        : fill(l.issueClose, { repo: q(p.repoUrl), task: ref(p.task), number: p.number ?? '?' });
    case 'statusMany': return [
      fill(l.statusMany, { to: s[p.to] }),
      ...p.tasks.map(t => `- ${fill(l.statusManyItem, { task: ref(t), from: s[t.status] })}`),
      p.to === 'dropped' ? l.statusManyDropped : l.statusManyOther,
    ].join('\n');
    case 'moveMany': return [
      fill(l.moveMany, { where: p.to ? fill(l.under, { task: ref(p.to) }) : l.topLevel }),
      ...p.tasks.map(t => `- ${ref(t)}`),
      l.moveManyOutro,
    ].join('\n');
    case 'decide': {
      const text = fill(p.approve ? l.decideYes : l.decideNo, { task: ref(p.task) });
      return p.note.trim() ? `${text}\n${fill(l.note, { note: q(p.note) })}` : text;
    }
  }
}

/** Full prompt: header plus body in the given language (English by default). */
export function buildPrompt(prompt: PromptKind, changeId: number, target: PromptTarget, language: PromptLanguage = 'en'): string {
  const l = PROMPT_PHRASES[language];
  const ref = (t: Task) => `${t.id} ${l.quotes[0]}${quoteSafe(t.title)}${l.quotes[1]}`;
  const q = (text: string) => quoteSafe(text, 2000);
  return `${formatHeader(changeId, target)}\n${render(prompt, l, ref, q)}`;
}

/**
 * Command that resumes a session in its project folder, with the plugin folder while the plugin is not installed.
 * POSIX shell (Git Bash on Windows): forward slashes, ~ kept for the shell, quotes only when needed.
 */
export function resumeCommand(sessionId: string, projectPath: string | null, pluginDir: string): string {
  const quote = (s: string) => (/^[\w./:-]*$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
  // A leading ~ must stay outside the quotes, or the shell does not expand it
  const arg = (path: string) => {
    const p = path.replace(/\\/g, '/');
    return p.startsWith('~/') ? `~/${quote(p.slice(2))}` : quote(p);
  };
  const cd = projectPath ? `cd ${arg(projectPath)} && ` : '';
  const plugin = pluginDir.trim() ? ` --plugin-dir ${arg(pluginDir.trim())}` : '';
  return `${cd}claude --resume ${sessionId}${plugin}`;
}

/** Shell command that starts a new Claude session with the prompt (POSIX and PowerShell quoting). */
export function newSessionCommand(prompt: string, shell: 'posix' | 'powershell' = 'posix'): string {
  if (shell === 'powershell') return `claude '${prompt.replace(/'/g, "''")}'`;
  return `claude '${prompt.replace(/'/g, `'\\''`)}'`;
}
