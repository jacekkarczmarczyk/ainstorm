import { expect, row, test } from './fixtures.ts';

const SHOP = '/s/ed08d5d7';

test.beforeEach(async ({ page }) => {
  // Every test starts from a clean local state (theme, panel width, confirm settings)
  await page.addInitScript(() => localStorage.clear());
});

test('start page shows all projects and what waits on the user anywhere', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'All projects' })).toBeVisible();
  await expect(page.locator('article.project')).toHaveCount(2);
  // Both bookkeeping sessions wait on the user
  await expect(page.locator('article.session')).toHaveCount(2);
  // Tasks for you are counted per project card, not in the header (one click could not show them all)
  const header = page.getByRole('banner');
  await expect(header.getByRole('button', { name: /tasks? for you/ })).toHaveCount(0);
  await expect(page.locator('article.project', { hasText: 'shop' }).getByText('6 tasks for you')).toBeVisible();
  await page.goto('/p/PRJ');
  await expect(header.getByRole('button', { name: '6 tasks for you' })).toBeVisible();
  await page.goto('/');
  await page.locator('article.project', { hasText: 'shop' }).locator('h3').click();
  await expect(page).toHaveURL(/\/p\/PRJ$/);
});

test('the project overview lists its session cards', async ({ page }) => {
  await page.goto('/p/PRJ');
  await expect(page.locator('article.session')).toHaveCount(1);
  await page.locator('article.session', { hasText: 'Cart and payments rework' }).locator('h2').click();
  // Only open tasks: the "Open" quick filter is on
  await expect(page).toHaveURL(new RegExp(`${SHOP}/tree\\?status=todo&status=in_progress&status=blocked&status=deferred$`));
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 'PRJ-1')).toBeVisible();
  await expect(row(page, 'PRJ-2')).toHaveCount(0);
});

test('a link to a task opens it in its session', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-26`);
  await expect(page.getByRole('heading', { level: 2, name: 'Shipping: performance fix' })).toBeVisible();
});

test('every session view renders', async ({ page }) => {
  for (const view of ['tree', 'board', 'focus', 'history']) {
    await page.goto(`${SHOP}/${view}`);
    await expect(page.locator('main .workspace')).toBeVisible();
  }
});

test('an unknown session shows a way back', async ({ page }) => {
  await page.goto('/s/00000000/tree');
  await expect(page.getByText('This session does not exist')).toBeVisible();
});
