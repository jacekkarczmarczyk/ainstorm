// Screenshots for the README: the dev UI with a small, made-up map, saved to docs/screenshots/.
// Usage: pnpm dev (in another terminal), then node scripts/screenshots.ts
// The map replaces the dev fixture in the browser only; packages/web/src/fixtures stays as it is.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { MapSnapshot, type MapEvent, type Session, type Task } from '../packages/core/src/index.ts';

const BASE = 'http://127.0.0.1:5174';
const OUT = join(import.meta.dirname, '..', 'docs', 'screenshots');

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

const CHECKOUT = 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SEARCH = 'b7e2d3c4-6f5a-4b8c-9d0e-1f2a3b4c5d6e';
const EMAILS = 'c9a8b7d6-1e2f-4c3d-8e4f-5a6b7c8d9e0f';
const DOCS = 'd2c3b4a5-7f8e-4d9c-a0b1-c2d3e4f5a6b7';

function task(id: string, title: string, fields: Partial<Task>): Task {
  return {
    id, projectKey: id.split('-')[0]!, title, description: '', status: 'todo', type: null, areas: [], owner: 'claude', ask: null,
    parentId: null, fromId: null, deps: [], planPath: null, planRef: null, branch: null, issue: null, pr: null, deferReason: null,
    criteria: [], decisions: [], commits: [], sessionIds: [], questions: [], archivedAt: null, createdAt: ago(600), updatedAt: ago(30),
    version: 1, ...fields,
  };
}
const commit = (sha: string, message: string) => ({ sha, message, state: 'live' as const, intoSha: null, note: null });
const criteria = (done: boolean, ...texts: string[]) => texts.map(text => ({ text, done }));

