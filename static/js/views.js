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

function deptHeadOptions(currentHeadId) {
  const heads = (Store.meta && Store.meta.department_heads) || [];
  const valid = heads.filter(h => h.status !== "inactive" && (h.role_type === "head" || h.role_type === "md"));
  const seenEmpIds = new Set();
  const opts = [];
  for (const h of valid) {
    if (!seenEmpIds.has(h.employee_id)) {
      seenEmpIds.add(h.employee_id);
      const tag = h.role_type === "md" ? " [MD]" : (h.title ? " [" + h.title + "]" : " [HOD]");
      opts.push({ value: h.employee_id, label: (h.name || "Employee #" + h.employee_id) + tag });
    }
  }
  if (currentHeadId && !seenEmpIds.has(currentHeadId)) {
    const empName = Store.employeeName(currentHeadId);
    opts.unshift({ value: currentHeadId, label: empName + " [Current Head]" });
  }
  return opts;
}

function deptAssistantOptions(currentAssistantId) {
  const heads = (Store.meta && Store.meta.department_heads) || [];
  const valid = heads.filter(h => h.status !== "inactive" && (h.role_type === "assistant" || h.role_type === "head"));
  const seenEmpIds = new Set();
  const opts = [];
  for (const h of valid) {
    if (!seenEmpIds.has(h.employee_id)) {
      seenEmpIds.add(h.employee_id);
      const tag = h.role_type === "assistant" ? (h.title ? " [" + h.title + "]" : " [Assistant]") : " [Deputy HOD]";
      opts.push({ value: h.employee_id, label: (h.name || "Employee #" + h.employee_id) + tag });
    }
  }
  if (currentAssistantId && !seenEmpIds.has(currentAssistantId)) {
    const empName = Store.employeeName(currentAssistantId);
    opts.unshift({ value: currentAssistantId, label: empName + " [Current Assistant]" });
  }
  return opts;
}


function todayRecord(rows) {
  const t = todayISO();
  return rows.find(r => (r.work_date || "").slice(0, 10) === t);
}

function personCell(row, sub) {
  const name = row.employee_name || row.full_name || row.name || "—";
  return '<div class="person">' + avatarHTML(name, "avatar-sm", "", row.photo_url) +
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
    const [dashRes, repRes, evtRes] = await Promise.all([
      API.get("/dashboard"),
      API.get("/reports/overview"),
      API.get("/events").catch(() => ({ data: [] })),
    ]);
    const d = dashRes.data, r = repRes.data;
    const events = (evtRes.data || []).filter(e => e.status !== "cancelled").slice(0, 3);
    const user = Store.user;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const isManager = Store.isRole("manager", "hr_admin", "hr_officer", "super_admin", "payroll");
    const attLabels = r.attendance.map(a => fmtDateShort(a.date));
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
    let totalInboxCount = d.pending_approvals || 0;
    try {
      const inbox = await API.get("/approvals/inbox");
      totalInboxCount = (inbox.data || []).length;
      approvalRows.push(...(inbox.data || []).slice(0, 5));
    } catch (e) {}
    const approvalHTML = approvalRows.length ? approvalRows.map(a => {
      const typeTone = a.type === "leave" ? "teal" : a.type === "expense" ? "blue" : a.type === "loan" ? "purple" : "amber";
      return '<div class="list-row">' + avatarHTML(a.employee_name || a.title, "avatar-sm") + '<div class="body"><b>' + esc(a.title) + '</b><span><span class="chip chip-' + typeTone + '" style="height:17px;font-size:10px;padding:0 6px;margin-right:4px">' + esc(a.type) + '</span>' + esc(a.subtitle) + (a.amount ? ' · <b>' + money(a.amount) + '</b>' : '') + '</span></div>'
        + '<div class="row" style="gap:4px"><button class="btn btn-sm btn-soft" data-approve="' + a.type + '" data-id="' + a.id + '" title="Approve">' + icon("check", 12) + '</button>'
        + '<button class="btn btn-sm btn-danger" data-reject="' + a.type + '" data-id="' + a.id + '" title="Reject">' + icon("x", 12) + '</button></div></div>';
    }).join("") : '<p class="small muted" style="padding:6px 0">Nothing waiting on you. Inbox is clear.</p>';

    const annHTML = (d.announcements || []).map(a =>
      '<div class="announcement"><div class="meta">' + icon("megaphone", 12) + '<span>' + fmtDate(a.publish_at || a.created_at) + '</span>'
      + (a.pinned ? '<span class="chip chip-amber chip-plain" style="height:18px">Pinned</span>' : "") + '</div>'
      + '<h4>' + esc(a.title) + '</h4><p>' + esc((a.body || "").slice(0, 150)) + '</p></div>').join("")
      || '<p class="small muted">No announcements yet.</p>';

    const upcoming = []
      .concat(events.map(ev => ({ icon: "calendar", title: ev.title, sub: "Event · " + fmtDateTime(ev.start_at) + (ev.location ? " · " + ev.location : ""), color: "var(--teal)", link: "announcements" })))
      .concat((d.birthdays || []).map(b => ({ icon: "sparkle", title: b.name, sub: "Birthday · " + b.date, color: "var(--accent)", link: "employees" })))
      .concat((d.expiring_documents || []).map(x => ({ icon: "file", title: x.title, sub: "Expires " + fmtDate(x.date) + (x.employee ? " · " + x.employee : ""), color: "var(--amber)", link: "documents" })));
    const upcomingHTML = upcoming.length ? upcoming.slice(0, 6).map(u =>
      '<div class="list-row" style="cursor:pointer" onclick="go(\'' + u.link + '\')"><div class="kpi-icon" style="width:30px;height:30px;background:var(--paper-2);color:' + u.color + '">' + icon(u.icon, 14) + '</div>'
      + '<div class="body"><b>' + esc(u.title) + '</b><span>' + esc(u.sub) + '</span></div></div>').join("")
      : '<p class="small muted">Nothing upcoming in the next 45 days.</p>';

    const onboardingBanner = (user.must_change_password || user.role_slug === "employee")
      ? '<div class="callout-banner ' + (user.must_change_password ? "amber" : "green") + '" style="margin-bottom:16px;flex-wrap:wrap">'
        + '<div><b>' + (user.must_change_password ? "Welcome to " + esc(d.company.name) + "! Temporary Password Active:" : "Your Official Appointment Documents:") + '</b> '
        + (user.must_change_password
            ? 'You signed in using a temporary password. You can view and print your official category Employment Letter now, and set your personal password at any time.'
            : 'View, digitally countersign, or print your official Employment Letter at any time.')
        + '</div>'
        + '<div class="row" style="gap:8px">'
        + '  <button class="btn btn-sm btn-teal" id="dash-open-my-letter">' + icon("printer", 13) + ' My Employment Letter</button>'
        +    (user.must_change_password ? '<button class="btn btn-sm btn-accent" id="dash-change-pw">' + icon("lock", 13) + ' Update Password</button>' : '')
        + '</div></div>'
      : '';

    const mfaBanner = (!user.mfa_enabled && user.mfa_prompt_due && typeof MfaUI !== "undefined")
      ? '<div class="callout-banner amber" id="dash-mfa-banner" style="margin-bottom:16px;flex-wrap:wrap">'
        + '<div><b>Two-factor authentication is off.</b> Add a 6-digit code from your phone so a stolen password alone cannot reach payroll or employee records.</div>'
        + '<div class="row" style="gap:8px">'
        + '  <button class="btn btn-sm btn-accent" id="dash-mfa-setup">' + icon("shield", 13) + ' Set up 2FA</button>'
        + '  <button class="btn btn-sm btn-ghost" id="dash-mfa-skip">Remind me later</button>'
        + '</div></div>'
      : '';

    const quickLaunch = '<div class="quick-launch-bar" style="margin-bottom:18px">'
      + '<button class="quick-tile" id="ql-profile"><span class="qt-icon teal">' + icon("user", 16) + '</span><div><b>My 360° File</b><span>Contracts & skills</span></div></button>'
      + '<button class="quick-tile" id="ql-letter"><span class="qt-icon accent">' + icon("file", 16) + '</span><div><b>Employment Letter</b><span>View, sign & print PDF</span></div></button>'
      + '<button class="quick-tile" id="ql-leave"><span class="qt-icon blue">' + icon("calendar", 16) + '</span><div><b>Request Leave</b><span>Book time off</span></div></button>'
      + '<button class="quick-tile" id="ql-payslips"><span class="qt-icon purple">' + icon("wallet", 16) + '</span><div><b>Payslips</b><span>Compensation & tax</span></div></button>'
      + '<button class="quick-tile" id="ql-cmd"><span class="qt-icon teal">' + icon("zap", 16) + '</span><div><b>Quick Jump</b><span>Press Ctrl+K / ⌘K</span></div></button>'
      + '</div>';

    root.innerHTML = pageHead("Overview", greeting + ", " + user.name.split(" ")[0] + " — here is the people pulse for today.", "", "Workspace")
      + onboardingBanner
      + mfaBanner
      + '<div class="hero-strip" style="margin-bottom:16px"><div class="row-between wrap" style="gap:16px"><div>'
      + '<div class="eyebrow">' + new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + '</div>'
      + '<h2>' + esc(d.company.name) + ' · people at a glance</h2>'
      + '<p>' + d.headcount + ' people across ' + (d.departments || []).length + ' departments · ' + d.on_leave_today + ' on leave today</p></div>'
      + '<div class="hero-actions"><button class="btn btn-accent" id="quick-leave">' + icon("calendar", 15) + ' Apply for leave</button>'
      + '<button class="btn btn-ghost" id="quick-clock">' + icon("clock", 15) + ' Clock in</button>'
      + (isManager ? '<button class="btn btn-ghost" id="quick-approvals">' + icon("inbox", 15) + ' Approvals (' + totalInboxCount + ')</button>' : "")
      + '</div></div></div>'
      + quickLaunch
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Total headcount", value: d.headcount, icon: "users", tone: "teal", foot: '<span class="delta-up">+' + d.new_hires + '</span> joined this month' })
      + kpiCard({ label: "Present today", value: d.present_today, icon: "clock", tone: "blue", foot: d.on_leave_today + ' on approved leave' })
      + kpiCard({ label: "Pending approvals", value: totalInboxCount, icon: "inbox", tone: "accent", foot: isManager ? '<span class="link" onclick="go(\'approvals\')">Open unified inbox →</span>' : 'Leave requests awaiting decision' })
      + kpiCard({ label: "Payroll (last run)", value: compactMoney(d.payroll_cost), icon: "wallet", tone: "purple", foot: 'Status: <b style="color:var(--ink);text-transform:capitalize">' + esc(d.payroll_status) + '</b>' })
      + '</div>'
      + '<div class="grid grid-3" style="margin-bottom:18px">'
      + '<div class="card span-2"><div class="card-head"><div><h3>Attendance pulse</h3><div class="sub">Last 10 working days</div></div><div class="right chart-legend"><span class="item"><span class="swatch" style="background:#0f766e"></span>Present</span><span class="item"><span class="swatch" style="background:#c2703d"></span>Absent</span></div></div><div class="card-body">' + chart + '</div></div>'
      + '<div class="card"><div class="card-head"><div><h3>My leave balance</h3><div class="sub">' + new Date().getFullYear() + ' entitlement</div></div><div class="right"><span class="link" onclick="go(\'leave\')">Manage</span></div></div><div class="card-body stack">' + balances + '</div></div>'
      + '</div>'
      + '<div class="grid grid-3">'
      + '<div class="card"><div class="card-head"><div><h3>Headcount by department</h3><div class="sub">Active employees</div></div><div class="right"><span class="link" onclick="go(\'organisation\')">View org</span></div></div><div class="card-body">' + barList(d.departments || []) + '</div></div>'
      + '<div class="card"><div class="card-head"><div><h3>' + (isManager ? "Awaiting your decision" : "My requests") + '</h3><div class="sub">' + (isManager ? "Unified approvals queue" : "Latest activity") + '</div></div><div class="right">' + (isManager ? '<span class="link" onclick="go(\'approvals\')">Open all (' + totalInboxCount + ')</span>' : "") + '</div></div><div class="card-body" style="padding-top:6px">' + approvalHTML + '</div></div>'
      + '<div class="card"><div class="card-head"><div><h3>Upcoming</h3><div class="sub">Events, birthdays & expiries</div></div><div class="right"><span class="link" onclick="go(\'announcements\')">Events</span></div></div><div class="card-body" style="padding-top:6px">' + upcomingHTML + '</div></div>'
      + '</div>'
      + '<div class="card" style="margin-top:18px"><div class="card-head"><div><h3>Company announcements</h3><div class="sub">What the team needs to know</div></div><div class="right"><span class="link" onclick="go(\'announcements\')">All announcements & events</span></div></div><div class="card-body" style="padding-top:2px">' + annHTML + '</div></div>';

    root.querySelector("#quick-leave").onclick = () => openLeaveForm();
    root.querySelector("#quick-clock").onclick = async () => {
      try { await API.post("/attendance/clock-in"); toast("Clocked in. Have a productive day.", "success"); Views.dashboard(root); }
      catch (e) { handleErr(e); }
    };
    const qa = root.querySelector("#quick-approvals");
    if (qa) qa.onclick = () => go("approvals");
    root.querySelector("#ql-profile").onclick = () => { if (Store.user && Store.user.employee_id) openEmployeeProfile(Store.user.employee_id); else go("settings"); };
    const qlLet = root.querySelector("#ql-letter");
    if (qlLet) qlLet.onclick = () => go("employment-letters");
    const dashLet = root.querySelector("#dash-open-my-letter");
    if (dashLet) dashLet.onclick = () => go("employment-letters");
    const dashPw = root.querySelector("#dash-change-pw");
    if (dashPw) dashPw.onclick = () => go("settings/account");
    const mfaSetupBtn = root.querySelector("#dash-mfa-setup");
    if (mfaSetupBtn) mfaSetupBtn.onclick = () => MfaUI.openSetup({ onDone: () => Views.dashboard(root) });
    const mfaSkipBtn = root.querySelector("#dash-mfa-skip");
    if (mfaSkipBtn) mfaSkipBtn.onclick = async () => {
      try { await API.post("/auth/mfa/prompt-dismiss"); } catch (e) { /* keep quiet */ }
      if (Store.user) Store.user.mfa_prompt_due = false;
      const banner = root.querySelector("#dash-mfa-banner");
      if (banner) banner.remove();
      toast("We'll remind you again in 7 days", "info");
    };
    root.querySelector("#ql-leave").onclick = () => openLeaveForm();
    root.querySelector("#ql-payslips").onclick = () => { if (typeof payState !== "undefined") payState.tab = "payslips"; go("payroll"); };
    root.querySelector("#ql-cmd").onclick = () => { if (typeof openCommandPalette === "function") openCommandPalette(""); };
    bindApprovalButtons(root);
  } catch (e) {
    root.innerHTML = pageHead("Overview", "Could not load dashboard") + emptyState("Something went wrong", e.message, "alert");
  }
};

