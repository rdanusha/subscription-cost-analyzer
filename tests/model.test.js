'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../model.js');

function record(overrides = {}) {
  return { id: 'sub_1', name: 'Example', category: 'Entertainment', cycle: 'monthly', amount: '10.00', planned: false, ...overrides };
}
function state(subscriptions = [], currency = 'USD') {
  return { version: 1, currency, subscriptions };
}
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}

test('exports exact constants and clean fresh states', () => {
  assert.deepEqual(M.CURRENCIES, { USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, INR: 2, LKR: 2, JPY: 0 });
  assert.deepEqual(M.CATEGORIES, ['Entertainment', 'Productivity', 'Health', 'Utilities', 'Learning', 'Streaming', 'Software & Dev Tools', 'Finance', 'Business', 'News & Media', 'Gaming', 'Storage & Cloud', 'Other']);
  assert.deepEqual(M.CYCLES, { monthly: 12, quarterly: 4, annual: 1 });
  assert.deepEqual(M.newState(), state());
  assert.deepEqual(M.newState('JPY'), state([], 'JPY'));
  assert.notEqual(M.newState().subscriptions, M.newState().subscriptions);
  assert.throws(() => M.newState('XXX'));
});

test('expanded categories preserve legacy category values and total conservation', () => {
  const categories = ['Entertainment', 'Productivity', 'Health', 'Utilities', 'Learning', 'Streaming', 'Software & Dev Tools', 'Finance', 'Business', 'News & Media', 'Gaming', 'Storage & Cloud', 'Other'];
  const rows = categories.map((category, i) => record({ id: `category_${i}`, category, amount: '1.00' }));
  const value = state(rows);
  assert.deepEqual(M.deserialize(M.serialize(value)), value);
  const totals = M.summary(value);
  assert.equal(totals.categories.length, 13);
  assert.equal(totals.annualMinor, 15600);
  assert.equal(totals.monthlyMinor, 1300);
  for (const category of totals.categories) assert.equal(category.annualMinor, 1200);
  const legacy = state(['Entertainment', 'Productivity', 'Health', 'Utilities', 'Learning', 'Other'].map((category, i) => record({ id: `legacy_${i}`, category })));
  assert.deepEqual(M.deserialize(JSON.stringify(legacy)), legacy);
});

test('empty and free subscriptions have zero costs', () => {
  assert.deepEqual(M.summary(state()), { count: 0, annualMinor: 0, monthlyMinor: 0, savingsAnnualMinor: 0, savingsMonthlyMinor: 0, remainingAnnualMinor: 0, remainingMonthlyMinor: 0, plannedCount: 0, categories: M.CATEGORIES.map(name => ({ name, annualMinor: 0, monthlyMinor: 0 })) });
  const result = M.summary(state([record({ amount: '0', planned: true })]));
  assert.equal(result.count, 1);
  assert.equal(result.plannedCount, 1);
  assert.equal(result.annualMinor, 0);
  assert.equal(result.remainingMonthlyMinor, 0);
});

test('mixed cycles and categories use independently expected annual totals', () => {
  const input = state([
    record({ id: 'm', amount: '12.34' }),
    record({ id: 'q', amount: '25.50', cycle: 'quarterly', category: 'Productivity' }),
    record({ id: 'a', amount: '99.99', cycle: 'annual', category: 'Entertainment' })
  ]);
  const result = M.summary(input);
  assert.equal(result.count, 3);
  assert.equal(result.annualMinor, 35007);
  assert.equal(result.monthlyMinor, 2917.25);
  assert.deepEqual(result.categories[0], { name: 'Entertainment', annualMinor: 24807, monthlyMinor: 2067.25 });
  assert.deepEqual(result.categories[1], { name: 'Productivity', annualMinor: 10200, monthlyMinor: 850 });
  assert.equal(M.annualMinor(input.subscriptions[0], 'USD'), 14808);
  assert.equal(M.annualMinor(input.subscriptions[1], 'USD'), 10200);
  assert.equal(M.annualMinor(input.subscriptions[2], 'USD'), 9999);
});

test('tiny annual costs aggregate before averaging, never row-rounded', () => {
  const input = state(Array.from({ length: 12 }, (_, i) => record({ id: `tiny_${i}`, amount: '0.01', cycle: 'annual' })));
  assert.equal(M.summary(input).annualMinor, 12);
  assert.equal(M.summary(input).monthlyMinor, 1);
  assert.equal(M.summary(input).categories[0].monthlyMinor, 1);
});

test('planned savings are hypothetical and do not remove records or costs', () => {
  const input = state([record({ amount: '10', planned: true }), record({ id: 'keep', amount: '5' })]);
  const result = M.summary(input);
  assert.equal(result.count, 2);
  assert.equal(result.annualMinor, 18000);
  assert.equal(result.monthlyMinor, 1500);
  assert.equal(result.savingsAnnualMinor, 12000);
  assert.equal(result.savingsMonthlyMinor, 1000);
  assert.equal(result.remainingAnnualMinor, 6000);
  assert.equal(result.remainingMonthlyMinor, 500);
  assert.equal(result.plannedCount, 1);
  assert.equal(input.subscriptions.length, 2);
});

