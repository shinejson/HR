const NAV = [
  {
    label: "Workspace", items: [
      { id: "dashboard", label: "Overview", icon: "dashboard" },
      { id: "approvals", label: "Approvals", icon: "inbox", roles: ["super_admin", "hr_admin", "hr_officer", "manager", "payroll"] },
      { id: "profile", label: "My Profile", icon: "user" },
      { id: "notifications", label: "Notifications", icon: "bell" },
    ],
  },
  {
    label: "Core HR", items: [
      { id: "employees", label: "Employees", icon: "users" },
      { id: "organisation", label: "Organisation", icon: "org" },
      { id: "recruitment", label: "Recruitment", icon: "briefcase", roles: ["super_admin", "hr_admin", "hr_officer", "recruiter"] },
      { id: "onboarding", label: "Onboarding", icon: "clipboard", roles: ["super_admin", "hr_admin", "hr_officer"] },
      { id: "documents", label: "Documents", icon: "file", roles: ["super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"] },
    ],
  },
  {
    label: "Time & absence", items: [
      { id: "attendance", label: "Attendance", icon: "clock" },
      { id: "leave", label: "Leave", icon: "calendar" },
    ],
  },
  {
    label: "Compensation", items: [
      { id: "payroll", label: "Payroll", icon: "wallet", roles: ["super_admin", "hr_admin", "hr_officer", "payroll", "manager", "employee"] },
      { id: "expenses", label: "Expenses", icon: "receipt", roles: ["super_admin", "hr_admin", "hr_officer", "payroll", "manager", "employee"] },
    ],
  },
  {
    label: "Talent", items: [
      { id: "performance", label: "Performance", icon: "target" },
      { id: "training", label: "Training", icon: "graduation" },
    ],
  },
  {
    label: "Operations", items: [
      { id: "assets", label: "Assets", icon: "laptop" },
      { id: "helpdesk", label: "Helpdesk", icon: "lifebuoy" },
      { id: "announcements", label: "Announcements & Events", icon: "megaphone" },
    ],
  },
  { label: "Insight", items: [{ id: "reports", label: "Reports", icon: "chart", roles: ["super_admin", "hr_admin", "hr_officer", "payroll", "manager", "auditor"] }] },
  {
    label: "System", items: [
      { id: "settings", label: "Settings", icon: "sliders" },
      { id: "admin", label: "Administration", icon: "settings", roles: ["super_admin"] },
    ],
  },
];

const PAGES = {
  dashboard: "Overview", approvals: "Approvals Inbox", employees: "Employees", organisation: "Organisation", recruitment: "Recruitment",
  onboarding: "Onboarding", documents: "Documents", attendance: "Attendance", leave: "Leave",
  payroll: "Payroll", expenses: "Expenses", performance: "Performance", training: "Training",
  assets: "Assets", helpdesk: "Helpdesk", announcements: "Announcements & Events", reports: "Reports",
  admin: "Administration", profile: "My Profile", settings: "Settings", notifications: "Notifications",
};

function currentRole() { return Store.role(); }

function renderNav() {
  const nav = document.getElementById("nav");
  const role = currentRole();
  nav.innerHTML = NAV.map(group => {
    const items = group.items.filter(i => !i.roles || i.roles.includes(role));
    if (!items.length) return "";
    return '<div class="nav-group"><div class="nav-label">' + group.label + '</div>'
      + items.map(i => '<button class="nav-item" data-nav="' + i.id + '">' + icon(i.icon, 17) + '<span>' + i.label + '</span>'
        + (i.id === "approvals" ? '<span class="badge hidden" id="nav-approvals-badge"></span>' : "")
        + (i.id === "leave" ? '<span class="badge hidden" id="nav-leave-badge"></span>' : "")
        + (i.id === "notifications" ? '<span class="badge hidden" id="nav-notif-badge"></span>' : "")
        + '</button>').join("")
      + '</div>';
  }).join("");
  nav.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => {
    go(b.dataset.nav);
    document.getElementById("sidebar").classList.remove("open");
  });
}

function setActiveNav(section) {
  document.querySelectorAll("[data-nav]").forEach(b => b.classList.toggle("active", b.dataset.nav === section));
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  if (!h) return ["dashboard"];
  return h.split("/").filter(Boolean);
}

