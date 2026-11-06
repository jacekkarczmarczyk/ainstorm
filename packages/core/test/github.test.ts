import { describe, expect, it } from 'vitest';
import { GITHUB_REPO, issueNumber, linkIssues } from '../src/github.ts';

const REPO = 'https://github.com/owner/repo';

describe('GitHub issues', () => {
  it('accepts only a plain repository address', () => {
    expect(GITHUB_REPO.test(REPO)).toBe(true);
    for (const bad of ['http://github.com/o/r', 'https://github.com/o', 'https://github.com/o/r/issues', 'https://github.com/o/r?x=1', 'https://evil.com/o/r', 'javascript:alert(1)']) {
      expect(GITHUB_REPO.test(bad)).toBe(false);
    }
  });

  it('reads the issue number from the Issue field', () => {
    expect(issueNumber('1234', REPO)).toBe(1234);
    expect(issueNumber('#12', null)).toBe(12);
    expect(issueNumber(`${REPO}/issues/7`, REPO)).toBe(7);
    expect(issueNumber('https://github.com/other/repo/issues/7', REPO)).toBeNull();
    expect(issueNumber('JIRA-5', REPO)).toBeNull();
    expect(issueNumber(null, REPO)).toBeNull();
  });

  it('links #1234 only with a repository and only as a separate reference', () => {
    expect(linkIssues('fix #12, see #3.', REPO)).toEqual([
      { text: 'fix ' }, { text: '#12', href: `${REPO}/issues/12` }, { text: ', see ' }, { text: '#3', href: `${REPO}/issues/3` }, { text: '.' },
    ]);
    expect(linkIssues('#5 first', REPO)[0]).toEqual({ text: '#5', href: `${REPO}/issues/5` });
    expect(linkIssues('abc#12 &#123; #x', REPO)).toEqual([{ text: 'abc#12 &#123; #x' }]);
    expect(linkIssues('fix #12', null)).toEqual([{ text: 'fix #12' }]);
  });
});
