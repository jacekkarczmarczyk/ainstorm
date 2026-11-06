import { test as base, expect } from '@playwright/test';

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
