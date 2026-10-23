const NAV = [
  {
    label: "Workspace", icon: "home",
    items: [
      { id: "dashboard", label: "Overview", icon: "dashboard" },
      { id: "approvals", label: "Approvals", icon: "inbox", roles: ["super_admin", "hr_admin", "hr_officer", "manager", "payroll"] },
      { id: "profile", label: "My Profile", icon: "user" },
      { id: "notifications", label: "Notifications", icon: "bell" },
    ],
  },
  {
    label: "Core HR", icon: "users",
    items: [
      { id: "employees", label: "People directory", icon: "users" },
      {
        id: "organisation-group", label: "Organisation", icon: "org",
        children: [
          { id: "organisation", label: "Departments & structure" },
          { id: "organisation?tab=designations", label: "Designations" },
        ],
      },
      { id: "recruitment", label: "Recruitment", icon: "briefcase", roles: ["super_admin", "hr_admin", "hr_officer", "recruiter"] },
      { id: "onboarding", label: "Onboarding", icon: "clipboard", roles: ["super_admin", "hr_admin", "hr_officer"] },
      { id: "documents", label: "Documents", icon: "file", roles: ["super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"] },
    ],
  },
  {
    label: "Time & absence", icon: "clock",
    items: [
      { id: "attendance", label: "Attendance", icon: "clock" },
      { id: "leave", label: "Leave", icon: "calendar" },
    ],
  },
  {
    label: "Compensation", icon: "wallet",
    items: [
      { id: "payroll", label: "Payroll", icon: "wallet", roles: ["super_admin", "hr_admin", "hr_officer", "payroll", "manager", "employee"] },
      { id: "expenses", label: "Expenses", icon: "receipt", roles: ["super_admin", "hr_admin", "hr_officer", "payroll", "manager", "employee"] },
    ],
  },
  {
    label: "Talent", icon: "award",
    items: [
      { id: "performance", label: "Performance", icon: "target" },
      { id: "training", label: "Learning & training", icon: "graduation" },
    ],
  },
  {
    label: "Operations", icon: "laptop",
    items: [
      { id: "operations", label: "Overview", icon: "grid" },
      {
        id: "ops-resources", label: "Resources", icon: "laptop",
        children: [
          { id: "assets", label: "Assets" },
          { id: "operations", label: "Ops inventory", subTab: "assets" },
        ],
      },
      {
        id: "ops-service", label: "Service desk", icon: "lifebuoy",
        children: [
          { id: "helpdesk", label: "Helpdesk tickets" },
          { id: "operations", label: "Ops queue", subTab: "helpdesk" },
        ],
      },
      {
        id: "ops-comms", label: "Communications", icon: "megaphone",
        children: [
          { id: "announcements", label: "Announcements" },
          { id: "operations", label: "Ops events", subTab: "announcements" },
        ],
      },
    ],
  },
  {
    label: "Insight", icon: "chart",
    items: [
      { id: "reports", label: "Reports & analytics", icon: "chart", roles: ["super_admin", "hr_admin", "hr_officer", "payroll", "manager", "auditor"] },
    ],
  },
  {
    label: "System", icon: "sliders",
    items: [
      { id: "settings", label: "Settings", icon: "sliders" },
      { id: "admin", label: "Administration", icon: "settings", roles: ["super_admin"] },
    ],
  },
];

const PAGES = {
  dashboard: "Overview", approvals: "Approvals Inbox", employees: "Employees", organisation: "Organisation", recruitment: "Recruitment",
  onboarding: "Onboarding", documents: "Documents", attendance: "Attendance", leave: "Leave",
  payroll: "Payroll", expenses: "Expenses", performance: "Performance", training: "Training",
  assets: "Assets", helpdesk: "Helpdesk", announcements: "Announcements & Events", operations: "Operations",
  reports: "Reports", admin: "Administration", profile: "My Profile", settings: "Settings", notifications: "Notifications",
};

function currentRole() { return Store.role(); }

function itemVisible(i, role) { return !i.roles || i.roles.includes(role); }
function itemBadge(id) {
  if (id === "approvals") return '<span class="badge hidden" id="nav-approvals-badge"></span>';
  if (id === "notifications") return '<span class="badge hidden" id="nav-notif-badge"></span>';
  if (id === "leave") return '<span class="badge hidden" id="nav-leave-badge"></span>';
  return "";
}

