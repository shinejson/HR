const Views = {};

function go(path) { location.hash = "#/" + path; }

function handleErr(e) { toast(e.message || "Something went wrong", "error"); }

function employeeOptions() {
  return optionsFrom((Store.meta && Store.meta.employees) || [], "name", "id");
}

function deptOptions() {
  return optionsFrom((Store.meta && Store.meta.departments) || [], "name", "id");
}

function designationOptions() {
  return optionsFrom((Store.meta && Store.meta.designations) || [], "title", "id");
}

function roleOptions() {
  return optionsFrom((Store.meta && Store.meta.roles) || [], "name", "id");
}

function todayRecord(rows) {
  const t = todayISO();
  return rows.find(r => (r.work_date || "").slice(0, 10) === t);
}

function personCell(row, sub) {
  const name = row.employee_name || row.name || "—";
  return '<div class="person">' + avatarHTML(name, "avatar-sm") +
    '<div><b>' + esc(name) + '</b><span>' + esc(sub || row.employee_no || row.job_title || "—") + '</span></div></div>';
}

function statusSelectActions(row, resource, field) {
  return '<select class="select" style="height:29px;font-size:11.5px;min-width:110px" data-status-resource="' + resource + '" data-status-id="' + row.id + '" data-status-field="' + (field || "status") + '">'
    + ["active", "probation", "suspended", "resigned", "terminated"].map(s =>
      '<option value="' + s + '"' + (row[field || "status"] === s ? " selected" : "") + '>' + s[0].toUpperCase() + s.slice(1) + '</option>').join("")
    + '</select>';
}

