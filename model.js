(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SubscriptionModel = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CURRENCIES = Object.freeze({ USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, INR: 2, LKR: 2, JPY: 0 });
  const CATEGORIES = Object.freeze(['Entertainment', 'Productivity', 'Health', 'Utilities', 'Learning', 'Streaming', 'Software & Dev Tools', 'Finance', 'Business', 'News & Media', 'Gaming', 'Storage & Cloud', 'Other']);
  const CYCLES = Object.freeze({ monthly: 12, quarterly: 4, annual: 1 });
  const MAX_RECORDS = 500;
  const MAX_AMOUNT = 1000000;
  const MAX_PAYLOAD_BYTES = 1048576;
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function currencyDigits(currency) {
    if (typeof currency !== 'string' || !hasOwn(CURRENCIES, currency)) {
      throw new RangeError('Unsupported currency');
    }
    return CURRENCIES[currency];
  }

  function requireObject(value, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(label + ' must be an object');
    }
  }

  // Do not read inherited fields or invoke accessors on untrusted objects.
  function ownField(value, key) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !hasOwn(descriptor, 'value')) {
      throw new Error('Required own data field: ' + key);
    }
    return descriptor.value;
  }

  function newState(currency = 'USD') {
    currencyDigits(currency);
    return { version: 1, currency, subscriptions: [] };
  }

  function parseMinor(amount, currency) {
    const digits = currencyDigits(currency);
    const pattern = digits === 0 ? /^[0-9]+$/ : /^[0-9]+(?:\.[0-9]{1,2})?$/;
    // The final check prevents JavaScript's $ anchor from accepting a final newline.
    if (typeof amount !== 'string' || !pattern.test(amount) || /\s/.test(amount)) {
      throw new Error('Amount must be an unsigned decimal string with valid currency precision');
    }
    const parts = amount.split('.');
    const whole = Number(parts[0]);
    const factor = 10 ** digits;
    const fraction = digits ? Number((parts[1] || '').padEnd(digits, '0')) : 0;
    const minor = whole * factor + fraction;
    if (!Number.isSafeInteger(minor) || minor > MAX_AMOUNT * factor) {
      throw new RangeError('Amount exceeds the per-cycle limit of 1000000');
    }
    return minor;
  }

  function canonicalAmount(minor, digits) {
    const factor = 10 ** digits;
    const whole = Math.floor(minor / factor);
    return digits ? String(whole) + '.' + String(minor % factor).padStart(digits, '0') : String(whole);
  }

  function validateSubscription(value, currency) {
    const digits = currencyDigits(currency);
    requireObject(value, 'Subscription');
    const id = ownField(value, 'id');
    const rawName = ownField(value, 'name');
    const category = ownField(value, 'category');
    const cycle = ownField(value, 'cycle');
    const amount = ownField(value, 'amount');
    const planned = ownField(value, 'planned');
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || /\s/.test(id)) {
      throw new Error('Subscription ID must contain 1 to 80 safe characters');
    }
    if (typeof rawName !== 'string') throw new Error('Subscription name must be a string');
    const name = rawName.trim();
    if (name.length < 1 || name.length > 100) throw new RangeError('Subscription name must contain 1 to 100 characters');
    if (typeof category !== 'string' || !CATEGORIES.includes(category)) throw new Error('Invalid subscription category');
    if (typeof cycle !== 'string' || !hasOwn(CYCLES, cycle)) throw new Error('Invalid subscription cycle');
    if (typeof planned !== 'boolean') throw new Error('Planned must be a boolean');
    const minor = parseMinor(amount, currency);
    return { id, name, category, cycle, amount: canonicalAmount(minor, digits), planned };
  }

  function validateState(value) {
    requireObject(value, 'State');
    if (ownField(value, 'version') !== 1) throw new Error('Unsupported state version');
    const currency = ownField(value, 'currency');
    currencyDigits(currency);
    const source = ownField(value, 'subscriptions');
    if (!Array.isArray(source)) throw new Error('Subscriptions must be an array');
    if (source.length > MAX_RECORDS) throw new RangeError('At most 500 subscriptions are supported');
    const subscriptions = [];
    const ids = new Set();
    for (let index = 0; index < source.length; index += 1) {
      const subscription = validateSubscription(ownField(source, String(index)), currency);
      if (ids.has(subscription.id)) throw new Error('Duplicate subscription ID');
      ids.add(subscription.id);
      subscriptions.push(subscription);
    }
    return { version: 1, currency, subscriptions };
  }

  function annualMinor(subscription, currency) {
    const valid = validateSubscription(subscription, currency);
    return parseMinor(valid.amount, currency) * CYCLES[valid.cycle];
  }

  function summary(state) {
    const valid = validateState(state);
    const categories = CATEGORIES.map(name => ({ name, annualMinor: 0, monthlyMinor: 0 }));
    let total = 0;
    let savings = 0;
    let plannedCount = 0;
    for (const subscription of valid.subscriptions) {
      const cost = parseMinor(subscription.amount, valid.currency) * CYCLES[subscription.cycle];
      total += cost;
      categories[CATEGORIES.indexOf(subscription.category)].annualMinor += cost;
      if (subscription.planned) {
        savings += cost;
        plannedCount += 1;
      }
    }
    for (const category of categories) category.monthlyMinor = category.annualMinor / 12;
    const remaining = total - savings;
    return {
      count: valid.subscriptions.length,
      annualMinor: total,
      monthlyMinor: total / 12,
      savingsAnnualMinor: savings,
      savingsMonthlyMinor: savings / 12,
      remainingAnnualMinor: remaining,
      remainingMonthlyMinor: remaining / 12,
      plannedCount,
      categories
    };
  }

  function formatMoney(minor, currency) {
    const digits = currencyDigits(currency);
    if (typeof minor !== 'number' || !Number.isFinite(minor) || minor < 0) {
      throw new RangeError('Money must be a finite nonnegative number of minor units');
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, currencyDisplay: 'code',
      minimumFractionDigits: digits, maximumFractionDigits: digits
    }).format((minor === 0 ? 0 : minor) / (10 ** digits));
  }

  function serialize(state) {
    return JSON.stringify(validateState(state));
  }

  function deserialize(raw) {
    if (typeof raw !== 'string') throw new Error('Stored state must be a JSON string');
    if (raw.length > MAX_PAYLOAD_BYTES) throw new RangeError('Stored state exceeds 1 MiB');
    // Count UTF-8 bytes without Node-only globals so browser and CommonJS agree.
    let bytes = 0;
    for (const character of raw) {
      const point = character.codePointAt(0);
      bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (bytes > MAX_PAYLOAD_BYTES) throw new RangeError('Stored state exceeds 1 MiB');
    }
    return validateState(JSON.parse(raw));
  }

  return Object.freeze({
    CURRENCIES, CATEGORIES, CYCLES, newState, validateState, validateSubscription,
    parseMinor, summary, annualMinor, formatMoney, serialize, deserialize
  });
}));
