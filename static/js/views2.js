/* ============================================================ RECRUITMENT */
const recState = { tab: "pipeline", posting: null };

Views.recruitment = async function (root) {
  root.innerHTML = pageHead("Recruitment", "Loading talent pipeline…") + spinners(3);
  try {
    const [boardRes, intRes, candRes, jobRes, applicationRes] = await Promise.all([
      API.get("/recruitment/board"), API.get("/interviews", { per_page: 100 }),
      API.get("/candidates", { per_page: 100 }),
      API.get("/job-postings", { per_page: 500 }), API.get("/applications", { per_page: 500 }),
    ]);
    const board = boardRes.data.board, postings = jobRes.data;
    const openPostings = boardRes.data.postings;
    const interviews = intRes.data, candidates = candRes.data;
    const allApps = applicationRes.data;
    const canRecruit = Store.isRole("super_admin", "hr_admin", "hr_officer", "recruiter");
    if (!recState.posting || !board[recState.posting]) recState.posting = openPostings[0] ? String(openPostings[0].id) : null;
    const appMap = {};
    allApps.forEach(a => { appMap[a.id] = a; });
    const stages = ["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"];
    const tabs = [["pipeline", "Pipeline"], ["jobs", "Job postings"], ["candidates", "Candidates"], ["interviews", "Interviews"]];
    let body = "";

    if (recState.tab === "pipeline") {
      const current = recState.posting ? board[recState.posting] : null;
      if (!current) {
        body = '<div class="card">' + emptyState("No open roles", "Create a job posting to start receiving applications.", "briefcase") + '</div>';
      } else {
        body = '<div class="row-between wrap" style="margin-bottom:14px"><div class="row wrap">'
          + '<div><div class="tiny muted">Active role</div><b style="font-size:14px">' + esc(current.posting.title) + '</b></div>'
          + '<select class="select" id="posting-select" style="min-width:220px">' + openPostings.map(p => '<option value="' + p.id + '"' + (String(p.id) === recState.posting ? " selected" : "") + '>' + esc(p.title) + '</option>').join("") + '</select>'
          + '<span class="chip chip-teal">' + current.applications.length + ' applications</span></div>'
          + '<div class="row"><button class="btn btn-ghost btn-sm" id="add-cand">' + icon("plus", 13) + ' Add candidate</button>' + (canRecruit ? '<button class="btn btn-accent btn-sm" id="add-job">' + icon("plus", 13) + ' Post job</button>' : "") + '</div></div>'
          + '<div class="kanban">' + stages.map(st => {
            const apps = current.applications.filter(a => a.stage === st);
            return '<div class="kanban-col" data-stage="' + st + '"><div class="col-head">' + esc(st) + '<span class="count">' + apps.length + '</span></div>'
              + apps.map(a => '<div class="kanban-card" draggable="true" data-app="' + a.id + '"><div class="name">' + esc(a.candidate_name) + '</div><div class="job">' + esc(a.job_title) + '</div>'
                + '<div class="meta">' + (a.score ? icon("star", 11) + '<span>' + a.score + '</span>' : "") + '<span class="pill-tag" style="margin-left:auto">' + esc(a.candidate_email || "") + '</span></div></div>').join("")
              + (apps.length ? "" : '<div class="tiny muted" style="padding:12px;text-align:center">Drop here</div>') + '</div>';
          }).join("") + '</div>';
      }
    } else if (recState.tab === "jobs") {
      body = renderTable({
        columns: [
          Records.column("job-postings"),
          { label: "Role", render: r => '<b>' + esc(r.title) + '</b><div class="tiny muted">' + esc(r.location || "—") + '</div>' },
          { label: "Department", render: r => esc(r.department_name || "—") },
          { label: "Type", render: r => '<span style="text-transform:capitalize">' + esc((r.employment_type || "").replace("_", " ")) + '</span>' },
          { label: "Vacancies", key: "vacancies" },
          { label: "Closes", render: r => fmtDate(r.closes_at) },
          { label: "Status", render: r => chip(r.status) },
        ],
        rows: postings, emptyTitle: "No job postings",
      });
    } else if (recState.tab === "candidates") {
      body = renderTable({
        columns: [
          Records.column("candidates"),
          { label: "Candidate", render: r => personCell({ name: r.full_name, email: r.email }) },
          { label: "Phone", render: r => esc(r.phone || "—") },
          { label: "Source", render: r => '<span class="pill-tag">' + esc(r.source || "—") + '</span>' },
          { label: "Skills", render: r => esc((r.skills || "").split(",").slice(0, 3).join(", ") || "—") },
          { label: "", class: "right", render: r => '<span class="tiny muted">Pool</span>' },
        ],
        rows: candidates, emptyTitle: "No candidates yet",
      });
    } else {
      body = renderTable({
        columns: [
          Records.column("interviews"),
          { label: "Candidate", render: r => '<b>' + esc(r.candidate_name) + '</b><div class="tiny muted">' + esc(r.job_title) + '</div>' },
          { label: "Scheduled", render: r => fmtDateTime(r.scheduled_at) },
          { label: "Type", render: r => '<span style="text-transform:capitalize">' + esc(r.interview_type) + '</span>' },
          { label: "Location", render: r => esc(r.location || "—") },
          { label: "Panel", render: r => esc(r.panel || "—") },
          { label: "Status", render: r => chip(r.status) },
        ],
        rows: interviews, emptyTitle: "No interviews scheduled",
      });
    }

    root.innerHTML = pageHead("Recruitment", "From requisition to offer — a single hiring pipeline.",
      canRecruit ? '<button class="btn btn-ghost" id="rec-add-cand">' + icon("user", 15) + ' New candidate</button><button class="btn btn-accent" id="rec-add-job">' + icon("plus", 15) + ' Post a job</button>' : "", "Talent")
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Open roles", value: openPostings.length, icon: "briefcase", tone: "teal", foot: "Accepting applications" })
      + kpiCard({ label: "Applications", value: allApps.length, icon: "users", tone: "blue", foot: "Across all open roles" })
      + kpiCard({ label: "In interviews", value: allApps.filter(a => a.stage === "interview").length, icon: "calendar", tone: "accent", foot: "Scheduled conversations" })
      + kpiCard({ label: "Offers out", value: allApps.filter(a => a.stage === "offer").length, icon: "star", tone: "purple", foot: "Awaiting acceptance" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (recState.tab === t[0] ? "active" : "") + '" data-rtab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.insertAdjacentHTML("beforeend", renderTable({
      id: "recruitment-applications",
      title: "Applications",
      columns: [
        {
          label: "Candidate",
          key: "candidate_name",
          render: r => '<b>' + esc(r.candidate_name) + '</b>' + (r.candidate_email ? '<div class="tiny muted">' + esc(r.candidate_email) + '</div>' : ''),
        },
        { label: "Job", key: "job_title", render: r => '<b>' + esc(r.job_title) + '</b>' },
        {
          label: "Stage",
          key: "stage",
          sortValue: r => r.stage,
          render: r => canRecruit
            ? '<select class="select" style="height:30px;min-width:130px;font-size:12px;font-weight:600;padding:2px 8px;border-radius:6px;cursor:pointer" data-app-stage-select="' + r.id + '" data-job-id="' + (r.job_posting_id || "") + '" title="Update candidate stage">'
              + stages.map(st => '<option value="' + st + '"' + (r.stage === st ? " selected" : "") + '>' + st.charAt(0).toUpperCase() + st.slice(1) + '</option>').join("")
              + '</select>'
            : chip(r.stage),
        },
        Records.column("applications"),
      ],
      rows: allApps,
      emptyTitle: "No applications",
    }));
    onDelegate(root, "change", "[data-app-stage-select]", async (sel, ev) => {
      ev.stopPropagation();
      const aid = sel.dataset.appStageSelect;
      const newStage = sel.value;
      const jobId = sel.dataset.jobId;
      sel.disabled = true;
      try {
        await API.patch("/applications/" + aid + "/stage", { stage: newStage });
        const stageLabel = newStage.charAt(0).toUpperCase() + newStage.slice(1);
        toast("Application moved to " + stageLabel + " — board updated", "success");
        if (jobId) {
          recState.posting = String(jobId);
        }
        Views.recruitment(root);
      } catch (err) {
        handleErr(err);
        sel.disabled = false;
      }
    });
    Records.mount(root, ["job-postings", "candidates", "applications", "interviews"]);
    root.querySelectorAll("[data-rtab]").forEach(b => b.onclick = () => { recState.tab = b.dataset.rtab; Views.recruitment(root); });
    const ps = root.querySelector("#posting-select");
    if (ps) ps.onchange = (e) => { recState.posting = e.target.value; Views.recruitment(root); };
    root.querySelectorAll("[data-app]").forEach(card => {
      card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", card.dataset.app); card.style.opacity = ".5"; });
      card.addEventListener("dragend", () => { card.style.opacity = "1"; });
      card.onclick = () => openApplicationDrawer(appMap[Number(card.dataset.app)], candidates);
    });
    root.querySelectorAll(".kanban-col").forEach(col => {
      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
      col.addEventListener("drop", async (e) => {
        e.preventDefault(); col.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/plain");
        try {
          await API.patch("/applications/" + id + "/stage", { stage: col.dataset.stage });
          toast("Candidate moved to " + col.dataset.stage, "success");
          Views.recruitment(root);
        } catch (err) { handleErr(err); }
      });
    });
    const addJob = root.querySelector("#rec-add-job"); if (addJob) addJob.onclick = openJobForm;
    const addCand = root.querySelector("#rec-add-cand"); if (addCand) addCand.onclick = () => openCandidateForm();
    const addCand2 = root.querySelector("#add-cand"); if (addCand2) addCand2.onclick = () => openCandidateForm(recState.posting);
    const addJob2 = root.querySelector("#add-job"); if (addJob2) addJob2.onclick = openJobForm;
  } catch (e) {
    root.innerHTML = pageHead("Recruitment", "Pipeline unavailable") + emptyState("Could not load recruitment", e.message, "alert");
  }
};

function openJobForm() {
  formModal({
    title: "Post a job",
    sub: "Publish a role to the careers page",
    wide: true,
    fields: [
      { name: "title", label: "Role title", required: true },
      { name: "department_id", label: "Department", type: "select", options: deptOptions(), required: true },
      { name: "location", label: "Location", value: "Accra (hybrid)" },
      { name: "employment_type", label: "Employment type", type: "select", options: ["permanent", "fixed_term", "casual", "intern"], value: "permanent" },
      { name: "vacancies", label: "Vacancies", type: "number", value: 1, min: 1 },
      { name: "closes_at", label: "Closing date", type: "date" },
      { name: "description", label: "Role description", type: "textarea", rows: 4, full: true },
      { name: "requirements", label: "Requirements", type: "textarea", rows: 3, full: true },
    ],
    onSubmit: async (data) => {
      data.status = "open"; data.posted_at = todayISO();
      await API.post("/job-postings", data);
      navigate();
    },
  });
}

function openCandidateForm(postingId) {
  const postings = Store.meta ? Store.meta : null;
  formModal({
    title: "Add candidate",
    sub: "Create a candidate and attach them to an open role",
    wide: true,
    fields: [
      { name: "first_name", label: "First name", required: true },
      { name: "last_name", label: "Last name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone" },
      { name: "source", label: "Source", type: "select", options: ["LinkedIn", "Careers page", "Referral", "Jobberman", "Agency"], value: "Careers page" },
      { name: "skills", label: "Skills (comma separated)", full: true },
      { name: "notes", label: "Notes", type: "textarea", full: true },
    ],
    onSubmit: async (data) => {
      const cand = await API.post("/candidates", data);
      let jobId = postingId;
      if (!jobId) {
        const jobs = await API.get("/job-postings", { status: "open", per_page: 50 });
        jobId = jobs.data[0] ? jobs.data[0].id : null;
      }
      if (jobId) await API.post("/applications", { candidate_id: cand.data.id, job_posting_id: Number(jobId), stage: "applied" });
      navigate();
    },
  });
}

