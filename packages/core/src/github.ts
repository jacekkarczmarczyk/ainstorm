import { splitCommit } from './commitMessage.ts';
import type { Task } from './model.ts';

/**
 * GitHub issues of a project. The map only stores the repository and issue numbers and shows links; issues are
 * created by the user on GitHub (a prefilled form) or by Claude in the session (gh), and closed by Claude, so the
 * daemon itself never talks to the network.
 */

/** Only a plain repository address: https://github.com/<owner>/<repo>, no path, query or fragment */
export const GITHUB_REPO = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

/** Issue number of a task's Issue field: "1234", "#1234" or the issue's address in the project's repository */
export function issueNumber(issue: string | null, repoUrl: string | null): number | null {
  if (!issue) return null;
  const plain = /^#?(\d{1,9})$/.exec(issue.trim());
  if (plain) return Number(plain[1]);
  if (!repoUrl) return null;
  const url = new RegExp(`^${repoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/(\\d{1,9})$`).exec(issue.trim());
  return url ? Number(url[1]) : null;
}

export const issueUrl = (repoUrl: string, n: number) => `${repoUrl}/issues/${n}`;

export interface IssueDraft { title: string; body: string }

/** An issue as the task would make it: its title, its description (without the commit line) and "done when" as a checklist */
export function issueDraft(task: Pick<Task, 'title' | 'description' | 'criteria'>): IssueDraft {
  const text = splitCommit(task.description).text.trim();
  const checklist = task.criteria.map(c => `- [${c.done ? 'x' : ' '}] ${c.text}`);
  const body = [text, checklist.length ? ['**Done when**', ...checklist].join('\n') : ''].filter(Boolean).join('\n\n');
  return { title: task.title, body };
}

/** GitHub's form for a new issue, filled in; the user checks it and submits it there */
export const newIssueUrl = (repoUrl: string, draft: IssueDraft) =>
  `${repoUrl}/issues/new?title=${encodeURIComponent(draft.title)}&body=${encodeURIComponent(draft.body)}`;

/** Longer addresses are refused by GitHub or browsers; such a draft is copied instead */
export const NEW_ISSUE_URL_MAX = 8000;

export type TextPart = { text: string; href?: string };

/** Text split into plain parts and `#1234` references linked to the project's repository (none without one). */
export function linkIssues(text: string, repoUrl: string | null): TextPart[] {
  if (!repoUrl) return [{ text }];
  const parts: TextPart[] = [];
  let last = 0;
  // "#" at the start or after a non-word character, so "abc#12" or "&#123" are left alone
  for (const m of text.matchAll(/(^|[^\w&])#(\d{1,9})\b/g)) {
    const start = m.index + m[1]!.length;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: `#${m[2]}`, href: issueUrl(repoUrl, Number(m[2])) });
    last = start + 1 + m[2]!.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
