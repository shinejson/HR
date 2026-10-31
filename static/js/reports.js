/* Department → employee → report detail. All data and print permissions are
   enforced by the employee-reports API, not by hiding navigation links. */
const ReportCentre = (() => {
  const state = { tab: 'departments', search: '', page: 1, previewPage: 1 };
  const pageSize = 25;
  let catalogue = null;
  let currentReport = null;
  let printBusy = false;

  function query() {
    const raw = location.hash.split('?')[1] || '';
    return Object.fromEntries(new URLSearchParams(raw));
  }
  function pathFor(type, filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    return 'reports/detail/' + encodeURIComponent(type) + (params.toString() ? '?' + params.toString() : '');
  }
  function link(path, label, className = 'btn btn-ghost btn-sm', iconName = 'arrowRight') {
    return '<a class="' + className + '" href="#/' + esc(path) + '">' + esc(label) + (iconName ? icon(iconName, 14) : '') + '</a>';
  }
  function breadcrumb(items) {
    return '<nav class="report-breadcrumb" aria-label="Report navigation">'
      + '<a href="#/reports">Report centre</a>'
      + items.map(item => icon('chevronRight', 12) + (item.path ? '<a href="#/' + esc(item.path) + '">' + esc(item.label) + '</a>' : '<span aria-current="page">' + esc(item.label) + '</span>')).join('') + '</nav>';
  }
  function typeCard(type, filters) {
    return '<a class="report-type-card" href="#/' + esc(pathFor(type.key, filters)) + '">'
      + '<span class="report-type-icon">' + icon(type.icon, 21) + '</span>'
      + '<span class="report-type-copy"><strong>' + esc(type.title) + '</strong><span>' + esc(type.description) + '</span>'
      + '<small>' + esc(type.group) + ' · View & print</small></span>' + icon('arrowRight', 17) + '</a>';
  }
  function searchBox(placeholder) {
    return '<div class="searchbox report-search">' + icon('search', 16) + '<input id="report-search" type="search" aria-label="' + esc(placeholder) + '" placeholder="' + esc(placeholder) + '" value="' + esc(state.search) + '"></div>';
  }
  function bindSearch(root, render) {
    const input = root.querySelector('#report-search');
    if (!input) return;
    input.oninput = () => { state.search = input.value; state.page = 1; render(); };
  }
  function matches(values) {
    return values.join(' ').toLowerCase().includes(state.search.trim().toLowerCase());
  }
  function employeeTable(employees, types) {
    const filtered = employees.filter(e => matches([e.name, e.employee_no, e.department_name, e.designation_title]));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.min(state.page, pages);
    const rows = filtered.slice((state.page - 1) * pageSize, state.page * pageSize);
    return '<div class="card"><div class="card-head"><div><h3>Employee reports</h3><div class="sub">Choose a person, then the type of report you need.</div></div><span class="chip chip-teal">' + filtered.length + ' people</span></div>'
      + '<div class="table-wrap"><table class="report-employees"><thead><tr><th scope="col">Employee</th><th scope="col">Department</th><th scope="col">Report type</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>'
      + (rows.length ? rows.map(e => '<tr><td><div class="person">' + avatarHTML(e.name, 'avatar-sm', '', e.photo_url) + '<div><b>' + esc(e.name) + '</b><span>' + esc(e.employee_no) + ' · ' + esc(e.designation_title || 'Team member') + '</span></div></div></td>'
        + '<td>' + esc(e.department_name) + '</td><td><select class="select report-kind" aria-label="Report type for ' + esc(e.name) + '" data-report-employee="' + e.id + '">'
        + types.filter(t => e.report_types.includes(t.key)).map(t => '<option value="' + esc(t.key) + '">' + esc(t.title) + '</option>').join('') + '</select></td>'
        + '<td class="right"><div class="row report-row-actions">' + link('reports/employee/' + e.id, 'All reports', 'btn btn-ghost btn-sm', 'grid')
        + '<button class="btn btn-teal btn-sm" data-open-report="' + e.id + '">' + icon('eye', 14) + ' View report</button></div></td></tr>').join('')
        : '<tr><td colspan="4">' + emptyState('No matching employees', 'Try another search or ask HR to check your report access.') + '</td></tr>')
      + '</tbody></table></div><div id="report-employee-pager">' + pagerHTML({ page: state.page, pages, total: filtered.length, per_page: pageSize }) + '</div></div>';
  }
  function bindEmployeeActions(root, rerender) {
    root.querySelectorAll('[data-open-report]').forEach(button => {
      button.onclick = () => {
        const id = Number(button.dataset.openReport);
        const select = root.querySelector('[data-report-employee="' + id + '"]');
        if (select && select.value) go(pathFor(select.value, { employee_id: id }));
      };
    });
    bindPager(root.querySelector('#report-employee-pager') || root, page => { state.page = page; rerender(); });
  }

  async function openCatalogue(root) {
    root.innerHTML = pageHead('Report centre', 'Department and employee reports, ready to view and print.') + spinners(3);
    catalogue = (await API.get('/employee-reports/catalog')).data;
    return catalogue;
  }
  function hub(root) {
    const data = catalogue;
    const departments = data.departments.filter(d => matches([d.name, d.code, d.head_name || '']));
    const head = pageHead('Report centre', 'One place for department reports and individual employee records.',
      data.can_view_analytics ? link('reports/analytics', 'Workforce analytics', 'btn btn-ghost', 'chart') : '', 'Insight / Reports');
    const intro = '<div class="report-intro"><div class="report-intro-icon">' + icon('file', 28) + '</div><div><h2>From your department to the details.</h2><p>Choose a department or employee, select a report, and preview it before printing. Every report carries your company branding and footer.</p></div><span class="chip chip-teal">' + esc(data.scope_label) + '</span></div>';
    const tabs = '<div class="tabs report-hub-tabs" role="tablist" aria-label="Browse reports">'
      + [['departments', 'By department', data.departments.length], ['employees', 'By employee', data.employees.length], ['types', 'Report types', data.organisation_types.length]].map(t => '<button class="tab ' + (state.tab === t[0] ? 'active' : '') + '" role="tab" aria-selected="' + (state.tab === t[0]) + '" data-report-tab="' + t[0] + '">' + t[1] + '<span class="count">' + t[2] + '</span></button>').join('') + '</div>';
    let body;
    if (state.tab === 'departments') {
      body = '<div class="report-list-head"><div><h2>Departments</h2><p>Report collections for each department, including departments with no employees yet.</p></div>' + searchBox('Search departments…') + '</div>'
        + '<div class="grid grid-3 report-department-grid">' + (departments.length ? departments.map(d => '<article class="card report-department-card"><div class="row-between"><span class="report-department-icon">' + icon('building', 23) + '</span><span class="pill-tag">' + esc(d.code || 'DEPARTMENT') + '</span></div>'
          + '<h3>' + esc(d.name) + '</h3><p class="muted small">Head: ' + esc(d.head_name || 'Not assigned') + '</p><div class="report-department-counts"><span><b>' + d.employee_count + '</b> ' + (d.employee_count === 1 ? 'employee' : 'employees') + '</span><span><b>' + d.active_count + '</b> active</span><span><b>' + d.report_types.length + '</b> report types</span></div>'
          + link('reports/department/' + d.id, 'Department reports', 'btn btn-teal') + '</article>').join('') : '</div><div class="card">' + emptyState('No departments available', 'Try a different search or contact your HR administrator.')) + '</div>';
    } else if (state.tab === 'employees') {
      body = '<div class="report-list-head"><div><h2>Employees</h2><p>Only people whose records you are allowed to access are shown.</p></div>' + searchBox('Search name, number or department…') + '</div><div id="report-employee-list">' + employeeTable(data.employees, data.types) + '</div>';
    } else {
      body = '<div class="report-list-head"><div><h2>Choose a report type</h2><p>These reports cover all employees accessible to you. Open a department or employee for a narrower report.</p></div>' + searchBox('Search report types…') + '</div>'
        + '<div class="grid grid-2 report-type-grid">' + data.types.filter(t => data.organisation_types.includes(t.key) && matches([t.title, t.description, t.group])).map(t => typeCard(t, {})).join('') + '</div>';
    }
    root.innerHTML = head + intro + tabs + '<div class="report-page-body">' + body + '</div>';
    root.querySelectorAll('[data-report-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.reportTab; state.search = ''; state.page = 1; hub(root); });
    bindSearch(root, () => hub(root));
    bindEmployeeActions(root, () => hub(root));
    const input = root.querySelector('#report-search');
    if (input && state.search) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }

  function department(root, id) {
    const dept = catalogue.departments.find(d => d.id === Number(id));
    if (!dept) throw new Error('This department is not available in your report scope.');
    const types = catalogue.types.filter(t => t.scope !== 'employee' && dept.report_types.includes(t.key));
    const employees = catalogue.employees.filter(e => (e.department_id || 0) === dept.id);
    root.innerHTML = breadcrumb([{ label: dept.name }])
      + pageHead(dept.name + ' reports', 'Department-wide reports and individual employee report collections.', link('reports', 'All departments', 'btn btn-ghost', 'arrowLeft'), 'Department report collection')
      + '<div class="stat-strip report-stats"><div class="item"><span>Employees</span><b>' + dept.employee_count + '</b></div><div class="item"><span>Active employees</span><b>' + dept.active_count + '</b></div><div class="item"><span>Report types</span><b>' + types.length + '</b></div><div class="item"><span>Department head</span><b class="report-head-name">' + esc(dept.head_name || 'Not assigned') + '</b></div></div>'
      + '<div class="report-section-heading"><h2>Department reports</h2><p>Includes only records you are authorised to view.</p></div><div class="grid grid-2 report-type-grid">' + types.map(t => typeCard(t, { department_id: dept.id })).join('') + '</div>'
      + '<div class="report-section-heading"><h2>Reports by employee</h2><p>Select a report type beside an employee to open its details.</p></div>' + employeeTable(employees, catalogue.types);
    bindEmployeeActions(root, () => department(root, id));
  }
  function employee(root, id) {
    const person = catalogue.employees.find(e => e.id === Number(id));
    if (!person) throw new Error('This employee is not available in your report scope.');
    const types = catalogue.types.filter(t => person.report_types.includes(t.key));
    const back = 'reports/department/' + (person.department_id || 0);
    root.innerHTML = breadcrumb([{ label: person.department_name, path: back }, { label: person.name }])
      + pageHead(person.name + ' reports', person.employee_no + ' · ' + (person.designation_title || 'Team member'), link(back, 'Department reports', 'btn btn-ghost', 'arrowLeft'), 'Employee report collection')
      + '<div class="card card-pad report-person-banner">' + avatarHTML(person.name, 'avatar-lg', '', person.photo_url) + '<div><h2>' + esc(person.name) + '</h2><p>' + esc(person.department_name) + ' · ' + esc(person.employee_no) + '</p></div>' + chip(person.status) + '</div>'
      + '<div class="report-section-heading"><h2>Available report types</h2><p>Each report has its own detail page, filters and branded print layout.</p></div><div class="grid grid-2 report-type-grid">' + types.map(t => typeCard(t, { employee_id: person.id })).join('') + '</div>';
  }

  function filterForm(type, filters) {
    const employees = catalogue.employees.filter(e => e.report_types.includes(type.key) &&
      (!filters.department_id || (e.department_id || 0) === Number(filters.department_id)));
    const fixedEmployee = !!filters.employee_id;
    let fields = '';
    if (type.scope !== 'employee' && !fixedEmployee) {
      fields += '<div class="field"><label for="report-employee-filter">Employee</label><select class="select" id="report-employee-filter" name="employee_id"><option value="">All accessible employees</option>' + employees.map(e => '<option value="' + e.id + '"' + (String(filters.employee_id || '') === String(e.id) ? ' selected' : '') + '>' + esc(e.name + ' · ' + e.employee_no) + '</option>').join('') + '</select></div>';
    }
    if (type.date_field) {
      fields += '<div class="field"><label for="report-date-from">' + esc(type.date_label) + ' from</label><input class="input" type="date" id="report-date-from" name="date_from" value="' + esc(filters.date_from || '') + '"></div>'
        + '<div class="field"><label for="report-date-to">' + esc(type.date_label) + ' to</label><input class="input" type="date" id="report-date-to" name="date_to" value="' + esc(filters.date_to || '') + '"></div>';
    }
    if (type.year_filter) fields += '<div class="field"><label for="report-year">Leave year</label><input class="input" type="number" min="1900" max="2200" id="report-year" name="year" placeholder="All years" value="' + esc(filters.year || '') + '"></div>';
    if (type.statuses) fields += '<div class="field"><label for="report-status">' + esc(type.status_label) + '</label><select class="select" id="report-status" name="status"><option value="">All statuses</option>' + type.statuses.map(s => '<option value="' + esc(s) + '"' + (filters.status === s ? ' selected' : '') + '>' + esc(s.replace(/_/g, ' ')) + '</option>').join('') + '</select></div>';
    fields += '<div class="field"><label for="report-keyword">Search within report</label><input class="input" id="report-keyword" type="search" name="q" placeholder="Name, number, title or notes…" value="' + esc(filters.q || '') + '"></div>';
    return '<form class="card card-pad report-filters" id="report-filter-form"><div class="report-filter-fields">' + fields + '</div><div class="report-filter-actions"><span class="tiny muted">Filters apply to both the preview and the complete printout.</span><button class="btn btn-ghost btn-sm" type="button" id="report-reset">Reset filters</button><button class="btn btn-accent btn-sm" type="submit">' + icon('refresh', 14) + ' Apply filters</button></div></form>';
  }
  function previewSections(data) {
    return data.sections.map(section => '<section class="report-preview-section"><div class="card-head"><div><h3>' + esc(section.title) + '</h3>' + (section.description ? '<div class="sub">' + esc(section.description) + '</div>' : '') + '</div><span class="pill-tag">' + section.record_count + ' records</span></div>'
      + (section.kind === 'fields' ? '<dl class="report-preview-fields">' + section.fields.map(f => '<div><dt>' + esc(f.label) + '</dt><dd>' + esc(f.value) + '</dd></div>').join('') + '</dl>'
        : section.rows.length ? '<div class="table-wrap"><table class="report-preview-table"><thead><tr>' + section.columns.map(c => '<th scope="col">' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' + section.rows.map(row => '<tr>' + section.columns.map(c => '<td>' + (c.format === 'status' ? chip(row[c.key]) : esc(row[c.key] ?? '—')) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'
          : emptyState('No matching records', 'There are no records for this report with the selected filters.')) + '</section>').join('');
  }
  function drawPreview(root) {
    const data = currentReport;
    const perPage = 25;
    let skip = (state.previewPage - 1) * perPage;
    let remaining = perPage;
    const sections = data.sections.map(section => {
      if (section.kind === 'fields') return section;
      const start = Math.min(skip, section.rows.length);
      const count = Math.min(section.rows.length - start, remaining);
      const rows = section.rows.slice(start, start + count);
      skip = Math.max(0, skip - section.rows.length);
      remaining -= count;
      return { ...section, rows };
    });
    const pages = Math.max(1, Math.ceil(data.record_count / perPage));
    const preview = { ...data, sections };
    const target = root.querySelector('#report-preview');
    target.innerHTML = '<div class="report-preview-brand"><div>' + (data.company.logo_url ? '<img src="' + esc(data.company.logo_url) + '" alt="' + esc(data.company.name) + ' logo">' : '<span class="report-preview-monogram">' + esc(data.company.initial) + '</span>') + '<div><strong>' + esc(data.company.name) + '</strong><small>Official HR report · ' + esc(data.reference) + '</small></div></div><span class="chip chip-teal">Print preview</span></div>'
      + '<div class="report-preview-title"><h2>' + esc(data.title) + '</h2><p>' + esc(data.scope.label) + ' · ' + esc(data.scope.period) + '</p></div>'
      + '<div class="report-preview-summary">' + data.summary.map(s => '<div><span>' + esc(s.label) + '</span><strong>' + esc(s.value) + '</strong></div>').join('') + '</div>'
      + previewSections(preview)
      + '<div class="report-preview-footer"><strong>' + esc(data.company.legal_name || data.company.name) + '</strong><span>' + esc([data.company.address, data.company.phone, data.company.email, data.company.website].filter(Boolean).join(' · ')) + '</span><div><b>CONFIDENTIAL · authorised personnel only</b><span>' + esc(data.reference) + ' · ' + esc(data.generated_at) + '</span></div></div>'
      + '<div class="report-preview-pagination">' + pagerHTML({ page: state.previewPage, pages, total: data.record_count, per_page: perPage }) + '<span class="tiny muted">Printing includes all ' + data.record_count + ' matching records, not just this preview page.</span></div>';
    bindPager(target, page => { state.previewPage = page; drawPreview(root); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  async function detail(root, typeKey, filters) {
    state.previewPage = 1;
    await openCatalogue(root);
    const type = catalogue.types.find(t => t.key === typeKey);
    if (!type) throw new Error('Unknown report type. Choose a report from the report centre.');
    const response = await API.get('/employee-reports/detail', { ...filters, type: typeKey });
    currentReport = response.data;
    const data = currentReport;
    const crumbs = [];
    if (data.scope.department_id !== null && data.scope.department_id !== undefined) crumbs.push({ label: data.scope.department_name || 'Department', path: 'reports/department/' + data.scope.department_id });
    if (data.scope.employee) crumbs.push({ label: data.scope.employee.name, path: 'reports/employee/' + data.scope.employee.id });
    crumbs.push({ label: data.title });
    const otherTypes = catalogue.types.filter(t => data.scope.employee ? data.scope.employee && catalogue.employees.find(e => e.id === data.scope.employee.id)?.report_types.includes(t.key) : data.organisation_types.includes(t.key));
    root.innerHTML = breadcrumb(crumbs)
      + pageHead(data.title, data.scope.label + ' · ' + data.scope.period,
        '<button class="btn btn-accent" id="report-print">' + icon('printer', 16) + ' Print / Save PDF</button>', 'Report details')
      + '<div class="report-type-switch"><label for="report-type-switch">Report type</label><select class="select" id="report-type-switch">' + otherTypes.map(t => '<option value="' + esc(t.key) + '"' + (t.key === typeKey ? ' selected' : '') + '>' + esc(t.title) + '</option>').join('') + '</select><span class="tiny muted">' + esc(catalogue.scope_label) + '</span></div>'
      + filterForm(type, filters) + '<div id="report-print-error" class="form-error hidden" role="alert"></div>'
      + '<div class="card report-preview" id="report-preview" aria-label="Report preview"></div>';
    drawPreview(root);
    // Keep the selected department/employee, but clear type-specific filters
    // (e.g. do not carry attendance status "present" into a leave report).
    root.querySelector('#report-type-switch').onchange = event => go(pathFor(event.target.value,
      { department_id: filters.department_id, employee_id: filters.employee_id }));
    root.querySelector('#report-filter-form').onsubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      if (values.date_from && values.date_to && values.date_from > values.date_to) {
        toast('The start date must not be after the end date.', 'error'); return;
      }
      go(pathFor(typeKey, { ...filters, ...values, employee_id: filters.employee_id || values.employee_id || '' }));
    };
    root.querySelector('#report-reset').onclick = () => go(pathFor(typeKey, { department_id: filters.department_id, employee_id: filters.employee_id }));
    root.querySelector('#report-print').onclick = () => printReport(typeKey, filters, root);
  }

  async function printReport(typeKey, filters, root) {
    if (printBusy) return;
    printBusy = true;
    const button = root.querySelector('#report-print');
    const errorBox = root.querySelector('#report-print-error');
    if (button) { button.disabled = true; button.textContent = 'Preparing printout…'; }
    if (errorBox) errorBox.classList.add('hidden');
    let frame;
    let cleanupTimer;
    try {
      const params = new URLSearchParams({ ...filters, type: typeKey });
      // Fetch with the Authorization header: never put a session token in a URL.
      const response = await fetch('/api/v1/employee-reports/print-report?' + params, {
        headers: { Authorization: 'Bearer ' + API.token }, cache: 'no-store', credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Could not prepare the report (' + response.status + ').');
      }
      const html = await response.text();
      frame = document.createElement('iframe');
      frame.title = 'Printable company report';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10000px;top:0;';
      const cleanup = () => { if (frame) frame.remove(); clearTimeout(cleanupTimer); };
      frame.onload = async () => {
        try {
          const win = frame.contentWindow;
          const doc = frame.contentDocument;
          await Promise.all(Array.from(doc.images).map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 5000);
          })));
          win.addEventListener('afterprint', cleanup, { once: true });
          win.focus();
          win.print();
          cleanupTimer = setTimeout(cleanup, 60000);
        } catch (err) { cleanup(); toast('Print failed: ' + err.message, 'error'); }
      };
      frame.srcdoc = html;
      document.body.appendChild(frame);
    } catch (err) {
      if (frame) frame.remove();
      if (errorBox) { errorBox.textContent = err.message; errorBox.classList.remove('hidden'); }
      toast(err.message, 'error');
    } finally {
      printBusy = false;
      if (button) { button.disabled = false; button.innerHTML = icon('printer', 16) + ' Print / Save PDF'; }
    }
  }

  async function render(root, params = []) {
    try {
      if (params[0] === 'analytics') {
        if (!Store.isRole('super_admin', 'hr_admin', 'hr_officer', 'payroll', 'manager', 'auditor')) throw new Error('Workforce analytics is not available for your role. Your employee reports are in the report centre.');
        return await Views.reportAnalytics(root);
      }
      if (params[0] === 'detail') return await detail(root, params[1], query());
      await openCatalogue(root);
      state.search = ''; state.page = 1;
      if (params[0] === 'department') return department(root, params[1]);
      if (params[0] === 'employee') return employee(root, params[1]);
      hub(root);
    } catch (err) {
      root.innerHTML = breadcrumb([{ label: 'Unavailable' }]) + pageHead('Report unavailable', 'We could not open this report.')
        + '<div class="card">' + emptyState('Unable to load report', err.message || 'Please try again.', 'alert') + '<div class="report-error-action">' + link('reports', 'Back to report centre', 'btn btn-teal', 'arrowLeft') + '</div></div>';
    }
  }
  return { render, pathFor, query, printReport };
})();
Views.reports = ReportCentre.render;