const tasks: Task[] = [
  // Saved cards: Claude works on the card picker; a decision waits for the user
  task('SHOP-1', 'Checkout: pay with a saved card', {
    type: 'feat', areas: ['checkout', 'payments'], status: 'in_progress', sessionIds: [CHECKOUT], branch: 'feature/saved-cards',
    planPath: '~/.claude/plans/saved-cards.md', createdAt: ago(240),
    description: 'Returning customers pick a card they used before instead of typing it again.',
    criteria: [...criteria(true, 'Card tokens are stored, never card numbers'), ...criteria(false, 'A saved card can be picked at checkout', 'Cards can be removed from the account page')],
  }),
  task('SHOP-2', 'Store card tokens from the payment provider', {
    type: 'feat', areas: ['payments', 'backend'], status: 'done', parentId: 'SHOP-1', sessionIds: [CHECKOUT], createdAt: ago(230), updatedAt: ago(150),
    commits: [commit('4f2a9c1', 'feat(payments): store card tokens from the provider')], criteria: criteria(true, 'No card number reaches the database'),
  }),
  task('SHOP-3', 'Card picker on the checkout page', {
    type: 'feat', areas: ['checkout', 'web'], status: 'in_progress', parentId: 'SHOP-1', sessionIds: [CHECKOUT], createdAt: ago(225), updatedAt: ago(4),
    description: 'A list of saved cards above the card form, the last used one selected.\n\nCommit: feat(checkout): pick a saved card at checkout',
    criteria: [...criteria(true, 'Shows the last four digits and the expiry date'), ...criteria(false, 'Falls back to the new card form')],
  }),
  task('SHOP-4', 'Retry a saved card when 3-D Secure fails?', {
    owner: 'me', ask: 'decision', parentId: 'SHOP-1', sessionIds: [CHECKOUT], createdAt: ago(25), updatedAt: ago(25),
    questions: [{
      id: 'q1', sessionId: CHECKOUT, text: 'When 3-D Secure fails for a saved card, what should checkout do next?',
      options: ['1. Ask for the card details again', '2. Offer the other saved cards', '3. Show an error and stop'],
      multi: false, askedAt: ago(25), answer: null, dismissed: null,
    }],
  }),
  task('SHOP-5', 'End-to-end test: pay with a saved card', { type: 'test', areas: ['checkout'], parentId: 'SHOP-1', deps: ['SHOP-3'], sessionIds: [CHECKOUT], createdAt: ago(220) }),
  task('SHOP-6', 'Remove a saved card from the account page', { type: 'feat', areas: ['account', 'web'], parentId: 'SHOP-1', sessionIds: [CHECKOUT], createdAt: ago(220) }),
  task('SHOP-7', 'Get a sandbox key from the payment provider', { owner: 'me', ask: 'action', parentId: 'SHOP-1', status: 'done', sessionIds: [CHECKOUT], createdAt: ago(235), updatedAt: ago(200) }),
  task('SHOP-8', 'VAT is rounded wrongly on discounted orders', {
    type: 'fix', areas: ['payments'], status: 'deferred', fromId: 'SHOP-3', sessionIds: [CHECKOUT], createdAt: ago(60), updatedAt: ago(60),
    deferReason: { summary: 'Found while testing the card picker; not part of saved cards', detail: '' },
  }),

  // Search filters: the session waits for the user's decision
  task('SHOP-10', 'Search: filter books by language and format', {
    type: 'feat', areas: ['search'], status: 'in_progress', sessionIds: [SEARCH], createdAt: ago(180),
    criteria: criteria(false, 'Filters combine with the search text', 'Results update without a page reload'),
  }),
  task('SHOP-11', 'Index the language and format of each edition', {
    type: 'feat', areas: ['search', 'backend'], status: 'done', parentId: 'SHOP-10', sessionIds: [SEARCH], createdAt: ago(175), updatedAt: ago(120),
    commits: [commit('b81e07d', 'feat(search): index language and format')],
  }),
  task('SHOP-12', 'Filter chips above the results', { type: 'feat', areas: ['search', 'web'], status: 'in_progress', parentId: 'SHOP-10', sessionIds: [SEARCH], createdAt: ago(170), updatedAt: ago(12) }),
  task('SHOP-16', 'Book counts next to the filter values?', {
    owner: 'me', ask: 'decision', parentId: 'SHOP-10', sessionIds: [SEARCH], createdAt: ago(12), updatedAt: ago(12),
    questions: [{
      id: 'q1', sessionId: SEARCH, text: 'Show the number of books next to each filter value?',
      options: ['Yes, always', 'Only on wide screens', 'No'], multi: false, askedAt: ago(12), answer: null, dismissed: null,
    }],
  }),
  task('SHOP-13', 'Search is slow with both filters on', { type: 'perf', areas: ['search', 'backend'], status: 'blocked', parentId: 'SHOP-10', deps: ['SHOP-14'], sessionIds: [SEARCH], createdAt: ago(90) }),
  task('SHOP-14', 'Index on language and format together', { type: 'perf', areas: ['backend'], parentId: 'SHOP-10', sessionIds: [SEARCH], createdAt: ago(85) }),
  task('SHOP-15', 'Keep the chosen filters in the URL', {
    type: 'feat', areas: ['search', 'web'], status: 'done', parentId: 'SHOP-10', sessionIds: [SEARCH], createdAt: ago(160), updatedAt: ago(70),
    commits: [commit('9c3d5e2', 'feat(search): keep filters in the URL')],
  }),

  // Order emails: finished yesterday
  task('SHOP-20', 'Order emails', { type: 'feat', areas: ['emails'], status: 'done', sessionIds: [EMAILS], createdAt: ago(1900), updatedAt: ago(1500) }),
  task('SHOP-21', 'Email the customer when an order ships', {
    type: 'feat', areas: ['emails'], status: 'done', parentId: 'SHOP-20', sessionIds: [EMAILS], createdAt: ago(1890), updatedAt: ago(1700),
    commits: [commit('e4b6a10', 'feat(emails): shipping confirmation')],
  }),
  task('SHOP-22', 'Plain-text version of every email', {
    type: 'feat', areas: ['emails'], status: 'done', parentId: 'SHOP-20', sessionIds: [EMAILS], createdAt: ago(1880), updatedAt: ago(1600),
    commits: [commit('7a1f3c8', 'feat(emails): plain-text parts')],
  }),
  task('SHOP-23', 'Unsubscribe link in marketing emails?', {
    owner: 'me', ask: 'decision', status: 'done', parentId: 'SHOP-20', sessionIds: [EMAILS], createdAt: ago(1870), updatedAt: ago(1650),
    decisions: [{ at: ago(1650), summary: 'yes — one click, no login', detail: 'one click, no login' }],
  }),
  task('SHOP-24', 'Build emails with a third-party editor', { type: 'idea', areas: ['emails'], status: 'dropped', parentId: 'SHOP-20', sessionIds: [EMAILS], createdAt: ago(1860), updatedAt: ago(1550) }),

  // A second project
  task('DOCS-1', 'Search across all pages', { type: 'feat', areas: ['search'], status: 'in_progress', sessionIds: [DOCS], createdAt: ago(400) }),
  task('DOCS-2', 'Fix broken links in the API reference', { type: 'fix', status: 'done', sessionIds: [DOCS], createdAt: ago(420), updatedAt: ago(380), commits: [commit('2d8e4f6', 'fix: broken links in the API reference')] }),
  task('DOCS-3', 'Dark theme for code blocks', { type: 'feat', areas: ['design'], sessionIds: [DOCS], createdAt: ago(410) }),
];

const session = (id: string, projectKey: string, title: string, fields: Partial<Session>): Session => ({
  id, projectKey, title, status: 'idle', startedAt: ago(600), archivedAt: null, runningTaskId: null, waiting: null, note: null,
  compactions: 0, continuedFrom: null, claudeTitle: null, ...fields,
});
const sessions: Session[] = [
  session(CHECKOUT, 'SHOP', 'Saved cards at checkout', { status: 'active', startedAt: ago(245), runningTaskId: 'SHOP-3' }),
  session(SEARCH, 'SHOP', 'Search filters', { status: 'waiting', startedAt: ago(185), waiting: { kind: 'task', taskId: 'SHOP-16', since: ago(12) } }),
  session(EMAILS, 'SHOP', 'Order emails', { status: 'ended', startedAt: ago(1900) }),
  session(DOCS, 'DOCS', 'Docs search', { status: 'idle', startedAt: ago(430) }),
];

