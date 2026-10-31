/* ============================================================================
   EMPLOYMENT LETTERS & PORTAL CREDENTIALS DISPATCH MODULE
============================================================================ */

window.EMPLOYMENT_CATEGORY_OPTIONS = [
  { value: "permanent", label: "Permanent / Full-Time" },
  { value: "probation", label: "Probationary Staff" },
  { value: "fixed_term", label: "Fixed-Term Contract" },
  { value: "part_time", label: "Part-Time Staff" },
  { value: "casual", label: "Casual / Temporary Staff" },
  { value: "intern", label: "Internship / Attachment" },
  { value: "national_service", label: "National Service (NSS)" },
  { value: "consultant", label: "Consultant / Retainer" },
];

window.STAFF_CATEGORY_OPTIONS = [
  { value: "Executive / Leadership", label: "Executive / Leadership" },
  { value: "Management / Senior Staff", label: "Management / Senior Staff" },
  { value: "Supervisory / Mid-Level", label: "Supervisory / Mid-Level" },
  { value: "Technical / Specialist", label: "Technical / Specialist" },
  { value: "Operations / Frontline", label: "Operations / Frontline" },
  { value: "General / Junior Staff", label: "General / Junior Staff" },
  { value: "Trainee / Attachment", label: "Trainee / Attachment" },
];

function ensurePrintPortal() {
  let el = document.getElementById("print-letter-portal");
  if (!el) {
    el = document.createElement("div");
    el.id = "print-letter-portal";
    document.body.appendChild(el);
  }
  return el;
}

window.printLetterHtml = function (html) {
  const portal = ensurePrintPortal();
  portal.innerHTML = html || "";
  document.body.classList.add("printing-letter");
  const cleanup = () => {
    document.body.classList.remove("printing-letter");
    portal.innerHTML = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      if (document.body.classList.contains("printing-letter")) cleanup();
    }, 1800);
  }, 120);
};

window.copyTextToClipboard = async function (txt, label) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(txt);
    } else {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast((label || "Credentials") + " copied to clipboard", "success");
  } catch (e) {
    toast("Copy failed — select and copy manually", "error");
  }
};

/* ---------------- FULL HTML EMAIL PREVIEW MODAL ---------------- */
window.openDeliveryPreviewModal = async function (deliveryId, onRetried) {
  try {
    const res = await API.get("/messaging/deliveries/" + deliveryId);
    const d = res.data;
    openModal({
      title: "Email / Message Dispatch Preview",
      sub: "Recipient: " + (d.recipient || "—") + " · Status: " + (d.status || "sent").toUpperCase(),
      wide: true,
      body: '<div class="stack">'
        + '<div class="row-between" style="background:var(--surface-2);padding:10px 14px;border-radius:10px;border:1px solid var(--line);flex-wrap:wrap;gap:8px">'
        + '  <div><div class="tiny muted">SUBJECT</div><b>' + esc(d.subject || "Notification") + '</b></div>'
        + '  <div class="row" style="gap:8px">' + chip(d.status) + '<span class="tiny mono muted">' + fmtDateTime(d.sent_at || d.created_at) + '</span></div>'
        + '</div>'
        + (d.status === "simulated"
            ? '<div class="callout-banner amber">'
              + '<div><b>Sandbox Simulation Mode Active:</b> This exact email was generated and recorded safely in Meridian HR. To deliver live emails directly to external inboxes (such as Gmail or company mail), configure your SMTP credentials in <b>Settings → Email & SMS Gateways</b> and click <b>Resend via SMTP</b>.</div>'
              + '<button class="btn btn-sm btn-accent" id="prev-goto-smtp">Configure SMTP</button>'
              + '</div>'
            : '')
        + (d.error ? '<div class="callout-banner red"><div><b>SMTP Error:</b> ' + esc(d.error) + '</div></div>' : '')
        + (d.html_body
            ? '<iframe id="email-preview-frame" style="width:100%;height:460px;border:1px solid var(--line);border-radius:10px;background:#f5f3ee"></iframe>'
            : '<pre class="channel-box small" style="white-space:pre-wrap">' + esc(d.body || "") + '</pre>')
        + '</div>',
      footer: '<div class="row" style="width:100%;justify-content:space-between">'
        + (Store.canManage()
            ? '<button class="btn btn-teal" id="btn-resend-live-email">' + icon("send", 14) + ' Retry / Resend Email</button>'
            : '<span></span>')
        + '<button class="btn btn-ghost" data-close-modal>Close</button>'
        + '</div>',
    });
    const frame = document.getElementById("email-preview-frame");
    if (frame && d.html_body) {
      frame.srcdoc = d.html_body;
    }
    const smtpBtn = document.getElementById("prev-goto-smtp");
    if (smtpBtn) smtpBtn.onclick = () => { closeModal(); go("settings/email_sms"); };
    const resendBtn = document.getElementById("btn-resend-live-email");
    if (resendBtn) resendBtn.onclick = async () => {
      try {
        const r = await API.post("/messaging/deliveries/" + d.id + "/retry");
        toast("Dispatched (" + (r.data.status || "sent") + ") to " + d.recipient, "success");
        closeModal();
        if (onRetried) onRetried();
      } catch (err) { handleErr(err); }
    };
  } catch (err) {
    handleErr(err);
  }
};

/* ---------------- CREDENTIALS DISPATCH RECEIPT MODAL ---------------- */
window.openCredentialsDispatchModal = function (dispatch, emp) {
  if (!dispatch) return;
  const portalUrl = window.location.origin + "/#/employment-letters";
  const summaryText = [
    "Portal Sign-In URL: " + portalUrl,
    "Username: " + (dispatch.username || "—"),
    "Registered Email: " + (dispatch.email || (emp && emp.email) || "—"),
    "Employee ID: " + (dispatch.employee_no || (emp && emp.employee_no) || "—"),
    dispatch.temporary_password ? ("Temporary Password: " + dispatch.temporary_password) : null,
    dispatch.category_label ? ("Employment Category: " + dispatch.category_label) : null,
  ].filter(Boolean).join("\n");

  const isSentLive = dispatch.email_status === "sent";
  const isSimulated = dispatch.email_status === "simulated";

  openModal({
    title: "Employee Portal Credentials & Letter Ready",
    sub: (emp ? (emp.full_name || ((emp.first_name || "") + " " + (emp.last_name || "")).trim()) : dispatch.email) + " · " + (dispatch.category_label || "Staff"),
    wide: true,
    body: '<div class="stack">'
      + (isSentLive
          ? '<div class="callout-banner green"><div><b>Live Email Sent!</b> Login username, temporary password, and employment letter link were delivered via SMTP to <b>' + esc(dispatch.email) + '</b>.</div></div>'
          : isSimulated
            ? '<div class="callout-banner amber">'
              + '<div><b>Credentials Generated & Logged (Sandbox Mode):</b> A formatted welcome email for <b>' + esc(dispatch.email) + '</b> has been prepared and saved. Connect Gmail / SMTP in <b>Settings → Email & SMS Gateways</b> for automatic real inbox delivery, or copy/preview the credentials below right now.</div>'
              + '<button class="btn btn-sm btn-ghost" id="cred-open-smtp">' + icon("settings", 13) + ' SMTP Setup</button>'
              + '</div>'
            : '<div class="callout-banner red"><div><b>Email Dispatch Issue:</b> ' + esc(dispatch.email_error || "Check employee email or SMTP gateway settings.") + '</div></div>')

      + '<div class="cred-grid-box">'
      + '  <div class="cred-row"><span class="k">Portal URL</span><span class="v mono">' + esc(portalUrl) + '</span></div>'
      + '  <div class="cred-row"><span class="k">Username</span><span class="v mono">' + esc(dispatch.username || "—") + '</span></div>'
      + '  <div class="cred-row"><span class="k">Registered Login Email</span><span class="v mono">' + esc(dispatch.email || "—") + '</span></div>'
      + '  <div class="cred-row"><span class="k">Employee ID (also valid for login)</span><span class="v mono">' + esc(dispatch.employee_no || "—") + '</span></div>'
      + (dispatch.temporary_password
          ? '  <div class="cred-row highlight"><span class="k">Temporary Password</span><span class="v mono" style="font-size:15px;color:var(--accent)">' + esc(dispatch.temporary_password) + '</span></div>'
          : '')
      + '  <div class="cred-row"><span class="k">Employment Letter</span><span class="v">' + esc(dispatch.category_label || "Permanent") + ' · <span class="mono tiny">' + esc(dispatch.letter_reference || "") + '</span></span></div>'
      + '</div>'

      + '<div class="row" style="gap:8px;flex-wrap:wrap">'
      + '  <button class="btn btn-sm btn-soft" id="btn-copy-creds">' + icon("copy", 13) + ' Copy Login Details</button>'
      + (dispatch.delivery_id ? '  <button class="btn btn-sm btn-ghost" id="btn-preview-cred-email">' + icon("mail", 13) + ' Preview Sent Email</button>' : '')
      + (emp && emp.id ? '  <button class="btn btn-sm btn-teal" id="btn-view-emp-letter-now">' + icon("file", 13) + ' View & Print Employment Letter</button>' : '')
      + '</div>'
      + '</div>',
    footer: '<button class="btn btn-accent" data-close-modal>Done</button>',
  });

  const copyBtn = document.getElementById("btn-copy-creds");
  if (copyBtn) copyBtn.onclick = () => copyTextToClipboard(summaryText, "Login credentials");

  const prevBtn = document.getElementById("btn-preview-cred-email");
  if (prevBtn) prevBtn.onclick = () => {
    closeModal();
    openDeliveryPreviewModal(dispatch.delivery_id);
  };

  const smtpBtn = document.getElementById("cred-open-smtp");
  if (smtpBtn) smtpBtn.onclick = () => { closeModal(); go("settings/email_sms"); };

  const letBtn = document.getElementById("btn-view-emp-letter-now");
  if (letBtn) letBtn.onclick = () => {
    closeModal();
    openEmploymentLetterModal(emp.id);
  };
};

