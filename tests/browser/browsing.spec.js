const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

// Independent fictional fixtures; never attach to a personal browser profile.
const KEY = 'rdanusha.subscription-cost-analyzer.v1';
const CATEGORIES = ['Entertainment', 'Productivity', 'Health', 'Utilities', 'Learning',
  'Streaming', 'Software & Dev Tools', 'Finance', 'Business', 'News & Media',
  'Gaming', 'Storage & Cloud', 'Other'];
const FIXTURES = [
  { id: 'fixture-2099', name: 'Zebra Monthly', amount: '10.00', cycle: 'monthly', category: 'Gaming', planned: false },
  { id: 'fixture-2000', name: 'Alpha Annual', amount: '60.00', cycle: 'annual', category: 'Finance', planned: true },
  { id: 'fixture-2080', name: 'Beta Quarterly', amount: '24.00', cycle: 'quarterly', category: 'Health', planned: false },
  { id: 'fixture-1990', name: 'Gamma Free', amount: '0.00', cycle: 'monthly', category: 'Other', planned: true },
];
// Hard-coded oracles, deliberately not calculated with application/model comparators.
const ORDERS = {
  cost: ['Zebra Monthly', 'Beta Quarterly', 'Alpha Annual', 'Gamma Free'],
  'cost-asc': ['Gamma Free', 'Alpha Annual', 'Beta Quarterly', 'Zebra Monthly'],
  name: ['Alpha Annual', 'Beta Quarterly', 'Gamma Free', 'Zebra Monthly'],
  'name-desc': ['Zebra Monthly', 'Gamma Free', 'Beta Quarterly', 'Alpha Annual'],
  category: ['Alpha Annual', 'Zebra Monthly', 'Beta Quarterly', 'Gamma Free'],
  billing: ['Zebra Monthly', 'Gamma Free', 'Beta Quarterly', 'Alpha Annual'],
  planned: ['Alpha Annual', 'Gamma Free', 'Zebra Monthly', 'Beta Quarterly'],
  newest: ['Gamma Free', 'Beta Quarterly', 'Alpha Annual', 'Zebra Monthly'],
};
const SNAPSHOT_IDS = ['monthlyTotal', 'annualTotal', 'savingsTotal', 'remainingTotal',
  'countLabel', 'plannedLabel', 'categoryDonut', 'donutTotal', 'donutCount',
  'categoryLegend', 'currentPlanAmount', 'afterPlanAmount', 'planSavings',
  'planPercent', 'planCurrentFill', 'planAfterFill', 'planHint'];
const idle = page => expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'false');
const stored = page => page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const writes = page => page.evaluate(() => window.browsingWrites);
const resetWrites = page => page.evaluate(() => { window.browsingWrites = []; });
const names = page => page.locator('#subscriptionList .subscription-name');
const overview = page => page.evaluate(ids => ids.map(id => {
  const node = document.getElementById(id);
  return { id, text: node.textContent, label: node.getAttribute('aria-label'), style: node.getAttribute('style') };
}), SNAPSHOT_IDS);

async function seed(page, subscriptions = FIXTURES) {
  // Whitespace makes an accidental serialization detectable byte-for-byte.
  const raw = JSON.stringify({ version: 1, currency: 'USD', subscriptions }, null, 2);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, raw]);
  await page.reload();
  await idle(page);
  await expect(names(page)).toHaveCount(subscriptions.length);
  expect((await stored(page))[KEY]).toBe(raw);
  expect(await writes(page)).toEqual([]);
  return raw;
}
async function save(page, { name, amount = '10', cycle = 'monthly', category = 'Other', planned = false }) {
  await page.locator('#name').fill(name);
  await page.locator('#amount').fill(amount);
  await page.locator('#cycle').selectOption(cycle);
  await page.locator('#category').selectOption(category);
  await page.locator('#planned').setChecked(planned);
  await page.locator('#save').click();
  await idle(page);
  await expect(page.locator('#formError')).toBeEmpty();
}
async function view(page, mode, keyboard = false) {
  const button = page.locator(`#${mode}View`);
  await expect(button).toHaveRole('button');
  await expect(button).toHaveAccessibleName(/\S/);
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); }
  else await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`#${mode === 'list' ? 'grid' : 'list'}View`)).toHaveAttribute('aria-pressed', 'false');
  if (mode === 'list') await expect(page.locator('#subscriptionList')).toHaveClass(/\blist-view\b/);
  else await expect(page.locator('#subscriptionList')).not.toHaveClass(/\blist-view\b/);
}
async function fixtureTotals(page) {
  for (const [id, value] of [['monthlyTotal', '23.00'], ['annualTotal', '276.00'],
    ['savingsTotal', '60.00'], ['remainingTotal', '18.00'], ['planSavings', '5.00']]) {
    await expect(page.locator(`#${id}`)).toHaveText(new RegExp(`USD\\s${value.replace('.', '\\.')}`));
  }
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page, context, baseURL }) => {
  page.browsingErrors = []; page.browsingFailed = []; page.browsingOutbound = [];
  page.on('pageerror', error => page.browsingErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.browsingErrors.push(message.text()); });
  page.on('requestfailed', request => page.browsingFailed.push(request.url()));
  const origin = new URL(baseURL).origin;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) await route.continue();
    else { page.browsingOutbound.push(url.href); await route.abort('blockedbyclient'); }
  });
  await page.addInitScript(() => {
    window.browsingWrites = [];
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.browsingWrites.push({ method, args });
        return original.apply(this, args);
      };
    }
  });
  await page.goto('/');
  await idle(page);
  expect(await stored(page)).toEqual({});
});
test.afterEach(async ({ page }) => {
  expect(page.browsingErrors, 'No JavaScript or console errors').toEqual([]);
  expect(page.browsingFailed, 'No failed requests').toEqual([]);
  expect(page.browsingOutbound, 'No attempted outbound requests').toEqual([]);
});

