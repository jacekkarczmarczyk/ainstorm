import type { Page } from '@playwright/test';
import { clipboardText, expect, row, rowTitle, settingsDialog, shopPrompt, taskPanel, test } from './fixtures.ts';

const SHOP = '/s/ed08d5d7';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

const dialog = (page: Page) => page.getByRole('dialog', { name: /\?$/ });
const toast = (page: Page) => page.locator('.toast').last();
const openSettings = async (page: Page, section: string) => {
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: section }).click();
};

// Move, Drop and Delete sit in the menu of the panel's Edit button
const panelMenu = async (page: Page, item: string) => {
  await taskPanel(page).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

// Done is set from the status list of the row (the checkbox selects the task for bulk actions)
const markDone = (page: Page, id: string) => row(page, id).getByRole('combobox', { name: `Status of ${id}` }).selectOption('done');

test('marking a task done asks for confirmation, applies it and can be undone', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await markDone(page, 'PRJ-44');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('pre')).toContainText('[ainstorm #');
  await dialog(page).getByRole('button', { name: /Mark as Done/ }).click();
  await expect(rowTitle(page, 'PRJ-44')).toHaveClass(/t-done/);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(rowTitle(page, 'PRJ-44')).not.toHaveClass(/t-done/);
});

test('an action without confirmation applies at once and offers "Always ask"', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await openSettings(page, 'Confirm in a dialog');
  await page.getByLabel('Status changes').uncheck();
  await page.keyboard.press('Escape');
  await markDone(page, 'PRJ-44');
  await expect(rowTitle(page, 'PRJ-44')).toHaveClass(/t-done/);
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
  await expect(rowTitle(page, 'PRJ-45')).toHaveClass(/t-done/);
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
  await expect(rowTitle(page, 'PRJ-44')).not.toHaveClass(/t-done/);

  await bar.getByRole('button', { name: 'Drop' }).click();
  await expect(dialog(page).locator('.tasks li')).toHaveCount(2);
  await expect(dialog(page).locator('pre').first()).toContainText('PRJ-45');
  await dialog(page).getByRole('button', { name: 'Drop', exact: true }).click();
  await expect(rowTitle(page, 'PRJ-44')).toHaveClass(/t-dropped/);
  await expect(rowTitle(page, 'PRJ-45')).toHaveClass(/t-dropped/);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(rowTitle(page, 'PRJ-44')).not.toHaveClass(/t-dropped/);
  await expect(rowTitle(page, 'PRJ-45')).not.toHaveClass(/t-dropped/);

  // Type for all ticked tasks: one dialog, one change
  await bar.getByLabel('Type…').selectOption('docs');
  await dialog(page).getByRole('button', { name: 'Set type' }).click();
  await expect(row(page, 'PRJ-44').locator('.lead')).toContainText('docs');
  await expect(row(page, 'PRJ-45').locator('.lead')).toContainText('docs');

  // Run: one prompt for the ticked tasks in the order they were ticked; unticking takes a task out
  await row(page, 'PRJ-23').getByRole('checkbox', { name: 'Select PRJ-23' }).check();
  await row(page, 'PRJ-44').getByRole('checkbox', { name: 'Select PRJ-44' }).uncheck();
  await bar.getByRole('button', { name: 'Run (2)' }).click();
  await expect(dialog(page).getByText(/not sent automatically/)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Copy and record' }).click();
  const prompt = await clipboardText(page);
  expect(prompt).toMatch(shopPrompt(String.raw`Start working on these tasks in order:\r?\n1\. PRJ-45 .*\r?\n2\. PRJ-23 `));
  await expect(bar).toHaveCount(0);
  // Sent: the tasks say they wait in the session's queue, and how many open tasks come first
  await expect(row(page, 'PRJ-45').getByText('Queued in session · next')).toBeVisible();
  await expect(row(page, 'PRJ-23').getByText('Queued in session · 1 ahead')).toBeVisible();
  await expect(row(page, 'PRJ-44').getByText(/Queued in session/)).toHaveCount(0);
});

