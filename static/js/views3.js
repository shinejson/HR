/* ============================================================ PERFORMANCE */
const perfState = { tab: "goals" };

Views.performance = async function (root) {
  root.innerHTML = pageHead("Performance", "Loading goals and reviews…") + spinners(3);
  try {
    const [goalRes, apprRes, cycRes] = await Promise.all([
      API.get("/goals", { per_page: 200 }), API.get("/appraisals", { per_page: 200 }),
      API.get("/appraisal-cycles", { per_page: 50 }),
    ]);
    const goals = goalRes.data, appraisals = apprRes.data, cycles = cycRes.data;
    const canReview = Store.isRole("manager", "super_admin", "hr_admin", "hr_officer");
    const avg = goals.length ? Math.round(goals.reduce((a, g) => a + Number(g.progress || 0), 0) / goals.length) : 0;
    const tabs = [["goals", "Goals & OKRs"], ["appraisals", "Appraisals"], ["cycles", "Cycles"]];
    let body = "";

    if (perfState.tab === "goals") {
      body = renderTable({
        columns: [
          { label: "Goal", render: r => '<b>' + esc(r.title) + '</b><div class="tiny muted">' + esc(Store.employeeName(r.employee_id)) + '</div>' },
          { label: "Weight", render: r => r.weight + '%' },
          { label: "Progress", render: r => '<div class="row" style="gap:8px"><div class="progress" style="width:90px"><div class="bar ' + (r.progress >= 80 ? "green" : r.progress < 40 ? "amber" : "") + '" style="width:' + r.progress + '%"></div></div><span class="tiny"><b>' + r.progress + '%</b></span></div>' },
          { label: "Due", render: r => fmtDate(r.due_date) },
          { label: "Status", render: r => chip(r.status) },
          { label: "", class: "right", render: r => '<button class="btn btn-sm btn-ghost" data-goal="' + r.id + '">Update</button>' },
        ], rows: goals, emptyTitle: "No goals set", emptyText: "Create a goal to track progress.",
      });
    } else if (perfState.tab === "appraisals") {
      body = renderTable({
        columns: [
          { label: "Employee", render: r => personCell({ name: r.employee_name }) },
          { label: "Cycle", render: r => esc(r.cycle_name || "—") },
          { label: "Self", render: r => r.self_score || "—" },
          { label: "Manager", render: r => r.manager_score || "—" },
          { label: "Final", render: r => '<b>' + (r.final_score || "—") + '</b>' },
          { label: "Status", render: r => chip(r.status) },
          { label: "", class: "right", render: r => canReview ? '<button class="btn btn-sm btn-soft" data-review="' + r.id + '">Review</button>' : "" },
        ], rows: appraisals, emptyTitle: "No appraisals",
      });
    } else {
      body = renderTable({
        columns: [
          { label: "Cycle", render: r => '<b>' + esc(r.name) + '</b>' },
          { label: "Opens", render: r => fmtDate(r.start_date) },
          { label: "Closes", render: r => fmtDate(r.end_date) },
          { label: "Appraisals", render: r => appraisals.filter(a => a.cycle_id === r.id).length },
          { label: "Status", render: r => chip(r.status) },
        ], rows: cycles, emptyTitle: "No appraisal cycles",
      });
    }

    root.innerHTML = pageHead("Performance", "Align individual goals with company objectives and drive feedback.",
      '<button class="btn btn-ghost" id="perf-cycle">' + icon("calendar", 15) + ' New cycle</button><button class="btn btn-accent" id="perf-goal">' + icon("plus", 15) + ' Add goal</button>', "Talent")
      + '<div class="grid grid-3" style="margin-bottom:18px">'
      + kpiCard({ label: "Average goal progress", value: avg + "%", icon: "target", tone: "teal", foot: goals.length + " goals tracked" })
      + kpiCard({ label: "Reviews completed", value: appraisals.filter(a => ["completed", "submitted"].includes(a.status)).length, icon: "checkCircle", tone: "blue", foot: appraisals.length + " appraisals this cycle" })
      + kpiCard({ label: "Active cycles", value: cycles.filter(c => c.status === "open").length, icon: "calendar", tone: "accent", foot: "Open review windows" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (perfState.tab === t[0] ? "active" : "") + '" data-ftab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-ftab]").forEach(b => b.onclick = () => { perfState.tab = b.dataset.ftab; Views.performance(root); });
    const g = root.querySelector("#perf-goal"); if (g) g.onclick = openGoalForm;
    const c = root.querySelector("#perf-cycle"); if (c) c.onclick = openCycleForm;
    onDelegate(root, "click", "[data-goal]", (b) => {
      const goal = goals.find(x => x.id === Number(b.dataset.goal));
      openGoalProgressForm(goal);
    });
    onDelegate(root, "click", "[data-review]", (b) => {
      const ap = appraisals.find(x => x.id === Number(b.dataset.review));
      openAppraisalForm(ap);
    });
  } catch (e) {
    root.innerHTML = pageHead("Performance", "Unavailable") + emptyState("Could not load performance", e.message, "alert");
  }
};

function openGoalForm() {
  formModal({
    title: "Add goal",
    fields: [
      { name: "employee_id", label: "Employee", type: "select", options: employeeOptions(), value: Store.user.employee_id, required: true },
      { name: "title", label: "Goal", required: true, full: true },
      { name: "weight", label: "Weight (%)", type: "number", value: 25, min: 1, max: 100 },
      { name: "due_date", label: "Due date", type: "date" },
      { name: "description", label: "Description", type: "textarea", full: true },
    ],
    onSubmit: async (data) => { data.progress = 0; data.status = "active"; await API.post("/goals", data); navigate(); },
  });
}

function openGoalProgressForm(goal) {
  formModal({
    title: "Update goal progress",
    sub: goal.title,
    fields: [
      { name: "progress", label: "Progress (%)", type: "number", value: goal.progress, min: 0, max: 100, required: true },
      { name: "status", label: "Status", type: "select", options: ["active", "completed", "on_hold", "cancelled"], value: goal.status },
    ],
    onSubmit: async (data) => { await API.put("/goals/" + goal.id, data); navigate(); },
  });
}

function openAppraisalForm(ap) {
  formModal({
    title: "Appraisal review",
    sub: (ap.employee_name || "") + " · " + (ap.cycle_name || ""),
    wide: true,
    fields: [
      { name: "self_score", label: "Self score (1–5)", type: "number", value: ap.self_score, min: 1, max: 5, step: "0.1" },
      { name: "manager_score", label: "Manager score (1–5)", type: "number", value: ap.manager_score, min: 1, max: 5, step: "0.1" },
      { name: "final_score", label: "Final score", type: "number", value: ap.final_score, min: 1, max: 5, step: "0.1" },
      { name: "status", label: "Status", type: "select", options: ["draft", "self_review", "in_review", "completed"], value: ap.status },
      { name: "self_comments", label: "Employee comments", type: "textarea", value: ap.self_comments, full: true },
      { name: "manager_comments", label: "Manager comments", type: "textarea", value: ap.manager_comments, full: true },
    ],
    onSubmit: async (data) => {
      if (!data.final_score && data.manager_score) data.final_score = data.manager_score;
      await API.put("/appraisals/" + ap.id, data);
      navigate();
    },
  });
}

function openCycleForm() {
  formModal({
    title: "New appraisal cycle",
    fields: [
      { name: "name", label: "Cycle name", required: true, placeholder: "2027 Annual Review" },
      { name: "start_date", label: "Opens", type: "date", value: todayISO() },
      { name: "end_date", label: "Closes", type: "date" },
    ],
    onSubmit: async (data) => { data.status = "open"; await API.post("/appraisal-cycles", data); navigate(); },
  });
}

/* ============================================================ TRAINING */
Views.training = async function (root) {
  root.innerHTML = pageHead("Training", "Loading learning catalogue…") + spinners(3);
  try {
    const [trRes, enRes] = await Promise.all([API.get("/trainings", { per_page: 100 }), API.get("/enrolments", { per_page: 200 })]);
    const trainings = trRes.data, enrolments = enRes.data;
    const completed = enrolments.filter(e => e.status === "completed").length;
    const catalogue = trainings.map(t => {
      const enrolled = enrolments.filter(e => e.training_id === t.id);
      const mine = enrolled.find(e => e.employee_id === Store.user.employee_id);
      return '<div class="card card-pad"><div class="row-between"><span class="chip chip-teal chip-plain">' + esc(t.category || "General") + '</span>' + chip(t.status) + '</div>'
        + '<h4 style="font-family:var(--serif);font-size:19px;font-weight:500;margin-top:10px">' + esc(t.title) + '</h4>'
        + '<div class="tiny muted" style="margin-top:2px">' + esc(t.provider || "") + '</div>'
        + '<div class="row wrap tiny muted" style="gap:12px;margin-top:12px">' + icon("calendar", 12) + '<span>' + fmtDate(t.start_date) + '</span>' + icon("users", 12) + '<span>' + enrolled.length + ' / ' + (t.capacity || "∞") + '</span>' + icon("wallet", 12) + '<span>' + (Number(t.cost) ? money(t.cost) : "Free") + '</span></div>'
        + (t.description ? '<p class="small muted" style="margin-top:10px">' + esc(t.description) + '</p>' : "")
        + '<div class="row" style="margin-top:14px">' + (mine
          ? (mine.status === "completed" ? '<span class="chip chip-green">Completed</span>' : '<button class="btn btn-sm btn-soft" data-complete-training="' + mine.id + '">' + icon("check", 12) + ' Mark complete</button>')
          : '<button class="btn btn-sm btn-accent" data-enrol="' + t.id + '">' + icon("plus", 12) + ' Enrol</button>')
        + '<span class="tiny muted" style="margin-left:auto">' + esc((t.mode || "").replace("_", " ")) + '</span></div></div>';
    }).join("");

    root.innerHTML = pageHead("Training", "Plans, delivers and records employee learning.",
      Store.canManage() ? '<button class="btn btn-accent" id="training-add">' + icon("plus", 15) + ' Add training</button>' : "", "Talent")
      + '<div class="grid grid-3" style="margin-bottom:18px">'
      + kpiCard({ label: "Sessions available", value: trainings.length, icon: "graduation", tone: "teal", foot: "Internal, external and online" })
      + kpiCard({ label: "My enrolments", value: enrolments.filter(e => e.employee_id === Store.user.employee_id).length, icon: "user", tone: "blue", foot: "Learning paths in progress" })
      + kpiCard({ label: "Completed", value: completed, icon: "checkCircle", tone: "accent", foot: "Across the organisation" })
      + '</div>'
      + '<div class="section-title">Training catalogue</div><div class="grid grid-3" style="margin-bottom:22px">' + (catalogue || emptyState("No sessions", "Add a training session to open enrolment.", "graduation")) + '</div>'
      + renderTable({
        id: "training-enrolments-table",
        title: "Enrolments & completion register",
        sub: "Filter by training session, department or status.",
        exportName: "training-enrolments",
        filters: [
          { key: "training_title", label: "Course" },
          { key: "department_name", label: "Department" },
          { key: "status", label: "Status" },
        ],
        columns: [
          { label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name }, r.department_name) },
          { label: "Training", key: "training_title", render: r => '<b>' + esc(r.training_title) + '</b>' },
          { label: "Status", key: "status", render: r => chip(r.status) },
          { label: "Score", sortValue: r => Number(r.score || 0), render: r => r.score ? r.score + "%" : "—" },
          { label: "Completed", key: "completed_at", render: r => fmtDate(r.completed_at) },
        ],
        rows: enrolments, emptyTitle: "No enrolments",
      });

    root.querySelectorAll("[data-enrol]").forEach(b => b.onclick = () => openEnrolForm(Number(b.dataset.enrol)));
    onDelegate(root, "click", "[data-complete-training]", async (b) => {
      try { await API.put("/enrolments/" + b.dataset.completeTraining, { status: "completed", completed_at: todayISO() }); toast("Training completed", "success"); Views.training(root); }
      catch (e) { handleErr(e); }
    });
    const add = root.querySelector("#training-add");
    if (add) add.onclick = openTrainingForm;
  } catch (e) {
    root.innerHTML = pageHead("Training", "Unavailable") + emptyState("Could not load training", e.message, "alert");
  }
};