/* ============================================================ DASHBOARD */
Views.dashboard = async function (root) {
  root.innerHTML = pageHead("Overview", "Loading your workspace…") + spinners(4);
  try {
    const [dashRes, repRes] = await Promise.all([API.get("/dashboard"), API.get("/reports/overview")]);
    const d = dashRes.data, r = repRes.data;
    const user = Store.user;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const isManager = Store.isRole("manager", "hr_admin", "hr_officer", "super_admin");
    const attLabels = r.attendance.map(a => fmtDateShort(a.date).replace(" ", " "));
    const chart = lineChart(attLabels, [
      { name: "Present", values: r.attendance.map(a => a.present), color: "#0f766e" },
      { name: "Absent", values: r.attendance.map(a => a.absent), color: "#c2703d" },
    ]);
    const balances = (d.my_leave || []).map(b => {
      const pct = b.entitled ? Math.min(100, Math.round((b.remaining / b.entitled) * 100)) : 0;
      const pctVar = pct < 30 ? "#a83a32" : pct < 60 ? "#a97316" : "#0f766e";
      const circ = 2 * Math.PI * 26;
      return '<div class="ring-wrap"><div class="ring"><svg width="62" height="62"><circle cx="31" cy="31" r="26" fill="none" stroke="#eee9df" stroke-width="7"/>'
        + '<circle cx="31" cy="31" r="26" fill="none" stroke="' + pctVar + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (circ * pct / 100).toFixed(1) + ' ' + circ.toFixed(1) + '"/></svg>'
        + '<div class="center">' + b.remaining + '</div></div>'
        + '<div class="ring-legend"><b>' + esc(b.type) + '</b><span>' + b.remaining + ' of ' + b.entitled + ' days left</span></div></div>';
    }).join("") || '<p class="small muted">No leave balances configured.</p>';

    const approvalRows = [];
    try {
      const inbox = await API.get("/approvals/inbox");
      approvalRows.push(...inbox.data.slice(0, 5));
    } catch (e) {}
    const approvalHTML = approvalRows.length ? approvalRows.map(a => {
      return '<div class="list-row">' + avatarHTML(a.title, "avatar-sm") + '<div class="body"><b>' + esc(a.title) + '</b><span>' + esc(a.subtitle) + ' · ' + timeAgo(a.requested_at) + '</span></div>'
        + '<div class="row" style="gap:4px"><button class="btn btn-sm btn-soft" data-approve="' + a.type + '" data-id="' + a.id + '">' + icon("check", 12) + '</button>'
        + '<button class="btn btn-sm btn-danger" data-reject="' + a.type + '" data-id="' + a.id + '">' + icon("x", 12) + '</button></div></div>';
    }).join("") : '<p class="small muted" style="padding:6px 0">Nothing waiting on you. Inbox is clear.</p>';

    const annHTML = (d.announcements || []).map(a =>
      '<div class="announcement"><div class="meta">' + icon("megaphone", 12) + '<span>' + fmtDate(a.publish_at || a.created_at) + '</span>'
      + (a.pinned ? '<span class="chip chip-amber chip-plain" style="height:18px">Pinned</span>' : "") + '</div>'
      + '<h4>' + esc(a.title) + '</h4><p>' + esc((a.body || "").slice(0, 140)) + '</p></div>').join("")
      || '<p class="small muted">No announcements yet.</p>';

    const upcoming = []
      .concat((d.birthdays || []).map(b => ({ icon: "sparkle", title: b.name, sub: "Birthday · " + b.date, color: "var(--accent)" })))
      .concat((d.expiring_documents || []).map(x => ({ icon: "file", title: x.title, sub: "Expires " + fmtDate(x.date) + (x.employee ? " · " + x.employee : ""), color: "var(--amber)" })));
    const upcomingHTML = upcoming.length ? upcoming.map(u =>
      '<div class="list-row"><div class="kpi-icon" style="width:30px;height:30px;background:var(--paper-2);color:' + u.color + '">' + icon(u.icon, 14) + '</div>'
      + '<div class="body"><b>' + esc(u.title) + '</b><span>' + esc(u.sub) + '</span></div></div>').join("")
      : '<p class="small muted">Nothing upcoming in the next 45 days.</p>';

    root.innerHTML = pageHead("Overview", greeting + ", " + user.name.split(" ")[0] + " — here is the people pulse for today.", "", "Workspace")
      + '<div class="hero-strip" style="margin-bottom:18px"><div class="row-between wrap" style="gap:16px"><div>'
      + '<div class="eyebrow">' + new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + '</div>'
      + '<h2>' + esc(d.company.name) + ' · people at a glance</h2>'
      + '<p>' + d.headcount + ' people across ' + (d.departments || []).length + ' departments · ' + d.on_leave_today + ' on leave today</p></div>'
      + '<div class="hero-actions"><button class="btn btn-accent" id="quick-leave">' + icon("calendar", 15) + ' Apply for leave</button>'
      + '<button class="btn btn-ghost" id="quick-clock">' + icon("clock", 15) + ' Clock in</button>'
      + (isManager ? '<button class="btn btn-ghost" id="quick-approvals">' + icon("inbox", 15) + ' Approval inbox</button>' : "")
      + '</div></div></div>'
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Total headcount", value: d.headcount, icon: "users", tone: "teal", foot: '<span class="delta-up">+' + d.new_hires + '</span> joined this month' })
      + kpiCard({ label: "Present today", value: d.present_today, icon: "clock", tone: "blue", foot: d.on_leave_today + ' on approved leave' })
      + kpiCard({ label: "Pending approvals", value: d.pending_approvals, icon: "inbox", tone: "accent", foot: 'Leave requests awaiting decision' })
      + kpiCard({ label: "Payroll (last run)", value: compactMoney(d.payroll_cost), icon: "wallet", tone: "purple", foot: 'Status: <b style="color:var(--ink);text-transform:capitalize">' + esc(d.payroll_status) + '</b>' })
      + '</div>'
      + '<div class="grid grid-3" style="margin-bottom:18px">'
      + '<div class="card span-2"><div class="card-head"><div><h3>Attendance pulse</h3><div class="sub">Last 10 working days</div></div><div class="right chart-legend"><span class="item"><span class="swatch" style="background:#0f766e"></span>Present</span><span class="item"><span class="swatch" style="background:#c2703d"></span>Absent</span></div></div><div class="card-body">' + chart + '</div></div>'
      + '<div class="card"><div class="card-head"><div><h3>My leave balance</h3><div class="sub">' + new Date().getFullYear() + ' entitlement</div></div><div class="right"><span class="link" onclick="go(\'leave\')">Manage</span></div></div><div class="card-body stack">' + balances + '</div></div>'
      + '</div>'
      + '<div class="grid grid-3">'
      + '<div class="card"><div class="card-head"><div><h3>Headcount by department</h3><div class="sub">Active employees</div></div><div class="right"><span class="link" onclick="go(\'organisation\')">View org</span></div></div><div class="card-body">' + barList(d.departments || []) + '</div></div>'
      + '<div class="card"><div class="card-head"><div><h3>' + (isManager ? "Awaiting your decision" : "My requests") + '</h3><div class="sub">' + (isManager ? "Approvals inbox" : "Latest activity") + '</div></div><div class="right">' + (isManager ? '<span class="link" onclick="go(\'leave\')">Open inbox</span>' : "") + '</div></div><div class="card-body" style="padding-top:6px">' + approvalHTML + '</div></div>'
      + '<div class="card"><div class="card-head"><div><h3>Upcoming</h3><div class="sub">Birthdays & document expiry</div></div></div><div class="card-body" style="padding-top:6px">' + upcomingHTML + '</div></div>'
      + '</div>'
      + '<div class="card" style="margin-top:18px"><div class="card-head"><div><h3>Company announcements</h3><div class="sub">What the team needs to know</div></div><div class="right"><span class="link" onclick="go(\'announcements\')">All announcements</span></div></div><div class="card-body" style="padding-top:2px">' + annHTML + '</div></div>';

    root.querySelector("#quick-leave").onclick = () => openLeaveForm();
    root.querySelector("#quick-clock").onclick = async () => {
      try { await API.post("/attendance/clock-in"); toast("Clocked in. Have a productive day.", "success"); Views.dashboard(root); }
      catch (e) { handleErr(e); }
    };
    const qa = root.querySelector("#quick-approvals");
    if (qa) qa.onclick = () => go("leave");
    root.querySelector("#quick-leave") && (root.querySelector("#quick-approvals") || root.querySelector("#quick-leave"));
    bindApprovalButtons(root);
  } catch (e) {
    root.innerHTML = pageHead("Overview", "Could not load dashboard") + emptyState("Something went wrong", e.message, "alert");
  }
};

function bindApprovalButtons(root) {
  root.querySelectorAll("[data-approve],[data-reject]").forEach(btn => {
    btn.onclick = async () => {
      const decision = btn.dataset.approve ? "approved" : "rejected";
      const type = btn.dataset.approve || btn.dataset.reject;
      try {
        await API.post("/approvals/decide", { type: type, id: Number(btn.dataset.id), decision: decision });
        toast("Request " + decision, "success");
        navigate();
      } catch (e) { handleErr(e); }
    };
  });
}

/* ============================================================ EMPLOYEES */
const empState = { page: 1, search: "", department_id: "", status: "", contract_type: "" };

Views.employees = async function (root, params) {
  if (params && params[0]) return viewEmployeeDetail(root, params[0]);
  root.innerHTML = pageHead("Employees", "Loading people directory…") + spinners(4);
  try {
    await drawEmployees(root);
  } catch (e) {
    root.innerHTML = emptyState("Unable to load employees", e.message, "alert");
  }
};

