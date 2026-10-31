// Run with: node --test tests/test_backups_ui.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const SRC = path.join(__dirname, '../static/js/backups.js');

function fakeElement(extra = {}) {
  return {
    value: '', disabled: false, checked: false, textContent: '', innerHTML: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    focus() {},
    click() { if (this.onclick) return this.onclick(); },
    dispatchEvent() { if (this.oninput) this.oninput(); },
    querySelector(sel) {
      if (!this._nodes) this._nodes = {};
      if (!this._nodes[sel]) this._nodes[sel] = fakeElement();
      return this._nodes[sel];
    },
    ...extra,
  };
}

const LIST_PAYLOAD = () => ({
  data: [
    { id: 1, filename: 'hrms_20261031_120000_abc123.db', label: 'Before payroll', trigger: 'manual',
      trigger_label: 'Manual', status: 'completed', size_bytes: 663552,
      checksum_sha256: '94465a8aa76ff902157ef9313a5ae1180ff800ab9de291d95cdaaa473ef60f5c',
      duration_ms: 5, notes: null,
      created_at: new Date(Date.now() - 3600e3).toISOString().slice(0, 19),
      created_by: 1, created_by_name: 'Ama Mensah' },
    { id: 2, filename: 'hrms_20261030_020000_def456.db', label: null, trigger: 'pre_restore',
      trigger_label: 'Pre-restore', status: 'completed', size_bytes: 1048576,
      checksum_sha256: '0f1e2d3c', duration_ms: 9, notes: null,
      created_at: '2026-10-30T02:00:00', created_by: null, created_by_name: 'System' },
  ],
  summary: { count: 2, total_bytes: 1712128, live_db_bytes: 663552,
    last_backup_at: new Date(Date.now() - 3600e3).toISOString().slice(0, 19),
    file_based: true, backup_dir: '/srv/hrms/backups' },
  config: { retention_count: 15, auto_enabled: false, interval_hours: 24 },
});

function load(overrides = {}) {
  const state = { calls: [], toasts: [], delegated: [], timers: [], modal: null, modalCard: null, drawer: null, drawerPanel: null, confirm: null, tableCfg: null };
  const nodes = {};
  const root = fakeElement();
  root._nodes = nodes;

  const API = {
    token: 'test-token',
    get: async (...a) => { state.calls.push(['GET', ...a]); return LIST_PAYLOAD(); },
    post: async (...a) => {
      state.calls.push(['POST', ...a]);
      if (String(a[0]).includes('/verify')) return { data: { valid: true, checksum_match: true, integrity_ok: true, checksum_sha256: '94465a8a' } };
      if (String(a[0]).includes('/restore')) return { data: { restored: 'hrms_20261031_120000_abc123.db', pre_restore_snapshot: { filename: 'hrms_pre.db' } } };
      return { data: { id: 9, filename: 'hrms_new.db', label: (a[1] || {}).label }, pruned: 0 };
    },
    put: async (...a) => { state.calls.push(['PUT', ...a]); return { data: { retention_count: 10, auto_enabled: true, interval_hours: 12 }, pruned: 1 }; },
    del: async (...a) => { state.calls.push(['DELETE', ...a]); return { data: { deleted: true } }; },
  };

  const context = vm.createContext({
    Views: {},
    Store: { canAdmin: () => true, user: { role_slug: 'super_admin' } },
    API,
    document: { getElementById: id => (id === 'view' ? root : fakeElement()) },
    pageHead: (title, sub, actions) => `<head>${title}|${sub || ''}|${actions || ''}</head>`,
    spinners: () => '',
    emptyState: (t, m) => `<empty>${t}|${m || ''}</empty>`,
    esc: s => String(s === null || s === undefined ? '' : s),
    icon: () => '',
    kpiCard: o => `<kpi>${o.label}=${o.value}</kpi>`,
    fmtDateTime: v => 'DT:' + v,
    timeAgo: v => 'AGO',
    toast: (msg, kind) => state.toasts.push([msg, kind]),
    renderTable: cfg => { state.tableCfg = cfg; return '<table/>'; },
    onDelegate: (el, evt, sel, fn) => state.delegated.push([sel, fn]),
    openModal: opts => {
      state.modal = opts;
      state.modalCard = fakeElement();
      state.modalCard._nodes = nodes;
      if (opts.onMount) opts.onMount(state.modalCard);
      return state.modalCard;
    },
    openDrawer: opts => {
      state.drawer = opts;
      state.drawerPanel = fakeElement();
      state.drawerPanel._nodes = nodes;
      if (opts.onMount) opts.onMount(state.drawerPanel);
      return state.drawerPanel;
    },
    closeModal: () => { state.modalClosed = true; },
    closeDrawer: () => {},
    confirmDialog: (title, msg, fn, opts) => { state.confirm = { title, msg, fn, opts }; },
    drawerMetaItem: (l, v) => `<meta>${l}=${v === null || v === undefined ? '—' : v}</meta>`,
    setTimeout: (fn, ms) => { state.timers.push([fn, ms]); return 0; },
    encodeURIComponent: s => encodeURIComponent(s),
    Date, Number, String, JSON, Math, isNaN, parseInt, parseFloat, Set, Map, Object, Array, RegExp, Error, Promise,
    console,
    ...overrides,
  });

  vm.runInContext(fs.readFileSync(SRC, 'utf8'), context);
  return { context, state, nodes, root, rows: LIST_PAYLOAD().data };
}

