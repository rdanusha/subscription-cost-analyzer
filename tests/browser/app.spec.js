const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const KEY = 'rdanusha.subscription-cost-analyzer.v1';
const root = path.resolve(__dirname, '../..');
async function add(page, { name = 'Test plan', amount = '10', cycle = 'monthly', category = 'Entertainment', planned = false, pending = false } = {}) {
  await page.locator('#name').fill(name);
  await page.locator('#amount').fill(amount);
  await page.locator('#cycle').selectOption(cycle);
  await page.locator('#category').selectOption(category);
  await page.locator('#planned').setChecked(planned);
  await page.locator('#save').click();
  if (!pending) await expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'false');
}
async function expectDeletionMarker(page) {
  const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
  expect(JSON.parse(raw)).toEqual({ version: 1, currency: 'USD', subscriptions: [], deletionRevision: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) });
  return raw;
}
test.beforeEach(async ({ page }) => {
  page.failures = [];
  page.pageErrors = [];
  page.outbound = [];
  page.on('pageerror', e => page.pageErrors.push(e.message));
  page.on('requestfailed', request => page.failures.push(request.url()));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4182/')) page.outbound.push(request.url()); });
  await page.goto('/');
});
test.afterEach(async ({ page }) => {
  expect(page.pageErrors).toEqual([]);
  expect(page.failures).toEqual([]);
  expect(page.outbound).toEqual([]);
});
test('starts empty with direct title, attribution, and no saved sample data', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Subscription Cost Analyzer', exact: true })).toBeVisible();
  await expect(page.locator('footer')).toContainText('Built by rdanusha');
  await expect(page.locator('#subscriptionList .empty')).toContainText('Start with your first subscription');
  await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s0\.00/);
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
});
test('mixed billing, plan savings, filter totals and reload persistence', async ({ page }) => {
  await add(page, { name: 'Monthly plan', amount: '12', planned: true });
  await add(page, { name: 'Annual plan', amount: '60', cycle: 'annual', category: 'Utilities' });
  await add(page, { name: 'Quarterly plan', amount: '24', cycle: 'quarterly', category: 'Learning' });
  await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s25\.00/);
  await expect(page.locator('#annualTotal')).toHaveText(/USD\s300\.00/);
  await expect(page.locator('#savingsTotal')).toHaveText(/USD\s144\.00/);
  await expect(page.locator('#remainingTotal')).toHaveText(/USD\s13\.00/);
  await page.locator('#filter').selectOption('planned');
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s25\.00/);
  await expect(page.locator('#listNote')).toContainText('Showing 1 of 3');
  await page.reload();
  await expect(page.locator('.subscription-card')).toHaveCount(3);
  await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s25\.00/);
});
test('edit, zero price, removal confirmation and focus', async ({ page }) => {
  await add(page, { name: 'Edit me', amount: '10' });
  await page.getByRole('button', { name: 'Edit Edit me', exact: true }).click();
  await expect(page.locator('#name')).toBeFocused();
  await page.locator('#amount').fill('0');
  await page.locator('#save').click();
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s0\.00/);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Remove Edit me', exact: true }).click();
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove Edit me', exact: true }).click();
  await expect(page.locator('.subscription-card')).toHaveCount(0);
  await expect(page.locator('#focusAdd')).toBeFocused();
});
test('currency locks for existing rows and JPY rejects fractional amounts', async ({ page }) => {
  await page.locator('#currency').selectOption('JPY');
  await add(page, { amount: '12.5' });
  await expect(page.locator('#formError')).not.toBeEmpty();
  await expect(page.locator('.subscription-card')).toHaveCount(0);
  await add(page, { amount: '100' });
  await expect(page.locator('#monthlyTotal')).toHaveText(/JPY\s100/);
  await expect(page.locator('#currency')).toBeDisabled();
  await page.reload();
  await expect(page.locator('#currency')).toHaveValue('JPY');
  await expect(page.locator('#currency')).toBeDisabled();
});
test('invalid amounts never become free subscriptions', async ({ page }) => {
  for (const amount of ['', '-1', 'Infinity', '1e3', '10abc', '1,25', '0.001', '1000001']) {
    await add(page, { amount });
    await expect(page.locator('#formError')).not.toBeEmpty();
    await expect(page.locator('.subscription-card')).toHaveCount(0);
  }
  await add(page, { name: ' ', amount: '0' });
  await expect(page.locator('#formError')).not.toBeEmpty();
  await expect(page.locator('.subscription-card')).toHaveCount(0);
});
test('HTML-shaped names remain literal after persistence and editing', async ({ page }) => {
  const name = '<img src=x onerror="window.injected=1">';
  await add(page, { name });
  await expect(page.locator('.subscription-name')).toHaveText(name);
  await page.reload();
  await expect(page.locator('.subscription-name')).toHaveText(name);
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(page.locator('#name')).toHaveValue(name);
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});
test('examples do not overwrite, persist, or import the original app data', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('si_subs', 'original-app-fixture'));
  await add(page, { name: 'My real fixture', amount: '7' });
  const before = await page.evaluate(key => localStorage.getItem(key), KEY);
  await page.locator('#examples').click();
  await expect(page.locator('#demoBanner')).toBeVisible();
  await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s129\.00/);
  await page.locator('.subscription-card input[type=checkbox]').first().uncheck();
  await add(page, { name: 'Demo only', amount: '99' });
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(before);
  await page.locator('#exitDemo').click();
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  await expect(page.locator('.subscription-name')).toHaveText('My real fixture');
  await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s7\.00/);
  expect(await page.evaluate(() => localStorage.getItem('si_subs'))).toBe('original-app-fixture');
});
test('delete resets only this app key and remains empty on reload', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('si_subs', 'original-app-fixture'));
  await add(page, { amount: '10' });
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#deleteData').click();
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#deleteData').click();
  await expect(page.locator('#storageStatus')).toContainText('were deleted');
  await expectDeletionMarker(page);
  expect(await page.evaluate(() => localStorage.getItem('si_subs'))).toBe('original-app-fixture');
  await page.reload();
  await expect(page.locator('.subscription-card')).toHaveCount(0);
  await expect(page.locator('#currency')).toBeEnabled();
});
test('corrupt saved data is preserved and editing is blocked until explicit deletion', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, '{broken'), KEY);
  await page.reload();
  await expect(page.locator('#storageError')).toContainText('Saved data could not be read');
  await expect(page.locator('#save')).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe('{broken');
  await page.locator('#examples').click();
  await expect(page.locator('#demoBanner')).toBeVisible();
  await expect(page.locator('#save')).toBeEnabled();
  await page.locator('#exitDemo').click();
  await expect(page.locator('#save')).toBeDisabled();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#deleteData').click();
  await expect(page.locator('#save')).toBeEnabled();
});
test('write failures show unsaved warning while calculator still works', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Fixture quota failure', 'QuotaExceededError'); }; });
  await add(page, { amount: '10' });
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s10\.00/);
  await expect(page.locator('#storageError')).toContainText('Not saved');
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
});
test('blocked storage reads allow in-tab calculations without claiming a save', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = function () { throw new DOMException('Fixture blocked storage', 'SecurityError'); }; });
  await page.reload();
  await expect(page.locator('#storageError')).toContainText('Browser storage is unavailable');
  await add(page, { name: 'Unsaved fixture', amount: '9' });
  await expect(page.locator('#monthlyTotal')).toHaveText(/USD\s9\.00/);
  await expect(page.locator('#storageError')).toContainText('Not saved');
});
test('save checks for changed storage even without a storage event', async ({ page }) => {
  await add(page, { name: 'First version', amount: '5' });
  const externallyChanged = JSON.stringify({ version: 1, currency: 'USD', subscriptions: [] });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, externallyChanged]);
  await add(page, { name: 'Stale attempt', amount: '11' });
  await expect(page.locator('#storageError')).toContainText('Another tab changed');
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(externallyChanged);
  await expect(page.locator('#save')).toBeDisabled();
});
test('delete failure never claims saved data was deleted', async ({ page }) => {
  await add(page);
  const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Fixture blocked delete', 'SecurityError'); }; });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#deleteData').click();
  await expect(page.locator('#storageError')).toContainText('No deletion is confirmed');
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(raw);
  await expect(page.locator('#storageStatus')).not.toContainText('were deleted');
});
test('other tabs cannot overwrite a newly saved or deleted list', async ({ page }) => {
  const second = await page.context().newPage();
  await second.goto('/');
  await add(page, { name: 'First tab', amount: '15' });
  await expect(second.locator('#storageError')).toContainText('Another tab changed');
  await expect(second.locator('#save')).toBeDisabled();
  await second.reload();
  await expect(second.locator('.subscription-name')).toHaveText('First tab');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#deleteData').click();
  await expect(second.locator('#save')).toBeDisabled();
  await expectDeletionMarker(page);
  await second.close();
});
test('overlapping saves under the shared lock accept exactly one baseline', async ({ page }) => {
  const second = await page.context().newPage();
  await second.goto('/');
  // Suppress notifications: the check inside the lock must be sufficient itself.
  for (const tab of [page, second]) await tab.evaluate(() => {
    window.addEventListener('storage', event => event.stopImmediatePropagation(), true);
  });
  await page.evaluate(key => {
    window.lockHeld = false;
    window.hold = navigator.locks.request(`${key}.write`, () => new Promise(resolve => {
      window.releaseWriteLock = resolve;
      window.lockHeld = true;
    }));
  }, KEY);
  await page.waitForFunction(() => window.lockHeld);
  try {
    await add(page, { name: 'Queued first', amount: '7', pending: true });
    await add(second, { name: 'Queued second', amount: '9', pending: true });
    await expect.poll(() => page.evaluate(async key => (await navigator.locks.query()).pending.filter(lock => lock.name === `${key}.write`).length, KEY)).toBe(2);
    expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
    await expect(page.locator('#examples')).toBeDisabled();
    await expect(page.locator('#deleteData')).toBeDisabled();
    // Programmatic overlapping events must also be ignored, not just disabled clicks.
    await page.evaluate(() => {
      document.querySelector('#subscriptionForm').dispatchEvent(new Event('submit', { cancelable: true }));
      document.querySelector('#examples').dispatchEvent(new Event('click'));
      document.querySelector('#deleteData').dispatchEvent(new Event('click'));
    });
  } finally {
    await page.evaluate(() => window.releaseWriteLock());
  }
  await expect(page.locator('.subscription-name')).toHaveText('Queued first');
  await expect(second.locator('#storageError')).toContainText('Another tab changed');
  await expect(second.locator('#save')).toBeDisabled();
  const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
  expect(JSON.parse(raw).subscriptions.map(sub => sub.name)).toEqual(['Queued first']);
  await expect(page.locator('#demoBanner')).toBeHidden();
  await second.close();
});