/* ---------------- SEND / RESET CREDENTIALS MODAL ---------------- */
window.openSendCredentialsModal = function (emp, onComplete) {
  const empName = emp.full_name || emp.employee_name || ((emp.first_name || "") + " " + (emp.last_name || "")).trim();
  const roles = (Store.meta && Store.meta.roles && Store.meta.roles.length)
    ? Store.meta.roles
    : [{ id: 7, name: "Employee", slug: "employee" }];

  openFormModal({
    title: "Send Portal Login Credentials",
    sub: empName + " (" + (emp.employee_no || "") + ") · Destination: " + (emp.email || emp.personal_email || "No email set"),
    submitLabel: "Generate & Email Credentials",
    values: {
      username: emp.username || "",
      password: "",
      role_id: "",
      also_personal_email: true,
      must_change_password: true,
    },
    fields: [
      {
        name: "username",
        label: "Portal Username (leave blank to auto-generate)",
        placeholder: "e.g. firstname.lastname",
      },
      {
        name: "password",
        label: "Temporary Password (leave blank to auto-generate)",
        placeholder: "Auto-generates secure password e.g. Awh@4829KP",
      },
      {
        name: "role_id",
        label: "Portal Role",
        type: "select",
        options: [{ value: "", label: "Keep current / Employee (Default)" }, ...roles.map(r => ({ value: r.id, label: r.name }))],
      },
      {
        name: "also_personal_email",
        label: "Also CC employee's personal email address (if on file)",
        type: "checkbox",
        value: true,
        full: true,
      },
      {
        name: "must_change_password",
        label: "Prompt employee to change temporary password after signing in",
        type: "checkbox",
        value: true,
        full: true,
      },
    ],
    onSubmit: async (data) => {
      const res = await API.post("/employees/" + emp.id + "/send-credentials", data);
      if (onComplete) await onComplete(res.data);
      setTimeout(() => openCredentialsDispatchModal(res.data, emp), 80);
    },
  });
};

/* ---------------- CUSTOMIZE EMPLOYMENT LETTER MODAL ---------------- */
window.openLetterCustomizeModal = function (letterData, onSaved) {
  openFormModal({
    title: "Customize Employment Letter",
    sub: letterData.employee_name + " (" + letterData.reference_no + ")",
    wide: true,
    submitLabel: "Save Letter & Regenerate",
    values: {
      category_key: letterData.category_key || "permanent",
      staff_category: letterData.staff_category || "General / Junior Staff",
      letter_title: letterData.letter_title || "",
      subject_line: letterData.subject_line || "",
      issue_date: letterData.issue_date || "",
      effective_date: letterData.effective_date || "",
      end_date: letterData.end_date || "",
      probation_months: letterData.probation_months != null ? String(letterData.probation_months) : "3",
      working_hours: letterData.working_hours || "",
      notice_period: letterData.notice_period || "",
      signatory_name: letterData.signatory_name || "",
      signatory_title: letterData.signatory_title || "",
      custom_clauses: letterData.custom_clauses || "",
    },
    fields: [
      { name: "category_key", label: "Employment Category", type: "select", options: EMPLOYMENT_CATEGORY_OPTIONS, required: true },
      { name: "staff_category", label: "Staff Category / Cadre", type: "select", options: STAFF_CATEGORY_OPTIONS, required: true },
      { name: "letter_title", label: "Document Heading", full: true },
      { name: "subject_line", label: "Subject Line (supports {{designation}}, {{department}})", full: true },
      { name: "issue_date", label: "Issue Date", type: "date" },
      { name: "effective_date", label: "Effective Start Date", type: "date" },
      { name: "end_date", label: "Contract / Placement End Date (if fixed-term/intern/NSS)", type: "date" },
      { name: "probation_months", label: "Probationary Period (Months)", type: "number", min: 0, max: 24 },
      { name: "working_hours", label: "Working Hours Schedule", full: true },
      { name: "notice_period", label: "Termination Notice Clause", full: true },
      { name: "signatory_name", label: "Authorized Signatory Name" },
      { name: "signatory_title", label: "Authorized Signatory Title" },
      { name: "custom_clauses", label: "Special Terms / Additional Allowances Clause (optional)", type: "textarea", full: true, placeholder: "e.g. Accommodation, duty meals, transport allowance, or KPI bonus terms…" },
    ],
    onSubmit: async (formVals) => {
      const updated = await API.put("/employees/" + letterData.employee_id + "/employment-letter", formVals);
      toast("Employment letter updated", "success");
      if (onSaved) await onSaved(updated.data);
    },
  });
};

/* ---------------- ACCEPT & COUNTERSIGN MODAL ---------------- */
window.openAcceptLetterModal = function (letterData, onAccepted) {
  openFormModal({
    title: "Accept & Digitally Sign Employment Letter",
    sub: letterData.letter_title + " · Ref: " + letterData.reference_no,
    submitLabel: "Countersign & Accept Terms",
    values: { signature: letterData.employee_name || Store.user.name || "" },
    fields: [
      {
        name: "signature",
        label: "Type your full legal name as your electronic signature",
        required: true,
        full: true,
        placeholder: letterData.employee_name,
      },
    ],
    onSubmit: async (vals) => {
      const res = await API.post("/employees/" + letterData.employee_id + "/employment-letter/accept", vals);
      toast("Employment letter accepted and signed!", "success");
      if (onAccepted) await onAccepted(res.data);
    },
  });
};

/* ---------------- VIEW & PRINT EMPLOYMENT LETTER MODAL ---------------- */
window.openEmploymentLetterModal = async function (employeeId, onChanged) {
  try {
    const res = await API.get("/employees/" + employeeId + "/employment-letter");
    const d = res.data;
    const printUrl = "/api/v1/employees/" + employeeId + "/employment-letter/print?token=" + encodeURIComponent(API.token || "");

    openModal({
      title: d.letter_title,
      sub: d.employee_name + " (" + d.employee_no + ") · " + d.category_label + " · " + d.staff_category,
      wide: true,
      body: '<div class="stack">'
        + '<div class="row-between" style="background:var(--surface-2);padding:10px 14px;border-radius:10px;border:1px solid var(--line);flex-wrap:wrap;gap:10px">'
        + '  <div class="row" style="gap:8px;flex-wrap:wrap">'
        + '    <span class="chip teal">' + esc(d.category_label) + '</span>'
        + '    <span class="chip blue">' + esc(d.staff_category) + '</span>'
        +      (d.status === "accepted"
                ? '<span class="chip green">Signed by ' + esc(d.accepted_signature || d.employee_name) + '</span>'
                : '<span class="chip amber">Awaiting Employee Signature</span>')
        + '  </div>'
        + '  <div class="row" style="gap:6px;flex-wrap:wrap">'
        +      (d.can_customize ? '<button class="btn btn-sm btn-ghost" id="modal-letter-edit">' + icon("edit", 13) + ' Customize</button>' : '')
        +      (d.can_customize ? '<button class="btn btn-sm btn-soft" id="modal-letter-email">' + icon("send", 13) + ' Email Letter</button>' : '')
        +      (d.can_accept && d.status !== "accepted" ? '<button class="btn btn-sm btn-teal" id="modal-letter-sign">' + icon("check", 13) + ' Accept & Sign</button>' : '')
        + '    <a class="btn btn-sm btn-ghost" href="' + esc(printUrl) + '" target="_blank" rel="noopener">' + icon("externalLink", 13) + ' Print Tab</a>'
        + '    <button class="btn btn-sm btn-accent" id="modal-letter-print">' + icon("printer", 13) + ' Print / Save PDF</button>'
        + '  </div>'
        + '</div>'
        + '<div class="letter-preview-canvas">' + d.html + '</div>'
        + '</div>',
      footer: '<div class="row" style="width:100%;justify-content:space-between">'
        + '<span class="tiny muted mono">Ref: ' + esc(d.reference_no) + '</span>'
        + '<div class="row" style="gap:8px">'
        + '  <button class="btn btn-accent" id="modal-letter-print-foot">' + icon("printer", 14) + ' Print / Save as PDF</button>'
        + '  <button class="btn btn-ghost" data-close-modal>Close</button>'
        + '</div></div>',
    });

    const triggerPrint = () => printLetterHtml(d.html);
    const p1 = document.getElementById("modal-letter-print");
    const p2 = document.getElementById("modal-letter-print-foot");
    if (p1) p1.onclick = triggerPrint;
    if (p2) p2.onclick = triggerPrint;

    const editBtn = document.getElementById("modal-letter-edit");
    if (editBtn) editBtn.onclick = () => {
      closeModal();
      openLetterCustomizeModal(d, async () => {
        if (onChanged) await onChanged();
        openEmploymentLetterModal(employeeId, onChanged);
      });
    };

    const signBtn = document.getElementById("modal-letter-sign");
    if (signBtn) signBtn.onclick = () => {
      closeModal();
      openAcceptLetterModal(d, async () => {
        if (onChanged) await onChanged();
        openEmploymentLetterModal(employeeId, onChanged);
      });
    };

    const emailBtn = document.getElementById("modal-letter-email");
    if (emailBtn) emailBtn.onclick = async () => {
      try {
        const sent = await API.post("/employees/" + employeeId + "/employment-letter/send");
        toast("Employment letter dispatched to " + (sent.data.recipient || "employee") + " (" + sent.data.status + ")", "success");
        if (sent.data.delivery_id && sent.data.status === "simulated") {
          closeModal();
          openDeliveryPreviewModal(sent.data.delivery_id);
        }
      } catch (err) { handleErr(err); }
    };
  } catch (err) {
    handleErr(err);
  }
};

