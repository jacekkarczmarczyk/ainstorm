import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const SHOP = '/s/ed08d5d7';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

const dialog = (page: Page) => page.getByRole('dialog', { name: /\?$/ });
const toast = (page: Page) => page.locator('.toast').last();
const row = (page: Page, id: string) => page.locator(`#row-${id}`);

// Done is set from the status list of the row (the checkbox selects the task for bulk actions)
const markDone = (page: Page, id: string) => row(page, id).getByRole('combobox', { name: `Status of ${id}` }).selectOption('done');

test('marking a task done asks for confirmation, applies it and can be undone', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await markDone(page, 'PRJ-44');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('pre')).toContainText('[ainstorm #');
  await dialog(page).getByRole('button', { name: /Mark as Done/ }).click();
  await expect(row(page, 'PRJ-44').locator('.title')).toHaveClass(/t-done/);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'PRJ-44').locator('.title')).not.toHaveClass(/t-done/);
});

test('an action without confirmation applies at once and offers "Always ask"', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Status changes').uncheck();
  await page.keyboard.press('Escape');
  await markDone(page, 'PRJ-44');
  await expect(row(page, 'PRJ-44').locator('.title')).toHaveClass(/t-done/);
  await expect(dialog(page)).toBeHidden();
  await toast(page).getByRole('button', { name: 'Always ask' }).click();
  await markDone(page, 'PRJ-45');
  await expect(dialog(page)).toBeVisible();
});

test('"Don’t ask again" in the dialog turns confirmation off for that action', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await markDone(page, 'PRJ-44');
  await dialog(page).getByLabel('Don’t ask again for this action').check();
  await dialog(page).getByRole('button', { name: /Mark as Done/ }).click();
  await markDone(page, 'PRJ-45');
  await expect(row(page, 'PRJ-45').locator('.title')).toHaveClass(/t-done/);
  await expect(dialog(page)).toBeHidden();
});

test('ticked tasks get bulk actions: one dialog and one Undo for all, Run in the order ticked', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  const bar = page.getByRole('region', { name: 'Selected tasks' });
  await expect(bar).toHaveCount(0);
  await row(page, 'PRJ-45').getByRole('checkbox', { name: 'Select PRJ-45' }).check();
  await row(page, 'PRJ-44').getByRole('checkbox', { name: 'Select PRJ-44' }).check();
  await expect(bar.getByText('2 selected')).toBeVisible();
  // Ticking selects only: the tasks stay open
  await expect(row(page, 'PRJ-44').locator('.title')).not.toHaveClass(/t-done/);

  await bar.getByRole('button', { name: 'Drop' }).click();
  await expect(dialog(page).locator('.tasks li')).toHaveCount(2);
  await expect(dialog(page).locator('pre').first()).toContainText('PRJ-45');
  await dialog(page).getByRole('button', { name: 'Drop', exact: true }).click();
  await expect(row(page, 'PRJ-44').locator('.title')).toHaveClass(/t-dropped/);
  await expect(row(page, 'PRJ-45').locator('.title')).toHaveClass(/t-dropped/);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'PRJ-44').locator('.title')).not.toHaveClass(/t-dropped/);
  await expect(row(page, 'PRJ-45').locator('.title')).not.toHaveClass(/t-dropped/);

  // Run: one prompt for the ticked tasks in the order they were ticked; unticking takes a task out
  await row(page, 'PRJ-23').getByRole('checkbox', { name: 'Select PRJ-23' }).check();
  await row(page, 'PRJ-44').getByRole('checkbox', { name: 'Select PRJ-44' }).uncheck();
  await bar.getByRole('button', { name: 'Run (2)' }).click();
  await expect(dialog(page).getByText(/not sent automatically/)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Copy and record' }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toMatch(/^\[ainstorm #\d+ · session ed08d5d7 · shop\]\r?\nStart working on these tasks in order:\r?\n1\. PRJ-45 .*\r?\n2\. PRJ-23 /);
  await expect(bar).toHaveCount(0);
  // Sent: the tasks say they wait in the session's queue, and how many open tasks come first
  await expect(row(page, 'PRJ-45').getByText('Queued in session · next')).toBeVisible();
  await expect(row(page, 'PRJ-23').getByText('Queued in session · 1 ahead')).toBeVisible();
  await expect(row(page, 'PRJ-44').getByText(/Queued in session/)).toHaveCount(0);
});

