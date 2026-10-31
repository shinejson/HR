// Run with: node --test tests/test_reports_ui.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const types = [
  { key: 'staff', title: 'Staff directory', scope: 'department', group: 'People', description: 'Staff records', icon: 'users', statuses: ['active'] },
  { key: 'profile', title: 'Employee profile', scope: 'employee', group: 'People', description: 'Profile', icon: 'user' },
  { key: 'attendance', title: 'Attendance report', scope: 'both', group: 'Time', description: 'Attendance', icon: 'clock', date_field: 'work_date', date_label: 'Work date', statuses: ['present', 'late'] },
];
const person = { id: 7, name: 'Abena Sarpong', employee_no: 'EMP-007', department_id: 4, department_name: 'Engineering', designation_title: 'Engineer', status: 'active', report_types: ['staff', 'profile', 'attendance'] };
const catalogue = {
  types, organisation_types: ['staff', 'attendance'],
  departments: [{ id: 4, name: 'Engineering', code: 'ENG', head_name: 'Kofi Adjei', employee_count: 1, active_count: 1, report_types: ['staff', 'attendance'] }],
  employees: [person], scope_label: 'Organisation-wide', can_view_analytics: true,
};
const report = {
  title: 'Attendance report', report: types[2],
  company: { name: 'Example Hotel', initial: 'E', logo_url: '/logo.png', address: 'Accra', email: 'hr@example.test' },
  scope: { label: 'Abena Sarpong', employee: person, department_id: null, period: 'All dates' },
  reference: 'HR-ATT-TEST', generated_at: '31 Oct 2026', record_count: 1,
  summary: [{ label: 'Attendance records', value: '1' }],
  sections: [{ title: 'Attendance register', record_count: 1,
    columns: [{ key: 'employee_name', label: 'Employee' }, { key: 'status', label: 'Status', format: 'status' }],
    rows: [{ employee_name: '<script>alert(1)</script>', status: 'present' }] }],
};

