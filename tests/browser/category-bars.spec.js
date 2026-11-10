const { test, expect } = require('@playwright/test');
for (const width of [1440, 1000, 800, 600, 390, 320]) {
  test(`category spending bars at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('.legend-track')).toHaveCount(0);
    await page.locator('#examples').click();
    await expect(page.locator('.legend-track')).toHaveCount(12);
    const rows = await page.locator('.legend-row').evaluateAll(nodes => nodes.map(row => {
      const track = row.querySelector('.legend-track');
      const fill = row.querySelector('.legend-fill');
      const name = row.querySelector('.legend-name').getBoundingClientRect();
      const price = row.querySelector('.legend-value').getBoundingClientRect();
      const rect = track.getBoundingClientRect();
      return { share: parseFloat(fill.style.width), percent: parseFloat(row.querySelector('.legend-percent').textContent), color: getComputedStyle(fill).backgroundColor, dot: getComputedStyle(row.querySelector('.key-dot')).backgroundColor, width: rect.width, below: rect.top >= name.bottom, between: rect.left >= name.right && rect.right <= price.left };
    }));
    for (const row of rows) {
      expect(row.width).toBeGreaterThan(0);
      expect(row.color).toBe(row.dot);
      expect(Math.abs(row.share - row.percent)).toBeLessThanOrEqual(0.5);
      expect(row.below || row.between).toBe(true);
      if (width <= 760) expect(row.below).toBe(true);
    }
    // CSS serializes percentage widths with limited decimal precision.
    expect(rows.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(100, 3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    if (width === 800 || width === 390) await page.locator('.category-panel').screenshot({ path: `test-results/category-bars-${width}.png` });
    await page.locator('#exitDemo').click();
    await expect(page.locator('.legend-track')).toHaveCount(0);
  });
}