let navExpandedGroups = {};
let sidebarCollapsed = false;
try { sidebarCollapsed = localStorage.getItem("hrms_sidebar_collapsed") === "1"; } catch (_) {}

function renderNav() {
  const nav = document.getElementById("nav");
  const role = currentRole();
  const collapsed = sidebarCollapsed;
  document.getElementById("sidebar").classList.toggle("collapsed", collapsed);
  document.getElementById("main-wrap")?.classList.toggle("sidebar-collapsed", collapsed);

  let html = "";
  NAV.forEach(group => {
    const visible = group.items.filter(i => itemVisible(i, role));
    if (!visible.length) return;
    if (collapsed) {
      // collapsed: group shows icon; flyout on hover with items/subgroups
      html += '<div class="nav-group nav-group-collapsed">'
        + '<button class="nav-item nav-group-head" title="' + esc(group.label) + '" data-group-icon="' + group.label + '">' + icon(group.icon || "grid", 18) + '</button>'
        + '<div class="nav-flyout"><div class="flyout-title">' + esc(group.label) + '</div>'
        + visible.map(i => {
            if (i.children) {
              return '<div class="flyout-subhead">' + icon(i.icon || "chevronRight", 14) + '<span>' + esc(i.label) + '</span></div>'
                + i.children.map(c => '<button class="nav-item flyout-item flyout-child" data-nav="' + esc(c.id) + '"'
                  + (c.subTab ? ' data-subtab="' + esc(c.subTab) + '"' : "") + '>'
                  + icon("dot", 9) + '<span>' + esc(c.label) + '</span></button>').join("");
            }
            return '<button class="nav-item flyout-item" data-nav="' + esc(i.id) + '"'
              + (i.subTab ? ' data-subtab="' + esc(i.subTab) + '"' : "") + '>'
              + icon(i.icon || "circle", 15) + '<span>' + esc(i.label) + '</span>' + itemBadge(i.id) + '</button>';
          }).join("")
        + '</div></div>';
    } else {
      html += '<div class="nav-group" data-group="' + esc(group.label) + '"><div class="nav-label">' + esc(group.label) + '</div>'
        + visible.map(i => {
            if (i.children) {
              const gid = "grp-" + i.id;
              const open = navExpandedGroups[i.id];
              return '<button class="nav-item nav-subhead" data-subtoggle="' + esc(i.id) + '">'
                + icon(i.icon || "folder", 17) + '<span>' + esc(i.label) + '</span>'
                + '<span class="nav-caret">' + icon(open ? "chevronDown" : "chevronRight", 13) + '</span></button>'
                + '<div class="nav-sub ' + (open ? "open" : "") + '" id="' + gid + '">'
                + i.children.map(c => '<button class="nav-item nav-sub-item" data-nav="' + esc(c.id) + '"' + (c.subTab ? ' data-subtab="' + esc(c.subTab) + '"' : "") + '><span>' + icon("dot", 10) + '</span><span>' + esc(c.label) + '</span></button>').join("")
                + '</div>';
            }
            return '<button class="nav-item" data-nav="' + esc(i.id) + '">' + icon(i.icon, 17) + '<span>' + esc(i.label) + '</span>' + itemBadge(i.id) + '</button>';
          }).join("")
        + '</div>';
    }
  });
  nav.innerHTML = html;

  nav.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => {
    const target = b.dataset.subtab ? (b.dataset.nav + "/" + b.dataset.subtab) : b.dataset.nav;
    go(target);
    document.getElementById("sidebar").classList.remove("open");
  });
  nav.querySelectorAll("[data-subtoggle]").forEach(b => b.onclick = () => {
    const key = b.dataset.subtoggle;
    navExpandedGroups[key] = !navExpandedGroups[key];
    renderNav();
  });

  // Collapse toggle
  const toggle = document.getElementById("sidebar-toggle");
  if (toggle) {
    toggle.innerHTML = icon(collapsed ? "chevronsRight" : "chevronsLeft", 16);
    toggle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    toggle.onclick = () => {
      sidebarCollapsed = !sidebarCollapsed;
      try { localStorage.setItem("hrms_sidebar_collapsed", sidebarCollapsed ? "1" : "0"); } catch (_) {}
      renderNav();
    };
  }
}

