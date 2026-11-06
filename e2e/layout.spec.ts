import { expect, taskPanel, test } from './fixtures.ts';

// Long session titles and task titles are cut, never widen the details panel into a sideways scroll
test('the details panel does not scroll sideways', async ({ page }) => {
  await page.goto('/s/7b4c4db1/tree/PP-43');
  const panel = taskPanel(page);
  await expect(panel).toBeVisible();
  const { scroll, client } = await panel.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
});

test('only the content of the task panel scrolls; its header and actions stay in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/s/7b4c4db1/tree/PP-43');
  const panel = taskPanel(page);
  const content = panel.locator('.scroll');
  expect(await content.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await content.evaluate(el => el.scrollTo(0, el.scrollHeight / 2));
  // The panel itself never scrolls, so its scrollbar cannot cover the header or the action bar
  expect(await panel.evaluate(el => el.scrollTop)).toBe(0);
  await expect(panel.getByRole('button', { name: 'Copy PP-43' })).toBeInViewport();
  await expect(panel.getByRole('button', { name: 'Edit…' })).toBeInViewport();
});
