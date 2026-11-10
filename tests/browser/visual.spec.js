const { test, expect } = require('@playwright/test');

// Independent, fictional fixtures only. Playwright creates a fresh context per test.
// Do not run against reference apps or a browser profile containing personal data.
const KEY = 'rdanusha.subscription-cost-analyzer.v1';
const GRAPH_IDS = ['categoryDonut', 'donutTotal', 'categoryLegend', 'currentPlanAmount',
  'afterPlanAmount', 'planSavings', 'planPercent', 'planCurrentFill', 'planAfterFill'];
const SAMPLE_CATEGORIES = [
  ['Entertainment', 12, 9], ['Productivity', 8, 6], ['Health', 30, 23],
  ['Utilities', 5, 4], ['Learning', 8, 6], ['Streaming', 15, 12],
  ['Software & Dev Tools', 10, 8], ['Finance', 4, 3], ['Business', 20, 16],
  ['News & Media', 5, 4], ['Gaming', 10, 8], ['Storage & Cloud', 2, 2],
];
test.use({ serviceWorkers: 'block' });

const moneyPattern = (amount, currency = 'USD') => {
  const value = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(amount).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${currency}\\s+${value}(?![\\d.])`);
};
const idle = page => expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'false');
const stored = page => page.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));

async function save(page, { name = 'Fictional plan', amount = '10', cycle = 'monthly',
  category = 'Entertainment', planned = false } = {}) {
  await page.locator('#name').fill(name);
  await page.locator('#amount').fill(amount);
  await page.locator('#cycle').selectOption(cycle);
  await page.locator('#category').selectOption(category);
  await page.locator('#planned').setChecked(planned);
  await page.locator('#save').click();
  await idle(page);
  await expect(page.locator('#formError')).toBeEmpty();
}

async function expectPlan(page, { current, remaining, savings, percent, currency = 'USD' }) {
  for (const [id, value] of [['donutTotal', current], ['currentPlanAmount', current],
    ['afterPlanAmount', remaining], ['planSavings', savings]]) {
    await expect(page.locator(`#${id}`)).toContainText(moneyPattern(value, currency));
  }
  await expect(page.locator('#planPercent')).toContainText(new RegExp(`(?:^|\\D)${percent}\\s*%`));
  for (const [id, expected] of [['planCurrentFill', current > 0 ? 100 : 0],
    ['planAfterFill', current > 0 ? remaining / current * 100 : 0]]) {
    // Inline percentage is the graph's data, not a rounded pixel measurement.
    await expect.poll(async () => page.locator(`#${id}`).evaluate(node => {
      return node.style.width.endsWith('%') ? Number.parseFloat(node.style.width) : null;
    })).toBeCloseTo(expected, 3);
  }
  const donut = page.locator('#categoryDonut');
  await expect(donut).toHaveAttribute('role', 'img');
  await expect(donut).toHaveAccessibleName(/\S/);
  const label = await donut.getAttribute('aria-label');
  expect(label).not.toMatch(/\b(?:NaN|Infinity|undefined)\b/i);
  if (current > 0) expect(label).toMatch(moneyPattern(current, currency));
}

async function expectLegend(page, categories, currency = 'USD') {
  await expect(page.locator('#categoryLegend .legend-row')).toHaveCount(categories.length);
  const colors = [];
  for (const [category, amount, percent] of categories) {
    const row = page.locator('#categoryLegend .legend-row').filter({
      has: page.locator('.legend-value'),
    }).and(page.locator(`[data-category="${category}"]`));
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-category', category);
    await expect(row).toContainText(category);
    await expect(row.locator('.legend-value')).toContainText(moneyPattern(amount, currency));
    await expect(row.locator('.legend-percent')).toContainText(`${percent}%`);
    // Accept a real swatch or CSS pseudo-element; do not prescribe a swatch class.
    const painted = await row.evaluate(node => {
      const colors = [];
      for (const child of [node, ...node.querySelectorAll('*')]) {
        for (const pseudo of [null, '::before', '::after']) {
          const style = getComputedStyle(child, pseudo);
          if (pseudo && (style.content === 'none' || style.content === 'normal')) continue;
          const rgb = style.backgroundColor.match(/[\d.]+/g)?.map(Number);
          if (rgb && rgb.length >= 3 && (rgb.length < 4 || rgb[3] > 0)
            && Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)) > 30) {
            colors.push(style.backgroundColor);
          }
        }
      }
      return colors;
    });
    expect(painted, `${category} needs a colored legend swatch`).not.toEqual([]);
    colors.push(painted);
  }
  expect(new Set(colors.flat()).size).toBeGreaterThanOrEqual(categories.length);
}