function setActiveNav(section, sub) {
  // A nav entry matches when both the route section and its sub-tab line up, so
  // "Operations → Assets" and "Operations → Overview" never light up together.
  const activeSub = sub === undefined ? (parseHash()[1] || null) : (sub || null);

  // Auto-expand every parent subgroup that owns the current route/sub-tab. The nav
  // has to be re-rendered for that to be visible, so do it before marking entries
  // active (renderNav rebuilds the buttons from scratch).
  let expandChanged = false;
  NAV.forEach(group => {
    group.items.forEach(i => {
      if (!i.children) return;
      const ownsRoute = i.children.some(c => c.id === section && (c.subTab || null) === activeSub);
      if (ownsRoute && !navExpandedGroups[i.id]) { navExpandedGroups[i.id] = true; expandChanged = true; }
    });
  });
  if (expandChanged && !sidebarCollapsed) renderNav();

  document.querySelectorAll("[data-nav]").forEach(b => {
    const sameSection = b.dataset.nav === section;
    const sameSub = (b.dataset.subtab || null) === activeSub;
    b.classList.toggle("active", sameSection && sameSub);
  });
  // Highlight the subgroup heading that contains the open page
  document.querySelectorAll("[data-subtoggle]").forEach(head => {
    const sub = head.nextElementSibling;
    head.classList.toggle("sub-active", !!(sub && sub.querySelector(".nav-sub-item.active")));
  });
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

function applyBrand(brand) {
  if (!brand) return;
  if (brand.name) {
    document.getElementById("brand-name").textContent = brand.name;
    document.title = brand.name + " — " + (brand.tagline || "People operations");
    const initial = (brand.name || "M").trim().charAt(0).toUpperCase();
    const glyphEl = document.getElementById("brand-glyph");
    if (glyphEl && !brand.logo_url) glyphEl.textContent = initial;
    const crumbLogo = document.getElementById("crumb-logo");
    if (crumbLogo && !brand.logo_url) crumbLogo.textContent = initial;
  }
  if (brand.tagline) document.getElementById("brand-sub").textContent = brand.tagline;
  const pillText = document.getElementById("site-pill-text");
  if (pillText) {
    const loc = brand.location_name || (brand.city ? brand.city + " HQ" : "Accra HQ");
    pillText.textContent = (brand.name || "Meridian") + " · " + loc;
  }
  if (brand.favicon_url) {
    const link = document.getElementById("favicon-link");
    if (link) link.href = brand.favicon_url;
  }
  if (brand.logo_url) {
    const glyph = document.getElementById("brand-glyph");
    if (glyph) {
      glyph.innerHTML = '<img src="' + esc(brand.logo_url) + '" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:10px">';
      glyph.style.background = "transparent";
    }
    const cl = document.getElementById("crumb-logo");
    if (cl) {
      cl.innerHTML = '<img src="' + esc(brand.logo_url) + '" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:7px">';
      cl.style.background = "transparent";
    }
  }
  // Theme color variables
  const root = document.documentElement;
  if (brand.theme === "teal") { root.style.setProperty("--accent", "#0f766e"); root.style.setProperty("--accent-dark", "#0c5f59"); root.style.setProperty("--accent-soft", "#e2f0ed"); }
  else if (brand.theme === "navy") { root.style.setProperty("--accent", "#2c5d8f"); root.style.setProperty("--accent-dark", "#214a73"); root.style.setProperty("--accent-soft", "#e6eef7"); }
  else if (brand.theme === "plum") { root.style.setProperty("--accent", "#6b4a86"); root.style.setProperty("--accent-dark", "#553a6b"); root.style.setProperty("--accent-soft", "#f0e9f6"); }
  else if (brand.theme === "emerald") { root.style.setProperty("--accent", "#2f7d5d"); root.style.setProperty("--accent-dark", "#25634a"); root.style.setProperty("--accent-soft", "#e4f2ea"); }
  else { root.style.setProperty("--accent", "#c2703d"); root.style.setProperty("--accent-dark", "#a85c2d"); root.style.setProperty("--accent-soft", "#f7e9de"); }
}

async function loadBrand() {
  try {
    const res = await fetch("/api/v1/brand");
    const j = await res.json();
    if (j && j.data) applyBrand(j.data);
  } catch (e) { /* silent */ }
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
  loadBrand();
  if (Store.meta && Store.meta.company) applyBrand(Store.meta.company);
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