async function drawEmployees(root) {
  const res = await API.get("/employees", {
    page: empState.page, per_page: 12, search: empState.search,
    department_id: empState.department_id, status: empState.status, contract_type: empState.contract_type,
  });
  const rows = res.data, meta = res.meta;
  const canEdit = Store.canManage();
  const actions = (canEdit ? '<button class="btn btn-ghost" id="emp-import">' + icon("upload", 15) + ' Import</button>' : "")
    + '<a class="btn btn-ghost" href="/api/v1/employees/export.csv?token=' + API.token + '">' + icon("download", 15) + ' Export</a>'
    + (canEdit ? '<button class="btn btn-accent" id="emp-add">' + icon("plus", 15) + ' Add employee</button>' : "");

  const subtitle = Store.isRole("employee")
    ? "Your employee record. Contact HR to request a change."
    : meta.total + " people in the directory. Every change is audited.";
  root.innerHTML = pageHead("Employees", subtitle, actions, "Core HR")
    + '<div class="toolbar"><div class="searchbox">' + icon("search", 15) + '<input id="emp-search" placeholder="Search name, number or email…" value="' + esc(empState.search) + '"></div>'
    + '<select class="select" id="emp-dept"><option value="">All departments</option>' + deptOptions().map(o => '<option value="' + o.value + '"' + (String(empState.department_id) === String(o.value) ? " selected" : "") + '>' + esc(o.label) + '</option>').join("") + '</select>'
    + '<select class="select" id="emp-status"><option value="">Any status</option>' + ["active", "probation", "suspended", "resigned", "terminated"].map(s => '<option value="' + s + '"' + (empState.status === s ? " selected" : "") + '>' + s[0].toUpperCase() + s.slice(1) + '</option>').join("") + '</select>'
    + '<select class="select" id="emp-contract"><option value="">All contracts</option>' + ["permanent", "fixed_term", "casual", "intern"].map(s => '<option value="' + s + '"' + (empState.contract_type === s ? " selected" : "") + '>' + s.replace("_", " ") + '</option>').join("") + '</select>'
    + '<div class="spacer"></div><span class="tiny muted">' + meta.total + ' records</span></div>'
    + renderTable({
      columns: [
        { label: "Employee", render: r => personCell(r, r.email) },
        { label: "Number", render: r => '<span class="mono tiny">' + esc(r.employee_no) + '</span>' },
        { label: "Department", render: r => esc(r.department_name || "—") },
        { label: "Designation", render: r => esc(r.designation_title || "—") },
        { label: "Branch", render: r => esc(r.branch_name || "—") },
        { label: "Contract", render: r => '<span style="text-transform:capitalize">' + esc((r.contract_type || "").replace("_", " ")) + '</span>' },
        { label: "Status", render: r => chip(r.status) },
        { label: "", class: "right", render: r => '<button class="icon-btn" data-open-emp="' + r.id + '" style="width:28px;height:28px">' + icon("arrowRight", 14) + '</button>' },
      ],
      rows: rows,
      onRowClick: true,
      emptyTitle: "No employees match",
      emptyText: "Try clearing filters or add a new employee.",
    }) + '<div style="margin-top:0">' + pagerHTML(meta) + '</div>';

  const search = root.querySelector("#emp-search");
  search.oninput = debounce(() => { empState.search = search.value; empState.page = 1; drawEmployees(root); }, 280);
  root.querySelector("#emp-dept").onchange = (e) => { empState.department_id = e.target.value; empState.page = 1; drawEmployees(root); };
  root.querySelector("#emp-status").onchange = (e) => { empState.status = e.target.value; empState.page = 1; drawEmployees(root); };
  root.querySelector("#emp-contract").onchange = (e) => { empState.contract_type = e.target.value; empState.page = 1; drawEmployees(root); };
  root.querySelectorAll("[data-open-emp]").forEach(b => b.onclick = (ev) => { ev.stopPropagation(); go("employees/" + b.dataset.openEmp); });
  root.querySelectorAll("tbody tr[data-row]").forEach(tr => tr.onclick = () => {
    const row = rows[Number(tr.dataset.row)];
    if (row) go("employees/" + row.id);
  });
  const add = root.querySelector("#emp-add");
  if (add) add.onclick = () => openEmployeeForm();
  const imp = root.querySelector("#emp-import");
  if (imp) imp.onclick = openImportDialog;
  bindPager(root, p => { empState.page = p; drawEmployees(root); });
}

function openEmployeeForm(existing) {
  const e = existing || {};
  formModal({
    title: existing ? "Edit employee" : "Add employee",
    sub: existing ? "Update " + (e.first_name + " " + e.last_name) : "Create a new employee master record",
    wide: true,
    submitLabel: existing ? "Save changes" : "Create employee",
    successMessage: existing ? "Employee updated" : "Employee created",
    fields: [
      { name: "first_name", label: "First name", required: true, value: e.first_name },
      { name: "last_name", label: "Last name", required: true, value: e.last_name },
      { name: "email", label: "Work email", type: "email", value: e.email },
      { name: "phone", label: "Phone", value: e.phone },
      { name: "gender", label: "Gender", type: "select", options: ["female", "male", "other"], value: e.gender, placeholder: "Select…" },
      { name: "dob", label: "Date of birth", type: "date", value: e.dob },
      { name: "marital_status", label: "Marital status", type: "select", options: ["single", "married", "divorced", "widowed"], value: e.marital_status, placeholder: "Select…" },
      { name: "nationality", label: "Nationality", value: e.nationality || "Ghanaian" },
      { name: "department_id", label: "Department", type: "select", options: deptOptions(), value: e.department_id, required: true, placeholder: "Select…" },
      { name: "designation_id", label: "Designation", type: "select", options: designationOptions(), value: e.designation_id, placeholder: "Select…" },
      { name: "branch_id", label: "Branch", type: "select", options: optionsFrom(Store.meta.branches, "name", "id"), value: e.branch_id },
      { name: "manager_id", label: "Reports to", type: "select", options: employeeOptions(), value: e.manager_id, placeholder: "No manager" },
      { name: "grade_id", label: "Grade", type: "select", options: optionsFrom(Store.meta.grades, "name", "id"), value: e.grade_id },
      { name: "contract_type", label: "Contract type", type: "select", options: ["permanent", "fixed_term", "casual", "intern"], value: e.contract_type || "permanent" },
      { name: "hire_date", label: "Hire date", type: "date", value: e.hire_date || todayISO(), required: true },
      { name: "status", label: "Status", type: "select", options: ["active", "probation", "suspended", "resigned", "terminated"], value: e.status || "active" },
      { name: "basic_salary", label: "Basic salary (GHS)", type: "number", value: e.basic_salary, step: "0.01", min: 0 },
      { name: "city", label: "City", value: e.city || "Accra" },
      { name: "address", label: "Address", value: e.address, full: true },
      { name: "national_id", label: "National ID", value: e.national_id },
      { name: "tax_number", label: "Tax number", value: e.tax_number },
      { name: "ssnit_number", label: "SSNIT number", value: e.ssnit_number },
      { name: "photo_url", label: "Photo URL", value: e.photo_url },
    ],
    onSubmit: async (data) => {
      const payload = { ...data };
      ["department_id", "designation_id", "branch_id", "manager_id", "grade_id"].forEach(k => { if (!payload[k]) delete payload[k]; });
      if (payload.basic_salary === null) payload.basic_salary = 0;
      if (existing) await API.put("/employees/" + existing.id, payload);
      else await API.post("/employees", payload);
      navigate();
    },
  });
}