const settle = () => new Promise(r => setTimeout(r, 10));

// The fake DOM only materialises elements the page code queries; inputs that
// only exist in the markup are created on demand to stand in for the parse.
const ensure = (t, sel) => (t.nodes[sel] = t.nodes[sel] || fakeElement());

test('backups page is registered in navigation, page map and template', () => {
  const navigation = fs.readFileSync(path.join(__dirname, '../static/js/app.js'), 'utf8');
  assert.match(navigation, /\{ id: "backups", label: "Backups & recovery", icon: "copy", roles: \["super_admin"\] \}/);
  assert.match(navigation, /backups: "Backups & Recovery"/);
  const template = fs.readFileSync(path.join(__dirname, '../templates/index.html'), 'utf8');
  assert.match(template, /<script src="\/static\/js\/backups\.js\?v=/);
});

test('non-admins see a locked page and no API call is made', async () => {
  const t = load({ Store: { canAdmin: () => false, user: { role_slug: 'employee' } } });
  await t.context.Views.backups(t.root);
  assert.match(t.root.innerHTML, /Only Super Admin accounts can manage database backups/);
  assert.equal(t.state.calls.length, 0);
});

test('page renders KPIs, status banner, history table and configuration', async () => {
  const t = load();
  await t.context.Views.backups(t.root);
  assert.match(t.root.innerHTML, /Backup protection is active/);
  assert.match(t.root.innerHTML, /<kpi>Live database=648\.0 KB<\/kpi>/);
  assert.match(t.root.innerHTML, /<kpi>Snapshots stored=2<\/kpi>/);
  assert.match(t.root.innerHTML, /<kpi>Backup storage used=1\.6 MB<\/kpi>/);
  assert.match(t.root.innerHTML, /Schedule & retention/);
  assert.match(t.root.innerHTML, /Recovery playbook/);
  assert.match(t.root.innerHTML, /Create backup<\/button>/);
  assert.match(t.root.innerHTML, /id="bk-retention" min="1" max="100" value="15"/);
  assert.match(t.root.innerHTML, /id="bk-auto" >/);
  assert.doesNotMatch(t.root.innerHTML, /id="bk-auto" checked/);
  assert.match(t.root.innerHTML, /id="bk-interval" min="1" max="168" value="24" disabled/);

  const cfg = t.state.tableCfg;
  assert.equal(cfg.id, 'backups-table');
  assert.equal(cfg.exportName, 'hrms-database-backups');
  // deepEqual compares prototypes; vm-realm objects differ, so compare JSON.
  assert.equal(JSON.stringify(cfg.filters), JSON.stringify([{ key: 'trigger', label: 'Trigger' }]));
  assert.equal(JSON.stringify(cfg.columns.map(c => c.label)), JSON.stringify(['Snapshot', 'Trigger', 'Size', 'Created by', 'Created', 'Checksum', '']));
  assert.equal(cfg.rows.length, 2);
  const row = t.rows[0];
  assert.match(cfg.columns[0].render(row), /hrms_20261031_120000_abc123\.db/);
  assert.match(cfg.columns[0].render(row), /Before payroll/);
  assert.equal(cfg.columns[2].render(row), '648.0 KB');
  assert.match(cfg.columns[5].render(row), /94465a8aa76f…/);
  assert.match(cfg.columns[6].render(row), /backups\/1\/download\?token=test-token/);
  assert.match(cfg.columns[6].render(row), /data-bk-restore="1"/);
});

test('missing backups and in-memory databases raise the right banner', async () => {
  const emptyApi = (summary) => ({
    token: 'x',
    get: async () => ({ data: [], summary, config: { retention_count: 15, auto_enabled: false, interval_hours: 24 } }),
    post: async () => ({}), put: async () => ({}), del: async () => ({}),
  });
  const none = load({ API: emptyApi({ count: 0, total_bytes: 0, live_db_bytes: 10, last_backup_at: null, file_based: true, backup_dir: 'b' }) });
  await none.context.Views.backups(none.root);
  assert.match(none.root.innerHTML, /No backups yet/);

  const memory = load({ API: emptyApi({ count: 0, total_bytes: 0, live_db_bytes: null, last_backup_at: null, file_based: false, backup_dir: 'b' }) });
  await memory.context.Views.backups(memory.root);
  assert.match(memory.root.innerHTML, /in-memory database/);
  assert.doesNotMatch(memory.root.innerHTML, /Create backup<\/button>/);
});

test('create modal posts the label and reports the result', async () => {
  const t = load();
  await t.context.Views.backups(t.root);
  t.nodes['#bk-create'].click();
  assert.match(t.state.modal.title, /Create database backup/);
  assert.match(t.state.modal.body, /online backup API/);

  ensure(t, '#bk-label').value = 'Nightly snapshot';
  await t.nodes['#bk-create-go'].onclick();

  assert.equal(
    JSON.stringify(t.state.calls.find(c => c[0] === 'POST' && c[1] === '/backups')),
    JSON.stringify(['POST', '/backups', { label: 'Nightly snapshot' }]),
  );
  assert.equal(t.state.modalClosed, true);
  assert.ok(t.state.toasts.some(([m, k]) => k === 'success' && /Backup created/.test(m)));
});

test('restore requires typing RESTORE and posts to the restore endpoint', async () => {
  const t = load();
  await t.context.Views.backups(t.root);

  t.context.openRestoreBackupModal(t.rows[0]);
  assert.match(t.state.modal.title, /Restore database snapshot/);
  assert.match(t.state.modal.body, /replaces ALL current data/);
  assert.match(t.state.modal.body, /safety snapshot/);

  const word = t.nodes['#bk-restore-word'];
  const go = t.nodes['#bk-restore-go'];
  assert.match(t.state.modal.footer, /id="bk-restore-go" disabled/, 'the button renders disabled');
  go.disabled = true; // mirrors the parsed attribute in the fake DOM
  word.value = 'restore'; word.dispatchEvent();
  assert.equal(go.disabled, true, 'lowercase must not unlock the button');
  word.value = 'RESTORE'; word.dispatchEvent();
  assert.equal(go.disabled, false);

  await go.onclick();
  assert.ok(t.state.calls.some(c => c[0] === 'POST' && c[1] === '/backups/1/restore'));
  assert.match(t.state.modalCard.innerHTML, /Restore complete/);
  assert.match(t.state.modalCard.innerHTML, /hrms_pre\.db/);
  assert.ok(t.state.timers.length > 0, 'a delayed reload is scheduled after restoring');
});

test('verify modal reports checksum and integrity results', async () => {
  const t = load();
  await t.context.Views.backups(t.root);
  t.context.openVerifyBackupModal(t.rows[0]);
  await settle();
  assert.ok(t.state.calls.some(c => c[0] === 'POST' && c[1] === '/backups/1/verify'));
  assert.equal(t.nodes['#bk-verify-spin'].classList.contains('hidden'), true);
  assert.equal(t.nodes['#bk-verify-result'].classList.contains('hidden'), false);
  assert.match(t.nodes['#bk-verify-result'].innerHTML, /Snapshot is valid/);
  assert.match(t.nodes['#bk-verify-result'].innerHTML, /SHA-256 checksum matches/);
});

test('detail drawer exposes verify, download and restore actions', async () => {
  const t = load();
  await t.context.Views.backups(t.root);
  t.context.openBackupDrawer(t.rows[0]);
  assert.match(t.state.drawer.head, /hrms_20261031_120000_abc123\.db/);
  assert.match(t.state.drawer.body, /94465a8aa76ff902157ef9313a5ae1180ff800ab9de291d95cdaaa473ef60f5c/);
  assert.match(t.state.drawer.footer, /backups\/1\/download\?token=test-token/);

  t.nodes['#bk-d-verify'].click();
  assert.match(t.state.modal.title, /Verify snapshot integrity/);
  t.nodes['#bk-d-restore'].click();
  assert.match(t.state.modal.title, /Restore database snapshot/);
});

test('row actions wire delete confirmation and config saving', async () => {
  const t = load();
  await t.context.Views.backups(t.root);

  const delHandler = t.state.delegated.find(([sel]) => sel === '[data-bk-delete]')[1];
  delHandler({ dataset: { bkDelete: '2' } });
  assert.match(t.state.confirm.title, /Delete backup snapshot/);
  assert.equal(t.state.confirm.opts.danger, true);
  await t.state.confirm.fn();
  assert.ok(t.state.calls.some(c => c[0] === 'DELETE' && c[1] === '/backups/2'));

  await settle();
  const auto = t.nodes['#bk-auto'];
  const interval = t.nodes['#bk-interval'];
  const save = t.nodes['#bk-save-config'];
  auto.checked = true;
  auto.onchange();
  assert.equal(interval.disabled, false);
  interval.value = '12';
  ensure(t, '#bk-retention').value = '10';
  await save.onclick({ currentTarget: save });
  assert.equal(
    JSON.stringify(t.state.calls.find(c => c[0] === 'PUT' && c[1] === '/backups/config')),
    JSON.stringify(['PUT', '/backups/config', { auto_enabled: true, interval_hours: 12, retention_count: 10 }]),
  );
  assert.ok(t.state.toasts.some(([m, k]) => k === 'success' && /configuration saved/.test(m)));
});

test('byte and freshness formatting helpers behave', () => {
  const t = load();
  assert.equal(t.context.fmtBytes(0), '0 KB');
  assert.equal(t.context.fmtBytes(512), '512 B');
  assert.equal(t.context.fmtBytes(2048), '2.0 KB');
  assert.equal(t.context.fmtBytes(5242880), '5.0 MB');
  assert.equal(t.context.fmtBytes(3221225472), '3.00 GB');
  assert.match(t.context.backupFreshness(null).chip, /Unprotected/);
  assert.match(t.context.backupFreshness(new Date(Date.now() - 3600e3).toISOString()).chip, /Protected/);
  assert.match(t.context.backupFreshness(new Date(Date.now() - 48 * 3600e3).toISOString()).chip, /Getting stale/);
  assert.match(t.context.backupFreshness(new Date(Date.now() - 200 * 3600e3).toISOString()).chip, /Stale/);
});
