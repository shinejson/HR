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


/* ============================================================ SHIFT MANAGEMENT */
const shiftsState = { tab: "schedules" };
const shiftTabs = [
  ["schedules", "Shifts & Working Hours"],
  ["coverage", "24-Hour Coverage Timeline"],
  ["roster", "Weekly Shift Roster"],
  ["policy", "Lateness & Overtime Rules"],
];

function calcShiftDuration(start, end) {
  if (!start || !end) return "—";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let totalMin = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMin < 0) totalMin += 24 * 60; // Overnight shift past midnight
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return hrs + "h" + (mins > 0 ? " " + mins + "m" : "");
}

function openShiftModal(shift, onSaved) {
  const isEdit = !!shift;
  openFormModal({
    title: isEdit ? "Edit Shift Configuration" : "Create New Operational Shift",
    sub: isEdit ? "Update shift parameters for " + (shift.name || "Shift") : "Define shift code/letter, working hours, grace period, and overtime multiplier",
    submitLabel: isEdit ? "Update Shift" : "Create Shift",
    successMessage: isEdit ? "Shift updated successfully" : "Shift created successfully",
    values: shift ? {
      code: shift.code || "",
      name: shift.name || "",
      start_time: shift.start_time || "08:30",
      end_time: shift.end_time || "17:30",
      grace_minutes: shift.grace_minutes !== undefined ? shift.grace_minutes : 10,
      overtime_multiplier: shift.overtime_multiplier !== undefined ? shift.overtime_multiplier : 1.5,
      is_default: !!shift.is_default,
    } : {
      code: "",
      name: "",
      start_time: "08:30",
      end_time: "17:30",
      grace_minutes: 10,
      overtime_multiplier: 1.5,
      is_default: false,
    },
    fields: [
      { name: "code", label: "Shift Code / Letter", required: true, placeholder: "e.g. M, A, E, N, D", hint: "Short letter/code (e.g. M for Mid, A for Afternoon, E for Early, N for Night)" },
      { name: "name", label: "Shift Name", required: true, placeholder: "e.g. Mid Shift, Afternoon Shift, Early Morning, Night Shift" },
      { name: "start_time", label: "Start Time (HH:MM)", required: true, placeholder: "08:30", hint: "24-hour format HH:MM (e.g. 08:30, 07:00, 22:00)" },
      { name: "end_time", label: "End Time (HH:MM)", required: true, placeholder: "17:30", hint: "24-hour format HH:MM (e.g. 17:30, 16:00, 06:00)" },
      { name: "grace_minutes", label: "Grace Period (Minutes)", type: "number", default: 10, required: true, hint: "Allowed delay after start time before clock-in is marked late" },
      { name: "overtime_multiplier", label: "Overtime Rate Multiplier", type: "number", step: "0.05", default: 1.5, required: true, hint: "e.g. 1.5 for 150% standard overtime rate" },
      { name: "is_default", label: "Set as Default Hotel Baseline Shift", type: "checkbox", default: false, hint: "Used as baseline system shift for clock-in lateness calculations" },
    ],
    onSubmit: async (data) => {
      const payload = {
        name: (data.name || "").trim(),
        code: (data.code || "").trim().toUpperCase(),
        start_time: (data.start_time || "").trim(),
        end_time: (data.end_time || "").trim(),
        grace_minutes: parseInt(data.grace_minutes, 10) || 10,
        overtime_multiplier: parseFloat(data.overtime_multiplier) || 1.5,
        is_default: !!data.is_default,
      };
      if (isEdit) {
        await API.put("/shifts/" + shift.id, payload);
      } else {
        await API.post("/shifts", payload);
      }
      if (typeof DT_STATE_CACHE !== "undefined") {
        DT_STATE_CACHE.delete("shifts::shifts-table");
      }
      if (onSaved) {
        await onSaved();
      }
    }
  });
}

