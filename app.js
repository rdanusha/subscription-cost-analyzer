/* Subscription Cost Analyzer. MIT License. */
'use strict';
const M = SubscriptionModel;
const KEY = 'rdanusha.subscription-cost-analyzer.v1';
const CATEGORY_STYLE = Object.freeze({
  Entertainment: { color: '#b49bff', icon: '🎬' },
  Productivity: { color: '#63b3ff', icon: '🛠️' },
  Health: { color: '#fb9c75', icon: '💪', label: 'Health & Fitness' },
  Utilities: { color: '#f472b6', icon: '☁️' },
  Learning: { color: '#fbbf24', icon: '📚' },
  Streaming: { color: '#c084fc', icon: '📺' },
  'Software & Dev Tools': { color: '#38bdf8', icon: '🛠️' },
  Finance: { color: '#4ade80', icon: '💰' },
  Business: { color: '#818cf8', icon: '💼' },
  'News & Media': { color: '#fb923c', icon: '📰' },
  Gaming: { color: '#e879f9', icon: '🎮' },
  'Storage & Cloud': { color: '#22d3ee', icon: '☁️' },
  Other: { color: '#2dd4bf', icon: '🧩' },
});
const displayCategory = name => CATEGORY_STYLE[name].label || name;
const $ = id => document.getElementById(id);
let ownState = M.newState();
let state = ownState;
let lastRaw = null;
let isDemo = false;
let locked = false;
let warning = '';
let editId = null;
let fallbackId = 0;
let saved = false;
let busy = false;
const WRITE_LOCK = `${KEY}.write`;
const hasWriteLock = () => typeof navigator.locks?.request === 'function';
const lockWarning = 'Not saved: coordinated browser storage requires Web Locks, which are unavailable. Your saved data is protected; this tab is read-only.';
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function load() {
  try {
    lastRaw = localStorage.getItem(KEY);
    if (lastRaw !== null) {
      try { ownState = M.deserialize(lastRaw); saved = true; }
      catch (_) {
        locked = true;
        warning = 'Saved data could not be read safely. It has not been changed. Use Delete my data to reset this app, or preserve the saved value using your browser tools before resetting.';
      }
    }
  } catch (_) {
    warning = 'Browser storage is unavailable. You can calculate in this tab, but changes will not be saved while storage is unavailable.';
  }
  if (!hasWriteLock()) { locked = true; warning = warning ? `${warning} ${lockWarning}` : lockWarning; }
  state = ownState;
}
function resetForm() {
  editId = null;
  $('subscriptionForm').reset();
  $('formTitle').textContent = 'Add subscription';
  $('save').textContent = 'Add subscription';
  $('cancelEdit').hidden = true;
  $('formError').textContent = '';
  for (const input of [$('name'), $('amount')]) input.removeAttribute('aria-invalid');
}
async function persist(candidate) {
  if (busy) return false;
  const next = M.validateState(candidate);
  if (isDemo) { state = next; render(); return true; }
  if (locked) { render(); return false; }
  if (!hasWriteLock()) { locked = true; warning = lockWarning; render(); return false; }
  busy = true;
  render();
  try {
    return await navigator.locks.request(WRITE_LOCK, { mode: 'exclusive' }, () => {
      // Both the baseline check and mutation must run inside the same origin lock.
      // A storage event may have protected this tab while its request was queued.
      if (locked) return false;
      let raw;
      try { raw = localStorage.getItem(KEY); }
      catch (_) {
        ownState = state = next;
        saved = false;
        warning = 'Not saved: browser storage is unavailable. Your changes are only in this tab and may be lost on reload.';
        return true;
      }
      if (raw !== lastRaw) {
        locked = true;
        warning = 'Another tab changed this saved list. Reload this page to use the latest saved data. This tab is read-only until you reload or delete this app\'s data.';
        return false;
      }
      try {
        const serialized = M.serialize(next);
        localStorage.setItem(KEY, serialized);
        lastRaw = serialized;
        saved = true;
        warning = '';
      } catch (_) {
        saved = false;
        warning = 'Not saved: browser storage could not save your changes. They are only in this tab. Reloading may restore an older list.';
      }
      ownState = state = next;
      return true;
    });
  } catch (_) {
    locked = true;
    saved = false;
    warning = 'Not saved: the browser could not coordinate storage safely. Saved data has not been changed. This tab is read-only; reload to try again.';
    return false;
  } finally {
    busy = false;
    render();
  }
}
function render() {
  $('subscriptionForm').setAttribute('aria-busy', String(busy));
  const totals = M.summary(state);
  const money = value => M.formatMoney(value, state.currency);
  $('monthlyTotal').textContent = money(totals.monthlyMinor);
  $('annualTotal').textContent = money(totals.annualMinor);
  $('savingsTotal').textContent = money(totals.savingsAnnualMinor);
  $('remainingTotal').textContent = money(totals.remainingMonthlyMinor);
  $('countLabel').textContent = `${totals.count} subscription${totals.count === 1 ? '' : 's'}`;
  $('plannedLabel').textContent = `${totals.plannedCount} marked for consideration`;
  $('currency').value = state.currency;
  $('currency').disabled = busy || state.subscriptions.length > 0 || (locked && !isDemo);
  $('currencyHelp').textContent = state.subscriptions.length ? 'Currency is locked while entries exist. All entries use this currency. No conversion is performed.' : 'Use one currency for every entry. No currency conversion.';
  $('amountCurrency').textContent = state.currency;
  $('amountHelp').textContent = M.CURRENCIES[state.currency] === 0 ? 'Use whole amounts, without decimals. Zero is allowed.' : 'Use a dot for decimals, with up to 2 decimal places. Zero is allowed.';
  $('demoBanner').hidden = !isDemo;
  $('examples').disabled = busy || isDemo;
  $('exitDemo').disabled = busy;
  $('deleteData').disabled = busy;
  $('storageError').hidden = !warning;
  $('storageError').textContent = warning;
  $('storageStatus').textContent = isDemo ? 'Example mode: changes are not saved. Exit examples to return to your list.' : locked ? 'Saved data is protected. Editing is disabled until the issue is resolved.' : saved ? 'Saved in this browser for this site. Not synced to other devices.' : 'Your list starts empty. Added entries are saved in this browser when storage is available.';
  for (const control of $('subscriptionForm').querySelectorAll('input, select, button')) control.disabled = busy || (locked && !isDemo);
  $('focusAdd').disabled = busy || (locked && !isDemo);
  $('quickAdd').disabled = busy || (locked && !isDemo);
  renderList();
  renderCharts(totals);
}
function renderCharts(totals) {
  const money = value => M.formatMoney(value, state.currency);
  const categories = totals.categories.filter(item => item.annualMinor > 0);
  const legend = $('categoryLegend');
  const donut = $('categoryDonut');
  legend.replaceChildren();
  donut.classList.toggle('is-empty', !totals.annualMinor);
  $('donutTotal').textContent = money(totals.monthlyMinor);
  $('donutCount').textContent = `${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`;
  let cursor = 0;
  const stops = [];
  const descriptions = [];
  for (const category of categories) {
    const style = CATEGORY_STYLE[category.name];
    const share = category.annualMinor / totals.annualMinor * 100;
    const shareText = share < 1 ? '<1%' : `${Math.round(share)}%`;
    const next = cursor + share;
    stops.push(`${style.color} ${cursor}% ${next}%`);
    cursor = next;
    const row = element('div', 'legend-row');
    row.dataset.category = category.name;
    row.style.setProperty('--category-color', style.color);
    const dot = element('i', 'key-dot'); dot.setAttribute('aria-hidden', 'true');
    const name = element('span', 'legend-name', displayCategory(category.name));
    const value = element('strong', 'legend-value', money(category.monthlyMinor));
    const percentage = element('span', 'legend-percent', shareText);
    row.append(dot, name, value, percentage);
    legend.append(row);
    descriptions.push(`${displayCategory(category.name)}: ${money(category.monthlyMinor)} per month, ${shareText} of yearly spending`);
  }
  donut.style.background = stops.length ? `conic-gradient(${stops.join(', ')})` : '';
  if (categories.length) donut.setAttribute('aria-label', `${money(totals.monthlyMinor)} per month. ${descriptions.join('; ')}. Shares are rounded.`);
  else {
    donut.setAttribute('aria-label', `No spending to chart. ${money(0)} per month.`);
    const empty = element('div', 'chart-empty');
    const icon = element('span', 'chart-empty-icon', '🎨'); icon.setAttribute('aria-hidden', 'true');
    empty.append(icon, element('strong', '', 'Your spending, in color.'), element('p', 'help', 'Add a paid subscription or try the fictional examples to see your category mix.'));
    legend.append(empty);
  }
  $('currentPlanAmount').textContent = money(totals.monthlyMinor);
  $('afterPlanAmount').textContent = money(totals.remainingMonthlyMinor);
  $('planSavings').textContent = money(totals.savingsMonthlyMinor);
  const reduction = totals.annualMinor ? Math.round(totals.savingsAnnualMinor / totals.annualMinor * 100) : 0;
  $('planPercent').textContent = `${reduction}% potential reduction`;
  $('planCurrentFill').style.width = totals.annualMinor ? '100%' : '0%';
  $('planAfterFill').style.width = totals.annualMinor ? `${totals.remainingAnnualMinor / totals.annualMinor * 100}%` : '0%';
  $('planHint').textContent = totals.plannedCount ? `${totals.plannedCount} ${totals.plannedCount === 1 ? 'item' : 'items'} marked for consideration. Nothing is cancelled.` : 'Mark items in your list to explore savings.';
}
function renderList() {
  const list = $('subscriptionList');
  list.replaceChildren();
  const all = state.subscriptions;
  let filtered = all.filter(sub => $('filter').value !== 'planned' || sub.planned);
  filtered.sort($('sort').value === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => M.annualMinor(b, state.currency) - M.annualMinor(a, state.currency));
  if (!filtered.length) {
    const empty = element('div', 'empty');
    const illustration = element('span', 'empty-icon', '💳'); illustration.setAttribute('aria-hidden', 'true'); empty.append(illustration);
    empty.append(element('strong', '', all.length ? 'No items marked for consideration.' : 'Start with your first subscription.'), element('p', '', all.length ? 'Use All subscriptions to return to the full list.' : 'Add your own figures, or try the fictional examples.'));
    list.append(empty);
  }
  for (const sub of filtered) {
    const card = element('article', `subscription-card${sub.planned ? ' planned-card' : ''}`);
    card.dataset.id = sub.id;
    const visual = CATEGORY_STYLE[sub.category];
    card.style.setProperty('--category-color', visual.color);
    card.style.setProperty('--category-tint', `${visual.color}18`);
    const top = element('div', 'subscription-header');
    const identity = element('div', 'subscription-identity');
    const icon = element('span', 'category-icon', visual.icon); icon.setAttribute('aria-hidden', 'true');
    const info = element('div');
    info.append(element('h3', 'subscription-name', sub.name));
    const cycleLabel = { monthly: 'every month', quarterly: 'every 3 months', annual: 'every year' }[sub.cycle];
    info.append(element('p', 'subscription-meta', `${displayCategory(sub.category)} · ${M.formatMoney(M.parseMinor(sub.amount, state.currency), state.currency)} ${cycleLabel}`));
    const cost = element('div', 'cost-group');
    cost.append(element('div', 'monthly-cost', M.formatMoney(M.annualMinor(sub, state.currency) / 12, state.currency)), element('div', 'cost-label', 'monthly average'));
    identity.append(icon, info);
    top.append(identity, cost);
    const bottom = element('div', 'subscription-bottom');
    const label = element('label', 'check-label');
    const checkbox = element('input');
    checkbox.type = 'checkbox'; checkbox.id = `plan-${sub.id}`; checkbox.checked = sub.planned;
    checkbox.setAttribute('aria-label', `Consider cancelling ${sub.name}`);
    checkbox.disabled = busy || (locked && !isDemo);
    checkbox.addEventListener('change', async () => {
      if (busy || (locked && !isDemo)) return;
      const next = { ...state, subscriptions: state.subscriptions.map(item => item.id === sub.id ? { ...item, planned: checkbox.checked } : item) };
      await persist(next);
      document.getElementById(`plan-${sub.id}`)?.focus();
    });
    label.append(checkbox, element('span', '', 'Considering cancellation'));
    const actions = element('div', 'row-actions');
    const edit = element('button', 'secondary small', 'Edit'); edit.type = 'button'; edit.setAttribute('aria-label', `Edit ${sub.name}`); edit.disabled = busy || (locked && !isDemo);
    edit.addEventListener('click', () => {
      if (busy || (locked && !isDemo)) return;
      editId = sub.id;
      $('name').value = sub.name; $('amount').value = sub.amount; $('category').value = sub.category; $('cycle').value = sub.cycle; $('planned').checked = sub.planned;
      $('formTitle').textContent = 'Edit subscription'; $('save').textContent = 'Save changes'; $('cancelEdit').hidden = false; $('formError').textContent = ''; $('name').focus();
    });
    const remove = element('button', 'secondary small', 'Remove'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${sub.name}`); remove.disabled = busy || (locked && !isDemo);
    remove.addEventListener('click', async () => {
      if (busy || (locked && !isDemo)) return;
      if (!window.confirm(`Remove "${sub.name}" from this list? This does not cancel the subscription.`)) return;
      const accepted = await persist({ ...state, subscriptions: state.subscriptions.filter(item => item.id !== sub.id) });
      if (accepted && editId === sub.id) resetForm();
      $('focusAdd').focus();
    });
    actions.append(edit, remove); bottom.append(label, actions); card.append(top, bottom); list.append(card);
  }
  $('listNote').textContent = `Showing ${filtered.length} of ${all.length} subscriptions. Summary totals always use the full list. Monthly amounts are averages, not a payment schedule.`;
}
$('subscriptionForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || (locked && !isDemo)) return;
  $('formError').textContent = '';
  for (const input of [$('name'), $('amount')]) input.removeAttribute('aria-invalid');
  try {
    if (!editId && state.subscriptions.length >= 500) throw new Error('This list supports up to 500 subscriptions.');
    const candidate = M.validateSubscription({
      id: editId || globalThis.crypto?.randomUUID?.() || `sub-${Date.now()}-${fallbackId++}`,
      name: $('name').value, amount: $('amount').value, cycle: $('cycle').value, category: $('category').value, planned: $('planned').checked,
    }, state.currency);
    const subscriptions = editId ? state.subscriptions.map(item => item.id === editId ? candidate : item) : [...state.subscriptions, candidate];
    if (await persist({ ...state, subscriptions })) { resetForm(); $('name').focus(); }
  } catch (error) {
    $('formError').textContent = error.message;
    const input = !$('name').value.trim() ? $('name') : $('amount'); input.setAttribute('aria-invalid', 'true'); input.focus();
  }
});
$('cancelEdit').addEventListener('click', () => { if (busy) return; resetForm(); $('name').focus(); });
$('focusAdd').addEventListener('click', () => { if (busy) return; resetForm(); $('name').focus(); });
$('quickAdd').addEventListener('click', () => {
  if (busy || (locked && !isDemo)) return;
  $('focusAdd').click();
  $('name').scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
$('currency').addEventListener('change', async () => {
  if (busy || state.subscriptions.length || (locked && !isDemo)) { render(); return; }
  if (await persist(M.newState($('currency').value))) resetForm();
});
$('examples').addEventListener('click', () => {
  if (busy || isDemo) return;
  const currency = ownState.currency;
  isDemo = true;
  state = M.validateState({ ...M.newState(currency), subscriptions: [
    { id: 'demo-video', name: 'Example video plan', category: 'Entertainment', cycle: 'monthly', amount: '12', planned: true },
    { id: 'demo-cloud', name: 'Example cloud storage', category: 'Utilities', cycle: 'annual', amount: '60', planned: false },
    { id: 'demo-learning', name: 'Example learning plan', category: 'Learning', cycle: 'quarterly', amount: '24', planned: false },
  ] });
  resetForm(); $('filter').value = 'all'; render();
});
$('exitDemo').addEventListener('click', () => { if (busy) return; isDemo = false; state = ownState; resetForm(); $('filter').value = 'all'; render(); $('examples').focus(); });
$('deleteData').addEventListener('click', async () => {
  if (busy) return;
  if (!window.confirm('Delete this app\'s saved list and settings from this browser? This cannot be undone. Real subscriptions and other apps\' data are not affected.')) return;
  if (!hasWriteLock()) { locked = true; warning = `${lockWarning} No deletion is confirmed.`; render(); return; }
  busy = true; render();
  try {
    await navigator.locks.request(WRITE_LOCK, { mode: 'exclusive' }, () => {
      // A fresh anonymous revision invalidates even null or previously empty baselines.
      // Replace this single key atomically; never clear in-memory data before it succeeds.
      localStorage.getItem(KEY);
      const empty = M.newState();
      const resetRaw = JSON.stringify({ ...empty, deletionRevision: globalThis.crypto.randomUUID() });
      localStorage.setItem(KEY, resetRaw);
      lastRaw = resetRaw; ownState = state = empty; isDemo = false; locked = false; warning = ''; saved = false;
    });
  } catch (_) {
    warning = 'Could not delete saved data because browser storage is blocked or could not be coordinated. No deletion is confirmed. Clear this site\'s data through your browser settings if needed.';
    return;
  } finally { busy = false; render(); }
  resetForm(); $('filter').value = 'all'; render(); $('storageStatus').textContent = 'This app\'s saved list and settings were deleted from this browser. Real subscriptions are unchanged.'; $('name').focus();
});
for (const id of ['filter', 'sort']) $(id).addEventListener('change', renderList);
window.addEventListener('storage', event => {
  if ((event.key === KEY || event.key === null) && event.storageArea === localStorage && event.newValue !== lastRaw) {
    locked = true;
    warning = 'Another tab changed this saved list. Reload to use the latest data. Editing your own list is disabled to avoid overwriting changes.';
    render();
  }
});
load(); render();