test('deleting without automatic notification requires copying the prompt', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  await panelMenu(page, 'Delete…');
  await dialog(page).getByLabel('Notify session automatically').uncheck();
  const confirm = dialog(page).getByRole('button', { name: 'Delete', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Copy prompt' }).click();
  await expect(confirm).toBeEnabled();
  // Copied is not done: the dialog says the change still has to be confirmed
  await expect(dialog(page).getByText(/the change is not saved yet: click “Delete”/)).toBeVisible();
  expect(await clipboardText(page)).toMatch(shopPrompt());
  await confirm.click();
  await expect(row(page, 'PRJ-45')).toHaveCount(0);
});

test('answering a question closes the decision', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-30`);
  await page.getByLabel('Create a separate task for later').check();
  await page.getByRole('button', { name: 'Send answer' }).click();
  await dialog(page).getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('Your answer:')).toBeVisible();
  await expect(rowTitle(page, 'PRJ-30')).toHaveClass(/t-done/);
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

test('settings show one section at a time and keep their size', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = settingsDialog(page);
  const sections = settings.getByRole('navigation', { name: 'Settings sections' });
  await expect(sections.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-current', 'page');
  await expect(settings.getByLabel('Status changes')).toHaveCount(0);
  const before = (await settings.boundingBox())!.height;
  await sections.getByRole('button', { name: 'Confirm in a dialog' }).click();
  await expect(settings.getByLabel('Status changes')).toBeVisible();
  expect((await settings.boundingBox())!.height).toBe(before);
});

test('notifications are an option in the settings, off until turned on', async ({ page }) => {
  await stubNotifications(page, 'granted');
  await page.goto(`${SHOP}/tree`);
  await openSettings(page, 'Notifications');
  const box = settingsDialog(page).getByLabel('Notify me when a session waits on me');
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(box).toBeChecked();
  await box.click();
  await expect(box).not.toBeChecked();
});

test('notifications stay off when the browser blocks them, and say why', async ({ page }) => {
  await stubNotifications(page, 'denied');
  await page.goto(`${SHOP}/tree`);
  await openSettings(page, 'Notifications');
  const settings = settingsDialog(page);
  await settings.getByLabel('Notify me when a session waits on me').click();
  await expect(settings.getByLabel('Notify me when a session waits on me')).not.toBeChecked();
  await expect(settings.getByText(/Notifications are blocked for this page/)).toBeVisible();
});

test('a session waiting on the user pulses a few times when the wait appears, unless the system asks for reduced motion', async ({ page }) => {
  await page.goto('/s/7b4c4db1/tree');
  const box = page.locator('.waiting-box').first();
  await expect(box).toBeVisible();
  // Scoped styles add a hash to the keyframes name
  expect(await box.evaluate(el => getComputedStyle(el).animationName)).toContain('wait-pulse');
  // A few pulses, not an endless one
  expect(await box.evaluate(el => getComputedStyle(el).animationIterationCount)).toBe('3');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await box.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

test('prompts follow the prompt language from the settings', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await openSettings(page, 'Claude sessions');
  const settings = settingsDialog(page);
  await settings.getByLabel('Prompt language').selectOption('pl');
  await settings.getByRole('button', { name: 'Close' }).click();
  await row(page, 'PRJ-44').getByRole('button', { name: 'Run PRJ-44 in a Claude session' }).click();
  await expect(dialog(page).locator('pre')).toContainText('Zacznij pracę nad PRJ-44');
});

test('▶ in a row runs the task at once', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await row(page, 'PRJ-44').getByRole('button', { name: 'Run PRJ-44 in a Claude session' }).click();
  await dialog(page).getByRole('button', { name: 'Copy and record' }).click();
  expect(await clipboardText(page)).toMatch(shopPrompt('Start working on PRJ-44'));
});

test('Run prompts sent one after another queue up in the session, in the order sent', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  for (const id of ['PRJ-44', 'PRJ-45']) {
    await row(page, id).getByRole('button', { name: `Run ${id} in a Claude session` }).click();
    await dialog(page).getByRole('button', { name: 'Copy and record' }).click();
    await expect(dialog(page)).toBeHidden();
  }
  await expect(row(page, 'PRJ-44').getByText('Queued in session · next')).toBeVisible();
  await expect(row(page, 'PRJ-45').getByText('Queued in session · 1 ahead')).toBeVisible();
  // The session header says how many are queued and which is next; a click lists them in order
  const queue = page.getByRole('button', { name: /2 queued · next:/ });
  await expect(queue).toContainText('PRJ-44');
  await queue.click();
  await expect(page.locator('.queue .list li')).toHaveText([/PRJ-44/, /PRJ-45/]);
});

test('a subtask is added from the panel, and Undo takes it away', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  await taskPanel(page).getByRole('button', { name: 'Add subtask' }).click();
  const form = page.getByRole('dialog', { name: 'Add a subtask under PRJ-45' });
  await form.getByLabel('Title').fill('Inventory: check stock levels');
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(row(page, 'PRJ-53')).toContainText('Inventory: check stock levels');
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'PRJ-53')).toHaveCount(0);
});

test('"Add and run" adds a task and copies the prompt that starts it', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('dialog', { name: 'Add a task' }).getByLabel('Title').fill('New top task');
  await page.getByRole('button', { name: 'Add and run' }).click();
  await expect(dialog(page).getByLabel('Notify session automatically')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Copy and record' }).click();
  expect(await clipboardText(page)).toMatch(shopPrompt('In the ainstorm map I added PRJ-53 “New top task” to the top level. Start working on it'));
  await expect(row(page, 'PRJ-53')).toBeVisible();
});

test('the Edit button changes title and criteria; the other actions are in its menu', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  const panel = taskPanel(page);
  await panel.getByRole('button', { name: 'Edit…' }).click();
  const form = page.getByRole('dialog', { name: 'Edit PRJ-45' });
  await form.getByLabel('Title').fill('Inventory: refactoring, part 1');
  await form.getByRole('button', { name: 'Add a criterion' }).click();
  await form.getByLabel('Criterion 1', { exact: true }).fill('tests pass');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Inventory: refactoring, part 1');
  await expect(panel.getByText('Next: tests pass')).toBeVisible();
  // The menu behind the arrow: Esc closes it
  await panel.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Move…', 'Drop…', 'Delete…']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('Run says the prompt must be pasted, and copies it on confirm', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  const panel = taskPanel(page);
  await panel.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(dialog(page).getByText(/not sent automatically/)).toBeVisible();
  await expect(dialog(page).getByText(/records only that you asked/)).toBeVisible();
  await expect(dialog(page).getByLabel('Notify session automatically')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Copy and record' }).click();
  await expect(dialog(page)).toBeHidden();
  expect(await clipboardText(page)).toMatch(shopPrompt('Start working on PRJ-45'));
});

test('the commit message is edited in the panel and in the run dialog, as one line or several', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  const panel = taskPanel(page);
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
  const panel = taskPanel(page);
  const link = panel.getByRole('heading', { level: 2 }).getByRole('link', { name: '#3812' });
  await expect(link).toHaveAttribute('href', 'https://github.com/example/bookkeeping/issues/3812');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

  await page.goto(`${SHOP}/tree/PRJ-45`);
  await panel.getByRole('button', { name: 'Create issue' }).click();
  await expect(dialog(page).locator('pre')).toContainText('Create a GitHub issue in https://github.com/example/shop for PRJ-45');
  await dialog(page).getByRole('button', { name: 'Create issue' }).click();
  await expect(toast(page)).toContainText('Sent to Claude: issue of PRJ-45');
});

test('a decision of the user\'s closes the task and is recorded in it', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-52`);
  const panel = taskPanel(page);
  await page.getByPlaceholder('Your answer, or a note to Yes / No…').fill('remove them');
  await panel.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(dialog(page).locator('pre')).toContainText('My decision on PRJ-52');
  await expect(dialog(page).locator('pre')).toContainText('Act on it');
  await expect(dialog(page).locator('pre')).toContainText('Notes: remove them');
  await dialog(page).getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0);
  await expect(rowTitle(page, 'PRJ-52')).toHaveClass(/t-done/);
  await expect(panel.getByText('Latest: yes — remove them')).toBeVisible();
});