Views.shifts = async function (root, params) {
  if (params && params[0] && ["schedules", "coverage", "roster", "policy"].includes(params[0])) {
    shiftsState.tab = params[0];
  }
  if (typeof DT_STATE_CACHE !== "undefined") {
    DT_STATE_CACHE.delete("shifts::shifts-table");
  }
  root.innerHTML = pageHead("Shift Management", "Loading operational shifts…") + spinners(3);

  try {
    const [shiftsRes, empRes] = await Promise.all([
      API.get("/shifts"),
      API.get("/employees", { per_page: 500 }).catch(() => ({ data: [] }))
    ]);

    const shifts = shiftsRes.data || [];
    const employees = empRes.data || [];
    const canManage = Store.canManage() || Store.isRole("super_admin", "hr_admin", "hr_officer");
    const defaultShift = shifts.find(s => s.is_default) || shifts[0] || null;

    // Header actions
    const actions = canManage
      ? '<button class="btn btn-accent" id="btn-create-shift">' + icon("plus", 14) + ' Create Shift</button>'
      : '';

    // KPIs
    const totalShifts = shifts.length;
    const defaultName = defaultShift ? (defaultShift.name + " (" + defaultShift.start_time + " – " + defaultShift.end_time + ")") : "None";
    const defaultGrace = defaultShift ? (defaultShift.grace_minutes + " mins") : "10 mins";
    const defaultOT = defaultShift ? (Number(defaultShift.overtime_multiplier || 1.5).toFixed(2) + "x") : "1.50x";

    let body = "";

    /* ---------------- TAB 1: SHIFTS & WORKING HOURS ---------------- */
    if (shiftsState.tab === "schedules") {
      body = renderTable({
        id: "shifts-table",
        exportName: "hotel-shifts",
        columns: [
          {
            label: "Code",
            sortKey: "code",
            render: r => '<span class="chip blue mono" style="font-weight:700;font-size:13px;padding:3px 9px;min-width:32px;display:inline-block;text-align:center">' + esc(r.code || "—") + '</span>'
          },
          {
            label: "Shift Name",
            sortKey: "name",
            render: r => '<div><b>' + esc(r.name) + '</b>'
              + (r.is_default ? '<span class="chip teal tiny" style="margin-left:8px">Default Baseline</span>' : '')
              + '<div class="tiny muted">Grace: ' + (r.grace_minutes || 0) + 'm · OT: ' + Number(r.overtime_multiplier || 1.5).toFixed(2) + 'x</div></div>'
          },
          {
            label: "Start Time",
            sortKey: "start_time",
            render: r => '<span class="mono" style="font-weight:600">' + esc(r.start_time) + '</span>'
          },
          {
            label: "End Time",
            sortKey: "end_time",
            render: r => '<span class="mono" style="font-weight:600">' + esc(r.end_time) + '</span>'
          },
          {
            label: "Duration",
            render: r => '<span class="pill-tag">' + calcShiftDuration(r.start_time, r.end_time) + '</span>'
          },
          {
            label: "Grace Period",
            render: r => '<span class="chip grey">' + (r.grace_minutes || 0) + ' min grace</span>'
          },
          {
            label: "Overtime Rate",
            render: r => '<span class="mono">' + Number(r.overtime_multiplier || 1.5).toFixed(2) + 'x</span>'
          },
          {
            label: "Status",
            render: r => r.is_default ? '<span class="chip green">Default</span>' : '<span class="chip grey">Configured</span>'
          },
          {
            label: "",
            class: "right",
            sortable: false,
            render: r => {
              if (!canManage) return "";
              let btns = '<button class="btn btn-sm btn-ghost" data-shift-edit="' + r.id + '">' + icon("edit", 12) + ' Edit</button> ';
              if (!r.is_default) {
                btns += '<button class="btn btn-sm btn-soft" data-shift-default="' + r.id + '">Set Default</button> ';
                btns += '<button class="btn btn-sm btn-danger" data-shift-delete="' + r.id + '">' + icon("trash", 12) + '</button>';
              }
              return btns;
            }
          }
        ],
        rows: shifts,
        emptyTitle: "No operational shifts defined",
        emptyText: "Click 'Create Shift' to configure hotel working hours.",
      });
    }

    /* ---------------- TAB 2: 24-HOUR COVERAGE TIMELINE ---------------- */
    else if (shiftsState.tab === "coverage") {
      const colors = ["#0f766e", "#2563eb", "#7c3aed", "#d97706", "#059669", "#dc2626", "#0284c7"];
      body = '<div class="card" style="margin-bottom:18px"><div class="card-head"><div><h3>24-Hour Hospitality Operational Coverage</h3><div class="sub">Visual timeline of active shift hours across day, evening, and night operations</div></div>'
        + '<div class="right"><span class="tiny muted">' + shifts.length + ' shift patterns configured</span></div></div>'
        + '<div class="card-body">'
        + '<div class="row-between tiny muted mono" style="padding:0 4px;margin-bottom:8px">'
        + '<span>00:00 (Midnight)</span><span>03:00</span><span>06:00 (Morning)</span><span>09:00</span><span>12:00 (Noon)</span><span>15:00</span><span>18:00 (Evening)</span><span>21:00</span><span>24:00</span>'
        + '</div>'
        + '<div style="position:relative;background:var(--paper-2);border:1px solid var(--line);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:12px;">'
        + (shifts.length ? shifts.map((s, idx) => {
            const [sh, sm] = (s.start_time || "00:00").split(":").map(Number);
            const [eh, em] = (s.end_time || "00:00").split(":").map(Number);
            const startPct = Math.min(100, Math.max(0, ((sh * 60 + (sm || 0)) / 1440) * 100));
            const endPct = Math.min(100, Math.max(0, ((eh * 60 + (em || 0)) / 1440) * 100));
            const color = colors[idx % colors.length];

            let barHTML = "";
            if (endPct < startPct) {
              barHTML = '<div style="position:absolute;left:' + startPct + '%;width:' + (100 - startPct) + '%;height:100%;background:' + color + ';border-radius:4px 0 0 4px;opacity:0.88"></div>'
                + '<div style="position:absolute;left:0%;width:' + endPct + '%;height:100%;background:' + color + ';border-radius:0 4px 4px 0;opacity:0.88"></div>';
            } else {
              barHTML = '<div style="position:absolute;left:' + startPct + '%;width:' + Math.max(1, endPct - startPct) + '%;height:100%;background:' + color + ';border-radius:4px;opacity:0.88"></div>';
            }

            return '<div style="display:flex;align-items:center;gap:12px;">'
              + '<div style="width:180px;min-width:180px;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(s.name) + '">'
              + (s.code ? '<span class="chip blue mono tiny" style="font-weight:700;margin-right:6px;padding:2px 6px">' + esc(s.code) + '</span>' : '')
              + (s.is_default ? '<span class="chip teal tiny" style="margin-right:6px">Default</span>' : '')
              + esc(s.name)
              + '</div>'
              + '<div style="position:relative;flex:1;height:26px;background:var(--paper);border-radius:5px;border:1px solid var(--line);overflow:hidden;">'
              + barHTML
              + '</div>'
              + '<div class="mono tiny muted" style="width:120px;text-align:right"><b>' + esc(s.start_time) + ' – ' + esc(s.end_time) + '</b> (' + calcShiftDuration(s.start_time, s.end_time) + ')</div>'
              + '</div>';
          }).join("") : '<div class="small muted">No shifts configured yet.</div>')
        + '</div>'
        + '<div style="margin-top:14px;display:flex;gap:16px;flex-wrap:wrap;font-size:11.5px;" class="muted">'
        + '<span><span style="display:inline-block;width:10px;height:10px;background:#0f766e;border-radius:2px;margin-right:4px;vertical-align:middle"></span> Daytime Operations</span>'
        + '<span><span style="display:inline-block;width:10px;height:10px;background:#2563eb;border-radius:2px;margin-right:4px;vertical-align:middle"></span> Evening / Transition</span>'
        + '<span><span style="display:inline-block;width:10px;height:10px;background:#7c3aed;border-radius:2px;margin-right:4px;vertical-align:middle"></span> Night & Front Desk</span>'
        + '</div>'
        + '</div></div>';
    }

    /* ---------------- TAB 3: WEEKLY SHIFT ROSTER ---------------- */
    else if (shiftsState.tab === "roster") {
      body = '<div id="shifts-embedded-roster-mount" style="min-height:360px"></div>';
    }

    /* ---------------- TAB 4: LATENESS & OVERTIME RULES ---------------- */
    else if (shiftsState.tab === "policy") {
      body = '<div class="grid grid-2">'
        + '<div class="card"><div class="card-head"><div><h3>Lateness Calculation Engine</h3><div class="sub">How clock-ins are evaluated against active shifts</div></div></div>'
        + '<div class="card-body stack" style="gap:12px">'
        + '<div class="skill-item"><div><b style="font-size:13px">1. Baseline Shift Lookup</b>'
        + '<p class="tiny muted" style="margin-top:2px">The attendance engine retrieves the default system shift (currently <b>' + esc(defaultName) + '</b>).</p></div></div>'
        + '<div class="skill-item"><div><b style="font-size:13px">2. Grace Period Application</b>'
        + '<p class="tiny muted" style="margin-top:2px">A buffer of <b>' + defaultGrace + '</b> is added to the start time. Clock-in timestamps on or before this cutoff are recorded as <b>Present</b>.</p></div></div>'
        + '<div class="skill-item"><div><b style="font-size:13px">3. Lateness Trigger & Reporting</b>'
        + '<p class="tiny muted" style="margin-top:2px">Clock-ins exceeding start time + grace minutes are automatically tagged with the <b>Late</b> status on the attendance register and summary reports.</p></div></div>'
        + '</div></div>'

        + '<div class="card"><div class="card-head"><div><h3>Overtime Compensation Rules</h3><div class="sub">Calculation multipliers for excess authorized hours</div></div></div>'
        + '<div class="card-body stack" style="gap:12px">'
        + '<div class="skill-item"><div><b style="font-size:13px">Standard Overtime Multiplier (' + defaultOT + ')</b>'
        + '<p class="tiny muted" style="margin-top:2px">Authorized hours worked past the shift end time are compensated at ' + defaultOT + ' of the basic hourly rate.</p></div></div>'
        + '<div class="skill-item"><div><b style="font-size:13px">Departmental Overrides</b>'
        + '<p class="tiny muted" style="margin-top:2px">Individual shifts can be customized with distinct multipliers (e.g. 2.0x for emergency call-outs or weekend hospitality duties).</p></div></div>'
        + '<div class="skill-item"><div><b style="font-size:13px">Payroll Integration</b>'
        + '<p class="tiny muted" style="margin-top:2px">Accumulated overtime minutes appear automatically on monthly payroll runs as approved attendance additions.</p></div></div>'
        + '</div></div>'
        + '</div>';
    }

    // Render complete page
    root.innerHTML = pageHead("Shift Management", "Configure shift timings, grace periods, overtime rates, and staff schedules.", actions, "Time & Absence")
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Total Shifts", value: totalShifts, icon: "clock", tone: "teal", foot: "Active operational shift definitions" })
      + kpiCard({ label: "Default Shift", value: esc(defaultShift ? defaultShift.name : "None"), icon: "checkCircle", tone: "blue", foot: defaultName })
      + kpiCard({ label: "Grace Period", value: defaultGrace, icon: "sliders", tone: "accent", foot: "Cutoff before lateness is flagged" })
      + kpiCard({ label: "Default Overtime", value: defaultOT, icon: "wallet", tone: "purple", foot: "Hourly overtime pay rate" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">'
      + shiftTabs.map(t =>
          '<button class="tab ' + (shiftsState.tab === t[0] ? "active" : "") + '" data-stab="' + t[0] + '">' + esc(t[1])
          + (t[2] !== undefined ? '<span class="count">' + t[2] + '</span>' : '')
          + '</button>'
        ).join("")
      + '</div>'
      + body;

    // If weekly shift roster tab is active, mount the roster component
    if (shiftsState.tab === "roster") {
      const mount = root.querySelector("#shifts-embedded-roster-mount");
      if (mount && typeof renderRosterComponent === "function") {
        renderRosterComponent(mount, { embedded: true });
      }
    }

    // Bind tab events
    root.querySelectorAll("[data-stab]").forEach(b => {
      b.onclick = () => {
        shiftsState.tab = b.dataset.stab;
        Views.shifts(root);
      };
    });

    // Bind Create Shift
    const createBtn = root.querySelector("#btn-create-shift");
    if (createBtn) {
      createBtn.onclick = () => openShiftModal(null, () => Views.shifts(root));
    }

    // Bind Edit Shift
    root.querySelectorAll("[data-shift-edit]").forEach(b => {
      b.onclick = () => {
        const s = shifts.find(item => String(item.id) === String(b.dataset.shiftEdit));
        if (s) openShiftModal(s, () => Views.shifts(root));
      };
    });

    // Bind Set Default Shift
    root.querySelectorAll("[data-shift-default]").forEach(b => {
      b.onclick = async () => {
        const s = shifts.find(item => String(item.id) === String(b.dataset.shiftDefault));
        if (!s) return;
        try {
          await API.put("/shifts/" + s.id, {
            name: s.name,
            code: s.code,
            start_time: s.start_time,
            end_time: s.end_time,
            grace_minutes: s.grace_minutes,
            overtime_multiplier: s.overtime_multiplier,
            is_default: true,
          });
          toast("Default shift updated to '" + s.name + "'", "success");
          Views.shifts(root);
        } catch (err) {
          handleErr(err);
        }
      };
    });

    // Bind Delete Shift
    root.querySelectorAll("[data-shift-delete]").forEach(b => {
      b.onclick = () => {
        const s = shifts.find(item => String(item.id) === String(b.dataset.shiftDelete));
        if (!s) return;
        confirmDialog(
          "Delete Shift",
          "Are you sure you want to delete shift '" + s.name + "' (" + s.start_time + " – " + s.end_time + ")?",
          async () => {
            try {
              await API.del("/shifts/" + s.id);
              toast("Shift deleted successfully", "success");
              Views.shifts(root);
            } catch (err) {
              handleErr(err);
            }
          },
          { danger: true, confirmLabel: "Delete Shift" }
        );
      };
    });

  } catch (err) {
    root.innerHTML = pageHead("Shift Management", "Error loading shifts") + emptyState("Could not load shifts", err.message, "alert");
  }
};

/* ============================================================ LEAVE */
const leaveState = { tab: "overview", month: new Date(), selectedEmployee: null };
const leaveTabs = [["overview", "Balances & requests"], ["encashment", "Sell Leaves (Encashment)"], ["calendar", "Team calendar"], ["approvals", "Approvals"], ["config", "Types & holidays"]];

Views.leave = async function (root, params) {
  if (params && params[0] && ["balance", "requests", "calendar", "types", "holidays", "encashment"].includes(params[0])) {
    leaveState.tab = params[0];
  }
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
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Taken, Sold & Pending</div><div style="font-family:var(--serif);font-size:28px;line-height:1.2;font-weight:600;color:var(--amber)">' + anlTaken + '<span class="tiny muted" style="font-family:var(--sans);font-weight:400"> tk · ' + (metrics.encashed || 0) + ' sold · ' + anlPending + ' pend</span></div></div><div class="kpi-icon amber">' + icon("clock", 16) + '</div></div>'
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
    } else if (leaveState.tab === "encashment") {
      const encRes = await API.get("/leave-encashments");
      const encashments = encRes.data || [];
      const totalSoldDays = encashments.filter(e => e.status === "approved" || e.status === "paid").reduce((sum, e) => sum + Number(e.days_sold || 0), 0);
      const totalPayoutVal = encashments.filter(e => e.status === "approved" || e.status === "paid").reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
      const pendingCount = encashments.filter(e => e.status === "pending").length;
      const anlAvail = metrics.available !== undefined ? metrics.available : (metrics.remaining || 0);

      const encashKpis = '<div class="grid grid-4" style="margin-bottom:18px">'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Total Leaves Sold</div><div style="font-family:var(--serif);font-size:28px;line-height:1.2;font-weight:700;color:var(--amber)">' + totalSoldDays.toFixed(1) + '<span class="tiny muted" style="font-family:var(--sans);font-weight:400"> days</span></div></div><div class="kpi-icon amber">' + icon("creditCard", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">Deducted from accumulated leave balances</div>'
        + '</div>'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Total Cash Value</div><div style="font-family:var(--serif);font-size:26px;line-height:1.2;font-weight:700;color:var(--teal)">' + money(totalPayoutVal) + '</div></div><div class="kpi-icon teal">' + icon("wallet", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">Commuted financial disbursement</div>'
        + '</div>'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Pending Requests</div><div style="font-family:var(--serif);font-size:28px;line-height:1.2;font-weight:700;color:var(--purple)">' + pendingCount + '</div></div><div class="kpi-icon purple">' + icon("clock", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">Awaiting executive management approval</div>'
        + '</div>'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Available Leave to Sell</div><div style="font-family:var(--serif);font-size:28px;line-height:1.2;font-weight:700;color:var(--green)">' + anlAvail + '<span class="tiny muted" style="font-family:var(--sans);font-weight:400"> days</span></div></div><div class="kpi-icon green">' + icon("checkCircle", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">Eligible for cash buyout</div>'
        + '</div>'
        + '</div>';

      body = encashKpis + renderTable({
        id: "leave-encashments-table",
        title: "Leave Encashment (Sold Leaves) Register",
        sub: "Employees selling accumulated leave for cash payout. Sold leaves are deducted from accumulated balances upon approval.",
        exportName: "leave-encashments",
        actions: '<button class="btn btn-accent" id="open-encash-modal-btn">' + icon("plus", 14) + ' Sell Leaves (Encashment)</button>',
        filters: [
          ...(isEmployee ? [] : [{ key: "department_name", label: "Department" }]),
          { key: "status", label: "Status" },
        ],
        columns: [
          { label: "Ref No", key: "reference_no", render: r => '<span style="font-family:monospace;font-weight:700;color:var(--teal)">' + esc(r.reference_no || "LENC-" + r.id) + '</span>' },
          { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name }, r.department_name) },
          { label: "Days Sold", sortValue: r => Number(r.days_sold || 0), render: r => '<span class="chip amber font-bold">-' + Number(r.days_sold).toFixed(1) + ' days</span>' },
          { label: "Daily Rate", sortValue: r => Number(r.daily_rate || 0), render: r => money(r.daily_rate) },
          { label: "Total Payout", sortValue: r => Number(r.total_amount || 0), render: r => '<b style="color:var(--teal)">' + money(r.total_amount) + '</b>' },
          { label: "Balance After Sale", sortValue: r => Number(r.accumulated_after || 0), render: r => '<span class="mono">' + Number(r.accumulated_after).toFixed(1) + ' days</span>' },
          { label: "Status", key: "status", render: r => chip(r.status) },
          { label: "", class: "right", sortable: false, render: r => {
            let btns = '<button class="btn btn-sm btn-ghost" data-encash-letter="' + r.id + '">' + icon("fileText", 12) + ' Approval Letter</button> ';
            if (canApprove && r.status === "pending") {
              btns += '<button class="btn btn-sm btn-accent" data-encash-approve="' + r.id + '">Approve</button> '
                    + '<button class="btn btn-sm btn-ghost" data-encash-reject="' + r.id + '">Reject</button>';
            }
            return btns;
          }},
        ],
        rows: encashments,
        emptyTitle: "No leave encashments recorded",
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
      '<button class="btn btn-ghost" id="leave-team">' + icon("users", 15) + ' Who is away</button><button class="btn btn-soft" id="leave-sell-head">' + icon("creditCard", 14) + ' Sell leaves</button><button class="btn btn-accent" id="leave-apply">' + icon("plus", 15) + ' Apply for leave</button>', "Time & absence")
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
    const sellHead = root.querySelector("#leave-sell-head");
    if (sellHead) sellHead.onclick = () => window.openLeaveEncashmentModal();
    const openEncash = root.querySelector("#open-encash-modal-btn");
    if (openEncash) openEncash.onclick = () => window.openLeaveEncashmentModal();

    onDelegate(root, "click", "[data-encash-letter]", (b) => {
      window.openLeaveEncashmentLetterModal(b.dataset.encashLetter);
    });
    onDelegate(root, "click", "[data-encash-approve]", async (b) => {
      try {
        await API.post("/leave-encashments/" + b.dataset.encashApprove + "/approve");
        toast("Leave encashment approved & days deducted", "success");
        Views.leave(root);
      } catch (err) { handleErr(err); }
    });
    onDelegate(root, "click", "[data-encash-reject]", (b) => {
      confirmDialog("Reject Encashment", "Reject this leave sale request?", async () => {
        try {
          await API.post("/leave-encashments/" + b.dataset.encashReject + "/reject");
          toast("Leave encashment rejected", "success");
          Views.leave(root);
        } catch (err) { handleErr(err); }
      }, { danger: true, confirmLabel: "Reject" });
    });
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

Views.payroll = async function (root, params) {
  if (params && params[0] && ["runs", "payslips", "loans", "config"].includes(params[0])) {
    payState.tab = params[0];
  }
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
      const loans = loanRes.data || [];
      const totalLoanBal = loans.filter(l => l.status === "active").reduce((sum, l) => sum + Number(l.balance || 0), 0);
      root.innerHTML = pageHead(
        "Payroll & Loans",
        "Your payslips, salary details, and staff loans.",
        '<button class="btn btn-accent" id="ess-request-loan">' + icon("wallet", 14) + ' Request Loan / Advance</button>',
        "Compensation"
      )
        + '<div class="grid grid-4" style="margin-bottom:18px">'
        + kpiCard({ label: "Latest net pay", value: money(slips[0] ? slips[0].net : 0), icon: "wallet", tone: "teal", foot: slips[0] ? slips[0].period_label : "Most recent payslip" })
        + kpiCard({ label: "Payslips available", value: slips.length, icon: "file", tone: "blue", foot: "Secure ESS downloads" })
        + kpiCard({ label: "Active advances", value: loans.filter(l => l.status === "active").length, icon: "receipt", tone: "accent", foot: "Salary advances on record" })
        + kpiCard({ label: "Loan balance remaining", value: money(totalLoanBal), icon: "wallet", tone: "purple", foot: "Repayable via monthly payroll" })
        + '</div>'
        + '<div style="margin-bottom:24px;">'
        + renderTable({
          id: "my-loans-table",
          title: "My Staff Loans & Salary Advances",
          exportName: "my-loans",
          columns: [
            { label: "Ref / Loan", render: r => '<b>' + esc(r.reference_no || ("LOAN-" + r.id)) + '</b><div class="tiny muted" style="text-transform:capitalize">' + esc((r.loan_type || "").replace(/_/g, " ")) + '</div>' },
            { label: "Principal", class: "right mono", render: r => money(r.principal) },
            { label: "Monthly deduction", class: "right mono", render: r => money(r.instalment) },
            { label: "Repayment Progress", render: r => {
              const p = Number(r.principal || 0);
              const b = Number(r.balance !== undefined ? r.balance : p);
              const paid = Math.max(0, p - b);
              const pct = p > 0 ? Math.round((paid / p) * 100) : 0;
              return '<div style="min-width:140px"><div class="row-between tiny muted" style="margin-bottom:3px"><span>' + pct + '%</span><span class="mono">' + money(paid) + '</span></div>'
                + '<div class="loan-progress-wrap"><div class="loan-progress-bar" style="width:' + pct + '%"></div></div></div>';
            } },
            { label: "Remaining", class: "right mono", render: r => '<b style="color:' + (Number(r.balance) <= 0 ? 'var(--green)' : 'inherit') + '">' + money(r.balance) + '</b>' },
            { label: "Status", render: r => chip(r.status) },
            { label: "", class: "right", sortable: false, render: r => {
              return '<button class="btn btn-sm btn-ghost" data-ess-loan-track="' + r.id + '">' + icon("activity", 12) + ' Track</button> '
                + (r.status === 'active' || r.status === 'completed' || r.approved_at ? '<button class="btn btn-sm btn-soft" data-ess-loan-letter="' + r.id + '">' + icon("fileText", 12) + ' Agreement</button>' : '');
            } },
          ],
          rows: loans,
          emptyTitle: "No loans or advances on record",
          emptyText: "Need a salary advance or staff loan? Click 'Request Loan / Advance' above.",
        })
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

      const essReq = root.querySelector("#ess-request-loan");
      if (essReq) essReq.onclick = () => {
        if (typeof window.openLoanRequestModal === "function") window.openLoanRequestModal(Store.user && Store.user.employee_id);
      };
      onFinanceDelegate(root, "click", "[data-payslip]", (b) => openPayslipModal(Number(b.dataset.payslip)));
      onFinanceDelegate(root, "click", "[data-ess-loan-track]", (b) => {
        if (typeof window.openLoanTrackingModal === "function") window.openLoanTrackingModal(b.dataset.essLoanTrack);
      });
      onFinanceDelegate(root, "click", "[data-ess-loan-letter]", (b) => {
        if (typeof window.openLoanLetterModal === "function") window.openLoanLetterModal(b.dataset.essLoanLetter);
      });
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
      const activeCount = loans.filter(l => l.status === "active").length;
      const totalPrincipal = loans.filter(l => l.status === "active" || l.status === "completed").reduce((sum, l) => sum + Number(l.principal || 0), 0);
      const totalBalance = loans.filter(l => l.status === "active").reduce((sum, l) => sum + Number(l.balance || 0), 0);
      const totalRepaid = Math.max(0, totalPrincipal - totalBalance);

      const loanKpis = '<div class="grid grid-4" style="margin-bottom:18px">'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Active Advances</div><div style="font-family:var(--serif);font-size:28px;line-height:1.2;font-weight:700;color:var(--accent)">' + activeCount + '</div></div><div class="kpi-icon accent">' + icon("wallet", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">Currently running staff salary advances</div>'
        + '</div>'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Total Disbursed</div><div style="font-family:var(--serif);font-size:26px;line-height:1.2;font-weight:700;color:var(--teal)">' + money(totalPrincipal) + '</div></div><div class="kpi-icon teal">' + icon("creditCard", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">All active and completed loans</div>'
        + '</div>'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Total Recovered</div><div style="font-family:var(--serif);font-size:26px;line-height:1.2;font-weight:700;color:var(--green)">' + money(totalRepaid) + '</div></div><div class="kpi-icon green">' + icon("checkCircle", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">Recovered via payroll and payments</div>'
        + '</div>'
        + '<div class="card card-pad">'
        + '  <div class="row-between"><div><div class="tiny muted" style="text-transform:uppercase;letter-spacing:0.05em">Outstanding Balance</div><div style="font-family:var(--serif);font-size:26px;line-height:1.2;font-weight:700;color:var(--amber)">' + money(totalBalance) + '</div></div><div class="kpi-icon amber">' + icon("clock", 16) + '</div></div>'
        + '  <div class="tiny muted" style="margin-top:8px">Real-time unamortized balance</div>'
        + '</div>'
        + '</div>';

      body = loanKpis + renderTable({
        id: "payroll-loans-table",
        exportName: "staff-loans-advances",
        actions: '<button class="btn btn-accent" id="open-loan-modal-btn">' + icon("plus", 14) + ' Request Loan / Advance</button>',
        filters: [
          { key: "department_name", label: "Department" },
          { key: "loan_type", label: "Type" },
          { key: "status", label: "Status" },
        ],
        columns: [
          { label: "Ref No", key: "reference_no", render: r => '<span style="font-family:monospace;font-weight:700;color:var(--teal)">' + esc(r.reference_no || 'LOAN-' + r.id) + '</span>' },
          { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name }, r.department_name) },
          { label: "Type", key: "loan_type", render: r => '<span style="text-transform:capitalize">' + esc((r.loan_type || "").replace(/_/g, " ")) + '</span>' },
          { label: "Principal", sortValue: r => Number(r.principal || 0), render: r => money(r.principal) },
          { label: "Instalment", sortValue: r => Number(r.instalment || 0), render: r => money(r.instalment) + '/mo' },
          { label: "Balance", sortValue: r => Number(r.balance || 0), render: r => '<b class="mono">' + money(r.balance) + '</b>' },
          { label: "Repayment Progress", sortValue: r => Number(r.progress_pct || 0), render: r => {
            const p = Number(r.principal || 0);
            const b = Number(r.balance !== undefined ? r.balance : p);
            const paid = Math.max(0, p - b);
            const pct = p > 0 ? Math.round((paid / p) * 100) : 0;
            return '<div class="loan-progress-wrap"><div class="loan-progress-bar" style="width:' + pct + '%"></div></div><div class="tiny muted">' + pct + '% (' + money(paid) + ')</div>';
          }},
          { label: "Status", key: "status", render: r => chip(r.status) },
          { label: "", class: "right", sortable: false, render: r => {
            let btns = '<button class="btn btn-sm btn-ghost" data-loan-track="' + r.id + '">' + icon("activity", 12) + ' Track</button> ';
            if (r.status === "active" || r.status === "completed" || r.approved_at) {
              btns += '<button class="btn btn-sm btn-soft" data-loan-letter="' + r.id + '">' + icon("fileText", 12) + ' Letter</button> ';
            }
            if (canRun && r.status === "pending") {
              btns += '<button class="btn btn-sm btn-accent" data-loan-approve="' + r.id + '">Approve</button> '
                    + '<button class="btn btn-sm btn-ghost" data-loan-reject="' + r.id + '">Reject</button>';
            }
            return btns;
          }},
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
    const openLoanBtn = root.querySelector("#open-loan-modal-btn");
    if (openLoanBtn) openLoanBtn.onclick = () => window.openLoanRequestModal();

    onFinanceDelegate(root, "click", "[data-loan-track]", (b) => {
      window.openLoanTrackingModal(b.dataset.loanTrack);
    });
    onFinanceDelegate(root, "click", "[data-loan-letter]", (b) => {
      window.openLoanLetterModal(b.dataset.loanLetter);
    });
    onFinanceDelegate(root, "click", "[data-loan-approve]", async (b) => {
      try { await API.post("/loans/" + b.dataset.loanApprove + "/approve"); toast("Loan approved", "success"); Views.payroll(root); } catch (e) { handleErr(e); }
    });
    onFinanceDelegate(root, "click", "[data-loan-reject]", (b) => {
      confirmDialog("Reject Loan", "Reject this loan / advance request?", async () => {
        try { await API.post("/loans/" + b.dataset.loanReject + "/reject"); toast("Loan rejected", "success"); Views.payroll(root); } catch (e) { handleErr(e); }
      }, { danger: true, confirmLabel: "Reject" });
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
  a.download = "awh-bank-schedule-" + run.period_year + "-" + String(run.period_month).padStart(2, "0") + ".csv";
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
      sub: "Airport West Hotel Ltd · " + (run.period_month ? monthName(run.period_month) + " " + run.period_year : "Period"),
      body: '<div class="payslip-preview"><div class="head"><div><div style="font-family:var(--serif);font-size:19px">' + esc((Store.meta && Store.meta.company && (Store.meta.company.legal_name || Store.meta.company.name)) || "Airport West Hotel Ltd") + '</div><div class="tiny muted">' + esc((Store.meta && Store.meta.company && (Store.meta.company.address || Store.meta.company.city)) || "Airport Residential Area, Accra") + '</div></div><div class="right tiny"><div>Payslip #' + p.id + '</div><div>' + esc(e.employee_no) + '</div></div></div>'
      + '<div class="card-pad" style="padding-bottom:4px"><div class="row-between"><div><b>' + esc(e.first_name + " " + e.last_name) + '</b><div class="tiny muted">' + esc(e.designation_title || "") + ' · ' + esc(e.department_name || "") + '</div></div><div class="right tiny muted">Gross<br><b style="font-size:15px;color:var(--ink)">' + money(p.gross) + '</b></div></div></div>'
      + '<div style="margin-top:10px">' + '<div class="section-title" style="padding:0 18px">Earnings</div>'
      + earnings.map(i => '<div class="rowline"><span>' + esc(i.name) + '</span><span>' + money(i.amount) + '</span></div>').join("")
      + '<div class="section-title" style="padding:8px 18px 0">Deductions</div>'
      + deductions.map(i => '<div class="rowline"><span>' + esc(i.name) + '</span><span>−' + money(i.amount) + '</span></div>').join("")
      + '<div class="rowline total"><span>Net pay</span><span>' + money(p.net) + '</span></div></div>'
      + '<div class="card-pad tiny muted" style="padding-top:10px">Paid via bank transfer · Generated by Airport West Hotel HR · This is a system-generated payslip.</div></div>',
      footer: '<button class="btn btn-ghost" data-close-modal>Close</button><button class="btn btn-accent" onclick="window.print()">' + icon("download", 14) + ' Print / save PDF</button>',
    });
  } catch (e) { handleErr(e); }
}


/* ============================================================================
   GLOBAL MODALS: REAL-TIME LOAN TRACKING & LEAVE ENCASHMENT
   ============================================================================ */

window.openLoanRequestModal = function (prefillEmpId) {
  const isEmployee = Store.isRole("employee");
  const myEmpId = (Store.user && Store.user.employee_id) || null;
  const targetEmpId = isEmployee ? myEmpId : (prefillEmpId || myEmpId);

  const empOpts = (Store.meta && Store.meta.employees || []).map(e => ({
    value: e.id,
    label: e.full_name + " (" + (e.employee_no || "EMP") + ")"
  }));

  const loanTypes = [
    { value: "salary_advance", label: "Salary Advance" },
    { value: "staff_personal_loan", label: "Staff Personal Loan" },
    { value: "emergency_advance", label: "Emergency Financial Advance" },
    { value: "education_advance", label: "Education / School Fees Advance" },
    { value: "medical_advance", label: "Medical Emergency Advance" },
    { value: "housing_advance", label: "Rent / Housing Advance" },
  ];

  const html = `
    <form id="loan-request-form" style="display:flex;flex-direction:column;gap:14px;">
      <div id="loan-request-err" class="form-error hidden"></div>
      
      ${isEmployee ? `<input type="hidden" id="loan-emp-id" value="${targetEmpId || ''}">` : `
        <div>
          <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Employee</label>
          <select class="input" id="loan-emp-id" required style="width:100%;">
            ${empOpts.map(o => `<option value="${o.value}" ${o.value === targetEmpId ? 'selected' : ''}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
      `}

      <div class="grid grid-2" style="gap:12px;">
        <div>
          <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Loan / Advance Type</label>
          <select class="input" id="loan-type" required style="width:100%;">
            ${loanTypes.map(t => `<option value="${t.value}">${esc(t.label)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Principal Amount (GHS)</label>
          <input type="number" step="0.01" min="1" class="input" id="loan-principal" placeholder="e.g. 1500.00" required style="width:100%;">
        </div>
      </div>

      <div class="grid grid-2" style="gap:12px;">
        <div>
          <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Repayment Duration (Months)</label>
          <select class="input" id="loan-months" required style="width:100%;">
            <option value="1">1 Month (Next Payroll)</option>
            <option value="2">2 Months</option>
            <option value="3" selected>3 Months</option>
            <option value="4">4 Months</option>
            <option value="5">5 Months</option>
            <option value="6">6 Months</option>
            <option value="9">9 Months</option>
            <option value="12">12 Months (1 Year)</option>
            <option value="18">18 Months</option>
            <option value="24">24 Months (2 Years)</option>
          </select>
        </div>
        <div>
          <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Monthly Deduction (GHS)</label>
          <input type="number" step="0.01" class="input" id="loan-instalment" placeholder="Auto-calculated" style="width:100%;">
          <div class="tiny muted" style="margin-top:2px;">Auto-calculated or adjust manually</div>
        </div>
      </div>

      <div class="grid grid-2" style="gap:12px;">
        <div>
          <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Repayment Commencement Date</label>
          <input type="date" class="input" id="loan-start-date" value="${todayISO()}" required style="width:100%;">
        </div>
        <div style="background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid var(--line);display:flex;flex-direction:column;justify-content:center;">
          <div class="tiny muted" style="text-transform:uppercase;font-weight:600;">Projected Total Deduction</div>
          <div style="font-size:16px;font-weight:700;color:var(--teal);" id="loan-calc-preview">GHS 0.00 / month</div>
        </div>
      </div>

      <div>
        <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Reason &amp; Purpose of Loan</label>
        <textarea class="input" id="loan-reason" rows="2" placeholder="e.g. School fees assistance, family medical emergency, rent advance" required style="width:100%;resize:vertical;"></textarea>
      </div>

      <div style="background:#f8fafc;border-left:3px solid var(--teal);padding:8px 12px;font-size:11px;color:var(--text);border-radius:0 6px 6px 0;">
        <strong>Agreement:</strong> Submitting this request authorizes Airport West Hotel Ltd to deduct the agreed installment from your monthly payroll upon approval.
      </div>
    </form>
  `;

  openModal({
    title: "Request Staff Loan / Advance",
    sub: "Submit request with real-time deduction schedule and agreement letter",
    body: html,
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-accent" id="loan-submit-btn">' + icon("send", 14) + ' Submit Request</button>',
    onMount(card) {
      const principalInput = card.querySelector("#loan-principal");
      const monthsSelect = card.querySelector("#loan-months");
      const instalmentInput = card.querySelector("#loan-instalment");
      const preview = card.querySelector("#loan-calc-preview");
      const errEl = card.querySelector("#loan-request-err");

      function updateCalc() {
        const p = parseFloat(principalInput.value) || 0;
        const m = parseInt(monthsSelect.value, 10) || 1;
        if (p > 0 && m > 0) {
          const inst = (p / m).toFixed(2);
          instalmentInput.value = inst;
          preview.textContent = "GHS " + Number(inst).toLocaleString('en-US', { minimumFractionDigits: 2 }) + " / mo for " + m + " mo";
        } else {
          preview.textContent = "GHS 0.00 / month";
        }
      }

      principalInput.oninput = updateCalc;
      monthsSelect.onchange = updateCalc;

      card.querySelector("#loan-submit-btn").onclick = async () => {
        errEl.classList.add("hidden");
        const empId = card.querySelector("#loan-emp-id").value;
        const principal = parseFloat(principalInput.value) || 0;
        const months = parseInt(monthsSelect.value, 10) || 1;
        const instalment = parseFloat(instalmentInput.value) || 0;
        const loanType = card.querySelector("#loan-type").value;
        const startDate = card.querySelector("#loan-start-date").value;
        const reason = card.querySelector("#loan-reason").value.trim();

        if (!empId) {
          errEl.textContent = "Please select an employee.";
          errEl.classList.remove("hidden");
          return;
        }
        if (principal <= 0) {
          errEl.textContent = "Please enter a valid loan principal amount greater than 0.";
          errEl.classList.remove("hidden");
          return;
        }
        if (!reason) {
          errEl.textContent = "Please provide the reason / purpose for this request.";
          errEl.classList.remove("hidden");
          return;
        }

        try {
          const res = await API.post("/loans/request", {
            employee_id: empId,
            principal: principal,
            repayment_months: months,
            instalment: instalment,
            loan_type: loanType,
            start_date: startDate,
            reason: reason,
          });
          toast("Loan request submitted successfully (" + res.data.reference_no + ")", "success");
          closeModal();
          navigate();
        } catch (e) {
          errEl.textContent = e.message || "Failed to submit loan request.";
          errEl.classList.remove("hidden");
        }
      };
    }
  });
};

window.openLoanTrackingModal = async function (loanId) {
  openModal({
    title: "Real-Time Loan Tracker",
    sub: "Live repayment tracking, ledger, and remaining balance",
    wide: true,
    body: spinners(3),
    footer: '<button class="btn btn-ghost" data-close-modal>Close</button>',
    async onMount(card) {
      try {
        const res = await API.get("/loans/" + loanId + "/tracking");
        const l = res.data;
        const canManage = Store.isRole("super_admin", "hr_admin", "payroll");

        const repaymentsHtml = (l.repayments && l.repayments.length)
          ? `<table class="data-table" style="width:100%;margin-top:8px;">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Source / Method</th>
                  <th>Balance Before</th>
                  <th>Balance After</th>
                  <th>Recorded By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${l.repayments.map(r => `
                  <tr>
                    <td class="mono small">${fmtDate(r.repayment_date)}</td>
                    <td><b class="mono" style="color:var(--green)">-${money(r.amount)}</b></td>
                    <td><span class="chip tiny ${r.source === 'payroll_deduction' ? 'teal' : 'amber'}">${esc(r.source.replace(/_/g, ' '))}</span></td>
                    <td class="mono small">${money(r.balance_before)}</td>
                    <td class="mono small font-bold">${money(r.balance_after)}</td>
                    <td class="small">${esc(r.recorded_by_name || 'System')}</td>
                    <td class="small muted">${esc(r.notes || '—')}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>`
          : `<div class="card card-pad small muted" style="text-align:center;padding:24px;">No repayments recorded yet. Automatic deductions occur during monthly payroll.</div>`;

        const bodyHtml = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;background:#f8fafc;padding:10px 14px;border-radius:8px;border:1px solid var(--line);">
            <div>
              <div class="row" style="gap:8px;align-items:center;">
                <span style="font-family:monospace;font-size:14px;font-weight:700;color:var(--teal);">${esc(l.reference_no)}</span>
                <span class="chip tiny" style="text-transform:capitalize;">${esc(l.loan_type.replace(/_/g, ' '))}</span>
              </div>
              <div class="small muted" style="margin-top:2px;">Employee: <b>${esc(l.employee_name)}</b> (${esc(l.employee_no)}) &bull; ${esc(l.department_name)}</div>
            </div>
            <div>${chip(l.status)}</div>
          </div>

          <!-- Real-Time Progress Meter -->
          <div class="card card-pad" style="margin-bottom:14px;background:linear-gradient(135deg, var(--card-bg) 0%, rgba(15,118,110,0.04) 100%);">
            <div class="row-between" style="margin-bottom:6px;">
              <span class="small font-bold">Repayment Progress</span>
              <span class="mono font-bold" style="color:var(--teal);">${l.progress_pct}% (${money(l.total_paid)} of ${money(l.principal)})</span>
            </div>
            <div class="loan-progress-wrap" style="max-width:100%;height:10px;"><div class="loan-progress-bar" style="width:${l.progress_pct}%;"></div></div>
            <div class="row-between tiny muted" style="margin-top:6px;">
              <span>Commenced: ${fmtDate(l.start_date)}</span>
              <span>Projected Maturity: ${l.end_date ? fmtDate(l.end_date) : 'Upon settlement'}</span>
            </div>
          </div>

          <!-- KPI Chips -->
          <div class="loan-tracking-kpis">
            <div class="loan-kpi-chip">
              <div class="lbl">Principal Amount</div>
              <div class="val" style="color:var(--teal);">${money(l.principal)}</div>
            </div>
            <div class="loan-kpi-chip">
              <div class="lbl">Total Repaid</div>
              <div class="val" style="color:var(--green);">${money(l.total_paid)}</div>
            </div>
            <div class="loan-kpi-chip">
              <div class="lbl">Remaining Balance</div>
              <div class="val" style="color:${l.balance <= 0 ? 'var(--green)' : 'var(--amber)'};">${money(l.balance)}</div>
            </div>
            <div class="loan-kpi-chip">
              <div class="lbl">Monthly Deduction</div>
              <div class="val">${money(l.instalment)} / mo</div>
            </div>
            <div class="loan-kpi-chip">
              <div class="lbl">Instalments</div>
              <div class="val">${l.months_paid} paid / ${l.months_remaining} left</div>
            </div>
          </div>

          <!-- Repayments History Section -->
          <div class="row-between" style="margin-top:16px;margin-bottom:8px;">
            <div class="section-title">Repayment Ledger &amp; History</div>
            ${(canManage && (l.status === 'active' || l.status === 'pending') && l.balance > 0)
              ? `<button class="btn btn-sm btn-accent" id="record-repay-btn">${icon("plus", 12)} Record Repayment</button>`
              : ''}
          </div>
          <div id="repay-form-slot"></div>
          ${repaymentsHtml}
        `;

        card.querySelector(".modal-body").innerHTML = bodyHtml;

        card.querySelector(".modal-foot").innerHTML = `
          ${(l.status === 'active' || l.status === 'completed' || l.approved_at)
            ? `<button class="btn btn-ghost" id="open-loan-letter-btn">${icon("fileText", 14)} Official Agreement Letter</button>`
            : ''}
          <button class="btn btn-accent" data-close-modal>Close</button>
        `;

        const letterBtn = card.querySelector("#open-loan-letter-btn");
        if (letterBtn) {
          letterBtn.onclick = () => {
            closeModal();
            window.openLoanLetterModal(loanId);
          };
        }

        const recordBtn = card.querySelector("#record-repay-btn");
        if (recordBtn) {
          recordBtn.onclick = () => {
            const slot = card.querySelector("#repay-form-slot");
            slot.innerHTML = `
              <div class="card card-pad" style="margin-bottom:12px;background:#f0fdf4;border:1px solid #bbf7d0;">
                <div class="row-between" style="margin-bottom:8px;"><b class="small" style="color:#166534;">Record Real-Time Payment / Deduction</b><button class="icon-btn" id="cancel-repay-slot">&times;</button></div>
                <div class="grid grid-3" style="gap:10px;">
                  <div><label class="tiny muted">Amount (GHS)</label><input type="number" step="0.01" class="input" id="repay-amt" value="${Math.min(l.balance, l.instalment || l.balance)}" max="${l.balance}" required></div>
                  <div><label class="tiny muted">Payment Date</label><input type="date" class="input" id="repay-date" value="${todayISO()}"></div>
                  <div><label class="tiny muted">Payment Source</label>
                    <select class="input" id="repay-source">
                      <option value="payroll_deduction">Payroll Deduction</option>
                      <option value="manual_payment" selected>Direct / Cash Payment</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>
                <div style="margin-top:8px;"><input type="text" class="input" id="repay-notes" placeholder="Notes (optional, e.g. Early lump sum settlement)" style="width:100%;"></div>
                <div class="row" style="justify-content:flex-end;margin-top:8px;gap:8px;">
                  <button class="btn btn-sm btn-ghost" id="cancel-repay-btn">Cancel</button>
                  <button class="btn btn-sm btn-accent" id="submit-repay-btn">${icon("check", 12)} Save Repayment</button>
                </div>
              </div>
            `;
            slot.querySelector("#cancel-repay-slot").onclick = () => { slot.innerHTML = ""; };
            slot.querySelector("#cancel-repay-btn").onclick = () => { slot.innerHTML = ""; };
            slot.querySelector("#submit-repay-btn").onclick = async () => {
              const amt = parseFloat(slot.querySelector("#repay-amt").value) || 0;
              const rDate = slot.querySelector("#repay-date").value;
              const rSource = slot.querySelector("#repay-source").value;
              const rNotes = slot.querySelector("#repay-notes").value.trim();
              if (amt <= 0) return toast("Enter a valid amount", "error");
              try {
                await API.post("/loans/" + loanId + "/repay", { amount: amt, repayment_date: rDate, source: rSource, notes: rNotes });
                toast("Repayment recorded successfully", "success");
                window.openLoanTrackingModal(loanId);
              } catch (e) {
                toast(e.message || "Failed to record payment", "error");
              }
            };
          };
        }

      } catch (err) {
        card.querySelector(".modal-body").innerHTML = emptyState("Unable to load loan", err.message, "alert");
      }
    }
  });
};

window.openLoanLetterModal = async function (loanId) {
  openModal({
    title: "Staff Loan Approval Agreement Letter",
    sub: "Official agreement letter for forms submission and record keeping",
    wide: true,
    body: spinners(3),
    footer: '<button class="btn btn-ghost" data-close-modal>Close</button>',
    async onMount(card) {
      try {
        const res = await API.get("/loans/" + loanId + "/letter/preview");
        const docHtml = res.data.html;

        card.querySelector(".modal-body").innerHTML = `
          <div class="official-doc-preview-container">
            ${docHtml}
          </div>
        `;

        card.querySelector(".modal-foot").innerHTML = `
          <a href="/api/v1/loans/${loanId}/letter/print?token=${API.token}" target="_blank" class="btn btn-ghost">${icon("printer", 14)} Print Agreement Letter</a>
          <a href="/api/v1/loans/${loanId}/letter/pdf?token=${API.token}" target="_blank" class="btn btn-accent">${icon("download", 14)} Download PDF</a>
          <button class="btn btn-soft" data-close-modal>Close</button>
        `;
      } catch (e) {
        card.querySelector(".modal-body").innerHTML = emptyState("Unable to load letter", e.message, "alert");
      }
    }
  });
};

window.openLeaveEncashmentModal = async function (prefillEmpId) {
  const isEmployee = Store.isRole("employee");
  const myEmpId = (Store.user && Store.user.employee_id) || null;
  const targetEmpId = isEmployee ? myEmpId : (prefillEmpId || myEmpId);

  const empOpts = (Store.meta && Store.meta.employees || []).map(e => ({
    value: e.id,
    label: e.full_name + " (" + (e.employee_no || "EMP") + ")"
  }));

  const html = `
    <form id="encash-form" style="display:flex;flex-direction:column;gap:14px;">
      <div id="encash-err" class="form-error hidden"></div>
      
      ${isEmployee ? `<input type="hidden" id="encash-emp-id" value="${targetEmpId || ''}">` : `
        <div>
          <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Employee</label>
          <select class="input" id="encash-emp-id" required style="width:100%;">
            ${empOpts.map(o => `<option value="${o.value}" ${o.value === targetEmpId ? 'selected' : ''}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
      `}

      <div id="encash-bal-card" style="background:#f8fafc;padding:12px 14px;border-radius:8px;border:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="tiny muted" style="text-transform:uppercase;font-weight:600;">Available Accumulated Leave</div>
          <div style="font-size:22px;font-weight:700;color:var(--teal);" id="encash-avail-days">Loading balance…</div>
          <div class="tiny muted" id="encash-bal-sub">Checking entitlement for year ${new Date().getFullYear()}</div>
        </div>
        <div class="kpi-icon teal">${icon("calendar", 20)}</div>
      </div>

      <div class="grid grid-2" style="gap:12px;">
        <div>
          <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Days to Sell / Encash</label>
          <input type="number" step="0.5" min="0.5" class="input" id="encash-days" placeholder="e.g. 5.0" required style="width:100%;">
          <div class="tiny muted" style="margin-top:2px;">Deducted from accumulated balance upon approval</div>
        </div>
        <div>
          <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Daily Commutation Rate (GHS)</label>
          <input type="number" step="0.01" class="input" id="encash-rate" placeholder="Auto-calculated" required style="width:100%;">
          <div class="tiny muted" style="margin-top:2px;">Basic monthly salary &divide; 22 working days</div>
        </div>
      </div>

      <div style="background:#f0fdf4;padding:12px 14px;border-radius:8px;border:1px solid #bbf7d0;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div class="tiny" style="color:#166534;font-weight:600;text-transform:uppercase;">Gross Cash Payout Value</div>
          <div style="font-size:20px;font-weight:800;color:#0f766e;" id="encash-total-payout">GHS 0.00</div>
          <div class="tiny" style="color:#166534;">Disbursed in upcoming payroll</div>
        </div>
        <div>
          <div class="tiny" style="color:#166534;font-weight:600;text-transform:uppercase;">Remaining Leave After Sale</div>
          <div style="font-size:20px;font-weight:800;color:#166534;" id="encash-rem-preview">— days</div>
          <div class="tiny" style="color:#166534;">Deduction applied to ledger</div>
        </div>
      </div>

      <div>
        <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Reason / Justification for Sale</label>
        <textarea class="input" id="encash-reason" rows="2" placeholder="e.g. Personal financial requirement, school fees, surplus annual leave commutation" required style="width:100%;resize:vertical;"></textarea>
      </div>

      <div style="background:#f8fafc;border-left:3px solid var(--amber);padding:8px 12px;font-size:11px;color:var(--text);border-radius:0 6px 6px 0;">
        <strong>Notice:</strong> Once approved, the sold leave days are permanently debited from your accumulated statutory leave balance. An official approval letter will be generated for submission with your finance forms.
      </div>
    </form>
  `;

  openModal({
    title: "Sell Leaves (Leave Encashment)",
    sub: "Convert accumulated leave days to cash. Sold days are deducted from your balance.",
    body: html,
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-accent" id="encash-submit-btn">' + icon("creditCard", 14) + ' Submit Encashment Request</button>',
    async onMount(card) {
      const empSelect = card.querySelector("#encash-emp-id");
      const daysInput = card.querySelector("#encash-days");
      const rateInput = card.querySelector("#encash-rate");
      const availEl = card.querySelector("#encash-avail-days");
      const subEl = card.querySelector("#encash-bal-sub");
      const payoutEl = card.querySelector("#encash-total-payout");
      const remEl = card.querySelector("#encash-rem-preview");
      const errEl = card.querySelector("#encash-err");

      let currentAvail = 0;
      let anlTypeId = null;

      async function loadEmpLeave() {
        const empId = empSelect ? empSelect.value : targetEmpId;
        if (!empId) return;
        try {
          const res = await API.get("/leave/summary", { employee_id: empId });
          const anl = (res.data || []).find(b => b.code === "ANL") || (res.data || [])[0];
          anlTypeId = anl ? anl.leave_type_id : null;
          currentAvail = anl ? (anl.available || anl.remaining || 0) : 0;
          availEl.textContent = currentAvail + " working days";
          subEl.textContent = (anl ? esc(anl.leave_type_name) : "Annual Leave") + " &bull; Base: " + (anl ? anl.entitled : 30) + " d" + (anl && anl.carried_over ? " (+" + anl.carried_over + " carry)" : "");
          daysInput.max = currentAvail;

          if (!rateInput.value) {
            const empData = (Store.meta && Store.meta.employees || []).find(e => e.id === Number(empId));
            const sal = empData && empData.basic_salary ? parseFloat(empData.basic_salary) : 2500;
            const rate = (sal / 22.0).toFixed(2);
            rateInput.value = rate;
          }
          updateCalc();
        } catch (e) {
          availEl.textContent = "Unavailable";
        }
      }

      function updateCalc() {
        const d = parseFloat(daysInput.value) || 0;
        const r = parseFloat(rateInput.value) || 0;
        const tot = (d * r).toFixed(2);
        payoutEl.textContent = "GHS " + Number(tot).toLocaleString('en-US', { minimumFractionDigits: 2 });
        const left = Math.max(0, currentAvail - d);
        remEl.textContent = left.toFixed(1) + " days left";
      }

      daysInput.oninput = updateCalc;
      rateInput.oninput = updateCalc;
      if (empSelect) empSelect.onchange = loadEmpLeave;

      await loadEmpLeave();

      card.querySelector("#encash-submit-btn").onclick = async () => {
        errEl.classList.add("hidden");
        const empId = empSelect ? empSelect.value : targetEmpId;
        const days = parseFloat(daysInput.value) || 0;
        const rate = parseFloat(rateInput.value) || 0;
        const reason = card.querySelector("#encash-reason").value.trim();

        if (!empId) {
          errEl.textContent = "Select an employee";
          errEl.classList.remove("hidden");
          return;
        }
        if (days <= 0) {
          errEl.textContent = "Please enter days to sell greater than 0.";
          errEl.classList.remove("hidden");
          return;
        }
        if (days > currentAvail) {
          errEl.textContent = "Cannot sell more than available balance (" + currentAvail + " days).";
          errEl.classList.remove("hidden");
          return;
        }
        if (rate <= 0) {
          errEl.textContent = "Enter a valid daily commutation rate.";
          errEl.classList.remove("hidden");
          return;
        }
        if (!reason) {
          errEl.textContent = "Please state the reason / justification for selling leave days.";
          errEl.classList.remove("hidden");
          return;
        }

        try {
          const res = await API.post("/leave-encashments", {
            employee_id: empId,
            leave_type_id: anlTypeId,
            days_sold: days,
            daily_rate: rate,
            reason: reason,
          });
          toast("Leave encashment requested (" + res.data.reference_no + "). " + days + " days reserved.", "success");
          closeModal();
          navigate();
        } catch (e) {
          errEl.textContent = e.message || "Failed to submit leave encashment request.";
          errEl.classList.remove("hidden");
        }
      };
    }
  });
};

window.openLeaveEncashmentLetterModal = async function (encashmentId) {
  openModal({
    title: "Leave Encashment Approval & Balance Deduction Letter",
    sub: "Official leave buyout certificate and accumulated balance deduction form",
    wide: true,
    body: spinners(3),
    footer: '<button class="btn btn-ghost" data-close-modal>Close</button>',
    async onMount(card) {
      try {
        const res = await API.get("/leave-encashments/" + encashmentId + "/letter/preview");
        const docHtml = res.data.html;

        card.querySelector(".modal-body").innerHTML = `
          <div class="official-doc-preview-container">
            ${docHtml}
          </div>
        `;

        card.querySelector(".modal-foot").innerHTML = `
          <a href="/api/v1/leave-encashments/${encashmentId}/letter/print?token=${API.token}" target="_blank" class="btn btn-ghost">${icon("printer", 14)} Print Encashment Letter</a>
          <a href="/api/v1/leave-encashments/${encashmentId}/letter/pdf?token=${API.token}" target="_blank" class="btn btn-accent">${icon("download", 14)} Download PDF</a>
          <button class="btn btn-soft" data-close-modal>Close</button>
        `;
      } catch (e) {
        card.querySelector(".modal-body").innerHTML = emptyState("Unable to load letter", e.message, "alert");
      }
    }
  });
};