function openImportDialog() {
  openModal({
    title: "Import employees",
    sub: "Paste CSV rows. First row may contain headers.",
    wide: true,
    body: '<p class="small muted" style="margin-bottom:10px">Supported columns: <span class="mono">first_name, last_name, email, phone, gender, hire_date, department_id, designation_id, basic_salary, contract_type</span>. Required: first name, last name.</p>'
      + '<textarea class="textarea mono" id="csv-input" rows="10" placeholder="first_name,last_name,email,phone,hire_date,basic_salary&#10;Yaa,Owusu,yaa@meridian.gh,+233240000000,2026-10-01,4500"></textarea>'
      + '<div id="import-result" class="small" style="margin-top:10px"></div>',
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-accent" id="import-run">Import rows</button>',
    onMount(card) {
      card.querySelector("#import-run").onclick = async () => {
        const text = card.querySelector("#csv-input").value.trim();
        if (!text) return toast("Paste some CSV rows first", "error");
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = lines[0].toLowerCase().includes("first_name") ? lines.shift().split(",").map(h => h.trim()) : null;
        const rows = lines.map(line => {
          const cells = line.split(",").map(c => c.trim());
          if (headers) { const o = {}; headers.forEach((h, i) => o[h] = cells[i]); return o; }
          return { first_name: cells[0], last_name: cells[1], email: cells[2], phone: cells[3], hire_date: cells[4], basic_salary: cells[5] };
        });
        try {
          const res = await API.post("/employees/import", { rows });
          card.querySelector("#import-result").innerHTML = '<span class="chip chip-green">' + res.data.created + ' created</span> '
            + (res.data.errors.length ? '<span class="chip chip-red">' + res.data.errors.length + ' errors</span><pre class="tiny mono" style="margin-top:8px;white-space:pre-wrap">' + esc(JSON.stringify(res.data.errors.slice(0, 5), null, 2)) + '</pre>' : "");
          toast(res.data.created + " employees imported", "success");
          await Store.loadMeta();
        } catch (e) { handleErr(e); }
      };
    },
  });
}

