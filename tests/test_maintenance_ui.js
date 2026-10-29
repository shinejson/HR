// Run with: node --test tests/test_maintenance_ui.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(overrides = {}) {
  const calls = [];
  const context = vm.createContext({
    Views: { operations: async (...args) => calls.push(['refresh', ...args]) },
    Store: { meta: { company: { name: 'Example Hotel' } } },
    API: {
      get: async url => ({ data: [{ id: 7, status: 'active', full_name: 'Maintenance Staff', department_name: 'Facilities' }] }),
      post: async (...args) => calls.push(['POST', ...args]),
      put: async (...args) => calls.push(['PUT', ...args]),
    },
    document: { getElementById: () => ({}) },
    icon: () => '',
    toast: () => {},
    money: (amount, currency) => `${currency} ${Number(amount).toFixed(2)}`,
    fmtDate: value => String(value),
    fmtTime: value => String(value),
    fmtDateTime: value => String(value),
    emptyState: () => '',
    ...overrides,
  });
  const source = fs.readFileSync(path.join(__dirname, '../static/js/operations.js'), 'utf8');
  vm.runInContext(source, context);
  return { context, calls };
}

test('maintenance is linked from Operations navigation and recognized as an operations tab', () => {
  const navigation = fs.readFileSync(path.join(__dirname, '../static/js/app.js'), 'utf8');
  const operations = fs.readFileSync(path.join(__dirname, '../static/js/operations.js'), 'utf8');
  assert.match(navigation, /label: "Maintenance schedule", subTab: "maintenance"/);
  assert.match(operations, /"maintenance", "Maintenance"/);
  assert.match(operations, /\["dashboard", "inventory", "workorders", "maintenance"/);
});

test('maintenance form offers employees and external contractors and submits a scheduled job', async () => {
  let modal;
  const { context, calls } = load({ openFormModal: options => { modal = options; } });
  await context.openMaintenanceForm();
  context.Views.operations = async (...args) => calls.push(['refresh', ...args]);

  const workerField = modal.fields.find(field => field.name === 'worker_id');
  assert.ok(workerField.options.some(option => option.value === 'external'));
  assert.ok(workerField.options.some(option => option.value === 7));
  assert.equal(modal.fields.find(field => field.name === 'scheduled_at').type, 'datetime-local');
  assert.ok(modal.fields.some(field => field.name === 'amount'));
  assert.ok(modal.fields.some(field => field.name === 'remarks'));

  await modal.onSubmit({
    title: 'Service the water pump',
    category: 'Preventive',
    location: 'Pump room',
    scheduled_at: '2026-10-30T09:00',
    worker_id: 'external',
    worker_name: 'Kwesi Contractor',
    amount: '320.75',
    description: 'Replace the seal.',
    remarks: 'Check noise after service.',
  });
  assert.equal(calls[0][0], 'POST');
  assert.equal(calls[0][1], '/operations/maintenance');
  assert.equal(calls[0][2].worker_id, null);
  assert.equal(calls[0][2].worker_name, 'Kwesi Contractor');
  assert.equal(calls[0][2].amount, 320.75);
  assert.equal(calls[0][2].remarks, 'Check noise after service.');
  assert.equal(calls[1][0], 'refresh');
});

test('maintenance table escapes free-text fields and displays cost and worker', () => {
  const { context } = load({
    esc: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  });
  const html = context.renderMaintenanceTable([{
    id: 3,
    reference_no: 'MW-20300101-ABC123',
    category: 'Repair',
    scheduled_at: '2026-10-30T09:00:00',
    title: '<script>alert(1)</script>',
    location: 'Room 4',
    description: '',
    worker_name: 'Kwesi Contractor',
    amount: 80,
    status: 'scheduled',
    remarks: 'Replace <seal>',
  }]);
  assert.match(html, /Kwesi Contractor/);
  assert.match(html, /GHS 80\.00/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});
