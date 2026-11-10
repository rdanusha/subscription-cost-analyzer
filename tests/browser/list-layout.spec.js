const { test, expect } = require('@playwright/test');
for (const width of [1440, 390]) {
  test(`full tour only and real list layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('#exampleSet')).toHaveCount(0);
    await page.locator('#examples').click();
    await expect(page.locator('.subscription-card')).toHaveCount(13);
    await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s129\.00/);
    const cardsHeight = await page.locator('.subscription-card').first().evaluate(n => n.getBoundingClientRect().height);
    await page.locator('#listView').click();
    await expect(page.locator('#listView')).toHaveAttribute('aria-pressed', 'true');
    const geometry = await page.locator('#subscriptionList').evaluate(n => ({
      columns: getComputedStyle(n).gridTemplateColumns.split(' ').length,
      height: n.firstElementChild.getBoundingClientRect().height,
    }));
    expect(geometry.columns).toBe(1);
    expect(geometry.height).toBeLessThan(cardsHeight);
    await expect(page.getByRole('button', { name: 'Edit Example fitness membership', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Example fitness membership', exact: true }).click();
    await expect(page.locator('#name')).toHaveValue('Example fitness membership');
    await page.locator('#cancelEdit').click();
    await page.locator('#gridView').click();
    expect(await page.locator('.subscription-card').first().evaluate(n => n.getBoundingClientRect().height)).toBe(cardsHeight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.locator('#listView').click();
    await page.locator('.list-column > .panel').screenshot({ path: `test-results/list-layout-${width}.png` });
  });
}
