/**
 * GitHub issues of a project. The map only stores the repository and issue numbers and shows links; issues are
 * created and closed by Claude in the session (gh), so the daemon itself never talks to the network.
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
