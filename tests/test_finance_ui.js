// Run with: node --test tests/test_finance_ui.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(overrides = {}) {
  const context = vm.createContext({ Views: {}, window: {}, ...overrides });
  for (const name of ['views2.js', 'views3.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/js', name), 'utf8'), context);
  }
  return context;
}

test('delete uses the supported API method and refreshes after success', async () => {
  const calls = [];
  const context = load({
    confirm: () => true,
    API: { del: async url => calls.push(url) },
    toast: message => calls.push(message),
    handleErr: error => { throw error; },
  });
  await context.deleteFinanceRecord('claims', 42, async () => calls.push('refresh'));
  assert.deepEqual(calls, ['/claims/42', 'Deleted successfully', 'refresh']);
});

test('canceling deletion sends no request', async () => {
  const context = load({ confirm: () => false });
  await context.deleteFinanceRecord('payroll-runs', 42, () => assert.fail('Unexpected refresh'));
});

test('failed deletion reports the error without refreshing', async () => {
  const error = new Error('Finalized records cannot be deleted');
  let reported;
  const context = load({
    confirm: () => true,
    API: { del: async () => { throw error; } },
    handleErr: value => { reported = value; },
  });
  await context.deleteFinanceRecord('payroll-runs', 42, () => assert.fail('Unexpected refresh'));
  assert.equal(reported, error);
});

test('refresh replaces delegated handlers and uses the latest closure', () => {
  const listeners = new Set();
  const target = {};
  const root = {
    addEventListener: (type, handler) => listeners.add(handler),
    removeEventListener: (type, handler) => listeners.delete(handler),
    contains: element => element === target,
  };
  const context = load();
  let result;
  context.onFinanceDelegate(root, 'click', '[data-claim-edit]', () => { result = 'stale'; });
  context.onFinanceDelegate(root, 'click', '[data-claim-edit]', () => { result = 'current'; });
  assert.equal(listeners.size, 1);
  for (const listener of listeners) listener({ target: { closest: () => target } });
  assert.equal(result, 'current');
});

test('edit forms retain existing values and use PUT', async () => {
  let options;
  const calls = [];
  const context = load({
    formModal: config => { options = config; },
    API: { put: async (...args) => calls.push(args) },
    navigate: () => {},
    toast: () => {},
    monthName: String,
    todayISO: () => '2026-10-29',
    Store: { canPayroll: () => true, meta: {} },
  });
  for (const [open, record, resource, field] of [
    ['openClaimForm', { id: 4, title: 'Taxi', amount: '45.50', claim_date: '2026-10-28' }, 'claims', 'title'],
    ['openPayrollRunForm', { id: 5, period_month: 3, period_year: 2026, notes: 'March' }, 'payroll-runs', 'notes'],
    ['openComponentForm', { id: 6, name: 'Bonus', is_taxable: false }, 'salary-components', 'name'],
  ]) {
    context[open](record);
    assert.equal(options.fields.find(f => f.name === field).value, record[field]);
    const payload = { [field]: 'Updated' };
    await options.onSubmit(payload);
    assert.equal(calls.at(-1)[0], '/' + resource + '/' + record.id);
    assert.equal(calls.at(-1)[1], payload);
  }
});