function openApplicationDrawer(app, candidates) {
  if (!app) return;
  const stageButtons = ["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"];
  openDrawer({
    title: app.candidate_name,
    head: '<div class="row" style="gap:12px">' + avatarHTML(app.candidate_name, "avatar-lg") + '<div><h3 style="font-family:var(--serif);font-size:23px;font-weight:500">' + esc(app.candidate_name) + '</h3><div class="small muted">' + esc(app.job_title) + '</div><div class="row" style="gap:6px;margin-top:6px">' + chip(app.stage) + (app.score ? '<span class="chip chip-amber">Score ' + app.score + '</span>' : "") + '</div></div></div>',
    body: '<div class="card card-pad" style="margin-bottom:14px"><dl class="kv">'
      + '<dt>Email</dt><dd>' + esc(app.candidate_email || "—") + '</dd>'
      + '<dt>Applied</dt><dd>' + fmtDate(app.applied_at) + '</dd>'
      + '<dt>Application</dt><dd class="mono">#' + app.id + '</dd>'
      + '<dt>Job</dt><dd>' + esc(app.job_title) + '</dd>'
      + '</dl></div>'
      + '<div class="section-title">Move stage</div><div class="filter-chips" style="margin-bottom:16px">'
      + stageButtons.map(s => '<button class="filter-chip ' + (app.stage === s ? "active" : "") + '" data-move="' + s + '">' + s + '</button>').join("") + '</div>'
      + '<div class="row wrap"><button class="btn btn-accent btn-sm" id="schedule-interview">' + icon("calendar", 13) + ' Schedule interview</button>'
      + '<button class="btn btn-soft btn-sm" id="hire-candidate">' + icon("check", 13) + ' Convert to employee</button></div>',
    onMount(panel) {
      panel.querySelectorAll("[data-move]").forEach(b => b.onclick = async () => {
        try { await API.patch("/applications/" + app.id + "/stage", { stage: b.dataset.move }); closeDrawer(); toast("Stage updated", "success"); navigate(); }
        catch (e) { handleErr(e); }
      });
      panel.querySelector("#schedule-interview").onclick = () => openInterviewForm(app.id);
      panel.querySelector("#hire-candidate").onclick = () => confirmDialog("Convert candidate", "This creates an employee record and an onboarding checklist for " + app.candidate_name + ".", async () => {
        await API.post("/applications/" + app.id + "/hire");
        closeDrawer(); toast("Employee record created", "success"); await Store.loadMeta(); navigate();
      }, { confirmLabel: "Hire candidate" });
    },
  });
}

function openInterviewForm(appId) {
  formModal({
    title: "Schedule interview",
    fields: [
      { name: "application_id", label: "Application", type: "select", options: [{ value: appId, label: "Application #" + appId }], value: appId, required: true, hint: "Application #" + appId },
      { name: "scheduled_at", label: "Date & time", type: "datetime-local", required: true },
      { name: "interview_type", label: "Type", type: "select", options: ["panel", "technical", "hr", "final"], value: "panel" },
      { name: "location", label: "Location / link", value: "Accra HQ" },
      { name: "panel", label: "Panel members", full: true },
    ],
    onSubmit: async (data) => {
      data.application_id = Number(appId);
      data.status = "scheduled";
      await API.post("/interviews", data);
      closeDrawer(); navigate();
    },
  });
}

/* ============================================================ ONBOARDING */
Views.onboarding = async function (root) {
  root.innerHTML = pageHead("Onboarding & offboarding", "Loading transition checklists…") + spinners(3);
  try {
    const [taskRes, offRes] = await Promise.all([API.get("/onboarding-tasks", { per_page: 300 }), API.get("/offboardings", { per_page: 200 })]);
    const tasks = taskRes.data, offs = offRes.data;
    const done = tasks.filter(t => t.status === "completed").length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const canManage = Store.canManage();
    const taskBody = renderTable({
      id: "onboarding-tasks",
      exportName: "onboarding-tasks",
      selectable: canManage,
      dateField: "due_date",
      dateLabel: "Due",
      filters: [
        { key: "department_name", label: "Department" },
        { key: "owner_role", label: "Owner" },
        { key: "status", label: "Status" },
      ],
      bulkActions: canManage ? [
        {
          label: "Mark completed",
          icon: "checkCircle",
          className: "btn-accent",
          onAction: async (ids) => {
            await API.post("/bulk-action", { entity: "onboarding", action: "completed", ids });
            toast("Marked " + ids.length + " task(s) completed", "success");
            Views.onboarding(root);
          },
        },
        {
          label: "Set in progress",
          icon: "clock",
          className: "btn-soft",
          onAction: async (ids) => {
            await API.post("/bulk-action", { entity: "onboarding", action: "in_progress", ids });
            toast("Updated " + ids.length + " task(s)", "success");
            Views.onboarding(root);
          },
        },
      ] : [],
      columns: [
          Records.column("onboarding-tasks"),
        { label: "Task", key: "title", render: r => '<b>' + esc(r.title) + '</b>' + (r.notes ? '<div class="tiny muted">' + esc(r.notes) + '</div>' : '') },
        { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name }, r.department_name) },
        { label: "Owner", key: "owner_role", render: r => '<span class="pill-tag">' + esc(r.owner_role || "HR") + '</span>' },
        { label: "Due", key: "due_date", render: r => fmtDate(r.due_date) },
        { label: "Status", key: "status", render: r => canManage ? '<select class="select" style="height:29px;min-width:120px;font-size:11.5px" data-task-status="' + r.id + '">' + ["pending", "in_progress", "completed"].map(s => '<option value="' + s + '"' + (r.status === s ? " selected" : "") + '>' + s.replace("_", " ") + '</option>').join("") + '</select>' : chip(r.status) },
      ],
      rows: tasks, emptyTitle: "No onboarding tasks", emptyText: "Add a task to start a checklist.",
    });
    const offBody = renderTable({
      id: "offboarding-cases",
      exportName: "offboarding-cases",
      dateField: "last_day",
      dateLabel: "Last day",
      filters: [
        { key: "department_name", label: "Department" },
        { key: "reason", label: "Reason" },
        { key: "status", label: "Status" },
      ],
      columns: [
          Records.column("offboardings"),
        { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name }, r.department_name) },
        { label: "Reason", key: "reason", render: r => '<span style="text-transform:capitalize">' + esc((r.reason || "").replace(/_/g, " ")) + '</span>' },
        { label: "Last day", key: "last_day", render: r => fmtDate(r.last_day) },
        { label: "Notice", sortValue: r => Number(r.notice_period_days || 0), render: r => (r.notice_period_days || 0) + " days" },
        { label: "Status", key: "status", render: r => chip(r.status) },
        { label: "", class: "right", sortable: false, render: r => canManage && r.status !== "completed" ? '<button class="btn btn-sm btn-soft" data-complete-off="' + r.id + '" data-emp="' + r.employee_id + '">Complete</button>' : "" },
      ],
      rows: offs, emptyTitle: "No offboarding cases",
    });

    root.innerHTML = pageHead("Onboarding", "Structured, trackable transitions for joiners and leavers.",
      canManage ? '<button class="btn btn-ghost" id="ob-offboard">' + icon("logout", 15) + ' Start offboarding</button><button class="btn btn-accent" id="ob-task">' + icon("plus", 15) + ' Add task</button>' : "", "Lifecycle")
      + '<div class="grid grid-3" style="margin-bottom:18px">'
      + kpiCard({ label: "Checklist completion", value: pct + "%", icon: "checkCircle", tone: "teal", foot: done + " of " + tasks.length + " tasks done" })
      + kpiCard({ label: "In progress", value: tasks.filter(t => t.status === "in_progress").length, icon: "clock", tone: "accent", foot: "Being worked on now" })
      + kpiCard({ label: "Offboarding cases", value: offs.length, icon: "logout", tone: "purple", foot: offs.filter(o => o.status !== "completed").length + " active" })
      + '</div>'
      + '<div class="card" style="margin-bottom:18px"><div class="card-head"><div><h3>Onboarding progress</h3><div class="sub">Across all active joiners</div></div><div class="right"><b>' + pct + '%</b></div></div><div class="card-body"><div class="progress"><div class="bar" style="width:' + pct + '%"></div></div></div></div>'
      + '<div class="section-title">Onboarding tasks</div>' + taskBody
      + '<div class="section-title" style="margin-top:22px">Offboarding</div>' + offBody;

    Records.mount(root, ["onboarding-tasks", "offboardings"]);
    onFinanceDelegate(root, "change", "[data-task-status]", async (sel) => {
      try { await API.put("/onboarding-tasks/" + sel.dataset.taskStatus, { status: sel.value }); toast("Task updated", "success"); Views.onboarding(root); }
      catch (e) { handleErr(e); }
    });
    onFinanceDelegate(root, "click", "[data-complete-off]", (b) => confirmDialog("Complete offboarding", "This marks the offboarding case complete and sets the employee status to resigned.", async () => {
      await API.put("/offboardings/" + b.dataset.completeOff, { status: "completed" });
      await API.put("/employees/" + b.dataset.emp, { status: "resigned" });
      toast("Offboarding completed", "success"); await Store.loadMeta(); Views.onboarding(root);
    }, { confirmLabel: "Complete" }));
    const taskBtn = root.querySelector("#ob-task"); if (taskBtn) taskBtn.onclick = openOnboardingTaskForm;
    const offBtn = root.querySelector("#ob-offboard"); if (offBtn) offBtn.onclick = openOffboardingForm;
  } catch (e) {
    root.innerHTML = pageHead("Onboarding", "Unavailable") + emptyState("Could not load onboarding", e.message, "alert");
  }
};

function openOnboardingTaskForm() {
  formModal({
    title: "Add onboarding task",
    fields: [
      { name: "employee_id", label: "Employee", type: "select", options: employeeOptions(), required: true },
      { name: "title", label: "Task", required: true, placeholder: "e.g. Issue laptop" },
      { name: "owner_role", label: "Owner", type: "select", options: ["HR", "IT", "Finance", "Manager", "Admin"], value: "HR" },
      { name: "due_date", label: "Due date", type: "date", value: todayISO() },
      { name: "notes", label: "Notes", type: "textarea", full: true },
    ],
    onSubmit: async (data) => { data.status = "pending"; await API.post("/onboarding-tasks", data); navigate(); },
  });
}

function openOffboardingForm() {
  formModal({
    title: "Start offboarding",
    fields: [
      { name: "employee_id", label: "Employee", type: "select", options: employeeOptions(), required: true },
      { name: "reason", label: "Reason", type: "select", options: ["resignation", "termination", "retirement", "end_of_contract"], value: "resignation" },
      { name: "last_day", label: "Last working day", type: "date", required: true },
      { name: "notice_period_days", label: "Notice period (days)", type: "number", value: 30 },
      { name: "exit_interview", label: "Exit interview notes", type: "textarea", full: true },
    ],
    onSubmit: async (data) => { data.status = "pending"; await API.post("/offboardings", data); navigate(); },
  });
}

/* ============================================================ ATTENDANCE */
const attState = { tab: "records" };