for (const deleteFirst of [false, true]) {
  test(`queued deletion cannot resurrect an in-flight save (delete first: ${deleteFirst})`, async ({ page }) => {
    await add(page, { name: 'Saved baseline' });
    const second = await page.context().newPage();
    await second.goto('/');
    await page.evaluate(key => {
      window.lockHeld = false;
      window.hold = navigator.locks.request(`${key}.write`, () => new Promise(resolve => {
        window.releaseWriteLock = resolve;
        window.lockHeld = true;
      }));
    }, KEY);
    await page.waitForFunction(() => window.lockHeld);
    const remove = async () => {
      second.once('dialog', dialog => dialog.accept());
      await second.locator('#deleteData').click();
    };
    const save = () => add(page, { name: 'In flight', pending: true });
    try {
      if (deleteFirst) { await remove(); await save(); }
      else { await save(); await remove(); }
      await expect.poll(() => page.evaluate(async key => (await navigator.locks.query()).pending.filter(lock => lock.name === `${key}.write`).length, KEY)).toBe(2);
    } finally {
      await page.evaluate(() => window.releaseWriteLock());
    }
    await expect(second.locator('#storageStatus')).toContainText('were deleted');
    await expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'false');
    await expectDeletionMarker(page);
    await page.reload();
    await expect(page.locator('.subscription-card')).toHaveCount(0);
    await second.close();
  });
}

