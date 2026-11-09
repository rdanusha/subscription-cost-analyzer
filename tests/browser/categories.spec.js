const { test, expect } = require('@playwright/test');
const M = require('../../model.js');
const path = require('node:path');
const KEY = 'rdanusha.subscription-cost-analyzer.v1';
const legacy = ['Entertainment', 'Productivity', 'Health', 'Utilities', 'Learning', 'Other'];
const label = category => category === 'Health' ? 'Health & Fitness' : category;

test.beforeEach(async ({ page }) => {
  page.categoryErrors = [];
  page.on('pageerror', error => page.categoryErrors.push(error.message));
  await page.goto('/');
});
test.afterEach(async ({ page }) => expect(page.categoryErrors).toEqual([]));

for (const width of [390, 1440]) {
  test(`all expanded categories save, reload and agree across cards and graphs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.locator('#category option').evaluateAll(options => options.map(option => option.value))).toEqual(M.CATEGORIES);
    await expect(page.locator('#category option')).toHaveCount(13);
    for (const category of M.CATEGORIES) {
      await page.locator('#name').fill(`Category fixture: ${category}`);
      await page.locator('#amount').fill('1');
      await page.locator('#category').selectOption(category);
      await page.locator('#save').click();
      await expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('#formError')).toBeEmpty();
    }
    await expect(page.locator('.subscription-card')).toHaveCount(13);
    await expect(page.locator('#categoryLegend .legend-row')).toHaveCount(13);
    await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s13\.00/);
    const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
    expect(JSON.parse(raw).subscriptions.map(sub => sub.category)).toEqual(M.CATEGORIES);
    await page.reload();
    expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(raw);
    const colors = [];
    const gradient = await page.locator('#categoryDonut').evaluate(node => getComputedStyle(node).backgroundImage);
    for (const category of M.CATEGORIES) {
      const card = page.locator('.subscription-card').filter({ has: page.locator('.subscription-name', { hasText: `Category fixture: ${category}` }) });
      const row = page.locator('#categoryLegend .legend-row').filter({ has: page.locator('.legend-name', { hasText: label(category) }) });
      await expect(card.locator('.subscription-meta')).toContainText(label(category));
      await expect(card.locator('.category-icon')).not.toBeEmpty();
      await expect(row.locator('.legend-value')).toHaveText(/USD\s1\.00/);
      const color = await card.evaluate(node => node.style.getPropertyValue('--category-color'));
      expect(color).toBe(await row.evaluate(node => node.style.getPropertyValue('--category-color')));
      const swatch = await row.locator('.key-dot').evaluate(node => getComputedStyle(node).backgroundColor);
      expect(gradient).toContain(swatch);
      colors.push(color);
    }
    expect(new Set(colors).size).toBe(13);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator('.insights-grid').screenshot({ path: path.resolve(__dirname, '../../release', `categories-${width === 390 ? 'mobile' : 'desktop'}.png`) });
  });
}

test('legacy saved categories remain unchanged and Health is a display-only alias', async ({ page }) => {
  const saved = { version: 1, currency: 'USD', subscriptions: legacy.map((category, i) => ({ id: `legacy_${i}`, name: `Legacy ${category}`, category, cycle: 'monthly', amount: '10.00', planned: false })) };
  const raw = JSON.stringify(saved);
  await page.evaluate(([key, raw]) => localStorage.setItem(key, raw), [KEY, raw]);
  await page.reload();
  await expect(page.locator('.subscription-card')).toHaveCount(6);
  await expect(page.locator('#save')).toBeEnabled();
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(raw);
  await expect(page.locator('#categoryLegend [data-category="Health"] .legend-name')).toHaveText('Health & Fitness');
  await expect(page.locator('#categoryDonut')).toHaveAccessibleName(/Health & Fitness/);
  await page.getByRole('button', { name: 'Edit Legacy Health', exact: true }).click();
  await expect(page.locator('#category')).toHaveValue('Health');
  await expect(page.locator('#category option:checked')).toHaveText('Health & Fitness');
  await page.locator('#save').click();
  await expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'false');
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), KEY)).subscriptions.map(sub => sub.category)).toEqual(legacy);
});