function openTrainingForm() {
  formModal({
    title: "Add training session",
    wide: true,
    fields: [
      { name: "title", label: "Title", required: true, full: true },
      { name: "provider", label: "Provider", value: "Internal" },
      { name: "category", label: "Category", type: "select", options: ["compliance", "technical", "leadership", "soft_skills", "health_safety"] },
      { name: "mode", label: "Mode", type: "select", options: ["internal", "external", "online"], value: "internal" },
      { name: "cost", label: "Cost (GHS)", type: "number", value: 0, min: 0 },
      { name: "capacity", label: "Capacity", type: "number", value: 20, min: 1 },
      { name: "start_date", label: "Start date", type: "date", required: true },
      { name: "end_date", label: "End date", type: "date" },
      { name: "description", label: "Description", type: "textarea", full: true },
    ],
    onSubmit: async (data) => { data.status = "scheduled"; data.cost = data.cost || 0; await API.post("/trainings", data); navigate(); },
  });
}

function openEnrolForm(trainingId) {
  const canPick = Store.canManage() || Store.isRole("manager");
  formModal({
    title: "Enrol in training",
    fields: [
      ...(canPick ? [{ name: "employee_id", label: "Employee", type: "select", options: employeeOptions(), value: Store.user.employee_id, required: true }] : []),
    ],
    onSubmit: async (data) => {
      await API.post("/enrolments", { training_id: trainingId, employee_id: Number(data.employee_id || Store.user.employee_id), status: "enrolled" });
      navigate();
    },
  });
}

/* ============================================================ EXPENSES */
const claimState = { tab: "claims" };