async function renderRoute() {
  if (!Store.user) return;
  const parts = parseHash();
  const section = parts[0] || "dashboard";
  const params = parts.slice(1);
  Store.route = section;
  const view = document.getElementById("view");
  if (!PAGES[section]) {
    view.innerHTML = pageHead("Not found", "That page does not exist.") + emptyState("404", "Use the navigation to get back on track.", "alert");
    return;
  }
  document.getElementById("crumb-current").textContent = PAGES[section];
  document.title = "Meridian HR — " + PAGES[section];
  setActiveNav(section);
  window.scrollTo({ top: 0 });
  try {
    await Views[section](view, params);
  } catch (e) {
    view.innerHTML = pageHead(PAGES[section], "Something went wrong") + emptyState("Unable to load this page", e.message, "alert");
  }
}

function navigate() { renderRoute(); }

function go(path) {
  const target = "#/" + path;
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("notif-dropdown").classList.add("hidden");
  document.getElementById("user-dropdown").classList.add("hidden");
  if (location.hash === target) renderRoute();
  else location.hash = target;
}

function logout() {
  API.logout().finally(() => {
    Store.user = null;
    document.getElementById("app-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("login-password").value = "";
    document.getElementById("login-form").reset();
  });
}

function showApp() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");
  renderNav();
  const u = Store.user;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
  set("side-avatar", esc(initials(u.name)));
  document.getElementById("side-avatar").style.background = colorFor(u.name);
  set("side-name", esc(u.name));
  set("side-role", esc(u.role + (u.job_title ? " · " + u.job_title : "")));
  set("top-avatar", esc(initials(u.name)));
  document.getElementById("top-avatar").style.background = colorFor(u.name);
  set("dd-name", esc(u.name));
  set("dd-email", esc(u.email));
  set("dd-role", esc(u.role));
  set("search-icon", icon("search", 15));
  set("bell-icon", icon("bell", 17));
  set("settings-btn", icon("settings", 17));
  set("menu-btn", icon("menu", 18));
  document.getElementById("logout-btn").innerHTML = icon("logout", 16);
  loadNotifications();
  renderRoute();
}