Views.attendance = async function (root) {
  root.innerHTML = pageHead("Attendance", "Loading time records…") + spinners(3);
  try {
    const [attRes, corrRes] = await Promise.all([
      API.get("/attendance", { per_page: 500 }),
      API.get("/corrections", { per_page: 200 }),
    ]);
    const rows = attRes.data, corrections = corrRes.data;
    const today = todayRecord(rows);
    const isEmployee = Store.isRole("employee");
    const canManage = Store.canManage() || Store.isRole("manager");
    const monthRows = rows.filter(r => (r.work_date || "").slice(0, 7) === todayISO().slice(0, 7));
    const stats = {
      present: monthRows.filter(r => ["present", "remote"].includes(r.status)).length,
      late: monthRows.filter(r => r.status === "late").length,
      leave: monthRows.filter(r => r.status === "leave").length,
      overtime: monthRows.reduce((a, r) => a + Number(r.overtime_minutes || 0), 0),
    };

    const recordsTable = renderTable({
      id: "attendance-records",
      exportName: "attendance-register",
      defaultPageSize: 10,
      dateField: "work_date",
      dateLabel: "Work date",
      filters: [
        ...(isEmployee ? [] : [{ key: "department_name", label: "Department" }]),
        { key: "status", label: "Status" },
        { key: "source", label: "Source" },
      ],
      columns: [
        ...(isEmployee ? [] : [
          { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name, employee_no: r.employee_no }) },
          { label: "Department", key: "department_name", render: r => esc(r.department_name || "—") },
        ]),
        { label: "Date", key: "work_date", render: r => fmtDate(r.work_date) },
        { label: "Clock in", sortKey: "clock_in", render: r => r.clock_in ? fmtTime(r.clock_in) : "—" },
        { label: "Clock out", sortKey: "clock_out", render: r => r.clock_out ? fmtTime(r.clock_out) : "—" },
        { label: "Source", key: "source", render: r => '<span class="pill-tag">' + esc(r.source || "web") + '</span>' },
        { label: "Overtime", sortValue: r => Number(r.overtime_minutes || 0), render: r => r.overtime_minutes ? r.overtime_minutes + " min" : "—" },
        { label: "Status", key: "status", render: r => chip(r.status) },
      ],
      rows: rows, emptyTitle: "No attendance records",
    });

    const corrTable = renderTable({
      id: "attendance-corrections",
      exportName: "attendance-corrections",
      dateField: "work_date",
      dateLabel: "Work date",
      filters: [
        ...(isEmployee ? [] : [{ key: "department_name", label: "Department" }]),
        { key: "status", label: "Status" },
      ],
      columns: [
        { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name }, r.department_name) },
        { label: "Date", key: "work_date", render: r => fmtDate(r.work_date) },
        { label: "Requested in", key: "requested_clock_in", render: r => esc(r.requested_clock_in || "—") },
        { label: "Requested out", key: "requested_clock_out", render: r => esc(r.requested_clock_out || "—") },
        { label: "Reason", key: "reason", render: r => '<span class="small">' + esc(r.reason || "—") + '</span>' },
        { label: "Status", key: "status", render: r => chip(r.status) },
        { label: "", class: "right", sortable: false, render: r => canManage && r.status === "pending" ? '<button class="btn btn-sm btn-soft" data-approve-corr="' + r.id + '">Approve</button>' : "" },
      ],
      rows: corrections, emptyTitle: "No correction requests",
    });

    root.innerHTML = pageHead("Attendance", "Working time for office, remote and shift-based teams.", '<button class="btn btn-ghost" id="corr-btn">' + icon("clock", 15) + ' Request correction</button>', "Time & absence")
      + '<div class="grid grid-3" style="margin-bottom:18px">'
      + '<div class="clock-card"><div class="time" id="live-clock">' + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + '</div><div class="date">' + new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + '</div>'
      + '<div class="status">' + (today && today.clock_in ? "Clocked in at " + fmtTime(today.clock_in) + (today.clock_out ? " · out at " + fmtTime(today.clock_out) : "") : "Not clocked in today") + '</div>'
      + '<div class="actions"><button class="btn btn-accent btn-sm" id="clock-in" ' + (today && today.clock_in ? "disabled" : "") + '>' + icon("play", 13) + ' Clock in</button>'
      + '<button class="btn btn-ghost btn-sm" id="clock-out" ' + (!today || !today.clock_in || today.clock_out ? "disabled" : "") + '>' + icon("check", 13) + ' Clock out</button></div></div>'
      + '<div class="card span-2"><div class="card-head"><div><h3>This month</h3><div class="sub">' + new Date().toLocaleString("en-GB", { month: "long", year: "numeric" }) + '</div></div><div class="right">' + chip(today ? today.status : "not clocked in", today ? today.status : "no record") + '</div></div><div class="card-body"><div class="stat-strip" style="border:0"><div class="item"><span>Present</span><b>' + stats.present + '</b></div><div class="item"><span>Late</span><b>' + stats.late + '</b></div><div class="item"><span>On leave</span><b>' + stats.leave + '</b></div><div class="item"><span>Overtime</span><b>' + Math.round(stats.overtime / 60) + 'h</b></div></div>'
      + '<div style="margin-top:18px"><div class="row-between"><span class="small muted">Attendance rate</span><b class="small">' + Math.round((stats.present + stats.late) / Math.max(monthRows.length, 1) * 100) + '%</b></div><div class="progress" style="margin-top:6px"><div class="bar" style="width:' + Math.round((stats.present + stats.late) / Math.max(monthRows.length, 1) * 100) + '%"></div></div></div>'
      + '</div></div></div>'
      + '<div class="tabs" style="margin-bottom:18px"><button class="tab ' + (attState.tab === "records" ? "active" : "") + '" data-atab="records">Time records <span class="tab-count">' + rows.length + '</span></button><button class="tab ' + (attState.tab === "corrections" ? "active" : "") + '" data-atab="corrections">Corrections <span class="tab-count">' + corrections.filter(c => c.status === "pending").length + '</span></button></div>'
      + '<div class="page-enter">' + (attState.tab === "records" ? recordsTable : corrTable) + '</div>';

    if (window.__clockTimer) clearInterval(window.__clockTimer);
    window.__clockTimer = setInterval(() => {
      const el = document.getElementById("live-clock");
      if (!el) { clearInterval(window.__clockTimer); return; }
      el.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }, 15000);

    root.querySelector("#clock-in").onclick = async () => {
      try { await API.post("/attendance/clock-in"); toast("Clocked in", "success"); Views.attendance(root); } catch (e) { handleErr(e); }
    };
    root.querySelector("#clock-out").onclick = async () => {
      try { await API.post("/attendance/clock-out"); toast("Clocked out", "success"); Views.attendance(root); } catch (e) { handleErr(e); }
    };
    root.querySelector("#corr-btn").onclick = () => openCorrectionForm();
    root.querySelectorAll("[data-atab]").forEach(b => b.onclick = () => { attState.tab = b.dataset.atab; Views.attendance(root); });
    onDelegate(root, "click", "[data-approve-corr]", async (b) => {
      try { await API.post("/corrections/" + b.dataset.approveCorr + "/approve"); toast("Correction applied", "success"); Views.attendance(root); } catch (e) { handleErr(e); }
    });
  } catch (e) {
    root.innerHTML = pageHead("Attendance", "Unavailable") + emptyState("Could not load attendance", e.message, "alert");
  }
};

function openCorrectionForm() {
  formModal({
    title: "Request attendance correction",
    sub: "Your manager or HR will review this request",
    fields: [
      { name: "work_date", label: "Date", type: "date", required: true, value: todayISO() },
      { name: "requested_clock_in", label: "Correct clock in", type: "time" },
      { name: "requested_clock_out", label: "Correct clock out", type: "time" },
      { name: "reason", label: "Reason", type: "textarea", required: true, full: true, placeholder: "Explain why the record needs correcting" },
    ],
    onSubmit: async (data) => { data.employee_id = Store.user.employee_id; data.status = "pending"; await API.post("/corrections", data); navigate(); },
  });
}

/* ============================================================ LEAVE */
const leaveState = { tab: "overview", month: new Date(), selectedEmployee: null };
const leaveTabs = [["overview", "Balances & requests"], ["calendar", "Team calendar"], ["approvals", "Approvals"], ["config", "Types & holidays"]];