test('default full preset has thirteen fictional categories, mixed billing and a free Other entry without saving', async ({ page }) => {
  await expect(page.locator('#exampleSet')).toHaveCount(0);
  await page.locator('#examples').click();
  await idle(page);
  await expect(page.locator('#demoBanner')).toBeVisible();
  await expect(page.locator('#examples')).toBeDisabled();
  await expect(names(page)).toHaveCount(13);
  const exampleNames = await names(page).allTextContents();
  expect(exampleNames.every(name => /^Example\b/.test(name))).toBe(true);
  expect(new Set(exampleNames).size).toBe(13);
  const records = [];
  for (const name of exampleNames) {
    await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    records.push({ category: await page.locator('#category').inputValue(),
      cycle: await page.locator('#cycle').inputValue(), amount: await page.locator('#amount').inputValue() });
    await page.locator('#cancelEdit').click();
  }
  expect(records.map(record => record.category).sort()).toEqual([...CATEGORIES].sort());
  expect([...new Set(records.map(record => record.cycle))].sort()).toEqual(['annual', 'monthly', 'quarterly']);
  expect(records.find(record => record.category === 'Other').amount).toMatch(/^0(?:\.0+)?$/);
  expect(await stored(page)).toEqual({});
  expect(await writes(page)).toEqual([]);
  await page.locator('#exitDemo').click();
  await idle(page);
  await expect(names(page)).toHaveCount(0);
  await expect(page.locator('#exampleSet')).toHaveCount(0);
  await page.reload();
  await idle(page);
  await expect(names(page)).toHaveCount(0);
  expect(await stored(page)).toEqual({});
});

test('full tour retains the original examples within the expanded monthly plan', async ({ page }) => {
  await page.locator('#examples').click();
  await idle(page);
  await expect(names(page)).toHaveCount(13);
  for (const [id, amount] of [['monthlyTotal', '129.00'], ['planSavings', '32.00'], ['remainingTotal', '97.00'], ['savingsTotal', '384.00']]) {
    await expect(page.locator(`#${id}`)).toHaveText(new RegExp(`USD\\s${amount.replace('.', '\\.')}`));
  }
  await expect(page.getByRole('checkbox', { name: 'Consider cancelling Example video plan', exact: true })).toBeChecked();
  for (const [name, amount, cycle, category] of [
    ['Example video plan', '12.00', 'monthly', 'Entertainment'],
    ['Example cloud storage', '60.00', 'annual', 'Utilities'],
    ['Example learning plan', '24.00', 'quarterly', 'Learning'],
  ]) {
    await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    await expect(page.locator('#amount')).toHaveValue(amount);
    await expect(page.locator('#cycle')).toHaveValue(cycle);
    await expect(page.locator('#category')).toHaveValue(category);
    await page.locator('#cancelEdit').click();
  }
  expect(await stored(page)).toEqual({});
  expect(await writes(page)).toEqual([]);
});