function bindApprovalButtons(root) {
  onDelegate(root, "click", "[data-approve],[data-reject]", async (btn) => {
    const decision = btn.dataset.approve ? "approved" : "rejected";
    const type = btn.dataset.approve || btn.dataset.reject;
    try {
      await API.post("/approvals/decide", { type: type, id: Number(btn.dataset.id), decision: decision });
      toast("Request " + decision, "success");
      navigate();
    } catch (e) { handleErr(e); }
  });
}

/* ============================================================ UNIFIED APPROVALS INBOX */
Views.approvals = async function (root) {
  root.innerHTML = pageHead("Approvals", "Loading pending requests…") + spinners(3);
  try {
    const res = await API.get("/approvals/inbox");
    const items = res.data || [];
    const byType = (t) => items.filter(x => x.type === t).length;

    const tbl = renderTable({
      id: "unified-approvals",
      title: "Pending approvals queue",
      sub: "Filter by request category or department, sort by amount or date, or select multiple rows for bulk approval.",
      selectable: true,
      rowId: r => r.uid,
      dateField: "requested_at",
      dateLabel: "Requested",
      filters: [
        { key: "type", label: "Request type", options: [
          { value: "leave", label: "Leave request" },
          { value: "expense", label: "Expense claim" },
          { value: "correction", label: "Clock correction" },
          { value: "loan", label: "Staff loan" },
        ]},
        { key: "department_name", label: "Department" },
      ],
      bulkActions: [
        {
          label: "Approve selected",
          icon: "check",
          className: "btn-accent",
          onAction: async (ids) => {
            try {
              const r = await API.post("/bulk-action", { entity: "approvals", action: "approved", ids });
              toast("Approved " + r.data.processed + " request(s)", "success");
              Views.approvals(root);
            } catch (e) { handleErr(e); }
          },
        },
        {
          label: "Reject selected",
          icon: "x",
          className: "btn-danger",
          onAction: async (ids) => {
            confirmDialog("Reject selected requests", "Reject " + ids.length + " selected request(s)? Employees will be notified.", async () => {
              const r = await API.post("/bulk-action", { entity: "approvals", action: "rejected", ids });
              toast("Rejected " + r.data.processed + " request(s)", "success");
              Views.approvals(root);
            }, { danger: true, confirmLabel: "Reject selected" });
          },
        },
      ],
      columns: [
        {
          label: "Employee",
          sortKey: "employee_name",
          render: r => '<div class="person" style="cursor:pointer" data-open-emp="' + (r.employee_id || "") + '">' + avatarHTML(r.employee_name || r.title, "avatar-sm")
            + '<div><b>' + esc(r.employee_name || "—") + '</b><span>' + esc(r.department_name || "—") + '</span></div></div>',
        },
        {
          label: "Category",
          key: "type",
          render: r => {
            const tone = r.type === "leave" ? "teal" : r.type === "expense" ? "blue" : r.type === "loan" ? "purple" : "amber";
            return '<span class="chip chip-' + tone + '">' + esc(r.type) + '</span>';
          },
        },
        {
          label: "Summary & details",
          render: r => '<b>' + esc(r.subtitle) + '</b><div class="tiny muted">' + esc(r.detail || "") + '</div>',
        },
        {
          label: "Value",
          sortValue: r => r.amount || 0,
          render: r => r.amount ? '<b>' + money(r.amount) + '</b>' : '<span class="muted">—</span>',
        },
        {
          label: "Submitted",
          sortKey: "requested_at",
          render: r => timeAgo(r.requested_at),
        },
        {
          label: "",
          class: "right",
          sortable: false,
          render: r => '<div class="row" style="justify-content:flex-end;gap:6px">'
            + '<button class="btn btn-sm btn-soft" data-approve="' + r.type + '" data-id="' + r.id + '">' + icon("check", 12) + ' Approve</button>'
            + '<button class="btn btn-sm btn-danger" data-reject="' + r.type + '" data-id="' + r.id + '">' + icon("x", 12) + ' Reject</button>'
            + '</div>',
        },
      ],
      rows: items,
      emptyIcon: "checkCircle",
      emptyTitle: "All caught up",
      emptyText: "There are no pending requests waiting on your decision right now.",
      exportName: "pending-approvals",
    });

    root.innerHTML = pageHead("Approvals Inbox", "Unified workflow queue across leave, expenses, clock corrections and staff advances.", "", "Workspace")
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Leave requests", value: byType("leave"), icon: "calendar", tone: "teal", foot: "Time-off sign-offs" })
      + kpiCard({ label: "Expense claims", value: byType("expense"), icon: "receipt", tone: "blue", foot: "Reimbursement approvals" })
      + kpiCard({ label: "Clock corrections", value: byType("correction"), icon: "clock", tone: "accent", foot: "Attendance adjustments" })
      + kpiCard({ label: "Staff loans", value: byType("loan"), icon: "wallet", tone: "purple", foot: "Salary advances" })
      + '</div>'
      + '<div class="page-enter">' + tbl + '</div>';

    bindApprovalButtons(root);
    onDelegate(root, "click", "[data-open-emp]", (el) => {
      if (el.dataset.openEmp) openEmployeeProfile(el.dataset.openEmp);
    });
  } catch (e) {
    root.innerHTML = pageHead("Approvals Inbox", "Unavailable") + emptyState("Could not load approvals", e.message, "alert");
  }
};

