import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every test fails on console errors, page errors and requests to anything but the local UI:
 * the app must work offline and never talk to the network.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [async ({ page }, use) => {
    const problems: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console.${msg.type()}: ${msg.text()}`); });
    page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
    await page.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => {
      problems.push(`external request: ${route.request().url()}`);
      return route.abort();
    });
    await use(problems);
    expect(problems).toEqual([]);
  }, { auto: true }],
});

export { expect };

// Places the tests look at again and again
export const row = (page: Page, id: string) => page.locator(`#row-${id}`);
export const rowTitle = (page: Page, id: string) => row(page, id).locator('.title');
export const taskPanel = (page: Page) => page.getByRole('complementary', { name: 'Task details' });
export const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
export const clipboardText = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Start of a copied prompt for the session ed08d5d7 of the shop fixture; the line after it follows in `rest` */
export const shopPrompt = (rest = '') => new RegExp(String.raw`^\[ainstorm #\d+ · session ed08d5d7 · shop\]` + (rest ? String.raw`\r?\n` + rest : ''));