test('example preset and load button are disabled during a real pending save', async ({ page }) => {
  await page.evaluate(key => {
    navigator.locks.request(`${key}.write`, () => new Promise(resolve => {
      window.releaseBrowsingLock = resolve; window.browsingLockHeld = true;
    }));
  }, KEY);
  await page.waitForFunction(() => window.browsingLockHeld);
  try {
    await page.locator('#name').fill('Own pending fictional fixture');
    await page.locator('#amount').fill('7');
    await page.locator('#save').click();
    await expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#examples')).toBeDisabled();
  } finally { await page.evaluate(() => window.releaseBrowsingLock()); }
  await idle(page);
  await expect(page.locator('#exampleSet')).toHaveCount(0);
  await expect(names(page)).toHaveText(['Own pending fictional fixture']);
});

for (const mode of ['grid', 'list']) {
  for (const [sort, expected] of Object.entries(ORDERS)) {
    test(`${mode}: ${sort} uses independent order, preserves raw insertion array and full summary`, async ({ page }) => {
      const raw = await seed(page);
      await fixtureTotals(page);
      const summary = await overview(page);
      const storage = await stored(page);
      expect(await page.locator('#sort option').evaluateAll(options => options.map(option => option.value))).toEqual(Object.keys(ORDERS));
      await view(page, mode);
      await page.locator('#sort').selectOption(sort);
      await expect(names(page)).toHaveText(expected);
      await expect(page.locator('#subscriptionList .subscription-card').filter({ hasText: 'Beta Quarterly' }).locator('.subscription-meta')).toContainText('Health & Fitness');
      expect(await overview(page)).toEqual(summary);
      expect(await stored(page)).toEqual(storage);
      expect((await stored(page))[KEY]).toBe(raw);
      await page.locator('#filter').selectOption('planned');
      await expect(names(page)).toHaveText(expected.filter(name => ['Alpha Annual', 'Gamma Free'].includes(name)));
      await expect(page.locator('#listNote')).toContainText('Showing 2 of 4');
      await fixtureTotals(page);
      expect(await overview(page)).toEqual(summary);
      await view(page, mode === 'grid' ? 'list' : 'grid', true);
      expect(await overview(page)).toEqual(summary);
      expect(await stored(page)).toEqual(storage);
      expect(await writes(page)).toEqual([]);
      await page.reload();
      await idle(page);
      expect((await stored(page))[KEY]).toBe(raw);
      expect(JSON.parse(raw).subscriptions).toEqual(FIXTURES);
      await fixtureTotals(page);
    });
  }
  test(`${mode}: equal costs, categories, cycles, plans and en-base names retain input order`, async ({ page }) => {
    const tied = ['écho', 'ECHO', 'Echo', 'echo'].map((name, index) => ({
      id: `tie-${index}`, name, amount: '10.00', cycle: 'monthly', category: 'Health', planned: true,
    }));
    const raw = await seed(page, tied);
    await view(page, mode);
    for (const sort of Object.keys(ORDERS).filter(key => key !== 'newest')) {
      await page.locator('#sort').selectOption(sort);
      await expect(names(page)).toHaveText(['écho', 'ECHO', 'Echo', 'echo']);
      expect((await stored(page))[KEY]).toBe(raw);
    }
    await page.locator('#sort').selectOption('newest');
    await expect(names(page)).toHaveText(['echo', 'Echo', 'ECHO', 'écho']);
    expect(await writes(page)).toEqual([]);
  });
}

test('list mode supports keyboard view, checkbox, edit and confirmed/cancelled removal with persistent own changes', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#gridView')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#listView')).toHaveAttribute('aria-pressed', 'false');
  await view(page, 'list', true);
  const checkbox = page.getByRole('checkbox', { name: 'Consider cancelling Zebra Monthly', exact: true });
  await checkbox.focus(); await page.keyboard.press('Space'); await idle(page);
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeFocused();
  expect(JSON.parse((await stored(page))[KEY]).subscriptions[0].planned).toBe(true);
  const edit = page.getByRole('button', { name: 'Edit Zebra Monthly', exact: true });
  await edit.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#name')).toBeFocused();
  await save(page, { name: 'Zebra Edited', amount: '0', category: 'Gaming', planned: true });
  await expect(names(page)).toContainText(['Zebra Edited']);
  const remove = page.getByRole('button', { name: 'Remove Zebra Edited', exact: true });
  page.once('dialog', dialog => dialog.dismiss());
  await remove.focus(); await page.keyboard.press('Enter');
  await expect(remove).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await remove.focus(); await page.keyboard.press('Space'); await idle(page);
  await expect(names(page)).toHaveCount(3);
  await expect(page.locator('#focusAdd')).toBeFocused();
  expect(JSON.parse((await stored(page))[KEY]).subscriptions.map(sub => sub.name)).toEqual(['Alpha Annual', 'Beta Quarterly', 'Gamma Free']);
  await page.reload(); await idle(page);
  await expect(names(page)).toHaveCount(3);
  await expect(names(page)).not.toContainText(['Zebra Edited']);
});