async function viewEmployeeDetail(root, id) {
  root.innerHTML = pageHead("Employee", "Loading profile…") + spinners(4);
  try {
    const res = await API.get("/employees/" + id + "/profile");
    const e = res.data;
    let tab = "overview";
    const canEdit = Store.canManage();

    const render = () => {
      const tabs = [
        ["overview", "Overview"], ["job", "Job & timeline"], ["documents", "Documents"],
        ["leave", "Leave"], ["attendance", "Attendance"], ["payslips", "Payslips"],
        ["assets", "Assets"], ["onboarding", "Onboarding"],
      ];
      let body = "";
      if (tab === "overview") {
        body = '<div class="grid grid-2">'
          + '<div class="card"><div class="card-head"><h3>Contact & personal</h3></div><div class="card-body"><dl class="kv">'
          + '<dt>Email</dt><dd>' + esc(e.email || "—") + '</dd><dt>Phone</dt><dd>' + esc(e.phone || "—") + '</dd>'
          + '<dt>Date of birth</dt><dd>' + fmtDate(e.dob) + '</dd><dt>Gender</dt><dd style="text-transform:capitalize">' + esc(e.gender || "—") + '</dd>'
          + '<dt>Nationality</dt><dd>' + esc(e.nationality || "—") + '</dd><dt>Marital status</dt><dd style="text-transform:capitalize">' + esc(e.marital_status || "—") + '</dd>'
          + '<dt>Address</dt><dd>' + esc(e.address || "—") + ', ' + esc(e.city || "") + '</dd>'
          + '<dt>National ID</dt><dd class="mono">' + esc(mask(e.national_id)) + '</dd>'
          + '<dt>Tax number</dt><dd class="mono">' + esc(mask(e.tax_number)) + '</dd>'
          + '</dl></div></div>'
          + '<div class="card"><div class="card-head"><h3>Emergency contacts</h3></div><div class="card-body">'
          + (e.contacts.length ? e.contacts.map(c => '<div class="list-row">' + icon("phone", 16) + '<div class="body"><b>' + esc(c.name) + '</b><span>' + esc(c.relationship || "") + ' · ' + esc(c.phone || "") + '</span></div></div>').join("") : '<p class="small muted">No emergency contacts recorded.</p>')
          + '<div class="divider"></div><div class="section-title">Dependants</div>'
          + (e.dependants.length ? e.dependants.map(d => '<div class="list-row"><div class="body"><b>' + esc(d.name) + '</b><span>' + esc(d.relationship || "") + ' · ' + fmtDate(d.dob) + '</span></div>' + (d.is_beneficiary ? '<span class="chip chip-teal">Beneficiary</span>' : "") + '</div>').join("") : '<p class="small muted">No dependants recorded.</p>')
          + '</div></div>'
          + '<div class="card"><div class="card-head"><h3>Bank & payment</h3></div><div class="card-body">'
          + (e.bank_accounts.length ? e.bank_accounts.map(b => '<dl class="kv"><dt>Bank</dt><dd>' + esc(b.bank_name || "—") + '</dd><dt>Account name</dt><dd>' + esc(b.account_name || "—") + '</dd><dt>Account number</dt><dd class="mono">' + esc(mask(b.account_no, 4)) + '</dd><dt>Mobile money</dt><dd>' + esc(b.mobile_money || "—") + '</dd></dl>').join("") : '<p class="small muted">No bank details on file.</p>')
          + '</div></div>'
          + '<div class="card"><div class="card-head"><h3>Active assets</h3><div class="right"><span class="link" onclick="go(\'assets\')">Asset register</span></div></div><div class="card-body">'
          + (e.assets.length ? e.assets.map(a => '<div class="list-row">' + icon("laptop", 16) + '<div class="body"><b>' + esc(a.asset_name) + '</b><span>' + esc(a.asset_tag) + ' · since ' + fmtDate(a.assigned_at) + '</span></div></div>').join("") : '<p class="small muted">No assets currently assigned.</p>')
          + '</div></div></div>';
      } else if (tab === "job") {
        body = '<div class="grid grid-2" style="margin-bottom:18px"><div class="card"><div class="card-head"><h3>Job information</h3></div><div class="card-body"><dl class="kv">'
          + '<dt>Employee no.</dt><dd class="mono">' + esc(e.employee_no) + '</dd><dt>Department</dt><dd>' + esc(e.department_name || "—") + '</dd>'
          + '<dt>Designation</dt><dd>' + esc(e.designation_title || "—") + '</dd><dt>Grade</dt><dd>' + esc(e.grade_name || "—") + '</dd>'
          + '<dt>Branch</dt><dd>' + esc(e.branch_name || "—") + '</dd><dt>Reports to</dt><dd>' + esc(e.manager_name || "—") + '</dd>'
          + '<dt>Hire date</dt><dd>' + fmtDate(e.hire_date) + '</dd><dt>Contract</dt><dd style="text-transform:capitalize">' + esc((e.contract_type || "").replace("_", " ")) + '</dd>'
          + '<dt>Probation end</dt><dd>' + fmtDate(e.probation_end) + '</dd><dt>Basic salary</dt><dd>' + money(e.basic_salary) + '</dd>'
          + '</dl></div></div>'
          + '<div class="card"><div class="card-head"><h3>Employment timeline</h3></div><div class="card-body"><div class="timeline">'
          + (e.history.length ? e.history.map(h => '<div class="timeline-item"><b>' + esc((h.event_type || "").replace(/_/g, " ")) + '</b><span>' + fmtDate(h.effective_date) + (h.to_value ? " · " + esc(h.to_value) : "") + '</span></div>').join("") : '<p class="small muted">No history recorded.</p>')
          + '</div></div></div></div>';
      } else if (tab === "documents") {
        body = '<div class="card"><div class="card-head"><div><h3>Documents</h3><div class="sub">' + e.documents.length + ' on file</div></div><div class="right">' + (canEdit ? '<button class="btn btn-sm btn-accent" id="doc-add">' + icon("plus", 13) + ' Add document</button>' : "") + '</div></div>'
          + renderTable({
            columns: [
              { label: "Title", render: r => '<b>' + esc(r.title) + '</b>' },
              { label: "Category", render: r => '<span class="pill-tag">' + esc(r.category) + '</span>' },
              { label: "File", render: r => '<span class="mono tiny">' + esc(r.file_name || "—") + '</span>' },
              { label: "Expires", render: r => r.expires_at ? fmtDate(r.expires_at) : "—" },
              { label: "Uploaded", render: r => fmtDate(r.created_at) },
            ],
            rows: e.documents,
            emptyTitle: "No documents",
          }) + '</div>';
      } else if (tab === "leave") {
        body = '<div class="grid grid-2" style="margin-bottom:18px">'
          + '<div class="card"><div class="card-head"><h3>Leave balances</h3><div class="right"><button class="btn btn-sm btn-ghost" id="emp-leave-apply">Apply</button></div></div><div class="card-body">'
          + (e.leave_balances.length ? e.leave_balances.map(b => {
            const left = Number(b.entitled) - Number(b.taken) - Number(b.pending);
            return '<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line)"><div><b class="small">' + esc(b.leave_type_name) + '</b><div class="tiny muted">' + b.taken + ' taken · ' + b.pending + ' pending</div></div><div class="right"><b>' + left + '</b><span class="tiny muted"> / ' + b.entitled + '</span></div></div>';
          }).join("") : '<p class="small muted">No balances.</p>') + '</div></div>'
          + '<div class="card"><div class="card-head"><h3>Recent leave requests</h3></div>'
          + renderTable({ columns: [
            { label: "Type", render: r => esc(r.leave_type_name) },
            { label: "Dates", render: r => fmtDate(r.start_date) + " – " + fmtDate(r.end_date) },
            { label: "Days", key: "days" }, { label: "Status", render: r => chip(r.status) },
          ], rows: e.leave_requests, emptyTitle: "No leave requests" }) + '</div></div>';
      } else if (tab === "attendance") {
        body = '<div class="card">' + renderTable({
          columns: [
            { label: "Date", render: r => fmtDate(r.work_date) },
            { label: "Clock in", render: r => r.clock_in ? fmtTime(r.clock_in) : "—" },
            { label: "Clock out", render: r => r.clock_out ? fmtTime(r.clock_out) : "—" },
            { label: "Status", render: r => chip(r.status) },
            { label: "Overtime", render: r => r.overtime_minutes ? r.overtime_minutes + " min" : "—" },
          ], rows: e.attendance, emptyTitle: "No attendance recorded",
        }) + '</div>';
      } else if (tab === "payslips") {
        body = '<div class="card">' + renderTable({
          columns: [
            { label: "Period", render: r => esc((r.run && (r.run.period_year + " · " + monthName(r.run.period_month))) || "—") },
            { label: "Gross", render: r => money(r.gross) },
            { label: "Tax", render: r => money(r.tax) },
            { label: "Net", render: r => '<b>' + money(r.net) + '</b>' },
            { label: "", class: "right", render: r => '<button class="btn btn-sm btn-ghost" data-payslip="' + r.id + '">View payslip</button>' },
          ], rows: e.payslips, emptyTitle: "No payslips yet",
        }) + '</div>';
      } else if (tab === "assets") {
        body = '<div class="card">' + renderTable({
          columns: [
            { label: "Asset", render: r => '<b>' + esc(r.asset_name) + '</b>' },
            { label: "Tag", render: r => '<span class="mono tiny">' + esc(r.asset_tag) + '</span>' },
            { label: "Assigned", render: r => fmtDate(r.assigned_at) },
            { label: "Condition", render: r => esc(r.condition_out || "—") },
          ], rows: e.assets, emptyTitle: "No assets assigned",
        }) + '</div>';
      } else {
        body = '<div class="grid grid-2">'
          + '<div class="card"><div class="card-head"><h3>Onboarding checklist</h3></div><div class="card-body">'
          + (e.onboarding.length ? e.onboarding.map(t => '<div class="list-row"><div class="body"><b>' + esc(t.title) + '</b><span>' + esc(t.owner_role || "") + ' · due ' + fmtDate(t.due_date) + '</span></div>' + chip(t.status) + '</div>').join("") : '<p class="small muted">No onboarding tasks.</p>')
          + '</div></div>'
          + '<div class="card"><div class="card-head"><h3>Contracts</h3></div><div class="card-body">'
          + (e.contracts.length ? e.contracts.map(c => '<div class="list-row"><div class="body"><b style="text-transform:capitalize">' + esc((c.type || "").replace("_", " ")) + '</b><span>' + fmtDate(c.start_date) + ' → ' + (c.end_date ? fmtDate(c.end_date) : "open-ended") + '</span></div>' + chip(c.status) + '</div>').join("") : '<p class="small muted">No contracts.</p>')
          + '</div></div></div>';
      }

      root.innerHTML = '<div class="row" style="margin-bottom:14px"><button class="btn btn-ghost btn-sm" onclick="go(\'employees\')">' + icon("arrowLeft", 14) + ' All employees</button>'
        + '<div class="spacer" style="flex:1"></div>' + (canEdit ? '<button class="btn btn-ghost btn-sm" id="emp-edit">' + icon("edit", 14) + ' Edit</button>' : "")
        + (canEdit ? '<button class="btn btn-sm btn-soft" id="emp-status-btn">' + icon("refresh", 14) + ' Change status</button>' : "") + '</div>'
        + '<div class="card" style="margin-bottom:18px"><div class="card-body"><div class="row wrap" style="gap:20px;align-items:flex-start">'
        + avatarHTML(e.full_name || (e.first_name + " " + e.last_name), "avatar-xl")
        + '<div style="flex:1;min-width:200px"><div class="row" style="gap:10px;flex-wrap:wrap"><h2 style="font-family:var(--serif);font-size:30px;font-weight:500">' + esc(e.full_name || (e.first_name + " " + e.last_name)) + '</h2>' + chip(e.status) + '</div>'
        + '<div class="muted" style="font-size:13px;margin-top:2px">' + esc(e.designation_title || "—") + ' · ' + esc(e.department_name || "—") + '</div>'
        + '<div class="row wrap tiny muted" style="gap:16px;margin-top:10px">' + icon("mail", 13) + '<span>' + esc(e.email || "—") + '</span>' + icon("phone", 13) + '<span>' + esc(e.phone || "—") + '</span>' + icon("mapPin", 13) + '<span>' + esc([e.address, e.city].filter(Boolean).join(", ") || "—") + '</span>' + icon("briefcase", 13) + '<span class="mono">' + esc(e.employee_no) + '</span></div></div>'
        + '<div class="right tiny muted"><div>Joined</div><b style="color:var(--ink);font-size:14px">' + fmtDate(e.hire_date) + '</b><div style="margin-top:8px">Reports to</div><b style="color:var(--ink);font-size:13px">' + esc(e.manager_name || "—") + '</b></div>'
        + '</div></div></div>'
        + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (tab === t[0] ? "active" : "") + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
        + '<div class="page-enter">' + body + '</div>';

      root.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
      const edit = root.querySelector("#emp-edit");
      if (edit) edit.onclick = () => openEmployeeForm(e);
      const st = root.querySelector("#emp-status-btn");
      if (st) st.onclick = () => openStatusForm(e);
      const add = root.querySelector("#doc-add");
      if (add) add.onclick = () => openDocumentForm(e.id);
      const la = root.querySelector("#emp-leave-apply");
      if (la) la.onclick = () => openLeaveForm({ employee_id: e.id });
      root.querySelectorAll("[data-payslip]").forEach(b => b.onclick = () => openPayslipModal(Number(b.dataset.payslip)));
    };
    render();
  } catch (e) {
    root.innerHTML = pageHead("Employee", "Profile unavailable") + emptyState("Could not load profile", e.message, "alert");
  }
}