test('unsupported Web Locks preserve saved raw and never confirm saves or deletion', async ({ page }) => {
  await add(page, { name: 'Protected fixture' });
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }));
  await page.reload();
  await expect(page.locator('#storageError')).toContainText('Web Locks');
  await expect(page.locator('#save')).toBeDisabled();
  await expect(page.locator('#storageStatus')).not.toContainText('Saved in this browser');
  await page.evaluate(() => document.querySelector('#subscriptionForm').dispatchEvent(new Event('submit', { cancelable: true })));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#deleteData').click();
  await expect(page.locator('#storageError')).toContainText('No deletion is confirmed');
  await expect(page.locator('#storageStatus')).not.toContainText('were deleted');
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(raw);
  await expect(page.locator('.subscription-name')).toHaveText('Protected fixture');
});

for (const baseline of ['first-ever', 'quota-unsaved', 'previous-reset']) {
  for (const deleteFirst of [true, false]) {
    test(`reset marker invalidates queued ${baseline} save (delete first: ${deleteFirst})`, async ({ page }) => {
      await page.evaluate(() => localStorage.setItem('unrelated-fixture', 'preserve me'));
      if (baseline === 'quota-unsaved') {
        await page.evaluate(() => {
          window.originalSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function () { throw new DOMException('Quota fixture', 'QuotaExceededError'); };
        });
        await add(page, { name: 'Unsaved existing record' });
        await expect(page.locator('.subscription-card')).toHaveCount(1);
        expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBeNull();
        await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
      }
      if (baseline === 'previous-reset') {
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#deleteData').click();
        await expect(page.locator('#storageStatus')).toContainText('were deleted');
      }
      const before = await page.evaluate(key => localStorage.getItem(key), KEY);
      const second = await page.context().newPage();
      await second.goto('/');
      // Ensure the in-lock exact-raw check, not event delivery, rejects stale candidates.
      for (const tab of [page, second]) await tab.evaluate(() => {
        window.addEventListener('storage', event => event.stopImmediatePropagation(), true);
      });
      await page.evaluate(key => {
        window.hold = navigator.locks.request(`${key}.write`, () => new Promise(resolve => {
          window.releaseWriteLock = resolve;
          window.lockHeld = true;
        }));
      }, KEY);
      await page.waitForFunction(() => window.lockHeld);
      const pending = count => expect.poll(() => page.evaluate(async key => (await navigator.locks.query()).pending.filter(lock => lock.name === `${key}.write`).length, KEY)).toBe(count);
      const remove = async () => {
        second.once('dialog', dialog => dialog.accept());
        await second.locator('#deleteData').click();
      };
      const save = async () => {
        if (baseline === 'quota-unsaved') await page.locator('.subscription-card input[type=checkbox]').evaluate(checkbox => {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
        else await add(page, { name: 'Stale first add', pending: true });
      };
      try {
        if (deleteFirst) { await remove(); await pending(1); await save(); }
        else { await save(); await pending(1); await remove(); }
        await pending(2);
      } finally {
        await page.evaluate(() => window.releaseWriteLock());
      }
      await expect(second.locator('#storageStatus')).toContainText('were deleted');
      await expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'false');
      // Check the actual resurrection symptom before asserting marker shape.
      const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
      expect(raw === null ? [] : JSON.parse(raw).subscriptions).toEqual([]);
      await expectDeletionMarker(page);
      expect(raw).not.toBe(before);
      if (deleteFirst) {
        await expect(page.locator('#storageError')).toContainText('Another tab changed');
        await expect(page.locator('#save')).toBeDisabled();
      }
      expect(await page.evaluate(() => localStorage.getItem('unrelated-fixture'))).toBe('preserve me');
      await page.reload();
      await expect(page.locator('.subscription-card')).toHaveCount(0);
      await expect(page.locator('#currency')).toHaveValue('USD');
      await second.close();
    });
  }
}

test('repeat deletion refreshes anonymous revision and next save uses normal schema', async ({ page }) => {
  await page.locator('#currency').selectOption('JPY');
  await add(page, { name: 'Private fixture', amount: '100' });
  const revisions = [];
  for (let i = 0; i < 3; i++) {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#deleteData').click();
    await expect(page.locator('#storageStatus')).toContainText('were deleted');
    revisions.push(JSON.parse(await expectDeletionMarker(page)).deletionRevision);
    await expect(page.locator('#currency')).toHaveValue('USD');
  }
  expect(new Set(revisions).size).toBe(3);
  await page.reload();
  await add(page, { name: 'New list' });
  const saved = JSON.parse(await page.evaluate(key => localStorage.getItem(key), KEY));
  expect(Object.keys(saved).sort()).toEqual(['currency', 'subscriptions', 'version']);
  expect(saved.subscriptions.map(sub => sub.name)).toEqual(['New list']);
});

for (const operation of ['save', 'delete']) {
  test(`rejected Web Lock ${operation} preserves raw and never confirms success`, async ({ page }) => {
    await add(page, { name: 'Protected fixture' });
    const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: {
        request: () => Promise.reject(new DOMException('Fixture rejected lock', 'SecurityError')),
      } });
    });
    if (operation === 'save') {
      await add(page, { name: 'Rejected fixture' });
      await expect(page.locator('#storageError')).toContainText('Not saved');
      await expect(page.locator('#storageStatus')).not.toContainText('Saved in this browser');
      await expect(page.locator('#save')).toBeDisabled();
    } else {
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#deleteData').click();
      await expect(page.locator('#storageError')).toContainText('No deletion is confirmed');
      await expect(page.locator('#storageStatus')).not.toContainText('were deleted');
    }
    expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(raw);
    await expect(page.locator('.subscription-name')).toHaveText('Protected fixture');
    await expect(page.locator('#subscriptionForm')).toHaveAttribute('aria-busy', 'false');
  });
}