test('full-demo mutations, sort and view never replace own state on exit or reload', async ({ page }) => {
  const raw = await seed(page);
  const summary = await overview(page);
  const storage = await stored(page);
  await page.locator('#examples').click(); await idle(page);
  await view(page, 'list');
  await page.locator('#sort').selectOption('name-desc');
  const firstName = await names(page).first().textContent();
  const checkbox = page.getByRole('checkbox', { name: `Consider cancelling ${firstName}`, exact: true });
  await checkbox.setChecked(!(await checkbox.isChecked())); await idle(page);
  await page.getByRole('button', { name: `Edit ${firstName}`, exact: true }).click();
  await save(page, { name: 'Example demo-only edited', amount: '999', planned: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove Example demo-only edited', exact: true }).click(); await idle(page);
  await save(page, { name: 'Example demo-only addition', amount: '1000000' });
  await page.locator('#filter').selectOption('planned');
  await page.locator('#sort').selectOption('newest');
  await view(page, 'grid');
  expect(await stored(page)).toEqual(storage);
  expect(await writes(page)).toEqual([]);
  await page.locator('#exitDemo').click(); await idle(page);
  await expect(page.locator('#demoBanner')).toBeHidden();
  await expect(names(page)).toHaveCount(4);
  expect((await names(page).allTextContents()).sort()).toEqual(FIXTURES.map(sub => sub.name).sort());
  expect(await overview(page)).toEqual(summary);
  expect((await stored(page))[KEY]).toBe(raw);
  // Reload while another edited demo is active must also discard example changes.
  await page.locator('#examples').click(); await idle(page);
  await save(page, { name: 'Example reload must discard', amount: '123' });
  await view(page, 'list');
  await page.reload(); await idle(page);
  await expect(page.locator('#demoBanner')).toBeHidden();
  await expect(names(page)).toHaveCount(4);
  expect((await names(page).allTextContents()).sort()).toEqual(FIXTURES.map(sub => sub.name).sort());
  expect(await overview(page)).toEqual(summary);
  expect(await stored(page)).toEqual(storage);
  expect(await writes(page)).toEqual([]);
});

for (const width of [320, 390, 768, 1440]) {
  for (const mode of ['grid', 'list']) {
    test(`${mode}: responsive ${width}px handles long names/max cost with labeled 44px controls`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('#examples').click(); await idle(page);
      await save(page, { name: `Example ${'W'.repeat(92)}`, amount: '1000000', planned: true });
      await view(page, mode);
      await expect(names(page)).toHaveCount(14);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const selector of ['.list-column > .panel', '#subscriptionList', '#subscriptionList .subscription-card', '#subscriptionList .subscription-name', '#subscriptionList .monthly-cost']) {
        const measurements = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, internalOverflow: node.scrollWidth > node.clientWidth + 1 };
        }));
        expect(measurements.length, selector).toBeGreaterThan(0);
        for (const measurement of measurements) {
          expect(measurement.left, `${selector} left`).toBeGreaterThanOrEqual(0);
          expect(measurement.right, `${selector} right`).toBeLessThanOrEqual(width + 1);
          expect(measurement.internalOverflow, `${selector} internal overflow`).toBe(false);
        }
      }
      const buttons = page.getByRole('button');
      for (const button of await buttons.all()) {
        if (!(await button.isVisible())) continue;
        await expect(button).toHaveAccessibleName(/\S/);
        expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.locator('input,select').evaluateAll(controls => controls.every(control =>
        control.getAttribute('aria-label') || control.labels.length > 0))).toBe(true);
      expect(await stored(page)).toEqual({});
      expect(await writes(page)).toEqual([]);
      if (mode === 'list' && [390, 1440].includes(width)) {
        // Screenshot only clean fictional presets, not the stress record or any saved list.
        await page.locator('#exitDemo').click(); await idle(page);
        await page.locator('#examples').click(); await idle(page);
        await view(page, 'list');
        await expect(names(page)).toHaveCount(13);
        expect((await names(page).allTextContents()).every(name => /^Example\b/.test(name))).toBe(true);
        const release = path.resolve(__dirname, '../../release');
        fs.mkdirSync(release, { recursive: true });
        await page.locator('.list-column > .panel').screenshot({
          path: path.join(release, `list-view-${width === 390 ? 'mobile' : 'desktop'}.png`),
        });
      }
    });
  }
}