/* ============================================================================
   MAIN PAGE VIEW: #/employment-letters
============================================================================ */
const letterHubState = {
  tab: "register",
  category: "",
  staffCategory: "",
  selectedTemplateKey: "permanent",
  selectedDeptId: null,
};

Views["employment-letters"] = async function (root) {
  if (Store.user && Store.user.must_change_password && Store.user.employee_id && !letterHubState._userSwitchedTab) {
    letterHubState.tab = "my_letter";
  }
  const isEmployeeOnly = Store.user && Store.user.role_slug === "employee";

  /* --------- EMPLOYEE SELF-SERVICE VIEW: DIRECT MY LETTER + PRINT --------- */
  if (isEmployeeOnly) {
    if (!Store.user.employee_id) {
      root.innerHTML = pageHead("My Employment Letter", "Official appointment record", "", "Self-Service")
        + emptyState("No employee record linked", "Please contact Human Resources to link your employee profile.", "file");
      return;
    }
    root.innerHTML = pageHead("My Employment Letter", "Loading your official appointment letter…", "", "Self-Service") + spinners(3);
    try {
      const res = await API.get("/employees/" + Store.user.employee_id + "/employment-letter");
      const d = res.data;
      const printUrl = "/api/v1/employees/" + d.employee_id + "/employment-letter/print?token=" + encodeURIComponent(API.token || "");

      const actions = '<div class="row" style="gap:8px;flex-wrap:wrap">'
        + (d.status !== "accepted"
            ? '<button class="btn btn-teal" id="ess-sign-letter">' + icon("check", 14) + ' Accept & Sign Letter</button>'
            : '')
        + '<a class="btn btn-ghost" href="' + esc(printUrl) + '" target="_blank" rel="noopener">' + icon("externalLink", 14) + ' Open Print Page</a>'
        + '<button class="btn btn-accent" id="ess-print-letter">' + icon("printer", 14) + ' Print / Save as PDF</button>'
        + '</div>';

      root.innerHTML = pageHead(
          "My Employment Letter",
          d.category_label + " · " + d.staff_category + " · Ref: " + d.reference_no,
          actions,
          "Core HR"
        )
        + '<div class="card card-pad" style="margin-bottom:18px">'
        + '  <div class="row-between" style="flex-wrap:wrap;gap:12px">'
        + '    <div class="row" style="gap:10px;flex-wrap:wrap">'
        + '      <span class="chip teal">' + esc(d.category_label) + '</span>'
        + '      <span class="chip blue">' + esc(d.staff_category) + '</span>'
        + '      <span class="chip grey">Effective ' + fmtDate(d.effective_date) + '</span>'
        +        (d.end_date ? '<span class="chip amber">Ends ' + fmtDate(d.end_date) + '</span>' : '')
        + '    </div>'
        + '    <div>'
        +        (d.status === "accepted"
                  ? '<span class="chip green">Accepted & Signed by ' + esc(d.accepted_signature) + ' on ' + fmtDate(d.accepted_at) + '</span>'
                  : '<span class="chip amber">Pending Your Digital Signature</span>')
        + '    </div>'
        + '  </div>'
        + '</div>'
        + '<div class="letter-preview-canvas">' + d.html + '</div>';

      root.querySelector("#ess-print-letter").onclick = () => printLetterHtml(d.html);
      const signBtn = root.querySelector("#ess-sign-letter");
      if (signBtn) signBtn.onclick = () => openAcceptLetterModal(d, () => Views["employment-letters"](root));
    } catch (err) {
      root.innerHTML = pageHead("My Employment Letter", "Error") + emptyState("Unable to load letter", err.message, "alert");
    }
    return;
  }

  /* --------- HR / ADMIN / MANAGER VIEW: DIRECTORY + TEMPLATES --------- */
  root.innerHTML = pageHead("Employment Letters & Credentials", "Loading appointment letters & portal accounts…", "", "Core HR") + spinners(4);
  try {
    const [listRes, tplRes, deptTplRes] = await Promise.all([
      API.get("/employment-letters"),
      API.get("/employment-letters/templates"),
      API.get("/employment-letters/department-templates").catch(() => ({ data: { data: [], placeholders: [] } })),
    ]);
    const allRows = listRes.data || [];
    const categories = listRes.categories || [];
    const summaryByCat = listRes.summary_by_category || {};
    const templates = tplRes.data || [];
    const rawDeptTpl = deptTplRes || {};
    let deptList = [];
    if (Array.isArray(rawDeptTpl.data)) {
      deptList = rawDeptTpl.data;
    } else if (Array.isArray(rawDeptTpl.departments)) {
      deptList = rawDeptTpl.departments;
    } else if (rawDeptTpl.data && Array.isArray(rawDeptTpl.data.departments)) {
      deptList = rawDeptTpl.data.departments;
    } else if (rawDeptTpl.data && Array.isArray(rawDeptTpl.data.data)) {
      deptList = rawDeptTpl.data.data;
    }

    // Fallback to Store.meta.departments if backend response had 0 departments
    if (!deptList.length && Store.meta && Array.isArray(Store.meta.departments) && Store.meta.departments.length) {
      deptList = Store.meta.departments.map(d => ({
        department_id: d.id,
        department_name: d.name,
        department_code: d.code || "",
        employee_count: 0,
        is_custom: false,
        template: {
          department_id: d.id,
          department_name: d.name,
          department_code: d.code || "",
          letter_title: "OFFER OF APPOINTMENT — " + d.name.toUpperCase(),
          subject_line: "OFFER OF APPOINTMENT — {{designation}} (" + d.name.toUpperCase() + " DEPARTMENT)",
          working_hours: "40 hours per week (shift schedule or duty roster as assigned)",
          notice_period: "One (1) calendar month written notice (or salary in lieu thereof)",
          probation_months: 3,
          opening: "Management is pleased to offer you appointment with {{company_legal_name}} in the " + d.name + " Department.",
          sections: [],
          extra_clause: "",
          closing: "Kindly confirm your acceptance by signing and returning a copy of this letter.",
        }
      }));
    }

    const placeholders = rawDeptTpl.placeholders
      || rawDeptTpl.available_placeholders
      || (rawDeptTpl.data && rawDeptTpl.data.placeholders)
      || (rawDeptTpl.data && rawDeptTpl.data.available_placeholders)
      || [
        { tag: "{{employee_name}}", label: "Full Name" },
        { tag: "{{salary}}", label: "Basic Salary" },
        { tag: "{{basic_salary}}", label: "Basic Salary (Exact)" },
        { tag: "{{gross_salary}}", label: "Gross Salary" },
        { tag: "{{department}}", label: "Department" },
        { tag: "{{designation}}", label: "Job Title" },
        { tag: "{{staff_category}}", label: "Category" },
        { tag: "{{hire_date}}", label: "Start Date" },
        { tag: "{{manager_name}}", label: "HOD / Manager" },
        { tag: "{{working_hours}}", label: "Hours" },
        { tag: "{{notice_period}}", label: "Notice" },
        { tag: "{{leave_days}}", label: "Annual Leave" },
        { tag: "{{company_legal_name}}", label: "Employer Legal Name" },
        { tag: "{{issue_date}}", label: "Issue Date" },
        { tag: "{{reference_no}}", label: "Ref #" },
      ];
    const canManage = Store.canManage();

    const filteredRows = letterHubState.category
      ? allRows.filter(r => r.category_key === letterHubState.category)
      : allRows;

    const acceptedCount = allRows.filter(r => r.status === "accepted").length;
    const missingAccounts = allRows.filter(r => !r.has_account).length;

    const headerActions = '<div class="row" style="gap:8px;flex-wrap:wrap">'
      + (Store.user && Store.user.employee_id
          ? '<button class="btn btn-ghost" id="btn-my-own-letter">' + icon("file", 14) + ' My Letter</button>'
          : '')
      + (canManage
          ? '<button class="btn btn-teal" id="btn-header-upload-doc">' + icon("upload", 14) + ' Upload Word / PDF Template</button>'
          : '')
      + (canManage && missingAccounts > 0
          ? '<button class="btn btn-soft" id="btn-bulk-provision">' + icon("send", 14) + ' Email Missing Accounts (' + missingAccounts + ')</button>'
          : '')
      + (canManage
          ? '<button class="btn btn-accent" onclick="go(\'employees\')">' + icon("plus", 14) + ' Onboard Employee</button>'
          : '')
      + '</div>';

    const catPills = '<div class="filter-chips" style="margin-bottom:16px">'
      + '<button class="filter-chip ' + (!letterHubState.category ? "active" : "") + '" data-lcat="">All Categories (' + allRows.length + ')</button>'
      + categories.map(c =>
          '<button class="filter-chip ' + (letterHubState.category === c.key ? "active" : "") + '" data-lcat="' + esc(c.key) + '">'
          + esc(c.label) + ' (' + (summaryByCat[c.key] || 0) + ')</button>'
        ).join("")
      + '</div>';

    let bodyHtml = "";
    if (letterHubState.tab === "my_letter" && Store.user && Store.user.employee_id) {
      try {
        const myRes = await API.get("/employees/" + Store.user.employee_id + "/employment-letter");
        const d = myRes.data;
        const printUrl = "/api/v1/employees/" + d.employee_id + "/employment-letter/print?token=" + encodeURIComponent(API.token || "");
        bodyHtml = '<div class="card card-pad" style="margin-bottom:18px">'
          + '  <div class="row-between" style="flex-wrap:wrap;gap:12px">'
          + '    <div class="row" style="gap:10px;flex-wrap:wrap">'
          + '      <span class="chip teal">' + esc(d.category_label) + '</span>'
          + '      <span class="chip blue">' + esc(d.staff_category) + '</span>'
          + '      <span class="chip grey">Effective ' + fmtDate(d.effective_date) + '</span>'
          +        (d.end_date ? '<span class="chip amber">Ends ' + fmtDate(d.end_date) + '</span>' : '')
          + '    </div>'
          + '    <div class="row" style="gap:8px;flex-wrap:wrap">'
          +        (d.status !== "accepted"
                    ? '<button class="btn btn-teal" id="tab-sign-letter">' + icon("check", 14) + ' Accept & Sign Letter</button>'
                    : '<span class="chip green">Accepted & Signed by ' + esc(d.accepted_signature) + ' on ' + fmtDate(d.accepted_at) + '</span>')
          + '      <a class="btn btn-ghost" href="' + esc(printUrl) + '" target="_blank" rel="noopener">' + icon("externalLink", 14) + ' Open Print Page</a>'
          + '      <button class="btn btn-accent" id="tab-print-letter">' + icon("printer", 14) + ' Print / Save as PDF</button>'
          + '    </div>'
          + '  </div>'
          + '</div>'
          + '<div class="letter-preview-canvas">' + d.html + '</div>';
      } catch (err) {
        bodyHtml = emptyState("Unable to load personal letter", err.message, "alert");
      }
    } else if (letterHubState.tab === "register") {
      bodyHtml = catPills + renderTable({
        id: "employment-letters-table",
        title: "Employee Appointment Letters & Portal Login Status",
        sub: "Each employee automatically receives a category-specific letter and portal credentials at their registered email.",
        exportName: "employment-letters-register",
        filters: [
          { key: "category_label", label: "Employment Category" },
          { key: "staff_category", label: "Staff Cadre" },
          { key: "department_name", label: "Department" },
          { key: "status", label: "Signature Status" },
        ],
        columns: [
          {
            label: "Employee",
            sortKey: "employee_name",
            render: r => personCell({ name: r.employee_name, photo_url: r.photo_url }, (r.username ? "@" + r.username + " · " : "") + (r.email || r.employee_no)),
          },
          {
            label: "Employment Category",
            key: "category_label",
            render: r => '<span class="chip teal">' + esc(r.category_label) + '</span><div class="tiny muted" style="margin-top:3px">' + esc(r.staff_category || "") + '</div>',
          },
          {
            label: "Position & Dept",
            key: "designation_title",
            render: r => {
              const deptObj = deptList.find(d => (d.department_id || d.id) === r.department_id);
              const isDeptCustom = deptObj && (deptObj.is_custom || deptObj.has_custom_template);
              return '<b>' + esc(r.designation_title) + '</b><div class="tiny muted" style="display:flex;align-items:center;gap:4px">'
                + esc(r.department_name)
                + (isDeptCustom ? ' <span class="chip-sm green" title="Custom department appointment letter active" style="font-size:9px;padding:1px 5px">Dept Tpl</span>' : '')
                + '</div>';
            },
          },
          {
            label: "Reference & Dates",
            key: "reference_no",
            render: r => '<span class="mono tiny">' + esc(r.reference_no) + '</span><div class="tiny muted">Start ' + fmtDate(r.effective_date) + (r.end_date ? " → " + fmtDate(r.end_date) : "") + '</div>',
          },
          {
            label: "Letter Status",
            key: "status",
            render: r => r.status === "accepted"
              ? '<span class="chip green">Signed</span>'
              : '<span class="chip amber">Issued</span>',
          },
          {
            label: "Actions",
            class: "right",
            sortable: false,
            render: r => '<div class="row" style="justify-content:flex-end;gap:5px;flex-wrap:wrap">'
              + '<button class="btn btn-sm btn-accent" data-view-letter="' + r.employee_id + '">' + icon("printer", 12) + ' View / Print</button>'
              + (canManage ? '<button class="btn btn-sm btn-ghost" data-email-creds="' + r.employee_id + '" title="Send or reset portal username & password">' + icon("key", 12) + ' Credentials</button>' : '')
              + '</div>',
          },
        ],
        rows: filteredRows,
        onRowClick: (row) => openEmploymentLetterModal(row.employee_id, () => Views["employment-letters"](root)),
        emptyTitle: "No employment letters in this category",
        emptyText: "Select another category pill or add an employee in this employment category.",
      });
    } else if (letterHubState.tab === "dept_templates") {
      if (!deptList.length) {
        bodyHtml = emptyState("No departments found", "Create departments in the Organisation section first before configuring department-specific templates.", "building", canManage ? '<button class="btn btn-accent" onclick="go(&quot;organisation/departments&quot;)">' + icon("plus", 14) + ' Go to Organisation</button>' : "");
      } else {
        if (!letterHubState.selectedDeptId || !deptList.find(d => (d.department_id || d.id) === letterHubState.selectedDeptId)) {
          letterHubState.selectedDeptId = deptList[0].department_id || deptList[0].id;
        }
        const curDept = deptList.find(d => (d.department_id || d.id) === letterHubState.selectedDeptId) || deptList[0];
        const curDeptId = curDept.department_id || curDept.id;
        const curDeptName = curDept.department_name || curDept.name;
        const curTpl = curDept.template || {};
        const isCustom = Boolean(curDept.is_custom || curDept.has_custom_template);

        bodyHtml = '<div class="grid grid-3" style="align-items:start">'
          + '<div class="card">'
          + '  <div class="card-head"><div><h3>Departments (' + deptList.length + ')</h3><div class="sub">Select department to tailor appointment letter</div></div></div>'
          + '  <div class="card-body stack" style="gap:8px">'
          + (deptList.length > 5
              ? '    <input class="input input-sm" id="dept-search-input" placeholder="Search departments…">'
              : '')
          + '    <div class="stack" style="gap:6px" id="dept-list-container">'
          + deptList.map(d => {
              const dId = d.department_id || d.id;
              const dName = d.department_name || d.name;
              const dCode = d.department_code || d.code || "";
              const activeClass = (dId === curDeptId) ? "active" : "";
              const customBadge = (d.is_custom || d.has_custom_template)
                ? '<span class="chip green" style="font-size:10px">Custom</span>'
                : '<span class="chip grey" style="font-size:10px">Default</span>';
              return '<button type="button" class="tpl-pick-btn ' + activeClass + '" data-pick-dept="' + dId + '">'
                + '<div><b>' + esc(dName) + '</b><div class="tiny muted">' + esc(dCode || "No code") + ' · ' + (d.employee_count || 0) + ' staff</div></div>'
                + customBadge
                + '</button>';
            }).join("")
          + '    </div>'
          + '  </div>'
          + '</div>'

          + '<div class="card span-2">'
          + '  <div class="card-head" style="align-items:flex-start">'
          + '    <div>'
          + '      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">'
          + '        <h3 style="margin:0">' + esc(curDeptName) + ' Appointment Letter</h3>'
          + (isCustom
              ? '<span class="chip green">' + icon("check", 12) + ' Custom Template Active</span>'
              : '<span class="chip grey">Inheriting Global Defaults</span>')
          + '      </div>'
          + '      <div class="sub" style="margin-top:4px">Upload a Word/PDF contract or edit clauses with dynamic placeholders like <span class="mono">{{salary}}</span>, <span class="mono">{{employee_name}}</span>, <span class="mono">{{department}}</span>.</div>'
          + '    </div>'
          + '    <div class="row" style="gap:6px;flex-wrap:wrap">'
          + (isCustom && canManage
              ? '<button type="button" class="btn btn-sm btn-ghost text-danger" id="btn-reset-dept-tpl" title="Revert to baseline default template">' + icon("refresh", 13) + ' Reset to Default</button>'
              : '')
          + '      <button type="button" class="btn btn-sm btn-soft" id="btn-preview-dept-tpl">' + icon("eye", 13) + ' Test & Preview</button>'
          + '    </div>'
          + '  </div>'

          + '  <div class="card-body stack" style="gap:16px">'
          + '    <div class="card card-pad" id="dept-tpl-dropzone" style="border:2px dashed var(--accent);background:var(--surface-2);border-radius:10px;padding:16px 20px;transition:all .2s ease">'
          + '      <div class="row-between" style="flex-wrap:wrap;gap:12px;align-items:center">'
          + '        <div style="max-width:540px">'
          + '          <div style="font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:8px">'
          + '            <div class="kpi-icon teal" style="width:34px;height:34px">' + icon("upload", 16) + '</div>'
          + '            <div>'
          + '              Upload Word (.docx / .doc) or PDF Contract for ' + esc(curDeptName)
          + '              <div class="tiny muted" style="font-weight:normal;margin-top:2px">'
          + '                Upload an existing appointment letter. Headings, clauses, salary, employee name, department and designation are automatically converted into dynamic template tags and editable fields.'
          + '              </div>'
          + '            </div>'
          + '          </div>'
          + '          <div class="row" style="gap:6px;margin-top:8px">'
          + '            <span class="pill-tag" style="font-size:10.5px">.DOCX</span>'
          + '            <span class="pill-tag" style="font-size:10.5px">.PDF</span>'
          + '            <span class="pill-tag" style="font-size:10.5px">.DOC</span>'
          + '            <span class="pill-tag" style="font-size:10.5px">.TXT</span>'
          + '            <span class="tiny muted" style="margin-left:4px">Drag and drop file here or click choose</span>'
          + '          </div>'
          + '        </div>'
          + '        <div>'
          + '          <input type="file" id="dept-tpl-doc-input" accept=".docx,.doc,.pdf,.txt" style="display:none">'
          + '          <button type="button" class="btn btn-teal" id="dept-tpl-upload-btn" style="padding:9px 18px;font-weight:600">' + icon("upload", 15) + ' Choose Contract File</button>'
          + '        </div>'
          + '      </div>'
          + '      <div id="dept-tpl-upload-feedback" style="display:none;margin-top:12px"></div>'
          + '    </div>'

          + '    <div class="card card-pad" style="background:var(--surface);border:1px solid var(--line);border-radius:10px">'
          + '      <div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:8px">'
          + '        <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px">'
          +            icon("sparkle", 14) + ' Dynamic Placeholders (Click to insert into focused field)'
          + '        </div>'
          + '        <span class="tiny muted">Values are dynamically populated when printing or generating letters</span>'
          + '      </div>'
          + '      <div class="row" style="gap:6px;flex-wrap:wrap" id="dept-placeholder-chips">'
          +          placeholders.map(p =>
                       '<button type="button" class="btn btn-xs btn-ghost placeholder-tag-btn" style="border:1px solid var(--line);font-family:monospace;font-size:11px" data-insert-tag="' + esc(p.tag) + '" title="' + esc(p.desc || p.label) + '">'
                       + '<span style="color:var(--accent);font-weight:600">' + esc(p.tag) + '</span>'
                       + '<span class="muted" style="font-size:10px;font-family:inherit;margin-left:4px">' + esc(p.label) + '</span>'
                       + '</button>'
                     ).join("")
          + '      </div>'
          + '    </div>'

          + '    <form id="dept-tpl-form" class="stack" style="gap:16px">'
          + '      <div class="form-grid">'
          + '        <div class="field full">'
          + '          <label>Official Document Title / Heading</label>'
          + '          <input class="input" name="letter_title" value="' + esc(curTpl.letter_title || ("OFFER OF APPOINTMENT — " + curDeptName.toUpperCase())) + '" placeholder="OFFER OF APPOINTMENT">'
          + '        </div>'
          + '        <div class="field full">'
          + '          <label>Default Subject Line</label>'
          + '          <input class="input" name="subject_line" value="' + esc(curTpl.subject_line || ("APPOINTMENT AS {{designation}} — " + curDeptName.toUpperCase() + " DEPARTMENT")) + '" placeholder="APPOINTMENT AS {{designation}} — {{department}}">'
          + '        </div>'
          + '        <div class="field">'
          + '          <label>Standard Working Hours / Shift Schedule</label>'
          + '          <input class="input" name="working_hours" value="' + esc(curTpl.working_hours || "40 hours per week (operational shifts as scheduled by Department Supervisor)") + '">'
          + '        </div>'
          + '        <div class="field">'
          + '          <label>Termination Notice Clause</label>'
          + '          <input class="input" name="notice_period" value="' + esc(curTpl.notice_period || "One (1) calendar month written notice (or salary in lieu thereof)") + '">'
          + '        </div>'
          + '        <div class="field full">'
          + '          <label>Opening Appointment Paragraph</label>'
          + '          <textarea class="textarea" rows="3" name="opening">' + esc(curTpl.opening || ("Management of {{company_legal_name}} is pleased to offer you an appointment as {{designation}} in our " + curDeptName + " Department effective {{hire_date}}.")) + '</textarea>'
          + '        </div>'
          + '      </div>'

          + '      <div class="card card-pad" style="background:var(--surface-2);border-radius:10px">'
          + '        <div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">'
          + '          <div>'
          + '            <div style="font-weight:600;font-size:14px">Contract Sections & Department Clauses</div>'
          + '            <div class="tiny muted">Specific duties, compensation, schedule, and standards for ' + esc(curDeptName) + '.</div>'
          + '          </div>'
          + '          <button type="button" class="btn btn-sm btn-ghost" id="btn-add-section">' + icon("plus", 13) + ' Add Clause</button>'
          + '        </div>'
          + '        <div id="dept-sections-container" class="stack" style="gap:10px"></div>'
          + '      </div>'

          + '      <div class="form-grid">'
          + '        <div class="field full">'
          + '          <label>Department-Specific Special Terms / Uniform / Duty Meals / Allowance Clause (Optional)</label>'
          + '          <textarea class="textarea" rows="2" name="extra_clause" placeholder="e.g. Duty meals, uniform laundering, night audit allowance, tools provision, or service charge policy…">' + esc(curTpl.extra_clause || "") + '</textarea>'
          + '        </div>'
          + '        <div class="field full">'
          + '          <label>Closing Acceptance Paragraph</label>'
          + '          <textarea class="textarea" rows="2" name="closing">' + esc(curTpl.closing || "Kindly confirm your acceptance of the terms and conditions of this appointment by signing the duplicate copy below.") + '</textarea>'
          + '        </div>'
          + '      </div>'

          + '      <div class="row-between" style="flex-wrap:wrap;gap:10px;margin-top:8px">'
          + '        <button type="button" class="btn btn-soft" id="btn-preview-bottom">' + icon("eye", 14) + ' Test & Preview Letter</button>'
          + (canManage
              ? '        <button type="submit" class="btn btn-accent" id="btn-save-dept-tpl">' + icon("check", 14) + ' Save ' + esc(curDeptName) + ' Template</button>'
              : '')
          + '      </div>'
          + '    </form>'
          + '  </div>'
          + '</div></div>';
      }
    } else {
      const curTpl = templates.find(t => t.key === letterHubState.selectedTemplateKey) || templates[0] || {};
      bodyHtml = '<div class="grid grid-3" style="align-items:start">'
        + '<div class="card"><div class="card-head"><div><h3>8 Employment Categories</h3><div class="sub">Select a category template to inspect or customize</div></div></div>'
        + '<div class="card-body stack" style="gap:6px">'
        + templates.map(t =>
            '<button type="button" class="tpl-pick-btn ' + (t.key === curTpl.key ? "active" : "") + '" data-pick-tpl="' + esc(t.key) + '">'
            + '<div><b>' + esc(t.label) + '</b><div class="tiny muted">' + esc(t.letter_title) + '</div></div>'
            + '<span class="chip grey" style="font-size:10px">' + (summaryByCat[t.key] || 0) + '</span>'
            + '</button>'
          ).join("")
        + '</div></div>'

        + '<div class="card span-2"><div class="card-head">'
        + '<div><h3>' + esc(curTpl.label || "") + ' Template</h3><div class="sub">Placeholders supported: <span class="mono">{{employee_name}}</span>, <span class="mono">{{designation}}</span>, <span class="mono">{{department}}</span>, <span class="mono">{{staff_category}}</span>, <span class="mono">{{basic_salary}}</span>, <span class="mono">{{hire_date}}</span>, <span class="mono">{{end_date}}</span></div></div>'
        + '</div>'
        + '<div class="card-body stack" style="gap:14px;padding-bottom:0">'
        + '  <div class="card card-pad" id="cat-tpl-dropzone" style="border:2px dashed var(--accent);background:var(--surface-2);border-radius:10px;padding:14px 18px">'
        + '    <div class="row-between" style="flex-wrap:wrap;gap:12px;align-items:center">'
        + '      <div style="max-width:520px">'
        + '        <div style="font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px">'
        +            icon("upload", 16) + ' Upload Word (.docx / .doc) or PDF Contract for ' + esc(curTpl.label)
        + '        </div>'
        + '        <div class="tiny muted" style="margin-top:2px">'
        + '          Extracts contract text and populates category fields with dynamic variables (salary, employee name, department, designation).'
        + '        </div>'
        + '      </div>'
        + '      <div>'
        + '        <input type="file" id="cat-tpl-doc-input" accept=".docx,.doc,.pdf,.txt" style="display:none">'
        + '        <button type="button" class="btn btn-teal btn-sm" id="cat-tpl-upload-btn">' + icon("upload", 14) + ' Browse File</button>'
        + '      </div>'
        + '    </div>'
        + '    <div id="cat-tpl-upload-feedback" style="display:none;margin-top:10px"></div>'
        + '  </div>'
        + '</div>'
        + '<form id="tpl-save-form" class="card-body stack">'
        + '  <div class="form-grid">'
        + '    <div class="field"><label>Category Display Label</label><input class="input" name="label" value="' + esc(curTpl.label || "") + '"></div>'
        + '    <div class="field"><label>Header Badge Text</label><input class="input" name="badge" value="' + esc(curTpl.badge || "") + '"></div>'
        + '    <div class="field full"><label>Official Document Heading</label><input class="input" name="letter_title" value="' + esc(curTpl.letter_title || "") + '"></div>'
        + '    <div class="field full"><label>Default Subject Line</label><input class="input" name="subject_line" value="' + esc(curTpl.subject_line || "") + '"></div>'
        + '    <div class="field"><label>Standard Working Hours</label><input class="input" name="working_hours" value="' + esc(curTpl.working_hours || "") + '"></div>'
        + '    <div class="field"><label>Default Termination Notice Period</label><input class="input" name="notice_period" value="' + esc(curTpl.notice_period || "") + '"></div>'
        + '    <div class="field full"><label>Opening Appointment Paragraph</label><textarea class="textarea" rows="3" name="opening">' + esc(curTpl.opening || "") + '</textarea></div>'
        + '    <div class="field full"><label>Additional Organization Clause (Optional — appended automatically to this category)</label><textarea class="textarea" rows="3" name="extra_clause" placeholder="Add category-wide benefits, uniform rules, shift meal policy, or NDA clause…">' + esc(curTpl.extra_clause || "") + '</textarea></div>'
        + '    <div class="field full"><label>Closing Acceptance Paragraph</label><textarea class="textarea" rows="2" name="closing">' + esc(curTpl.closing || "") + '</textarea></div>'
        + '  </div>'
        + '  <div class="channel-box"><div class="tiny muted" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em">Built-in Statutory Clauses for ' + esc(curTpl.label || "") + '</div>'
        +      (curTpl.sections || []).map(s => '<div style="margin-bottom:6px"><b class="small">' + esc(s[0]) + '</b><div class="tiny muted">' + esc(s[1]) + '</div></div>').join("")
        + '  </div>'
        + (Store.isAdmin()
            ? '<div class="row" style="justify-content:flex-end"><button class="btn btn-accent" type="submit">' + icon("check", 14) + ' Save ' + esc(curTpl.label) + ' Template</button></div>'
            : '')
        + '</form></div></div>';
    }

    root.innerHTML = pageHead(
        "Employment Letters & Credentials",
        "Category-tailored appointment contracts, digital acceptance signatures, and one-click portal login emails.",
        headerActions,
        "Core HR"
      )
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Issued Letters", value: allRows.length, icon: "file", tone: "teal", foot: "Across all active categories" })
      + kpiCard({ label: "Permanent & Probation", value: (summaryByCat.permanent || 0) + (summaryByCat.probation || 0), icon: "users", tone: "accent", foot: (summaryByCat.probation || 0) + " probationary" })
      + kpiCard({ label: "Contract / Intern / NSS", value: (summaryByCat.fixed_term || 0) + (summaryByCat.part_time || 0) + (summaryByCat.casual || 0) + (summaryByCat.intern || 0) + (summaryByCat.national_service || 0) + (summaryByCat.consultant || 0), icon: "briefcase", tone: "blue", foot: "Fixed-term, casual, intern & NSS" })
      + kpiCard({ label: "Accepted & Signed", value: acceptedCount + " / " + allRows.length, icon: "checkCircle", tone: "purple", foot: (allRows.length - missingAccounts) + " portal logins active" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">'
      + (Store.user && Store.user.employee_id
          ? '  <button class="tab ' + (letterHubState.tab === "my_letter" ? "active" : "") + '" data-ltab="my_letter">' + icon("file", 14) + ' My Appointment Letter</button>'
          : '')
      + '  <button class="tab ' + (letterHubState.tab === "register" ? "active" : "") + '" data-ltab="register">Employee Letters & Credentials (' + allRows.length + ')</button>'
      + '  <button class="tab ' + (letterHubState.tab === "dept_templates" ? "active" : "") + '" data-ltab="dept_templates">' + icon("briefcase", 14) + ' Department Templates (' + deptList.length + ')</button>'
      + '  <button class="tab ' + (letterHubState.tab === "templates" ? "active" : "") + '" data-ltab="templates">Category Templates (' + templates.length + ')</button>'
      + '</div>'
      + bodyHtml;

    root.querySelectorAll("[data-ltab]").forEach(b => b.onclick = () => {
      letterHubState.tab = b.dataset.ltab;
      letterHubState._userSwitchedTab = true;
      Views["employment-letters"](root);
    });
    const tabPrint = root.querySelector("#tab-print-letter");
    if (tabPrint) tabPrint.onclick = () => {
      const canvas = root.querySelector(".letter-preview-canvas");
      if (canvas) printLetterHtml(canvas.innerHTML);
    };
    const tabSign = root.querySelector("#tab-sign-letter");
    if (tabSign) tabSign.onclick = () => openAcceptLetterModal({ employee_id: Store.user.employee_id }, () => Views["employment-letters"](root));
    root.querySelectorAll("[data-lcat]").forEach(b => b.onclick = () => {
      letterHubState.category = b.dataset.lcat;
      Views["employment-letters"](root);
    });
    const myOwnBtn = root.querySelector("#btn-my-own-letter");
    if (myOwnBtn) myOwnBtn.onclick = () => openEmploymentLetterModal(Store.user.employee_id, () => Views["employment-letters"](root));

    const headerUploadBtn = root.querySelector("#btn-header-upload-doc");
    if (headerUploadBtn) {
      headerUploadBtn.onclick = () => {
        letterHubState.tab = "dept_templates";
        letterHubState._userSwitchedTab = true;
        Views["employment-letters"](root);
        setTimeout(() => {
          const di = root.querySelector("#dept-tpl-doc-input");
          if (di) di.click();
        }, 150);
      };
    }

    const bulkBtn = root.querySelector("#btn-bulk-provision");
    if (bulkBtn) bulkBtn.onclick = async () => {
      try {
        const res = await API.post("/employees/send-credentials-bulk", { only_missing_accounts: true });
        toast("Provisioned & emailed " + res.data.sent + " employee account(s)", "success");
        Views["employment-letters"](root);
      } catch (err) { handleErr(err); }
    };

    onDelegate(root, "click", "[data-view-letter]", (b, ev) => {
      ev.stopPropagation();
      openEmploymentLetterModal(Number(b.dataset.viewLetter), () => Views["employment-letters"](root));
    });
    onDelegate(root, "click", "[data-email-creds]", (b, ev) => {
      ev.stopPropagation();
      const row = allRows.find(x => Number(x.employee_id) === Number(b.dataset.emailCreds));
      if (row) openSendCredentialsModal({ id: row.employee_id, ...row }, () => Views["employment-letters"](root));
    });

    root.querySelectorAll("[data-pick-tpl]").forEach(b => b.onclick = () => {
      letterHubState.selectedTemplateKey = b.dataset.pickTpl;
      Views["employment-letters"](root);
    });

    const catDocInput = root.querySelector("#cat-tpl-doc-input");
    const catUploadBtn = root.querySelector("#cat-tpl-upload-btn");
    const catFeedbackEl = root.querySelector("#cat-tpl-upload-feedback");
    const catDropzone = root.querySelector("#cat-tpl-dropzone");

    if (catDropzone && catDocInput) {
      ['dragenter', 'dragover'].forEach(name => {
        catDropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          catDropzone.style.borderColor = 'var(--accent)';
          catDropzone.style.background = 'var(--surface-3, var(--surface))';
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        catDropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          catDropzone.style.borderColor = 'var(--accent)';
          catDropzone.style.background = 'var(--surface-2)';
        });
      });
      catDropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) {
          catDocInput.files = dt.files;
          catDocInput.dispatchEvent(new Event('change'));
        }
      });
    }

    if (catUploadBtn && catDocInput) {
      catUploadBtn.onclick = () => catDocInput.click();
      catDocInput.onchange = async () => {
        if (!catDocInput.files || !catDocInput.files[0]) return;
        const file = catDocInput.files[0];
        const fd = new FormData();
        fd.append("file", file);

        catFeedbackEl.style.display = "block";
        catFeedbackEl.innerHTML = '<div class="callout-banner amber" style="padding:10px 14px;border-radius:8px">' + spinners(1) + ' Converting <b>' + esc(file.name) + '</b>…</div>';
        try {
          const res = await API.upload("/employment-letters/parse-document", fd);
          const parsed = (res && res.data) ? res.data : (res || {});
          if (parsed.letter_title) {
            const inp = root.querySelector('#tpl-save-form [name="letter_title"]');
            if (inp) inp.value = parsed.letter_title;
          }
          if (parsed.subject_line) {
            const inp = root.querySelector('#tpl-save-form [name="subject_line"]');
            if (inp) inp.value = parsed.subject_line;
          }
          if (parsed.working_hours) {
            const inp = root.querySelector('#tpl-save-form [name="working_hours"]');
            if (inp) inp.value = parsed.working_hours;
          }
          if (parsed.notice_period) {
            const inp = root.querySelector('#tpl-save-form [name="notice_period"]');
            if (inp) inp.value = parsed.notice_period;
          }
          if (parsed.opening) {
            const inp = root.querySelector('#tpl-save-form [name="opening"]');
            if (inp) inp.value = parsed.opening;
          }
          if (parsed.closing) {
            const inp = root.querySelector('#tpl-save-form [name="closing"]');
            if (inp) inp.value = parsed.closing;
          }
          if (parsed.extra_clause) {
            const inp = root.querySelector('#tpl-save-form [name="extra_clause"]');
            if (inp) inp.value = parsed.extra_clause;
          }
          catFeedbackEl.innerHTML = '<div class="callout-banner green" style="padding:10px 14px;border-radius:8px"><b>Document Parsed!</b> Form fields populated from <i>' + esc(file.name) + '</i>. Click "Save Template" below to apply.</div>';
          toast("Document parsed into category template", "success");
        } catch (err) {
          catFeedbackEl.innerHTML = '<div class="callout-banner red" style="padding:10px 14px;border-radius:8px"><b>Error:</b> ' + esc(err.message) + '</div>';
          toast(err.message, "error");
        } finally {
          catDocInput.value = "";
        }
      };
    }

    const tplForm = root.querySelector("#tpl-save-form");
    if (tplForm) tplForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(tplForm);
      const payload = {};
      for (const [k, v] of fd.entries()) payload[k] = v;
      try {
        await API.put("/employment-letters/templates/" + letterHubState.selectedTemplateKey, payload);
        toast("Saved category template", "success");
        Views["employment-letters"](root);
      } catch (err) { handleErr(err); }
    };

    /* ---------------- DEPARTMENT TEMPLATES TAB INTERACTIONS ---------------- */
    if (letterHubState.tab === "dept_templates" && deptList.length) {
      const curDept = deptList.find(d => (d.department_id || d.id) === letterHubState.selectedDeptId) || deptList[0];
      const curDeptId = curDept.department_id || curDept.id;
      const curDeptName = curDept.department_name || curDept.name;
      const curTpl = curDept.template || {};

      let lastFocusedInput = null;
      root.querySelectorAll("#dept-tpl-form input, #dept-tpl-form textarea").forEach(el => {
        el.addEventListener("focus", () => { lastFocusedInput = el; });
      });

      function createSectionRowElement(heading, body) {
        const row = document.createElement("div");
        row.className = "section-row card card-pad";
        row.style.cssText = "border:1px solid var(--line);background:var(--surface);padding:10px;border-radius:8px";
        row.innerHTML = '<div class="row-between" style="margin-bottom:6px;gap:8px">'
          + '  <input class="input input-sm section-heading" style="font-weight:600;flex:1" placeholder="Clause heading (e.g. 1. Duties & Reporting Line)" value="' + esc(heading || "") + '">'
          + '  <button type="button" class="btn btn-xs btn-ghost text-danger btn-remove-section" title="Remove clause">' + icon("trash", 13) + '</button>'
          + '</div>'
          + '<textarea class="textarea section-body" rows="3" placeholder="Clause body text with dynamic placeholders (e.g. Your monthly basic salary shall be {{salary}}...)">' + esc(body || "") + '</textarea>';

        row.querySelector(".btn-remove-section").onclick = () => row.remove();
        row.querySelectorAll("input, textarea").forEach(el => {
          el.addEventListener("focus", () => { lastFocusedInput = el; });
        });
        return row;
      }

      const sectionsContainer = root.querySelector("#dept-sections-container");
      if (sectionsContainer) {
        sectionsContainer.innerHTML = "";
        const initSections = (curTpl.sections && curTpl.sections.length)
          ? curTpl.sections
          : [
              ["1. Duties & Reporting Line", "You will perform duties as {{designation}} ({{staff_category}}) in the {{department}} Department at {{branch_location}}, reporting directly to {{manager_name}}."],
              ["2. Working Hours & Shift Roster", "Your contracted hours are {{working_hours}}. You are required to observe all attendance, shift rotation, and punctuality rules."],
              ["3. Remuneration & Deductions", "Your monthly basic salary shall be {{salary}} ({{gross_clause}}), paid monthly in arrears subject to statutory PAYE tax and SSNIT pension deductions."],
              ["4. Probation & Confirmation", "{{probation_clause}}"],
              ["5. Annual Leave & Standards", "You are entitled to {{leave_days}} working days of paid annual leave per completed year. You agree to adhere strictly to all company safety, ethics, and service quality policies."],
              ["6. Termination of Appointment", "Either party may terminate this appointment by giving {{notice_period}} in writing or salary in lieu of notice."]
            ];
        initSections.forEach(([h, b]) => {
          sectionsContainer.appendChild(createSectionRowElement(h, b));
        });
      }

      const addSecBtn = root.querySelector("#btn-add-section");
      if (addSecBtn && sectionsContainer) {
        addSecBtn.onclick = () => {
          const newRow = createSectionRowElement("", "");
          sectionsContainer.appendChild(newRow);
          const inp = newRow.querySelector(".section-heading");
          if (inp) inp.focus();
        };
      }

      root.querySelectorAll(".placeholder-tag-btn").forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          const tag = btn.dataset.insertTag;
          if (lastFocusedInput && document.body.contains(lastFocusedInput)) {
            const start = lastFocusedInput.selectionStart || 0;
            const end = lastFocusedInput.selectionEnd || 0;
            const val = lastFocusedInput.value || "";
            lastFocusedInput.value = val.substring(0, start) + tag + val.substring(end);
            lastFocusedInput.focus();
            const nextPos = start + tag.length;
            lastFocusedInput.setSelectionRange(nextPos, nextPos);
            toast("Inserted " + tag, "success");
          } else {
            copyTextToClipboard(tag, tag);
          }
        };
      });

      const docInput = root.querySelector("#dept-tpl-doc-input");
      const uploadBtn = root.querySelector("#dept-tpl-upload-btn");
      const feedbackEl = root.querySelector("#dept-tpl-upload-feedback");
      const dropzone = root.querySelector("#dept-tpl-dropzone");

      if (dropzone && docInput) {
        ['dragenter', 'dragover'].forEach(name => {
          dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = 'var(--accent)';
            dropzone.style.background = 'var(--surface-3, var(--surface))';
          });
        });
        ['dragleave', 'drop'].forEach(name => {
          dropzone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = 'var(--accent)';
            dropzone.style.background = 'var(--surface-2)';
          });
        });
        dropzone.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files.length) {
            docInput.files = dt.files;
            docInput.dispatchEvent(new Event('change'));
          }
        });
      }

      if (uploadBtn && docInput) {
        uploadBtn.onclick = () => docInput.click();
        docInput.onchange = async () => {
          if (!docInput.files || !docInput.files[0]) return;
          const file = docInput.files[0];
          const fd = new FormData();
          fd.append("file", file);

          feedbackEl.style.display = "block";
          feedbackEl.innerHTML = '<div class="callout-banner amber" style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;gap:8px">'
            + spinners(1) + ' Uploading and converting <b>' + esc(file.name) + '</b> into dynamic template…</div>';

          try {
            const res = await API.upload("/employment-letters/parse-document", fd);
            const parsed = (res && res.data) ? res.data : (res || {});
            const detected = res.detected_placeholders || (res.data && res.data.detected_placeholders) || [];

            if (parsed.letter_title) {
              const inp = root.querySelector('[name="letter_title"]');
              if (inp) inp.value = parsed.letter_title;
            }
            if (parsed.subject_line) {
              const inp = root.querySelector('[name="subject_line"]');
              if (inp) inp.value = parsed.subject_line;
            }
            if (parsed.working_hours) {
              const inp = root.querySelector('[name="working_hours"]');
              if (inp) inp.value = parsed.working_hours;
            }
            if (parsed.notice_period) {
              const inp = root.querySelector('[name="notice_period"]');
              if (inp) inp.value = parsed.notice_period;
            }
            if (parsed.opening) {
              const inp = root.querySelector('[name="opening"]');
              if (inp) inp.value = parsed.opening;
            }
            if (parsed.closing) {
              const inp = root.querySelector('[name="closing"]');
              if (inp) inp.value = parsed.closing;
            }
            if (parsed.extra_clause) {
              const inp = root.querySelector('[name="extra_clause"]');
              if (inp) inp.value = parsed.extra_clause;
            }

            if (parsed.sections && parsed.sections.length && sectionsContainer) {
              sectionsContainer.innerHTML = "";
              parsed.sections.forEach(([h, b]) => {
                sectionsContainer.appendChild(createSectionRowElement(h, b));
              });
            }

            const detectedBadges = detected.length
              ? '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">' + detected.map(t => '<span class="chip-sm mono" style="font-size:11px">{{' + esc(t.replace(/[{}]/g, "")) + '}}</span>').join("") + '</div>'
              : '';

            feedbackEl.innerHTML = '<div class="callout-banner green">'
              + '<div><b>Document Parsed Successfully!</b> Imported ' + ((parsed.sections && parsed.sections.length) || 0) + ' clauses from <b>' + esc(file.name) + '</b>. '
              + detectedBadges
              + '<div class="tiny" style="margin-top:6px">Clauses and text populated below. Review, make adjustments, and click <b>Save ' + esc(curDeptName) + ' Template</b>.</div>'
              + '</div></div>';
            toast("Appointment letter document parsed & populated", "success");
          } catch (err) {
            feedbackEl.innerHTML = '<div class="callout-banner red"><b>Conversion Failed:</b> ' + esc(err.message) + '</div>';
            toast(err.message, "error");
          } finally {
            docInput.value = "";
          }
        };
      }

      function harvestDeptTemplateData() {
        const form = root.querySelector("#dept-tpl-form");
        if (!form) return {};
        const fd = new FormData(form);
        const out = {};
        for (const [k, v] of fd.entries()) out[k] = v;

        const sections = [];
        root.querySelectorAll("#dept-sections-container .section-row").forEach(row => {
          const h = (row.querySelector(".section-heading")?.value || "").trim();
          const b = (row.querySelector(".section-body")?.value || "").trim();
          if (h || b) {
            sections.push([h, b]);
          }
        });
        out.sections = sections;
        return out;
      }

      async function openDeptTemplatePreviewModal() {
        const deptEmps = allRows.filter(r => (r.department_name === curDeptName) || (r.department_id === curDeptId));
        const candidateEmps = deptEmps.length ? deptEmps : allRows;
        let activeEmpId = candidateEmps.length ? candidateEmps[0].employee_id : null;
        let cachedPreviewHtml = "";

        openModal({
          title: "Preview " + curDeptName + " Appointment Letter",
          sub: "Dynamic placeholder verification with live employee data (salary, department, designation, etc.)",
          wide: true,
          body: '<div class="stack" style="gap:14px">'
            + '<div class="row-between" style="background:var(--surface-2);padding:10px 14px;border-radius:10px;border:1px solid var(--line);flex-wrap:wrap;gap:10px">'
            + '  <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">'
            + '    <label class="small" style="font-weight:600">Select Test Employee:</label>'
            + '    <select id="modal-preview-emp-select" class="input input-sm" style="min-width:260px">'
            +        candidateEmps.map(e =>
                       '<option value="' + e.employee_id + '" ' + (e.employee_id === activeEmpId ? "selected" : "") + '>'
                       + esc(e.employee_name) + ' — ' + esc(e.designation_title || "Staff") + ' (' + esc(e.department_name || "") + ')'
                       + '</option>'
                     ).join("")
            + '    </select>'
            + (!deptEmps.length ? '<span class="tiny amber">Note: Showing cross-department staff because no employees are assigned to ' + esc(curDeptName) + ' yet.</span>' : '')
            + '  </div>'
            + '  <div class="row" style="gap:8px">'
            + '    <button type="button" class="btn btn-sm btn-ghost" id="modal-refresh-preview">' + icon("refresh", 13) + ' Refresh</button>'
            + '    <button type="button" class="btn btn-sm btn-accent" id="modal-print-preview">' + icon("printer", 13) + ' Print / Save PDF</button>'
            + '  </div>'
            + '</div>'
            + '<div id="modal-preview-canvas" class="letter-preview-canvas" style="min-height:420px;background:#fff">' + spinners(3) + '</div>'
            + '</div>',
          footer: '<button class="btn btn-ghost" data-close-modal>Close Preview</button>'
        });

        async function fetchAndRenderPreview(empId) {
          const canvas = document.getElementById("modal-preview-canvas");
          if (!canvas) return;
          canvas.innerHTML = spinners(3);
          const draftTpl = harvestDeptTemplateData();
          try {
            const res = await API.post("/employment-letters/preview-department-template", {
              department_id: curDeptId,
              employee_id: empId,
              template: draftTpl
            });
            const d = res.data;
            cachedPreviewHtml = d.html || "";
            canvas.innerHTML = cachedPreviewHtml;
          } catch (err) {
            canvas.innerHTML = emptyState("Failed to render preview", err.message, "alert");
          }
        }

        const selectEl = document.getElementById("modal-preview-emp-select");
        if (selectEl) {
          selectEl.onchange = () => {
            activeEmpId = Number(selectEl.value);
            fetchAndRenderPreview(activeEmpId);
          };
        }
        const refreshBtn = document.getElementById("modal-refresh-preview");
        if (refreshBtn) refreshBtn.onclick = () => fetchAndRenderPreview(activeEmpId);
        const printBtn = document.getElementById("modal-print-preview");
        if (printBtn) printBtn.onclick = () => {
          if (cachedPreviewHtml) printLetterHtml(cachedPreviewHtml);
        };

        fetchAndRenderPreview(activeEmpId);
      }

      const prevBtn1 = root.querySelector("#btn-preview-dept-tpl");
      const prevBtn2 = root.querySelector("#btn-preview-bottom");
      if (prevBtn1) prevBtn1.onclick = openDeptTemplatePreviewModal;
      if (prevBtn2) prevBtn2.onclick = openDeptTemplatePreviewModal;

      const deptForm = root.querySelector("#dept-tpl-form");
      if (deptForm) {
        deptForm.onsubmit = async (ev) => {
          ev.preventDefault();
          const tplData = harvestDeptTemplateData();
          try {
            await API.put("/employment-letters/department-templates/" + curDeptId, tplData);
            toast("Saved appointment letter template for " + curDeptName, "success");
            Views["employment-letters"](root);
          } catch (err) {
            handleErr(err);
          }
        };
      }

      const resetBtn = root.querySelector("#btn-reset-dept-tpl");
      if (resetBtn) {
        resetBtn.onclick = () => {
          confirmDialog(
            "Reset Template to Default",
            "Are you sure you want to revert the " + curDeptName + " appointment letter template back to baseline default? Custom clauses and document text will be removed.",
            async () => {
              try {
                await API.delete("/employment-letters/department-templates/" + curDeptId);
                toast("Reset " + curDeptName + " template to baseline default", "success");
                Views["employment-letters"](root);
              } catch (err) {
                handleErr(err);
              }
            },
            { danger: true, confirmLabel: "Reset to Default" }
          );
        };
      }

      root.querySelectorAll("[data-pick-dept]").forEach(b => {
        b.onclick = () => {
          letterHubState.selectedDeptId = Number(b.dataset.pickDept);
          Views["employment-letters"](root);
        };
      });

      const deptSearch = root.querySelector("#dept-search-input");
      if (deptSearch) {
        deptSearch.oninput = () => {
          const q = deptSearch.value.toLowerCase().trim();
          root.querySelectorAll("#dept-list-container [data-pick-dept]").forEach(btn => {
            btn.style.display = (!q || btn.textContent.toLowerCase().includes(q)) ? "flex" : "none";
          });
        };
      }
    }
  } catch (err) {
    root.innerHTML = pageHead("Employment Letters", "Unavailable") + emptyState("Could not load employment letters", err.message, "alert");
  }
};