test('deleting without automatic notification requires copying the prompt', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  await page.getByRole('button', { name: 'Delete…' }).click();
  await dialog(page).getByLabel('Notify session automatically').uncheck();
  const confirm = dialog(page).getByRole('button', { name: 'Delete', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Copy prompt' }).click();
  await expect(confirm).toBeEnabled();
  // Copied is not done: the dialog says the change still has to be confirmed
  await expect(dialog(page).getByText(/the change is not saved yet: click “Delete”/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\[ainstorm #\d+ · session ed08d5d7 · shop\]/);
  await confirm.click();
  await expect(row(page, 'PRJ-45')).toHaveCount(0);
});

test('answering a question closes the decision', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-30`);
  await page.getByLabel('Create a separate task for later').check();
  await page.getByRole('button', { name: 'Send answer' }).click();
  await dialog(page).getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('Your answer:')).toBeVisible();
  await expect(row(page, 'PRJ-30').locator('.title')).toHaveClass(/t-done/);
});

test('"Still relevant?" sends a recheck prompt and leaves the question open', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-30`);
  await page.getByRole('button', { name: 'Still relevant?' }).click();
  await expect(dialog(page).locator('pre')).toContainText('still applies');
  await dialog(page).getByRole('button', { name: 'Still relevant?' }).click();
  await expect(toast(page)).toContainText('recheck');
  await expect(page.getByRole('button', { name: 'Send answer' })).toBeVisible();
});

// Headless Chromium reports notifications as blocked, so the browser's answer is stubbed
const stubNotifications = (page: Page, answer: 'granted' | 'denied') => page.addInitScript(a => {
  let permission = 'default';
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: Object.assign(function Notification() {}, {
      get permission() { return permission; },
      requestPermission: async () => { permission = a; return a; },
    }),
  });
}, answer);

test('notifications are an option in the settings, off until turned on', async ({ page }) => {
  await stubNotifications(page, 'granted');
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: 'Open settings' }).click();
  const box = page.getByRole('dialog', { name: 'Settings' }).getByLabel('Notify me when a session waits on me');
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(box).toBeChecked();
  await box.click();
  await expect(box).not.toBeChecked();
});

test('notifications stay off when the browser blocks them, and say why', async ({ page }) => {
  await stubNotifications(page, 'denied');
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Notify me when a session waits on me').click();
  await expect(settings.getByLabel('Notify me when a session waits on me')).not.toBeChecked();
  await expect(settings.getByText(/Notifications are blocked for this page/)).toBeVisible();
});

test('prompts follow the prompt language from the settings', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Prompt language').selectOption('pl');
  await settings.getByRole('button', { name: 'Close' }).click();
  await row(page, 'PRJ-44').getByRole('button', { name: 'Run PRJ-44 in a Claude session' }).click();
  await expect(dialog(page).locator('pre')).toContainText('Zacznij pracę nad PRJ-44');
});