async function loadNotifications() {
  try {
    const [res, unread] = await Promise.all([API.get("/notifications", { per_page: 8 }), API.get("/notifications/unread")]);
    Store.notifications = res.data;
    const count = unread.data.count;
    const badge = document.getElementById("notif-count");
    badge.textContent = count;
    badge.classList.toggle("hidden", count === 0);
    const navBadge = document.getElementById("nav-notif-badge");
    if (navBadge) {
      navBadge.textContent = count;
      navBadge.classList.toggle("hidden", count === 0);
    }
    const list = document.getElementById("notif-list");
    list.innerHTML = res.data.length ? res.data.map(n =>
      '<div class="dropdown-item" data-notif="' + n.id + '" data-link="' + esc(n.link || "") + '">'
      + '<b style="' + (n.read_at ? "" : "color:var(--ink);font-weight:600") + '">' + esc(n.title) + '</b>'
      + '<span>' + esc(n.body || "") + '</span><span style="display:block;margin-top:3px;font-size:10px;color:var(--muted-2)">' + timeAgo(n.created_at) + '</span></div>'
    ).join("") : '<div class="dropdown-empty">You are all caught up.</div>';
    list.querySelectorAll("[data-notif]").forEach(item => item.onclick = async () => {
      try { await API.post("/notifications/" + item.dataset.notif + "/read"); } catch (e) {}
      const rawLink = item.dataset.link || "";
      document.getElementById("notif-dropdown").classList.add("hidden");
      loadNotifications();
      if (rawLink) {
        let dest = rawLink.replace(/^\/app\/?/, "").replace(/^\//, "") || "dashboard";
        go(dest);
      } else {
        go("notifications");
      }
    });
    // Update live Approvals sidebar badge if applicable
    const appBadge = document.getElementById("nav-approvals-badge");
    if (appBadge && Store.isRole("super_admin", "hr_admin", "hr_officer", "manager", "payroll")) {
      API.get("/approvals/inbox").then(ib => {
        const ac = (ib.data || []).length;
        appBadge.textContent = ac;
        appBadge.classList.toggle("hidden", ac === 0);
      }).catch(() => {});
    }
  } catch (e) { /* silent */ }
}

function bindChrome() {
  document.getElementById("menu-btn").onclick = () => document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-scrim").onclick = () => document.getElementById("sidebar").classList.remove("open");
  document.getElementById("notif-btn").onclick = (e) => {
    e.stopPropagation();
    document.getElementById("notif-dropdown").classList.toggle("hidden");
    document.getElementById("user-dropdown").classList.add("hidden");
  };
  document.querySelectorAll("[data-go-notif]").forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    document.getElementById("notif-dropdown").classList.add("hidden");
    go(el.dataset.goNotif);
  });
  const settingsBtn = document.getElementById("settings-btn");
  if (settingsBtn) settingsBtn.onclick = () => go("settings");
  document.getElementById("mark-all-read").onclick = async (e) => {
    e.stopPropagation();
    try { await API.post("/notifications/read-all"); loadNotifications(); toast("All notifications marked read", "success"); } catch (err) { handleErr(err); }
  };
  document.getElementById("top-user").onclick = (e) => {
    e.stopPropagation();
    document.getElementById("user-dropdown").classList.toggle("hidden");
    document.getElementById("notif-dropdown").classList.add("hidden");
  };
  document.querySelectorAll("#user-dropdown [data-go]").forEach(el => el.onclick = () => {
    document.getElementById("user-dropdown").classList.add("hidden");
    go(el.dataset.go);
  });
  document.getElementById("dd-logout").onclick = logout;
  document.getElementById("logout-btn").onclick = logout;
  document.getElementById("help-btn").onclick = () => openModal({
    title: "Help & support",
    body: '<div class="stack"><p class="small muted">Meridian HR demo environment. Use the Helpdesk module to raise HR queries, or contact your administrator.</p>'
      + '<div class="card card-pad"><div class="section-title">Demo accounts</div><dl class="kv"><dt>Super Admin</dt><dd>ama.mensah@meridian.gh / Admin@123</dd><dt>HR Admin</dt><dd>kwame.boateng@meridian.gh / Hr@123</dd><dt>Manager</dt><dd>kofi.adjei@meridian.gh / Manager@123</dd><dt>Employee</dt><dd>abena.sarpong@meridian.gh / Employee@123</dd><dt>Payroll</dt><dd>akosua.darko@meridian.gh / Payroll@123</dd></dl></div>'
      + '<p class="tiny muted">Data is stored in a local SQLite database. All create, update and delete actions are written to the audit log.</p></div>',
    footer: '<button class="btn btn-accent" data-close-modal>Got it</button>',
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#notif-btn") && !e.target.closest("#notif-dropdown")) document.getElementById("notif-dropdown").classList.add("hidden");
    if (!e.target.closest("#top-user") && !e.target.closest("#user-dropdown")) document.getElementById("user-dropdown").classList.add("hidden");
  });
  const searchTrigger = document.getElementById("global-search-trigger") || document.getElementById("global-search");
  if (searchTrigger) {
    searchTrigger.addEventListener("click", () => {
      if (typeof openCommandPalette === "function") openCommandPalette("");
    });
  }
  document.addEventListener("auth:expired", () => {
    Store.user = null;
    document.getElementById("app-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    toast("Your session expired. Please sign in again.", "error");
  });
}

function bindLogin() {
  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("login-error");
  const btn = document.getElementById("login-submit");
  form.onsubmit = async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      Store.user = await API.login(email, password);
      await Store.loadMeta();
      history.replaceState(null, "", location.pathname);
      showApp();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in to Meridian";
    }
  };
  document.querySelectorAll(".demo-item").forEach(item => item.onclick = () => {
    document.getElementById("login-email").value = item.dataset.email;
    document.getElementById("login-password").value = item.dataset.pass;
    errorBox.classList.add("hidden");
    document.getElementById("login-password").focus();
  });
}

async function boot() {
  bindLogin();
  bindChrome();
  window.addEventListener("hashchange", renderRoute);
  const ok = await Store.boot();
  if (ok) {
    if (!location.hash) history.replaceState(null, "", location.pathname + "#/dashboard");
    showApp();
  } else {
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("app-view").classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", boot);