// The history, in order; the user's changes come from the map and reached the session
type Draft = Omit<MapEvent, 'id' | 'changeId' | 'delivery'> & { user?: boolean };
const drafts: Draft[] = [];
const log = (minutes: number, sessionId: string, taskId: string, type: MapEvent['type'], text: string, user = false) =>
  drafts.push({ at: ago(minutes), sessionId: user ? null : sessionId, taskId, type, text, actor: user ? 'user' : 'claude', user });
for (const t of tasks) {
  const minutes = (now - Date.parse(t.createdAt)) / 60_000;
  log(minutes, t.sessionIds[0]!, t.id, t.status === 'deferred' ? 'defer' : 'create', t.title);
}
log(205, CHECKOUT, 'SHOP-7', 'done', 'todo → done', true);
log(150, CHECKOUT, 'SHOP-2', 'commit', '4f2a9c1 feat(payments): store card tokens from the provider');
log(150, CHECKOUT, 'SHOP-2', 'done', 'in_progress → done');
log(140, CHECKOUT, 'SHOP-3', 'run', 'running');
log(25, CHECKOUT, 'SHOP-4', 'wait', 'When 3-D Secure fails for a saved card, what should checkout do next?');
log(120, SEARCH, 'SHOP-11', 'commit', 'b81e07d feat(search): index language and format');
log(120, SEARCH, 'SHOP-11', 'done', 'in_progress → done');
log(70, SEARCH, 'SHOP-15', 'commit', '9c3d5e2 feat(search): keep filters in the URL');
log(70, SEARCH, 'SHOP-15', 'done', 'in_progress → done');
log(12, SEARCH, 'SHOP-16', 'wait', 'Show the number of books next to each filter value?');
log(1700, EMAILS, 'SHOP-21', 'done', 'in_progress → done');
log(1650, EMAILS, 'SHOP-23', 'answer', 'decided: yes — one click, no login', true);
log(1600, EMAILS, 'SHOP-22', 'done', 'in_progress → done');
log(1550, EMAILS, 'SHOP-24', 'drop', 'todo → dropped', true);
log(1500, EMAILS, 'SHOP-20', 'done', 'in_progress → done');
log(380, DOCS, 'DOCS-2', 'done', 'in_progress → done');
let change = 0;
const events: MapEvent[] = drafts
  .sort((a, b) => a.at.localeCompare(b.at))
  .map(({ user, ...e }, i) => ({
    ...e, id: i + 1, changeId: user ? ++change : null,
    delivery: user ? { state: 'delivered' as const, sessionIds: [sessionOf(e.taskId)], deliveredTo: [sessionOf(e.taskId)] } : null,
  }));
function sessionOf(taskId: string) { return tasks.find(t => t.id === taskId)!.sessionIds[0]!; }

const snapshot = MapSnapshot.parse({
  projects: [
    { key: 'SHOP', name: 'Bookshop', paths: ['~/dev/bookshop'], focusTaskId: 'SHOP-1', areas: [], repoUrl: 'https://github.com/example/bookshop' },
    { key: 'DOCS', name: 'Docs site', paths: ['~/dev/docs-site'], focusTaskId: null, areas: [], repoUrl: null },
  ],
  tasks, sessions, events,
});

// The dev UI imports its fixture as a module; here it gets this map instead
async function open(page: Page, path: string) {
  await page.route('**/src/fixtures/map.json*', route => route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify(snapshot)};` }));
  await page.goto(`${BASE}${path}`);
  await page.locator('main, .app').first().waitFor();
}

const shots: { name: string; path: string; dark?: boolean; ready: string }[] = [
  { name: 'project', path: '/p/SHOP', ready: 'article.session' },
  { name: 'tree', path: `/s/${CHECKOUT.slice(0, 8)}/tree/SHOP-3`, ready: '.row' },
  { name: 'decision', path: `/s/${CHECKOUT.slice(0, 8)}/tree/SHOP-4`, ready: '.row' },
  { name: 'board', path: `/s/${CHECKOUT.slice(0, 8)}/board`, ready: '.card' },
  { name: 'history', path: `/s/${CHECKOUT.slice(0, 8)}/history`, ready: 'tbody tr' },
  { name: 'tree-dark', path: `/s/${SEARCH.slice(0, 8)}/tree/SHOP-16`, ready: '.row', dark: true },
];

if (!(await fetch(BASE).then(r => r.ok, () => false))) throw new Error(`No dev server at ${BASE}: run pnpm dev first`);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [i, shot] of shots.entries()) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: shot.dark ? 'dark' : 'light' });
  const page = await context.newPage();
  await open(page, shot.path);
  await page.locator(shot.ready).first().waitFor();
  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
  await context.close();
  console.log(`${i + 1}/${shots.length} ${shot.name}.png`);
}
await browser.close();