function mask(value, keep) {
  if (!value) return "—";
  const s = String(value);
  if (s.length <= 4) return "••••";
  return "•••• " + s.slice(-(keep || 3));
}

function monthName(m) {
  return new Date(2020, Number(m) - 1, 1).toLocaleString("en-GB", { month: "long" });
}

function openStatusForm(e) {
  formModal({
    title: "Change employment status",
    sub: e.full_name,
    submitLabel: "Update status",
    fields: [
      { name: "status", label: "New status", type: "select", options: ["active", "probation", "suspended", "resigned", "terminated"], value: e.status, required: true },
      { name: "effective_date", label: "Effective date", type: "date", value: todayISO() },
    ],
    onSubmit: async (data) => {
      await API.put("/employees/" + e.id, { status: data.status });
      await API.post("/employment-history", {
        employee_id: e.id, event_type: "status_change", from_value: e.status,
        to_value: data.status, effective_date: data.effective_date || todayISO(),
      });
      toast("Status updated to " + data.status, "success");
      navigate();
    },
  });
}

/* ============================================================ ORGANISATION */
const orgTab = { tab: "departments" };

Views.organisation = async function (root) {
  root.innerHTML = pageHead("Organisation", "Loading structure…") + spinners(3);
  try {
    const [deptRes, desRes, gradeRes, chartRes, empRes, branchRes] = await Promise.all([
      API.get("/departments", { per_page: 100 }), API.get("/designations", { per_page: 100 }),
      API.get("/grades", { per_page: 50 }), API.get("/org-chart"),
      API.get("/employees", { per_page: 200 }), API.get("/branches", { per_page: 50 }),
    ]);
    const depts = deptRes.data, desigs = desRes.data, grades = gradeRes.data, chartData = chartRes.data;
    const employees = empRes.data, branches = branchRes.data;
    const canEdit = Store.canManage();
    const countByDept = {};
    employees.forEach(e => { countByDept[e.department_id] = (countByDept[e.department_id] || 0) + 1; });

    const tabs = [["departments", "Departments"], ["designations", "Designations"], ["grades", "Grades & bands"], ["branches", "Locations"], ["chart", "Org chart"]];
    let body = "";
    if (orgTab.tab === "departments") {
      body = renderTable({
        columns: [
          { label: "Department", render: r => '<b>' + esc(r.name) + '</b>' + (r.code ? ' <span class="pill-tag">' + esc(r.code) + '</span>' : "") },
          { label: "Head", render: r => esc(Store.employeeName(r.head_id)) },
          { label: "Cost centre", render: r => '<span class="mono tiny">' + esc(r.cost_centre || "—") + '</span>' },
          { label: "People", render: r => '<b>' + (countByDept[r.id] || 0) + '</b>' },
          { label: "", class: "right", render: r => canEdit ? '<button class="icon-btn" style="width:28px;height:28px" data-edit-dept="' + r.id + '">' + icon("edit", 13) + '</button>' : "" },
        ],
        rows: depts, emptyTitle: "No departments",
      }) + '<div class="grid grid-3" style="margin-top:18px">' + depts.map(d =>
        '<div class="card card-pad"><div class="row-between"><div class="row">' + '<div class="kpi-icon teal" style="width:34px;height:34px">' + icon("building", 16) + '</div><div><b>' + esc(d.name) + '</b><div class="tiny muted">Head: ' + esc(Store.employeeName(d.head_id)) + '</div></div></div><span class="chip chip-teal chip-plain">' + (countByDept[d.id] || 0) + ' people</span></div></div>').join("") + '</div>';
    } else if (orgTab.tab === "designations") {
      body = renderTable({
        columns: [
          { label: "Title", render: r => '<b>' + esc(r.title) + '</b>' },
          { label: "Level", key: "level" },
          { label: "Department", render: r => { const d = depts.find(x => x.id === r.department_id); return d ? d.name : "—"; } },
          { label: "", class: "right", render: r => canEdit ? '<button class="icon-btn" style="width:28px;height:28px" data-edit-desig="' + r.id + '">' + icon("edit", 13) + '</button>' : "" },
        ],
        rows: desigs, emptyTitle: "No designations",
      });
    } else if (orgTab.tab === "grades") {
      body = renderTable({
        columns: [
          { label: "Grade", render: r => '<b>' + esc(r.name) + '</b>' },
          { label: "Level", key: "level" },
          { label: "Salary band", render: r => money(r.min_salary) + " – " + money(r.max_salary) },
          { label: "Employees", render: r => employees.filter(e => e.grade_id === r.id).length },
          { label: "", class: "right", render: r => canEdit ? '<button class="icon-btn" style="width:28px;height:28px" data-edit-grade="' + r.id + '">' + icon("edit", 13) + '</button>' : "" },
        ],
        rows: grades, emptyTitle: "No grades",
      });
    } else if (orgTab.tab === "branches") {
      body = renderTable({
        columns: [
          { label: "Location", render: r => '<b>' + esc(r.name) + '</b>' + (r.is_head_office ? ' <span class="chip chip-teal">HQ</span>' : "") },
          { label: "City", render: r => esc(r.city || "—") },
          { label: "Code", render: r => '<span class="mono tiny">' + esc(r.code || "—") + '</span>' },
          { label: "Address", render: r => esc(r.address || "—") },
          { label: "People", render: r => employees.filter(e => e.branch_id === r.id).length },
        ],
        rows: branches, emptyTitle: "No locations",
      });
    } else {
      const buildNode = (node) => '<div class="org-wrap"><div class="org-node"><b>' + esc(node.name) + '</b><span>' + esc(node.title) + '</span><span class="tiny muted">' + esc(node.department) + '</span></div>'
        + (node.children && node.children.length ? '<div class="org-children">' + node.children.map(buildNode).join("") + '</div>' : "") + '</div>';
      body = '<div class="card"><div class="card-head"><div><h3>Reporting structure</h3><div class="sub">' + employees.length + ' active employees</div></div><div class="right"><span class="chip chip-teal chip-plain">' + chartData.length + ' root nodes</span></div></div><div class="card-body org-chart">'
        + (chartData.length ? chartData.map(buildNode).join('<div style="height:20px"></div>') : '<p class="small muted">No reporting lines defined.</p>') + '</div></div>';
    }

    root.innerHTML = pageHead("Organisation", "Departments, job architecture, locations and reporting lines.", canEdit ? '<button class="btn btn-accent" id="org-add">' + icon("plus", 15) + ' Add ' + orgTab.tab.replace(/s$/, "").replace("designation", "designation") + '</button>' : "", "Structure")
      + '<div class="stat-strip" style="margin-bottom:18px"><div class="item"><span>Departments</span><b>' + depts.length + '</b></div><div class="item"><span>Designations</span><b>' + desigs.length + '</b></div><div class="item"><span>Locations</span><b>' + branches.length + '</b></div><div class="item"><span>Active people</span><b>' + employees.length + '</b></div></div>'
      + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (orgTab.tab === t[0] ? "active" : "") + '" data-otab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-otab]").forEach(b => b.onclick = () => { orgTab.tab = b.dataset.otab; Views.organisation(root); });
    const add = root.querySelector("#org-add");
    if (add) {
      add.style.display = orgTab.tab === "chart" ? "none" : "inline-flex";
      add.onclick = () => {
        if (orgTab.tab === "departments") openDeptForm();
        else if (orgTab.tab === "designations") openDesigForm();
        else if (orgTab.tab === "grades") openGradeForm();
        else openBranchForm();
      };
    }
    root.querySelectorAll("[data-edit-dept]").forEach(b => b.onclick = () => openDeptForm(depts.find(d => d.id === Number(b.dataset.editDept))));
    root.querySelectorAll("[data-edit-desig]").forEach(b => b.onclick = () => openDesigForm(desigs.find(d => d.id === Number(b.dataset.editDesig))));
    root.querySelectorAll("[data-edit-grade]").forEach(b => b.onclick = () => openGradeForm(grades.find(d => d.id === Number(b.dataset.editGrade))));
  } catch (e) {
    root.innerHTML = pageHead("Organisation", "Structure unavailable") + emptyState("Could not load organisation", e.message, "alert");
  }
};