test('parseMinor supports currency precision, zero, canonicalization and inclusive cap', () => {
  for (const currency of Object.keys(M.CURRENCIES)) {
    assert.equal(M.parseMinor('0', currency), 0);
    assert.equal(M.parseMinor('1000000', currency), currency === 'JPY' ? 1000000 : 100000000);
    assert.equal(M.parseMinor('00012', currency), currency === 'JPY' ? 12 : 1200);
    assert.equal(M.validateSubscription(record({ amount: '00012' }), currency).amount, currency === 'JPY' ? '12' : '12.00');
    if (currency !== 'JPY') {
      assert.equal(M.parseMinor('1.2', currency), 120);
      assert.equal(M.parseMinor('0.01', currency), 1);
      assert.equal(M.validateSubscription(record({ amount: '001.2' }), currency).amount, '1.20');
    }
  }
});

test('parseMinor rejects nonstrings, malformed decimals, excess precision and overflow', () => {
  for (const amount of [undefined, null, 0, 12, NaN, Infinity, true, {}, [], '', ' ', ' 1', '1 ', '-0', '-1', '+1', '.1', '1.', '1e2', 'Infinity', 'NaN', '12usd', '1,000', '0x10', '1\n', '1.001', '1000000.01', '1000001', '9'.repeat(1000)]) {
    assert.throws(() => M.parseMinor(amount, 'USD'), `accepted ${String(amount)}`);
  }
  for (const amount of ['1.0', '0.01', '1000001']) assert.throws(() => M.parseMinor(amount, 'JPY'));
  for (const currency of [null, undefined, 'usd', 'XXX', 'toString', '__proto__', 2]) assert.throws(() => M.parseMinor('1', currency));
});

test('subscription validation trims names, preserves text and discards unknown fields', () => {
  const malicious = '<img src=x onerror="globalThis.pwned=true">';
  const source = record({ name: `  ${malicious}  `, extra: 'discard' });
  const result = M.validateSubscription(source, 'USD');
  assert.deepEqual(result, record({ name: malicious }));
  assert.notEqual(result, source);
  assert.equal(globalThis.pwned, undefined);
  assert.equal(M.validateSubscription(record({ name: 'x'.repeat(100), id: 'a'.repeat(80) }), 'USD').name.length, 100);
});

test('subscription validation requires every own field and exact types', () => {
  for (const field of ['id', 'name', 'category', 'cycle', 'amount', 'planned']) {
    const missing = record(); delete missing[field];
    assert.throws(() => M.validateSubscription(missing, 'USD'), field);
    const inherited = Object.assign(Object.create({ [field]: record()[field] }), missing);
    assert.throws(() => M.validateSubscription(inherited, 'USD'), `inherited ${field}`);
    const getter = record(); Object.defineProperty(getter, field, { get() { throw new Error('getter must not execute'); } });
    assert.throws(() => M.validateSubscription(getter, 'USD'), /data|own|field/i);
  }
  for (const value of [null, [], 'x', 1, false]) assert.throws(() => M.validateSubscription(value, 'USD'));
  for (const id of ['', 'bad id', '<script>', 'a/b', 'é', 'a'.repeat(81), 1]) assert.throws(() => M.validateSubscription(record({ id }), 'USD'));
  for (const name of ['', '  ', 'x'.repeat(101), 5, null]) assert.throws(() => M.validateSubscription(record({ name }), 'USD'));
  for (const category of ['Unknown', 'toString', null, 1]) assert.throws(() => M.validateSubscription(record({ category }), 'USD'));
  for (const cycle of ['weekly', 'toString', '__proto__', 12, null]) assert.throws(() => M.validateSubscription(record({ cycle }), 'USD'));
  for (const planned of [0, 1, 'false', null]) assert.throws(() => M.validateSubscription(record({ planned }), 'USD'));
  assert.throws(() => M.annualMinor(record({ amount: 2 }), 'USD'));
});

test('state rejects corrupt schema, inherited fields and unsupported versions', () => {
  for (const value of [null, [], 1, '', {}, { currency: 'USD', subscriptions: [] }, state([], 'XXX'), { ...state(), version: '1' }, { ...state(), version: 2 }, { ...state(), subscriptions: {} }, { ...state(), subscriptions: [null] }]) {
    assert.throws(() => M.validateState(value));
    assert.throws(() => M.summary(value));
    assert.throws(() => M.serialize(value));
  }
  for (const field of ['version', 'currency', 'subscriptions']) {
    const missing = state(); delete missing[field];
    assert.throws(() => M.validateState(Object.assign(Object.create({ [field]: state()[field] }), missing)));
  }
});

