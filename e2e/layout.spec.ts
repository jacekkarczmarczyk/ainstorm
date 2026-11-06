import { expect, taskPanel, test } from './fixtures.ts';

// Long session titles and task titles are cut, never widen the details panel into a sideways scroll
test('the details panel does not scroll sideways', async ({ page }) => {
  await page.goto('/s/7b4c4db1/tree/PP-43');
  const panel = taskPanel(page);
  await expect(panel).toBeVisible();
  const { scroll, client } = await panel.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
});

test('the task header and its actions stay in view while the panel scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/s/7b4c4db1/tree/PP-43');
  const panel = taskPanel(page);
  await panel.evaluate(el => el.scrollTo(0, el.scrollHeight / 2));
  await expect(panel.getByRole('button', { name: 'Copy PP-43' })).toBeInViewport();
  await expect(panel.getByRole('button', { name: 'Delete…' })).toBeInViewport();
});