Views.leave = async function (root) {
  root.innerHTML = pageHead("Leave", "Loading leave position…") + spinners(3);
  try {
    const [reqRes, typeRes, holRes, inboxRes, balRes] = await Promise.all([
      API.get("/leave-requests", { per_page: 500 }),
      API.get("/leave-types", { per_page: 100 }),
      API.get("/holidays", { per_page: 100 }),
      API.get("/approvals/inbox"),
      API.get("/leave/summary"),
    ]);
    const requests = reqRes.data, types = typeRes.data, holidays = holRes.data;
    const inbox = inboxRes.data.filter(i => i.type === "leave");
    const balances = balRes.data || [];
    const metrics = balRes.metrics || {};
    leaveState.requests = requests;
    leaveState.balances = balances;
    leaveState.metrics = metrics;
    const canManage = Store.canManage();
    const canApprove = Store.isRole("super_admin", "hr_admin", "hr_officer", "manager");
    const isEmployee = Store.isRole("employee");
    let body = "";

    if (leaveState.tab === "overview") {
      const anlEntitled = metrics.annual_entitlement !== undefined ? metrics.annual_entitlement : 30;
      const anlCarried = metrics.carried_over_from_prior_year || 0;
      const anlTotal = metrics.total_allocation || (anlEntitled + anlCarried);
      const anlTaken = metrics.taken || 0;
      const anlPending = metrics.pending || 0;
      const anlRemaining = metrics.remaining !== undefined ? metrics.remaining : Math.max(0, anlTotal - anlTaken - anlPending);
      const anlCarryNext = metrics.carry_over_to_next_year !== undefined ? metrics.carry_over_to_next_year : anlRemaining;

      const kpiCards = '<div class="grid grid-4" style="margin-bottom:18px">'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Annual Entitlement</div><div style="font-family:var(--serif);font-size:28px;line-height:1.2;font-weight:600">' + anlEntitled + '<span class="tiny muted" style="font-family:var(--sans);font-weight:400"> days / yr</span></div></div><div class="kpi-icon teal">' + icon("calendar", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">Ghana Labor Standard (30 working days)</div>'
        + '</div>'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Carried Over (Prior Year)</div><div style="font-family:var(--serif);font-size:28px;line-height:1.2;font-weight:600;color:var(--teal)">+' + anlCarried + '<span class="tiny muted" style="font-family:var(--sans);font-weight:400"> days</span></div></div><div class="kpi-icon teal">' + icon("refresh", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">Total Allocation: <b>' + anlTotal + ' days</b></div>'
        + '</div>'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Taken & Pending</div><div style="font-family:var(--serif);font-size:28px;line-height:1.2;font-weight:600;color:var(--amber)">' + anlTaken + '<span class="tiny muted" style="font-family:var(--sans);font-weight:400"> taken · ' + anlPending + ' pend</span></div></div><div class="kpi-icon amber">' + icon("clock", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">' + (anlTaken + anlPending) + ' working days booked</div>'
        + '</div>'
        + '<div class="card card-pad" style="border:1.5px solid var(--teal);background:linear-gradient(135deg, var(--card-bg) 0%, rgba(15,118,110,0.06) 100%)">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em;color:var(--teal);font-weight:600">Carry-Over to Next Year</div><div style="font-family:var(--serif);font-size:28px;line-height:1.2;font-weight:700;color:var(--teal)">' + anlCarryNext + '<span class="tiny muted" style="font-family:var(--sans);font-weight:400"> days</span></div></div><div class="kpi-icon green">' + icon("check", 16) + '</div></div>'
        + '  <div class="tiny" style="color:var(--teal);margin-top:8px;font-weight:500">Eligible to rollover to next annual cycle</div>'
        + '</div>'
        + '</div>';

      const balanceCards = '<div class="grid grid-3" style="margin-bottom:18px">'
        + balances.map(b => {
          const entitled = Number(b.entitled || 0);
          const carried = Number(b.carried_over || 0);
          const totalAlloc = entitled + carried;
          const taken = Number(b.taken || 0);
          const pending = Number(b.pending || 0);
          const left = Math.max(0, totalAlloc - taken - pending);
          const pct = totalAlloc > 0 ? Math.round(left / totalAlloc * 100) : 0;
          return '<div class="card card-pad">'
            + '<div class="row-between"><div>'
            + '  <div class="row" style="gap:6px;align-items:center"><div class="tiny muted">' + esc(b.leave_type_name) + '</div>' + (b.code === 'ANL' ? '<span class="chip teal tiny">Annual</span>' : '') + '</div>'
            + '  <div style="font-family:var(--serif);font-size:26px;line-height:1.2;margin-top:4px">' + left + '<span class="tiny muted" style="font-family:var(--sans)"> / ' + totalAlloc + ' days left</span></div>'
            + '</div><div class="kpi-icon teal">' + icon("calendar", 16) + '</div></div>'
            + '<div class="progress" style="margin-top:12px"><div class="bar" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></div></div>'
            + '<div class="tiny muted" style="margin-top:8px">' + entitled + ' entitled' + (carried > 0 ? ' · <b style="color:var(--teal)">+' + carried + ' carried over</b>' : '') + ' · ' + taken + ' taken · ' + pending + ' pending</div>'
            + (b.code === 'ANL' ? '<div class="tiny" style="color:var(--teal);margin-top:6px;font-weight:500">Carry-Over to Next Year: <b>' + left + ' days</b></div>' : '')
            + '</div>';
        }).join("") + '</div>';

      body = kpiCards + balanceCards
        + renderTable({
          id: "leave-requests-table",
          title: "Leave requests register",
          sub: "Filter by leave type, department, status or date range.",
          exportName: "leave-requests",
          selectable: canApprove,
          dateField: "start_date",
          dateLabel: "Start date",
          filters: [
            ...(isEmployee ? [] : [{ key: "department_name", label: "Department" }]),
            { key: "leave_type_name", label: "Leave type" },
            { key: "status", label: "Status" },
          ],
          bulkActions: canApprove ? [
            {
              label: "Approve selected",
              icon: "check",
              className: "btn-accent",
              onAction: async (ids) => {
                const r = await API.post("/bulk-action", { entity: "leave", action: "approved", ids });
                toast("Approved " + r.data.processed + " leave request(s)", "success");
                Views.leave(root);
              },
            },
            {
              label: "Reject selected",
              icon: "x",
              className: "btn-danger",
              onAction: async (ids) => {
                const r = await API.post("/bulk-action", { entity: "leave", action: "rejected", ids });
                toast("Rejected " + r.data.processed + " leave request(s)", "success");
                Views.leave(root);
              },
            },
          ] : [],
          columns: [
            ...(isEmployee ? [] : [{ label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name, employee_no: r.employee_no }, r.department_name) }]),
            { label: "Type", key: "leave_type_name", render: r => '<b>' + esc(r.leave_type_name) + '</b>' + (r.reason ? '<div class="tiny muted">' + esc(r.reason.slice(0, 60)) + '</div>' : '') },
            { label: "From", key: "start_date", render: r => fmtDate(r.start_date) },
            { label: "To", key: "end_date", render: r => fmtDate(r.end_date) },
            { label: "Days", key: "days", sortValue: r => Number(r.days || 0) },
            { label: "Approval Status", render: r => {
              if (r.status === "approved") return chip("approved");
              if (r.status === "rejected") return chip("rejected");
              if (r.status === "cancelled") return chip("cancelled");
              // Multi-level approval status with designated approver labels
              const hodName = r.hod_name ? ' (' + esc(r.hod_name.split(' ')[0]) + ')' : '';
              const accName = r.accountant_name ? ' (' + esc(r.accountant_name.split(' ')[0]) + ')' : '';
              const mdName = r.md_name ? ' (' + esc(r.md_name.split(' ')[0]) + ')' : '';
              const hod = r.hod_approved_at ? '<span class="chip green tiny" title="Approved by HOD">✓ HoD' + hodName + '</span>' : '<span class="chip gray tiny">○ HoD' + hodName + '</span>';
              const acc = r.accountant_approved_at ? '<span class="chip green tiny" title="Approved by Accountant">✓ Acc' + accName + '</span>' : '<span class="chip gray tiny">○ Acc' + accName + '</span>';
              const md = r.md_approved_at ? '<span class="chip green tiny" title="Approved by Managing Director">✓ MD' + mdName + '</span>' : '<span class="chip gray tiny">○ MD' + mdName + '</span>';
              return '<div class="row" style="gap:4px;flex-wrap:wrap">' + hod + ' ' + acc + ' ' + md + '</div>';
            }},
            { label: "", class: "right", sortable: false, render: r => {
              let btns = "";
              const user = Store.user;
              const emp = user.employee;
              const role = user.role?.slug;
              
              // Official Leave Form preview & PDF for approved and active requests
              if (r.status === "approved") {
                btns += '<button class="btn btn-sm btn-teal" data-preview-leave-form="' + r.id + '" title="Preview, print or save official Leave Request Form">' + icon("file", 12) + ' View Form / PDF</button> ';
              } else {
                btns += '<button class="btn btn-sm btn-ghost" data-preview-leave-form="' + r.id + '" title="Preview official Leave Request Form">' + icon("file", 12) + ' Form</button> ';
              }
              
              if (r.status !== "pending") return btns;
              
              // Dynamic check against designated approvers on employee profile & department
              const reqEmp = (Store.meta && Store.meta.employees) ? Store.meta.employees.find(e => e.id === r.employee_id) : null;
              const reqDept = reqEmp && reqEmp.department_id ? (Store.meta.departments || []).find(d => d.id === reqEmp.department_id) : null;
              const deptHodId = reqDept ? reqDept.head_id : null;
              const fixedAccId = Store.meta?.fixed_approvers?.accountant?.id || 4;
              const fixedMdId = Store.meta?.fixed_approvers?.md?.id || 1;

              const isHod = (reqEmp && reqEmp.hod_id === user.employee_id) || (deptHodId && deptHodId === user.employee_id) || (reqEmp && !reqEmp.hod_id && reqEmp.manager_id === user.employee_id);
              const isAcc = (reqEmp && reqEmp.accountant_id === user.employee_id) || (fixedAccId === user.employee_id);
              const isMd = (reqEmp && reqEmp.md_id === user.employee_id) || (fixedMdId === user.employee_id);

              const canApproveHOD = isHod || (role === "super_admin" || role === "hr_admin" || (role === "manager" && reqEmp?.manager_id === user.employee_id));
              const canApproveAccountant = isAcc || (role === "super_admin" || role === "hr_admin");
              const canApproveMD = isMd || (role === "super_admin");
              
              if (r.employee_id !== user.employee_id) {
                if (!r.hod_approved_at && canApproveHOD) {
                  btns += '<button class="btn btn-sm btn-accent" data-approve-hod="' + r.id + '">Approve (HOD)</button> ';
                } else if (r.hod_approved_at && !r.accountant_approved_at && canApproveAccountant) {
                  btns += '<button class="btn btn-sm btn-accent" data-approve-accountant="' + r.id + '">Approve (Accountant)</button> ';
                } else if (r.hod_approved_at && r.accountant_approved_at && !r.md_approved_at && canApproveMD) {
                  btns += '<button class="btn btn-sm btn-accent" data-approve-md="' + r.id + '">Approve (MD)</button> ';
                }
                if (canApprove || isHod || isAcc || isMd) {
                  btns += '<button class="btn btn-sm btn-danger" data-reject-leave="' + r.id + '">Reject</button> ';
                }
              }
              if (r.employee_id === user.employee_id || canManage) {
                btns += '<button class="btn btn-sm btn-ghost" data-cancel-leave="' + r.id + '">Cancel</button>';
              }
              return btns;
            } },
          ],
          rows: requests,
          onRowClick: (r) => openLeaveFormPreviewModal(r.id),
          emptyTitle: "No leave requests", emptyText: "Apply for leave to see it here.",
        });
    } else if (leaveState.tab === "calendar") {
      body = monthCalendar(leaveState.month, requests.filter(r => r.status !== "rejected"), holidays, types);
    } else if (leaveState.tab === "approvals") {
      body = renderTable({
        id: "leave-approvals-table",
        title: "Pending leave approvals",
        sub: "Select rows for bulk approval or decide individually.",
        selectable: true,
        rowId: r => r.id,
        filters: [{ key: "department_name", label: "Department" }],
        bulkActions: [
          {
            label: "Approve selected",
            icon: "check",
            className: "btn-accent",
            onAction: async (ids) => {
              const r = await API.post("/bulk-action", { entity: "leave", action: "approved", ids });
              toast("Approved " + r.data.processed + " request(s)", "success");
              Views.leave(root);
            },
          },
          {
            label: "Reject selected",
            icon: "x",
            className: "btn-danger",
            onAction: async (ids) => {
              const r = await API.post("/bulk-action", { entity: "leave", action: "rejected", ids });
              toast("Rejected " + r.data.processed + " request(s)", "success");
              Views.leave(root);
            },
          },
        ],
        columns: [
          { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name || r.title }, r.department_name) },
          { label: "Request", render: r => '<b>' + esc(r.title) + '</b><div class="tiny muted">' + esc(r.subtitle) + '</div>' },
          { label: "Reason", render: r => esc(r.detail || "—") },
          { label: "Submitted", sortKey: "requested_at", render: r => timeAgo(r.requested_at) },
          { label: "", class: "right", sortable: false, render: r => '<button class="btn btn-soft btn-sm" data-approve="leave" data-id="' + r.id + '">' + icon("check", 13) + ' Approve</button> <button class="btn btn-danger btn-sm" data-reject="leave" data-id="' + r.id + '">' + icon("x", 13) + ' Reject</button>' },
        ],
        rows: inbox,
        emptyIcon: "checkCircle",
        emptyTitle: "Inbox clear",
        emptyText: "No leave requests are waiting for your decision.",
      });
    } else {
      body = '<div class="grid grid-2">'
        + renderTable({
          id: "leave-types-table",
          title: "Leave types",
          sub: "Statutory & company policy rules",
          actions: canManage ? '<button class="btn btn-sm btn-accent" id="add-leave-type">' + icon("plus", 13) + ' Add</button>' : "",
          columns: [
            { label: "Type", key: "name", render: r => '<span class="row" style="gap:7px"><span style="width:8px;height:8px;border-radius:2px;background:' + esc(r.color || "#0f766e") + '"></span><b>' + esc(r.name) + '</b></span>' },
            { label: "Days/yr", key: "days_per_year" },
            { label: "Paid", sortValue: r => r.paid ? 1 : 0, render: r => r.paid ? "Yes" : "No" },
            { label: "Carry forward", key: "carry_forward" },
          ],
          rows: types, emptyTitle: "No leave types",
        })
        + renderTable({
          id: "holidays-table",
          title: "Public holidays",
          sub: "Applied to working-day calculations",
          dateField: "holiday_date",
          actions: canManage ? '<button class="btn btn-sm btn-accent" id="add-holiday">' + icon("plus", 13) + ' Add</button>' : "",
          columns: [
            { label: "Holiday", key: "name", render: r => '<b>' + esc(r.name) + '</b>' },
            { label: "Date", key: "holiday_date", render: r => fmtDate(r.holiday_date) },
            { label: "Country", key: "country", render: r => esc(r.country || "—") },
          ],
          rows: holidays, emptyTitle: "No holidays",
        })
        + '</div>';
    }

    root.innerHTML = pageHead("Leave", "Policy-driven leave requests, approvals and balances.",
      '<button class="btn btn-ghost" id="leave-team">' + icon("users", 15) + ' Who is away</button><button class="btn btn-accent" id="leave-apply">' + icon("plus", 15) + ' Apply for leave</button>', "Time & absence")
      + '<div class="leave-summary-strip" style="margin-bottom:18px">'
      + '<div class="card card-pad"><div class="tiny muted">Pending requests</div><b style="font-family:var(--serif);font-size:24px">' + requests.filter(r => r.status === "pending").length + '</b></div>'
      + '<div class="card card-pad"><div class="tiny muted">Approved this year</div><b style="font-family:var(--serif);font-size:24px">' + requests.filter(r => r.status === "approved").length + '</b></div>'
      + (() => {
          // Calculate annual leave balance only (not all leave types)
          const annualLeave = balances.find(b => b.leave_type_name && (b.leave_type_name.toLowerCase().includes('annual') || b.leave_type_name === 'ANL'));
          if (annualLeave) {
            const entitled = Number(annualLeave.entitled || 0);
            const carriedOver = Number(annualLeave.carried_over || 0);
            const taken = Number(annualLeave.taken || 0);
            const pending = Number(annualLeave.pending || 0);
            const total = entitled + carriedOver;
            const remaining = Math.max(0, total - taken - pending);
            return '<div class="card card-pad">'
              + '<div class="tiny muted">My Annual Leave Balance</div>'
              + '<b style="font-family:var(--serif);font-size:24px">' + remaining + ' <span style="font-size:14px;font-weight:400;color:var(--muted)">/ ' + total + '</span></b>'
              + '<div class="tiny muted">' + (carriedOver > 0 ? 'Includes ' + carriedOver + ' days carried over' : entitled + ' days entitled') + '</div>'
              + '</div>';
          } else {
            return '<div class="card card-pad"><div class="tiny muted">My balance</div><b style="font-family:var(--serif);font-size:24px">—</b></div>';
          }
        })()
      + '<div class="card card-pad"><div class="tiny muted">Awaiting my decision</div><b style="font-family:var(--serif);font-size:24px">' + inbox.length + '</b></div>'
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">' + leaveTabs.map(t => '<button class="tab ' + (leaveState.tab === t[0] ? "active" : "") + '" data-ltab="' + t[0] + '">' + t[1] + (t[0] === "approvals" && inbox.length ? '<span class="tab-count">' + inbox.length + '</span>' : "") + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-ltab]").forEach(b => b.onclick = () => { leaveState.tab = b.dataset.ltab; Views.leave(root); });
    root.querySelector("#leave-apply").onclick = () => openLeaveForm();
    root.querySelector("#leave-team").onclick = () => { leaveState.tab = "calendar"; Views.leave(root); };
    onDelegate(root, "click", "[data-cancel-leave]", (b) => confirmDialog("Cancel leave request", "This will withdraw your pending request.", async () => {
      await API.post("/leave-requests/" + b.dataset.cancelLeave + "/cancel"); toast("Request cancelled", "success"); Views.leave(root);
    }, { confirmLabel: "Cancel request", danger: true }));
    
    // Multi-level approval handlers
    onDelegate(root, "click", "[data-approve-hod]", async (b) => {
      try {
        await API.post("/leave-requests/" + b.dataset.approveHod + "/approve-level", { level: "hod" });
        toast("Approved by Head of Department", "success");
        Views.leave(root);
      } catch (err) { handleErr(err); }
    });
    onDelegate(root, "click", "[data-approve-accountant]", async (b) => {
      try {
        await API.post("/leave-requests/" + b.dataset.approveAccountant + "/approve-level", { level: "accountant" });
        toast("Approved by Accountant", "success");
        Views.leave(root);
      } catch (err) { handleErr(err); }
    });
    onDelegate(root, "click", "[data-approve-md]", async (b) => {
      try {
        await API.post("/leave-requests/" + b.dataset.approveMd + "/approve-level", { level: "md" });
        toast("Fully approved by Managing Director", "success");
        Views.leave(root);
      } catch (err) { handleErr(err); }
    });
    onDelegate(root, "click", "[data-preview-leave-form]", (b, ev) => {
      if (ev) ev.stopPropagation();
      openLeaveFormPreviewModal(b.dataset.previewLeaveForm);
    });
    onDelegate(root, "click", "[data-download-pdf]", (b, ev) => {
      if (ev) ev.stopPropagation();
      openLeaveFormPreviewModal(b.dataset.downloadPdf);
    });
    onDelegate(root, "click", "[data-reject-leave]", (b) => {
      formModal({
        title: "Reject leave request",
        fields: [
          { name: "note", label: "Rejection reason", type: "textarea", required: true, placeholder: "Explain why this request is being rejected" }
        ],
        onSubmit: async (data) => {
          await API.post("/leave-requests/" + b.dataset.rejectLeave + "/reject-level", data);
          toast("Leave request rejected", "success");
          Views.leave(root);
        }
      });
    });
    
    bindApprovalButtons(root);
    const lt = root.querySelector("#add-leave-type"); if (lt) lt.onclick = openLeaveTypeForm;
    const hd = root.querySelector("#add-holiday"); if (hd) hd.onclick = openHolidayForm;
    root.querySelectorAll("[data-cal-prev]").forEach(b => b.onclick = () => { leaveState.month = new Date(leaveState.month.getFullYear(), leaveState.month.getMonth() - 1, 1); Views.leave(root); });
    root.querySelectorAll("[data-cal-next]").forEach(b => b.onclick = () => { leaveState.month = new Date(leaveState.month.getFullYear(), leaveState.month.getMonth() + 1, 1); Views.leave(root); });
  } catch (e) {
    root.innerHTML = pageHead("Leave", "Unavailable") + emptyState("Could not load leave", e.message, "alert");
  }
};


