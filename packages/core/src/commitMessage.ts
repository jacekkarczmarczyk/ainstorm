/**
 * The commit a code task intends to make, kept at the end of its description: a line `Commit: <subject>`,
 * optionally followed by body lines. Starting such a task from the UI accepts this message (see the skill).
 */

const MARK = /^Commit: /m;

/** Description and commit message apart; the message is everything from the last `Commit: ` line on. */
export function splitCommit(description: string): { text: string; message: string | null } {
  const matches = [...description.matchAll(/^Commit: /gm)];
  const last = matches.at(-1);
  if (!last || last.index === undefined) return { text: description, message: null };
  return {
    text: description.slice(0, last.index).trimEnd(),
    message: description.slice(last.index + 'Commit: '.length).trim() || null,
  };
}

/** The description with the commit message replaced (or added, or removed when empty). */
export function withCommit(description: string, message: string): string {
  const { text } = MARK.test(description) ? splitCommit(description) : { text: description.trimEnd() };
  const m = message.trim();
  if (!m) return text;
  return text ? `${text}\n\nCommit: ${m}` : `Commit: ${m}`;
}
