/* Employee 360 Profile & Self-Service Hub */

const PROF_LEVEL_MAP = {
  beginner: 1, foundational: 1, "1": 1,
  working: 2, "2": 2,
  intermediate: 3, proficient: 3, "3": 3,
  advanced: 4, "4": 4,
  expert: 5, "5": 5,
};
const PROF_LABEL_MAP = {
  beginner: "Beginner", intermediate: "Intermediate",
  advanced: "Advanced", expert: "Expert",
};

function profBarsHTML(prof) {
  const key = String(prof || "intermediate").toLowerCase();
  const lv = PROF_LEVEL_MAP[key] || 3;
  const label = PROF_LABEL_MAP[key] || (key.charAt(0).toUpperCase() + key.slice(1));
  let bars = '<span class="prof-bars" title="' + esc(label) + ' (' + lv + '/5)">';
  for (let i = 1; i <= 5; i++) bars += '<i class="' + (i <= lv ? "on" : "") + '"></i>';
  return bars + '</span>';
}

function printProfileSummary(e) {
  const win = window.open("", "_blank", "width=860,height=920");
  if (!win) return toast("Allow pop-ups to print the employee summary", "info");
  const mgrName = (e.manager_card && e.manager_card.name) || e.manager_name || "—";
  const html = '<!DOCTYPE html><html><head><title>Employee Summary — ' + esc(e.full_name) + '</title>'
    + '<style>body{font-family:Inter,system-ui,sans-serif;color:#142321;padding:36px;max-width:780px;margin:auto;line-height:1.5}'
    + 'h1{font-family:Georgia,serif;margin:0 0 4px;font-size:28px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#5f6b66;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px}'
    + '.meta{color:#5f6b66;font-size:13px;margin-bottom:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px}'
    + '.row{display:flex;justify-content:space-between;border-bottom:1px dotted #e5e1d8;padding:5px 0}.row b{color:#5f6b66;font-weight:500}'
    + '.foot{margin-top:36px;padding-top:12px;border-top:1px solid #ccc;font-size:11px;color:#777;display:flex;justify-content:space-between}</style></head><body>'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#c2703d;font-weight:600">Meridian Ghana Ltd · Official Record</div>'
    + '<h1>' + esc(e.full_name) + '</h1>'
    + '<div class="meta">' + esc(e.designation_title || "—") + ' · ' + esc(e.department_name || "—") + ' · ' + esc(e.employee_no) + '</div></div>'
    + '<div style="text-align:right;font-size:12px"><b>Status:</b> ' + esc((e.status || "").toUpperCase()) + '<br><b>Joined:</b> ' + fmtDate(e.hire_date) + '<br><b>Tenure:</b> ' + esc(e.tenure_label || "—") + '</div></div>'
    + (e.bio ? '<p style="font-size:13px;background:#f8f6f1;padding:12px 14px;border-radius:8px">' + esc(e.bio) + '</p>' : '')
    + '<h2>Personal & Contact Information</h2><div class="grid">'
    + '<div class="row"><b>Work Email</b><span>' + esc(e.email || "—") + '</span></div>'
    + '<div class="row"><b>Phone</b><span>' + esc(e.phone || "—") + '</span></div>'
    + '<div class="row"><b>Date of Birth</b><span>' + fmtDate(e.dob) + '</span></div>'
    + '<div class="row"><b>Nationality</b><span>' + esc(e.nationality || "—") + '</span></div>'
    + '<div class="row"><b>Work Location</b><span>' + esc(e.work_location || "Office") + '</span></div>'
    + '<div class="row"><b>Address</b><span>' + esc([e.address, e.city].filter(Boolean).join(", ") || "—") + '</span></div>'
    + '</div>'
    + '<h2>Employment & Reporting</h2><div class="grid">'
    + '<div class="row"><b>Employee No.</b><span>' + esc(e.employee_no) + '</span></div>'
    + '<div class="row"><b>Contract Type</b><span style="text-transform:capitalize">' + esc((e.contract_type || "").replace(/_/g, " ")) + '</span></div>'
    + '<div class="row"><b>Department</b><span>' + esc(e.department_name || "—") + '</span></div>'
    + '<div class="row"><b>Branch</b><span>' + esc(e.branch_name || "—") + '</span></div>'
    + '<div class="row"><b>Pay Grade</b><span>' + esc(e.grade_name || "—") + '</span></div>'
    + '<div class="row"><b>Line Manager</b><span>' + esc(mgrName) + '</span></div>'
    + '</div>'
    + (e.skills && e.skills.length ? '<h2>Skills & Competencies</h2><p style="font-size:13px">' + e.skills.map(s => esc(s.name) + " (" + esc(s.proficiency || "intermediate") + ")").join(" · ") + '</p>' : '')
    + (e.education && e.education.length ? '<h2>Education & Qualifications</h2>' + e.education.map(ed => '<div style="font-size:13px;margin-bottom:6px"><b>' + esc(ed.qualification) + '</b>' + (ed.field_of_study ? ' in ' + esc(ed.field_of_study) : '') + ' — ' + esc(ed.institution) + ' (' + esc(ed.end_year || "—") + ')</div>').join("") : '')
    + '<div class="foot"><span>Generated from Meridian HR on ' + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + '</span><span>Confidential HR Record</span></div>'
    + '</body></html>';
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

function openSelfEditModal(e, onSaved) {
  openFormModal({
    title: "Edit personal & contact details",
    sub: e.full_name + " · Self-service profile update",
    wide: true,
    submitLabel: "Save profile",
    values: {
      phone: e.phone || "",
      personal_email: e.personal_email || "",
      work_location: e.work_location || "Office",
      marital_status: e.marital_status || "single",
      blood_group: e.blood_group || "",
      linkedin_url: e.linkedin_url || "",
      address: e.address || "",
      city: e.city || "",
      photo_url: e.photo_url || "",
      bio: e.bio || "",
    },
    fields: [
      { name: "phone", label: "Mobile / WhatsApp phone", placeholder: "+233 24 000 0000" },
      { name: "personal_email", label: "Personal email", type: "email", placeholder: "you@gmail.com" },
      { name: "work_location", label: "Work arrangement", type: "select", options: [
        { value: "Office", label: "On-site (Office)" },
        { value: "Hybrid", label: "Hybrid" },
        { value: "Remote", label: "Remote" },
      ]},
      { name: "marital_status", label: "Marital status", type: "select", options: [
        { value: "single", label: "Single" }, { value: "married", label: "Married" },
        { value: "divorced", label: "Divorced" }, { value: "widowed", label: "Widowed" },
      ]},
      { name: "blood_group", label: "Blood group", type: "select", options: [
        { value: "", label: "Not specified" },
        ...["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map(b => ({ value: b, label: b })),
      ]},
      { name: "linkedin_url", label: "LinkedIn profile URL", placeholder: "https://linkedin.com/in/username" },
      { name: "address", label: "Residential address" },
      { name: "city", label: "City / Town" },
      { name: "photo_url", label: "Profile photo URL (optional)", placeholder: "https://…", full: true },
      { name: "bio", label: "Professional bio & focus areas", type: "textarea", full: true, placeholder: "Share a brief summary of your role, background, and responsibilities…" },
    ],
    onSubmit: async (data) => {
      await API.put("/employees/" + e.id + "/self", data);
      await onSaved();
    },
  });
}

function openHrEmployeeEditModal(e, onSaved) {
  openFormModal({
    title: "Edit employee HR record",
    sub: e.employee_no + " · Changes are written to the audit trail",
    wide: true,
    submitLabel: "Save HR record",
    values: e,
    fields: [
      { name: "first_name", label: "First name", required: true },
      { name: "last_name", label: "Last name", required: true },
      { name: "other_names", label: "Other names" },
      { name: "email", label: "Work email", type: "email" },
      { name: "personal_email", label: "Personal email", type: "email" },
      { name: "phone", label: "Phone" },
      { name: "gender", label: "Gender", type: "select", options: [{ value: "", label: "—" }, { value: "female", label: "Female" }, { value: "male", label: "Male" }, { value: "other", label: "Other" }] },
      { name: "dob", label: "Date of birth", type: "date" },
      { name: "marital_status", label: "Marital status", type: "select", options: ["single", "married", "divorced", "widowed"] },
      { name: "blood_group", label: "Blood group", placeholder: "O+" },
      { name: "nationality", label: "Nationality", default: "Ghanaian" },
      { name: "national_id", label: "National ID (Ghana Card)" },
      { name: "tax_number", label: "TIN / Tax number" },
      { name: "ssnit_number", label: "SSNIT / Pension number" },
      { name: "hire_date", label: "Hire date", type: "date", required: true },
      { name: "probation_end", label: "Probation end date", type: "date" },
      { name: "confirmation_date", label: "Confirmation date", type: "date" },
      { name: "contract_type", label: "Contract type", type: "select", options: ["permanent", "fixed_term", "casual", "intern"] },
      { name: "work_location", label: "Work mode", type: "select", options: ["Office", "Hybrid", "Remote"] },
      { name: "status", label: "Employment status", type: "select", options: ["active", "probation", "suspended", "resigned", "terminated"] },
      { name: "department_id", label: "Department", type: "select", options: [{ value: "", label: "—" }, ...deptOptions()] },
      { name: "designation_id", label: "Designation", type: "select", options: [{ value: "", label: "—" }, ...desigOptions()] },
      { name: "grade_id", label: "Pay grade", type: "select", options: [{ value: "", label: "—" }, ...gradeOptions()] },
      { name: "branch_id", label: "Branch", type: "select", options: [{ value: "", label: "—" }, ...branchOptions()] },
      { name: "manager_id", label: "Line manager", type: "select", options: [{ value: "", label: "—" }, ...empOptions().filter(o => Number(o.value) !== Number(e.id))] },
      { name: "basic_salary", label: "Monthly basic salary (GHS)", type: "number", step: "0.01" },
      { name: "address", label: "Residential address" },
      { name: "city", label: "City" },
      { name: "linkedin_url", label: "LinkedIn URL", full: true },
      { name: "bio", label: "Professional bio", type: "textarea", full: true },
    ],
    onSubmit: async (data) => {
      const payload = { ...data };
      ["department_id", "designation_id", "branch_id", "manager_id", "grade_id"].forEach(k => { if (!payload[k]) payload[k] = null; });
      if (payload.basic_salary === null || payload.basic_salary === "") payload.basic_salary = 0;
      await API.put("/employees/" + e.id, payload);
      await Store.loadMeta();
      await onSaved();
    },
  });
}

function openCareerEventModal(e, onSaved) {
  openFormModal({
    title: "Record career milestone",
    sub: "Log a promotion, salary revision, transfer, or role change for " + e.full_name,
    wide: true,
    submitLabel: "Record milestone",
    values: {
      event_type: "promotion",
      effective_date: todayISO(),
      department_id: e.department_id || "",
      designation_id: e.designation_id || "",
      grade_id: e.grade_id || "",
      new_salary: e.basic_salary || "",
    },
    fields: [
      { name: "event_type", label: "Event type", type: "select", required: true, options: [
        { value: "promotion", label: "Promotion" },
        { value: "salary_revision", label: "Salary revision" },
        { value: "transfer", label: "Department / branch transfer" },
        { value: "role_change", label: "Designation change" },
      ]},
      { name: "effective_date", label: "Effective date", type: "date", required: true },
      { name: "department_id", label: "New department", type: "select", options: [{ value: "", label: "Unchanged" }, ...deptOptions()] },
      { name: "designation_id", label: "New designation", type: "select", options: [{ value: "", label: "Unchanged" }, ...desigOptions()] },
      { name: "grade_id", label: "New pay grade", type: "select", options: [{ value: "", label: "Unchanged" }, ...gradeOptions()] },
      { name: "new_salary", label: "Revised basic salary (GHS)", type: "number", step: "0.01" },
      { name: "notes", label: "Citation / HR notes", type: "textarea", full: true, placeholder: "Reason for promotion, revision or transfer…" },
    ],
    onSubmit: async (data) => {
      await API.post("/employees/" + e.id + "/career-event", data);
      await onSaved();
    },
  });
}

async function viewEmployeeDetail(root, id, initialTab) {
  root.innerHTML = pageHead("Employee Profile", "Loading employee record…") + spinners(4);
  let activeTab = initialTab || "overview";
  let showSensitive = false;

  async function loadAndRender() {
    try {
      const res = await API.get("/employees/" + id + "/profile");
      const e = res.data;
      const canManage = Store.canManage();
      const canSelfOrHr = !!(e.is_self || canManage) && !Store.isReadOnly();
      const canReveal = !!e.can_view_sensitive;
      const comp = e.completeness || { percent: 85, missing: [] };

      const paidLeaveRemaining = (e.leave_balances || []).reduce((acc, b) => acc + Math.max(0, Number(b.entitled || 0) - Number(b.taken || 0) - Number(b.pending || 0)), 0);
      const attSummary = e.attendance_summary || { present: 0, late: 0, rate: 100, overtime_minutes: 0 };
      const latestAppraisal = (e.appraisals && e.appraisals.length) ? e.appraisals[0] : null;
      const activeAssets = e.assets || [];
      const policyList = e.policies || [];
      const ackedCount = policyList.filter(p => p.acknowledged).length;

      const tabs = [
        ["overview", "Overview"],
        ["career", "Job & Timeline"],
        ["skills", "Skills & Education", (e.skills || []).length + (e.education || []).length],
        ["family", "Family & Emergency", (e.contacts || []).length + (e.dependants || []).length],
      ];
      if (e.can_view_compensation) {
        tabs.push(["compensation", "Pay & Banking", (e.payslips || []).length]);
      }
      tabs.push(
        ["time", "Time & Leave"],
        ["talent", "Performance & Learning"],
        ["documents", "Documents & Policies", (e.documents || []).length],
        ["operations", "Assets & Onboarding", activeAssets.length]
      );
      if (!tabs.some(t => t[0] === activeTab)) activeTab = "overview";

      const showVal = (raw) => showSensitive ? (raw || "—") : mask(raw);

      let tabBody = "";

      /* ===================== TAB 1: OVERVIEW ===================== */
      if (activeTab === "overview") {
        tabBody = '<div class="grid grid-2">'
          // Personal & Identity
          + '<div class="card"><div class="card-head"><div><h3>Identity & Personal Details</h3><div class="sub">Core demographic and statutory identifiers</div></div>'
          + '<div class="right">'
          + (canReveal ? '<button class="btn btn-sm btn-ghost" id="toggle-sensitive">' + icon(showSensitive ? "eyeOff" : "eye", 13) + ' ' + (showSensitive ? "Mask IDs" : "Reveal IDs") + '</button>' : '')
          + (canSelfOrHr ? '<button class="btn btn-sm btn-ghost" id="btn-self-edit-inline">' + icon("edit", 13) + ' Edit</button>' : '')
          + '</div></div>'
          + '<div class="card-body"><dl class="kv">'
          + '<dt>Full name</dt><dd><b>' + esc([e.first_name, e.other_names, e.last_name].filter(Boolean).join(" ")) + '</b></dd>'
          + '<dt>Work email</dt><dd>' + (e.email ? '<a class="link" href="mailto:' + esc(e.email) + '">' + esc(e.email) + '</a>' : "—") + '</dd>'
          + '<dt>Personal email</dt><dd>' + esc(e.personal_email || "—") + '</dd>'
          + '<dt>Mobile phone</dt><dd>' + (e.phone ? '<a class="link" href="tel:' + esc(e.phone) + '">' + esc(e.phone) + '</a>' : "—") + '</dd>'
          + '<dt>Date of birth</dt><dd>' + fmtDate(e.dob) + '</dd>'
          + '<dt>Gender</dt><dd style="text-transform:capitalize">' + esc(e.gender || "—") + '</dd>'
          + '<dt>Marital status</dt><dd style="text-transform:capitalize">' + esc(e.marital_status || "—") + '</dd>'
          + '<dt>Blood group</dt><dd>' + (e.blood_group ? '<span class="chip teal">' + esc(e.blood_group) + '</span>' : "—") + '</dd>'
          + '<dt>Nationality</dt><dd>' + esc(e.nationality || "—") + '</dd>'
          + '<dt>Address</dt><dd>' + esc([e.address, e.city].filter(Boolean).join(", ") || "—") + '</dd>'
          + '<dt>National ID</dt><dd class="mono">' + esc(showVal(e.national_id)) + '</dd>'
          + '<dt>Tax / TIN</dt><dd class="mono">' + esc(showVal(e.tax_number)) + '</dd>'
          + '<dt>SSNIT / Pension</dt><dd class="mono">' + esc(showVal(e.ssnit_number)) + '</dd>'
          + '</dl></div></div>'

          // Reporting Line & Direct Reports + Quick Skills
          + '<div class="stack">'
          + '<div class="card"><div class="card-head"><div><h3>Reporting Line & Team</h3><div class="sub">Organisational hierarchy</div></div>'
          + '<div class="right"><button class="btn btn-sm btn-ghost" onclick="go(\'organisation\')">' + icon("org", 13) + ' Org chart</button></div></div>'
          + '<div class="card-body">'
          + '<div class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Reports to</div>'
          + (e.manager_card
              ? '<div class="team-mini-card" data-jump-emp="' + e.manager_card.id + '">' + avatarHTML(e.manager_card.name, "", "", e.manager_card.photo_url)
                + '<div style="flex:1;min-width:0"><b style="font-size:13px;display:block">' + esc(e.manager_card.name) + '</b>'
                + '<span class="tiny muted">' + esc(e.manager_card.title || "Manager") + (e.manager_card.department ? " · " + esc(e.manager_card.department) : "") + '</span></div>'
                + icon("arrowRight", 14) + '</div>'
              : '<div class="small muted" style="padding:8px 0">Reports directly to Executive Board / Root level.</div>')
          + '<div class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;margin:16px 0 6px">Direct reports (' + (e.direct_reports || []).length + ')</div>'
          + ((e.direct_reports && e.direct_reports.length)
              ? '<div class="grid grid-2" style="gap:8px">' + e.direct_reports.map(dr =>
                  '<div class="team-mini-card" data-jump-emp="' + dr.id + '">' + avatarHTML(dr.name, "avatar-sm", "", dr.photo_url)
                  + '<div style="flex:1;min-width:0"><b style="font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(dr.name) + '</b>'
                  + '<span class="tiny muted" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(dr.title || dr.employee_no) + '</span></div></div>'
                ).join("") + '</div>'
              : '<div class="small muted">No direct reports assigned.</div>')
          + '</div></div>'

          // Skills snapshot
          + '<div class="card"><div class="card-head"><div><h3>Core Competencies</h3><div class="sub">' + (e.skills || []).length + ' recorded skills</div></div>'
          + '<div class="right">'
          + (canSelfOrHr ? '<button class="btn btn-sm btn-ghost" id="quick-add-skill">' + icon("plus", 13) + ' Add skill</button>' : '')
          + '<button class="btn btn-sm btn-ghost" data-switch-tab="skills">View all</button></div></div>'
          + '<div class="card-body">'
          + ((e.skills && e.skills.length)
              ? '<div class="stack" style="gap:8px">' + e.skills.slice(0, 5).map(s =>
                  '<div class="skill-item"><div><b style="font-size:13px">' + esc(s.name) + '</b>'
                  + '<span class="tiny muted" style="margin-left:8px;text-transform:capitalize">' + esc(s.category || "technical") + (s.years_experience ? " · " + s.years_experience + " yrs" : "") + '</span></div>'
                  + '<div class="row">' + (s.verified ? '<span class="chip green" style="font-size:10px">Verified</span>' : '') + profBarsHTML(s.proficiency) + '</div></div>'
                ).join("") + '</div>'
              : '<p class="small muted">No skills added yet. Add technical, domain, or leadership competencies.</p>')
          + '</div></div>'
          + '</div>'

          // Emergency contacts quick card + Active goals quick card
          + '<div class="card"><div class="card-head"><div><h3>Emergency Contacts</h3><div class="sub">Immediate contacts in case of emergency</div></div>'
          + '<div class="right">' + (canSelfOrHr ? '<button class="btn btn-sm btn-ghost" id="quick-add-contact">' + icon("plus", 13) + ' Add</button>' : '') + '</div>'
          + '</div><div class="card-body">'
          + ((e.contacts && e.contacts.length)
              ? e.contacts.map(c => '<div class="list-row">' + icon("phone", 16)
                + '<div class="body"><b>' + esc(c.name) + ' <span class="chip teal" style="margin-left:6px">' + esc(c.type || "emergency") + '</span></b>'
                + '<span>' + esc(c.relationship || "Contact") + ' · ' + esc(c.phone || "—") + (c.email ? " · " + esc(c.email) : "") + '</span></div></div>').join("")
              : '<p class="small muted">No emergency contacts on file. Please add at least one emergency contact.</p>')
          + '</div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Active Goals & Compliance</h3><div class="sub">Current objectives and policy sign-offs</div></div>'
          + '<div class="right"><button class="btn btn-sm btn-ghost" data-switch-tab="talent">Performance</button></div></div><div class="card-body">'
          + ((e.goals && e.goals.length)
              ? e.goals.slice(0, 3).map(g => '<div style="margin-bottom:12px"><div class="row-between" style="margin-bottom:4px"><b style="font-size:12.5px">' + esc(g.title) + '</b><span class="mono tiny">' + Number(g.progress || 0) + '%</span></div>'
                + '<div class="progress"><i style="width:' + Math.min(100, Number(g.progress || 0)) + '%"></i></div></div>').join("")
              : '<p class="small muted" style="margin-bottom:12px">No active goals assigned for the current cycle.</p>')
          + '<div class="divider"></div>'
          + '<div class="row-between"><span class="small">Company policies acknowledged</span>'
          + '<button class="btn btn-sm btn-ghost" data-switch-tab="documents">' + ackedCount + ' / ' + policyList.length + ' signed →</button></div>'
          + (e.account ? '<div class="divider"></div><div class="row-between"><span class="small">Portal access & MFA</span><span class="row" style="gap:6px"><span class="chip teal">' + esc(e.account.role || "User") + '</span>' + (e.account.mfa_enabled ? '<span class="chip green">MFA On</span>' : '<span class="chip grey">MFA Off</span>') + '</span></div>' : '')
          + '</div></div>'
          + '</div>';
      }

      /* ===================== TAB 2: JOB & TIMELINE ===================== */
      if (activeTab === "career") {
        tabBody = '<div class="grid grid-2">'
          + '<div class="stack">'
          + '<div class="card"><div class="card-head"><div><h3>Employment Terms</h3><div class="sub">Position, grading & contract dates</div></div>'
          + '<div class="right">' + (canManage ? '<button class="btn btn-sm btn-ghost" id="career-edit-hr">' + icon("edit", 13) + ' Edit terms</button>' : '') + '</div>'
          + '</div><div class="card-body"><dl class="kv">'
          + '<dt>Employee No.</dt><dd class="mono"><b>' + esc(e.employee_no) + '</b></dd>'
          + '<dt>Department</dt><dd>' + esc(e.department_name || "—") + '</dd>'
          + '<dt>Designation</dt><dd>' + esc(e.designation_title || "—") + '</dd>'
          + '<dt>Pay Grade</dt><dd>' + esc(e.grade_name || "—") + '</dd>'
          + '<dt>Branch</dt><dd>' + esc(e.branch_name || "—") + '</dd>'
          + '<dt>Work Mode</dt><dd>' + esc(e.work_location || "Office") + ' · ' + esc(e.work_schedule || "standard") + '</dd>'
          + '<dt>Contract Type</dt><dd style="text-transform:capitalize">' + esc((e.contract_type || "").replace(/_/g, " ")) + '</dd>'
          + '<dt>Hire Date</dt><dd>' + fmtDate(e.hire_date) + ' <span class="tiny muted">(' + esc(e.tenure_label || "") + ')</span></dd>'
          + '<dt>Probation End</dt><dd>' + fmtDate(e.probation_end) + '</dd>'
          + '<dt>Confirmed On</dt><dd>' + (e.confirmation_date ? fmtDate(e.confirmation_date) + ' <span class="chip green" style="margin-left:6px">Confirmed</span>' : '<span class="chip amber">Pending confirmation</span>') + '</dd>'
          + '</dl></div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Employment Contracts</h3><div class="sub">Signed agreements & renewals</div></div></div><div class="card-body">'
          + ((e.contracts && e.contracts.length)
              ? e.contracts.map(c => '<div class="list-row"><div class="body"><b style="text-transform:capitalize">' + esc((c.type || "permanent").replace(/_/g, " ")) + ' Contract</b><span>' + fmtDate(c.start_date) + ' → ' + (c.end_date ? fmtDate(c.end_date) : "Open-ended") + '</span></div>' + chip(c.status || "active") + '</div>').join("")
              : '<p class="small muted">Standard permanent appointment on file.</p>')
          + '</div></div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Career Progression</h3><div class="sub">Chronological record of appointments, promotions & revisions</div></div>'
          + '<div class="right">'
          + (canManage && !e.confirmation_date ? '<button class="btn btn-sm btn-teal" id="btn-confirm-probation">' + icon("check", 13) + ' Confirm</button>' : '')
          + (canManage ? '<button class="btn btn-sm btn-accent" id="btn-record-career">' + icon("plus", 13) + ' Record milestone</button>' : '')
          + '</div></div><div class="card-body">'
          + '<div style="padding-top:4px">'
          + (e.history || []).map(h =>
              '<div class="career-node ' + esc(h.event_type || "") + '"><span class="dot"></span>'
              + '<div class="row-between"><b style="font-size:13px;text-transform:capitalize">' + esc((h.event_type || "update").replace(/_/g, " ")) + '</b>'
              + '<span class="tiny mono muted">' + fmtDate(h.effective_date) + '</span></div>'
              + ((h.from_value || h.to_value) ? '<div class="tiny" style="color:var(--teal);margin-top:2px">' + esc(h.from_value || "—") + ' → <b>' + esc(h.to_value || "—") + '</b></div>' : '')
              + (h.notes ? '<div class="small muted" style="margin-top:3px">' + esc(h.notes) + '</div>' : '')
              + '</div>'
            ).join("")
          + '<div class="career-node confirmation"><span class="dot"></span>'
          + '<div class="row-between"><b style="font-size:13px">Joined Meridian Ghana Ltd</b><span class="tiny mono muted">' + fmtDate(e.hire_date) + '</span></div>'
          + '<div class="small muted" style="margin-top:3px">Initial appointment as ' + esc(e.designation_title || "Team Member") + ' in ' + esc(e.department_name || "Meridian") + '.</div></div>'
          + '</div></div></div></div>';
      }

      /* ===================== TAB 3: SKILLS & EDUCATION ===================== */
      if (activeTab === "skills") {
        tabBody = '<div class="grid grid-2">'
          + '<div class="card"><div class="card-head"><div><h3>Skills & Competencies</h3><div class="sub">Technical, domain, language & leadership proficiencies</div></div>'
          + '<div class="right">' + (canSelfOrHr ? '<button class="btn btn-sm btn-accent" id="btn-add-skill">' + icon("plus", 13) + ' Add skill</button>' : '') + '</div>'
          + '</div><div class="card-body">'
          + ((e.skills && e.skills.length)
              ? '<div class="stack" style="gap:10px">' + e.skills.map(s =>
                  '<div class="skill-item"><div style="min-width:0"><div class="row" style="gap:8px;flex-wrap:wrap"><b style="font-size:13.5px">' + esc(s.name) + '</b>'
                  + '<span class="chip grey">' + esc(s.category || "technical") + '</span>'
                  + (s.verified ? '<span class="chip green">HR Verified</span>' : '') + '</div>'
                  + '<div class="tiny muted" style="margin-top:4px;text-transform:capitalize">' + esc(s.proficiency || "intermediate") + (s.years_experience ? " · " + s.years_experience + " yr(s) experience" : "") + '</div></div>'
                  + '<div class="row" style="gap:8px">' + profBarsHTML(s.proficiency)
                  + (canManage && !s.verified ? '<button class="btn btn-sm btn-ghost" title="Verify skill" data-verify-skill="' + s.id + '">' + icon("check", 12) + '</button>' : '')
                  + (canSelfOrHr ? '<button class="icon-btn" style="width:28px;height:28px" title="Remove" data-del-skill="' + s.id + '">' + icon("trash", 13) + '</button>' : '')
                  + '</div></div>'
                ).join("") + '</div>'
              : emptyState("No skills listed yet", "Record professional competencies and certifications.", "award"))
          + '</div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Education & Qualifications</h3><div class="sub">Academic degrees, diplomas & professional credentials</div></div>'
          + '<div class="right">' + (canSelfOrHr ? '<button class="btn btn-sm btn-accent" id="btn-add-edu">' + icon("plus", 13) + ' Add qualification</button>' : '') + '</div>'
          + '</div><div class="card-body">'
          + ((e.education && e.education.length)
              ? '<div class="stack" style="gap:12px">' + e.education.map(ed =>
                  '<div class="skill-item" style="align-items:flex-start"><div>'
                  + '<div class="row" style="gap:8px;flex-wrap:wrap"><b style="font-size:13.5px">' + esc(ed.qualification) + (ed.field_of_study ? ' — ' + esc(ed.field_of_study) : '') + '</b><span class="chip teal">' + esc(ed.kind || "degree") + '</span></div>'
                  + '<div class="small" style="color:var(--ink-3);margin-top:2px">' + esc(ed.institution) + '</div>'
                  + '<div class="tiny muted" style="margin-top:4px">' + esc(ed.start_year || "—") + ' – ' + esc(ed.end_year || "Present") + (ed.credential_id ? ' · Credential <span class="mono">' + esc(ed.credential_id) + '</span>' : '') + '</div></div>'
                  + (canSelfOrHr ? '<button class="icon-btn" style="width:28px;height:28px" title="Remove" data-del-edu="' + ed.id + '">' + icon("trash", 13) + '</button>' : '')
                  + '</div>'
                ).join("") + '</div>'
              : emptyState("No qualifications recorded", "Add university degrees, diplomas or professional memberships.", "graduation"))
          + '</div></div></div>';
      }

      /* ===================== TAB 4: FAMILY & EMERGENCY ===================== */
      if (activeTab === "family") {
        tabBody = '<div class="grid grid-2">'
          + '<div class="card"><div class="card-head"><div><h3>Emergency Contacts</h3><div class="sub">Designated next-of-kin for urgent situations</div></div>'
          + '<div class="right">' + (canSelfOrHr ? '<button class="btn btn-sm btn-accent" id="btn-add-ec">' + icon("plus", 13) + ' Add contact</button>' : '') + '</div>'
          + '</div><div class="card-body">'
          + ((e.contacts && e.contacts.length)
              ? '<div class="stack" style="gap:10px">' + e.contacts.map(c =>
                  '<div class="skill-item" style="align-items:flex-start"><div>'
                  + '<div class="row"><b style="font-size:13.5px">' + esc(c.name) + '</b><span class="chip teal">' + esc(c.type || "emergency") + '</span></div>'
                  + '<div class="small muted" style="margin-top:3px">' + esc(c.relationship || "Emergency contact") + ' · ' + esc(c.phone || "—") + '</div>'
                  + (c.email || c.address ? '<div class="tiny muted" style="margin-top:3px">' + esc([c.email, c.address].filter(Boolean).join(" · ")) + '</div>' : '')
                  + '</div>'
                  + (canSelfOrHr ? '<button class="icon-btn" style="width:28px;height:28px" data-del-ec="' + c.id + '">' + icon("trash", 13) + '</button>' : '')
                  + '</div>'
                ).join("") + '</div>'
              : emptyState("No emergency contacts", "Add at least one emergency contact.", "phone"))
          + '</div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Dependants & Beneficiaries</h3><div class="sub">Registered family members for medical & statutory benefits</div></div>'
          + '<div class="right">' + (canSelfOrHr ? '<button class="btn btn-sm btn-accent" id="btn-add-dep">' + icon("plus", 13) + ' Add dependant</button>' : '') + '</div>'
          + '</div><div class="card-body">'
          + ((e.dependants && e.dependants.length)
              ? '<div class="stack" style="gap:10px">' + e.dependants.map(d =>
                  '<div class="skill-item"><div><div class="row"><b style="font-size:13.5px">' + esc(d.name) + '</b>' + (d.is_beneficiary ? '<span class="chip green">Beneficiary</span>' : '') + '</div>'
                  + '<div class="tiny muted" style="margin-top:3px">' + esc(d.relationship || "Dependant") + (d.gender ? " · " + esc(d.gender) : "") + ' · Born ' + fmtDate(d.dob) + '</div></div>'
                  + (canSelfOrHr ? '<button class="icon-btn" style="width:28px;height:28px" data-del-dep="' + d.id + '">' + icon("trash", 13) + '</button>' : '')
                  + '</div>'
                ).join("") + '</div>'
              : emptyState("No dependants listed", "Register spouse, children or beneficiaries.", "heart"))
          + '</div></div></div>';
      }

      /* ===================== TAB 5: COMPENSATION & BANKING ===================== */
      if (activeTab === "compensation" && e.can_view_compensation) {
        const gradeBand = e.grade_band && e.grade_band.max ? (
          '<div class="tiny muted" style="margin-top:6px">' + esc(e.grade_name || "Grade") + ' band: ' + fmtMoney(e.grade_band.min) + ' – ' + fmtMoney(e.grade_band.max) + '</div>'
        ) : "";
        tabBody = '<div class="grid grid-2" style="margin-bottom:18px">'
          + '<div class="card"><div class="card-head"><div><h3>Compensation & Salary Structure</h3><div class="sub">Contracted base pay, allowances & active loans</div></div></div>'
          + '<div class="card-body">'
          + '<div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em">Monthly Basic Salary</div>'
          + '<div style="font-family:var(--serif);font-size:30px;margin-top:2px">' + fmtMoney(e.basic_salary) + '</div>' + gradeBand + '</div>'
          + '<span class="chip green">' + esc((e.contract_type || "permanent").replace(/_/g, " ")) + '</span></div>'
          + ((e.salary_structure && e.salary_structure.length)
              ? '<div class="divider"></div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Salary Components</div>'
                + e.salary_structure.map(sc => '<div class="row-between small" style="padding:4px 0"><span>' + esc(sc.component_name || sc.code) + ' <span class="tiny muted">(' + esc(sc.kind) + ')</span></span><span class="mono">' + fmtMoney(sc.amount) + '</span></div>').join("")
              : '')
          + '<div class="divider"></div>'
          + '<div class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Staff Loans & Advances</div>'
          + ((e.loans && e.loans.length)
              ? e.loans.map(l => '<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--line)"><div><b class="small">Principal ' + fmtMoney(l.principal) + '</b><div class="tiny muted">Instalment ' + fmtMoney(l.instalment) + '/mo</div></div><div class="right"><b class="mono small">' + fmtMoney(l.balance) + ' left</b><div>' + chip(l.status) + '</div></div></div>').join("")
              : '<div class="small muted">No active staff loans or salary advances.</div>')
          + '</div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Salary Bank & MoMo Accounts</h3><div class="sub">Disbursement accounts for monthly payroll</div></div>'
          + '<div class="right">'
          + '<button class="btn btn-sm btn-ghost" id="toggle-bank-mask">' + icon(showSensitive ? "eyeOff" : "eye", 13) + ' ' + (showSensitive ? "Mask" : "Reveal") + '</button>'
          + (canSelfOrHr ? '<button class="btn btn-sm btn-accent" id="btn-add-bank">' + icon("plus", 13) + ' Add account</button>' : '')
          + '</div></div><div class="card-body">'
          + ((e.bank_accounts && e.bank_accounts.length)
              ? '<div class="stack" style="gap:10px">' + e.bank_accounts.map(b =>
                  '<div class="skill-item"><div><div class="row"><b style="font-size:13.5px">' + esc(b.bank_name || "Bank Account") + '</b>' + (b.is_primary ? '<span class="chip green">Primary</span>' : '') + '</div>'
                  + '<div class="mono small" style="margin-top:3px">' + esc(showVal(b.account_no || b.mobile_money)) + '</div>'
                  + '<div class="tiny muted">' + esc([b.branch_name, b.account_name].filter(Boolean).join(" · ")) + '</div></div>'
                  + (canSelfOrHr ? '<button class="icon-btn" style="width:28px;height:28px" data-del-bank="' + b.id + '">' + icon("trash", 13) + '</button>' : '')
                  + '</div>'
                ).join("") + '</div>'
              : emptyState("No bank account recorded", "Add a bank or Mobile Money account for salary disbursement.", "wallet"))
          + '</div></div></div>'

          + '<div class="section-title" style="margin-bottom:10px">Payslip History</div>'
          + renderTable({
              columns: [
                { label: "Pay Period", render: r => '<b>' + esc(r.period_label || (r.period_year ? r.period_month + "/" + r.period_year : "—")) + '</b>' },
                { label: "Gross Pay", class: "right mono", render: r => fmtMoney(r.gross) },
                { label: "PAYE Tax", class: "right mono", render: r => fmtMoney(r.tax) },
                { label: "SSNIT (5.5%)", class: "right mono", render: r => fmtMoney(r.ssnit) },
                { label: "Other Ded.", class: "right mono", render: r => fmtMoney(r.other_deductions) },
                { label: "Net Pay", class: "right mono", render: r => '<b>' + fmtMoney(r.net) + '</b>' },
                { label: "Status", render: r => chip(r.run_status || "paid") },
                { label: "", class: "right", render: r => '<button class="btn btn-sm btn-ghost" data-view-slip="' + r.id + '">View slip</button>' },
              ],
              rows: e.payslips || [],
              emptyTitle: "No payslips issued yet",
            });
      }

      /* ===================== TAB 6: TIME & LEAVE ===================== */
      if (activeTab === "time") {
        tabBody = '<div class="row-between" style="margin-bottom:12px"><div class="section-title">Current Year Leave Entitlements</div>'
          + (e.is_self && !Store.isReadOnly() ? '<button class="btn btn-sm btn-accent" id="profile-apply-leave">' + icon("calendar", 13) + ' Request leave</button>' : '') + '</div>'
          + '<div class="grid grid-4" style="margin-bottom:18px">'
          + ((e.leave_balances && e.leave_balances.length)
              ? e.leave_balances.map(b => {
                  const alloc = Number(b.entitled || 0);
                  const used = Number(b.taken || 0);
                  const pend = Number(b.pending || 0);
                  const rem = Math.max(0, alloc - used - pend);
                  const pct = alloc > 0 ? Math.min(100, Math.round(((used + pend) / alloc) * 100)) : 0;
                  return '<div class="kpi"><div class="row-between"><div class="label">' + esc(b.leave_type_name) + '</div><span style="width:9px;height:9px;border-radius:50%;background:' + esc(b.color || "#0f766e") + '"></span></div>'
                    + '<div class="value">' + fmtNumber(rem) + ' <span class="tiny muted">days left</span></div>'
                    + '<div class="progress" style="margin-top:10px"><i style="width:' + pct + '%;background:' + esc(b.color || "var(--teal)") + '"></i></div>'
                    + '<div class="sub">' + fmtNumber(used) + ' taken · ' + fmtNumber(pend) + ' pending · ' + fmtNumber(alloc) + ' entitled</div></div>';
                }).join("")
              : '<div class="card card-pad span-4 small muted">No leave balances initialised for this year.</div>')
          + '</div>'
          + '<div class="grid grid-2">'
          + '<div><div class="section-title" style="margin-bottom:8px">Leave Requests</div>'
          + renderTable({
              columns: [
                { label: "Type", render: r => esc(r.leave_type_name || "Leave") },
                { label: "Dates", render: r => fmtDate(r.start_date) + " → " + fmtDate(r.end_date) },
                { label: "Days", class: "right mono", render: r => fmtNumber(r.days) },
                { label: "Status", render: r => chip(r.status) },
              ],
              rows: e.leave_requests || [],
              emptyTitle: "No leave requests",
            }) + '</div>'
          + '<div><div class="section-title" style="margin-bottom:8px">Recent Attendance (Last 30 Days)</div>'
          + renderTable({
              columns: [
                { label: "Date", render: r => fmtDate(r.work_date) },
                { label: "Clock In", render: r => fmtTime(r.clock_in) },
                { label: "Clock Out", render: r => fmtTime(r.clock_out) },
                { label: "Overtime", class: "right mono", render: r => r.overtime_minutes ? r.overtime_minutes + "m" : "—" },
                { label: "Status", render: r => chip(r.status) },
              ],
              rows: (e.attendance || []).slice(0, 12),
              emptyTitle: "No attendance records",
            }) + '</div></div>';
      }

      /* ===================== TAB 7: PERFORMANCE & LEARNING ===================== */
      if (activeTab === "talent") {
        tabBody = '<div class="grid grid-2" style="margin-bottom:18px">'
          + '<div class="card"><div class="card-head"><div><h3>Goals & Key Results</h3><div class="sub">Individual performance targets</div></div></div><div class="card-body">'
          + ((e.goals && e.goals.length)
              ? e.goals.map(g => '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row-between"><b style="font-size:13px">' + esc(g.title) + '</b>' + chip(g.status || "in_progress") + '</div>'
                + '<div class="tiny muted" style="margin-top:3px">' + (g.due_date ? "Due " + fmtDate(g.due_date) + " · " : "") + 'Weight ' + Number(g.weight || 0) + '%</div>'
                + '<div class="row" style="margin-top:8px"><div class="progress" style="flex:1"><i style="width:' + Math.min(100, Number(g.progress || 0)) + '%"></i></div><span class="mono tiny">' + Number(g.progress || 0) + '%</span></div></div>').join("")
              : emptyState("No goals recorded", "Performance objectives appear here once assigned.", "target"))
          + '</div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Appraisal History</h3><div class="sub">Formal review ratings & manager feedback</div></div></div><div class="card-body">'
          + ((e.appraisals && e.appraisals.length)
              ? e.appraisals.map(ap => '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row-between"><b style="font-size:13px">' + esc(ap.cycle_name || "Performance Cycle") + '</b>' + chip(ap.status) + '</div>'
                + '<div class="row" style="gap:16px;margin-top:6px"><span class="tiny">Self: <b>' + (ap.self_rating ?? "—") + '</b></span><span class="tiny">Manager: <b>' + (ap.manager_rating ?? "—") + '</b></span><span class="tiny" style="color:var(--teal)">Final: <b>' + (ap.final_rating ? ap.final_rating + " / 5.0" : "Pending") + '</b></span></div>'
                + (ap.comments ? '<div class="small muted" style="margin-top:5px">"' + esc(ap.comments) + '"</div>' : '')
                + '</div>').join("")
              : emptyState("No appraisals yet", "Cycle reviews will be listed here.", "star"))
          + '</div></div></div>'

          + '<div class="section-title" style="margin-bottom:8px">Training & Certifications</div>'
          + renderTable({
              columns: [
                { label: "Programme", render: r => '<b>' + esc(r.training_title || "Training") + '</b>' },
                { label: "Provider", render: r => esc(r.provider || "Internal") },
                { label: "Mode", render: r => '<span style="text-transform:capitalize">' + esc(r.mode || "in_person") + '</span>' },
                { label: "Start Date", render: r => fmtDate(r.start_date) },
                { label: "Score", class: "right mono", render: r => r.score ? r.score + "%" : "—" },
                { label: "Status", render: r => chip(r.status) },
              ],
              rows: e.trainings || [],
              emptyTitle: "No training enrolments",
            });
      }

      /* ===================== TAB 8: DOCUMENTS & POLICIES ===================== */
      if (activeTab === "documents") {
        tabBody = '<div class="grid grid-2">'
          + '<div class="card"><div class="card-head"><div><h3>Employee Documents</h3><div class="sub">Contracts, IDs, certificates & letters</div></div>'
          + '<div class="right">' + (canManage ? '<button class="btn btn-sm btn-accent" id="btn-upload-doc">' + icon("plus", 13) + ' Add document</button>' : '') + '</div>'
          + '</div><div class="card-body">'
          + ((e.documents && e.documents.length)
              ? '<div class="stack" style="gap:10px">' + e.documents.map(d =>
                  '<div class="skill-item"><div><b style="font-size:13px">' + esc(d.title) + '</b>'
                  + '<div class="tiny muted" style="margin-top:3px;text-transform:capitalize">' + esc(d.category || "general")
                  + (d.file_name ? ' · <span class="mono">' + esc(d.file_name) + '</span>' : '')
                  + (d.expires_at ? ' · Expires ' + fmtDate(d.expires_at) : '') + '</div></div>'
                  + '<div><span class="chip grey">' + fmtDate(d.created_at) + '</span></div></div>'
                ).join("") + '</div>'
              : emptyState("No documents recorded", "Add signed contracts, ID copies or certificates.", "file"))
          + '</div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Company Policies & Handbooks</h3><div class="sub">' + ackedCount + ' of ' + policyList.length + ' policies acknowledged</div></div></div>'
          + '<div class="card-body">'
          + (policyList.length
              ? '<div class="stack" style="gap:10px">' + policyList.map(p =>
                  '<div class="skill-item"><div><b style="font-size:13px">' + esc(p.title) + ' <span class="tiny muted">v' + esc(p.version || "1.0") + '</span></b>'
                  + '<div class="tiny muted" style="margin-top:3px">' + esc(p.category || "Policy") + ' · Published ' + fmtDate(p.published_at) + '</div></div>'
                  + '<div>'
                  + (p.acknowledged
                      ? '<span class="chip green">Acknowledged</span>'
                      : (e.is_self && !Store.isReadOnly()
                          ? '<button class="btn btn-sm btn-accent" data-ack-policy="' + p.id + '">Acknowledge</button>'
                          : '<span class="chip amber">Pending</span>'))
                  + '</div></div>'
                ).join("") + '</div>'
              : '<p class="small muted">No active company policies.</p>')
          + '</div></div></div>';
      }

      /* ===================== TAB 9: ASSETS, ONBOARDING & CLAIMS ===================== */
      if (activeTab === "operations") {
        const assetRows = e.asset_history || e.assets || [];
        tabBody = '<div class="grid grid-2" style="margin-bottom:18px">'
          + '<div class="card"><div class="card-head"><div><h3>Assigned Equipment</h3><div class="sub">Company laptops, phones & access cards</div></div></div><div class="card-body">'
          + (assetRows.length
              ? '<div class="stack" style="gap:10px">' + assetRows.map(a =>
                  '<div class="skill-item"><div><b style="font-size:13px">' + esc(a.asset_name || "Asset") + '</b> <span class="mono tiny muted">' + esc(a.asset_tag || "") + '</span>'
                  + '<div class="tiny muted" style="margin-top:3px">Assigned ' + fmtDate(a.assigned_at) + (a.serial_no ? " · S/N " + esc(a.serial_no) : "") + '</div></div>'
                  + '<div>' + (a.returned_at ? '<span class="chip grey">Returned ' + fmtDate(a.returned_at) + '</span>' : '<span class="chip green">In custody</span>') + '</div></div>'
                ).join("") + '</div>'
              : emptyState("No assets assigned", "Issued hardware and equipment will appear here.", "laptop"))
          + '</div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Onboarding Checklist</h3><div class="sub">Joining tasks across IT, HR & Line Manager</div></div></div><div class="card-body">'
          + ((e.onboarding && e.onboarding.length)
              ? e.onboarding.map(t =>
                  '<div class="list-row">'
                  + '<input type="checkbox" ' + (t.status === "completed" ? "checked" : "") + (canManage ? "" : " disabled") + ' data-toggle-task="' + t.id + '">'
                  + '<div class="body"><b style="' + (t.status === "completed" ? "text-decoration:line-through;color:var(--muted)" : "") + '">' + esc(t.title) + '</b>'
                  + '<span>' + esc((t.owner_role || "hr").toUpperCase()) + ' · Due ' + fmtDate(t.due_date) + '</span></div>'
                  + chip(t.status) + '</div>'
                ).join("")
              : '<p class="small muted">All onboarding tasks completed or none assigned.</p>')
          + '</div></div></div>'

          + '<div class="section-title" style="margin-bottom:8px">Recent Expense Claims</div>'
          + renderTable({
              columns: [
                { label: "Title", render: r => '<b>' + esc(r.title) + '</b>' },
                { label: "Category", render: r => esc(r.category_name || "General") },
                { label: "Incurred On", render: r => fmtDate(r.incurred_on) },
                { label: "Amount", class: "right mono", render: r => fmtMoney(r.amount, r.currency || "GHS") },
                { label: "Status", render: r => chip(r.status) },
              ],
              rows: e.claims || [],
              emptyTitle: "No expense claims",
            });
      }

      /* ===================== HERO + PAGE SHELL ===================== */
      const topActions = '<div class="row" style="flex-wrap:wrap;gap:8px">'
        + (!e.is_self ? '<button class="btn btn-ghost" onclick="go(\'employees\')">' + icon("arrowLeft", 14) + ' Directory</button>' : '')
        + '<button class="btn btn-ghost" id="btn-print-profile">' + icon("printer", 14) + ' Print summary</button>'
        + (e.is_self ? '<button class="btn btn-ghost" onclick="go(\'settings/notifications\')">' + icon("bell", 14) + ' Alert prefs</button>' : '')
        + (canSelfOrHr ? '<button class="btn btn-ghost" id="btn-self-edit">' + icon("user", 14) + ' Edit personal</button>' : '')
        + (canManage ? '<button class="btn btn-accent" id="btn-hr-edit">' + icon("edit", 14) + ' Edit HR record</button>' : '')
        + (canManage && !e.is_self ? '<button class="btn btn-soft" id="btn-status-change">' + icon("refresh", 14) + ' Status</button>' : '')
        + '</div>';

      root.innerHTML = '<div class="page-enter">'
        + pageHead(
            e.is_self ? "My Profile" : e.full_name,
            (e.designation_title || "Team Member") + " · " + (e.department_name || "Unassigned") + " · " + e.employee_no,
            topActions,
            e.is_self ? "Employee Self-Service" : "Employee 360° Record"
          )
        + '<div class="profile-banner">'
        + '  <div class="profile-cover"><div class="cover-badges">'
        + '    <span class="cover-pill" style="text-transform:capitalize">' + esc((e.contract_type || "permanent").replace(/_/g, " ")) + '</span>'
        +      (e.grade_name ? '<span class="cover-pill">' + esc(e.grade_name) + '</span>' : '')
        +      (e.tenure_label ? '<span class="cover-pill">' + icon("clock", 12) + ' ' + esc(e.tenure_label) + ' tenure</span>' : '')
        + '  </div></div>'
        + '  <div class="profile-main">'
        + '    <div class="profile-avatar-holder">' + avatarHTML(e.full_name, "avatar-xl", "", e.photo_url) + '</div>'
        + '    <div class="profile-identity">'
        + '      <div class="row" style="gap:10px;flex-wrap:wrap"><h2>' + esc(e.full_name) + '</h2>' + chip(e.status) + '</div>'
        + '      <div class="muted small" style="margin-top:3px">' + esc(e.designation_title || "—") + ' · ' + esc(e.department_name || "—") + ' · ' + esc(e.branch_name || "Head Office") + ' (' + esc(e.work_location || "Office") + ')</div>'
        +        (e.bio ? '<p class="small" style="margin-top:10px;color:var(--ink-3);max-width:680px;line-height:1.55">' + esc(e.bio) + '</p>' : '')
        + '      <div class="profile-contact-bar">'
        +          (e.email ? '<a class="contact-pill" href="mailto:' + esc(e.email) + '">' + icon("mail", 13) + ' ' + esc(e.email) + '</a>' : '')
        +          (e.phone ? '<a class="contact-pill" href="tel:' + esc(e.phone) + '">' + icon("phone", 13) + ' ' + esc(e.phone) + '</a>' : '')
        +          (e.city ? '<span class="contact-pill">' + icon("mapPin", 13) + ' ' + esc(e.city) + '</span>' : '')
        +          (e.linkedin_url ? '<a class="contact-pill" href="' + esc(e.linkedin_url) + '" target="_blank" rel="noopener">' + icon("globe", 13) + ' LinkedIn</a>' : '')
        + '        <span class="contact-pill mono">' + esc(e.employee_no) + '</span>'
        + '      </div>'
        + '    </div>'
        + '    <div class="profile-side-summary">'
        + '      <div class="row-between"><span class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em">Profile completeness</span><b class="mono small">' + comp.percent + '%</b></div>'
        + '      <div class="progress" style="margin:8px 0"><i style="width:' + comp.percent + '%"></i></div>'
        +        (comp.missing && comp.missing.length
                  ? '<div class="tiny muted">Missing: ' + esc(comp.missing.slice(0, 2).join(", ")) + (comp.missing.length > 2 ? " +" + (comp.missing.length - 2) : "") + '</div>'
                  : '<div class="tiny" style="color:var(--green)">All key profile fields completed</div>')
        + '      <div class="tiny muted" style="margin-top:10px">Joined ' + fmtDate(e.hire_date) + '</div>'
        + '    </div>'
        + '  </div>'
        + '</div>'

        // 5-KPI Strip
        + '<div class="grid grid-5" style="margin-bottom:18px">'
        + '  <div class="kpi"><div class="label">Service Tenure</div><div class="value" style="font-size:22px">' + esc(e.tenure_label || "New") + '</div><div class="sub">Hired ' + fmtDate(e.hire_date) + '</div></div>'
        + '  <div class="kpi"><div class="label">Leave Available</div><div class="value" style="font-size:22px">' + fmtNumber(paidLeaveRemaining) + ' <span class="tiny muted">days</span></div><div class="sub">Across active entitlements</div></div>'
        + '  <div class="kpi"><div class="label">Attendance (30d)</div><div class="value" style="font-size:22px">' + fmtNumber(attSummary.rate) + '%</div><div class="sub">' + fmtNumber(attSummary.present) + ' present · ' + fmtNumber(attSummary.late) + ' late</div></div>'
        + '  <div class="kpi"><div class="label">Latest Appraisal</div><div class="value" style="font-size:22px">' + (latestAppraisal && latestAppraisal.final_rating ? latestAppraisal.final_rating + " / 5" : "—") + '</div><div class="sub">' + (e.goals || []).length + ' active goal(s)</div></div>'
        + '  <div class="kpi"><div class="label">Compliance & Assets</div><div class="value" style="font-size:22px">' + ackedCount + '/' + policyList.length + '</div><div class="sub">' + activeAssets.length + ' asset(s) in custody</div></div>'
        + '</div>'

        // Tabs
        + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t =>
            '<button class="tab ' + (activeTab === t[0] ? "active" : "") + '" data-tab="' + t[0] + '">' + esc(t[1])
            + (t[2] !== undefined ? '<span class="count">' + t[2] + '</span>' : '') + '</button>'
          ).join("") + '</div>'
        + tabBody
        + '</div>';

      /* ===================== BIND INTERACTIONS ===================== */
      root.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { activeTab = b.dataset.tab; loadAndRender(); });
      root.querySelectorAll("[data-switch-tab]").forEach(b => b.onclick = () => { activeTab = b.dataset.switchTab; loadAndRender(); });
      root.querySelectorAll("[data-jump-emp]").forEach(el => el.onclick = () => go("employees/" + el.dataset.jumpEmp));

      const printBtn = root.querySelector("#btn-print-profile");
      if (printBtn) printBtn.onclick = () => printProfileSummary(e);

      const selfBtn = root.querySelector("#btn-self-edit");
      if (selfBtn) selfBtn.onclick = () => openSelfEditModal(e, loadAndRender);
      const selfInline = root.querySelector("#btn-self-edit-inline");
      if (selfInline) selfInline.onclick = () => openSelfEditModal(e, loadAndRender);

      const hrBtn = root.querySelector("#btn-hr-edit");
      if (hrBtn) hrBtn.onclick = () => openHrEmployeeEditModal(e, loadAndRender);
      const careerHrBtn = root.querySelector("#career-edit-hr");
      if (careerHrBtn) careerHrBtn.onclick = () => openHrEmployeeEditModal(e, loadAndRender);

      const statusBtn = root.querySelector("#btn-status-change");
      if (statusBtn && typeof openStatusForm === "function") statusBtn.onclick = () => openStatusForm(e);

      const sensBtn = root.querySelector("#toggle-sensitive");
      if (sensBtn) sensBtn.onclick = () => { showSensitive = !showSensitive; loadAndRender(); };
      const bankMaskBtn = root.querySelector("#toggle-bank-mask");
      if (bankMaskBtn) bankMaskBtn.onclick = () => { showSensitive = !showSensitive; loadAndRender(); };

      const confirmProbBtn = root.querySelector("#btn-confirm-probation");
      if (confirmProbBtn) confirmProbBtn.onclick = () => openFormModal({
        title: "Confirm appointment — " + e.full_name,
        sub: "Completes probation and records permanent confirmation",
        submitLabel: "Confirm appointment",
        fields: [
          { name: "effective_date", label: "Confirmation date", type: "date", default: todayISO(), required: true },
          { name: "notes", label: "Confirmation notes", type: "textarea", full: true, default: "Successfully completed probation review." },
        ],
        onSubmit: async (data) => {
          await API.post("/employees/" + e.id + "/confirm", data);
          await loadAndRender();
        },
      });

      const careerBtn = root.querySelector("#btn-record-career");
      if (careerBtn) careerBtn.onclick = () => openCareerEventModal(e, loadAndRender);

      // Add Skill
      const openAddSkill = () => openFormModal({
        title: "Add skill or competency",
        submitLabel: "Add skill",
        fields: [
          { name: "name", label: "Skill / competency", required: true, placeholder: "e.g. Python, IFRS Reporting, Labour Law", full: true },
          { name: "category", label: "Category", type: "select", default: "technical", options: [
            { value: "technical", label: "Technical" },
            { value: "domain", label: "Domain" },
            { value: "leadership", label: "Leadership" },
            { value: "certification", label: "Certification" },
            { value: "language", label: "Language" },
          ]},
          { name: "proficiency", label: "Proficiency level", type: "select", default: "advanced", options: [
            { value: "beginner", label: "Beginner" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" },
            { value: "expert", label: "Expert" },
          ]},
          { name: "years_experience", label: "Years of experience", type: "number", default: "2" },
        ],
        onSubmit: async (data) => {
          await API.post("/employee-skills", { ...data, employee_id: e.id });
          await loadAndRender();
        },
      });
      if (root.querySelector("#btn-add-skill")) root.querySelector("#btn-add-skill").onclick = openAddSkill;
      if (root.querySelector("#quick-add-skill")) root.querySelector("#quick-add-skill").onclick = openAddSkill;

      root.querySelectorAll("[data-verify-skill]").forEach(b => b.onclick = async () => {
        try { await API.put("/employee-skills/" + b.dataset.verifySkill, { verified: true }); toast("Skill verified", "success"); loadAndRender(); } catch (err) { handleErr(err); }
      });
      root.querySelectorAll("[data-del-skill]").forEach(b => b.onclick = () => confirmDialog("Remove skill", "Remove this skill from the profile?", async () => {
        await API.del("/employee-skills/" + b.dataset.delSkill); toast("Skill removed", "success"); loadAndRender();
      }, { danger: true }));

      // Add Education
      if (root.querySelector("#btn-add-edu")) root.querySelector("#btn-add-edu").onclick = () => openFormModal({
        title: "Add qualification or degree",
        submitLabel: "Save qualification",
        fields: [
          { name: "kind", label: "Qualification type", type: "select", default: "degree", options: [
            { value: "degree", label: "University Degree" },
            { value: "certification", label: "Professional Certification" },
            { value: "diploma", label: "Diploma / HND" },
          ]},
          { name: "institution", label: "Institution / Issuing body", required: true, placeholder: "e.g. University of Ghana, Legon" },
          { name: "qualification", label: "Title / Qualification", required: true, placeholder: "e.g. BSc Computer Science, ACCA, SHRM-CP" },
          { name: "field_of_study", label: "Field of study", placeholder: "e.g. Finance, Human Resources" },
          { name: "start_year", label: "Start year", type: "number", placeholder: "2018" },
          { name: "end_year", label: "Completion year", type: "number", placeholder: "2022" },
          { name: "credential_id", label: "Credential / Licence ID (optional)", full: true },
        ],
        onSubmit: async (data) => {
          await API.post("/employee-education", { ...data, employee_id: e.id });
          await loadAndRender();
        },
      });
      root.querySelectorAll("[data-del-edu]").forEach(b => b.onclick = () => confirmDialog("Remove qualification", "Delete this education record?", async () => {
        await API.del("/employee-education/" + b.dataset.delEdu); toast("Removed", "success"); loadAndRender();
      }, { danger: true }));

      // Emergency Contacts
      const openAddEc = () => openFormModal({
        title: "Add emergency contact",
        submitLabel: "Save contact",
        fields: [
          { name: "name", label: "Full name", required: true },
          { name: "relationship", label: "Relationship", required: true, placeholder: "Spouse, Parent, Sibling…" },
          { name: "phone", label: "Primary phone", required: true, placeholder: "+233 24 000 0000" },
          { name: "email", label: "Email", type: "email" },
          { name: "type", label: "Contact type", type: "select", default: "emergency", options: [
            { value: "emergency", label: "Emergency" },
            { value: "next_of_kin", label: "Next of Kin" },
          ]},
          { name: "address", label: "Address" },
        ],
        onSubmit: async (data) => {
          await API.post("/contacts", { ...data, employee_id: e.id });
          await loadAndRender();
        },
      });
      if (root.querySelector("#btn-add-ec")) root.querySelector("#btn-add-ec").onclick = openAddEc;
      if (root.querySelector("#quick-add-contact")) root.querySelector("#quick-add-contact").onclick = openAddEc;
      root.querySelectorAll("[data-del-ec]").forEach(b => b.onclick = () => confirmDialog("Remove contact", "Remove this emergency contact?", async () => {
        await API.del("/contacts/" + b.dataset.delEc); toast("Removed", "success"); loadAndRender();
      }, { danger: true }));

      // Dependants
      if (root.querySelector("#btn-add-dep")) root.querySelector("#btn-add-dep").onclick = () => openFormModal({
        title: "Add dependant",
        submitLabel: "Save dependant",
        fields: [
          { name: "name", label: "Full name", required: true },
          { name: "relationship", label: "Relationship", type: "select", default: "Child", options: ["Spouse", "Child", "Parent", "Ward", "Other"] },
          { name: "dob", label: "Date of birth", type: "date" },
          { name: "gender", label: "Gender", type: "select", options: [{ value: "", label: "—" }, { value: "female", label: "Female" }, { value: "male", label: "Male" }] },
          { name: "is_beneficiary", label: "Register as statutory beneficiary", type: "checkbox", value: true },
        ],
        onSubmit: async (data) => {
          await API.post("/dependants", { ...data, employee_id: e.id });
          await loadAndRender();
        },
      });
      root.querySelectorAll("[data-del-dep]").forEach(b => b.onclick = () => confirmDialog("Remove dependant", "Remove this dependant record?", async () => {
        await API.del("/dependants/" + b.dataset.delDep); toast("Removed", "success"); loadAndRender();
      }, { danger: true }));

      // Bank accounts
      if (root.querySelector("#btn-add-bank")) root.querySelector("#btn-add-bank").onclick = () => openFormModal({
        title: "Add salary bank or MoMo account",
        submitLabel: "Save account",
        fields: [
          { name: "bank_name", label: "Bank / Institution", required: true, placeholder: "e.g. Ecobank Ghana, GCB Bank, Stanbic" },
          { name: "branch_name", label: "Branch", placeholder: "e.g. Airport City" },
          { name: "account_name", label: "Account holder name", default: e.full_name, required: true },
          { name: "account_no", label: "Account number", required: true },
          { name: "mobile_money", label: "Mobile Money wallet (optional)", placeholder: "+233 24 000 0000" },
          { name: "is_primary", label: "Set as primary salary account", type: "checkbox", value: true },
        ],
        onSubmit: async (data) => {
          await API.post("/bank-accounts", { ...data, employee_id: e.id });
          await loadAndRender();
        },
      });
      root.querySelectorAll("[data-del-bank]").forEach(b => b.onclick = () => confirmDialog("Remove bank account", "Remove this salary account?", async () => {
        await API.del("/bank-accounts/" + b.dataset.delBank); toast("Removed", "success"); loadAndRender();
      }, { danger: true }));

      // View Payslip Modal
      root.querySelectorAll("[data-view-slip]").forEach(b => b.onclick = () => {
        if (typeof openPayslipModal === "function") {
          openPayslipModal(Number(b.dataset.viewSlip));
          return;
        }
        const slip = (e.payslips || []).find(s => String(s.id) === String(b.dataset.viewSlip));
        if (!slip) return;
        openModal({
          title: "Payslip — " + (slip.period_label || "Statement"),
          sub: e.full_name + " · " + e.employee_no,
          body: '<div class="stack"><dl class="kv">'
            + '<dt>Gross Pay</dt><dd class="mono">' + fmtMoney(slip.gross) + '</dd>'
            + '<dt>PAYE Tax</dt><dd class="mono">-' + fmtMoney(slip.tax) + '</dd>'
            + '<dt>SSNIT (5.5%)</dt><dd class="mono">-' + fmtMoney(slip.ssnit) + '</dd>'
            + '<dt>Other Deductions</dt><dd class="mono">-' + fmtMoney(slip.other_deductions) + '</dd>'
            + '<dt>Net Pay</dt><dd class="mono"><b>' + fmtMoney(slip.net) + '</b></dd>'
            + '</dl></div>',
          footer: '<button class="btn btn-accent" data-close-modal>Close</button>',
        });
      });

      // Apply Leave
      const applyLeaveBtn = root.querySelector("#profile-apply-leave");
      if (applyLeaveBtn) applyLeaveBtn.onclick = () => {
        if (typeof openLeaveForm === "function") openLeaveForm({ employee_id: e.id });
        else go("leave");
      };

      // Add Document
      if (root.querySelector("#btn-upload-doc")) root.querySelector("#btn-upload-doc").onclick = () => {
        openFormModal({
          title: "Add employee document",
          submitLabel: "Save document",
          fields: [
            { name: "title", label: "Document title", required: true, full: true, placeholder: "e.g. Signed Offer Letter, Ghana Card Copy" },
            { name: "category", label: "Category", type: "select", default: "contract", options: ["contract", "id", "certificate", "policy", "medical", "other"] },
            { name: "file_name", label: "File reference / filename", placeholder: "contract_signed.pdf" },
            { name: "expires_at", label: "Expiry date (optional)", type: "date" },
            { name: "notes", label: "Notes", type: "textarea", full: true },
          ],
          onSubmit: async (data) => {
            await API.post("/documents", { ...data, employee_id: e.id, uploaded_by: Store.user.id });
            await loadAndRender();
          },
        });
      };

      // Policy Acknowledge
      root.querySelectorAll("[data-ack-policy]").forEach(b => b.onclick = async () => {
        try {
          await API.post("/policies/" + b.dataset.ackPolicy + "/acknowledge");
          toast("Policy acknowledged", "success");
          loadAndRender();
        } catch (err) { handleErr(err); }
      });

      // Toggle Onboarding Task
      root.querySelectorAll("[data-toggle-task]").forEach(cb => cb.onchange = async () => {
        try {
          await API.put("/onboarding-tasks/" + cb.dataset.toggleTask, {
            status: cb.checked ? "completed" : "pending",
          });
          toast(cb.checked ? "Task marked completed" : "Task reopened", "success");
          loadAndRender();
        } catch (err) { handleErr(err); }
      });

    } catch (err) {
      root.innerHTML = pageHead("Employee Profile", "Unable to load") + emptyState("Could not load profile", err.message, "alert");
    }
  }

  await loadAndRender();
}

Views.profile = async function (root, params) {
  if (!Store.user.employee_id) {
    root.innerHTML = pageHead("My Profile", "Account overview", '<button class="btn btn-ghost" onclick="go(\'settings\')">' + icon("settings", 14) + ' Open Settings</button>')
      + emptyState("No employee record linked", "Your user account is not linked to an employee directory profile. Use Settings to manage your account and security.", "user");
    return;
  }
  await viewEmployeeDetail(root, Store.user.employee_id, params && params[0]);
};