async function expectNoSpending(page) {
  await expectPlan(page, { current: 0, remaining: 0, savings: 0, percent: 0 });
  await expect(page.locator('#categoryDonut')).toHaveAccessibleName(/no\s+(?:paid\s+)?(?:spending|subscriptions)|no\s+subscription\s+spending|zero\s+spending/i);
  await expect(page.locator('#categoryLegend .legend-row')).toHaveCount(0);
  // Empty/free data must not reuse a painted, apparently nonzero pie.
  const backgrounds = await page.locator('#categoryDonut').evaluate(node =>
    [null, '::before', '::after'].map(pseudo => getComputedStyle(node, pseudo).backgroundImage));
  expect(backgrounds.join(' ')).not.toMatch(/conic-gradient/i);
  const graphText = await page.locator(GRAPH_IDS.map(id => `#${id}`).join(',')).allTextContents();
  expect(graphText.join(' ')).not.toMatch(/\b(?:NaN|Infinity|undefined)\b/i);
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  page.visualErrors = [];
  page.visualOutbound = [];
  page.visualFailed = [];
  page.on('pageerror', error => page.visualErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.visualErrors.push(message.text()); });
  page.on('requestfailed', request => page.visualFailed.push(request.url()));
  // Block before any request is sent, and still fail if the app attempts one.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.protocol === 'blob:' || url.origin === origin) {
      await route.continue();
    } else {
      page.visualOutbound.push(url.href);
      await route.abort('blockedbyclient');
    }
  });
  await page.addInitScript(() => {
    window.visualStorageWrites = [];
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.visualStorageWrites.push({ method, args });
        return original.apply(this, args);
      };
    }
  });
  await page.goto('/');
  await idle(page);
  expect(await stored(page)).toEqual({});
});

test.afterEach(async ({ page }) => {
  expect(page.visualErrors, 'No uncaught JavaScript or console errors').toEqual([]);
  expect(page.visualOutbound, 'No external requests (blocked before leaving the browser)').toEqual([]);
  expect(page.visualFailed, 'No failed resource requests').toEqual([]);
});

test('Intel background and genuinely empty graphs do not create saved data', async ({ page }) => {
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 15, 23)');
  await expectNoSpending(page);
  expect(await stored(page)).toEqual({});
  expect(await page.evaluate(() => window.visualStorageWrites)).toEqual([]);
});

test('mixed-cycle examples plot full category costs and only planned monthly savings', async ({ page }) => {
  await page.locator('#examples').click();
  await idle(page);
  await expectPlan(page, { current: 129, remaining: 97, savings: 32, percent: 25 });
  await expectLegend(page, SAMPLE_CATEGORIES);
  const before = await page.locator('#categoryLegend').innerText();
  const donutLabel = await page.locator('#categoryDonut').getAttribute('aria-label');
  await page.getByRole('checkbox', { name: 'Consider cancelling Example video plan', exact: true }).uncheck();
  await idle(page);
  await expectPlan(page, { current: 129, remaining: 109, savings: 20, percent: 16 });
  await expectLegend(page, SAMPLE_CATEGORIES);
  expect(await page.locator('#categoryLegend').innerText()).toBe(before);
  expect(await page.locator('#categoryDonut').getAttribute('aria-label')).toBe(donutLabel);
  expect(await stored(page)).toEqual({});
  expect(await page.evaluate(() => window.visualStorageWrites)).toEqual([]);
});