Views.expenses = async function (root) {
  root.innerHTML = pageHead("Expenses", "Loading claims…") + spinners(3);
  try {
    const [clRes, catRes] = await Promise.all([API.get("/claims", { per_page: 500 }), API.get("/expense-categories", { per_page: 100 })]);
    const claims = clRes.data, cats = catRes.data;
    const mine = claims.filter(c => c.employee_id === Store.user.employee_id);
    const canApprove = Store.isRole("manager", "super_admin", "hr_admin", "payroll");
    const canPay = Store.isRole("super_admin", "hr_admin", "payroll");
    const pendingAmt = claims.filter(c => c.status === "pending").reduce((a, c) => a + Number(c.amount), 0);
    const approvedAmt = claims.filter(c => c.status === "approved").reduce((a, c) => a + Number(c.amount), 0);
    const paidAmt = claims.filter(c => c.status === "paid").reduce((a, c) => a + Number(c.amount), 0);

    const tbl = renderTable({
      id: "expense-claims-table",
      exportName: "expense-claims",
      selectable: canApprove,
      dateField: "claim_date",
      dateLabel: "Expense date",
      filters: [
        ...(Store.isRole("employee") ? [] : [{ key: "department_name", label: "Department" }]),
        { key: "category_name", label: "Category" },
        { key: "status", label: "Status" },
      ],
      bulkActions: [
        ...(canApprove ? [
          {
            label: "Approve selected",
            icon: "check",
            className: "btn-accent",
            onAction: async (ids) => {
              const r = await API.post("/bulk-action", { entity: "expense", action: "approved", ids });
              toast("Approved " + r.data.processed + " claim(s)", "success");
              Views.expenses(root);
            },
          },
          {
            label: "Reject selected",
            icon: "x",
            className: "btn-danger",
            onAction: async (ids) => {
              const r = await API.post("/bulk-action", { entity: "expense", action: "rejected", ids });
              toast("Rejected " + r.data.processed + " claim(s)", "success");
              Views.expenses(root);
            },
          },
        ] : []),
        ...(canPay ? [
          {
            label: "Mark paid",
            icon: "wallet",
            className: "btn-soft",
            onAction: async (ids) => {
              const r = await API.post("/bulk-action", { entity: "expense", action: "paid", ids });
              toast("Marked " + r.data.processed + " claim(s) paid", "success");
              Views.expenses(root);
            },
          },
        ] : []),
      ],
      columns: [
        ...(Store.isRole("employee") ? [] : [{ label: "Employee", sortKey: "employee_name", render: r => personCell({ name: r.employee_name }, r.department_name) }]),
        { label: "Claim", key: "title", render: r => '<b>' + esc(r.title) + '</b><div class="tiny muted">' + esc(r.category_name || "") + '</div>' },
        { label: "Date", key: "claim_date", render: r => fmtDate(r.claim_date) },
        { label: "Amount", sortValue: r => Number(r.amount || 0), render: r => '<b>' + money(r.amount) + '</b>' },
        { label: "Status", key: "status", render: r => chip(r.status) },
        { label: "", class: "right", sortable: false, render: r => {
          let b = "";
          if (canApprove && r.status === "pending") b += '<button class="btn btn-sm btn-soft" data-claim-approve="' + r.id + '">Approve</button> <button class="btn btn-sm btn-danger" data-claim-reject="' + r.id + '">Reject</button>';
          if (canPay && r.status === "approved") b += '<button class="btn btn-sm btn-accent" data-claim-pay="' + r.id + '">Pay</button>';
          return b;
        } },
      ], rows: canApprove ? claims : mine, emptyTitle: "No expense claims", emptyText: "Submit a claim for reimbursement.",
    });

    const catTbl = renderTable({
      id: "expense-categories-table",
      exportName: "expense-categories",
      columns: [
        { label: "Category", key: "name", render: r => '<b>' + esc(r.name) + '</b>' },
        { label: "Limit", sortValue: r => r.limit_amount ? Number(r.limit_amount) : 1e12, render: r => r.limit_amount ? money(r.limit_amount) : "No limit" },
        { label: "Receipt", sortValue: r => r.requires_receipt ? 1 : 0, render: r => r.requires_receipt ? "Required" : "Optional" },
      ], rows: cats, emptyTitle: "No categories",
    });

    root.innerHTML = pageHead("Expenses", "Reimbursement of work-related costs with approval chains.", '<button class="btn btn-accent" id="claim-add">' + icon("plus", 15) + ' New claim</button>', "Compensation")
      + '<div class="grid grid-3" style="margin-bottom:18px">'
      + kpiCard({ label: "Pending reimbursement", value: compactMoney(pendingAmt), icon: "clock", tone: "accent", foot: claims.filter(c => c.status === "pending").length + " claims awaiting approval" })
      + kpiCard({ label: "Approved, unpaid", value: compactMoney(approvedAmt), icon: "checkCircle", tone: "blue", foot: "Ready for finance" })
      + kpiCard({ label: "Paid out", value: compactMoney(paidAmt), icon: "wallet", tone: "teal", foot: "Reimbursed to date" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px"><button class="tab ' + (claimState.tab === "claims" ? "active" : "") + '" data-etab="claims">Claims</button><button class="tab ' + (claimState.tab === "categories" ? "active" : "") + '" data-etab="categories">Categories</button></div>'
      + '<div class="page-enter">' + (claimState.tab === "categories" ? catTbl : tbl) + '</div>';

    root.querySelectorAll("[data-etab]").forEach(b => b.onclick = () => { claimState.tab = b.dataset.etab; Views.expenses(root); });
    root.querySelector("#claim-add").onclick = openClaimForm;
    onDelegate(root, "click", "[data-claim-approve]", (b) => claimAction(b.dataset.claimApprove, "approve", root));
    onDelegate(root, "click", "[data-claim-reject]", (b) => claimAction(b.dataset.claimReject, "reject", root));
    onDelegate(root, "click", "[data-claim-pay]", (b) => claimAction(b.dataset.claimPay, "pay", root));
  } catch (e) {
    root.innerHTML = pageHead("Expenses", "Unavailable") + emptyState("Could not load expenses", e.message, "alert");
  }
};

async function claimAction(id, action, root) {
  try {
    await API.post("/claims/" + id + "/" + action);
    toast("Claim " + (action === "pay" ? "paid" : action + "d"), "success");
    Views.expenses(root);
  } catch (e) { handleErr(e); }
}

function openClaimForm() {
  formModal({
    title: "Submit expense claim",
    sub: "Attach receipts with your manager after submission",
    fields: [
      { name: "title", label: "Claim title", required: true, full: true, placeholder: "e.g. Client visit – Kumasi" },
      { name: "category_id", label: "Category", type: "select", options: (Store.meta.expense_categories || []).map(c => ({ value: c.id, label: c.name })), required: true },
      { name: "amount", label: "Amount (GHS)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "claim_date", label: "Expense date", type: "date", value: todayISO(), required: true },
      { name: "description", label: "Description", type: "textarea", full: true },
    ],
    onSubmit: async (data) => { data.status = "pending"; await API.post("/claims", data); navigate(); },
  });
}

/* ============================================================ ASSETS */
const assetState = { tab: "register" };

Views.assets = async function (root) {
  root.innerHTML = pageHead("Assets", "Loading asset register…") + spinners(3);
  try {
    const [assetRes, assignRes] = await Promise.all([API.get("/assets", { per_page: 200 }), API.get("/asset-assignments", { per_page: 100 })]);
    const assets = assetRes.data, assignments = assignRes.data;
    const assigned = assets.filter(a => a.status === "assigned");
    const totalValue = assets.reduce((a, x) => a + Number(x.value || 0), 0);
    const canManage = Store.canManage();
    const tabs = [["register", "Asset register"], ["assignments", "Assignments"]];
    let body = "";
    if (assetState.tab === "register") {
      body = renderTable({
        columns: [
          { label: "Asset", render: r => '<div class="row">' + '<div class="kpi-icon" style="width:32px;height:32px">' + icon("laptop", 15) + '</div><div><b>' + esc(r.name) + '</b><div class="tiny muted mono">' + esc(r.tag) + '</div></div></div>' },
          { label: "Category", render: r => '<span class="pill-tag">' + esc(r.category || "—") + '</span>' },
          { label: "Serial", render: r => '<span class="mono tiny">' + esc(r.serial_no || "—") + '</span>' },
          { label: "Purchased", render: r => fmtDate(r.purchase_date) },
          { label: "Value", render: r => money(r.value) },
          { label: "Status", render: r => chip(r.status) },
          { label: "", class: "right", render: r => canManage ? (r.status === "assigned" ? '<button class="btn btn-sm btn-ghost" data-return="' + r.id + '">Return</button>' : '<button class="btn btn-sm btn-soft" data-assign="' + r.id + '">Assign</button>') : "" },
        ], rows: assets, emptyTitle: "No assets registered",
      });
    } else {
      body = renderTable({
        columns: [
          { label: "Asset", render: r => '<b>' + esc(r.asset_name) + '</b><div class="tiny muted mono">' + esc(r.asset_tag) + '</div>' },
          { label: "Employee", render: r => personCell({ name: r.employee_name }) },
          { label: "Assigned", render: r => fmtDate(r.assigned_at) },
          { label: "Returned", render: r => r.returned_at ? fmtDate(r.returned_at) : '<span class="chip chip-teal">In use</span>' },
          { label: "Condition", render: r => esc(r.condition_out || "—") },
        ], rows: assignments, emptyTitle: "No assignments",
      });
    }

    root.innerHTML = pageHead("Assets", "Company equipment issued to staff, tracked end to end.",
      canManage ? '<button class="btn btn-accent" id="asset-add">' + icon("plus", 15) + ' Register asset</button>' : "", "Operations")
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Assets registered", value: assets.length, icon: "laptop", tone: "teal", foot: "Across all categories" })
      + kpiCard({ label: "Assigned", value: assigned.length, icon: "user", tone: "blue", foot: "In employee hands" })
      + kpiCard({ label: "Available", value: assets.filter(a => a.status === "available").length, icon: "checkCircle", tone: "accent", foot: "Ready to issue" })
      + kpiCard({ label: "Book value", value: compactMoney(totalValue), icon: "wallet", tone: "purple", foot: "Purchase value" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (assetState.tab === t[0] ? "active" : "") + '" data-astab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-astab]").forEach(b => b.onclick = () => { assetState.tab = b.dataset.astab; Views.assets(root); });
    const add = root.querySelector("#asset-add"); if (add) add.onclick = openAssetForm;
    onDelegate(root, "click", "[data-assign]", (b) => openAssignAssetForm(Number(b.dataset.assign)));
    onDelegate(root, "click", "[data-return]", (b) => confirmDialog("Return asset", "Mark this asset as returned and available?", async () => {
      await API.post("/assets/" + b.dataset.return + "/return", { condition: "good" }); toast("Asset returned", "success"); Views.assets(root);
    }, { confirmLabel: "Return asset" }));
  } catch (e) {
    root.innerHTML = pageHead("Assets", "Unavailable") + emptyState("Could not load assets", e.message, "alert");
  }
};

function openAssetForm() {
  formModal({
    title: "Register asset",
    fields: [
      { name: "name", label: "Asset name", required: true },
      { name: "tag", label: "Asset tag", required: true, placeholder: "AST-LTP-0001" },
      { name: "category", label: "Category", type: "select", options: ["laptop", "monitor", "phone", "furniture", "vehicle", "other"], value: "laptop" },
      { name: "serial_no", label: "Serial number" },
      { name: "purchase_date", label: "Purchase date", type: "date", value: todayISO() },
      { name: "value", label: "Purchase value (GHS)", type: "number", value: 0, min: 0 },
      { name: "notes", label: "Notes", type: "textarea", full: true },
    ],
    onSubmit: async (data) => { data.status = "available"; data.value = data.value || 0; await API.post("/assets", data); navigate(); },
  });
}

function openAssignAssetForm(assetId) {
  formModal({
    title: "Assign asset",
    fields: [
      { name: "employee_id", label: "Assign to", type: "select", options: employeeOptions(), required: true },
      { name: "condition", label: "Condition at issue", type: "select", options: ["good", "fair", "new"], value: "good" },
    ],
    onSubmit: async (data) => { await API.post("/assets/" + assetId + "/assign", data); navigate(); },
  });
}

/* ============================================================ HELPDESK */
const helpState = { tab: "all" };

Views.helpdesk = async function (root) {
  root.innerHTML = pageHead("Helpdesk", "Loading tickets…") + spinners(3);
  try {
    const res = await API.get("/tickets", { per_page: 500 });
    const tickets = res.data;
    const filtered = helpState.tab === "all" ? tickets : tickets.filter(t => t.status === helpState.tab);
    const table = renderTable({
      id: "helpdesk-tickets-table",
      exportName: "helpdesk-tickets",
      dateField: "created_at",
      dateLabel: "Opened",
      filters: [
        { key: "category", label: "Category" },
        { key: "priority", label: "Priority" },
        { key: "status", label: "Status" },
      ],
      columns: [
        { label: "Ticket", key: "subject", render: r => '<b>' + esc(r.subject) + '</b><div class="tiny muted">#' + r.id + ' · ' + esc(r.category) + (r.confidential ? ' · <span style="color:var(--purple)">Confidential</span>' : '') + '</div>' },
        ...(Store.isRole("employee") ? [] : [{ label: "Raised by", sortKey: "employee_name", render: r => personCell({ name: r.employee_name }) }]),
        { label: "Priority", key: "priority", render: r => '<span class="chip chip-' + (r.priority === "high" ? "red" : r.priority === "low" ? "grey" : "amber") + '">' + esc(r.priority) + '</span>' },
        { label: "Assignee", sortValue: r => r.assignee_id ? Store.employeeName(r.assignee_id) : "Unassigned", render: r => r.assignee_id ? esc(Store.employeeName(r.assignee_id)) : '<span class="muted">Unassigned</span>' },
        { label: "Opened", key: "created_at", render: r => timeAgo(r.created_at) },
        { label: "Status", key: "status", render: r => chip(r.status) },
        { label: "", class: "right", sortable: false, render: r => '<button class="btn btn-sm btn-ghost" data-ticket="' + r.id + '">Open</button>' },
      ], rows: filtered, emptyTitle: "No tickets", emptyText: "Raise a ticket and HR will respond.",
    });

    root.innerHTML = pageHead("Helpdesk", "A confidential channel for HR queries and grievances.",
      '<button class="btn btn-accent" id="ticket-add">' + icon("plus", 15) + ' Raise a ticket</button>', "Operations")
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Open tickets", value: tickets.filter(t => t.status === "open").length, icon: "inbox", tone: "accent", foot: "Awaiting first response" })
      + kpiCard({ label: "In progress", value: tickets.filter(t => t.status === "in_progress").length, icon: "clock", tone: "blue", foot: "Being worked on" })
      + kpiCard({ label: "Resolved", value: tickets.filter(t => t.status === "resolved").length, icon: "checkCircle", tone: "teal", foot: "Closed successfully" })
      + kpiCard({ label: "Confidential", value: tickets.filter(t => t.confidential).length, icon: "lock", tone: "purple", foot: "Restricted visibility" })
      + '</div>'
      + '<div class="filter-chips" style="margin-bottom:16px">' + [["all", "All"], ["open", "Open"], ["in_progress", "In progress"], ["resolved", "Resolved"], ["closed", "Closed"]].map(t => '<button class="filter-chip ' + (helpState.tab === t[0] ? "active" : "") + '" data-htab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + table + '</div>';

    root.querySelectorAll("[data-htab]").forEach(b => b.onclick = () => { helpState.tab = b.dataset.htab; Views.helpdesk(root); });
    root.querySelector("#ticket-add").onclick = openTicketForm;
    onDelegate(root, "click", "[data-ticket]", (b) => openTicketDrawer(Number(b.dataset.ticket), root));
  } catch (e) {
    root.innerHTML = pageHead("Helpdesk", "Unavailable") + emptyState("Could not load tickets", e.message, "alert");
  }
};

function openTicketForm() {
  formModal({
    title: "Raise a ticket",
    fields: [
      { name: "subject", label: "Subject", required: true, full: true },
      { name: "category", label: "Category", type: "select", options: ["payroll", "leave", "attendance", "it", "harassment", "general"], value: "general", required: true },
      { name: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"], value: "medium" },
      { name: "description", label: "Describe the issue", type: "textarea", rows: 5, required: true, full: true },
      { name: "confidential", label: "Mark as confidential grievance", type: "checkbox" },
    ],
    onSubmit: async (data) => { data.status = "open"; await API.post("/tickets", data); navigate(); },
  });
}

async function openTicketDrawer(id, root) {
  try {
    const res = await API.get("/tickets/" + id + "/detail");
    const t = res.data;
    const canManage = Store.canManage();
    openDrawer({
      title: t.subject,
      head: '<div><div class="tiny muted">Ticket #' + t.id + ' · ' + esc(t.category) + '</div><h3 style="font-family:var(--serif);font-size:22px;font-weight:500;margin-top:2px">' + esc(t.subject) + '</h3><div class="row" style="gap:6px;margin-top:7px">' + chip(t.status) + '<span class="chip chip-' + (t.priority === "high" ? "red" : "amber") + '">' + esc(t.priority) + '</span>' + (t.confidential ? '<span class="chip chip-purple">' + icon("lock", 10) + ' Confidential</span>' : "") + '</div></div>',
      body: '<div class="ticket-detail">'
        + '<div class="card card-pad" style="margin-bottom:14px"><dl class="kv">'
        + '<dt>Raised by</dt><dd>' + esc(t.employee_name) + '</dd><dt>Opened</dt><dd>' + fmtDateTime(t.created_at) + '</dd>'
        + '<dt>Assignee</dt><dd>' + (t.assignee_id ? esc(Store.employeeName(t.assignee_id)) : "Unassigned") + '</dd></dl>'
        + '<div class="divider"></div><p class="small" style="line-height:1.65">' + esc(t.description || "No description provided.") + '</p></div>'
        + '<div class="section-title">Conversation</div>'
        + (t.comments.length ? t.comments.map(c => '<div class="message"><div class="who">' + esc(c.author_name) + ' · ' + timeAgo(c.created_at) + '</div><p>' + esc(c.body) + '</p></div>').join("") : '<p class="small muted" style="margin-bottom:12px">No replies yet.</p>')
        + '<div class="field" style="margin-top:12px"><label>Reply</label><textarea class="textarea" id="ticket-reply" rows="3" placeholder="Write a response…"></textarea></div>'
        + '<div class="row" style="margin-top:10px"><button class="btn btn-accent btn-sm" id="ticket-send">' + icon("send", 13) + ' Send reply</button>'
        + (canManage ? '<select class="select" id="ticket-status" style="height:29px;width:auto;margin-left:auto">' + ["open", "in_progress", "resolved", "closed"].map(s => '<option value="' + s + '"' + (t.status === s ? " selected" : "") + '>' + s.replace("_", " ") + '</option>').join("") + '</select>' : "")
        + '</div></div>',
      onMount(panel) {
        panel.querySelector("#ticket-send").onclick = async () => {
          const body = panel.querySelector("#ticket-reply").value.trim();
          if (!body) return toast("Write a reply first", "error");
          try { await API.post("/tickets/" + t.id + "/comments", { body }); toast("Reply sent", "success"); openTicketDrawer(t.id, root); }
          catch (e) { handleErr(e); }
        };
        const st = panel.querySelector("#ticket-status");
        if (st) st.onchange = async () => {
          try { await API.post("/tickets/" + t.id + "/status", { status: st.value }); toast("Ticket updated", "success"); closeDrawer(); Views.helpdesk(root); }
          catch (e) { handleErr(e); }
        };
      },
    });
  } catch (e) { handleErr(e); }
}

/* Announcements & Events view is provided in settings_notifications.js */
/* ============================================================ DOCUMENTS */
const docState = { tab: "documents" };

Views.documents = async function (root) {
  root.innerHTML = pageHead("Documents", "Loading document vault…") + spinners(3);
  try {
    const [docRes, polRes] = await Promise.all([API.get("/documents", { per_page: 200 }), API.get("/policies", { per_page: 50 })]);
    const docs = docRes.data, policies = polRes.data;
    const canManage = Store.canManage();
    const today = todayISO();
    const docsTable = renderTable({
      columns: [
        { label: "Document", render: r => '<div class="row">' + icon("file", 16) + '<div><b>' + esc(r.title) + '</b><div class="tiny muted mono">' + esc(r.file_name || "—") + '</div></div></div>' },
        { label: "Employee", render: r => esc(r.employee_name || "Company") },
        { label: "Category", render: r => '<span class="pill-tag">' + esc((r.category || "").replace(/_/g, " ")) + '</span>' },
        { label: "Expires", render: r => r.expires_at ? fmtDate(r.expires_at) + (r.expires_at < today ? ' <span class="chip chip-red">Expired</span>' : "") : "—" },
        { label: "Added", render: r => fmtDate(r.created_at) },
        {
          label: "", class: "right", sortable: false,
          render: r => (r.category === "employment_letter" && r.employee_id)
            ? '<button class="btn btn-sm btn-accent" data-doc-open-letter="' + r.employee_id + '">' + icon("printer", 12) + ' View / Print</button>'
            : "",
        },
      ], rows: docs, emptyTitle: "No documents", emptyText: "Upload contracts, IDs and certificates.",
    });
    const acks = await Promise.all(policies.map(p => API.get("/policies/" + p.id + "/acks").then(r => r.data).catch(() => ({ count: 0, employee_ids: [] }))));
    const policyCards = policies.map((p, i) => {
      const ack = acks[i];
      const mine = ack.employee_ids.includes(Store.user.employee_id);
      return '<div class="card card-pad"><div class="row-between"><span class="chip chip-teal chip-plain">' + esc(p.category || "policy") + '</span><span class="tiny muted">v' + esc(p.version) + '</span></div>'
        + '<h4 style="font-family:var(--serif);font-size:20px;font-weight:500;margin-top:10px">' + esc(p.title) + '</h4>'
        + '<p class="small muted" style="margin-top:6px;line-height:1.6">' + esc((p.content || "").slice(0, 180)) + (p.content && p.content.length > 180 ? "…" : "") + '</p>'
        + '<div class="divider"></div><div class="row-between"><span class="tiny muted">' + ack.count + ' acknowledgements · published ' + fmtDate(p.published_at) + '</span>'
        + (mine ? '<span class="chip chip-green">Acknowledged</span>' : '<button class="btn btn-sm btn-soft" data-ack="' + p.id + '">Acknowledge</button>') + '</div></div>';
    }).join("");

    root.innerHTML = pageHead("Documents", "Secure storage and lifecycle management of HR documents.",
      '<div class="row" style="gap:8px"><button class="btn btn-teal" onclick="go(\'employment-letters\')">' + icon("printer", 15) + ' Employment Letters</button>'
      + (canManage ? '<button class="btn btn-accent" id="doc-add">' + icon("plus", 15) + ' Add document</button>' : "") + '</div>', "Core HR")
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Documents on file", value: docs.length, icon: "file", tone: "teal", foot: "Employee & company records" })
      + kpiCard({ label: "Expiring soon", value: docs.filter(d => d.expires_at && d.expires_at >= today).length, icon: "alert", tone: "accent", foot: "Renewal reminders active" })
      + kpiCard({ label: "Policies", value: policies.length, icon: "shield", tone: "blue", foot: "Versioned policy library" })
      + kpiCard({ label: "Acknowledged", value: acks.reduce((a, x) => a + x.count, 0), icon: "checkCircle", tone: "purple", foot: "Read receipts" })
      + '</div>'
      + '<div class="tabs" style="margin-bottom:18px"><button class="tab ' + (docState.tab === "documents" ? "active" : "") + '" data-dtab="documents">Document vault</button><button class="tab ' + (docState.tab === "policies" ? "active" : "") + '" data-dtab="policies">Policy library</button></div>'
      + '<div class="page-enter">' + (docState.tab === "policies" ? '<div class="grid grid-2">' + (policyCards || emptyState("No policies", "Publish a policy to collect acknowledgements.", "shield")) + '</div>' : docsTable) + '</div>';

    root.querySelectorAll("[data-dtab]").forEach(b => b.onclick = () => { docState.tab = b.dataset.dtab; Views.documents(root); });
    const add = root.querySelector("#doc-add"); if (add) add.onclick = () => openDocumentForm();
    onDelegate(root, "click", "[data-doc-open-letter]", (b) => openEmploymentLetterModal(Number(b.dataset.docOpenLetter), () => Views.documents(root)));
    root.querySelectorAll("[data-ack]").forEach(b => b.onclick = async () => {
      try { await API.post("/policies/" + b.dataset.ack + "/acknowledge"); toast("Policy acknowledged", "success"); Views.documents(root); }
      catch (e) { handleErr(e); }
    });
  } catch (e) {
    root.innerHTML = pageHead("Documents", "Unavailable") + emptyState("Could not load documents", e.message, "alert");
  }
};

function openDocumentForm(employeeId) {
  formModal({
    title: "Add document",
    fields: [
      { name: "employee_id", label: "Employee", type: "select", options: employeeOptions(), value: employeeId || "" },
      { name: "category", label: "Category", type: "select", options: ["contract", "id", "certificate", "policy", "medical", "other"], value: "contract" },
      { name: "title", label: "Document title", required: true, full: true },
      { name: "file_name", label: "File name", placeholder: "contract.pdf" },
      { name: "expires_at", label: "Expiry date", type: "date" },
      { name: "notes", label: "Notes", type: "textarea", full: true },
    ],
    onSubmit: async (data) => {
      if (!data.employee_id) delete data.employee_id;
      data.uploaded_by = Store.user.id;
      await API.post("/documents", data);
      navigate();
    },
  });
}

/* ============================================================ REPORTS */
const repState = { tab: "dept" };

Views.reports = async function (root) {
  root.innerHTML = pageHead("Reports", "Crunching workforce data…") + spinners(4);
  try {
    const [res, empRes, balRes] = await Promise.all([
      API.get("/reports/overview"),
      API.get("/employees", { per_page: 500 }).catch(() => ({ data: [] })),
      API.get("/leave-balances", { per_page: 500 }).catch(() => ({ data: [] })),
    ]);
    const r = res.data;
    const emps = empRes.data || [];
    const leaveBals = balRes.data || [];
    const att = r.attendance || [];
    const attChart = lineChart(att.map(a => fmtDateShort(a.date)), [
      { name: "Present", values: att.map(a => a.present), color: "#0f766e" },
      { name: "Late", values: att.map(a => a.late), color: "#c2703d" },
    ]);
    const payChart = r.payroll.length ? lineChart(r.payroll.map(p => p.period), [
      { name: "Gross", values: r.payroll.map(p => p.gross), color: "#0f766e" },
      { name: "Net", values: r.payroll.map(p => p.net), color: "#c2703d" },
    ]) : '<p class="small muted">No payroll history.</p>';
    const gender = r.by_gender.map((g, i) => ({ ...g, color: ["#0f766e", "#c2703d", "#6b4a86"][i % 3] }));
    const contract = r.by_contract.map((g, i) => ({ ...g, color: ["#2c5d8f", "#a97316", "#6b4a86", "#2f7d5d"][i % 4] }));

    // Build Department Analytics rows
    const deptMap = {};
    emps.forEach(e => {
      const dn = e.department_name || "Unassigned";
      if (!deptMap[dn]) deptMap[dn] = { department: dn, headcount: 0, active: 0, flex: 0, totalSalary: 0 };
      deptMap[dn].headcount++;
      if (e.status === "active") deptMap[dn].active++;
      if (e.work_location === "hybrid" || e.work_location === "remote") deptMap[dn].flex++;
      deptMap[dn].totalSalary += Number(e.basic_salary || 0);
    });
    const deptRows = Object.values(deptMap).map(d => ({
      ...d,
      avgSalary: d.headcount ? d.totalSalary / d.headcount : 0,
      flexPct: d.headcount ? Math.round((d.flex / d.headcount) * 100) : 0,
    }));

    let explorerTable = "";
    if (repState.tab === "dept") {
      explorerTable = renderTable({
        id: "reports-dept-analytics",
        title: "Department headcount & compensation benchmark",
        sub: "Exportable breakdown of staffing, flexible work adoption, and monthly basic payroll per cost centre.",
        exportName: "department-analytics",
        columns: [
          { label: "Department", key: "department", render: d => '<b>' + esc(d.department) + '</b>' },
          { label: "Headcount", key: "headcount", render: d => '<b>' + d.headcount + '</b>' },
          { label: "Active", key: "active" },
          { label: "Hybrid / Remote", sortKey: "flexPct", render: d => d.flex + ' <span class="tiny muted">(' + d.flexPct + '%)</span>' },
          { label: "Avg basic salary", sortKey: "avgSalary", render: d => money(d.avgSalary) },
          { label: "Monthly basic total", sortKey: "totalSalary", render: d => '<b>' + money(d.totalSalary) + '</b>' },
        ],
        rows: deptRows,
        emptyTitle: "No department data",
      });
    } else if (repState.tab === "leave") {
      const lbRows = leaveBals.map(b => ({
        ...b,
        remaining: Number(b.entitled || 0) - Number(b.taken || 0) - Number(b.pending || 0),
      }));
      explorerTable = renderTable({
        id: "reports-leave-liability",
        title: "Leave entitlement & liability register",
        sub: "Filter by department or leave type to audit unused leave balances.",
        exportName: "leave-liability-report",
        filters: [
          { key: "department_name", label: "Department" },
          { key: "leave_type_name", label: "Leave type" },
          { key: "year", label: "Year" },
        ],
        columns: [
          { label: "Employee", sortKey: "employee_name", render: b => personCell({ name: b.employee_name }, b.department_name) },
          { label: "Leave type", key: "leave_type_name", render: b => '<b>' + esc(b.leave_type_name) + '</b>' },
          { label: "Year", key: "year" },
          { label: "Entitled", sortValue: b => Number(b.entitled || 0), render: b => b.entitled + " d" },
          { label: "Taken", sortValue: b => Number(b.taken || 0), render: b => b.taken + " d" },
          { label: "Pending", sortValue: b => Number(b.pending || 0), render: b => b.pending + " d" },
          { label: "Remaining", sortKey: "remaining", render: b => '<b>' + b.remaining + ' d</b>' },
        ],
        rows: lbRows,
        emptyTitle: "No leave balance records",
      });
    } else {
      explorerTable = renderTable({
        id: "reports-payroll-history",
        title: "Payroll period register",
        sub: "Historical gross, statutory PAYE, and net disbursements.",
        exportName: "payroll-trend-report",
        columns: [
          { label: "Pay period", key: "period", render: p => '<b>' + esc(p.period) + '</b>' },
          { label: "Gross payroll", sortValue: p => Number(p.gross || 0), render: p => money(p.gross) },
          { label: "Net disbursed", sortValue: p => Number(p.net || 0), render: p => '<b>' + money(p.net) + '</b>' },
          { label: "Deductions & tax", sortValue: p => Number(p.gross || 0) - Number(p.net || 0), render: p => money(Number(p.gross || 0) - Number(p.net || 0)) },
        ],
        rows: r.payroll || [],
        emptyTitle: "No payroll runs",
      });
    }

    root.innerHTML = pageHead("Reports", "Workforce analytics for data-driven people decisions.",
      '<a class="btn btn-ghost" href="/api/v1/employees/export.csv?token=' + API.token + '">' + icon("download", 15) + ' Export employees</a><button class="btn btn-accent" onclick="window.print()">' + icon("file", 15) + ' Print report</button>', "Insight")
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Headcount", value: r.headcount, icon: "users", tone: "teal", foot: "Active employees" })
      + kpiCard({ label: "Annual turnover", value: r.turnover_rate + "%", icon: "chart", tone: "accent", foot: r.turnover + " leavers this year" })
      + kpiCard({ label: "Training completion", value: r.training_completion.completed, icon: "graduation", tone: "blue", foot: r.training_completion.enrolled + " currently enrolled" })
      + kpiCard({ label: "Assets assigned", value: r.assets_assigned, icon: "laptop", tone: "purple", foot: "of " + r.asset_count + " registered" })
      + '</div>'
      + '<div class="grid grid-2" style="margin-bottom:18px">'
      + '<div class="card"><div class="card-head"><div><h3>Attendance trend</h3><div class="sub">Present vs late · last 10 working days</div></div></div><div class="card-body">' + attChart + '</div></div>'
      + '<div class="card"><div class="card-head"><div><h3>Payroll trend</h3><div class="sub">Gross vs net by period</div></div></div><div class="card-body">' + payChart + '</div></div>'
      + '</div>'
      + '<div class="grid grid-3" style="margin-bottom:20px">'
      + '<div class="card"><div class="card-head"><h3>Headcount by department</h3></div><div class="card-body">' + barList(r.by_department) + '</div></div>'
      + '<div class="card"><div class="card-head"><h3>Gender distribution</h3></div><div class="card-body"><div class="row" style="gap:18px">' + donut(gender, 120) + '<div>' + gender.map(g => '<div class="row" style="gap:7px;margin-bottom:7px"><span style="width:8px;height:8px;border-radius:2px;background:' + g.color + '"></span><span class="small">' + esc(g.name) + '</span><b class="small" style="margin-left:auto">' + g.count + '</b></div>').join("") + '</div></div></div></div>'
      + '<div class="card"><div class="card-head"><h3>Contract mix</h3></div><div class="card-body"><div class="row" style="gap:18px">' + donut(contract, 120) + '<div>' + contract.map(g => '<div class="row" style="gap:7px;margin-bottom:7px"><span style="width:8px;height:8px;border-radius:2px;background:' + g.color + '"></span><span class="small">' + esc(g.name) + '</span><b class="small" style="margin-left:auto">' + g.count + '</b></div>').join("") + '</div></div></div></div>'
      + '</div>'
      + '<div class="section-title">Interactive analytics explorer</div>'
      + '<div class="tabs" style="margin-bottom:14px">'
      + '<button class="tab ' + (repState.tab === "dept" ? "active" : "") + '" data-reptab="dept">Department benchmark</button>'
      + '<button class="tab ' + (repState.tab === "leave" ? "active" : "") + '" data-reptab="leave">Leave liability (' + leaveBals.length + ')</button>'
      + '<button class="tab ' + (repState.tab === "payroll" ? "active" : "") + '" data-reptab="payroll">Payroll history</button>'
      + '</div>'
      + explorerTable
      + '<div class="card" style="margin-top:18px"><div class="card-head"><div><h3>Operational registers</h3><div class="sub">Jump into the operational module for full detail</div></div></div><div class="card-body"><div class="grid grid-3">'
      + [["Employee master", "employees", "Directory with department, grade and contract filters", "users"],
         ["Leave balances", "leave", "Entitlement, taken and pending by employee", "calendar"],
         ["Attendance register", "attendance", "Clock records, lateness and overtime", "clock"],
         ["Payroll register", "payroll", "PAYE, SSNIT, net pay and payslips", "wallet"],
         ["Asset register", "assets", "Book value and assignment history", "laptop"],
         ["Training completion", "training", "Enrolment, completion and scores", "graduation"]].map(x =>
        '<div class="list-row" style="cursor:pointer" onclick="go(\'' + x[1] + '\')"><div class="kpi-icon">' + icon(x[3], 16) + '</div><div class="body"><b>' + x[0] + '</b><span>' + x[2] + '</span></div>' + icon("arrowRight", 14) + '</div>').join("")
      + '</div></div></div>';

    root.querySelectorAll("[data-reptab]").forEach(b => b.onclick = () => { repState.tab = b.dataset.reptab; Views.reports(root); });
  } catch (e) {
    root.innerHTML = pageHead("Reports", "Unavailable") + emptyState("Could not load reports", e.message, "alert");
  }
};

/* ============================================================ ADMIN */
const adminState = { tab: "users" };
const ADMIN_PERMISSIONS = ["employees", "org", "leave", "attendance", "payroll", "recruitment", "documents", "reports", "settings", "audit", "ess", "operations"];
const ADMIN_SETTING_GROUPS = ["general", "hr", "attendance", "payroll", "branding", "security", "notifications"];

function reloadAdmin() {
  const view = document.getElementById("view");
  if (view) Views.admin(view);
}

function adminDrawerError(panel, msg) {
  const box = panel.querySelector(".drawer-form-error");
  if (!box) return toast(msg, "error");
  box.textContent = msg;
  box.classList.remove("hidden");
}

function drawerErrBox() {
  return '<div class="form-error hidden drawer-form-error" style="margin-bottom:14px"></div>';
}

function drawerField(id, label, control, hint, full) {
  return '<div class="field' + (full ? " full" : "") + '"><label for="' + id + '">' + esc(label) + '</label>'
    + control + (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</div>';
}

function drawerSelect(id, options, current, placeholder) {
  return '<select class="select" id="' + id + '">'
    + (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '')
    + (options || []).map(o => {
        const val = typeof o === "object" ? o.value : o;
        const lab = typeof o === "object" ? o.label : o;
        return '<option value="' + esc(val) + '"' + (String(current) === String(val) ? " selected" : "") + '>' + esc(lab) + '</option>';
      }).join("")
    + '</select>';
}

function drawerMetaItem(label, value, raw) {
  return '<div class="item"><span>' + esc(label) + '</span><b>' + (value === null || value === undefined || value === "" ? "—" : (raw ? value : esc(value))) + '</b></div>';
}

/* ------------------------------------------------------------ users */
function openUserDrawer(user) {
  if (!Store.canAdmin()) return toast("Only Super Admin accounts can manage users", "error");
  const isEdit = !!user;
  const roles = (Store.meta && Store.meta.roles) || [];
  const employees = (Store.meta && Store.meta.employees) || [];
  const defaultRole = roles.find(r => r.slug === "employee") || roles[0] || null;
  const empOpts = employees.map(e => ({ value: e.id, label: e.name + (e.employee_no ? " · " + e.employee_no : "") }));
  const roleOpts = roles.map(r => ({ value: r.id, label: r.name }));
  const isSelf = isEdit && Store.user && Number(Store.user.id) === Number(user.id);

  const head = isEdit
    ? '<div class="row" style="gap:12px;align-items:center;min-width:0">'
      + avatarHTML(user.employee_name || user.email || "User", "avatar-sm")
      + '<div style="min-width:0"><h3>' + esc(user.employee_name || String(user.email || "User").split("@")[0]) + '</h3>'
      + '<div class="sub">' + esc(user.email || "") + (user.username ? " · @" + esc(user.username) : "") + '</div></div></div>'
    : '<div><h3>Add user account</h3><div class="sub">Create a login and link it to an employee record</div></div>';

  const body = drawerErrBox()
    + '<div class="drawer-section">Account details</div>'
    + '<div class="drawer-grid">'
    + drawerField("du-employee", "Linked employee", drawerSelect("du-employee", empOpts, isEdit ? (user.employee_id || "") : "", "No employee link"), "Ties this login to an HR record.", true)
    + drawerField("du-email", "Login email", '<input class="input" type="email" id="du-email" value="' + esc(isEdit ? user.email : "") + '" placeholder="name@meridian.gh" autocomplete="off">')
    + drawerField("du-username", "Username", '<input class="input" type="text" id="du-username" value="' + esc(isEdit && user.username ? user.username : "") + '" placeholder="Auto-generated when blank">')
    + drawerField("du-role", "Role", drawerSelect("du-role", roleOpts, isEdit ? user.role_id : (defaultRole ? defaultRole.id : "")))
    + drawerField("du-status", "Status", drawerSelect("du-status", [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }], isEdit ? user.status : "active"))
    + drawerField("du-password", isEdit ? "Reset password" : "Temporary password",
      '<input class="input" type="password" id="du-password" autocomplete="new-password" placeholder="' + (isEdit ? "Leave blank to keep current" : "Leave blank to auto-generate") + '">',
      "Minimum 8 characters. Resetting a password signs the user out everywhere.", true)
    + '</div>'
    + (isEdit
      ? '<div class="drawer-section">Activity</div><div class="drawer-meta">'
        + drawerMetaItem("Last sign in", user.last_login_at ? fmtDateTime(user.last_login_at) : "Never")
        + drawerMetaItem("Last IP", user.last_login_ip)
        + drawerMetaItem("MFA", user.mfa_enabled ? "Enabled" : "Not enabled")
        + drawerMetaItem("Password reset", user.must_change_password ? "Required" : "Not required")
        + drawerMetaItem("Created", user.created_at ? fmtDateTime(user.created_at) : null)
        + drawerMetaItem("Last updated", user.updated_at ? fmtDateTime(user.updated_at) : null)
        + '</div>'
        + (isSelf ? '<div class="drawer-note" style="margin-top:14px">' + icon("info", 13) + ' This is your own account — it cannot be deleted or deactivated from here.</div>' : '')
      : '<div class="drawer-section">What happens next</div><div class="drawer-note">The account is created immediately and the credentials are emailed to the user. Leave the password blank to auto-generate a temporary one.</div>');

  const footer = (isEdit && !isSelf ? '<div class="left"><button class="btn btn-danger" id="du-delete">' + icon("trash", 13) + ' Delete</button></div>' : '')
    + '<button class="btn btn-ghost" data-close-drawer>Cancel</button>'
    + '<button class="btn btn-accent" id="du-save">' + (isEdit ? "Save changes" : "Create user") + '</button>';

  openDrawer({
    wide: true, head: head, body: body, footer: footer,
    onMount(panel) {
      const saveBtn = panel.querySelector("#du-save");
      saveBtn.onclick = async () => {
        const val = id => (panel.querySelector("#" + id).value || "").trim();
        const email = val("du-email");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return adminDrawerError(panel, "Enter a valid email address");
        if (!val("du-role")) return adminDrawerError(panel, "Choose a role for this account");
        const pwd = val("du-password");
        if (pwd && pwd.length < 8) return adminDrawerError(panel, "Password must be at least 8 characters");
        const payload = {
          email: email,
          username: val("du-username") || null,
          role_id: Number(val("du-role")),
          status: val("du-status") || "active",
          employee_id: val("du-employee") ? Number(val("du-employee")) : null,
        };
        if (pwd) payload.password = pwd;
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
        try {
          const res = isEdit ? await API.put("/users/" + user.id, payload) : await API.post("/users", payload);
          closeDrawer();
          toast(isEdit ? "User updated" : "User account created", "success");
          reloadAdmin();
          const creds = res && res.data && res.data.credentials_dispatch;
          if (!isEdit && creds && creds.temporary_password && creds.email_sent === false) {
            toast("Temporary password: " + creds.temporary_password + " (email not delivered)", "error");
          }
        } catch (e) { adminDrawerError(panel, e.message); }
        finally { saveBtn.disabled = false; saveBtn.textContent = isEdit ? "Save changes" : "Create user"; }
      };
      const del = panel.querySelector("#du-delete");
      if (del) del.onclick = () => confirmDialog("Delete user account",
        "This will revoke access for " + (user.email || "this user") + ". The employee record itself is kept. This action is recorded in the audit log.",
        async () => {
          await API.del("/users/" + user.id);
          closeDrawer(); toast("User deleted", "success"); reloadAdmin();
        }, { danger: true, confirmLabel: "Delete account" });
    },
  });
}

/* ------------------------------------------------------------ roles */
function openRoleDrawer(role) {
  if (!Store.canAdmin()) return toast("Only Super Admin accounts can manage roles", "error");
  const isEdit = !!role;
  const allPerms = isEdit && role.permissions === "*";
  const current = isEdit ? String(role.permissions || "").split(",").map(p => p.trim()).filter(Boolean) : [];

  const head = isEdit
    ? '<div><h3>Edit role</h3><div class="sub">' + esc(role.name) + (role.is_system ? " · system role" : " · custom role") + '</div></div>'
    : '<div><h3>Add role</h3><div class="sub">Define a new role and its permissions</div></div>';

  const body = drawerErrBox()
    + '<div class="drawer-section">Role details</div>'
    + '<div class="drawer-grid">'
    + drawerField("dr-name", "Role name", '<input class="input" type="text" id="dr-name" value="' + esc(isEdit ? role.name : "") + '" placeholder="HR Assistant">')
    + drawerField("dr-slug", "Slug", '<input class="input" type="text" id="dr-slug" value="' + esc(isEdit ? role.slug : "") + '" placeholder="hr_assistant"' + (isEdit && role.is_system ? " readonly" : "") + '>', isEdit && role.is_system ? "System role slugs are locked." : "Lowercase identifier used by the API.")
    + drawerField("dr-desc", "Description", '<input class="input" type="text" id="dr-desc" value="' + esc(isEdit ? role.description : "") + '" placeholder="What this role is responsible for">', "", true)
    + '</div>'
    + '<div class="drawer-section">Permissions</div>'
    + '<label class="row" style="gap:8px;font-size:12.5px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card)">'
    + '<input type="checkbox" id="dr-all" ' + (allPerms ? "checked" : "") + '> <b style="font-weight:500">All permissions</b>'
    + '<span class="tiny muted" style="margin-left:auto">Super Admin</span></label>'
    + '<div class="drawer-check-grid">'
    + ADMIN_PERMISSIONS.map(p => '<label class="row" style="gap:7px;font-size:12px"><input type="checkbox" class="dr-perm" value="' + p + '"'
        + (allPerms || current.includes(p) ? " checked" : "") + (allPerms ? " disabled" : "") + '> ' + p + '</label>').join("")
    + '</div>'
    + (isEdit && role.is_system ? '<div class="drawer-note" style="margin-top:14px">' + icon("lock", 13) + ' System roles cannot be deleted. Permissions stay editable.</div>' : '');

  const footer = (isEdit && !role.is_system ? '<div class="left"><button class="btn btn-danger" id="dr-delete">' + icon("trash", 13) + ' Delete</button></div>' : '')
    + '<button class="btn btn-ghost" data-close-drawer>Cancel</button>'
    + '<button class="btn btn-accent" id="dr-save">' + (isEdit ? "Save role" : "Create role") + '</button>';

  openDrawer({
    head: head, body: body, footer: footer,
    onMount(panel) {
      const allBox = panel.querySelector("#dr-all");
      const permBoxes = Array.from(panel.querySelectorAll(".dr-perm"));
      allBox.onchange = () => {
        permBoxes.forEach(b => {
          b.disabled = allBox.checked;
          if (allBox.checked) b.checked = true;
        });
      };
      panel.querySelector("#dr-save").onclick = async () => {
        const val = id => (panel.querySelector("#" + id).value || "").trim();
        const name = val("dr-name");
        const slug = val("dr-slug");
        if (!name) return adminDrawerError(panel, "Role name is required");
        if (!slug) return adminDrawerError(panel, "Role slug is required");
        const all = allBox.checked;
        const chosen = permBoxes.filter(b => b.checked).map(b => b.value);
        if (!all && !chosen.length) return adminDrawerError(panel, "Select at least one permission (or grant all)");
        const payload = {
          name: name,
          slug: slug.toLowerCase().replace(/\s+/g, "_"),
          description: val("dr-desc"),
          permissions: all ? "*" : chosen.join(","),
        };
        if (!isEdit) payload.is_system = false;
        const btn = panel.querySelector("#dr-save");
        btn.disabled = true; btn.textContent = "Saving…";
        try {
          if (isEdit) await API.put("/roles/" + role.id, payload);
          else await API.post("/roles", payload);
          closeDrawer();
          toast(isEdit ? "Role updated" : "Role created", "success");
          await Store.loadMeta();
          reloadAdmin();
        } catch (e) { adminDrawerError(panel, e.message); }
        finally { btn.disabled = false; btn.textContent = isEdit ? "Save role" : "Create role"; }
      };
      const del = panel.querySelector("#dr-delete");
      if (del) del.onclick = () => confirmDialog("Delete role",
        "Delete the role “" + role.name + "”? Roles still assigned to users cannot be deleted.",
        async () => {
          await API.del("/roles/" + role.id);
          closeDrawer(); toast("Role deleted", "success");
          await Store.loadMeta(); reloadAdmin();
        }, { danger: true, confirmLabel: "Delete role" });
    },
  });
}

/* ------------------------------------------------------------ settings */
function openSettingDrawer(setting) {
  if (!Store.canAdmin()) return toast("Only Super Admin accounts can manage settings", "error");
  const isEdit = !!setting;
  const groups = ADMIN_SETTING_GROUPS.slice();
  if (isEdit && setting.group_name && !groups.includes(setting.group_name)) groups.push(setting.group_name);

  const head = isEdit
    ? '<div><h3>Edit setting</h3><div class="sub mono">' + esc(setting.key) + '</div></div>'
    : '<div><h3>Add setting</h3><div class="sub">Create a configuration value</div></div>';

  const body = drawerErrBox()
    + '<div class="drawer-section">Configuration</div>'
    + '<div class="drawer-grid">'
    + drawerField("ds-key", "Key", '<input class="input mono" type="text" id="ds-key" value="' + esc(isEdit ? setting.key : "") + '" placeholder="company_leave_year">', isEdit ? "Changing a key can affect code that reads it." : "Snake_case identifier.", true)
    + drawerField("ds-group", "Group", drawerSelect("ds-group", groups, isEdit ? setting.group_name : "general"), "", true)
    + drawerField("ds-value", "Value", '<textarea class="textarea" id="ds-value" rows="5" placeholder="Setting value">' + esc(isEdit ? (setting.value || "") : "") + '</textarea>', "", true)
    + '</div>'
    + '<div class="drawer-note" style="margin-top:14px">' + icon("info", 13) + ' Settings are read by the application at runtime — changes apply on the next page load.</div>';

  const footer = (isEdit ? '<div class="left"><button class="btn btn-danger" id="ds-delete">' + icon("trash", 13) + ' Delete</button></div>' : '')
    + '<button class="btn btn-ghost" data-close-drawer>Cancel</button>'
    + '<button class="btn btn-accent" id="ds-save">' + (isEdit ? "Save setting" : "Create setting") + '</button>';

  openDrawer({
    head: head, body: body, footer: footer,
    onMount(panel) {
      panel.querySelector("#ds-save").onclick = async () => {
        const val = id => panel.querySelector("#" + id).value;
        const key = (val("ds-key") || "").trim();
        if (!key) return adminDrawerError(panel, "Setting key is required");
        const payload = { key: key, value: val("ds-value"), group_name: val("ds-group") || "general" };
        const btn = panel.querySelector("#ds-save");
        btn.disabled = true; btn.textContent = "Saving…";
        try {
          if (isEdit) await API.put("/settings/" + setting.id, payload);
          else await API.post("/settings", payload);
          closeDrawer();
          toast(isEdit ? "Setting updated" : "Setting created", "success");
          reloadAdmin();
        } catch (e) { adminDrawerError(panel, e.message); }
        finally { btn.disabled = false; btn.textContent = isEdit ? "Save setting" : "Create setting"; }
      };
      const del = panel.querySelector("#ds-delete");
      if (del) del.onclick = () => confirmDialog("Delete setting",
        "Delete “" + setting.key + "”? Code that reads this setting will fall back to its default.",
        async () => {
          await API.del("/settings/" + setting.id);
          closeDrawer(); toast("Setting deleted", "success"); reloadAdmin();
        }, { danger: true, confirmLabel: "Delete setting" });
    },
  });
}

/* ------------------------------------------------------------ audit */
function openAuditDrawer(log) {
  const head = '<div><h3 style="text-transform:capitalize">' + esc(String(log.event || "event").replace(/_/g, " ")) + '</h3>'
    + '<div class="sub">' + esc(log.entity || "system") + (log.entity_id ? " #" + log.entity_id : "") + ' · ' + esc(fmtDateTime(log.created_at)) + '</div></div>';
  const body = '<div class="drawer-section">Entry</div><div class="drawer-meta">'
    + drawerMetaItem("Timestamp", fmtDateTime(log.created_at))
    + drawerMetaItem("Actor", log.user_name || "System")
    + drawerMetaItem("Event", log.event)
    + drawerMetaItem("Entity", (log.entity || "—") + (log.entity_id ? " #" + log.entity_id : ""))
    + drawerMetaItem("IP address", log.ip)
    + drawerMetaItem("Log ID", log.id)
    + '</div>'
    + (log.old_values ? '<div class="drawer-section">Before</div><div class="drawer-code">' + esc(log.old_values) + '</div>' : '')
    + (log.new_values ? '<div class="drawer-section">After</div><div class="drawer-code">' + esc(log.new_values) + '</div>' : '')
    + '<div class="drawer-section">Integrity</div><div class="drawer-note">' + icon("shield", 13) + ' Audit entries are immutable. They are created automatically and cannot be edited or deleted.</div>';
  openDrawer({
    wide: true, head: head, body: body,
    footer: '<button class="btn btn-ghost" data-close-drawer>Close</button>',
  });
}

Views.admin = async function (root) {
  if (!Store.canAdmin()) {
    root.innerHTML = pageHead("Administration", "Restricted area") + emptyState("No access", "Only Super Admin accounts can manage platform settings.", "lock");
    return;
  }
  root.innerHTML = pageHead("Administration", "Loading configuration…") + spinners(3);
  try {
    const [userRes, roleRes, setRes, auditRes] = await Promise.all([
      API.get("/users", { per_page: 300 }), API.get("/roles", { per_page: 100 }),
      API.get("/settings", { per_page: 200 }), API.get("/audit-logs", { per_page: 400 }),
    ]);
    const users = userRes.data, roles = roleRes.data, settings = setRes.data, logs = auditRes.data;
    const tabs = [["users", "Users"], ["roles", "Roles & permissions"], ["settings", "Settings"], ["audit", "Audit log"]];
    let body = "";

    if (adminState.tab === "users") {
      body = renderTable({
        id: "admin-users-table",
        exportName: "platform-users",
        searchPlaceholder: "Search users by name, email or username…",
        onRowClick: r => openUserDrawer(r),
        filters: [
          { key: "role_name", label: "Role" },
          { key: "status", label: "Status" },
        ],
        columns: [
          { label: "User", sortKey: "email", render: r => '<div class="person">' + avatarHTML(r.employee_name || r.email, "avatar-sm") + '<div><b>' + esc(r.employee_name || r.email.split("@")[0]) + '</b><span>' + esc(r.email) + '</span></div></div>' },
          { label: "Role", key: "role_name", render: r => '<span class="pill-tag">' + esc(r.role_name || "—") + '</span>' },
          { label: "Last login", sortKey: "last_login_at", render: r => r.last_login_at ? timeAgo(r.last_login_at) : "Never" },
          { label: "Status", key: "status", render: r => chip(r.status) },
          {
            label: "", class: "right", sortable: false, render: r => '<div class="row" style="gap:4px;justify-content:flex-end">'
              + '<button class="btn btn-sm btn-ghost" data-user-edit="' + r.id + '">' + icon("edit", 12) + ' Edit</button>'
              + '<button class="btn btn-sm btn-ghost" data-toggle-user="' + r.id + '" data-status="' + esc(r.status) + '">' + (r.status === "active" ? "Deactivate" : "Activate") + '</button></div>'
          },
        ], rows: users, emptyTitle: "No users",
      });
    } else if (adminState.tab === "roles") {
      body = renderTable({
        id: "admin-roles-table",
        exportName: "roles-and-permissions",
        searchPlaceholder: "Search roles…",
        onRowClick: r => openRoleDrawer(r),
        columns: [
          { label: "Role", sortKey: "name", render: r => '<div><b>' + esc(r.name) + '</b><div class="tiny muted">' + esc(r.description || "—") + '</div></div>' },
          { label: "Slug", key: "slug", render: r => '<span class="mono tiny">' + esc(r.slug) + '</span>' },
          {
            label: "Permissions", sortable: false, render: r => r.permissions === "*"
              ? '<span class="chip chip-amber">All permissions</span>'
              : '<div class="row wrap" style="gap:4px">' + (String(r.permissions || "").split(",").filter(Boolean).map(p => '<span class="pill-tag">' + esc(p) + '</span>').join("") || '<span class="tiny muted">None</span>') + '</div>'
          },
          { label: "Type", sortable: false, render: r => r.is_system ? '<span class="chip chip-teal">System</span>' : '<span class="chip chip-grey">Custom</span>' },
          { label: "", class: "right", sortable: false, render: r => '<button class="btn btn-sm btn-ghost" data-role-edit="' + r.id + '">' + icon("edit", 12) + ' Edit</button>' },
        ], rows: roles, emptyTitle: "No roles",
      });
    } else if (adminState.tab === "settings") {
      body = renderTable({
        id: "admin-settings-table",
        exportName: "platform-settings",
        searchPlaceholder: "Search settings by key or group…",
        onRowClick: r => openSettingDrawer(r),
        filters: [{ key: "group_name", label: "Group" }],
        columns: [
          { label: "Key", sortKey: "key", render: r => '<span class="mono" style="font-size:12px">' + esc(r.key) + '</span>' },
          { label: "Value", sortable: false, render: r => '<span class="small">' + esc(String(r.value || "").length > 90 ? String(r.value).slice(0, 90) + "…" : (r.value || "—")) + '</span>' },
          { label: "Group", key: "group_name", render: r => '<span class="pill-tag">' + esc(r.group_name || "general") + '</span>' },
          { label: "", class: "right", sortable: false, render: r => '<button class="btn btn-sm btn-ghost" data-setting-edit="' + r.id + '">' + icon("edit", 12) + ' Edit</button>' },
        ], rows: settings, emptyTitle: "No settings",
      });
    } else {
      body = renderTable({
        id: "admin-audit-logs",
        exportName: "security-audit-log",
        dateField: "created_at",
        dateLabel: "Timestamp",
        searchPlaceholder: "Search the audit trail…",
        onRowClick: r => openAuditDrawer(r),
        filters: [
          { key: "event", label: "Event" },
          { key: "entity", label: "Entity" },
          { key: "user_name", label: "Actor" },
        ],
        columns: [
          { label: "When", key: "created_at", render: r => fmtDateTime(r.created_at) },
          { label: "User", key: "user_name", render: r => esc(r.user_name || "System") },
          { label: "Event", key: "event", render: r => '<span class="pill-tag">' + esc(r.event) + '</span>' },
          { label: "Entity", key: "entity", render: r => esc(r.entity || "—") + (r.entity_id ? " #" + r.entity_id : "") },
          { label: "IP", key: "ip", render: r => '<span class="mono tiny">' + esc(r.ip || "—") + '</span>' },
        ], rows: logs, emptyTitle: "No audit entries",
      });
    }

    const addLabel = adminState.tab === "users" ? "Add user" : adminState.tab === "roles" ? "Add role" : "Add setting";
    const addBtn = adminState.tab === "audit" ? "" : '<button class="btn btn-accent" id="admin-add">' + icon("plus", 15) + ' ' + addLabel + '</button>';
    const hint = adminState.tab === "audit"
      ? "Audit entries are read-only — click a row to inspect the recorded change."
      : "Click any row to open it in the side panel for edit and other actions.";

    root.innerHTML = pageHead("Administration", "Roles, permissions, configuration and a complete audit trail.", addBtn, "System")
      + '<div class="tabs" style="margin-bottom:14px">' + tabs.map(t => '<button class="tab ' + (adminState.tab === t[0] ? "active" : "") + '" data-atab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="row tiny muted" style="gap:6px;margin-bottom:12px">' + icon("info", 13) + ' <span>' + esc(hint) + '</span></div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-atab]").forEach(b => b.onclick = () => { adminState.tab = b.dataset.atab; Views.admin(root); });
    const add = root.querySelector("#admin-add");
    if (add) add.onclick = () => {
      if (adminState.tab === "users") openUserDrawer(null);
      else if (adminState.tab === "roles") openRoleDrawer(null);
      else openSettingDrawer(null);
    };
    onDelegate(root, "click", "[data-user-edit]", b => {
      const u = users.find(x => Number(x.id) === Number(b.dataset.userEdit));
      if (u) openUserDrawer(u);
    });
    onDelegate(root, "click", "[data-toggle-user]", async b => {
      try {
        await API.put("/users/" + b.dataset.toggleUser, { status: b.dataset.status === "active" ? "inactive" : "active" });
        toast("User updated", "success");
        Views.admin(root);
      } catch (e) { handleErr(e); }
    });
    onDelegate(root, "click", "[data-role-edit]", b => {
      const r = roles.find(x => Number(x.id) === Number(b.dataset.roleEdit));
      if (r) openRoleDrawer(r);
    });
    onDelegate(root, "click", "[data-setting-edit]", b => {
      const s = settings.find(x => Number(x.id) === Number(b.dataset.settingEdit));
      if (s) openSettingDrawer(s);
    });
  } catch (e) {
    root.innerHTML = pageHead("Administration", "Unavailable") + emptyState("Could not load administration", e.message, "alert");
  }
};

/* ============================================================ PROFILE & SETTINGS */
Views.profile = async function (root) {
  if (Store.user.employee_id) return viewEmployeeDetail(root, Store.user.employee_id);
  root.innerHTML = pageHead("My profile", "Account details") + '<div class="card card-pad"><dl class="kv"><dt>Name</dt><dd>' + esc(Store.user.name) + '</dd><dt>Email</dt><dd>' + esc(Store.user.email) + '</dd><dt>Role</dt><dd>' + esc(Store.user.role) + '</dd></dl></div>';
};

Views.settings = async function (root) {
  const u = Store.user;
  root.innerHTML = pageHead("Preferences", "Account security and notification settings.", "", "Settings")
    + '<div class="grid grid-2">'
    + '<div class="card"><div class="card-head"><h3>Account</h3></div><div class="card-body"><dl class="kv">'
    + '<dt>Name</dt><dd>' + esc(u.name) + '</dd><dt>Email</dt><dd>' + esc(u.email) + '</dd><dt>Role</dt><dd>' + esc(u.role) + '</dd>'
    + '<dt>Department</dt><dd>' + esc(u.department || "—") + '</dd><dt>Employee no.</dt><dd class="mono">' + esc(u.employee_no || "—") + '</dd>'
    + '</dl></div></div>'
    + '<div class="card"><div class="card-head"><h3>Change password</h3></div><div class="card-body"><div id="pwd-error" class="form-error hidden"></div>'
    + '<div class="field" style="margin-bottom:10px"><label>Current password</label><input class="input" type="password" id="pwd-current"></div>'
    + '<div class="field" style="margin-bottom:10px"><label>New password</label><input class="input" type="password" id="pwd-new"></div>'
    + '<div class="field" style="margin-bottom:14px"><label>Confirm new password</label><input class="input" type="password" id="pwd-confirm"></div>'
    + '<button class="btn btn-accent" id="pwd-save">Update password</button></div></div>'
    + '<div class="card"><div class="card-head"><h3>Notifications</h3></div><div class="card-body">'
    + [["leave", "Leave decisions"], ["approvals", "Approval requests"], ["payroll", "Payslip availability"], ["announcements", "Company announcements"]].map(x =>
      '<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="small">' + x[1] + '</span><input type="checkbox" data-pref="' + x[0] + '" ' + (localStorage.getItem("hrms_pref_" + x[0]) !== "0" ? "checked" : "") + '></div>').join("")
    + '<div class="tiny muted" style="margin-top:10px">Email delivery is configured by your administrator.</div></div></div>'
    + '<div class="card"><div class="card-head"><h3>Security</h3></div><div class="card-body"><div class="list-row">' + icon("shield", 18) + '<div class="body"><b>Two-factor authentication</b><span>Authenticator app (TOTP)</span></div><span class="chip chip-grey">Not enabled</span></div>'
    + '<div class="list-row">' + icon("clock", 18) + '<div class="body"><b>Last sign in</b><span>' + fmtDateTime(u.last_login_at) + '</span></div></div>'
    + '<div class="list-row">' + icon("logout", 18) + '<div class="body"><b>Active session</b><span>This browser</span></div><button class="btn btn-sm btn-danger" id="settings-logout">Sign out</button></div>'
    + '</div></div></div>';

  root.querySelector("#pwd-save").onclick = async () => {
    const cur = root.querySelector("#pwd-current").value;
    const nw = root.querySelector("#pwd-new").value;
    const conf = root.querySelector("#pwd-confirm").value;
    const box = root.querySelector("#pwd-error");
    box.classList.add("hidden");
    if (nw !== conf) { box.textContent = "New passwords do not match"; box.classList.remove("hidden"); return; }
    try { await API.post("/auth/change-password", { current_password: cur, new_password: nw }); toast("Password updated", "success"); root.querySelectorAll("#pwd-current,#pwd-new,#pwd-confirm").forEach(i => i.value = ""); }
    catch (e) { box.textContent = e.message; box.classList.remove("hidden"); }
  };
  root.querySelectorAll("[data-pref]").forEach(cb => cb.onchange = () => {
    localStorage.setItem("hrms_pref_" + cb.dataset.pref, cb.checked ? "1" : "0");
    toast("Preference saved", "success");
  });
  root.querySelector("#settings-logout").onclick = () => logout();
};