/* ---------------- OFFICIAL LEAVE REQUEST FORM PREVIEW & PDF MODAL ---------------- */
window.openLeaveFormPreviewModal = async function(leaveId) {
  try {
    const res = await API.get("/leave-requests/" + leaveId + "/preview");
    const d = res.data;
    const printUrl = "/api/v1/leave-requests/" + leaveId + "/print?token=" + encodeURIComponent(API.token || "");
    const pdfUrl = "/api/v1/leave-requests/" + leaveId + "/pdf?token=" + encodeURIComponent(API.token || "");

    const isApproved = d.status === "approved";
    const statusChip = isApproved
      ? '<span class="chip green">Approved & Signed</span>'
      : (d.status === "pending"
          ? '<span class="chip amber">Pending Multi-Tier Approvals</span>'
          : '<span class="chip red">' + esc(d.status) + '</span>');

    openModal({
      title: "Employees' Leave Request Form",
      sub: esc(d.employee_name) + " (" + esc(d.employee_no || "") + ") · " + esc(d.leave_type) + " · " + d.days + " day(s)",
      wide: true,
      body: '<div class="stack">'
        + '<div class="row-between" style="background:var(--surface-2);padding:10px 14px;border-radius:10px;border:1px solid var(--line);flex-wrap:wrap;gap:10px">'
        + '  <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">'
        +      statusChip
        + '    <span class="tiny muted mono">Ref: LR-' + d.id + '</span>'
        + '  </div>'
        + '  <div class="row" style="gap:8px;flex-wrap:wrap">'
        + '    <a class="btn btn-sm btn-ghost" href="' + esc(printUrl) + '" target="_blank" rel="noopener">' + icon("externalLink", 13) + ' Open Print Tab</a>'
        + '    <button class="btn btn-sm btn-teal" id="modal-leave-print">' + icon("printer", 13) + ' Print Form</button>'
        + '    <a class="btn btn-sm btn-accent" href="' + esc(pdfUrl) + '" target="_blank" download>' + icon("download", 13) + ' Save as PDF</a>'
        + '  </div>'
        + '</div>'
        + '<div class="letter-preview-canvas" style="background:#ede9e0;padding:18px 12px;border-radius:12px;overflow-x:auto">'
        +    d.html
        + '</div>'
        + '</div>',
      footer: '<div class="row" style="width:100%;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
        + '<span class="tiny muted">Airport West Hotel Accra-Ghana &middot; Official HR Leave Record</span>'
        + '<div class="row" style="gap:8px">'
        + '  <button class="btn btn-teal" id="modal-leave-print-foot">' + icon("printer", 14) + ' Print Form</button>'
        + '  <a class="btn btn-accent" href="' + esc(pdfUrl) + '" target="_blank" download>' + icon("download", 14) + ' Save as PDF</a>'
        + '  <button class="btn btn-ghost" data-close-modal>Close</button>'
        + '</div></div>',
    });

    const triggerPrint = () => {
      const sheet = document.getElementById("leave-request-form-sheet");
      if (typeof printLetterHtml === "function" && sheet) {
        printLetterHtml(sheet.outerHTML);
      } else {
        window.open(printUrl, "_blank");
      }
    };
    const p1 = document.getElementById("modal-leave-print");
    const p2 = document.getElementById("modal-leave-print-foot");
    if (p1) p1.onclick = triggerPrint;
    if (p2) p2.onclick = triggerPrint;
  } catch (err) {
    handleErr(err);
  }
};