test('▶ in a row runs the task at once', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await row(page, 'PRJ-44').getByRole('button', { name: 'Run PRJ-44 in a Claude session' }).click();
  await dialog(page).getByRole('button', { name: 'Copy and record' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\[ainstorm #\d+ · session ed08d5d7 · shop\]\r?\nStart working on PRJ-44/);
});

test('Run says the prompt must be pasted, and copies it on confirm', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  const panel = page.getByRole('complementary', { name: 'Task details' });
  await panel.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(dialog(page).getByText(/not sent automatically/)).toBeVisible();
  await expect(dialog(page).getByText(/records only that you asked/)).toBeVisible();
  await expect(dialog(page).getByLabel('Notify session automatically')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Copy and record' }).click();
  await expect(dialog(page)).toBeHidden();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\[ainstorm #\d+ · session ed08d5d7 · shop\]\r?\nStart working on PRJ-45/);
});

test('the commit message is edited in the panel and in the run dialog, as one line or several', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  const panel = page.getByRole('complementary', { name: 'Task details' });
  const editor = page.getByRole('dialog', { name: 'Change the commit message of PRJ-45' });
  const field = editor.getByRole('textbox', { name: 'Commit message' });
  const save = editor.getByRole('button', { name: 'Save', exact: true });
  await expect(panel.getByText('None yet')).toBeVisible();
  await panel.getByRole('button', { name: 'Edit commit message' }).click();
  await expect(save).toBeDisabled();
  await field.fill('fix(web): old');
  await editor.getByRole('button', { name: 'Back to the saved version' }).click();
  await expect(field).toHaveValue('');
  await field.fill('fix(web): new');
  await field.press('Enter');
  await expect(editor).toBeHidden();
  await expect(page.getByText('Commit message of PRJ-45 saved')).toBeVisible();
  await expect(panel.locator('.commit .msg')).toHaveText('fix(web): new');
  // Several lines: subject and body; one line again only once the body is gone
  await panel.getByRole('button', { name: 'Edit commit message' }).click();
  await editor.getByRole('button', { name: 'Edit as several lines (subject and body)' }).click();
  await field.fill('fix(web): new\n\nBody');
  await expect(editor.getByRole('button', { name: 'Edit as one line' })).toBeDisabled();
  await save.click();
  await expect(panel.locator('.commit .msg')).toHaveText('fix(web): new\n\nBody');

  // In the run dialog: the editor opens over it, and the run dialog stays open after saving
  await panel.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(dialog(page).locator('.commits .msg')).toHaveText('fix(web): new\n\nBody');
  await dialog(page).getByRole('button', { name: 'Edit commit message' }).click();
  await field.fill('feat(web): from the dialog');
  await save.click();
  await expect(editor).toBeHidden();
  await expect(dialog(page).locator('.commits .msg')).toHaveText('feat(web): from the dialog');
  await expect(dialog(page)).toBeVisible();
});

test('#1234 links to the project\'s GitHub issue; Create issue sends Claude a request', async ({ page }) => {
  await page.goto('/s/7b4c4db1/tree/PP-42');
  const panel = page.getByRole('complementary', { name: 'Task details' });
  const link = panel.getByRole('heading', { level: 2 }).getByRole('link', { name: '#3812' });
  await expect(link).toHaveAttribute('href', 'https://github.com/example/bookkeeping/issues/3812');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

  await page.goto(`${SHOP}/tree/PRJ-45`);
  await panel.getByRole('button', { name: 'Create issue' }).click();
  await expect(dialog(page).locator('pre')).toContainText('Create a GitHub issue in https://github.com/example/shop for PRJ-45');
  await dialog(page).getByRole('button', { name: 'Create issue' }).click();
  await expect(toast(page)).toContainText('Sent to Claude: issue of PRJ-45');
});

test('a decision of the user\'s hands the task to Claude, who can then run it', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-52`);
  await page.getByPlaceholder('Note for Claude (optional)…').fill('remove them');
  await page.getByRole('button', { name: 'Yes, hand to Claude' }).click();
  await expect(dialog(page).locator('pre')).toContainText('Decision on PRJ-52');
  await expect(dialog(page).locator('pre')).toContainText('Notes: remove them');
  await dialog(page).getByRole('button', { name: 'Yes, hand to Claude' }).click();
  await expect(page.getByRole('button', { name: 'Yes, hand to Claude' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Task details' }).getByRole('button', { name: 'Run', exact: true })).toBeVisible();
});

test('a decision of no drops the task', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-52`);
  await page.getByRole('button', { name: 'No, drop it' }).click();
  await dialog(page).getByRole('button', { name: 'No, drop it' }).click();
  await expect(row(page, 'PRJ-52').locator('.title')).toHaveClass(/t-dropped/);
});

