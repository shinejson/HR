/* ============================================================ RECRUITMENT */
const recState = { tab: "pipeline", posting: null };

Views.recruitment = async function (root) {
  root.innerHTML = pageHead("Recruitment", "Loading talent pipeline…") + spinners(3);
  try {
    const [boardRes, intRes, candRes] = await Promise.all([
      API.get("/recruitment/board"), API.get("/interviews", { per_page: 100 }),
      API.get("/candidates", { per_page: 100 }),
    ]);
    const board = boardRes.data.board, postings = boardRes.data.postings;
    const interviews = intRes.data, candidates = candRes.data;
    const allApps = Object.values(board).flatMap(b => b.applications);
    const canRecruit = Store.isRole("super_admin", "hr_admin", "hr_officer", "recruiter");
    if (!recState.posting || !board[recState.posting]) recState.posting = postings[0] ? String(postings[0].id) : null;
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
          + '<select class="select" id="posting-select" style="min-width:220px">' + postings.map(p => '<option value="' + p.id + '"' + (String(p.id) === recState.posting ? " selected" : "") + '>' + esc(p.title) + '</option>').join("") + '</select>'
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
      + kpiCard({ label: "Open roles", value: postings.length, icon: "briefcase", tone: "teal", foot: "Accepting applications" })
      + kpiCard({ label: "Applications", value: allApps.length, icon: "users", tone: "blue", foot: "Across all open roles" })
      + kpiCard({ label: "In interviews", value: allApps.filter(a => a.stage === "interview").length, icon: "calendar", tone: "accent", foot: "Scheduled conversations" })
      + kpiCard({ label: "Offers out", value: allApps.filter(a => a.stage === "offer").length, icon: "star", tone: "purple", foot: "Awaiting acceptance" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (recState.tab === t[0] ? "active" : "") + '" data-rtab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

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
      { name: "application_id", label: "Application", type: "select", options: [], value: appId, required: true, hint: "Application #" + appId },
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
    const [taskRes, offRes] = await Promise.all([API.get("/onboarding-tasks", { per_page: 100 }), API.get("/offboardings", { per_page: 50 })]);
    const tasks = taskRes.data, offs = offRes.data;
    const done = tasks.filter(t => t.status === "completed").length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const canManage = Store.canManage();
    const taskBody = renderTable({
      columns: [
        { label: "Task", render: r => '<b>' + esc(r.title) + '</b>' },
        { label: "Employee", render: r => personCell({ name: r.employee_name }) },
        { label: "Owner", render: r => '<span class="pill-tag">' + esc(r.owner_role || "HR") + '</span>' },
        { label: "Due", render: r => fmtDate(r.due_date) },
        { label: "Status", render: r => canManage ? '<select class="select" style="height:29px;min-width:120px;font-size:11.5px" data-task-status="' + r.id + '">' + ["pending", "in_progress", "completed"].map(s => '<option value="' + s + '"' + (r.status === s ? " selected" : "") + '>' + s.replace("_", " ") + '</option>').join("") + '</select>' : chip(r.status) },
      ],
      rows: tasks, emptyTitle: "No onboarding tasks", emptyText: "Add a task to start a checklist.",
    });
    const offBody = renderTable({
      columns: [
        { label: "Employee", render: r => personCell({ name: r.employee_name }) },
        { label: "Reason", render: r => '<span style="text-transform:capitalize">' + esc((r.reason || "").replace("_", " ")) + '</span>' },
        { label: "Last day", render: r => fmtDate(r.last_day) },
        { label: "Notice", render: r => (r.notice_period_days || 0) + " days" },
        { label: "Status", render: r => chip(r.status) },
        { label: "", class: "right", render: r => canManage && r.status !== "completed" ? '<button class="btn btn-sm btn-soft" data-complete-off="' + r.id + '" data-emp="' + r.employee_id + '">Complete</button>' : "" },
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

    root.querySelectorAll("[data-task-status]").forEach(sel => sel.onchange = async () => {
      try { await API.put("/onboarding-tasks/" + sel.dataset.taskStatus, { status: sel.value }); toast("Task updated", "success"); Views.onboarding(root); }
      catch (e) { handleErr(e); }
    });
    root.querySelectorAll("[data-complete-off]").forEach(b => b.onclick = () => confirmDialog("Complete offboarding", "This marks the offboarding case complete and sets the employee status to resigned.", async () => {
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
const attState = { tab: "records", status: "" };

Views.attendance = async function (root) {
  root.innerHTML = pageHead("Attendance", "Loading time records…") + spinners(3);
  try {
    const [attRes, corrRes] = await Promise.all([
      API.get("/attendance", { per_page: 200, status: attState.status }),
      API.get("/corrections", { per_page: 50 }),
    ]);
    const rows = attRes.data, corrections = corrRes.data;
    const today = todayRecord(rows);
    const mine = Store.user.employee_id;
    const isEmployee = Store.isRole("employee");
    const canManage = Store.canManage() || Store.isRole("manager");
    const monthRows = rows.filter(r => (r.work_date || "").slice(0, 7) === todayISO().slice(0, 7));
    const stats = {
      present: monthRows.filter(r => ["present", "remote"].includes(r.status)).length,
      late: monthRows.filter(r => r.status === "late").length,
      leave: monthRows.filter(r => r.status === "leave").length,
      overtime: monthRows.reduce((a, r) => a + Number(r.overtime_minutes || 0), 0),
    };
    const statuses = ["present", "late", "leave", "absent", "remote"];
    const filtered = attState.status ? rows.filter(r => r.status === attState.status) : rows;

    const recordsTable = renderTable({
      columns: [
        ...(isEmployee ? [] : [{ label: "Employee", render: r => personCell({ name: r.employee_name, employee_no: r.employee_no }) }]),
        { label: "Date", render: r => fmtDate(r.work_date) },
        { label: "Clock in", render: r => r.clock_in ? fmtTime(r.clock_in) : "—" },
        { label: "Clock out", render: r => r.clock_out ? fmtTime(r.clock_out) : "—" },
        { label: "Source", render: r => '<span class="pill-tag">' + esc(r.source || "web") + '</span>' },
        { label: "Overtime", render: r => r.overtime_minutes ? r.overtime_minutes + " min" : "—" },
        { label: "Status", render: r => chip(r.status) },
      ],
      rows: filtered.slice(0, 60), emptyTitle: "No attendance records",
    });

    const corrTable = renderTable({
      columns: [
        { label: "Employee", render: r => personCell({ name: r.employee_name }) },
        { label: "Date", render: r => fmtDate(r.work_date) },
        { label: "Requested in", render: r => esc(r.requested_clock_in || "—") },
        { label: "Requested out", render: r => esc(r.requested_clock_out || "—") },
        { label: "Reason", render: r => '<span class="small">' + esc(r.reason || "—") + '</span>' },
        { label: "Status", render: r => chip(r.status) },
        { label: "", class: "right", render: r => canManage && r.status === "pending" ? '<button class="btn btn-sm btn-soft" data-approve-corr="' + r.id + '">Approve</button>' : "" },
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
      + '<div class="tabs" style="margin-bottom:18px"><button class="tab ' + (attState.tab === "records" ? "active" : "") + '" data-atab="records">Time records</button><button class="tab ' + (attState.tab === "corrections" ? "active" : "") + '" data-atab="corrections">Corrections <span class="tab-count">' + corrections.filter(c => c.status === "pending").length + '</span></button></div>'
      + '<div class="page-enter">' + (attState.tab === "records"
        ? '<div class="toolbar"><select class="select" id="att-filter"><option value="">All statuses</option>' + statuses.map(s => '<option value="' + s + '"' + (attState.status === s ? " selected" : "") + '>' + s[0].toUpperCase() + s.slice(1) + '</option>').join("") + '</select><div class="spacer"></div><span class="tiny muted">Showing latest 60 records</span></div>' + recordsTable
        : corrTable) + '</div>';

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
    const f = root.querySelector("#att-filter");
    if (f) f.onchange = () => { attState.status = f.value; Views.attendance(root); };
    root.querySelectorAll("[data-approve-corr]").forEach(b => b.onclick = async () => {
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
      API.get("/leave-requests", { per_page: 200 }),
      API.get("/leave-types", { per_page: 50 }),
      API.get("/holidays", { per_page: 100 }),
      API.get("/approvals/inbox"),
      API.get("/leave/summary"),
    ]);
    const requests = reqRes.data, types = typeRes.data, holidays = holRes.data;
    const inbox = inboxRes.data.filter(i => i.type === "leave");
    const balances = balRes.data;
    const canManage = Store.canManage();
    const canApprove = Store.isRole("super_admin", "hr_admin", "hr_officer", "manager");
    const myRequests = requests;
    let body = "";

    if (leaveState.tab === "overview") {
      body = '<div class="grid grid-3" style="margin-bottom:18px">'
        + balances.map(b => {
          const left = Number(b.entitled) - Number(b.taken) - Number(b.pending);
          const pct = Number(b.entitled) ? Math.round(left / Number(b.entitled) * 100) : 0;
          return '<div class="card card-pad"><div class="row-between"><div><div class="tiny muted">' + esc(b.leave_type_name) + '</div><div style="font-family:var(--serif);font-size:30px;line-height:1.2">' + left + '<span class="tiny muted" style="font-family:var(--sans)"> / ' + b.entitled + ' days</span></div></div><div class="kpi-icon teal">' + icon("calendar", 16) + '</div></div><div class="progress" style="margin-top:12px"><div class="bar" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></div></div><div class="tiny muted" style="margin-top:6px">' + b.taken + ' taken · ' + b.pending + ' pending</div></div>';
        }).join("") + '</div>'
        + '<div class="card">' + renderTable({
          columns: [
            { label: "Type", render: r => '<b>' + esc(r.leave_type_name) + '</b>' },
            { label: "From", render: r => fmtDate(r.start_date) },
            { label: "To", render: r => fmtDate(r.end_date) },
            { label: "Days", key: "days" },
            { label: "Approver", render: r => esc(Store.employeeName(r.approver_id)) },
            { label: "Status", render: r => chip(r.status) },
            { label: "", class: "right", render: r => r.status === "pending" ? '<button class="btn btn-sm btn-ghost" data-cancel-leave="' + r.id + '">Cancel</button>' : "" },
          ],
          rows: myRequests, emptyTitle: "No leave requests", emptyText: "Apply for leave to see it here.",
        }) + '</div>';
    } else if (leaveState.tab === "calendar") {
      body = monthCalendar(leaveState.month, requests.filter(r => r.status !== "rejected"), holidays, types);
    } else if (leaveState.tab === "approvals") {
      body = inbox.length ? '<div class="grid grid-2">' + inbox.map(a =>
        '<div class="card card-pad"><div class="row-between"><div class="row">' + avatarHTML(a.title, "avatar-sm") + '<div><b class="small">' + esc(a.title) + '</b><div class="tiny muted">' + esc(a.subtitle) + '</div></div></div>' + '<span class="chip chip-amber">Pending</span></div>'
        + '<div class="row" style="gap:8px;margin-top:14px"><button class="btn btn-soft btn-sm" data-approve="' + a.type + '" data-id="' + a.id + '">' + icon("check", 13) + ' Approve</button>'
        + '<button class="btn btn-danger btn-sm" data-reject="' + a.type + '" data-id="' + a.id + '">' + icon("x", 13) + ' Reject</button>'
        + '<span class="tiny muted" style="margin-left:auto">' + timeAgo(a.requested_at) + '</span></div></div>').join("") + '</div>'
        : '<div class="card">' + emptyState("Inbox clear", "No leave requests are waiting for your decision.", "checkCircle") + '</div>';
    } else {
      body = '<div class="grid grid-2"><div class="card"><div class="card-head"><div><h3>Leave types</h3><div class="sub">Policy rules per type</div></div>' + (canManage ? '<div class="right"><button class="btn btn-sm btn-accent" id="add-leave-type">' + icon("plus", 13) + ' Add</button></div>' : "") + '</div>'
        + renderTable({ columns: [
          { label: "Type", render: r => '<span class="row" style="gap:7px"><span style="width:8px;height:8px;border-radius:2px;background:' + esc(r.color || "#0f766e") + '"></span><b>' + esc(r.name) + '</b></span>' },
          { label: "Days/yr", key: "days_per_year" }, { label: "Paid", render: r => r.paid ? "Yes" : "No" },
          { label: "Carry forward", key: "carry_forward" },
        ], rows: types, emptyTitle: "No leave types" }) + '</div>'
        + '<div class="card"><div class="card-head"><div><h3>Public holidays</h3><div class="sub">Applied to working-day calculations</div></div>' + (canManage ? '<div class="right"><button class="btn btn-sm btn-accent" id="add-holiday">' + icon("plus", 13) + ' Add</button></div>' : "") + '</div>'
        + renderTable({ columns: [
          { label: "Holiday", render: r => '<b>' + esc(r.name) + '</b>' },
          { label: "Date", render: r => fmtDate(r.holiday_date) },
          { label: "Country", render: r => esc(r.country || "—") },
        ], rows: holidays, emptyTitle: "No holidays" }) + '</div></div>';
    }

    root.innerHTML = pageHead("Leave", "Policy-driven leave requests, approvals and balances.",
      '<button class="btn btn-ghost" id="leave-team">' + icon("users", 15) + ' Who is away</button><button class="btn btn-accent" id="leave-apply">' + icon("plus", 15) + ' Apply for leave</button>', "Time & absence")
      + '<div class="row wrap" style="margin-bottom:18px;gap:10px">'
      + '<div class="card card-pad" style="flex:1;min-width:150px"><div class="tiny muted">Pending requests</div><b style="font-family:var(--serif);font-size:24px">' + requests.filter(r => r.status === "pending").length + '</b></div>'
      + '<div class="card card-pad" style="flex:1;min-width:150px"><div class="tiny muted">Approved this year</div><b style="font-family:var(--serif);font-size:24px">' + requests.filter(r => r.status === "approved").length + '</b></div>'
      + '<div class="card card-pad" style="flex:1;min-width:150px"><div class="tiny muted">My balance</div><b style="font-family:var(--serif);font-size:24px">' + balances.reduce((a, b) => a + (Number(b.entitled) - Number(b.taken) - Number(b.pending)), 0) + ' days</b></div>'
      + '<div class="card card-pad" style="flex:1;min-width:150px"><div class="tiny muted">Awaiting my decision</div><b style="font-family:var(--serif);font-size:24px">' + inbox.length + '</b></div>'
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">' + leaveTabs.map(t => '<button class="tab ' + (leaveState.tab === t[0] ? "active" : "") + '" data-ltab="' + t[0] + '">' + t[1] + (t[0] === "approvals" && inbox.length ? '<span class="tab-count">' + inbox.length + '</span>' : "") + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-ltab]").forEach(b => b.onclick = () => { leaveState.tab = b.dataset.ltab; Views.leave(root); });
    root.querySelector("#leave-apply").onclick = () => openLeaveForm();
    root.querySelector("#leave-team").onclick = () => { leaveState.tab = "calendar"; Views.leave(root); };
    root.querySelectorAll("[data-cancel-leave]").forEach(b => b.onclick = () => confirmDialog("Cancel leave request", "This will withdraw your pending request.", async () => {
      await API.post("/leave-requests/" + b.dataset.cancelLeave + "/cancel"); toast("Request cancelled", "success"); Views.leave(root);
    }, { confirmLabel: "Cancel request", danger: true }));
    bindApprovalButtons(root);
    const lt = root.querySelector("#add-leave-type"); if (lt) lt.onclick = openLeaveTypeForm;
    const hd = root.querySelector("#add-holiday"); if (hd) hd.onclick = openHolidayForm;
    root.querySelectorAll("[data-cal-prev]").forEach(b => b.onclick = () => { leaveState.month = new Date(leaveState.month.getFullYear(), leaveState.month.getMonth() - 1, 1); Views.leave(root); });
    root.querySelectorAll("[data-cal-next]").forEach(b => b.onclick = () => { leaveState.month = new Date(leaveState.month.getFullYear(), leaveState.month.getMonth() + 1, 1); Views.leave(root); });
  } catch (e) {
    root.innerHTML = pageHead("Leave", "Unavailable") + emptyState("Could not load leave", e.message, "alert");
  }
};

function openLeaveForm(prefill) {
  const types = (Store.meta && Store.meta.leave_types) || [];
  formModal({
    title: "Apply for leave",
    sub: "Working days exclude weekends and public holidays",
    wide: true,
    fields: [
      { name: "leave_type_id", label: "Leave type", type: "select", options: types.map(t => ({ value: t.id, label: t.name })), required: true },
      { name: "employee_id", label: "Employee", type: "select", options: employeeOptions(), value: (prefill && prefill.employee_id) || Store.user.employee_id, required: true, hint: Store.canManage() ? "HR can apply on behalf of an employee" : "" },
      { name: "start_date", label: "Start date", type: "date", required: true, value: todayISO() },
      { name: "end_date", label: "End date", type: "date", required: true, value: todayISO() },
      { name: "half_day", label: "Half day", type: "checkbox" },
      { name: "reason", label: "Reason", type: "textarea", required: true, full: true, placeholder: "Give your manager context for this request" },
    ],
    onSubmit: async (data) => {
      data.employee_id = Number(data.employee_id);
      if (!data.half_day) delete data.half_day;
      await API.post("/leave-requests", data);
      navigate();
    },
  });
}

function openLeaveTypeForm() {
  formModal({
    title: "Add leave type",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "code", label: "Code", required: true, placeholder: "ANL" },
      { name: "days_per_year", label: "Days per year", type: "number", value: 21, required: true },
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

Views.payroll = async function (root) {
  root.innerHTML = pageHead("Payroll", "Loading payroll data…") + spinners(3);
  try {
    const isSelfService = Store.isRole("employee", "manager");
    if (isSelfService) {
      const [slipRes, loanRes] = await Promise.all([
        API.get("/payslips", { per_page: 200 }), API.get("/loans", { per_page: 100 }),
      ]);
      const slips = slipRes.data, loans = loanRes.data;
      root.innerHTML = pageHead("Payroll", "Your payslips and salary details.", "", "Compensation")
        + '<div class="grid grid-3" style="margin-bottom:18px">'
        + kpiCard({ label: "Latest net pay", value: money(slips[0] ? slips[0].net : 0), icon: "wallet", tone: "teal", foot: "Most recent payslip" })
        + kpiCard({ label: "Payslips available", value: slips.length, icon: "file", tone: "blue", foot: "Secure ESS downloads" })
        + kpiCard({ label: "Active advances", value: loans.filter(l => l.status === "active").length, icon: "receipt", tone: "accent", foot: "Salary advances on record" })
        + '</div>'
        + '<div class="card">' + renderTable({
          columns: [
            { label: "Payslip", render: r => '<b>#' + r.id + '</b>' },
            { label: "Gross", render: r => money(r.gross) }, { label: "Tax", render: r => money(r.tax) },
            { label: "SSNIT", render: r => money(r.ssnit) }, { label: "Net", render: r => '<b>' + money(r.net) + '</b>' },
            { label: "", class: "right", render: r => '<button class="btn btn-sm btn-ghost" data-payslip="' + r.id + '">' + icon("eye", 13) + ' View</button>' },
          ], rows: slips, emptyTitle: "No payslips yet",
        }) + '</div>';
      root.querySelectorAll("[data-payslip]").forEach(b => b.onclick = () => openPayslipModal(Number(b.dataset.payslip)));
      return;
    }

    const [runRes, slipRes, loanRes, compRes] = await Promise.all([
      API.get("/payroll-runs", { per_page: 100 }), API.get("/payslips", { per_page: 200 }),
      API.get("/loans", { per_page: 100 }), API.get("/salary-components", { per_page: 100 }),
    ]);
    const runs = runRes.data, slips = slipRes.data, loans = loanRes.data, comps = compRes.data;
    const canRun = Store.canPayroll();
    const canApprove = Store.isRole("super_admin", "hr_admin");
    const bands = (Store.meta && Store.meta.tax_bands) || [];
    const latest = runs[0];

    const tabs = [["runs", "Payroll runs"], ["payslips", "Payslips"], ["loans", "Loans & advances"], ["config", "Salary & tax setup"]];
    let body = "";
    if (payState.tab === "runs") {
      body = renderTable({
        columns: [
          { label: "Period", render: r => '<b>' + monthName(r.period_month) + ' ' + r.period_year + '</b>' },
          { label: "Employees", key: "employee_count" },
          { label: "Gross", render: r => money(r.total_gross) },
          { label: "PAYE", render: r => money(r.total_tax) },
          { label: "Net", render: r => '<b>' + money(r.total_net) + '</b>' },
          { label: "Status", render: r => chip(r.status) },
          { label: "", class: "right", render: r => {
            let btns = '<button class="btn btn-sm btn-ghost" data-run-view="' + r.id + '">View</button> ';
            if (canRun && ["draft", "calculated"].includes(r.status)) btns += '<button class="btn btn-sm btn-soft" data-run-calc="' + r.id + '">Calculate</button> ';
            if (canApprove && r.status === "calculated") btns += '<button class="btn btn-sm btn-soft" data-run-approve="' + r.id + '">Approve</button> ';
            if (canRun && r.status === "approved") btns += '<button class="btn btn-sm btn-soft" data-run-lock="' + r.id + '">Lock</button> ';
            if (canRun && r.status === "locked") btns += '<button class="btn btn-sm btn-accent" data-run-pay="' + r.id + '">Mark paid</button>';
            return btns;
          } },
        ],
        rows: runs, emptyTitle: "No payroll runs yet", emptyText: "Create a run for the current period.",
      });
    } else if (payState.tab === "payslips") {
      body = renderTable({
        columns: [
          { label: "Employee", render: r => personCell({ name: r.employee_name, employee_no: r.employee_no }) },
          { label: "Department", render: r => esc(r.department_name || "—") },
          { label: "Gross", render: r => money(r.gross) }, { label: "PAYE", render: r => money(r.tax) },
          { label: "Deductions", render: r => money(Number(r.ssnit) + Number(r.other_deductions || 0)) },
          { label: "Net", render: r => '<b>' + money(r.net) + '</b>' },
          { label: "", class: "right", render: r => '<button class="btn btn-sm btn-ghost" data-payslip="' + r.id + '">View</button>' },
        ], rows: slips.slice(0, 80), emptyTitle: "No payslips",
      });
    } else if (payState.tab === "loans") {
      body = renderTable({
        columns: [
          { label: "Employee", render: r => personCell({ name: r.employee_name }) },
          { label: "Type", render: r => '<span style="text-transform:capitalize">' + esc((r.loan_type || "").replace("_", " ")) + '</span>' },
          { label: "Principal", render: r => money(r.principal) },
          { label: "Instalment", render: r => money(r.instalment) },
          { label: "Balance", render: r => money(r.balance) },
          { label: "Status", render: r => chip(r.status) },
          { label: "", class: "right", render: r => canRun && r.status === "pending" ? '<button class="btn btn-sm btn-soft" data-loan-approve="' + r.id + '">Approve</button>' : "" },
        ], rows: loans, emptyTitle: "No loans or advances",
      });
    } else {
      body = '<div class="grid grid-2"><div class="card"><div class="card-head"><div><h3>Salary components</h3><div class="sub">Earnings and deductions</div></div><div class="right">' + (canRun ? '<button class="btn btn-sm btn-accent" id="add-comp">' + icon("plus", 13) + ' Add</button>' : "") + '</div></div>'
        + renderTable({ columns: [
          { label: "Component", render: r => '<b>' + esc(r.name) + '</b> <span class="pill-tag">' + esc(r.code) + '</span>' },
          { label: "Kind", render: r => chip(r.kind === "earning" ? "active" : "locked", r.kind) },
          { label: "Taxable", render: r => r.is_taxable ? "Yes" : "No" },
          { label: "Calculation", render: r => esc(r.calculation || "fixed") },
        ], rows: comps, emptyTitle: "No components" }) + '</div>'
        + '<div class="card"><div class="card-head"><div><h3>PAYE tax bands</h3><div class="sub">Configurable statutory rules — Ghana</div></div></div>'
        + renderTable({ columns: [
          { label: "Band", render: r => esc(r.description || "—") },
          { label: "From", render: r => money(r.min_amount) },
          { label: "To", render: r => r.max_amount ? money(r.max_amount) : "No limit" },
          { label: "Rate", render: r => '<b>' + (Number(r.rate) * 100).toFixed(1) + '%</b>' },
        ], rows: bands, emptyTitle: "No tax bands" }) + '</div></div>';
    }

    root.innerHTML = pageHead("Payroll", "Accurate, auditable payroll cycles with configurable statutory rules.",
      canRun ? '<button class="btn btn-ghost" id="pay-export">' + icon("download", 15) + ' Bank file</button><button class="btn btn-accent" id="pay-new-run">' + icon("plus", 15) + ' New payroll run</button>' : "", "Compensation")
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Last gross payroll", value: compactMoney(latest ? latest.total_gross : 0), icon: "wallet", tone: "teal", foot: latest ? monthName(latest.period_month) + " " + latest.period_year : "No runs yet" })
      + kpiCard({ label: "PAYE remitted", value: compactMoney(latest ? latest.total_tax : 0), icon: "dollar", tone: "accent", foot: "Statutory deduction" })
      + kpiCard({ label: "Net payable", value: compactMoney(latest ? latest.total_net : 0), icon: "checkCircle", tone: "blue", foot: (latest ? latest.employee_count : 0) + " employees" })
      + kpiCard({ label: "Run status", value: latest ? latest.status.replace(/^\w/, c => c.toUpperCase()) : "None", icon: "lock", tone: "purple", foot: latest && latest.locked_at ? "Locked " + fmtDate(latest.locked_at) : "Awaiting processing" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (payState.tab === t[0] ? "active" : "") + '" data-ptab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-ptab]").forEach(b => b.onclick = () => { payState.tab = b.dataset.ptab; Views.payroll(root); });
    root.querySelectorAll("[data-payslip]").forEach(b => b.onclick = () => openPayslipModal(Number(b.dataset.payslip)));
    const nr = root.querySelector("#pay-new-run"); if (nr) nr.onclick = openPayrollRunForm;
    const ex = root.querySelector("#pay-export"); if (ex) ex.onclick = () => toast("Bank payment file generated for the latest locked run (CSV).", "success");
    const comp = root.querySelector("#add-comp"); if (comp) comp.onclick = openComponentForm;
    root.querySelectorAll("[data-run-calc]").forEach(b => b.onclick = () => runAction("/payroll-runs/" + b.dataset.runCalc + "/calculate", "Payroll calculated", root));
    root.querySelectorAll("[data-run-approve]").forEach(b => b.onclick = () => runAction("/payroll-runs/" + b.dataset.runApprove + "/approve", "Payroll approved", root));
    root.querySelectorAll("[data-run-lock]").forEach(b => b.onclick = () => runAction("/payroll-runs/" + b.dataset.runLock + "/lock", "Payroll locked", root));
    root.querySelectorAll("[data-run-pay]").forEach(b => b.onclick = () => runAction("/payroll-runs/" + b.dataset.runPay + "/pay", "Payroll marked paid", root));
    root.querySelectorAll("[data-run-view]").forEach(b => b.onclick = () => openRunPayslips(Number(b.dataset.runView)));
    root.querySelectorAll("[data-loan-approve]").forEach(b => b.onclick = async () => {
      try { await API.post("/loans/" + b.dataset.loanApprove + "/approve"); toast("Loan approved", "success"); Views.payroll(root); } catch (e) { handleErr(e); }
    });
  } catch (e) {
    root.innerHTML = pageHead("Payroll", "Unavailable") + emptyState("Could not load payroll", e.message, "alert");
  }
};

async function runAction(path, message, root) {
  try {
    await API.post(path);
    toast(message, "success");
    Views.payroll(root);
  } catch (e) { handleErr(e); }
}

function openPayrollRunForm() {
  const now = new Date();
  formModal({
    title: "New payroll run",
    sub: "Calculates PAYE, SSNIT and loan deductions for all active employees",
    fields: [
      { name: "period_month", label: "Month", type: "select", options: Array.from({ length: 12 }).map((_, i) => ({ value: i + 1, label: monthName(i + 1) })), value: now.getMonth() + 1, required: true },
      { name: "period_year", label: "Year", type: "number", value: now.getFullYear(), required: true },
      { name: "notes", label: "Notes", type: "textarea", full: true },
    ],
    onSubmit: async (data) => {
      data.status = "draft";
      data.prepared_by = Store.user.id;
      const res = await API.post("/payroll-runs", data);
      await API.post("/payroll-runs/" + res.data.id + "/calculate");
      toast("Payroll run created and calculated", "success");
      navigate();
    },
  });
}

function openComponentForm() {
  formModal({
    title: "Add salary component",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "code", label: "Code", required: true },
      { name: "kind", label: "Type", type: "select", options: ["earning", "deduction"], value: "earning" },
      { name: "is_taxable", label: "Taxable", type: "checkbox", value: true },
      { name: "is_statutory", label: "Statutory", type: "checkbox" },
      { name: "calculation", label: "Calculation", type: "select", options: ["fixed", "percent", "band"], value: "fixed" },
    ],
    onSubmit: async (data) => { await API.post("/salary-components", data); navigate(); },
  });
}

async function openRunPayslips(runId) {
  try {
    const res = await API.get("/payslips", { run_id: runId, per_page: 200 });
    openModal({
      title: "Payroll run payslips",
      sub: res.data.length + " payslips in this run",
      wide: true,
      body: renderTable({
        columns: [
          { label: "Employee", render: r => personCell({ name: r.employee_name, employee_no: r.employee_no }) },
          { label: "Gross", render: r => money(r.gross) }, { label: "PAYE", render: r => money(r.tax) },
          { label: "Net", render: r => '<b>' + money(r.net) + '</b>' },
          { label: "", class: "right", render: r => '<button class="btn btn-sm btn-ghost" data-payslip="' + r.id + '">View</button>' },
        ], rows: res.data, emptyTitle: "No payslips in this run",
      }),
      footer: '<button class="btn btn-ghost" data-close-modal>Close</button>',
      onMount(card) {
        card.querySelectorAll("[data-payslip]").forEach(b => b.onclick = () => openPayslipModal(Number(b.dataset.payslip)));
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
