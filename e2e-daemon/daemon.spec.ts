import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DAEMON_HOME, DAEMON_PORT } from '../playwright.daemon.config.ts';

// The test reads the token of its own throwaway daemon, as the plugin does; it is never printed
const token = () => (JSON.parse(readFileSync(join(DAEMON_HOME, 'config.json'), 'utf8')) as { token: string }).token;

async function openLink(request: APIRequestContext): Promise<string> {
  const reply = await request.post('/api/open-link', { headers: { Authorization: `Bearer ${token()}` } });
  expect(reply.status()).toBe(200);
  return ((await reply.json()) as { url: string }).url;
}

test('without a one-time link the UI asks to open the map from Claude Code', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Open the map from Claude Code' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy /ainstorm:open' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/ainstorm:open');
});

test('a one-time link logs the browser in once; changes go through the daemon', async ({ page, request }) => {
  const external: string[] = [];
  page.on('request', r => { if (!r.url().startsWith(`http://127.0.0.1:${DAEMON_PORT}`)) external.push(r.url()); });

  const url = await openLink(request);
  // A prefetch of the link (here: a plain GET) must not use the code
  expect((await request.get(url)).status()).toBe(200);
  await page.goto(url);
  await page.getByRole('button', { name: 'Open the map' }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:${DAEMON_PORT}/`);
  await expect(page.getByRole('heading', { level: 1, name: 'All projects' })).toBeVisible();

  // The same link does not work twice
  const again = await request.get(url);
  expect(again.status()).toBe(403);

  // A change made in the UI is saved by the daemon. The test database outlives runs, so the task may already
  // be done: the status list sets the other one, and the daemon must end up with it.
  const statusOf = async () => ((await (await request.get('/api/snapshot', { headers: { Authorization: `Bearer ${token()}` } }))
    .json()) as { tasks: { id: string; status: string }[] }).tasks.find(t => t.id === 'PRJ-44')!.status;
  const before = await statusOf();
  await page.goto('/s/ed08d5d7/tree');
  await page.locator('#row-PRJ-44').getByRole('combobox', { name: 'Status of PRJ-44' }).selectOption(before === 'done' ? 'todo' : 'done');
  await page.getByRole('dialog', { name: /\?$/ }).locator('.primary-action').click();
  await expect.poll(statusOf).toBe(before === 'done' ? 'todo' : 'done');

  expect(external).toEqual([]);
});

test('a browser that loses its sign-in sees the sign-in screen instead of a stale map', async ({ page, request, context }) => {
  await page.goto(await openLink(request));
  await page.getByRole('button', { name: 'Open the map' }).click();
  await page.goto('/s/ed08d5d7/tree');
  await expect(page.locator('#row-PRJ-44')).toBeVisible();
  // The cookie is the UI's only credential; without it the next change is refused
  await context.clearCookies();
  await page.locator('#row-PRJ-44').getByRole('combobox', { name: 'Status of PRJ-44' }).selectOption('blocked');
  await expect(page.getByRole('heading', { name: 'Open the map from Claude Code' })).toBeVisible();
  await expect(page.locator('#row-PRJ-44')).toHaveCount(0);
});