function openLeaveForm(prefill) {
  const types = (Store.meta && Store.meta.leave_types) || [];
  const user = Store.user;
  const emp = (Store.meta && Store.meta.employees) ? Store.meta.employees.find(e => e.id === user.employee_id) : null;
  
  // Look up department and designation from meta arrays
  const department = emp && emp.department_id 
    ? (Store.meta.departments || []).find(d => d.id === emp.department_id) 
    : null;
  const designation = emp && emp.designation_id 
    ? (Store.meta.designations || []).find(d => d.id === emp.designation_id) 
    : null;
  
  const departmentName = department ? department.name : '';
  const positionTitle = designation ? designation.title : '';
  const dateEmployed = emp?.hire_date || '';
  const currentYear = new Date().getFullYear();

  // Find designated approvers (HoD mapped to department head; Accountant & MD fixed organization-wide)
  const fixedAcc = (Store.meta && Store.meta.fixed_approvers && Store.meta.fixed_approvers.accountant) || (Store.meta?.employees ? Store.meta.employees.find(e => e.id === 4) : null);
  const fixedMd = (Store.meta && Store.meta.fixed_approvers && Store.meta.fixed_approvers.md) || (Store.meta?.employees ? Store.meta.employees.find(e => e.id === 1) : null);

  let hodEmp = null;
  if (department) {
    if (department.head_id) {
      hodEmp = (Store.meta.employees || []).find(e => e.id === department.head_id);
    }
    if (!hodEmp && Store.meta.department_heads) {
      const dh = Store.meta.department_heads.find(h => h.department_id === department.id && h.role_type === 'head');
      if (dh) hodEmp = (Store.meta.employees || []).find(e => e.id === dh.employee_id);
    }
  }
  if (hodEmp && emp && hodEmp.id === emp.id) {
    hodEmp = fixedMd;
  }
  if (!hodEmp && emp && emp.hod_id) {
    hodEmp = (Store.meta.employees || []).find(e => e.id === emp.hod_id);
  }
  if (!hodEmp && emp && emp.manager_id) {
    hodEmp = (Store.meta.employees || []).find(e => e.id === emp.manager_id);
  }
  if (!hodEmp) {
    hodEmp = fixedMd;
  }

  const accEmp = fixedAcc;
  const mdEmp = fixedMd;

  const hodName = hodEmp ? (hodEmp.name + (departmentName ? ' — Head of ' + departmentName : ' (Head of Department)')) : (emp?.hod_name ? emp.hod_name : 'Head of Department');
  const accName = accEmp ? (accEmp.name + ' — Accountant / Finance (Fixed)') : (emp?.accountant_name ? emp.accountant_name + ' — Accountant (Fixed)' : 'Yaw Asante — Accountant (Fixed)');
  const mdName = mdEmp ? (mdEmp.name + ' — Managing Director (Fixed)') : (emp?.md_name ? emp.md_name + ' — Managing Director (Fixed)' : 'Ama Mensah — Managing Director (Fixed)');

  const sigUrl = emp?.signature_url || '';

  // Dynamic leave already taken calculation for current calendar year
  let alreadyTakenDays = 0;
  if (leaveState.balances && leaveState.balances.length) {
    const anlBal = leaveState.balances.find(b => b.leave_type_code === 'ANL') || leaveState.balances[0];
    if (anlBal && typeof anlBal.taken === 'number' && anlBal.taken > 0) {
      alreadyTakenDays = anlBal.taken;
    }
  }
  if (!alreadyTakenDays && Array.isArray(leaveState.requests) && emp) {
    const curYear = new Date().getFullYear();
    alreadyTakenDays = leaveState.requests
      .filter(r => r.employee_id === emp.id && (r.status === 'approved' || r.status === 'completed') && (r.start_date || '').startsWith(String(curYear)))
      .reduce((sum, r) => sum + (Number(r.days) || 0), 0);
  }

  openModal({
    title: "Employees' Leave Request Form",
    sub: "Complete all required fields · Working days exclude weekends and holidays",
    wide: true,
    body: '<form id="leave-request-form" class="stack">'
      + '<div class="card"><div class="card-head"><h3>Employee Information</h3></div><div class="card-body">'
      + '<div class="form-grid">'
      + '<div class="field"><label>Employee Name</label><input class="input" value="' + esc(user.name) + '" readonly></div>'
      + '<div class="field"><label>Date</label><input class="input" type="date" value="' + todayISO() + '" readonly></div>'
      + '<div class="field"><label>Department</label><input class="input" name="department" value="' + esc(departmentName) + '" readonly></div>'
      + '<div class="field"><label>Position</label><input class="input" name="position" value="' + esc(positionTitle) + '" readonly></div>'
      + '</div></div></div>'
      
      + '<div class="card"><div class="card-head"><h3>Reason for Leave</h3></div><div class="card-body">'
      + '<div class="grid grid-2" style="gap:16px">'
      + types.map((t, idx) => '<label class="checkbox-label"><input type="radio" name="leave_type_id" value="' + t.id + '" ' + (idx === 0 ? 'checked' : '') + ' required> <span>' + esc(t.name) + (t.code === 'ANL' ? ' (30 days/yr)' : '') + '</span></label>').join('')
      + '</div>'
      + '<div class="field" style="margin-top:12px"><label>If others, state briefly</label>'
      + '<input class="input" name="reason" placeholder="Describe your reason for leave"></div>'
      + '</div></div>'
      
      + '<div class="card"><div class="card-head"><h3>Leave Requested</h3></div><div class="card-body">'
      + '<div class="form-grid">'
      + '<div class="field"><label>From <span class="req">*</span></label><input class="input" type="date" name="start_date" required value="' + todayISO() + '"></div>'
      + '<div class="field"><label>To <span class="req">*</span></label><input class="input" type="date" name="end_date" required value="' + todayISO() + '"></div>'
      + '</div>'
      + '<div style="background:var(--paper-2);border-radius:12px;padding:16px;margin:12px 0;text-align:center">'
      + '<div class="tiny muted" style="margin-bottom:4px">Leave Duration</div>'
      + '<div style="font-family:var(--serif);font-size:36px;font-weight:500;color:var(--accent)" id="leave-days-display">1</div>'
      + '<div class="tiny muted">working day(s) requested</div>'
      + '</div>'
      + '<div class="form-grid">'
      + '<div class="field"><label>No. of leave already taken</label><input class="input" type="number" name="leave_already_taken" value="' + alreadyTakenDays + '" step="0.5" min="0"></div>'
      + '<div class="field"><label>Date Employed</label><input class="input" type="date" name="date_employed" value="' + esc(dateEmployed) + '" readonly></div>'
      + '<div class="field" style="grid-column:1/-1"><label>Resumption Date <span class="req">*</span></label><input class="input" type="date" name="resumption_date" required style="font-weight:600" title="Auto-calculated from end date or choose custom resumption date"></div>'
      + '</div>'
      + '<input type="hidden" name="days" value="1">'
      + '<div class="field" style="margin-top:12px"><label>Employee Signature <span class="req">*</span></label>'
      + (sigUrl
          ? '<div class="row" style="gap:12px;align-items:center;background:var(--paper-2);padding:10px 14px;border-radius:8px">'
            + '<img src="' + esc(sigUrl) + '" style="max-height:48px;max-width:180px;object-fit:contain;background:#fff;padding:4px 8px;border:1px solid var(--line);border-radius:4px">'
            + '<div style="flex:1"><span class="chip green tiny">✓ Profile Digital Signature Attached</span><input type="hidden" name="employee_signature" value="' + esc(sigUrl) + '">'
            + '<div class="tiny muted" style="margin-top:2px">Official digital signature will be submitted automatically with this application.</div></div>'
            + '<button type="button" class="btn btn-sm btn-ghost" onclick="closeModal();go(&quot;profile&quot;)">Manage</button>'
            + '</div>'
          : '<div class="row" style="gap:8px;align-items:center">'
            + '<input class="input" name="employee_signature" value="' + esc(user.name) + '" placeholder="Type your full name to sign" required style="flex:1">'
            + '<button type="button" class="btn btn-sm btn-ghost" onclick="closeModal();go(&quot;profile&quot;)">Add Signature on Profile</button>'
            + '</div>'
        )
      + '</div></div></div>'
      
      + '<div class="card"><div class="card-head"><h3 style="background:var(--line);padding:8px 12px;margin:-12px -12px 12px;text-transform:uppercase;font-size:12px;letter-spacing:0.5px">Approval Chain (Organisation Use Only)</h3></div><div class="card-body">'
      + '<div class="stack" style="gap:8px"><div class="tiny muted">Leave applications route through the 3-stage authority chain (HoD mapped by department; Accountant & MD fixed organization-wide):</div>'
      + '<div class="form-grid">'
      + '<div class="field"><label>1. Head of Department (HoD)</label><input class="input" value="' + esc(hodName) + '" readonly style="font-weight:500;background:var(--paper-2)"></div>'
      + '<div class="field"><label>2. Accountant / Finance (Fixed)</label><input class="input" value="' + esc(accName) + '" readonly style="font-weight:500;background:var(--paper-2)"></div>'
      + '<div class="field"><label>3. Managing Director (Fixed)</label><input class="input" value="' + esc(mdName) + '" readonly style="font-weight:500;background:var(--paper-2)"></div>'
      + '</div>'
      + '<div class="tiny text-muted" style="color:var(--ink-3)">✓ HoD is mapped dynamically from your department (' + esc(departmentName || 'General') + '). Accountant and Managing Director are fixed for all employees.</div>'
      + '</div></div></div></div>'
      + '</form>',
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button>'
      + '<button class="btn btn-accent" id="submit-leave-request">' + icon("check", 14) + ' Submit Leave Request</button>',
    onMount() {
      const form = document.getElementById('leave-request-form');
      const startInput = form.querySelector('[name="start_date"]');
      const endInput = form.querySelector('[name="end_date"]');
      const daysInput = form.querySelector('[name="days"]');
      const daysDisplay = document.getElementById('leave-days-display');
      const resumptionInput = form.querySelector('[name="resumption_date"]');
      
      // Calculate days and resumption date
      function updateCalculations() {
        const start = new Date(startInput.value);
        const end = new Date(endInput.value);
        if (start && end && start <= end) {
          // Calculate working days
          let days = 0;
          let d = new Date(start);
          while (d <= end) {
            if (d.getDay() !== 0 && d.getDay() !== 6) days++;
            d.setDate(d.getDate() + 1);
          }
          daysInput.value = days;
          if (daysDisplay) {
            daysDisplay.textContent = days;
            daysDisplay.style.transform = 'scale(1.1)';
            setTimeout(() => { daysDisplay.style.transform = 'scale(1)'; }, 150);
          }
          
          // Calculate resumption date (next working day after end) unless manually modified
          if (!resumptionManuallySet || !resumptionInput.value) {
            let resumption = new Date(end);
            resumption.setDate(resumption.getDate() + 1);
            while (resumption.getDay() === 0 || resumption.getDay() === 6) {
              resumption.setDate(resumption.getDate() + 1);
            }
            resumptionInput.value = resumption.toISOString().split('T')[0];
          }
        }
      }
      
      if (daysDisplay) {
        daysDisplay.style.transition = 'transform 0.15s ease-out';
      }
      
      let resumptionManuallySet = false;
      resumptionInput.addEventListener('input', () => { resumptionManuallySet = true; });
      startInput.addEventListener('change', updateCalculations);
      endInput.addEventListener('change', updateCalculations);
      updateCalculations();
      
      document.getElementById('submit-leave-request').onclick = async () => {
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        const fd = new FormData(form);
        const data = {
          employee_id: user.employee_id,
          leave_type_id: Number(fd.get('leave_type_id')),
          start_date: fd.get('start_date'),
          end_date: fd.get('end_date'),
          days: Number(fd.get('days')),
          reason: fd.get('reason') || null,
          leave_already_taken: Number(fd.get('leave_already_taken')) || 0,
          resumption_date: fd.get('resumption_date'),
          employee_signature: fd.get('employee_signature'),
        };
        try {
          await API.post('/leave-requests', data);
          toast('Leave request submitted successfully', 'success');
          closeModal();
          navigate();
        } catch (err) {
          toast(err.message || 'Failed to submit leave request', 'error');
        }
      };
    }
  });
}

function openLeaveTypeForm() {
  formModal({
    title: "Add leave type",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "code", label: "Code", required: true, placeholder: "ANL" },
      { name: "days_per_year", label: "Days per year", type: "number", value: 30, required: true },
      { name: "paid", label: "Paid leave", type: "checkbox", value: true },
      { name: "accrual", label: "Accrual", type: "select", options: ["yearly", "monthly"], value: "yearly" },
      { name: "carry_forward", label: "Carry forward (days)", type: "number", value: 0 },
      { name: "gender_restriction", label: "Gender restriction", type: "select", options: ["", "female", "male"], placeholder: "None" },
      { name: "requires_attachment", label: "Requires attachment", type: "checkbox" },
      { name: "color", label: "Colour", type: "color", value: "#0f766e" },
    ],
    onSubmit: async (data) => { data.carry_forward = data.carry_forward || 0; await API.post("/leave-types", data); await Store.loadMeta(); navigate(); },
  });
}

function openHolidayForm() {
  formModal({
    title: "Add public holiday",
    fields: [
      { name: "name", label: "Holiday", required: true },
      { name: "holiday_date", label: "Date", type: "date", required: true },
      { name: "country", label: "Country", value: "Ghana" },
      { name: "recurring", label: "Recurs annually", type: "checkbox", value: true },
    ],
    onSubmit: async (data) => { await API.post("/holidays", data); navigate(); },
  });
}

