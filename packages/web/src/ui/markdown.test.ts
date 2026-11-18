import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.ts';

const REPO = 'https://github.com/example/shop';

describe('renderMarkdown', () => {
  it('shows headings, lists, checklists, code and line breaks', () => {
    const html = renderMarkdown('## Plan\n- [x] index\n- [ ] chips\n\nfirst line\nsecond line\n\n`code`', null);
    expect(html).toContain('<h2>Plan</h2>');
    expect(html).toMatch(/<input[^>]*checked[^>]*>/);
    expect(html).toContain('first line<br>second line');
    expect(html).toContain('<code>code</code>');
  });

  it('removes scripts, handlers and images, and opens links in a new tab', () => {
    const html = renderMarkdown('<script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">a</a>\n\n![x](https://evil.example/p.png) [docs](https://example.com)', null);
    expect(html).not.toMatch(/<script|onclick|javascript:|<img|evil\.example/);
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>');
  });

  it('links #1234 to the project\'s issues, but not inside code or links', () => {
    const html = renderMarkdown('fixes #12, see `#13` and [#14](https://example.com)', REPO);
    expect(html).toContain(`<a href="${REPO}/issues/12" class="issue" target="_blank" rel="noopener noreferrer">#12</a>`);
    expect(html).toContain('<code>#13</code>');
    expect(html).not.toContain(`${REPO}/issues/14`);
  });
});