for (const failure of ['missing', 'throws']) {
  test(`secure deletion UUID ${failure} fails closed`, async ({ page }) => {
    await add(page, { name: 'Keep in memory' });
    const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
    await page.evaluate(failure => Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: failure === 'missing' ? undefined : () => { throw new Error('Fixture UUID failure'); },
    }), failure);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#deleteData').click();
    await expect(page.locator('#storageError')).toContainText('No deletion is confirmed');
    await expect(page.locator('#storageStatus')).not.toContainText('were deleted');
    await expect(page.locator('.subscription-name')).toHaveText('Keep in memory');
    expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(raw);
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`responsive layout and labeled inputs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#examples').click();
    await add(page, { name: 'A'.repeat(100), amount: '1000000' });
    const size = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    expect(size.page).toBeLessThanOrEqual(size.viewport);
    expect(await page.locator('input,select').evaluateAll(inputs => inputs.every(input => input.getAttribute('aria-label') || input.labels.length))).toBe(true);
    const controlHeights = await page.locator('input:not([type="checkbox"]),select,button').evaluateAll(controls => controls.map(control => control.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0).map(rect => rect.height));
    expect(controlHeights.every(height => height >= 44)).toBe(true);
    if (width === 390 || width === 1440) {
      // Clean fictional examples only, never screenshot a user's saved list.
      await page.locator('#exitDemo').click(); await page.locator('#examples').click();
      fs.mkdirSync(path.join(root, 'release'), { recursive: true });
      await page.screenshot({ path: path.join(root, `release/app-${width === 390 ? 'mobile' : 'desktop'}.png`), fullPage: true });
    }
  });
}
test('sharing image comes from fictional examples and metadata is present', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.locator('#examples').click();
  await page.screenshot({ path: path.join(root, 'social-preview.png'), style: `
    .toolbar, #currencyHelp, #storageStatus, #storageError, .workspace, .information, .header-actions, #exitDemo { display: none !important; }
    header { padding-top: 12px; padding-bottom: 11px; }
    footer { position: fixed; bottom: 5px; left: 0; right: 0; }
    .demo { padding: 7px 12px; margin: 0 0 12px; }
    .demo p { display: none; }
    .summary-card { padding: 12px 15px; }
    .metric-heading { margin-bottom: 5px; }
    .summary-grid { margin-bottom: 16px; }
    .insights-grid { margin-bottom: 0; gap: 16px; }
    .insights-grid .panel { padding: 16px; }
    .category-layout { min-height: 155px; }
    .category-legend { gap: 3px; }
    .legend-row { font-size: .64rem; gap: 5px; grid-template-columns: 6px minmax(0, 1.3fr) minmax(32px, 1fr) auto 24px; }
    .legend-track { grid-column: auto; grid-row: auto; height: 4px; }
    .legend-value { grid-column: auto; grid-row: auto; font-size: .64rem; }
    .legend-percent { grid-column: auto; grid-row: auto; font-size: .6rem; }
    .chart-heading { margin-bottom: 10px; }
    .donut { width: 155px; height: 155px; }
    .donut::before { inset: 17px; }
    .plan-bars { margin: 16px 0; }
    .chart-footnote { margin-top: 10px; }
    footer { padding-top: 12px; padding-bottom: 0; font-size: .7rem; }
  ` });
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://rdanusha.github.io/subscription-cost-analyzer/social-preview.png');
  const image = await page.request.get('/social-preview.png');
  expect(image.status()).toBe(200);
});