function monthCalendar(month, requests, holidays, types) {
  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const dayHols = holidays.filter(h => h.holiday_date === iso);
    const leaves = requests.filter(r => r.start_date <= iso && r.end_date >= iso);
    const isToday = iso === todayISO();
    cells.push('<div class="day ' + (d.getMonth() !== m ? "out" : "") + (isToday ? " today" : "") + '"><div class="num">' + d.getDate() + '</div>'
      + dayHols.map(h => '<div class="ev" style="background:var(--amber)">' + esc(h.name) + '</div>').join("")
      + leaves.slice(0, 3).map(l => '<div class="ev leave" title="' + esc(l.employee_name) + '">' + esc((l.employee_name || "").split(" ")[0]) + ' · ' + esc((l.leave_type_name || "").replace(" Leave", "")) + '</div>').join("")
      + (leaves.length > 3 ? '<div class="tiny muted">+' + (leaves.length - 3) + ' more</div>' : "") + '</div>');
  }
  const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => '<div class="dow">' + d + '</div>').join("");
  return '<div class="card"><div class="card-head"><div><h3>' + month.toLocaleString("en-GB", { month: "long", year: "numeric" }) + '</h3><div class="sub">Team availability and public holidays</div></div>'
    + '<div class="right"><button class="btn btn-ghost btn-sm" data-cal-prev>' + icon("arrowLeft", 13) + '</button><button class="btn btn-ghost btn-sm" data-cal-next>' + icon("arrowRight", 13) + '</button></div></div>'
    + '<div class="card-body"><div class="calendar">' + dows + cells.join("") + '</div>'
    + '<div class="chart-legend" style="margin-top:14px"><span class="item"><span class="swatch" style="background:var(--accent)"></span>Approved / pending leave</span><span class="item"><span class="swatch" style="background:var(--amber)"></span>Public holiday</span></div></div></div>';
}

/* ============================================================ PAYROLL */
const payState = { tab: "runs" };

// These views reuse the same root when switching tabs or refreshing after CRUD.
// Keep one listener per selector and replace its closure with the latest data.
const financeDelegates = new WeakMap();
function onFinanceDelegate(container, eventType, selector, handler) {
  let bindings = financeDelegates.get(container);
  if (!bindings) {
    bindings = new Map();
    financeDelegates.set(container, bindings);
  }
  const key = eventType + ":" + selector;
  const previous = bindings.get(key);
  if (previous) container.removeEventListener(eventType, previous);
  const listener = ev => {
    const target = ev.target && ev.target.closest ? ev.target.closest(selector) : null;
    if (target && container.contains(target)) handler(target, ev);
  };
  bindings.set(key, listener);
  container.addEventListener(eventType, listener);
}

Views.payroll = async function (root) {
  root.innerHTML = pageHead("Payroll", "Loading payroll data…") + spinners(3);
  try {
    const isSelfService = Store.isRole("employee", "manager");
    if (isSelfService) {
      const [slipRes, loanRes] = await Promise.all([
        API.get("/payslips", { per_page: 300 }), API.get("/loans", { per_page: 200 }),
      ]);
      const slips = (slipRes.data || []).map(r => ({
        ...r,
        period_label: r.period_month && r.period_year ? monthName(r.period_month) + " " + r.period_year : ("Run #" + r.run_id),
      }));
      const loans = loanRes.data;
      root.innerHTML = pageHead("Payroll", "Your payslips and salary details.", "", "Compensation")
        + '<div class="grid grid-3" style="margin-bottom:18px">'
        + kpiCard({ label: "Latest net pay", value: money(slips[0] ? slips[0].net : 0), icon: "wallet", tone: "teal", foot: slips[0] ? slips[0].period_label : "Most recent payslip" })
        + kpiCard({ label: "Payslips available", value: slips.length, icon: "file", tone: "blue", foot: "Secure ESS downloads" })
        + kpiCard({ label: "Active advances", value: loans.filter(l => l.status === "active").length, icon: "receipt", tone: "accent", foot: "Salary advances on record" })
        + '</div>'
        + renderTable({
          id: "my-payslips",
          title: "My payslips",
          exportName: "my-payslips",
          filters: [{ key: "period_label", label: "Pay period" }],
          columns: [
            { label: "Payslip", key: "id", render: r => '<b>#' + r.id + '</b>' },
            { label: "Pay period", key: "period_label", render: r => '<b>' + esc(r.period_label) + '</b>' },
            { label: "Gross", sortValue: r => Number(r.gross || 0), render: r => money(r.gross) },
            { label: "PAYE Tax", sortValue: r => Number(r.tax || 0), render: r => money(r.tax) },
            { label: "SSNIT", sortValue: r => Number(r.ssnit || 0), render: r => money(r.ssnit) },
            { label: "Net pay", sortValue: r => Number(r.net || 0), render: r => '<b>' + money(r.net) + '</b>' },
            { label: "", class: "right", sortable: false, render: r => '<button class="btn btn-sm btn-ghost" data-payslip="' + r.id + '">' + icon("eye", 13) + ' View</button>' },
          ], rows: slips, emptyTitle: "No payslips yet",
        });
      onFinanceDelegate(root, "click", "[data-payslip]", (b) => openPayslipModal(Number(b.dataset.payslip)));
      return;
    }

    const [runRes, slipRes, loanRes, compRes] = await Promise.all([
      API.get("/payroll-runs", { per_page: 200 }), API.get("/payslips", { per_page: 500 }),
      API.get("/loans", { per_page: 200 }), API.get("/salary-components", { per_page: 200 }),
    ]);
    const runs = runRes.data;
    const slips = (slipRes.data || []).map(r => ({
      ...r,
      period_label: r.period_month && r.period_year ? monthName(r.period_month) + " " + r.period_year : ("Run #" + r.run_id),
    }));
    const loans = loanRes.data, comps = compRes.data;
    const canRun = Store.canPayroll();
    const canApprove = Store.isRole("super_admin", "hr_admin");
    const bands = (Store.meta && Store.meta.tax_bands) || [];
    const latest = runs[0];

    const tabs = [["runs", "Payroll runs"], ["payslips", "Payslips"], ["loans", "Loans & advances"], ["config", "Salary & tax setup"]];
    let body = "";
    if (payState.tab === "runs") {
      body = renderTable({
        id: "payroll-runs-table",
        exportName: "payroll-runs",
        filters: [
          { key: "period_year", label: "Year" },
          { key: "status", label: "Status" },
        ],
        columns: [
          { label: "Period", sortValue: r => (Number(r.period_year) * 100) + Number(r.period_month), render: r => '<b>' + monthName(r.period_month) + ' ' + r.period_year + '</b>' },
          { label: "Employees", key: "employee_count" },
          { label: "Gross", sortValue: r => Number(r.total_gross || 0), render: r => money(r.total_gross) },
          { label: "PAYE", sortValue: r => Number(r.total_tax || 0), render: r => money(r.total_tax) },
          { label: "Net", sortValue: r => Number(r.total_net || 0), render: r => '<b>' + money(r.total_net) + '</b>' },
          { label: "Status", key: "status", render: r => chip(r.status) },
          { label: "", class: "right", sortable: false, render: r => {
            let btns = '<button class="btn btn-sm btn-ghost" data-run-view="' + r.id + '">View</button> ';
            if (canRun && ["draft", "calculated"].includes(r.status)) btns += '<button class="btn btn-sm btn-soft" data-run-calc="' + r.id + '">Calculate</button> ';
            if (canApprove && r.status === "calculated") btns += '<button class="btn btn-sm btn-soft" data-run-approve="' + r.id + '">Approve</button> ';
            if (canRun && r.status === "approved") btns += '<button class="btn btn-sm btn-soft" data-run-lock="' + r.id + '">Lock</button> ';
            if (canRun && r.status === "locked") btns += '<button class="btn btn-sm btn-accent" data-run-pay="' + r.id + '">Mark paid</button>';
            if (canRun && ["draft", "calculated"].includes(r.status)) btns += ' <button class="btn btn-sm btn-soft" data-run-edit="' + r.id + '">Edit</button> <button class="btn btn-sm btn-danger" data-run-delete="' + r.id + '">Delete</button>';
            return btns;
          } },
        ],
        rows: runs, emptyTitle: "No payroll runs yet", emptyText: "Create a run for the current period.",
      });
    } else if (payState.tab === "payslips") {
      body = renderTable({
        id: "payroll-payslips-table",
        exportName: "payslips-register",
        filters: [
          { key: "period_label", label: "Pay period" },
          { key: "department_name", label: "Department" },
          { key: "run_status", label: "Run status" },
        ],
        columns: [
          { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name, employee_no: r.employee_no }) },
          { label: "Department", key: "department_name", render: r => esc(r.department_name || "—") },
          { label: "Period", key: "period_label", render: r => '<span class="pill-tag">' + esc(r.period_label) + '</span>' },
          { label: "Gross", sortValue: r => Number(r.gross || 0), render: r => money(r.gross) },
          { label: "PAYE", sortValue: r => Number(r.tax || 0), render: r => money(r.tax) },
          { label: "SSNIT & Ded.", sortValue: r => Number(r.ssnit || 0) + Number(r.other_deductions || 0), render: r => money(Number(r.ssnit) + Number(r.other_deductions || 0)) },
          { label: "Net pay", sortValue: r => Number(r.net || 0), render: r => '<b>' + money(r.net) + '</b>' },
          { label: "", class: "right", sortable: false, render: r => '<button class="btn btn-sm btn-ghost" data-payslip="' + r.id + '">View</button>' },
        ], rows: slips, emptyTitle: "No payslips",
      });
    } else if (payState.tab === "loans") {
      body = renderTable({
        id: "payroll-loans-table",
        exportName: "staff-loans-advances",
        filters: [
          { key: "department_name", label: "Department" },
          { key: "loan_type", label: "Type" },
          { key: "status", label: "Status" },
        ],
        columns: [
          { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name }, r.department_name) },
          { label: "Type", key: "loan_type", render: r => '<span style="text-transform:capitalize">' + esc((r.loan_type || "").replace(/_/g, " ")) + '</span>' },
          { label: "Principal", sortValue: r => Number(r.principal || 0), render: r => money(r.principal) },
          { label: "Instalment", sortValue: r => Number(r.instalment || 0), render: r => money(r.instalment) },
          { label: "Balance", sortValue: r => Number(r.balance || 0), render: r => money(r.balance) },
          { label: "Status", key: "status", render: r => chip(r.status) },
          { label: "", class: "right", sortable: false, render: r => canRun && r.status === "pending" ? '<button class="btn btn-sm btn-soft" data-loan-approve="' + r.id + '">Approve</button>' : "" },
        ], rows: loans, emptyTitle: "No loans or advances",
      });
    } else {
      body = '<div class="grid grid-2">'
        + renderTable({
          id: "salary-components-table",
          title: "Salary components",
          sub: "Earnings and deductions",
          actions: canRun ? '<button class="btn btn-sm btn-accent" id="add-comp">' + icon("plus", 13) + ' Add</button>' : "",
          filters: [{ key: "kind", label: "Kind" }],
          columns: [
            { label: "Component", key: "name", render: r => '<b>' + esc(r.name) + '</b> <span class="pill-tag">' + esc(r.code) + '</span>' },
            { label: "Kind", key: "kind", render: r => chip(r.kind === "earning" ? "active" : "locked", r.kind) },
            { label: "Taxable", sortValue: r => r.is_taxable ? 1 : 0, render: r => r.is_taxable ? "Yes" : "No" },
            { label: "Calculation", key: "calculation", render: r => esc(r.calculation || "fixed") },
            ...(canRun ? [{ label: "Actions", sortable: false, render: r => '<button class="btn btn-sm btn-soft" data-comp-edit="' + r.id + '">Edit</button> <button class="btn btn-sm btn-danger" data-comp-delete="' + r.id + '">Delete</button>' }] : []),
          ], rows: comps, emptyTitle: "No components",
        })
        + renderTable({
          id: "paye-bands-table",
          title: "PAYE tax bands",
          sub: "Configurable statutory rules — Ghana GRA",
          columns: [
            { label: "Band", key: "description", render: r => esc(r.description || "—") },
            { label: "From", sortValue: r => Number(r.min_amount || 0), render: r => money(r.min_amount) },
            { label: "To", sortValue: r => r.max_amount ? Number(r.max_amount) : 1e12, render: r => r.max_amount ? money(r.max_amount) : "No limit" },
            { label: "Rate", sortValue: r => Number(r.rate || 0), render: r => '<b>' + (Number(r.rate) * 100).toFixed(1) + '%</b>' },
          ], rows: bands, emptyTitle: "No tax bands",
        })
        + '</div>';
    }

    root.innerHTML = pageHead("Payroll", "Accurate, auditable payroll cycles with configurable statutory rules.",
      canRun ? '<button class="btn btn-ghost" id="pay-export">' + icon("download", 15) + ' Bank schedule CSV</button><button class="btn btn-accent" id="pay-new-run">' + icon("plus", 15) + ' New payroll run</button>' : "", "Compensation")
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Last gross payroll", value: compactMoney(latest ? latest.total_gross : 0), icon: "wallet", tone: "teal", foot: latest ? monthName(latest.period_month) + " " + latest.period_year : "No runs yet" })
      + kpiCard({ label: "PAYE remitted", value: compactMoney(latest ? latest.total_tax : 0), icon: "dollar", tone: "accent", foot: "Statutory deduction" })
      + kpiCard({ label: "Net payable", value: compactMoney(latest ? latest.total_net : 0), icon: "checkCircle", tone: "blue", foot: (latest ? latest.employee_count : 0) + " employees" })
      + kpiCard({ label: "Run status", value: latest ? latest.status.replace(/^\w/, c => c.toUpperCase()) : "None", icon: "lock", tone: "purple", foot: latest && latest.locked_at ? "Locked " + fmtDate(latest.locked_at) : "Awaiting processing" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (payState.tab === t[0] ? "active" : "") + '" data-ptab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-ptab]").forEach(b => b.onclick = () => { payState.tab = b.dataset.ptab; Views.payroll(root); });
    onFinanceDelegate(root, "click", "[data-payslip]", (b) => openPayslipModal(Number(b.dataset.payslip)));
    const nr = root.querySelector("#pay-new-run"); if (nr) nr.onclick = () => openPayrollRunForm();
    const ex = root.querySelector("#pay-export"); if (ex) ex.onclick = () => downloadBankScheduleCSV(latest, slips);
    const comp = root.querySelector("#add-comp"); if (comp) comp.onclick = () => openComponentForm();
    onFinanceDelegate(root, "click", "[data-comp-edit]", b => openComponentForm(comps.find(c => c.id === Number(b.dataset.compEdit))));
    onFinanceDelegate(root, "click", "[data-comp-delete]", b => deleteFinanceRecord("salary-components", b.dataset.compDelete, () => Views.payroll(root)));
    onFinanceDelegate(root, "click", "[data-run-edit]", b => openPayrollRunForm(runs.find(r => r.id === Number(b.dataset.runEdit))));
    onFinanceDelegate(root, "click", "[data-run-delete]", b => deleteFinanceRecord("payroll-runs", b.dataset.runDelete, () => Views.payroll(root)));
    onFinanceDelegate(root, "click", "[data-run-calc]", (b) => runAction("/payroll-runs/" + b.dataset.runCalc + "/calculate", "Payroll calculated", root));
    onFinanceDelegate(root, "click", "[data-run-approve]", (b) => runAction("/payroll-runs/" + b.dataset.runApprove + "/approve", "Payroll approved", root));
    onFinanceDelegate(root, "click", "[data-run-lock]", (b) => runAction("/payroll-runs/" + b.dataset.runLock + "/lock", "Payroll locked", root));
    onFinanceDelegate(root, "click", "[data-run-pay]", (b) => runAction("/payroll-runs/" + b.dataset.runPay + "/pay", "Payroll marked paid", root));
    onFinanceDelegate(root, "click", "[data-run-view]", (b) => openRunPayslips(Number(b.dataset.runView)));
    onFinanceDelegate(root, "click", "[data-loan-approve]", async (b) => {
      try { await API.post("/loans/" + b.dataset.loanApprove + "/approve"); toast("Loan approved", "success"); Views.payroll(root); } catch (e) { handleErr(e); }
    });
  } catch (e) {
    root.innerHTML = pageHead("Payroll", "Unavailable") + emptyState("Could not load payroll", e.message, "alert");
  }
};