test('enforces unique IDs and maximum 500 subscriptions', () => {
  assert.throws(() => M.validateState(state([record(), record()])));
  const records = Array.from({ length: 500 }, (_, i) => record({ id: `s${i}`, amount: '1000000' }));
  assert.equal(M.validateState(state(records)).subscriptions.length, 500);
  assert.equal(M.summary(state(records)).annualMinor, 600000000000);
  assert.throws(() => M.validateState(state([...records, record({ id: 'overflow' })])));
});

test('rejects sparse arrays and accessors without executing them', () => {
  let reads = 0;
  const input = state();
  Object.defineProperty(input, 'currency', { get() { reads += 1; return 'USD'; } });
  assert.throws(() => M.validateState(input), /data|own|field/i);
  const rows = [record()];
  Object.defineProperty(rows, '0', { get() { reads += 1; return record(); } });
  assert.throws(() => M.validateState(state(rows)), /data|own|field/i);
  assert.throws(() => M.validateState(state(new Array(1))));
  assert.equal(reads, 0);
  assert.throws(() => M.validateSubscription(record({ id: 'safe\n' }), 'USD'));
  assert.equal(Object.isFrozen(M.CURRENCIES), true);
  assert.equal(Object.isFrozen(M.CYCLES), true);
  assert.equal(Object.isFrozen(M.CATEGORIES), true);
});

test('fractional monthly savings and remainders retain full annual precision', () => {
  const result = M.summary(state([
    record({ id: 'planned', amount: '0.01', cycle: 'annual', planned: true }),
    record({ id: 'remaining', amount: '0.02', cycle: 'annual' })
  ]));
  assert.equal(result.annualMinor, 3);
  assert.equal(result.monthlyMinor, 0.25);
  assert.equal(result.savingsAnnualMinor, 1);
  assert.equal(result.savingsMonthlyMinor, 1 / 12);
  assert.equal(result.remainingAnnualMinor, 2);
  assert.equal(result.remainingMonthlyMinor, 2 / 12);
});

test('validation, summary, annual cost and serialization never mutate frozen inputs', () => {
  const original = frozen({ ...state([record({ name: ' Trim me ', amount: '001.2', ignored: true })]), ignored: true });
  const normalized = M.validateState(original);
  assert.deepEqual(normalized, state([record({ name: 'Trim me', amount: '1.20' })]));
  assert.notEqual(normalized, original);
  assert.notEqual(normalized.subscriptions, original.subscriptions);
  assert.notEqual(normalized.subscriptions[0], original.subscriptions[0]);
  M.summary(original); M.annualMinor(original.subscriptions[0], 'USD'); M.serialize(original);
  assert.equal(original.subscriptions[0].amount, '001.2');
  assert.equal(original.subscriptions[0].name, ' Trim me ');
});

test('serialization roundtrips sanitized schema and throws for corrupt storage', () => {
  const input = state([record({ amount: '2.5', extra: 'discard' })]);
  const serialized = M.serialize(input);
  assert.equal(serialized, JSON.stringify(state([record({ amount: '2.50' })])));
  assert.deepEqual(M.deserialize(serialized), M.validateState(input));
  for (const raw of [undefined, null, 12, {}, '', '{', 'null', '[]', '{}', JSON.stringify(state([record(), record()])), JSON.stringify({ ...state(), version: 99 }), ' '.repeat(1048577)]) assert.throws(() => M.deserialize(raw));
  const valid = JSON.stringify(state());
  assert.deepEqual(M.deserialize(valid + ' '.repeat(1048576 - valid.length)), state());
  assert.throws(() => M.deserialize(JSON.stringify({ ...state(), extra: 'é'.repeat(524288) })));
});

test('formatMoney formats all currencies with code and accepts fractional minor units', () => {
  assert.equal(M.formatMoney(1234, 'USD'), 'USD\u00a012.34');
  assert.equal(M.formatMoney(1234, 'JPY'), 'JPY\u00a01,234');
  assert.equal(M.formatMoney(0, 'USD'), 'USD\u00a00.00');
  assert.equal(M.formatMoney(0.6, 'USD'), 'USD\u00a00.01');
  for (const currency of Object.keys(M.CURRENCIES)) {
    const expected = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: M.CURRENCIES[currency], maximumFractionDigits: M.CURRENCIES[currency] }).format(1234 / (10 ** M.CURRENCIES[currency]));
    assert.equal(M.formatMoney(1234, currency), expected);
  }
  for (const amount of [-1, NaN, Infinity, -Infinity, '10', null, undefined]) assert.throws(() => M.formatMoney(amount, 'USD'));
  assert.throws(() => M.formatMoney(1, 'XXX'));
});

test('UMD browser global exposes same API without CommonJS or DOM', () => {
  const context = vm.createContext({ Intl });
  vm.runInContext(fs.readFileSync(require.resolve('../model.js'), 'utf8'), context);
  const browser = context.SubscriptionModel;
  assert.deepEqual(Object.keys(browser).sort(), Object.keys(M).sort());
  assert.equal(browser.parseMinor('12.34', 'USD'), 1234);
  assert.equal(browser.serialize(browser.newState()), JSON.stringify(state()));
  assert.equal(browser.summary(browser.newState()).annualMinor, 0);
});
