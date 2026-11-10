// Run explicitly after deployment: node tests/live-smoke.cjs https://rdanusha.github.io/subscription-cost-analyzer/
// Uses isolated fictional data only, never a personal browser profile.
const { chromium, webkit, expect, request } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
(async () => {
  const base = process.argv[2];
  if (!base) throw new Error('Provide the deployed site URL.');
  const api = await request.newContext();
  for (const asset of ['index.html', 'styles.css', 'model.js', 'app.js', 'social-preview.png', 'LICENSE']) {
    const response = await api.get(new URL(asset, base).href);
    expect(response.status(), asset).toBe(200);
    expect(hash(await response.body()), `${asset} deployed bytes`).toBe(hash(readFileSync(resolve(__dirname, '..', asset))));
    console.log(`Verified asset: ${asset}`);
  }
  await api.dispose();
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await browserType.launch();
    try {
      for (const width of [1440, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
        await page.goto(base);
        await expect(page.locator('h1')).toHaveText('Subscription Cost Analyzer');
        await expect(page.locator('footer')).toContainText('Built by rdanusha');
        await expect(page.locator('#exampleSet')).toHaveCount(0);
        await page.locator('#examples').click();
        await expect(page.locator('.subscription-card')).toHaveCount(13);
        await expect(page.locator('.legend-fill')).toHaveCount(12);
        await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s129\.00/);
        await page.locator('#listView').click();
        await expect(page.locator('#listView')).toHaveAttribute('aria-pressed', 'true');
        expect(await page.locator('#subscriptionList').evaluate(n => getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(1);
        await page.locator('#sort').selectOption('name');
        await expect(page.locator('.subscription-name').first()).toHaveText('Example budgeting app');
        await page.locator('#gridView').click();
        await expect(page.locator('#gridView')).toHaveAttribute('aria-pressed', 'true');
        await page.locator('#exitDemo').click();
        await expect(page.locator('.subscription-card')).toHaveCount(0);
        await page.locator('#name').fill('Fictional live verification');
        await page.locator('#amount').fill('7');
        await page.locator('#save').click();
        await expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s7\.00/);
        await page.reload();
        await expect(page.locator('.subscription-name')).toHaveText('Fictional live verification');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
        console.log(`Verified ${engine} ${width}px: examples, category bars, list/cards, sort, saved fixture reload, no page errors or overflow`);
        await context.close();
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