/* ============================================================ EMPLOYEES */
const empState = { viewMode: "table", cardSearch: "", cardDept: "", cardStatus: "", cardPage: 1, cardPerPage: 12 };

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
  const res = await API.get("/employees", { per_page: 500 });
  const rows = res.data || [];
  const canEdit = Store.canManage();
  const canManage = canEdit;

  const viewToggle = '<div class="segmented" role="group" aria-label="View mode">'
    + '<button type="button" class="seg-btn ' + (empState.viewMode === "table" ? "active" : "") + '" data-emp-view="table">' + icon("list", 14) + ' Table</button>'
    + '<button type="button" class="seg-btn ' + (empState.viewMode === "cards" ? "active" : "") + '" data-emp-view="cards">' + icon("grid", 14) + ' Cards</button>'
    + '</div>';

  const actions = viewToggle
    + (canEdit ? '<button class="btn btn-ghost" id="emp-import">' + icon("upload", 15) + ' Import</button>' : "")
    + '<a class="btn btn-ghost" href="/api/v1/employees/export.csv?token=' + API.token + '">' + icon("download", 15) + ' Master CSV</a>'
    + (canEdit ? '<button class="btn btn-accent" id="emp-add">' + icon("plus", 15) + ' Add employee</button>' : "");

  const activeCount = rows.filter(r => r.status === "active").length;
  const probCount = rows.filter(r => r.status === "probation").length;
  const flexCount = rows.filter(r => r.work_location === "hybrid" || r.work_location === "remote").length;
  const deptSet = new Set(rows.map(r => r.department_name).filter(Boolean));

  const kpis = Store.isRole("employee") ? "" : '<div class="grid grid-4" style="margin-bottom:18px">'
    + kpiCard({ label: "Total directory", value: rows.length, icon: "users", tone: "teal", foot: activeCount + " active staff" })
    + kpiCard({ label: "On probation", value: probCount, icon: "clock", tone: "accent", foot: "90-day onboarding review" })
    + kpiCard({ label: "Hybrid & remote", value: flexCount, icon: "globe", tone: "blue", foot: "Flexible work arrangements" })
    + kpiCard({ label: "Departments", value: deptSet.size, icon: "building", tone: "purple", foot: "Active cost centres" })
    + '</div>';

  const subtitle = Store.isRole("employee")
    ? "Your employee record. Open your 360° file to update personal contacts or view contracts."
    : rows.length + " people in the directory. Filter, sort, bulk-manage, or open any 360° profile.";

  let mainContent = "";
  if (empState.viewMode === "table") {
    mainContent = renderTable({
      id: "employees-directory",
      searchPlaceholder: "Search name, #EMP, email, title, department…",
      defaultPageSize: 10,
      dateField: "hire_date",
      dateLabel: "Joined",
      selectable: canEdit,
      exportName: "meridian-employees-directory",
      filters: [
        { key: "department_name", label: "Department" },
        { key: "branch_name", label: "Location" },
        { key: "grade_name", label: "Grade" },
        { key: "contract_type", label: "Contract" },
        { key: "work_location", label: "Work mode" },
        { key: "status", label: "Status" },
      ],
      bulkActions: canEdit ? [
        {
          label: "Set Hybrid",
          icon: "globe",
          className: "btn-soft",
          onAction: async (ids) => {
            await API.post("/bulk-action", { entity: "employees", action: "set_work_location", value: "hybrid", ids });
            toast("Updated " + ids.length + " employee(s) to Hybrid", "success");
            await Store.loadMeta();
            drawEmployees(root);
          },
        },
        {
          label: "Set Office",
          icon: "building",
          className: "btn-ghost",
          onAction: async (ids) => {
            await API.post("/bulk-action", { entity: "employees", action: "set_work_location", value: "office", ids });
            toast("Updated " + ids.length + " employee(s) to Office", "success");
            await Store.loadMeta();
            drawEmployees(root);
          },
        },
        {
          label: "Set Remote",
          icon: "home",
          className: "btn-ghost",
          onAction: async (ids) => {
            await API.post("/bulk-action", { entity: "employees", action: "set_work_location", value: "remote", ids });
            toast("Updated " + ids.length + " employee(s) to Remote", "success");
            await Store.loadMeta();
            drawEmployees(root);
          },
        },
        {
          label: "Mark Active",
          icon: "checkCircle",
          className: "btn-soft",
          onAction: async (ids) => {
            await API.post("/bulk-action", { entity: "employees", action: "set_status", value: "active", ids });
            toast("Marked " + ids.length + " employee(s) active (login enabled)", "success");
            await Store.loadMeta();
            drawEmployees(root);
          },
        },
        {
          label: "Mark Inactive",
          icon: "alertTriangle",
          className: "btn-ghost",
          onAction: async (ids) => {
            confirmDialog(
              "Deactivate selected employees",
              "Are you sure you want to set " + ids.length + " employee(s) to Inactive? Their portal login access will be immediately disabled.",
              async () => {
                await API.post("/bulk-action", { entity: "employees", action: "set_status", value: "inactive", ids });
                toast("Marked " + ids.length + " employee(s) inactive (no login)", "success");
                await Store.loadMeta();
                drawEmployees(root);
              },
              { danger: true, confirmLabel: "Deactivate" }
            );
          },
        },
        {
          label: "Delete Selected",
          icon: "trash",
          className: "btn-danger",
          onAction: async (ids) => {
            confirmDialog(
              "Delete selected employees",
              "Are you sure you want to delete " + ids.length + " selected employee(s)? Their portal accounts and active login sessions will be permanently deactivated.",
              async () => {
                await API.post("/bulk-action", { entity: "employees", action: "delete", ids });
                toast("Deleted " + ids.length + " employee(s)", "success");
                await Store.loadMeta();
                drawEmployees(root);
              },
              { danger: true, confirmLabel: "Delete" }
            );
          },
        },
      ] : [],
      columns: [
        { label: "Employee", sortKey: "employee_name", render: r => personCell(r, r.email) },
        { label: "Number", key: "employee_no", render: r => '<span class="mono tiny">' + esc(r.employee_no) + '</span>' },
        { label: "Department", key: "department_name", render: r => esc(r.department_name || "—") },
        { label: "Designation", key: "designation_title", render: r => '<b>' + esc(r.designation_title || "—") + '</b>' + (r.grade_name ? '<div class="tiny muted">' + esc(r.grade_name) + '</div>' : '') },
        { label: "Location", key: "branch_name", render: r => esc(r.branch_name || "—") },
        { label: "Work mode", key: "work_location", render: r => '<span class="pill-tag" style="text-transform:capitalize">' + esc(r.work_location || "office") + '</span>' },
        { label: "Category", key: "contract_type", render: r => '<span class="chip teal" style="font-size:10.5px">' + esc(r.category_label || (r.contract_type || "").replace("_", " ")) + '</span>' + (r.staff_category ? '<div class="tiny muted" style="margin-top:2px">' + esc(r.staff_category) + '</div>' : '') },
        { label: "Joined", key: "hire_date", render: r => fmtDate(r.hire_date) },
        {
          label: "Status", key: "status",
          render: r => canManage
            ? '<button class="btn btn-sm btn-ghost" data-emp-status="' + r.id + '" title="Click to change employment status" style="padding:2px 8px;height:auto;gap:4px">' + chip(r.status) + ' ' + icon("refresh", 10) + '</button>'
            : chip(r.status),
        },
        {
          label: "", class: "right", sortable: false,
          render: r => '<div class="row" style="justify-content:flex-end;gap:4px">'
            + '<button class="btn btn-sm btn-soft" title="View & print category employment letter" data-emp-letter="' + r.id + '">' + icon("printer", 12) + ' Letter</button>'
            + (canManage ? '<button class="btn btn-sm btn-ghost" title="Change employment status" data-emp-status="' + r.id + '">' + icon("refresh", 12) + ' Status</button>' : '')
            + (canManage ? '<button class="btn btn-sm btn-ghost" title="Send or reset portal username & password" data-emp-creds="' + r.id + '">' + icon("key", 12) + '</button>' : '')
            + (canManage ? '<button class="icon-btn" style="width:28px;height:28px;color:var(--red)" title="Delete employee" data-emp-del="' + r.id + '">' + icon("trash", 13) + '</button>' : '')
            + '<button class="btn btn-sm btn-ghost" data-open-emp="' + r.id + '">360° ' + icon("arrowRight", 12) + '</button>'
            + '</div>',
        },
      ],
      rows: rows,
      onRowClick: (row) => go("employees/" + row.id),
      emptyTitle: "No employees match",
      emptyText: "Try clearing filters or add a new employee.",
    });
  } else {
    // Directory Cards Grid View with filters + pagination
    const q = empState.cardSearch.toLowerCase().trim();
    const filteredCards = rows.filter(r => {
      if (empState.cardDept && String(r.department_name || "") !== empState.cardDept) return false;
      if (empState.cardStatus && String(r.status || "") !== empState.cardStatus) return false;
      if (q) {
        const hay = [r.full_name, r.employee_name, r.email, r.employee_no, r.designation_title, r.department_name, r.branch_name].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(filteredCards.length / empState.cardPerPage));
    if (empState.cardPage > totalPages) empState.cardPage = totalPages;
    const pageCards = filteredCards.slice((empState.cardPage - 1) * empState.cardPerPage, empState.cardPage * empState.cardPerPage);
    const meta = { page: empState.cardPage, pages: totalPages, total: filteredCards.length, per_page: empState.cardPerPage };

    mainContent = '<div class="card card-pad" style="margin-bottom:14px"><div class="toolbar" style="margin-bottom:0">'
      + '<div class="searchbox">' + icon("search", 15) + '<input id="emp-card-search" placeholder="Search directory cards…" value="' + esc(empState.cardSearch) + '"></div>'
      + '<select class="select" id="emp-card-dept"><option value="">All departments</option>' + Array.from(deptSet).sort().map(d => '<option value="' + esc(d) + '"' + (empState.cardDept === d ? " selected" : "") + '>' + esc(d) + '</option>').join("") + '</select>'
      + '<select class="select" id="emp-card-status"><option value="">Any status</option>' + ["active", "probation", "suspended", "resigned"].map(s => '<option value="' + s + '"' + (empState.cardStatus === s ? " selected" : "") + '>' + s[0].toUpperCase() + s.slice(1) + '</option>').join("") + '</select>'
      + '<div class="spacer"></div><span class="tiny muted">' + filteredCards.length + ' people</span></div></div>'
      + (pageCards.length
        ? '<div class="grid grid-3 emp-cards-grid">' + pageCards.map(r =>
          '<div class="card emp-dir-card" data-open-emp="' + r.id + '">'
          + '<div class="row-between" style="align-items:flex-start"><div class="row" style="gap:12px">'
          + avatarHTML(r.employee_name || r.full_name, "avatar-lg", "", r.photo_url)
          + '<div><b style="font-size:15px">' + esc(r.employee_name || r.full_name) + '</b><div class="small muted">' + esc(r.designation_title || "—") + '</div><div class="tiny mono muted" style="margin-top:2px">' + esc(r.employee_no) + '</div></div></div>'
          + chip(r.status) + '</div>'
          + '<div class="divider" style="margin:12px 0"></div>'
          + '<div class="emp-card-meta">'
          + '<div>' + icon("building", 13) + ' <span>' + esc(r.department_name || "—") + '</span></div>'
          + '<div>' + icon("mapPin", 13) + ' <span>' + esc(r.branch_name || "—") + ' · <span style="text-transform:capitalize">' + esc(r.work_location || "office") + '</span></span></div>'
          + '<div>' + icon("mail", 13) + ' <span>' + esc(r.email || "—") + '</span></div>'
          + '</div>'
          + '<div class="row-between" style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)">'
          + '<span class="tiny muted">Reports to: <b style="color:var(--ink)">' + esc(r.manager_name || "Board") + '</b></span>'
          + '<span class="link tiny">Open 360° →</span>'
          + '</div></div>'
        ).join("") + '</div>'
        : '<div class="card">' + emptyState("No matching people", "Try adjusting your directory filters.") + '</div>')
      + '<div class="card" style="margin-top:14px">' + pagerHTML(meta, { sizes: [6, 12, 24, 48] }) + '</div>';
  }

  root.innerHTML = pageHead("Employees", subtitle, actions, "Core HR") + kpis + mainContent;

  root.querySelectorAll("[data-emp-view]").forEach(b => b.onclick = () => {
    empState.viewMode = b.dataset.empView;
    drawEmployees(root);
  });
  onDelegate(root, "click", "[data-open-emp]", (el, ev) => {
    ev.stopPropagation();
    go("employees/" + el.dataset.openEmp);
  });
  onDelegate(root, "click", "[data-emp-letter]", (el, ev) => {
    ev.stopPropagation();
    openEmploymentLetterModal(Number(el.dataset.empLetter), () => drawEmployees(root));
  });
  onDelegate(root, "click", "[data-emp-creds]", (el, ev) => {
    ev.stopPropagation();
    const row = rows.find(x => Number(x.id) === Number(el.dataset.empCreds));
    if (row) openSendCredentialsModal(row, () => drawEmployees(root));
  });
  onDelegate(root, "click", "[data-emp-status]", (el, ev) => {
    ev.stopPropagation();
    const row = rows.find(x => Number(x.id) === Number(el.dataset.empStatus));
    if (row) openStatusForm(row, () => drawEmployees(root));
  });
  onDelegate(root, "click", "[data-emp-del]", (el, ev) => {
    ev.stopPropagation();
    const row = rows.find(x => Number(x.id) === Number(el.dataset.empDel));
    if (row) deleteEmployee(row, () => drawEmployees(root));
  });
  const add = root.querySelector("#emp-add");
  if (add) add.onclick = () => openEmployeeForm();
  const imp = root.querySelector("#emp-import");
  if (imp) imp.onclick = openImportDialog;

  if (empState.viewMode === "cards") {
    const cs = root.querySelector("#emp-card-search");
    if (cs) cs.oninput = debounce(() => { empState.cardSearch = cs.value; empState.cardPage = 1; drawEmployees(root); }, 220);
    const cd = root.querySelector("#emp-card-dept");
    if (cd) cd.onchange = () => { empState.cardDept = cd.value; empState.cardPage = 1; drawEmployees(root); };
    const cst = root.querySelector("#emp-card-status");
    if (cst) cst.onchange = () => { empState.cardStatus = cst.value; empState.cardPage = 1; drawEmployees(root); };
    bindPager(root, p => { empState.cardPage = p; drawEmployees(root); }, pp => { empState.cardPerPage = pp; empState.cardPage = 1; drawEmployees(root); });
  }
}

function openEmployeeForm(existing) {
  const e = existing || {};
  const catOpts = window.EMPLOYMENT_CATEGORY_OPTIONS || ["permanent", "probation", "fixed_term", "part_time", "casual", "intern", "national_service", "consultant"];
  const staffCatOpts = window.STAFF_CATEGORY_OPTIONS || ["Executive / Leadership", "Management / Senior Staff", "Supervisory / Mid-Level", "Technical / Specialist", "Operations / Frontline", "General / Junior Staff", "Trainee / Attachment"];
  const roleOpts = [{ value: "", label: "Employee (Standard Self-Service)" }]
    .concat((Store.meta && Store.meta.roles ? Store.meta.roles : []).map(r => ({ value: r.id, label: r.name })));

  const baseFields = [
    { name: "first_name", label: "First name", required: true, value: e.first_name },
    { name: "last_name", label: "Last name", required: true, value: e.last_name },
    { name: "email", label: "Registered login email (work or personal)", type: "email", required: true, value: e.email, placeholder: "employee@gmail.com or name@company.com" },
    { name: "personal_email", label: "Secondary / personal email (optional)", type: "email", value: e.personal_email, placeholder: "backup@gmail.com" },
    { name: "phone", label: "Mobile phone", value: e.phone, placeholder: "+233 24 000 0000" },
    { name: "gender", label: "Gender", type: "select", options: ["female", "male", "other"], value: e.gender, placeholder: "Select…" },
    { name: "dob", label: "Date of birth", type: "date", value: e.dob },
    { name: "marital_status", label: "Marital status", type: "select", options: ["single", "married", "divorced", "widowed"], value: e.marital_status, placeholder: "Select…" },
    { name: "nationality", label: "Nationality", value: e.nationality || "Ghanaian" },
    { name: "department_id", label: "Department", type: "select", options: deptOptions(), value: e.department_id, required: true, placeholder: "Select…" },
    { name: "designation_id", label: "Designation / Job Title", type: "select", options: designationOptions(), value: e.designation_id, placeholder: "Select…" },
    { name: "branch_id", label: "Branch", type: "select", options: optionsFrom(Store.meta.branches, "name", "id"), value: e.branch_id },
    { name: "manager_id", label: "Reports to", type: "select", options: employeeOptions(), value: e.manager_id, placeholder: "No manager" },
    { name: "grade_id", label: "Pay Grade", type: "select", options: optionsFrom(Store.meta.grades, "name", "id"), value: e.grade_id },
    { name: "contract_type", label: "Employment Category (determines Employment Letter)", type: "select", options: catOpts, value: e.contract_type || "permanent", required: true },
    { name: "staff_category", label: "Staff Category / Cadre", type: "select", options: staffCatOpts, value: e.staff_category || "General / Junior Staff" },
    { name: "work_location", label: "Work arrangement", type: "select", options: ["office", "hybrid", "remote"], value: e.work_location || "office" },
    { name: "hire_date", label: "Effective start / hire date", type: "date", value: e.hire_date || todayISO(), required: true },
    { name: "end_date", label: "Contract / attachment end date (optional)", type: "date", value: e.end_date },
    { name: "status", label: "Employment status", type: "select", options: ["active", "probation", "suspended", "resigned", "terminated"], value: e.status || "active" },
    { name: "basic_salary", label: "Monthly basic salary / stipend (GHS)", type: "number", value: e.basic_salary, step: "0.01", min: 0 },
    { name: "city", label: "City", value: e.city || "Accra" },
    { name: "address", label: "Residential address", value: e.address, full: true },
    { name: "national_id", label: "National ID (Ghana Card)", value: e.national_id },
    { name: "tax_number", label: "TIN / Tax number", value: e.tax_number },
    { name: "ssnit_number", label: "SSNIT number", value: e.ssnit_number },
    { name: "photo_url", label: "Photo URL (optional)", value: e.photo_url },
  ];

  if (!existing) {
    baseFields.push(
      { name: "role_id", label: "Portal Access Role", type: "select", options: roleOpts, value: "" },
      { name: "username", label: "Portal Username (blank = auto-generate)", placeholder: "e.g. firstname.lastname" },
      { name: "password", label: "Initial Password (blank = auto-generate)", placeholder: "Leave blank to generate secure password" },
      { name: "send_credentials", label: "Create portal login account & email Username + Password + Employment Letter link immediately", type: "checkbox", value: true, full: true }
    );
  }

  formModal({
    title: existing ? "Edit employee" : "Add employee & issue appointment letter",
    sub: existing
      ? "Update " + (e.first_name + " " + e.last_name)
      : "Creates employee profile, category-specific Employment Letter, and emails portal login credentials.",
    wide: true,
    submitLabel: existing ? "Save changes" : "Create employee & send credentials",
    successMessage: existing ? "Employee updated" : "Employee created & onboarding prepared",
    fields: baseFields,
    onSubmit: async (data) => {
      const payload = { ...data };
      ["department_id", "designation_id", "branch_id", "manager_id", "grade_id", "role_id"].forEach(k => { if (!payload[k]) delete payload[k]; });
      if (payload.basic_salary === null || payload.basic_salary === "") payload.basic_salary = 0;
      let savedRes = null;
      if (existing) {
        savedRes = await API.put("/employees/" + existing.id, payload);
      } else {
        savedRes = await API.post("/employees", payload);
      }
      await Store.loadMeta();
      await navigate();
      if (!existing && savedRes && savedRes.data && savedRes.data.credentials_dispatch) {
        setTimeout(() => openCredentialsDispatchModal(savedRes.data.credentials_dispatch, savedRes.data), 120);
      }
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
  // Delegated to comprehensive 360° profile in profile.js when loaded
  if (typeof renderEmployee360 === "function") return renderEmployee360(root, id);
}

function monthName(m) {
  return new Date(2020, Number(m) - 1, 1).toLocaleString("en-GB", { month: "long" });
}

function deleteEmployee(emp, onSuccess) {
  confirmDialog(
    "Delete employee record",
    'Are you sure you want to delete employee "' + (emp.full_name || emp.employee_name || emp.employee_no) + '"? Their system account and active login sessions will be permanently deactivated. This action is recorded in the audit trail.',
    async () => {
      await API.delete("/employees/" + emp.id);
      toast("Employee deleted successfully", "success");
      await Store.loadMeta();
      if (typeof onSuccess === "function") onSuccess();
      else go("employees");
    },
    { danger: true, confirmLabel: "Delete employee" }
  );
}

function openStatusForm(e, onSaved) {
  const empName = e.full_name || e.employee_name || e.employee_no || "Employee";
  formModal({
    title: "Change employment status",
    sub: empName + " · Current status: " + (e.status || "active").toUpperCase(),
    submitLabel: "Update status",
    fields: [
      {
        name: "status",
        label: "Employment status",
        type: "select",
        options: [
          { value: "active", label: "Active (Login access enabled)" },
          { value: "probation", label: "Probation (Login access enabled)" },
          { value: "inactive", label: "Inactive (No login access)" },
          { value: "suspended", label: "Suspended (No login access)" },
          { value: "resigned", label: "Resigned (No login access)" },
          { value: "terminated", label: "Terminated (No login access)" },
        ],
        value: e.status || "active",
        required: true,
        hint: "Note: Inactive, suspended, resigned, and terminated employees cannot log into the system.",
      },
      { name: "effective_date", label: "Effective date", type: "date", value: todayISO() },
    ],
    onSubmit: async (data) => {
      await API.put("/employees/" + e.id, { status: data.status });
      try {
        await API.post("/employment-history", {
          employee_id: e.id, event_type: "status_change", from_value: e.status,
          to_value: data.status, effective_date: data.effective_date || todayISO(),
        });
      } catch (err) {
        // history is non-critical
      }
      toast("Status updated to " + data.status + (["active", "probation"].includes(data.status) ? " (Login enabled)" : " (No login access)"), "success");
      await Store.loadMeta();
      if (typeof onSaved === "function") onSaved();
      else navigate();
    },
  });
}

/* ============================================================ ORGANISATION */
const orgTab = { tab: "departments", chartQuery: "" };

Views.organisation = async function (root, params) {
  if (params && params[0]) {
    orgTab.tab = params[0];
  } else {
    const tabMatch = location.hash.match(/[?&]tab=([^&]+)/);
    if (tabMatch) orgTab.tab = tabMatch[1];
  }
  root.innerHTML = pageHead("Organisation", "Loading structure…") + spinners(3);
  try {
    const [deptRes, desRes, gradeRes, chartRes, empRes, branchRes, headRes] = await Promise.all([
      API.get("/departments", { per_page: 200 }), API.get("/designations", { per_page: 200 }),
      API.get("/grades", { per_page: 100 }), API.get("/org-chart"),
      API.get("/employees", { per_page: 500 }), API.get("/branches", { per_page: 100 }),
      API.get("/department-heads", { per_page: 200 }),
    ]);
    const depts = deptRes.data, desigs = desRes.data, grades = gradeRes.data, chartData = chartRes.data;
    const employees = empRes.data, branches = branchRes.data, deptHeads = (headRes && headRes.data) || [];
    const canEdit = Store.canManage();
    const countByDept = {};
    employees.forEach(e => { countByDept[e.department_id] = (countByDept[e.department_id] || 0) + 1; });
    const desigsEnriched = desigs.map(r => {
      const d = depts.find(x => x.id === r.department_id);
      return { ...r, department_name: d ? d.name : "—" };
    });

    const tabs = [["departments", "Departments"], ["heads", "Department heads"], ["designations", "Designations"], ["grades", "Grades & bands"], ["branches", "Locations"], ["chart", "Org chart"]];
    let body = "";
    if (orgTab.tab === "departments") {
      body = renderTable({
        id: "org-departments",
        exportName: "departments",
        columns: [
          { label: "Department", key: "name", render: r => '<b>' + esc(r.name) + '</b>' + (r.code ? ' <span class="pill-tag">' + esc(r.code) + '</span>' : "") },
          {
          label: "Leadership (HOD & Asst)",
          render: r => {
            const headName = Store.employeeName(r.head_id);
            const asstName = Store.employeeName(r.assistant_head_id);
            let h = '<div style="display:flex;flex-direction:column;gap:3px">';
            if (r.head_id) {
              h += '<div class="row" style="gap:6px"><span class="chip chip-teal chip-plain" style="font-size:10px;padding:1px 6px">HOD</span><b>' + esc(headName) + '</b></div>';
            } else {
              h += '<div class="tiny muted">HOD: <i>Unassigned</i></div>';
            }
            if (r.assistant_head_id) {
              h += '<div class="row" style="gap:6px"><span class="chip chip-blue chip-plain" style="font-size:10px;padding:1px 6px">Asst</span><span>' + esc(asstName) + '</span></div>';
            }
            h += '</div>';
            return h;
          }
        },
          { label: "Location", key: "branch_name", render: r => esc(r.branch_name || "—") },
          { label: "Cost centre", key: "cost_centre", render: r => '<span class="mono tiny">' + esc(r.cost_centre || "—") + '</span>' },
          { label: "Headcount", sortValue: r => countByDept[r.id] || 0, render: r => '<b>' + (countByDept[r.id] || 0) + '</b>' },
          {
            label: "", class: "right", sortable: false,
            render: r => canEdit
              ? '<div class="row" style="gap:4px;justify-content:flex-end">'
                + '<button class="icon-btn" style="width:28px;height:28px" data-edit-dept="' + r.id + '" title="Edit department">' + icon("edit", 13) + '</button>'
                + '<button class="icon-btn" style="width:28px;height:28px;color:var(--red)" data-del-dept="' + r.id + '" title="Delete department">' + icon("trash", 13) + '</button>'
                + '</div>'
              : ""
          },
        ],
        rows: depts, emptyTitle: "No departments",
      }) + '<div class="grid grid-3" style="margin-top:18px">' + depts.map(d =>
        '<div class="card card-pad"><div class="row-between"><div class="row">' + '<div class="kpi-icon teal" style="width:34px;height:34px">' + icon("building", 16) + '</div><div><b>' + esc(d.name) + '</b><div class="tiny muted">Head: ' + esc(Store.employeeName(d.head_id)) + '</div>' + (d.assistant_head_id ? '<div class="tiny muted">Assistant: ' + esc(Store.employeeName(d.assistant_head_id)) + '</div>' : '') + '</div></div><span class="chip chip-teal chip-plain">' + (countByDept[d.id] || 0) + ' people</span></div></div>').join("") + '</div>';
    } else if (orgTab.tab === "heads") {
      const totalHeads = deptHeads.filter(h => h.role_type === "head").length;
      const totalAssts = deptHeads.filter(h => h.role_type === "assistant").length;
      const totalMds = deptHeads.filter(h => h.role_type === "md").length;
      const deptsWithHead = depts.filter(d => d.head_id).length;
      const kpiCards = '<div class="stat-strip" style="margin-bottom:18px">'
        + '<div class="item"><span>Department heads</span><b>' + totalHeads + '</b></div>'
        + '<div class="item"><span>Department assistants</span><b>' + totalAssts + '</b></div>'
        + '<div class="item"><span>Managing Director</span><b>' + totalMds + '</b></div>'
        + '<div class="item"><span>Departments covered</span><b>' + deptsWithHead + ' / ' + depts.length + '</b></div>'
        + '</div>';
      body = kpiCards + renderTable({
        id: "org-dept-heads",
        exportName: "department-heads",
        filters: [
          { key: "role_type", label: "Role type" },
          { key: "status", label: "Status" },
        ],
        columns: [
          {
            label: "Leader",
            render: r => {
              const emp = employees.find(e => e.id === r.employee_id);
              const name = r.employee_name || (emp ? emp.full_name : "") || r.name || "Leader #" + r.id;
              const sub = (emp ? emp.employee_no : "") || r.employee_no || "";
              return '<div class="person">' + avatarHTML(name, "avatar-sm", "", emp ? emp.photo_url : null) +
                '<div><b>' + esc(name) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div></div>';
            }
          },
          {
            label: "Role",
            key: "role_type",
            render: r => {
              if (r.role_type === "md") return '<span class="chip chip-purple">Managing Director</span>';
              if (r.role_type === "head") return '<span class="chip chip-teal">Department Head</span>';
              return '<span class="chip chip-blue">Department Assistant</span>';
            }
          },
          {
            label: "Leadership title",
            key: "title",
            render: r => '<b>' + esc(r.title || "—") + '</b>' + (r.notes ? '<div class="tiny muted" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.notes) + '">' + esc(r.notes) + '</div>' : '')
          },
          {
            label: "Primary dept",
            render: r => {
              const d = depts.find(x => x.id === r.department_id);
              return d ? '<span class="pill-tag">' + esc(d.name) + '</span>' : '<span class="tiny muted">Cross-dept / MD</span>';
            }
          },
          {
            label: "Mapped departments",
            render: r => {
              const mapped = [];
              depts.forEach(d => {
                if (d.head_id === r.employee_id) mapped.push('<span class="chip chip-teal chip-plain" style="margin:2px;font-size:10.5px">' + esc(d.name) + ' (HOD)</span>');
                else if (d.assistant_head_id === r.employee_id) mapped.push('<span class="chip chip-blue chip-plain" style="margin:2px;font-size:10.5px">' + esc(d.name) + ' (Asst)</span>');
              });
              return mapped.length ? '<div style="display:flex;flex-wrap:wrap;gap:4px">' + mapped.join("") + '</div>' : '<span class="tiny muted">Not mapped yet</span>';
            }
          },
          {
            label: "Reports to",
            render: r => {
              if (!r.reports_to_id) return '<span class="tiny muted">—</span>';
              const boss = deptHeads.find(h => h.id === r.reports_to_id);
              return boss ? esc(boss.name || boss.employee_name || boss.title || "Leader #" + boss.id) : "—";
            }
          },
          {
            label: "Contact",
            render: r => '<div class="tiny">' + (r.email ? '<div>' + esc(r.email) + '</div>' : '') + (r.phone ? '<div>' + esc(r.phone) + '</div>' : (!r.email ? '<span class="muted">—</span>' : '')) + '</div>'
          },
          {
            label: "Status",
            key: "status",
            render: r => '<span class="chip chip-' + (r.status === 'inactive' ? 'amber' : 'teal') + '">' + esc(r.status || 'active') + '</span>'
          },
          {
            label: "", class: "right", sortable: false,
            render: r => canEdit
              ? '<div class="row" style="gap:4px;justify-content:flex-end">'
                + '<button class="icon-btn" style="width:28px;height:28px" data-edit-head="' + r.id + '" title="Edit leadership">' + icon("edit", 13) + '</button>'
                + '<button class="icon-btn" style="width:28px;height:28px;color:var(--red)" data-del-head="' + r.id + '" title="Remove leadership">' + icon("trash", 13) + '</button>'
                + '</div>'
              : ""
          },
        ],
        rows: deptHeads, emptyTitle: "No departmental leaders designated yet",
      });
    } else if (orgTab.tab === "designations") {
      body = renderTable({
        id: "org-designations",
        exportName: "designations",
        filters: [
          { key: "department_name", label: "Department" },
          { key: "level", label: "Level" },
        ],
        columns: [
          { label: "Title", key: "title", render: r => '<b>' + esc(r.title) + '</b>' + (r.description ? '<div class="tiny muted">' + esc(r.description) + '</div>' : '') },
          { label: "Level", key: "level", render: r => '<span class="pill-tag">L' + esc(r.level) + '</span>' },
          { label: "Department", key: "department_name", render: r => esc(r.department_name || "—") },
          { label: "Staff count", sortValue: r => employees.filter(e => e.designation_id === r.id).length, render: r => employees.filter(e => e.designation_id === r.id).length },
          {
            label: "", class: "right", sortable: false,
            render: r => canEdit
              ? '<div class="row" style="gap:4px;justify-content:flex-end">'
                + '<button class="icon-btn" style="width:28px;height:28px" data-edit-desig="' + r.id + '" title="Edit designation">' + icon("edit", 13) + '</button>'
                + '<button class="icon-btn" style="width:28px;height:28px;color:var(--red)" data-del-desig="' + r.id + '" title="Delete designation">' + icon("trash", 13) + '</button>'
                + '</div>'
              : ""
          },
        ],
        rows: desigsEnriched, emptyTitle: "No designations",
      });
    } else if (orgTab.tab === "grades") {
      body = renderTable({
        id: "org-grades",
        exportName: "grades-bands",
        columns: [
          { label: "Grade", key: "name", render: r => '<b>' + esc(r.name) + '</b>' },
          { label: "Level", key: "level" },
          { label: "Min salary", sortValue: r => Number(r.min_salary || 0), render: r => money(r.min_salary) },
          { label: "Max salary", sortValue: r => Number(r.max_salary || 0), render: r => money(r.max_salary) },
          { label: "Employees", sortValue: r => employees.filter(e => e.grade_id === r.id).length, render: r => '<b>' + employees.filter(e => e.grade_id === r.id).length + '</b>' },
          {
            label: "", class: "right", sortable: false,
            render: r => canEdit
              ? '<div class="row" style="gap:4px;justify-content:flex-end">'
                + '<button class="icon-btn" style="width:28px;height:28px" data-edit-grade="' + r.id + '" title="Edit grade">' + icon("edit", 13) + '</button>'
                + '<button class="icon-btn" style="width:28px;height:28px;color:var(--red)" data-del-grade="' + r.id + '" title="Delete grade">' + icon("trash", 13) + '</button>'
                + '</div>'
              : ""
          },
        ],
        rows: grades, emptyTitle: "No grades",
      });
    } else if (orgTab.tab === "branches") {
      body = renderTable({
        id: "org-branches",
        exportName: "locations",
        filters: [{ key: "city", label: "City" }],
        columns: [
          { label: "Location", key: "name", render: r => '<b>' + esc(r.name) + '</b>' + (r.is_head_office ? ' <span class="chip chip-teal">HQ</span>' : "") },
          { label: "City", key: "city", render: r => esc(r.city || "—") },
          { label: "Code", key: "code", render: r => '<span class="mono tiny">' + esc(r.code || "—") + '</span>' },
          { label: "Address", key: "address", render: r => esc(r.address || "—") },
          { label: "People", sortValue: r => employees.filter(e => e.branch_id === r.id).length, render: r => '<b>' + employees.filter(e => e.branch_id === r.id).length + '</b>' },
          {
            label: "", class: "right", sortable: false,
            render: r => canEdit
              ? '<div class="row" style="gap:4px;justify-content:flex-end">'
                + '<button class="icon-btn" style="width:28px;height:28px" data-edit-branch="' + r.id + '" title="Edit location">' + icon("edit", 13) + '</button>'
                + '<button class="icon-btn" style="width:28px;height:28px;color:var(--red)" data-del-branch="' + r.id + '" title="Delete location">' + icon("trash", 13) + '</button>'
                + '</div>'
              : ""
          },
        ],
        rows: branches, emptyTitle: "No locations",
      });
    } else {
      const cq = (orgTab.chartQuery || "").toLowerCase().trim();
      const countTree = (n) => 1 + (n.children || []).reduce((acc, c) => acc + countTree(c), 0);
      const buildNode = (node) => {
        const hit = cq && ((node.name || "").toLowerCase().includes(cq) || (node.title || "").toLowerCase().includes(cq) || (node.department || "").toLowerCase().includes(cq));
        const reports = (node.children || []).length;
        return '<div class="org-wrap"><div class="org-node ' + (hit ? "org-node-hit" : "") + '" data-org-emp="' + (node.id || "") + '">'
          + '<div class="row" style="gap:8px">' + avatarHTML(node.name, "avatar-sm") + '<div><b>' + esc(node.name) + '</b><span>' + esc(node.title || "—") + '</span></div></div>'
          + '<div class="row-between" style="margin-top:8px;gap:6px"><span class="pill-tag">' + esc(node.department || "Executive") + '</span>'
          + (reports ? '<span class="chip chip-teal chip-plain" style="height:19px;font-size:10.5px">' + reports + ' direct · ' + (countTree(node) - 1) + ' total</span>' : '')
          + '</div></div>'
          + (reports ? '<div class="org-children">' + node.children.map(buildNode).join("") + '</div>' : "") + '</div>';
      };
      body = '<div class="card"><div class="card-head"><div><h3>Interactive reporting structure</h3><div class="sub">' + employees.length + ' active employees · Click any person to open their 360° profile</div></div>'
        + '<div class="right row" style="gap:8px"><div class="searchbox" style="min-width:220px;height:32px">' + icon("search", 13) + '<input id="org-chart-search" placeholder="Highlight person or dept…" value="' + esc(orgTab.chartQuery) + '"></div>'
        + '<span class="chip chip-teal chip-plain">' + chartData.length + ' root</span></div></div><div class="card-body org-chart">'
        + (chartData.length ? chartData.map(buildNode).join('<div style="height:20px"></div>') : '<p class="small muted">No reporting lines defined.</p>') + '</div></div>';
    }

    root.innerHTML = pageHead("Organisation", "Departments, leadership hierarchy, job architecture and reporting structure.", canEdit ? '<button class="btn btn-accent" id="org-add">' + icon("plus", 15) + ' ' + (orgTab.tab === "heads" ? "Designate leader" : "Add " + orgTab.tab.replace(/s$/, "")) + '</button>' : "", "Structure")
      + '<div class="stat-strip" style="margin-bottom:18px"><div class="item"><span>Departments</span><b>' + depts.length + '</b></div><div class="item"><span>Leadership</span><b>' + deptHeads.length + '</b></div><div class="item"><span>Designations</span><b>' + desigs.length + '</b></div><div class="item"><span>Locations</span><b>' + branches.length + '</b></div><div class="item"><span>Active people</span><b>' + employees.length + '</b></div></div>'
      + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (orgTab.tab === t[0] ? "active" : "") + '" data-otab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-otab]").forEach(b => b.onclick = () => { orgTab.tab = b.dataset.otab; Views.organisation(root); });
    const add = root.querySelector("#org-add");
    if (add) {
      add.style.display = orgTab.tab === "chart" ? "none" : "inline-flex";
      add.onclick = () => {
        if (orgTab.tab === "departments") openDeptForm();
        else if (orgTab.tab === "heads") openDeptHeadForm();
        else if (orgTab.tab === "designations") openDesigForm();
        else if (orgTab.tab === "grades") openGradeForm();
        else openBranchForm();
      };
    }
    onDelegate(root, "click", "[data-edit-dept]", (b) => {
      const deptId = Number(b.dataset.editDept);
      openDeptForm(depts.find(d => d.id === deptId), countByDept[deptId] || 0);
    });
    onDelegate(root, "click", "[data-del-dept]", (b) => {
      const deptId = Number(b.dataset.delDept);
      const dept = depts.find(d => d.id === deptId);
      if (dept) deleteDepartment(dept, countByDept[deptId] || 0);
    });
    onDelegate(root, "click", "[data-edit-head]", (b) => {
      const headId = Number(b.dataset.editHead);
      const h = deptHeads.find(d => d.id === headId);
      if (h) openDeptHeadForm(h);
    });
    onDelegate(root, "click", "[data-del-head]", (b) => {
      const headId = Number(b.dataset.delHead);
      const h = deptHeads.find(d => d.id === headId);
      if (h) deleteDeptHead(h);
    });
    onDelegate(root, "click", "[data-edit-desig]", (b) => {
      const desigId = Number(b.dataset.editDesig);
      const des = desigs.find(d => d.id === desigId);
      const sc = des ? employees.filter(e => e.designation_id === des.id).length : 0;
      openDesigForm(des, sc);
    });
    onDelegate(root, "click", "[data-del-desig]", (b) => {
      const desigId = Number(b.dataset.delDesig);
      const des = desigs.find(d => d.id === desigId);
      if (des) {
        const sc = employees.filter(e => e.designation_id === des.id).length;
        deleteDesignation(des, sc);
      }
    });
    onDelegate(root, "click", "[data-edit-grade]", (b) => {
      const gId = Number(b.dataset.editGrade);
      const gr = grades.find(d => d.id === gId);
      const empCount = employees.filter(e => e.grade_id === gId).length;
      openGradeForm(gr, empCount);
    });
    onDelegate(root, "click", "[data-del-grade]", (b) => {
      const gId = Number(b.dataset.delGrade);
      const gr = grades.find(d => d.id === gId);
      if (gr) {
        const empCount = employees.filter(e => e.grade_id === gId).length;
        deleteGrade(gr, empCount);
      }
    });
    onDelegate(root, "click", "[data-edit-branch]", (b) => {
      const bId = Number(b.dataset.editBranch);
      const br = branches.find(d => d.id === bId);
      const empCount = employees.filter(e => e.branch_id === bId).length;
      const deptCount = depts.filter(d => d.branch_id === bId).length;
      openBranchForm(br, empCount, deptCount);
    });
    onDelegate(root, "click", "[data-del-branch]", (b) => {
      const bId = Number(b.dataset.delBranch);
      const br = branches.find(d => d.id === bId);
      if (br) {
        const empCount = employees.filter(e => e.branch_id === bId).length;
        const deptCount = depts.filter(d => d.branch_id === bId).length;
        deleteBranch(br, empCount, deptCount);
      }
    });
    onDelegate(root, "click", "[data-org-emp]", (el) => { if (el.dataset.orgEmpl || el.dataset.orgEmp) go("employees/" + el.dataset.orgEmp); });
    const ocs = root.querySelector("#org-chart-search");
    if (ocs) {
      ocs.oninput = debounce(() => { orgTab.chartQuery = ocs.value; Views.organisation(root); }, 250);
    }
  } catch (e) {
    root.innerHTML = pageHead("Organisation", "Structure unavailable") + emptyState("Could not load organisation", e.message, "alert");
  }
};

function deleteDeptHead(head) {
  confirmDialog(
    "Remove leadership designation",
    'Are you sure you want to remove "' + (head.employee_name || head.name || "this leader") + '" (' + (head.title || head.role_type) + ') from departmental leadership? Any departments mapped to them as Head or Assistant will be unassigned.',
    async () => {
      await API.delete("/department-heads/" + head.id);
      toast("Leadership designation removed", "success");
      await Store.loadMeta();
      navigate();
    },
    { danger: true, confirmLabel: "Remove designation" }
  );
}

function openDeptHeadForm(existing, onSaved) {
  const h = existing || {};
  const currentRole = h.role_type || "head";
  const leadOpts = [
    { value: "head", label: "Department Head (HOD)" },
    { value: "assistant", label: "Department Assistant / Deputy" },
    { value: "md", label: "Managing Director (MD)" },
  ];
  const allHeads = (Store.meta && Store.meta.department_heads) || [];
  const reportsToOpts = allHeads
    .filter(x => !existing || x.id !== existing.id)
    .map(x => ({ value: x.id, label: (x.name || "Leader #" + x.id) + (x.title ? " (" + x.title + ")" : "") }));

  formModal({
    title: existing ? "Edit departmental leadership" : "Designate Department Head / Assistant",
    sub: "Select an employee to designate as Department Head, Assistant, or Managing Director.",
    wide: true,
    extraFooter: existing && Store.canManage() ? '<button type="button" class="btn btn-ghost" id="form-delete-btn" style="margin-right:auto;color:var(--red)">' + icon("trash", 13) + ' Remove designation</button>' : '',
    onDelete: existing ? () => {
      closeModal();
      deleteDeptHead(existing);
    } : null,
    fields: [
      { name: "employee_id", label: "Employee", type: "select", options: employeeOptions(), value: h.employee_id, required: true, placeholder: "Select employee…" },
      { name: "role_type", label: "Leadership role type", type: "select", options: leadOpts, value: currentRole, required: true },
      { name: "title", label: "Leadership title", value: h.title, placeholder: "e.g. Head of Operations / Deputy HOD / Managing Director" },
      { name: "department_id", label: "Primary Department (optional)", type: "select", options: deptOptions(), value: h.department_id, placeholder: "None (Cross-departmental or MD)" },
      { name: "reports_to_id", label: "Reports to (Leadership hierarchy)", type: "select", options: reportsToOpts, value: h.reports_to_id, placeholder: "Reports to Managing Director / Board" },
      { name: "email", label: "Direct executive email", type: "email", value: h.email, placeholder: "leader@company.com" },
      { name: "phone", label: "Direct phone / extension", value: h.phone, placeholder: "+233 …" },
      { name: "status", label: "Status", type: "select", options: ["active", "inactive"], value: h.status || "active" },
      { name: "notes", label: "Mandate / Delegation notes", type: "textarea", value: h.notes, full: true, placeholder: "Areas of supervision, authority limits, or delegation notes…" },
    ],
    onSubmit: async (data) => {
      if (!data.department_id) delete data.department_id;
      if (!data.reports_to_id) delete data.reports_to_id;
      if (existing) await API.put("/department-heads/" + existing.id, data);
      else await API.post("/department-heads", data);
      await Store.loadMeta();
      if (onSaved) onSaved();
      else navigate();
    },
  });
}

function deleteDepartment(dept, headcount) {
  if (headcount > 0) {
    confirmDialog(
      "Cannot delete department",
      'Department "' + (dept.name || "this department") + '" currently has ' + headcount + ' active employee(s) assigned. Please reassign them to another department first before deleting.',
      () => {},
      { hideCancel: true, confirmLabel: "Understood" }
    );
    return;
  }
  confirmDialog(
    "Delete department",
    'Are you sure you want to permanently delete department "' + (dept.name || "") + '"? Any designations and records linked to this department will be removed or unlinked. This action cannot be undone.',
    async () => {
      await API.delete("/departments/" + dept.id);
      toast("Department deleted successfully", "success");
      await Store.loadMeta();
      navigate();
    },
    { danger: true, confirmLabel: "Delete department" }
  );
}

function deleteDesignation(desig, staffCount) {
  if (staffCount > 0) {
    confirmDialog(
      "Cannot delete designation",
      'Job designation "' + (desig.title || "this designation") + '" is currently assigned to ' + staffCount + ' active employee(s). Please reassign them first before deleting.',
      () => {},
      { hideCancel: true, confirmLabel: "Understood" }
    );
    return;
  }
  confirmDialog(
    "Delete designation",
    'Are you sure you want to permanently delete designation "' + (desig.title || "") + '"? This action cannot be undone.',
    async () => {
      await API.delete("/designations/" + desig.id);
      toast("Designation deleted successfully", "success");
      await Store.loadMeta();
      navigate();
    },
    { danger: true, confirmLabel: "Delete designation" }
  );
}

function deleteGrade(grade, empCount) {
  if (empCount > 0) {
    confirmDialog(
      "Cannot delete grade",
      'Pay grade "' + (grade.name || "this grade") + '" is currently assigned to ' + empCount + ' active employee(s). Please reassign their pay grade first before deleting.',
      () => {},
      { hideCancel: true, confirmLabel: "Understood" }
    );
    return;
  }
  confirmDialog(
    "Delete grade",
    'Are you sure you want to permanently delete pay grade "' + (grade.name || "") + '"? This action cannot be undone.',
    async () => {
      await API.delete("/grades/" + grade.id);
      toast("Grade deleted successfully", "success");
      await Store.loadMeta();
      navigate();
    },
    { danger: true, confirmLabel: "Delete grade" }
  );
}

function deleteBranch(branch, empCount, deptCount) {
  if (empCount > 0) {
    confirmDialog(
      "Cannot delete location",
      'Location "' + (branch.name || "this location") + '" currently has ' + empCount + ' active employee(s) assigned. Please reassign their work location first before deleting.',
      () => {},
      { hideCancel: true, confirmLabel: "Understood" }
    );
    return;
  }
  if (deptCount > 0) {
    confirmDialog(
      "Cannot delete location",
      'Location "' + (branch.name || "this location") + '" is currently assigned to ' + deptCount + ' department(s). Please reassign them first before deleting.',
      () => {},
      { hideCancel: true, confirmLabel: "Understood" }
    );
    return;
  }
  confirmDialog(
    "Delete location",
    'Are you sure you want to permanently delete location "' + (branch.name || "") + '"? This action cannot be undone.',
    async () => {
      await API.delete("/branches/" + branch.id);
      toast("Location deleted successfully", "success");
      await Store.loadMeta();
      navigate();
    },
    { danger: true, confirmLabel: "Delete location" }
  );
}

function openDeptForm(existing, headcount) {
  const d = existing || {};
  formModal({
    title: existing ? "Edit department / unit" : "Add department or sub-unit",
    sub: existing ? d.name : "Group the organisation into departments, sub-departments and teams",
    wide: true,
    onDelete: existing ? () => {
      closeModal();
      deleteDepartment(existing, headcount !== undefined ? headcount : 0);
    } : null,
    extraFooter: (existing && Store.canManage() ? '<button type="button" class="btn btn-ghost" id="form-delete-btn" style="margin-right:auto;color:var(--red)">' + icon("trash", 13) + ' Delete</button>' : '') + (Store.canManage() ? '<button type="button" class="btn btn-ghost" id="form-new-head-btn" style="' + (existing ? '' : 'margin-right:auto;') + 'color:var(--accent)">' + icon("plus", 13) + ' Designate leader</button>' : ''),
    onMount: (card) => {
      const btn = card.querySelector("#form-new-head-btn");
      if (btn) {
        btn.onclick = () => {
          openDeptHeadForm(null, () => {
            openDeptForm(existing, headcount);
          });
        };
      }
    },
    fields: [
      { name: "name", label: "Department / Unit name", required: true, value: d.name },
      { name: "code", label: "Code", value: d.code, placeholder: "OPS / OPS-LOG" },
      { name: "parent_id", label: "Parent (leave blank for top-level)", type: "select", options: deptOptions().filter(o => !existing || String(o.value) !== String(existing.id)), value: d.parent_id, placeholder: "Top level department" },
      { name: "branch_id", label: "Branch / Location", type: "select", options: optionsFrom(Store.meta.branches, "name", "id"), value: d.branch_id },
      { name: "head_id", label: "Department head (HOD / MD)", type: "select", options: deptHeadOptions(d.head_id), value: d.head_id, placeholder: "Select designated HOD or MD…", hint: "Only designated heads & MD appear here (manage in Department heads tab)" },
      { name: "assistant_head_id", label: "Department assistant / Deputy", type: "select", options: deptAssistantOptions(d.assistant_head_id), value: d.assistant_head_id, placeholder: "Select designated assistant…", hint: "Reusable across departments and units" },
      { name: "email", label: "Shared inbox", type: "email", value: d.email, placeholder: "operations@meridian.gh" },
      { name: "phone", label: "Phone", value: d.phone },
      { name: "cost_centre", label: "Cost centre", value: d.cost_centre, placeholder: "CC-OPS" },
      { name: "target_headcount", label: "Target headcount", type: "number", value: d.target_headcount, min: 0 },
      { name: "budget", label: "Annual budget (GHS)", type: "number", step: "0.01", value: d.budget, min: 0 },
      { name: "status", label: "Status", type: "select", options: ["active", "inactive", "planned"], value: d.status || "active" },
      { name: "description", label: "Description / Mandate", type: "textarea", value: d.description, full: true },
    ],
    onSubmit: async (data) => {
      if (!data.head_id) delete data.head_id;
      if (!data.assistant_head_id) delete data.assistant_head_id;
      if (!data.parent_id) delete data.parent_id;
      ["target_headcount", "budget"].forEach(k => { if (data[k] === "" || data[k] === null || data[k] === undefined) delete data[k]; });
      data.company_id = 1;
      if (existing) await API.put("/departments/" + existing.id, data);
      else await API.post("/departments", data);
      await Store.loadMeta(); navigate();
    },
  });
}

function openDesigForm(existing, staffCount) {
  const d = existing || {};
  formModal({
    title: existing ? "Edit designation" : "Add designation",
    extraFooter: existing && Store.canManage() ? '<button type="button" class="btn btn-ghost" id="form-delete-btn" style="margin-right:auto;color:var(--red)">' + icon("trash", 13) + ' Delete</button>' : '',
    onDelete: existing ? () => {
      closeModal();
      deleteDesignation(existing, staffCount !== undefined ? staffCount : 0);
    } : null,
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

function openGradeForm(existing, empCount) {
  const g = existing || {};
  formModal({
    title: existing ? "Edit grade" : "Add grade",
    extraFooter: existing && Store.canManage() ? '<button type="button" class="btn btn-ghost" id="form-delete-btn" style="margin-right:auto;color:var(--red)">' + icon("trash", 13) + ' Delete</button>' : '',
    onDelete: existing ? () => {
      closeModal();
      deleteGrade(existing, empCount !== undefined ? empCount : 0);
    } : null,
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

function openBranchForm(existing, empCount, deptCount) {
  const b = existing || {};
  formModal({
    title: existing ? "Edit location" : "Add location",
    extraFooter: existing && Store.canManage() ? '<button type="button" class="btn btn-ghost" id="form-delete-btn" style="margin-right:auto;color:var(--red)">' + icon("trash", 13) + ' Delete</button>' : '',
    onDelete: existing ? () => {
      closeModal();
      deleteBranch(existing, empCount !== undefined ? empCount : 0, deptCount !== undefined ? deptCount : 0);
    } : null,
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
