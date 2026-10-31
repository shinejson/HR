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
      { id: "employment-letters", label: "Employment letters", icon: "file" },
      {
        id: "organisation-group", label: "Organisation", icon: "org",
        children: [
          { id: "organisation", label: "Departments & structure", subTab: "departments" },
          { id: "organisation", label: "Designations", subTab: "designations" },
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
    label: "Hotel Operations", icon: "laptop", requiresOps: true,
    items: [
      { id: "operations", label: "Operations Dashboard", icon: "grid", requiresOps: true },
      {
        id: "ops-inventory-group", label: "Hotel Inventory", icon: "box", requiresOps: true,
        children: [
          { id: "operations", label: "Supplies & Amenities", subTab: "inventory" },
          { id: "operations", label: "Storerooms & Hubs", subTab: "storerooms" },
          { id: "operations", label: "Equipment Assets", subTab: "assets" },
        ],
      },
      {
        id: "ops-service-group", label: "Service & Work Orders", icon: "lifebuoy", requiresOps: true,
        children: [
          { id: "operations", label: "Work Orders Queue", subTab: "workorders" },
          { id: "operations", label: "Maintenance schedule", subTab: "maintenance" },
          { id: "helpdesk", label: "Helpdesk tickets" },
        ],
      },
      {
        id: "ops-safety-group", label: "Hospitality Standards", icon: "shield", requiresOps: true,
        children: [
          { id: "operations", label: "Wings & Room Readiness", subTab: "readiness" },
          { id: "operations", label: "Health, Safety & Hygiene", subTab: "safety" },
          { id: "announcements", label: "Hotel Broadcasts" },
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
      { id: "backups", label: "Backups & recovery", icon: "copy", roles: ["super_admin"] },
    ],
  },
];

const PAGES = {
  dashboard: "Overview", approvals: "Approvals Inbox", employees: "Employees",
  "employment-letters": "Employment Letters", organisation: "Organisation", recruitment: "Recruitment",
  onboarding: "Onboarding", documents: "Documents", attendance: "Attendance", leave: "Leave",
  payroll: "Payroll", expenses: "Expenses", performance: "Performance", training: "Training",
  assets: "Assets", helpdesk: "Helpdesk", announcements: "Announcements & Events", operations: "Operations",
  reports: "Reports", admin: "Administration", profile: "My Profile", settings: "Settings", notifications: "Notifications",
  backups: "Backups & Recovery",
};

function currentRole() { return Store.role(); }

function itemVisible(i, role) {
  if (i.requiresOps && (!Store.canOperations || !Store.canOperations())) return false;
  return !i.roles || i.roles.includes(role);
}
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
    if (group.requiresOps && (!Store.canOperations || !Store.canOperations())) return;
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

  if (collapsed) bindCollapsedFlyouts(nav);

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

function bindCollapsedFlyouts(navEl) {
  navEl.querySelectorAll(".nav-group-collapsed").forEach(group => {
    const flyout = group.querySelector(".nav-flyout");
    const head = group.querySelector(".nav-group-head");
    if (!flyout || !head) return;

    let hideTimer = null;
    const positionFlyout = () => {
      const r = head.getBoundingClientRect();
      const maxTop = Math.max(8, window.innerHeight - flyout.offsetHeight - 8);
      const top = Math.min(Math.round(r.top), maxTop);
      flyout.style.left = Math.round(r.right + 8) + "px";
      flyout.style.top = top + "px";
    };
    const show = () => {
      clearTimeout(hideTimer);
      flyout.classList.add("is-open");
      positionFlyout();
    };
    const scheduleHide = () => {
      hideTimer = setTimeout(() => flyout.classList.remove("is-open"), 130);
    };

    group.addEventListener("mouseenter", show);
    group.addEventListener("mouseleave", scheduleHide);
    flyout.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    flyout.addEventListener("mouseleave", scheduleHide);
  });
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
  const raw = location.hash.replace(/^#\/?/, "");
  if (!raw) return ["dashboard"];
  const [clean, query] = raw.split("?");
  const parts = clean.split("/").filter(Boolean);
  if (query && parts.length === 1) {
    const qMatch = query.match(/tab=([^&]+)/);
    if (qMatch) parts.push(qMatch[1]);
  }
  return parts.length ? parts : ["dashboard"];
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
  const brandName = (Store.meta && Store.meta.company && Store.meta.company.name) || "Meridian HR";
  document.title = brandName + " — " + PAGES[section];
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

const SessionActivityManager = (() => {
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity timeout
  const WARNING_MS = 2 * 60 * 1000;  // 2 minutes warning before logout (at 28 mins)
  const THROTTLE_MS = 15 * 1000;     // Record activity at most once every 15s
  const PING_INTERVAL_MS = 5 * 60 * 1000; // Keep backend alive every 5 mins during active use

  let checkTimer = null;
  let countdownTimer = null;
  let lastRecordedTime = Date.now();
  let lastPingTime = Date.now();
  let isWarningOpen = false;
  let initialized = false;

  function getLastActivity() {
    const raw = localStorage.getItem("hrms_last_activity");
    const parsed = raw ? parseInt(raw, 10) : 0;
    return parsed > 0 ? parsed : lastRecordedTime;
  }

  function setLastActivity(time) {
    lastRecordedTime = time;
    localStorage.setItem("hrms_last_activity", String(time));
  }

  function recordActivity(fromUser) {
    if (!API.token) return;
    const now = Date.now();
    if (isWarningOpen && fromUser) {
      extendSession();
      return;
    }
    if (now - lastRecordedTime >= THROTTLE_MS) {
      setLastActivity(now);
      if (now - lastPingTime >= PING_INTERVAL_MS) {
        lastPingTime = now;
        API.ping().catch(() => {});
      }
    }
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function showWarningModal(remainingMs) {
    if (isWarningOpen) return;
    isWarningOpen = true;
    let secondsLeft = Math.max(1, Math.round(remainingMs / 1000));

    const modalBody = '<div class="stack" style="text-align:center;padding:8px 4px;">' +
      '<div style="font-size:36px;line-height:1;margin-bottom:8px;">&#9203;</div>' +
      '<h4 style="margin:0 0 6px 0;font-size:17px;font-weight:600;">Session Expiring Soon</h4>' +
      '<p class="small muted" style="margin:0 0 16px 0;">You have been inactive for 28 minutes. For security, your session will automatically log out in:</p>' +
      '<div style="font-size:34px;font-weight:700;font-family:monospace;color:var(--accent);letter-spacing:1px;" id="session-countdown-display">' + formatTime(secondsLeft) + '</div>' +
      '<p class="tiny muted" style="margin:14px 0 0 0;">Click <strong>Stay Signed In</strong> or interact with the screen to keep working.</p>' +
      '</div>';

    const modalFoot = '<button class="btn btn-ghost" id="session-logout-now-btn">Sign Out Now</button>' +
      '<button class="btn btn-accent" id="session-stay-signed-in-btn">Stay Signed In</button>';

    openModal({
      title: "Inactivity Warning",
      narrow: true,
      body: modalBody,
      footer: modalFoot,
      onMount(card) {
        const stayBtn = card.querySelector("#session-stay-signed-in-btn");
        const logoutBtn = card.querySelector("#session-logout-now-btn");
        const display = card.querySelector("#session-countdown-display");

        if (stayBtn) {
          stayBtn.onclick = () => {
            extendSession();
          };
        }
        if (logoutBtn) {
          logoutBtn.onclick = () => {
            closeWarningModal();
            logout();
          };
        }

        clearInterval(countdownTimer);
        countdownTimer = setInterval(() => {
          secondsLeft--;
          if (display) display.textContent = formatTime(Math.max(0, secondsLeft));
          if (secondsLeft <= 0) {
            clearInterval(countdownTimer);
            closeWarningModal();
            performAutoLogout();
          }
        }, 1000);
      }
    });
  }

  function closeWarningModal() {
    if (isWarningOpen) {
      isWarningOpen = false;
      clearInterval(countdownTimer);
      if (typeof closeModal === "function") closeModal();
    }
  }

  function extendSession() {
    closeWarningModal();
    const now = Date.now();
    setLastActivity(now);
    lastPingTime = now;
    API.ping().then(() => {
      toast("Session extended", "info");
    }).catch(() => {});
  }

  function performAutoLogout() {
    closeWarningModal();
    stop();
    API.logout().finally(() => {
      Store.user = null;
      document.getElementById("app-view").classList.add("hidden");
      document.getElementById("login-view").classList.remove("hidden");
      const pwd = document.getElementById("login-password");
      if (pwd) pwd.value = "";
      toast("You have been signed out due to 30 minutes of inactivity.", "warning");
    });
  }

  function checkStatus() {
    if (!API.token) return;
    const now = Date.now();
    const last = getLastActivity();
    const idleMs = now - last;

    if (idleMs >= TIMEOUT_MS) {
      performAutoLogout();
    } else if (idleMs >= TIMEOUT_MS - WARNING_MS) {
      showWarningModal(TIMEOUT_MS - idleMs);
    } else if (isWarningOpen) {
      closeWarningModal();
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const userEvents = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "wheel"];
    userEvents.forEach(evt => {
      window.addEventListener(evt, () => recordActivity(true), { passive: true });
    });

    window.addEventListener("storage", (e) => {
      if (e.key === "hrms_last_activity") {
        if (isWarningOpen) closeWarningModal();
      } else if (e.key === "hrms_token" && !e.newValue) {
        closeWarningModal();
        stop();
        Store.user = null;
        document.getElementById("app-view").classList.add("hidden");
        document.getElementById("login-view").classList.remove("hidden");
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkStatus();
    });
    window.addEventListener("focus", checkStatus);
  }

  function start() {
    init();
    setLastActivity(Date.now());
    lastPingTime = Date.now();
    clearInterval(checkTimer);
    checkTimer = setInterval(checkStatus, 5000);
  }

  function stop() {
    clearInterval(checkTimer);
    clearInterval(countdownTimer);
    closeWarningModal();
  }

  return {
    init,
    start,
    stop,
    recordActivity,
    extendSession,
    performAutoLogout,
    get isWarningOpen() { return isWarningOpen; }
  };
})();

function logout() {
  if (typeof SessionActivityManager !== "undefined") {
    SessionActivityManager.stop();
  }
  API.logout().finally(() => {
    Store.user = null;
    document.getElementById("app-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("login-password").value = "";
    document.getElementById("login-form").reset();
  });
}

function buildDefaultFaviconHref(initial) {
  const ch = encodeURIComponent((initial || "M").trim().charAt(0).toUpperCase() || "M");
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
    + "<rect width='64' height='64' rx='14' fill='%2310201f'/>"
    + "<text x='32' y='44' font-family='Georgia' font-size='34' fill='%23c2703d' text-anchor='middle'>" + ch + "</text>"
    + "</svg>";
  return "data:image/svg+xml," + svg;
}

function setBrowserFavicon(faviconUrl, fallbackInitial) {
  const targetHref = (faviconUrl && String(faviconUrl).trim()) ? String(faviconUrl).trim() : buildDefaultFaviconHref(fallbackInitial);
  let link = document.getElementById("favicon-link") || document.querySelector("link[rel*='icon']");
  if (link && link.getAttribute("href") === targetHref) return;
  if (link && link.parentNode) link.parentNode.removeChild(link);
  link = document.createElement("link");
  link.id = "favicon-link";
  link.rel = "icon";
  link.href = targetHref;
  document.head.appendChild(link);
}

function renderGlyphElement(el, logoUrl, initial, altText) {
  if (!el) return;
  if (logoUrl && String(logoUrl).trim()) {
    el.classList.add("has-logo");
    el.style.background = "";
    el.innerHTML = '<img src="' + esc(String(logoUrl).trim()) + '" alt="' + esc(altText || "logo") + '">';
    const img = el.querySelector("img");
    if (img) {
      img.onerror = () => {
        el.classList.remove("has-logo");
        el.textContent = initial;
      };
    }
  } else {
    el.classList.remove("has-logo");
    el.style.background = "";
    el.textContent = initial;
  }
}

function applyBrand(brand) {
  if (!brand) return;
  const name = (brand.name || "Meridian HR").trim();
  const tagline = (brand.tagline || "People operations").trim();
  const initial = (name.charAt(0) || "M").toUpperCase();

  const brandNameEl = document.getElementById("brand-name");
  if (brandNameEl) brandNameEl.textContent = name;
  const loginBrandName = document.getElementById("login-brand-name");
  if (loginBrandName) loginBrandName.textContent = name;
  const crumbCompany = document.getElementById("crumb-company");
  if (crumbCompany) crumbCompany.textContent = name;

  const brandSubEl = document.getElementById("brand-sub");
  if (brandSubEl) brandSubEl.textContent = tagline;
  const loginBrandSub = document.getElementById("login-brand-sub");
  if (loginBrandSub) loginBrandSub.textContent = tagline;

  const activeSection = Store.route && PAGES[Store.route] ? PAGES[Store.route] : tagline;
  document.title = name + " — " + (Store.user ? activeSection : tagline);

  const pillText = document.getElementById("site-pill-text");
  if (pillText) {
    const loc = brand.location_name || (brand.city ? brand.city + " HQ" : "Accra HQ");
    pillText.textContent = name + " · " + loc;
  }

  renderGlyphElement(document.getElementById("brand-glyph"), brand.logo_url, initial, name + " logo");
  renderGlyphElement(document.getElementById("crumb-logo"), brand.logo_url, initial, name + " logo");
  renderGlyphElement(document.getElementById("login-brand-glyph"), brand.logo_url, initial, name + " logo");
  setBrowserFavicon(brand.favicon_url, initial);

  // Portal colour theme is controlled by ThemeManager (Settings → Appearance / top bar).
  if (window.ThemeManager) window.ThemeManager.init();
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
  if (typeof SessionActivityManager !== "undefined") {
    SessionActivityManager.start();
  }
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
  set("theme-btn", icon("palette", 17));
  set("menu-btn", icon("menu", 18));
  refreshThemeMenu();
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

function refreshThemeMenu() {
  const list = document.getElementById("theme-menu-list");
  if (list && window.ThemeManager) list.innerHTML = window.ThemeManager.renderMenu();
  document.querySelectorAll("[data-theme-pick]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      window.ThemeManager.set(btn.dataset.themePick);
      refreshThemeMenu();
      document.getElementById("theme-dropdown")?.classList.add("hidden");
    };
  });
}

function bindChrome() {
  document.getElementById("menu-btn").onclick = () => document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-scrim").onclick = () => document.getElementById("sidebar").classList.remove("open");
  document.getElementById("theme-btn").onclick = (e) => {
    e.stopPropagation();
    refreshThemeMenu();
    document.getElementById("theme-dropdown").classList.toggle("hidden");
    document.getElementById("notif-dropdown").classList.add("hidden");
    document.getElementById("user-dropdown").classList.add("hidden");
  };
  document.querySelectorAll("[data-go-theme]").forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    document.getElementById("theme-dropdown").classList.add("hidden");
    go(el.dataset.goTheme);
  });
  document.addEventListener("hrms-theme-change", refreshThemeMenu);
  document.getElementById("notif-btn").onclick = (e) => {
    e.stopPropagation();
    document.getElementById("notif-dropdown").classList.toggle("hidden");
    document.getElementById("theme-dropdown").classList.add("hidden");
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
    document.getElementById("theme-dropdown").classList.add("hidden");
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
    if (!e.target.closest("#theme-btn") && !e.target.closest("#theme-dropdown")) document.getElementById("theme-dropdown").classList.add("hidden");
    if (!e.target.closest("#top-user") && !e.target.closest("#user-dropdown")) document.getElementById("user-dropdown").classList.add("hidden");
  });
  const searchTrigger = document.getElementById("global-search-trigger") || document.getElementById("global-search");
  if (searchTrigger) {
    searchTrigger.addEventListener("click", () => {
      if (typeof openCommandPalette === "function") openCommandPalette("");
    });
  }
  document.addEventListener("auth:expired", (e) => {
    if (typeof SessionActivityManager !== "undefined") {
      SessionActivityManager.stop();
    }
    Store.user = null;
    document.getElementById("app-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    if (e.detail && e.detail.reason === "timeout") {
      toast("Your session has expired due to 30 minutes of inactivity. Please sign in again.", "warning");
    } else {
      toast("Your session expired. Please sign in again.", "error");
    }
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
    const password = document.getElementById("login-password").value.trim();
    try {
      Store.user = await API.login(email, password);
      await Store.loadMeta();
      if (!location.hash || location.hash === '#/' || location.hash === '#') location.hash = '#/dashboard';
      showApp();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in to Meridian";
    }
  };
  const togglePw = document.getElementById("toggle-pw-visibility");
  if (togglePw) {
    togglePw.onclick = () => {
      const pwInput = document.getElementById("login-password");
      if (!pwInput) return;
      if (pwInput.type === "password") {
        pwInput.type = "text";
        togglePw.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      } else {
        pwInput.type = "password";
        togglePw.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      }
    };
  }
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
  if (typeof SessionActivityManager !== "undefined") {
    SessionActivityManager.init();
  }
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