test('add, edit, and confirmed removal update graphs without altering entered monetary values', async ({ page }) => {
  await save(page, { name: 'Graph fixture', amount: '12', planned: true });
  await expectPlan(page, { current: 12, remaining: 0, savings: 12, percent: 100 });
  await expectLegend(page, [['Entertainment', 12, 100]]);
  await page.getByRole('button', { name: 'Edit Graph fixture', exact: true }).click();
  await save(page, { name: 'Graph fixture', amount: '60', cycle: 'annual', category: 'Utilities' });
  await expectPlan(page, { current: 5, remaining: 5, savings: 0, percent: 0 });
  await expectLegend(page, [['Utilities', 5, 100]]);
  const snapshot = await stored(page);
  const saved = JSON.parse(snapshot[KEY]);
  expect(saved.subscriptions).toHaveLength(1);
  expect(saved.subscriptions[0]).toMatchObject({ name: 'Graph fixture', amount: '60.00', cycle: 'annual', category: 'Utilities', planned: false });
  await page.reload();
  await idle(page);
  await expectPlan(page, { current: 5, remaining: 5, savings: 0, percent: 0 });
  expect(await stored(page)).toEqual(snapshot);
  expect(await page.evaluate(() => window.visualStorageWrites)).toEqual([]);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove Graph fixture', exact: true }).click();
  await idle(page);
  await expectNoSpending(page);
  expect(JSON.parse((await stored(page))[KEY]).subscriptions).toEqual([]);
});

test('legitimate free plans remain entries, not fake paid slices or invalid ratios', async ({ page }) => {
  await save(page, { name: 'Free annual fixture', amount: '0', cycle: 'annual', planned: true });
  await save(page, { name: 'Free monthly fixture', amount: '0', category: 'Learning' });
  await expect(page.locator('.subscription-card')).toHaveCount(2);
  await expectNoSpending(page);
  const snapshot = await stored(page);
  expect(JSON.parse(snapshot[KEY]).subscriptions.map(sub => sub.amount)).toEqual(['0.00', '0.00']);
  await page.reload();
  await idle(page);
  await expectNoSpending(page);
  expect(await stored(page)).toEqual(snapshot);
  expect(await page.evaluate(() => window.visualStorageWrites)).toEqual([]);
});

test('positive annual category costs survive monthly display rounding to zero', async ({ page }) => {
  await save(page, { name: 'Tiny learning fixture', amount: '0.01', cycle: 'annual', category: 'Learning', planned: true });
  await save(page, { name: 'Tiny utility fixture', amount: '0.01', cycle: 'annual', category: 'Utilities' });
  // Annual basis is 0.02; each category is 50%, although all monthly amounts display 0.00.
  await expectLegend(page, [['Learning', 0, 50], ['Utilities', 0, 50]]);
  await expect(page.locator('#donutTotal')).toContainText(moneyPattern(0));
  await expect(page.locator('#planPercent')).toContainText('50%');
  expect(await page.locator('#planCurrentFill').evaluate(node => parseFloat(node.style.width))).toBe(100);
  expect(await page.locator('#planAfterFill').evaluate(node => parseFloat(node.style.width))).toBeCloseTo(50, 3);
  const donut = page.locator('#categoryDonut');
  await expect(donut).toHaveAttribute('role', 'img');
  await expect(donut).toHaveAccessibleName(/USD\s+0\.00/);
  const label = await donut.getAttribute('aria-label');
  expect(label).toMatch(/Learning[^%]*50\s*%/i);
  expect(label).toMatch(/Utilities[^%]*50\s*%/i);
  expect(label).not.toMatch(/no\s+(?:paid\s+)?spending|no\s+subscriptions|NaN|Infinity|undefined/i);
  const snapshot = await stored(page);
  expect(JSON.parse(snapshot[KEY]).subscriptions.map(sub => sub.amount)).toEqual(['0.01', '0.01']);
  await page.reload();
  await idle(page);
  await expectLegend(page, [['Learning', 0, 50], ['Utilities', 0, 50]]);
  expect(await stored(page)).toEqual(snapshot);
});

