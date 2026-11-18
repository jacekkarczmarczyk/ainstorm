import { linkIssues } from '@ainstorm/core';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Markdown of a task (written by Claude sessions or the user) as HTML to show. It is data from outside, so the HTML is
 * sanitized; images are dropped, as the UI makes no requests outside the daemon (see docs/security.md). Links open in
 * a new tab, and #1234 outside links and code links to the project's GitHub issues.
 */
const purify = DOMPurify();
purify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdown(text: string, repoUrl: string | null): string {
  // Single line breaks stay breaks, as the plain text showed them
  const html = marked.parse(text, { async: false, gfm: true, breaks: true });
  const fragment = purify.sanitize(html, { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ['img', 'picture', 'video', 'audio', 'source', 'style'] });
  linkIssueNumbers(fragment, repoUrl);
  const box = document.createElement('div');
  box.append(fragment);
  return box.innerHTML;
}

function linkIssueNumbers(root: DocumentFragment, repoUrl: string | null) {
  if (!repoUrl) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const node of texts) {
    if (node.parentElement?.closest('a, code, pre')) continue;
    const parts = linkIssues(node.data, repoUrl);
    if (!parts.some(p => p.href)) continue;
    node.replaceWith(...parts.map(p => {
      if (!p.href) return p.text;
      const a = document.createElement('a');
      a.href = p.href;
      a.textContent = p.text;
      a.className = 'issue';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return a;
    }));
  }
}
