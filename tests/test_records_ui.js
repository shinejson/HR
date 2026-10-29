// Run with: node --test tests/test_records_ui.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(role = 'super_admin', overrides = {}) {
  const context = vm.createContext({
    Store: {
      user: { employee_id: 7 },
      isReadOnly: () => role === 'auditor',
      canManage: () => ['super_admin', 'hr_admin', 'hr_officer'].includes(role),
      isRole: (...roles) => roles.includes(role),
    },
    esc: value => String(value),
    ...overrides,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/js/records.js'), 'utf8') + '\nglobalThis.records = Records;', context);
  return context.records;
}

test('record buttons are role-aware and goals enforce ownership in the UI', () => {
  const employee = load('employee');
  assert.equal(employee.canWrite('goals', { employee_id: 7 }), true);
  assert.equal(employee.canWrite('goals', { employee_id: 8 }), false);
  for (const resource of ['documents', 'policies', 'appraisals', 'appraisal-cycles', 'onboarding-tasks', 'offboardings', 'candidates']) {
    assert.equal(employee.canWrite(resource), false);
    assert.ok(!employee.buttons(resource, { id: 1 }).includes('>Delete<'));
  }
  assert.equal(load('recruiter').canWrite('interviews'), true);
  assert.equal(load('recruiter').canWrite('policies'), false);
  assert.equal(load('manager').canWrite('appraisals'), true);
  assert.equal(load('manager').canWrite('appraisal-cycles'), false);
  assert.equal(load('auditor').canWrite('goals'), false);
});

test('every resource supports create and populated edit forms with POST and PUT', async () => {
  const resources = ['goals', 'appraisals', 'appraisal-cycles', 'job-postings', 'candidates', 'applications', 'interviews', 'onboarding-tasks', 'offboardings', 'documents', 'policies'];
  let modal;
  const calls = [];
  const records = load('super_admin', {
    API: {
      get: async () => ({ data: [{ id: 7, full_name: 'Test employee' }] }),
      post: async (...args) => calls.push(['POST', ...args]),
      put: async (...args) => calls.push(['PUT', ...args]),
    },
    formModal: config => { modal = config; },
    navigate: () => {},
  });
  for (const resource of resources) {
    await records.form(resource);
    assert.ok(modal.fields.length > 0);
    await modal.onSubmit({ title: 'Created' });
    assert.equal(calls.at(-1)[0], 'POST');
    assert.equal(calls.at(-1)[1], '/' + resource);
    await records.form(resource, { id: 42, title: 'Existing title', first_name: 'Existing candidate', scheduled_at: '2026-10-29T12:30:00' });
    for (const field of modal.fields) {
      if (field.name === 'title') assert.equal(field.value, 'Existing title');
      if (field.name === 'scheduled_at') assert.equal(field.value, '2026-10-29T12:30');
    }
    await modal.onSubmit({ title: 'Edited' });
    assert.equal(calls.at(-1)[0], 'PUT');
    assert.equal(calls.at(-1)[1], '/' + resource + '/42');
  }
});

test('employee goal form restricts employee options to self', async () => {
  let modal;
  const records = load('employee', {
    API: { get: async () => ({ data: [{ id: 8, full_name: 'Other employee' }] }) },
    formModal: config => { modal = config; },
  });
  await records.form('goals');
  const field = modal.fields.find(f => f.name === 'employee_id');
  assert.equal(field.options.length, 1);
  assert.equal(field.options[0].value, 7);
  assert.equal(field.value, 7);
});
