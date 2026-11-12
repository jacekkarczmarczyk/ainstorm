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

test('a link asked for by a session opens that session', async ({ page, request }) => {
  const reply = await request.post('/api/open-link', {
    headers: { Authorization: `Bearer ${token()}` }, data: { sessionId: 'ed08d5d7-18da-4b7e-8239-87b2b703b793' },
  });
  await page.goto(((await reply.json()) as { url: string }).url);
  await page.getByRole('button', { name: 'Open the map' }).click();
  // Only open tasks: the status preset "Open" is on
  await expect(page).toHaveURL(`http://127.0.0.1:${DAEMON_PORT}/s/ed08d5d7/tree?status=todo&status=in_progress&status=blocked&status=deferred`);
  await expect(page.getByRole('button', { name: 'Status: Open' })).toBeVisible();
  await expect(page.locator('#row-PRJ-1')).toBeVisible();
});

test('a task added in the UI is saved by the daemon', async ({ page, request }) => {
  await page.goto(await openLink(request));
  await page.getByRole('button', { name: 'Open the map' }).click();
  await page.goto('/s/ed08d5d7/tree');
  const title = `Added in e2e ${Date.now()}`;
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('dialog', { name: 'Add a task' }).getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const titles = async () => ((await (await request.get('/api/snapshot', { headers: { Authorization: `Bearer ${token()}` } }))
    .json()) as { tasks: { title: string; archivedAt: string | null }[] }).tasks.filter(t => t.archivedAt === null).map(t => t.title);
  await expect.poll(titles).toContain(title);
});

test('a backup downloaded in the UI restores the map from a local file', async ({ page, request }) => {
  const password = 'e2e backup password';
  const statusOf = async () => ((await (await request.get('/api/snapshot', { headers: { Authorization: `Bearer ${token()}` } }))
    .json()) as { tasks: { id: string; status: string }[] }).tasks.find(t => t.id === 'PRJ-44')!.status;
  await page.goto(await openLink(request));
  await page.getByRole('button', { name: 'Open the map' }).click();
  await page.goto('/s/ed08d5d7/tree');
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Backup' }).click();

  // Backup: the browser downloads an encrypted .ainbak file
  const backupForm = settings.getByRole('form', { name: 'Back up the map' });
  await backupForm.getByLabel('Password', { exact: true }).fill(password);
  await backupForm.getByLabel('Repeat the password').fill(password);
  const [download] = await Promise.all([page.waitForEvent('download'), backupForm.getByRole('button', { name: 'Download backup' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ainstorm-.+\.ainbak$/);
  const file = await download.path();
  expect(readFileSync(file).subarray(0, 6).toString('ascii')).toBe('AINBAK');

  // A change after the backup
  const before = await statusOf();
  const other = before === 'done' ? 'todo' : 'done';
  await settings.getByRole('button', { name: 'Close' }).click();
  await page.locator('#row-PRJ-44').getByRole('combobox', { name: 'Status of PRJ-44' }).selectOption(other);
  await page.getByRole('dialog', { name: /\?$/ }).locator('.primary-action').click();
  await expect.poll(statusOf).toBe(other);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settings.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Backup' }).click();

  // Restore from the local file: a wrong password changes nothing, the right one brings the map back
  const restoreForm = settings.getByRole('form', { name: 'Restore from a backup' });
  await restoreForm.getByLabel('Backup file (.ainbak)').setInputFiles(file);
  await restoreForm.getByLabel('Password', { exact: true }).fill('wrong password');
  await restoreForm.getByRole('button', { name: 'Restore…' }).click();
  await restoreForm.getByRole('button', { name: 'Replace the map' }).click();
  await expect(restoreForm.getByText('Wrong password or damaged file')).toBeVisible();
  expect(await statusOf()).toBe(other);

  await restoreForm.getByLabel('Password', { exact: true }).fill(password);
  await restoreForm.getByRole('button', { name: 'Restore…' }).click();
  await restoreForm.getByRole('button', { name: 'Replace the map' }).click();
  // Playwright keeps the download under a generated name, so the file name is not checked here
  await expect(restoreForm.getByText(/^Map restored from .+ The map as it was is kept in the ainstorm folder as before-restore-[\dT-]+Z\.db\.$/)).toBeVisible();
  await expect.poll(statusOf).toBe(before);
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
