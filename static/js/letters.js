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
    const [listRes, tplRes] = await Promise.all([
      API.get("/employment-letters"),
      API.get("/employment-letters/templates"),
    ]);
    const allRows = listRes.data || [];
    const categories = listRes.categories || [];
    const summaryByCat = listRes.summary_by_category || {};
    const templates = tplRes.data || [];
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
      + (canManage && missingAccounts > 0
          ? '<button class="btn btn-teal" id="btn-bulk-provision">' + icon("send", 14) + ' Email Missing Accounts (' + missingAccounts + ')</button>'
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
            render: r => '<b>' + esc(r.designation_title) + '</b><div class="tiny muted">' + esc(r.department_name) + '</div>',
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
  } catch (err) {
    root.innerHTML = pageHead("Employment Letters", "Unavailable") + emptyState("Could not load employment letters", err.message, "alert");
  }
};