test('JPY graphs use whole currency amounts and annual-basis integer savings percentage', async ({ page }) => {
  await page.locator('#currency').selectOption('JPY');
  await idle(page);
  await save(page, { name: 'JPY monthly fixture', amount: '100', planned: true });
  await save(page, { name: 'JPY annual fixture', amount: '600', cycle: 'annual', category: 'Utilities' });
  await expectPlan(page, { current: 150, remaining: 50, savings: 100, percent: 67, currency: 'JPY' });
  for (const id of ['donutTotal', 'currentPlanAmount', 'afterPlanAmount', 'planSavings']) {
    await expect(page.locator(`#${id}`)).not.toContainText(/JPY\s+[\d,]+\.\d/);
  }
  await expect(page.locator('#categoryLegend [data-category="Entertainment"] .legend-value')).toContainText(moneyPattern(100, 'JPY'));
  await expect(page.locator('#categoryLegend [data-category="Utilities"] .legend-value')).toContainText(moneyPattern(50, 'JPY'));
  const snapshot = await stored(page);
  await page.reload();
  await idle(page);
  await expectPlan(page, { current: 150, remaining: 50, savings: 100, percent: 67, currency: 'JPY' });
  expect(await stored(page)).toEqual(snapshot);
});

test('example graph mutations and read-only graph interactions preserve the saved fixture byte-for-byte', async ({ page }) => {
  await save(page, { name: 'Saved fictional fixture', amount: '7', category: 'Health' });
  const snapshot = await stored(page);
  await page.evaluate(() => { window.visualStorageWrites = []; });
  await page.locator('#examples').click();
  await idle(page);
  await expectPlan(page, { current: 129, remaining: 97, savings: 32, percent: 25 });
  await page.getByRole('checkbox', { name: 'Consider cancelling Example video plan', exact: true }).uncheck();
  await idle(page);
  await save(page, { name: 'Unsaved demo fixture', amount: '99', category: 'Other' });
  await expectPlan(page, { current: 228, remaining: 208, savings: 20, percent: 9 });
  await page.getByRole('button', { name: 'Edit Unsaved demo fixture', exact: true }).click();
  await save(page, { name: 'Unsaved demo fixture', amount: '24', category: 'Other', planned: true });
  await expectPlan(page, { current: 153, remaining: 109, savings: 44, percent: 29 });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove Unsaved demo fixture', exact: true }).click();
  await idle(page);
  await expectPlan(page, { current: 129, remaining: 109, savings: 20, percent: 16 });
  await page.locator('#filter').selectOption('planned');
  await page.locator('#sort').selectOption('name');
  await expectLegend(page, SAMPLE_CATEGORIES);
  await page.setViewportSize({ width: 390, height: 1000 });
  expect(await stored(page)).toEqual(snapshot);
  expect(await page.evaluate(() => window.visualStorageWrites)).toEqual([]);
  await page.locator('#exitDemo').click();
  await idle(page);
  await expectPlan(page, { current: 7, remaining: 7, savings: 0, percent: 0 });
  await expectLegend(page, [['Health', 7, 100]]);
  expect(await stored(page)).toEqual(snapshot);
  await page.reload();
  await idle(page);
  await expect(page.locator('.subscription-name')).toHaveText('Saved fictional fixture');
  expect(await stored(page)).toEqual(snapshot);
  expect(await page.evaluate(() => window.visualStorageWrites)).toEqual([]);
});

for (const width of [320, 390, 768, 1440]) {
  test(`graphs stay within ${width}px with maximum cost and a 100-character name`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#examples').click();
    await idle(page);
    await save(page, { name: 'W'.repeat(100), amount: '1000000', category: 'Other', planned: true });
    await expectPlan(page, { current: 1000129, remaining: 97, savings: 1000032, percent: 100 });
    const snapshot = await stored(page);
    for (const id of GRAPH_IDS.filter(id => !id.endsWith('Fill'))) {
      const graph = page.locator(`#${id}`);
      await expect(graph).toBeVisible();
      const rect = await graph.boundingBox();
      expect(rect.x, `${id} left edge`).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width, `${id} right edge`).toBeLessThanOrEqual(width + 1);
      expect(await graph.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${id} internal overflow`).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await stored(page)).toEqual(snapshot);
    expect(snapshot).toEqual({});
    expect(await page.evaluate(() => window.visualStorageWrites)).toEqual([]);
  });
}