function openDeptForm(existing) {
  const d = existing || {};
  formModal({
    title: existing ? "Edit department" : "Add department",
    fields: [
      { name: "name", label: "Department name", required: true, value: d.name },
      { name: "code", label: "Code", value: d.code },
      { name: "branch_id", label: "Branch", type: "select", options: optionsFrom(Store.meta.branches, "name", "id"), value: d.branch_id },
      { name: "head_id", label: "Department head", type: "select", options: employeeOptions(), value: d.head_id, placeholder: "Unassigned" },
      { name: "cost_centre", label: "Cost centre", value: d.cost_centre },
      { name: "parent_id", label: "Parent department", type: "select", options: deptOptions(), value: d.parent_id, placeholder: "Top level" },
    ],
    onSubmit: async (data) => {
      if (!data.head_id) delete data.head_id;
      data.company_id = 1;
      if (existing) await API.put("/departments/" + existing.id, data);
      else await API.post("/departments", data);
      await Store.loadMeta(); navigate();
    },
  });
}

function openDesigForm(existing) {
  const d = existing || {};
  formModal({
    title: existing ? "Edit designation" : "Add designation",
    fields: [
      { name: "title", label: "Job title", required: true, value: d.title },
      { name: "level", label: "Level", type: "number", value: d.level || 1, min: 1 },
      { name: "department_id", label: "Department", type: "select", options: deptOptions(), value: d.department_id },
      { name: "description", label: "Description", type: "textarea", value: d.description, full: true },
    ],
    onSubmit: async (data) => {
      if (existing) await API.put("/designations/" + existing.id, data);
      else await API.post("/designations", data);
      await Store.loadMeta(); navigate();
    },
  });
}