test('an action of the user\'s is marked done from the panel, and can be undone', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-51`);
  const panel = taskPanel(page);
  await panel.getByRole('button', { name: 'Mark as done' }).click();
  await dialog(page).getByRole('button', { name: /Mark as Done/ }).click();
  await expect(rowTitle(page, 'PRJ-51')).toHaveClass(/t-done/);
  await expect(panel.getByRole('button', { name: 'Mark as done' })).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(panel.getByRole('button', { name: 'Mark as done' })).toBeVisible();
  // Not on Claude's tasks
  await page.goto(`${SHOP}/tree/PRJ-45`);
  await expect(taskPanel(page).getByRole('button', { name: 'Mark as done' })).toHaveCount(0);
});

test('a decision without a question takes an answer of the user\'s own', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-52`);
  const panel = taskPanel(page);
  await expect(panel.getByRole('button', { name: 'Send answer' })).toBeDisabled();
  await page.getByPlaceholder('Your answer, or a note to Yes / No…').fill('Option 1, without the desktop shortcut');
  await panel.getByRole('button', { name: 'Send answer' }).click();
  await expect(dialog(page).locator('pre')).toContainText('> Option 1, without the desktop shortcut');
  await dialog(page).getByRole('button', { name: 'Send answer' }).click();
  await expect(rowTitle(page, 'PRJ-52')).toHaveClass(/t-done/);
  await expect(panel.getByText('Latest: Option 1, without the desktop shortcut')).toBeVisible();
});

