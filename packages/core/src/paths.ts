import type { Project } from './model.ts';

export interface PathOptions {
  /** Home directory used to expand a leading ~ */
  home?: string;
  /** Treat paths as Windows paths: case-insensitive, Git Bash style /c/... means c:/... */
  windows?: boolean;
}

/** Comparable form of a path: forward slashes, no duplicate or trailing slash, lower case on Windows. */
export function normalizePath(path: string, options: PathOptions = {}): string {
  let p = path.trim().replace(/\\/g, '/');
  if (options.home !== undefined && (p === '~' || p.startsWith('~/'))) {
    p = options.home.replace(/\\/g, '/').replace(/\/+$/, '') + p.slice(1);
  }
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (options.windows) {
    p = p.replace(/^\/([a-z])(?=\/|$)/i, '$1:').toLowerCase();
  }
  return p;
}

/** Whether `path` is `root` or lies inside it (segment-aware, so /a/bc is not inside /a/b). */
export function isInside(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith('/') ? root : root + '/');
}

export interface ProjectSuggestion {
  key: string;
  name: string;
  path: string;
}

/**
 * A project for a folder that is not one yet, for the user to confirm or change: the folder name as the name, and a
 * key made of its letters and digits (upper case, starting with a letter, at most 10), numbered when already taken.
 */
export function suggestProject(path: string, projects: readonly Project[]): ProjectSuggestion {
  const trimmed = path.trim().replace(/[\\/]+$/, '');
  const name = (trimmed.split(/[\\/]/).pop() ?? '').slice(0, 100) || 'project';
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^[0-9]+/, '').slice(0, 10) || 'PRJ';
  const taken = new Set(projects.map(p => p.key));
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base.slice(0, 10 - String(n).length)}${n}`;
  return { key, name, path: trimmed };
}

/** Project whose registered path is the longest prefix of cwd; null when none matches. */
export function matchProject(cwd: string, projects: readonly Project[], options: PathOptions = {}): Project | null {
  const target = normalizePath(cwd, options);
  let best: { project: Project; length: number } | null = null;
  for (const project of projects) {
    for (const raw of project.paths) {
      const root = normalizePath(raw, options);
      if (isInside(target, root) && (!best || root.length > best.length)) best = { project, length: root.length };
    }
  }
  return best?.project ?? null;
}