function openGradeForm(existing) {
  const g = existing || {};
  formModal({
    title: existing ? "Edit grade" : "Add grade",
    fields: [
      { name: "name", label: "Grade name", required: true, value: g.name },
      { name: "level", label: "Level", type: "number", value: g.level || 1, min: 1 },
      { name: "min_salary", label: "Minimum salary", type: "number", value: g.min_salary, min: 0 },
      { name: "max_salary", label: "Maximum salary", type: "number", value: g.max_salary, min: 0 },
    ],
    onSubmit: async (data) => {
      data.min_salary = data.min_salary || 0;
      data.max_salary = data.max_salary || 0;
      if (existing) await API.put("/grades/" + existing.id, data);
      else await API.post("/grades", data);
      await Store.loadMeta(); navigate();
    },
  });
}

function openBranchForm(existing) {
  const b = existing || {};
  formModal({
    title: existing ? "Edit location" : "Add location",
    fields: [
      { name: "name", label: "Branch name", required: true, value: b.name },
      { name: "code", label: "Code", value: b.code },
      { name: "city", label: "City", value: b.city },
      { name: "phone", label: "Phone", value: b.phone },
      { name: "address", label: "Address", value: b.address, full: true },
      { name: "is_head_office", label: "This is the head office", type: "checkbox", value: b.is_head_office },
    ],
    onSubmit: async (data) => {
      data.company_id = 1;
      if (existing) await API.put("/branches/" + existing.id, data);
      else await API.post("/branches", data);
      await Store.loadMeta(); navigate();
    },
  });
}