test('a decision of no drops the task', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-52`);
  await taskPanel(page).getByRole('button', { name: 'No', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'No', exact: true }).click();
  await expect(rowTitle(page, 'PRJ-52')).toHaveClass(/t-dropped/);
});

test('a task moves under another parent, never under its own subtask', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-1`);
  await panelMenu(page, 'Move…');
  const picker = page.getByRole('dialog', { name: 'Move PRJ-1 under…' });
  await picker.getByRole('searchbox').fill('PRJ-45');
  await expect(picker.getByText('No task matches.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();

  await page.goto(`${SHOP}/tree/PRJ-45`);
  await panelMenu(page, 'Move…');
  await page.getByRole('dialog', { name: 'Move PRJ-45 under…' }).getByRole('button', { name: 'Top level of the session' }).click();
  await dialog(page).getByRole('button', { name: 'Move', exact: true }).click();
  await expect(row(page, 'PRJ-45')).toHaveClass(/\broot\b/);
});

test('the details panel shows only with a task selected', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await expect(taskPanel(page)).toHaveCount(0);
  await rowTitle(page, 'PRJ-44').click();
  await expect(taskPanel(page)).toBeVisible();
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
  await expect(page).toHaveURL(/status=todo&status=in_progress&status=blocked&status=deferred/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Search tasks')).toHaveValue('Inventory: refactor');
  await expect(row(page, 'PRJ-45')).toBeVisible();
  await expect(row(page, 'PRJ-2')).toHaveCount(0);
});

test('the panel lists only other sessions of the task', async ({ page }) => {
  await page.goto(`${SHOP}/tree/PRJ-45`);
  const panel = taskPanel(page);
  await expect(panel.getByRole('heading', { level: 2, name: 'Inventory: refactoring' })).toBeVisible();
  await expect(panel.getByText('Also in other sessions')).toHaveCount(0);
  await expect(panel.getByText('Claude sessions')).toHaveCount(0);
});

test('top-level titles are bold, but not while a filter is on', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await expect(rowTitle(page, 'PRJ-1')).toHaveCSS('font-weight', '600');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(rowTitle(page, 'PRJ-1')).toHaveCSS('font-weight', '400');
});

test('quick filter "Open" hides done and dropped tasks and toggles off', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  const open = page.getByRole('button', { name: 'Open', exact: true });
  await open.click();
  await expect(open).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 'PRJ-2')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Status: 4 rules/ })).toBeVisible();
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
  await openSettings(page, 'Claude sessions');
  const settings = settingsDialog(page);
  await settings.getByLabel('Plugin folder (until the plugin is installed)').fill('C:\\Dev\\ainstorm\\plugin');
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();
  await page.getByRole('button', { name: 'Copy resume command' }).click();
  expect(await clipboardText(page))
    .toBe('cd ~/dev/shop && claude --resume ed08d5d7-18da-4b7e-8239-87b2b703b793 --plugin-dir C:/Dev/ainstorm/plugin');
});

test('the history shows events, or only the closed tasks latest closed first; a task opens in the panel', async ({ page }) => {
  await page.goto(`${SHOP}/history`);
  await expect(page.locator('tbody .ev').first()).toBeVisible();
  await page.getByRole('button', { name: 'Closed only' }).click();
  await expect(page).toHaveURL(/closed=1/);
  const tasks = await page.locator('tbody .task').allInnerTexts();
  // The whole id: PRJ-3 is not PRJ-37
  const at = (id: string) => tasks.findIndex(t => new RegExp(`\\b${id}\\b`).test(t));
  expect(at('PRJ-40')).toBeGreaterThan(-1);
  expect(at('PRJ-40')).toBeLessThan(at('PRJ-37'));
  expect(at('PRJ-37')).toBeLessThan(at('PRJ-3'));
  // A task opens in the panel next to the list
  await page.locator('tbody .task').nth(at('PRJ-40')).getByRole('button').click();
  await expect(page).toHaveURL(/\/s\/ed08d5d7\/history\/PRJ-40\?closed=1$/);
  await expect(page.getByRole('button', { name: 'Closed only' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('complementary', { name: 'Task details' })).toBeVisible();
});

test('the tab title names the project of the page', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await expect(page).toHaveTitle(/PRJ shop · .*ainstorm$/);
  await page.goto('/');
  await expect(page).not.toHaveTitle(/PRJ/);
});

test('the continue command names the session, for a new Claude session to take it over', async ({ page }) => {
  await page.goto(`${SHOP}/tree`);
  await page.getByRole('button', { name: 'Copy continue command' }).click();
  expect(await clipboardText(page)).toBe('/ainstorm:continue ed08d5d7-18da-4b7e-8239-87b2b703b793');
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