function load(hash = '#/reports', overrides = {}) {
  const preview = { innerHTML: '', scrollIntoView() {} };
  const control = { onclick: null, onchange: null, onsubmit: null };
  const root = { innerHTML: '', querySelector: selector => selector === '#report-preview' ? preview : control, querySelectorAll: () => [], preview };
  const calls = { routes: [], gets: [], fetches: [] };
  const context = vm.createContext({
    Views: {}, location: { hash }, URLSearchParams, Object, Array, String, Number, Math, Promise, Error,
    console, setTimeout, clearTimeout,
    Store: { isRole: () => true },
    API: { token: 'secret-test-token', get: async (...args) => { calls.gets.push(args); return { data: args[0].endsWith('/catalog') ? catalogue : report }; } },
    esc: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    icon: () => '', chip: value => String(value), avatarHTML: name => String(name),
    pageHead: title => '<h1>' + title + '</h1>', spinners: () => 'Loading',
    emptyState: (title, text) => '<p>' + title + ': ' + text + '</p>',
    pagerHTML: () => '', bindPager: () => {}, go: route => calls.routes.push(route), toast: () => {},
    fetch: async (...args) => { calls.fetches.push(args); return { ok: true, text: async () => '<html>Print document</html>' }; },
    ...overrides,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/js/reports.js'), 'utf8') + '\nglobalThis.ReportCentre = ReportCentre;', context);
  return { context, root, calls };
}

test('report centre is available to employees and wired into department/employee pages', () => {
  const navigation = fs.readFileSync(path.join(__dirname, '../static/js/app.js'), 'utf8');
  const views = fs.readFileSync(path.join(__dirname, '../static/js/views.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../templates/index.html'), 'utf8');
  assert.match(navigation, /id: "reports", label: "Report centre", icon: "chart"/);
  assert.match(views, /data-dept-reports/);
  assert.match(views, /data-emp-reports/);
  assert.match(html, /reports\.js/);
  assert.match(html, /reports\.css/);
});

test('hub renders a collection for every accessible department', async () => {
  const { context, root } = load();
  await context.Views.reports(root, []);
  assert.match(root.innerHTML, /Engineering/);
  assert.match(root.innerHTML, /#\/reports\/department\/4/);
  assert.match(root.innerHTML, /Report centre/);
});

test('department page links department-wide and individual employee reports', async () => {
  const { context, root } = load();
  await context.Views.reports(root, ['department', '4']);
  assert.match(root.innerHTML, /Engineering reports/);
  assert.match(root.innerHTML, /reports\/detail\/staff\?department_id=4/);
  assert.match(root.innerHTML, /reports\/detail\/attendance\?department_id=4/);
  assert.match(root.innerHTML, /#\/reports\/employee\/7/);
  assert.match(root.innerHTML, /<option value="profile">Employee profile<\/option>/);
  assert.doesNotMatch(root.innerHTML, /reports\/detail\/profile\?department_id/);
});

test('employee page offers different report types with employee scope', async () => {
  const { context, root } = load();
  await context.Views.reports(root, ['employee', '7']);
  assert.match(root.innerHTML, /Abena Sarpong reports/);
  assert.match(root.innerHTML, /reports\/detail\/profile\?employee_id=7/);
  assert.match(root.innerHTML, /reports\/detail\/attendance\?employee_id=7/);
});

test('detail preserves filters in shareable routes and renders branded escaped preview', async () => {
  const { context, root, calls } = load('#/reports/detail/attendance?employee_id=7&date_from=2026-10-01&status=late');
  await context.Views.reports(root, ['detail', 'attendance']);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.gets.at(-1))), ['/employee-reports/detail', { employee_id: '7', date_from: '2026-10-01', status: 'late', type: 'attendance' }]);
  assert.match(root.preview.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(root.preview.innerHTML, /<script>alert/);
  assert.equal(context.ReportCentre.pathFor('leave', { employee_id: 7, q: 'a & b', year: '' }), 'reports/detail/leave?employee_id=7&q=a+%26+b');
});

test('printing uses authorization header, not a token in the URL', async () => {
  const { context, calls } = load();
  const button = { disabled: false, textContent: '', innerHTML: '' };
  const root = { querySelector: selector => selector === '#report-print' ? button : null };
  // Avoid a DOM dependency in this unit test; the browser smoke test exercises iframes.
  context.document = { createElement: () => ({ style: {}, setAttribute() {}, remove() {} }), body: { appendChild() {} } };
  await context.ReportCentre.printReport('attendance', { employee_id: 7 }, root);
  const [url, options] = calls.fetches[0];
  assert.match(url, /type=attendance/);
  assert.match(url, /employee_id=7/);
  assert.doesNotMatch(url, /secret-test-token/);
  assert.equal(options.headers.Authorization, 'Bearer secret-test-token');
  assert.equal(button.disabled, false);
});

test('switching report type keeps scope but clears incompatible filters', async () => {
  const { context, root, calls } = load('#/reports/detail/attendance?employee_id=7&status=present&date_from=2026-10-01');
  await context.Views.reports(root, ['detail', 'attendance']);
  root.querySelector('#report-type-switch').onchange({ target: { value: 'leave' } });
  assert.deepEqual(calls.routes.at(-1), 'reports/detail/leave?employee_id=7');
});

test('workforce analytics stays separate from the report centre', async () => {
  const analyticsCalls = [];
  const { context, root } = load('#/reports/analytics', {
    Views: { reportAnalytics: async target => { analyticsCalls.push(target); } },
  });
  // The IIFE assigns Views.reports after the VM context is created.
  context.Views.reportAnalytics = async target => { analyticsCalls.push(target); };
  await context.ReportCentre.render(root, ['analytics']);
  assert.equal(analyticsCalls.length, 1);
  const legacy = fs.readFileSync(path.join(__dirname, '../static/js/views3.js'), 'utf8');
  assert.match(legacy, /repState\.tab = b\.dataset\.reptab; Views\.reportAnalytics\(root\)/);
  assert.doesNotMatch(legacy, /Views\.reports = async function/);
});

test('unknown employee gives a recoverable error, not a blank page', async () => {
  const { context, root } = load();
  await context.Views.reports(root, ['employee', '999']);
  assert.match(root.innerHTML, /Report unavailable/);
  assert.match(root.innerHTML, /Back to report centre/);
});