function downloadBankScheduleCSV(run, allSlips) {
  if (!run) return toast("No payroll run available", "error");
  const rows = (allSlips || []).filter(s => s.run_id === run.id);
  if (!rows.length) return toast("Calculate the payroll run first to generate bank schedule", "error");
  const period = monthName(run.period_month) + " " + run.period_year;
  const header = "Employee No,Employee Name,Department,Period,Gross (GHS),PAYE Tax (GHS),SSNIT 5.5% (GHS),Other Deductions (GHS),Net Payable (GHS)";
  const lines = rows.map(r => [
    r.employee_no || "",
    '"' + String(r.employee_name || "").replace(/"/g, '""') + '"',
    '"' + String(r.department_name || "").replace(/"/g, '""') + '"',
    '"' + period + '"',
    Number(r.gross || 0).toFixed(2),
    Number(r.tax || 0).toFixed(2),
    Number(r.ssnit || 0).toFixed(2),
    Number(r.other_deductions || 0).toFixed(2),
    Number(r.net || 0).toFixed(2),
  ].join(","));
  const csv = "\uFEFF" + [header].concat(lines).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "meridian-bank-schedule-" + run.period_year + "-" + String(run.period_month).padStart(2, "0") + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast("Downloaded bank payment schedule (" + rows.length + " employees)", "success");
}

async function runAction(path, message, root) {
  try {
    await API.post(path);
    toast(message, "success");
    Views.payroll(root);
  } catch (e) { handleErr(e); }
}

function openPayrollRunForm(run) {
  const r = run || {};
  const now = new Date();
  formModal({
    title: r.id ? "Edit payroll run" : "New payroll run",
    sub: "Calculates PAYE, SSNIT and loan deductions for all active employees",
    fields: [
      { name: "period_month", label: "Month", type: "select", options: Array.from({ length: 12 }).map((_, i) => ({ value: i + 1, label: monthName(i + 1) })), value: r.period_month || now.getMonth() + 1, required: true },
      { name: "period_year", label: "Year", type: "number", value: r.period_year || now.getFullYear(), min: 2000, max: 2100, required: true },
      { name: "notes", label: "Notes", type: "textarea", value: r.notes, full: true },
    ],
    onSubmit: async (data) => {
      if (r.id) {
        await API.put("/payroll-runs/" + r.id, data);
        toast("Run updated. Calculate it again before approval.", "success");
        navigate();
        return;
      }
      data.status = "draft";
      data.prepared_by = Store.user.id;
      const res = await API.post("/payroll-runs", data);
      await API.post("/payroll-runs/" + res.data.id + "/calculate");
      toast("Payroll run created and calculated", "success");
      navigate();
    },
  });
}

function openComponentForm(component) {
  const c = component || {};
  formModal({
    title: c.id ? "Edit salary component" : "Add salary component",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "code", label: "Code", required: true },
      { name: "kind", label: "Type", type: "select", options: ["earning", "deduction"], value: "earning" },
      { name: "is_taxable", label: "Taxable", type: "checkbox", value: true },
      { name: "is_statutory", label: "Statutory", type: "checkbox" },
      { name: "calculation", label: "Calculation", type: "select", options: ["fixed", "percent", "band"], value: "fixed" },
    ].map(f => ({ ...f, value: c[f.name] ?? f.value })),
    onSubmit: async (data) => {
      if (c.id) await API.put("/salary-components/" + c.id, data);
      else await API.post("/salary-components", data);
      navigate();
    },
  });
}

async function openRunPayslips(runId) {
  try {
    const res = await API.get("/payslips", { run_id: runId, per_page: 500 });
    openModal({
      title: "Payroll run payslips",
      sub: res.data.length + " payslips in this run",
      wide: true,
      body: renderTable({
        id: "modal-run-payslips",
        exportName: "payroll-run-" + runId + "-payslips",
        filters: [{ key: "department_name", label: "Department" }],
        columns: [
          { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name, employee_no: r.employee_no }) },
          { label: "Department", key: "department_name", render: r => esc(r.department_name || "—") },
          { label: "Gross", sortValue: r => Number(r.gross || 0), render: r => money(r.gross) },
          { label: "PAYE", sortValue: r => Number(r.tax || 0), render: r => money(r.tax) },
          { label: "Net", sortValue: r => Number(r.net || 0), render: r => '<b>' + money(r.net) + '</b>' },
          { label: "", class: "right", sortable: false, render: r => '<button class="btn btn-sm btn-ghost" data-payslip="' + r.id + '">View</button>' },
        ], rows: res.data, emptyTitle: "No payslips in this run",
      }),
      footer: '<button class="btn btn-ghost" data-close-modal>Close</button>',
      onMount(card) {
        onDelegate(card, "click", "[data-payslip]", (b) => openPayslipModal(Number(b.dataset.payslip)));
      },
    });
  } catch (e) { handleErr(e); }
}

async function openPayslipModal(pid) {
  try {
    const res = await API.get("/payslips/" + pid + "/detail");
    const p = res.data, e = p.employee, run = p.run || {};
    const earnings = p.items.filter(i => i.kind === "earning");
    const deductions = p.items.filter(i => i.kind !== "earning");
    openModal({
      title: "Payslip",
      sub: "Meridian Ghana Ltd · " + (run.period_month ? monthName(run.period_month) + " " + run.period_year : "Period"),
      body: '<div class="payslip-preview"><div class="head"><div><div style="font-family:var(--serif);font-size:19px">Meridian Ghana Ltd</div><div class="tiny muted">15 Independence Avenue, Accra</div></div><div class="right tiny"><div>Payslip #' + p.id + '</div><div>' + esc(e.employee_no) + '</div></div></div>'
      + '<div class="card-pad" style="padding-bottom:4px"><div class="row-between"><div><b>' + esc(e.first_name + " " + e.last_name) + '</b><div class="tiny muted">' + esc(e.designation_title || "") + ' · ' + esc(e.department_name || "") + '</div></div><div class="right tiny muted">Gross<br><b style="font-size:15px;color:var(--ink)">' + money(p.gross) + '</b></div></div></div>'
      + '<div style="margin-top:10px">' + '<div class="section-title" style="padding:0 18px">Earnings</div>'
      + earnings.map(i => '<div class="rowline"><span>' + esc(i.name) + '</span><span>' + money(i.amount) + '</span></div>').join("")
      + '<div class="section-title" style="padding:8px 18px 0">Deductions</div>'
      + deductions.map(i => '<div class="rowline"><span>' + esc(i.name) + '</span><span>−' + money(i.amount) + '</span></div>').join("")
      + '<div class="rowline total"><span>Net pay</span><span>' + money(p.net) + '</span></div></div>'
      + '<div class="card-pad tiny muted" style="padding-top:10px">Paid via bank transfer · Generated by Meridian HR · This is a system-generated payslip.</div></div>',
      footer: '<button class="btn btn-ghost" data-close-modal>Close</button><button class="btn btn-accent" onclick="window.print()">' + icon("download", 14) + ' Print / save PDF</button>',
    });
  } catch (e) { handleErr(e); }
}