test('a task moves under another parent, never under its own subtask', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-1`);
  await page.getByRole('button', { name: 'Move…' }).click();
  const picker = page.getByRole('dialog', { name: 'Move PRJ-1 under…' });
  await picker.getByRole('searchbox').fill('PRJ-45');
  await expect(picker.getByText('No task matches.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();

  await page.goto(`${SHOP}/tree/PRJ-45`);
  await page.getByRole('button', { name: 'Move…' }).click();
  await page.getByRole('dialog', { name: 'Move PRJ-45 under…' }).getByRole('button', { name: 'Top level of the session' }).click();
  await dialog(page).getByRole('button', { name: 'Move', exact: true }).click();
  await expect(row(page, 'PRJ-45')).toHaveClass(/\broot\b/);
});

test('the details panel shows only with a task selected', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await expect(page.getByRole('complementary', { name: 'Task details' })).toHaveCount(0);
  await row(page, 'PRJ-44').locator('.title').click();
  await expect(page.getByRole('complementary', { name: 'Task details' })).toBeVisible();
});

test('releasing the mouse over the backdrop does not close the dialog', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await markDone(page, 'PRJ-44');
  const box = (await dialog(page).boundingBox())!;
  // Pressed in the content (not the title bar, which would drag the dialog over the release point)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(dialog(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog(page)).toBeHidden();
});

test('status filter hides done tasks; dropdown search is focused', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: /^Status/ }).click();
  await expect(page.getByPlaceholder('Find…')).toBeFocused();
  await page.getByPlaceholder('Find…').fill('done');
  const done = page.locator('.pop .row').first();
  await done.click();
  await done.click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Status: not Done' })).toBeVisible();
  await expect(row(page, 'PRJ-2')).toHaveCount(0);
});

test('filters live in the URL and survive a reload', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByLabel('Search tasks').fill('Inventory: refactor');
  await expect(page).toHaveURL(/status=!done&status=!dropped/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Search tasks')).toHaveValue('Inventory: refactor');
  await expect(row(page, 'PRJ-45')).toBeVisible();
  await expect(row(page, 'PRJ-2')).toHaveCount(0);
});

test('the panel lists only other sessions of the task', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  const panel = page.getByRole('complementary', { name: 'Task details' });
  await expect(panel.getByRole('heading', { level: 2, name: 'Inventory: refactoring' })).toBeVisible();
  await expect(panel.getByText('Also in other sessions')).toHaveCount(0);
  await expect(panel.getByText('Claude sessions')).toHaveCount(0);
});

test('top-level titles are bold, but not while a filter is on', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await expect(row(page, 'PRJ-1').locator('.title')).toHaveCSS('font-weight', '600');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(row(page, 'PRJ-1').locator('.title')).toHaveCSS('font-weight', '400');
});

test('quick filter "Open" hides done and dropped tasks and toggles off', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  const open = page.getByRole('button', { name: 'Open', exact: true });
  await open.click();
  await expect(open).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 'PRJ-2')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Status: 2 rules/ })).toBeVisible();
  await open.click();
  await expect(open).toHaveAttribute('aria-pressed', 'false');
  await expect(row(page, 'PRJ-2')).toBeVisible();
});

test('board jumps to the task in the tree', async ({ page }) => {
  await page.goto(`${SHOP}/board`);
  const card = page.locator('.card').filter({ has: page.locator('.tid', { hasText: /^PRJ-33$/ }) });
  await card.getByRole('button', { name: 'Show in tree' }).click();
  await expect(page).toHaveURL(new RegExp(`${SHOP}/tree/PRJ-33$`));
  await expect(row(page, 'PRJ-33')).toBeVisible();
});

test('focus belongs to the project and shows where it lives', async ({ page }) => {
  await page.goto(`${SHOP}/focus`);
  await expect(page.getByRole('heading', { level: 2, name: /Discounts: schema migration/ })).toBeVisible();
  await page.goto('/s/7b4c4db1/focus');
  await expect(page.getByRole('heading', { level: 2, name: /Permissions: result caching/ })).toBeVisible();
  await page.goto('/s/b6a48e5f/focus');
  await expect(page.getByText(/belongs to another session/)).toBeVisible();
});

test('the resume command goes to the project folder and uses the plugin folder from the settings', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Plugin folder (until the plugin is installed)').fill('C:\\Dev\\ainstorm\\plugin');
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();
  await page.getByRole('button', { name: 'Copy resume command' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText()))
    .toBe('cd ~/dev/shop && claude --resume ed08d5d7-18da-4b7e-8239-87b2b703b793 --plugin-dir C:/Dev/ainstorm/plugin');
});

test('the Focus tab is a link where the focus is in the session, disabled elsewhere', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Views' });
  await page.goto(`${SHOP}/tree`);
  await expect(nav.getByRole('link', { name: 'Focus' })).toBeVisible();
  await page.goto('/s/b6a48e5f/tree');
  await expect(nav.getByRole('link', { name: 'Focus' })).toHaveCount(0);
  await expect(nav.getByText('Focus')).toHaveAttribute('aria-disabled', 'true');
  await expect(nav.getByText('Focus')).toHaveAttribute('title', /another session/);
});

test('the project focus can be cleared after confirming, and undone', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-17`);
  await page.getByRole('button', { name: 'Clear project focus' }).click();
  const confirm = page.getByRole('dialog', { name: 'Clear the project focus?' });
  await confirm.getByRole('button', { name: 'Clear project focus' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('button', { name: 'Set as project focus' })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Clear project focus' })).toBeVisible();
});

test('the header picks the project and the session, with search', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Project:/ }).click();
  await page.getByPlaceholder('Find a project…').fill('book');
  await page.getByRole('option', { name: /bookkeeping/ }).click();
  await expect(page).toHaveURL(/\/p\/PP$/);

  // Keyboard: search by session id, Enter picks the highlighted one
  await page.getByRole('button', { name: /^Session:/ }).click();
  await expect(page.getByPlaceholder('Find a session by title or id…')).toBeFocused();
  await page.keyboard.type('7b4c4db1');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/s\/7b4c4db1\/tree$/);

  await page.getByRole('button', { name: /^Session:/ }).click();
  await page.getByRole('option', { name: 'Project overview' }).click();
  await expect(page).toHaveURL(/\/p\/PP$/);
});
