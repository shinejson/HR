/* Notification Centre, Settings & Gateways, and Announcements & Events */

function switchHTML(attrs, checked, labelText, disabled) {
  return '<label class="switch">'
    + '<input type="checkbox" ' + attrs + (checked ? " checked" : "") + (disabled ? " disabled" : "") + '>'
    + '<span class="switch-track"></span>'
    + (labelText ? '<span class="small">' + esc(labelText) + '</span>' : '')
    + '</label>';
}

function normalizeAppLink(link) {
  if (!link) return "";
  const clean = link.replace(/^\/app\/?/, "").replace(/^\//, "");
  return clean || "dashboard";
}

function notifCategoryIcon(cat) {
  const c = (cat || "").toLowerCase();
  if (c.includes("comm") || c.includes("announce")) return ["megaphone", "var(--accent-soft)", "var(--accent)"];
  if (c.includes("event")) return ["calendar", "var(--purple-soft)", "var(--purple)"];
  if (c.includes("leave") || c.includes("time")) return ["clock", "var(--blue-soft)", "var(--blue)"];
  if (c.includes("payroll")) return ["wallet", "var(--green-soft)", "var(--green)"];
  if (c.includes("expense")) return ["receipt", "var(--amber-soft)", "var(--amber)"];
  if (c.includes("oper") || c.includes("ticket") || c.includes("asset") || c.includes("helpdesk")) return ["lifebuoy", "var(--teal-soft)", "var(--teal)"];
  return ["bell", "var(--paper-2)", "var(--ink-3)"];
}

function emailGatewayBadge(st) {
  if (!st || !st.email_enabled) return '<span class="chip grey">Disabled</span>';
  const mode = (st.email_mode || "sandbox").toLowerCase();
  if (mode === "sandbox") return '<span class="chip teal">Active · Sandbox</span>';
  if (st.email_ready) return '<span class="chip green">Active · SMTP</span>';
  return '<span class="chip amber">SMTP Incomplete</span>';
}

function smsGatewayBadge(st) {
  if (!st || !st.sms_enabled) return '<span class="chip grey">Disabled</span>';
  const prov = (st.sms_provider || "sandbox").toLowerCase();
  if (prov === "sandbox") return '<span class="chip teal">Active · Sandbox</span>';
  const label = prov === "africastalking" ? "Africa's Talking" : (prov === "custom" ? "Webhook" : prov.toUpperCase());
  if (st.sms_ready) return '<span class="chip green">Active · ' + esc(label) + '</span>';
  return '<span class="chip amber">' + esc(label) + ' Incomplete</span>';
}

/* ============================================================================
   SHARED USER PREFERENCE MATRIX RENDERER
============================================================================ */
async function renderUserNotifPreferences(container) {
  container.innerHTML = spinners(3);
  try {
    const res = await API.get("/notifications/preferences");
    const { events, preferences, routing, status } = res.data;
    const u = Store.user || {};

    container.innerHTML = '<div class="stack">'
      + '<div class="grid grid-2">'
      + '  <div class="gateway-card ' + (status && status.email_enabled ? "ready" : "") + '">'
      + '    <div class="gw-head"><div class="row">' + icon("mail", 18) + '<b>Email Notifications</b></div>' + emailGatewayBadge(status) + '</div>'
      + '    <div class="tiny muted" style="margin-top:6px">Delivered to <b>' + esc(u.email || "—") + '</b></div>'
      + '  </div>'
      + '  <div class="gateway-card ' + (status && status.sms_enabled ? "ready" : "") + '">'
      + '    <div class="gw-head"><div class="row">' + icon("phone", 18) + '<b>SMS Alerts</b></div>' + smsGatewayBadge(status) + '</div>'
      + '    <div class="tiny muted" style="margin-top:6px">'
      +      (u.phone ? 'Sent to mobile <b>' + esc(u.phone) + '</b>' : 'No phone number on your profile — <span class="link" onclick="go(\'profile\')">add mobile number</span>')
      + '    </div>'
      + '  </div>'
      + '</div>'

      + '<div class="card">'
      + '  <div class="card-head"><div><h3>Personal Channel Matrix</h3><div class="sub">Choose how Meridian HR notifies you for announcements, company events, approvals & payslips</div></div>'
      + '    <div class="right">'
      + '      <button class="btn btn-sm btn-ghost" id="pref-test-self">' + icon("send", 13) + ' Send test alert</button>'
      + '      <button class="btn btn-sm btn-accent" id="pref-save">' + icon("check", 13) + ' Save preferences</button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="table-wrap">'
      + '    <table><thead><tr><th>Event / Trigger</th><th>Category</th><th class="right">In-App</th><th class="right">Email</th><th class="right">SMS</th></tr></thead><tbody>'
      +      events.map(ev => {
               const p = preferences[ev.key] || { in_app: true, email: true, sms: false };
               const org = routing[ev.key] || { in_app: true, email: true, sms: false };
               return '<tr data-pref-row="' + esc(ev.key) + '">'
                 + '<td><b style="font-size:13px">' + esc(ev.label) + '</b><div class="tiny muted">' + esc(ev.description || "") + '</div></td>'
                 + '<td><span class="chip grey">' + esc(ev.category) + '</span></td>'
                 + '<td class="right">' + switchHTML('data-ch="in_app"', p.in_app, "", Store.isReadOnly()) + (!org.in_app ? '<div class="tiny muted">Paused by admin</div>' : '') + '</td>'
                 + '<td class="right">' + switchHTML('data-ch="email"', p.email, "", Store.isReadOnly()) + (!org.email ? '<div class="tiny muted">Paused by admin</div>' : '') + '</td>'
                 + '<td class="right">' + switchHTML('data-ch="sms"', p.sms, "", Store.isReadOnly()) + (!org.sms ? '<div class="tiny muted">Broadcast override</div>' : '') + '</td>'
                 + '</tr>';
             }).join("")
      + '    </tbody></table>'
      + '  </div>'
      + '</div></div>';

    container.querySelector("#pref-save").onclick = async () => {
      const out = {};
      container.querySelectorAll("[data-pref-row]").forEach(tr => {
        const key = tr.dataset.prefRow;
        out[key] = {
          in_app: tr.querySelector('[data-ch="in_app"]').checked,
          email: tr.querySelector('[data-ch="email"]').checked,
          sms: tr.querySelector('[data-ch="sms"]').checked,
        };
      });
      try {
        await API.put("/notifications/preferences", { preferences: out });
        toast("Notification preferences saved", "success");
      } catch (err) { handleErr(err); }
    };

    container.querySelector("#pref-test-self").onclick = async () => {
      try {
        const r = await API.post("/notifications/test-self", { in_app: true, email: true, sms: true });
        const d = r.data || {};
        loadNotifications();
        toast("Test dispatched — In-app: " + (d.in_app || 0) + ", Email: " + (d.email || 0) + ", SMS: " + (d.sms || 0), "success");
      } catch (err) { handleErr(err); }
    };
  } catch (err) {
    container.innerHTML = emptyState("Could not load preferences", err.message, "alert");
  }
}

/* ============================================================================
   1. NOTIFICATIONS PAGE (Views.notifications)
============================================================================ */
Views.notifications = async function (root, params) {
  let tab = (params && params[0] === "preferences") ? "preferences" : (params && params[0] === "deliveries" ? "deliveries" : "inbox");
  let inboxView = "table";
  let filterMode = "all";
  let categoryFilter = "";
  let searchTerm = "";

  async function render() {
    root.innerHTML = pageHead("Notifications", "Loading activity & alerts…", "", "Workspace") + spinners(3);
    try {
      const [listRes, unreadRes, statusRes] = await Promise.all([
        API.get("/notifications", { per_page: 300 }),
        API.get("/notifications/unread"),
        API.get("/messaging/status"),
      ]);
      const allItems = (listRes.data || []).map(n => ({
        ...n,
        read_state: n.read_at ? "read" : "unread",
        category_label: n.category || "General",
      }));
      const unreadCount = (unreadRes.data && unreadRes.data.count) || 0;
      const gw = statusRes.data || {};

      const categories = [...new Set(allItems.map(i => i.category_label))].sort();

      const headActions = '<div class="row" style="flex-wrap:wrap;gap:8px">'
        + (tab === "inbox" ? '<div class="segmented"><button type="button" class="seg-btn ' + (inboxView === "table" ? "active" : "") + '" data-nview="table">' + icon("list", 13) + ' Table</button><button type="button" class="seg-btn ' + (inboxView === "feed" ? "active" : "") + '" data-nview="feed">' + icon("inbox", 13) + ' Feed</button></div>' : '')
        + '<button class="btn btn-ghost" id="notif-send-test">' + icon("send", 14) + ' Test alert</button>'
        + (unreadCount > 0 ? '<button class="btn btn-ghost" id="notif-mark-all">' + icon("check", 14) + ' Mark all read</button>' : '')
        + (allItems.some(i => i.read_at) ? '<button class="btn btn-ghost" id="notif-clear-read">' + icon("trash", 14) + ' Clear read</button>' : '')
        + (Store.isAdmin() ? '<button class="btn btn-accent" onclick="go(\'settings/email_sms\')">' + icon("sliders", 14) + ' Email & SMS Setup</button>' : '')
        + '</div>';

      const kpis = '<div class="grid grid-4" style="margin-bottom:18px">'
        + '<div class="kpi"><div class="label">Unread Alerts</div><div class="value">' + fmtNumber(unreadCount) + '</div><div class="sub">' + fmtNumber(allItems.length) + ' total in inbox</div></div>'
        + '<div class="kpi"><div class="label">Broadcasts & Events</div><div class="value">' + fmtNumber(allItems.filter(x => ["Announcements", "Events", "Communications"].includes(x.category)).length) + '</div><div class="sub">Company notices & invites</div></div>'
        + '<div class="kpi"><div class="label">Email Channel</div><div style="margin-top:10px">' + emailGatewayBadge(gw) + '</div><div class="sub">' + esc(Store.user.email || "—") + '</div></div>'
        + '<div class="kpi"><div class="label">SMS Channel</div><div style="margin-top:10px">' + smsGatewayBadge(gw) + '</div><div class="sub">' + esc(Store.user.phone || "No mobile set") + '</div></div>'
        + '</div>';

      const tabsHtml = '<div class="tabs" style="margin-bottom:18px">'
        + '<button class="tab ' + (tab === "inbox" ? "active" : "") + '" data-ntab="inbox">Inbox<span class="count">' + unreadCount + '</span></button>'
        + '<button class="tab ' + (tab === "preferences" ? "active" : "") + '" data-ntab="preferences">Channel Preferences</button>'
        + '<button class="tab ' + (tab === "deliveries" ? "active" : "") + '" data-ntab="deliveries">Email & SMS Receipts</button>'
        + '</div>';

      root.innerHTML = '<div class="page-enter">'
        + pageHead("Notification Centre", "In-app alerts, company event invitations, workflow approvals, and Email/SMS preferences.", headActions, "Workspace")
        + kpis
        + tabsHtml
        + '<div id="notif-tab-stage"></div>'
        + '</div>';

      root.querySelectorAll("[data-ntab]").forEach(b => b.onclick = () => {
        tab = b.dataset.ntab;
        render();
      });
      root.querySelectorAll("[data-nview]").forEach(b => b.onclick = () => {
        inboxView = b.dataset.nview;
        render();
      });

      const testBtn = root.querySelector("#notif-send-test");
      if (testBtn) testBtn.onclick = async () => {
        try {
          const r = await API.post("/notifications/test-self", { in_app: true, email: true, sms: true });
          loadNotifications();
          toast("Test notification sent (In-app: " + (r.data.in_app || 0) + ", Email: " + (r.data.email || 0) + ", SMS: " + (r.data.sms || 0) + ")", "success");
          render();
        } catch (err) { handleErr(err); }
      };

      const markAllBtn = root.querySelector("#notif-mark-all");
      if (markAllBtn) markAllBtn.onclick = async () => {
        await API.post("/notifications/read-all");
        loadNotifications();
        toast("All notifications marked as read", "success");
        render();
      };

      const clearBtn = root.querySelector("#notif-clear-read");
      if (clearBtn) clearBtn.onclick = () => confirmDialog("Clear read notifications", "Remove all read notifications from your inbox?", async () => {
        await API.del("/notifications/clear-read");
        loadNotifications();
        toast("Read notifications cleared", "success");
        render();
      }, { danger: true });

      const stage = root.querySelector("#notif-tab-stage");

      if (tab === "preferences") {
        await renderUserNotifPreferences(stage);
        return;
      }

      if (tab === "deliveries") {
        const delRes = await API.get("/messaging/deliveries", { per_page: 50 });
        stage.innerHTML = renderTable({
          columns: [
            { label: "Sent", render: r => '<span class="tiny">' + fmtDateTime(r.sent_at || r.created_at) + '</span>' },
            { label: "Channel", render: r => '<span class="chip ' + (r.channel === "sms" ? "purple" : "blue") + '">' + esc((r.channel || "").toUpperCase()) + '</span>' },
            { label: "Event", render: r => '<span style="text-transform:capitalize">' + esc((r.event_key || "general").replace(/_/g, " ")) + '</span>' },
            { label: "Recipient", render: r => '<span class="mono tiny">' + esc(r.recipient || "—") + '</span>' },
            { label: "Subject / Preview", render: r => '<b>' + esc(r.subject || "SMS Alert") + '</b>' + (r.body ? '<div class="tiny muted" style="max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.body) + '</div>' : '') },
            { label: "Status", render: r => chip(r.status) },
          ],
          rows: delRes.data || [],
          emptyTitle: "No Email or SMS dispatches recorded yet",
          emptyText: "Broadcasts, event invitations, and test alerts sent to you will appear here.",
        });
        return;
      }

      // INBOX TAB
      if (inboxView === "table") {
        stage.innerHTML = renderTable({
          id: "notifications-inbox-table",
          exportName: "my-notifications",
          dateField: "created_at",
          dateLabel: "Received",
          filters: [
            { key: "read_state", label: "State" },
            { key: "category_label", label: "Category" },
          ],
          columns: [
            {
              label: "Notification",
              key: "title",
              render: n => {
                const [ic, bg, fg] = notifCategoryIcon(n.category);
                return '<div class="row" style="gap:10px;align-items:flex-start">'
                  + '<div class="n-icon" style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + bg + ';color:' + fg + '">' + icon(ic, 14) + '</div>'
                  + '<div><b style="' + (n.read_at ? "font-weight:500" : "") + '">' + esc(n.title) + '</b>' + (n.body ? '<div class="tiny muted" style="max-width:440px">' + esc(n.body) + '</div>' : '') + '</div></div>';
              },
            },
            { label: "Category", key: "category_label", render: n => '<span class="pill-tag">' + esc(n.category_label) + '</span>' },
            { label: "State", key: "read_state", render: n => n.read_at ? '<span class="chip chip-grey">Read</span>' : '<span class="chip chip-teal">Unread</span>' },
            { label: "Received", key: "created_at", render: n => fmtDateTime(n.created_at) },
            {
              label: "",
              class: "right",
              sortable: false,
              render: n => {
                const dest = normalizeAppLink(n.link);
                return '<div class="row" style="justify-content:flex-end;gap:4px">'
                  + (dest ? '<button class="btn btn-sm btn-soft" data-open-n="' + n.id + '" data-dest="' + esc(dest) + '">Open</button>' : '')
                  + '<button class="btn btn-sm btn-ghost" data-toggle-n="' + n.id + '" data-is-read="' + (n.read_at ? "1" : "0") + '">' + (n.read_at ? "Unread" : "Read") + '</button>'
                  + '<button class="icon-btn" style="width:28px;height:28px" data-del-n="' + n.id + '">' + icon("trash", 13) + '</button>'
                  + '</div>';
              },
            },
          ],
          rows: allItems,
          emptyIcon: "bell",
          emptyTitle: "No notifications yet",
          emptyText: "Alerts for announcements, events and workflows appear here.",
        });
        onDelegate(stage, "click", "[data-open-n]", async (el) => {
          const nid = el.dataset.openN;
          const dest = el.dataset.dest;
          try { await API.post("/notifications/" + nid + "/read"); loadNotifications(); } catch (err) {}
          if (dest) go(dest); else render();
        });
        onDelegate(stage, "click", "[data-toggle-n]", async (b, ev) => {
          ev.stopPropagation();
          await API.post("/notifications/" + b.dataset.toggleN + (b.dataset.isRead === "1" ? "/unread" : "/read"));
          loadNotifications();
          render();
        });
        onDelegate(stage, "click", "[data-del-n]", async (b, ev) => {
          ev.stopPropagation();
          await API.del("/notifications/" + b.dataset.delN);
          loadNotifications();
          render();
        });
        return;
      }

      const drawInbox = () => {
        const filtered = allItems.filter(n => {
          if (filterMode === "unread" && n.read_at) return false;
          if (categoryFilter && (n.category || "General") !== categoryFilter) return false;
          if (searchTerm) {
            const q = searchTerm.toLowerCase();
            if (!(n.title || "").toLowerCase().includes(q) && !(n.body || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });

        stage.innerHTML = '<div class="toolbar">'
          + '<div class="searchbox">' + icon("search", 15) + '<input id="notif-q" placeholder="Filter notifications…" value="' + esc(searchTerm) + '"></div>'
          + '<div class="filter-chips">'
          + '  <button class="filter-chip ' + (filterMode === "all" && !categoryFilter ? "active" : "") + '" data-fmode="all">All (' + allItems.length + ')</button>'
          + '  <button class="filter-chip ' + (filterMode === "unread" ? "active" : "") + '" data-fmode="unread">Unread (' + unreadCount + ')</button>'
          +    categories.map(c => '<button class="filter-chip ' + (categoryFilter === c ? "active" : "") + '" data-fcat="' + esc(c) + '">' + esc(c) + '</button>').join("")
          + '</div></div>'
          + '<div class="card">'
          + (filtered.length
              ? filtered.map(n => {
                  const [ic, bg, fg] = notifCategoryIcon(n.category);
                  const dest = normalizeAppLink(n.link);
                  return '<div class="notif-row ' + (n.read_at ? "" : "unread") + '" data-nid="' + n.id + '">'
                    + '<div class="n-icon" style="background:' + bg + ';color:' + fg + '">' + icon(ic, 17) + '</div>'
                    + '<div class="n-body" data-open-n="' + n.id + '" data-dest="' + esc(dest) + '">'
                    + '  <div class="n-title">' + esc(n.title) + '<span class="chip grey" style="font-size:10px">' + esc(n.category || "General") + '</span></div>'
                    +    (n.body ? '<div class="n-desc">' + esc(n.body) + '</div>' : '')
                    + '  <div class="n-meta"><span>' + timeAgo(n.created_at) + '</span><span>·</span><span>' + fmtDateTime(n.created_at) + '</span>' + (dest ? '<span>·</span><span style="color:var(--accent)">Open ' + esc(dest) + ' →</span>' : '') + '</div>'
                    + '</div>'
                    + '<div class="n-actions">'
                    + '  <button class="btn btn-sm btn-ghost" title="' + (n.read_at ? "Mark unread" : "Mark read") + '" data-toggle-n="' + n.id + '" data-is-read="' + (n.read_at ? "1" : "0") + '">' + (n.read_at ? "Mark unread" : "Mark read") + '</button>'
                    + '  <button class="icon-btn" style="width:30px;height:30px" title="Delete" data-del-n="' + n.id + '">' + icon("trash", 14) + '</button>'
                    + '</div></div>';
                }).join("")
              : emptyState("No matching notifications", filterMode === "unread" ? "You have read all notifications." : "Notifications for announcements, events and workflows appear here.", "bell"))
          + '</div>';

        const qInput = stage.querySelector("#notif-q");
        if (qInput) qInput.oninput = (e) => {
          searchTerm = e.target.value;
          const pos = qInput.selectionStart;
          drawInbox();
          const next = stage.querySelector("#notif-q");
          if (next) { next.focus(); next.setSelectionRange(pos, pos); }
        };

        stage.querySelectorAll("[data-fmode]").forEach(b => b.onclick = () => {
          filterMode = b.dataset.fmode;
          if (filterMode === "all") categoryFilter = "";
          drawInbox();
        });
        stage.querySelectorAll("[data-fcat]").forEach(b => b.onclick = () => {
          categoryFilter = (categoryFilter === b.dataset.fcat) ? "" : b.dataset.fcat;
          drawInbox();
        });

        stage.querySelectorAll("[data-open-n]").forEach(el => el.onclick = async () => {
          const nid = el.dataset.openN;
          const dest = el.dataset.dest;
          try { await API.post("/notifications/" + nid + "/read"); loadNotifications(); } catch (err) {}
          if (dest) go(dest);
          else render();
        });

        stage.querySelectorAll("[data-toggle-n]").forEach(b => b.onclick = async (ev) => {
          ev.stopPropagation();
          const nid = b.dataset.toggleN;
          const isRead = b.dataset.isRead === "1";
          await API.post("/notifications/" + nid + (isRead ? "/unread" : "/read"));
          loadNotifications();
          render();
        });

        stage.querySelectorAll("[data-del-n]").forEach(b => b.onclick = async (ev) => {
          ev.stopPropagation();
          await API.del("/notifications/" + b.dataset.delN);
          loadNotifications();
          render();
        });
      };

      drawInbox();
    } catch (err) {
      root.innerHTML = pageHead("Notifications", "Error") + emptyState("Unable to load notifications", err.message, "alert");
    }
  }

  await render();
};

/* ============================================================================
   2. SETTINGS HUB (Views.settings)
============================================================================ */
Views.settings = async function (root, params) {
  const isAdmin = Store.isAdmin();
  if (params && (params[0] === "organization" || params[0] === "departments" || params[0] === "designations")) {
    go("organisation" + (params[0] !== "organization" ? "/" + params[0] : ""));
    return;
  }
  const validTabs = ["account", "appearance", "notifications"];
  if (isAdmin) validTabs.push("company", "email_sms", "routing", "deliveries");
  let tab = (params && validTabs.includes(params[0])) ? params[0] : (isAdmin && params && params[0] === "gateways" ? "email_sms" : "account");

  async function renderShell() {
    const tabs = [
      ["account", "Account & Security"],
      ["appearance", "Appearance"],
      ["notifications", "Notification Preferences"],
    ];
    if (isAdmin) {
      tabs.push(
        ["company", "Company & Defaults"],
        ["email_sms", "Email & SMS Gateways"],
        ["routing", "Event & Broadcast Routing"],
        ["deliveries", "Delivery Log"]
      );
    }

    root.innerHTML = '<div class="page-enter">'
      + pageHead(
          "Settings & Configuration",
          isAdmin
            ? "Manage account security, company defaults, SMTP email & SMS gateways, and event/announcement channel routing."
            : "Manage your password, two-factor security, sign-in sessions, and personal Email/SMS notification preferences.",
          '<button class="btn btn-ghost" onclick="go(\'profile\')">' + icon("user", 14) + ' My Profile</button>',
          "System & Preferences"
        )
      + '<div class="tabs-wrapper">'
      + '<button class="tabs-nav-btn" id="tabs-prev" title="Previous">' + icon("chevronLeft", 14) + '</button>'
      + '<div class="tabs-container-scroll">'
      + '<div class="tabs" id="settings-tabs-container">' + tabs.map(t => '<button class="tab ' + (tab === t[0] ? "active" : "") + '" data-stab="' + t[0] + '">' + esc(t[1]) + '</button>').join("") + '</div>'
      + '</div>'
      + '<button class="tabs-nav-btn" id="tabs-next" title="Next">' + icon("chevronRight", 14) + '</button>'
      + '</div>'
      + '<div id="settings-stage">' + spinners(3) + '</div>'
      + '</div>';

    // Tab navigation handlers
    const tabsContainer = root.querySelector("#settings-tabs-container");
    const prevBtn = root.querySelector("#tabs-prev");
    const nextBtn = root.querySelector("#tabs-next");
    
    if (prevBtn && nextBtn && tabsContainer) {
      prevBtn.onclick = () => {
        tabsContainer.scrollBy({ left: -200, behavior: 'smooth' });
      };
      nextBtn.onclick = () => {
        tabsContainer.scrollBy({ left: 200, behavior: 'smooth' });
      };
      
      // Update button states based on scroll position
      const updateNavButtons = () => {
        const { scrollLeft, scrollWidth, clientWidth } = tabsContainer;
        prevBtn.disabled = scrollLeft <= 0;
        nextBtn.disabled = scrollLeft + clientWidth >= scrollWidth - 1;
      };
      
      tabsContainer.addEventListener('scroll', updateNavButtons);
      updateNavButtons();
    }

    root.querySelectorAll("[data-stab]").forEach(b => b.onclick = () => {
      tab = b.dataset.stab;
      renderShell();
    });

    const stage = root.querySelector("#settings-stage");

    /* ---------------- TAB: ACCOUNT & SECURITY ---------------- */
    if (tab === "account") {
      try {
        const [meRes, histRes] = await Promise.all([API.get("/auth/me"), API.get("/auth/login-history")]);
        const u = meRes.data;
        Store.user = u;
        const history = histRes.data || [];

        stage.innerHTML = '<div class="grid grid-2" style="margin-bottom:18px">'
          + '<div class="card"><div class="card-head"><div><h3>Account Identity & Security</h3><div class="sub">Portal credentials and multi-factor protection</div></div></div>'
          + '<div class="card-body"><dl class="kv">'
          + '<dt>Name</dt><dd><b>' + esc(u.name) + '</b></dd>'
          + '<dt>Login Email</dt><dd>' + esc(u.email) + '</dd>'
          + '<dt>Mobile (SMS)</dt><dd>' + (u.phone ? esc(u.phone) : '<span class="muted">Not set — <span class="link" onclick="go(\'profile\')">add on profile</span></span>') + '</dd>'
          + '<dt>Access Role</dt><dd><span class="chip teal">' + esc(u.role) + '</span></dd>'
          + '<dt>Employee No.</dt><dd class="mono">' + esc(u.employee_no || "—") + '</dd>'
          + '<dt>Last Sign-in</dt><dd>' + fmtDateTime(u.last_login_at) + '</dd>'
          + '</dl>'
          + (u.mfa_enabled
              ? '<div class="mfa-intro success" style="margin-top:14px">' + icon("shield", 16) + '<div><b>Two-factor authentication is on.</b> Sign-in on a new device asks for a code from your authenticator app.</div></div>'
              : '<div class="mfa-intro" style="margin-top:14px">' + icon("shield", 16) + '<div><b>Your account is password-only.</b> Add an authenticator app so a stolen password alone cannot sign in.</div></div>')
          + '</div></div>'

          + '<div class="card"><div class="card-head"><div><h3>Change Password</h3><div class="sub">Minimum 8 characters · Immediately active</div></div></div>'
          + '<div class="card-body"><form id="pw-change-form" class="stack">'
          + '<div class="field"><label>Current password</label><input class="input" type="password" name="current_password" required autocomplete="current-password"></div>'
          + '<div class="grid grid-2">'
          + '<div class="field"><label>New password</label><input class="input" type="password" name="new_password" minlength="8" required autocomplete="new-password"></div>'
          + '<div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm_password" minlength="8" required autocomplete="new-password"></div>'
          + '</div>'
          + '<div><button class="btn btn-accent" type="submit">' + icon("lock", 14) + ' Update password</button></div>'
          + '</form></div></div>'

          + '<div class="card" style="grid-column:1/-1"><div class="card-head"><div><h3>Two-Factor Authentication</h3><div class="sub">Authenticator app &middot; recovery codes &middot; trusted devices</div></div>'
          + (u.mfa_enabled ? '<div class="right"><span class="chip green">' + icon("shield", 11) + ' Enabled</span></div>' : '<div class="right"><span class="chip chip-grey">Not enabled</span></div>')
          + '</div>'
          + '<div class="card-body" id="mfa-settings-panel"><div class="tiny muted">Loading 2FA status…</div></div></div>'

          + '<div class="section-title" style="margin-bottom:8px">Recent Sign-in Activity</div>'
          + renderTable({
              columns: [
                { label: "Timestamp", render: r => fmtDateTime(r.created_at) },
                { label: "Status", render: r => r.success !== false ? '<span class="chip green">Success</span>' : '<span class="chip red">Failed</span>' },
                { label: "Method", render: r => r.mfa_used ? '<span class="chip teal">Password + 2FA</span>' : '<span class="chip chip-grey">Password</span>' },
                { label: "IP Address", render: r => '<span class="mono tiny">' + esc(r.ip || "127.0.0.1") + '</span>' },
                { label: "Browser / Client", render: r => '<span class="tiny muted">' + esc((r.user_agent || "Web session").slice(0, 85)) + '</span>' },
              ],
              rows: history,
              emptyTitle: "No recent sign-in logs",
            });

        const mfaPanel = stage.querySelector("#mfa-settings-panel");
        if (mfaPanel && typeof MfaUI !== "undefined") {
          MfaUI.mount(mfaPanel, {
            // Re-render the tab so the header chip and the identity callout stay truthful.
            onChange: async () => {
              try {
                const fresh = await MfaUI.status();
                if (Store.user) {
                  Store.user.mfa_enabled = fresh.enabled;
                  Store.user.mfa_pending_setup = fresh.pending_setup;
                }
              } catch (e) { /* keep the previous state */ }
              renderShell();
            },
          });
        }

        stage.querySelector("#pw-change-form").onsubmit = async (ev) => {
          ev.preventDefault();
          const fd = Object.fromEntries(new FormData(ev.target).entries());
          if (fd.new_password !== fd.confirm_password) return toast("New passwords do not match", "error");
          try {
            await API.post("/auth/change-password", { current_password: fd.current_password, new_password: fd.new_password });
            ev.target.reset();
            toast("Password updated successfully", "success");
          } catch (err) { handleErr(err); }
        };
      } catch (err) {
        stage.innerHTML = emptyState("Could not load account settings", err.message, "alert");
      }
      return;
    }

    function renderBrandingUploaderHTML(c, includeFormControls) {
      const name = (c.name || "Meridian HR").trim();
      const tagline = (c.tagline || "People operations").trim();
      const initial = (name.charAt(0) || "M").toUpperCase();
      const logoUrl = (c.logo_url || "").trim();
      const faviconUrl = (c.favicon_url || "").trim();
      const defaultFav = typeof buildDefaultFaviconHref === "function"
        ? buildDefaultFaviconHref(initial)
        : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2310201f'/%3E%3Ctext x='32' y='44' font-family='Georgia' font-size='34' fill='%23c2703d' text-anchor='middle'%3E" + encodeURIComponent(initial) + "%3C/text%3E%3C/svg%3E";
      const favSrc = faviconUrl || defaultFav;

      return '<div class="card">'
        + '<div class="card-head"><div><h3>Branding — logo &amp; favicon</h3><div class="sub">Upload your company image and browser tab icon directly — updates apply immediately across the portal</div></div>'
        + (includeFormControls ? '<div class="right"><button class="btn btn-accent" type="submit">' + icon("check", 14) + ' Save branding</button></div>' : '')
        + '</div>'
        + '<div class="card-body stack">'
        + '  <div class="brand-upload-grid">'
        // Company Logo / Image Uploader
        + '    <div class="brand-upload-box">'
        + '      <div class="field"><label>Company image / logo <span class="muted" style="font-weight:400">(sidebar, top bar &amp; sign-in)</span></label></div>'
        + '      <div class="brand-dropzone" data-brand-drop="logo" tabindex="0" role="button" aria-label="Upload company logo">'
        + '        <div class="brand-preview-tile ' + (logoUrl ? "" : "is-initial") + '" data-brand-preview="logo">'
        +            (logoUrl ? '<img src="' + esc(logoUrl) + '" alt="Company logo" onerror="this.parentElement.classList.add(\'is-initial\');this.parentElement.textContent=\'' + esc(initial) + '\'">' : esc(initial))
        + '        </div>'
        + '        <div class="brand-dropzone-body">'
        + '          <div class="brand-dropzone-actions">'
        + '            <button class="btn btn-sm btn-accent" type="button" data-brand-pick="logo">' + icon("upload", 13) + ' <span data-brand-btn-label="logo">' + (logoUrl ? "Replace image" : "Upload image") + '</span></button>'
        + '            <button class="btn btn-sm btn-danger ' + (logoUrl ? "" : "hidden") + '" type="button" data-brand-remove="logo">' + icon("trash", 13) + ' Remove</button>'
        + '          </div>'
        + '          <div class="tiny muted">Click or drag &amp; drop an image file here · PNG, JPG, SVG, WEBP or GIF (max 5 MB)</div>'
        + '        </div>'
        + '      </div>'
        + '      <input type="file" class="hidden" data-brand-file="logo" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif">'
        + '      <button type="button" class="brand-url-toggle" data-brand-url-toggle="logo">' + icon("link", 12) + ' Or paste an image URL instead</button>'
        + '      <div class="hidden" data-brand-url-box="logo">'
        + '        <input class="input" name="c_logo_url" value="' + esc(logoUrl) + '" placeholder="https://… or /uploads/branding/…">'
        + '      </div>'
        + '    </div>'

        // Browser Favicon Uploader
        + '    <div class="brand-upload-box">'
        + '      <div class="field"><label>Browser favicon <span class="muted" style="font-weight:400">(browser tab &amp; bookmark icon)</span></label></div>'
        + '      <div class="brand-dropzone" data-brand-drop="favicon" tabindex="0" role="button" aria-label="Upload browser favicon">'
        + '        <div class="brand-preview-tile is-favicon" data-brand-preview="favicon">'
        + '          <img src="' + esc(favSrc) + '" alt="Favicon preview" data-default-fav="' + esc(defaultFav) + '" onerror="if(this.src!==this.dataset.defaultFav)this.src=this.dataset.defaultFav">'
        + '        </div>'
        + '        <div class="brand-dropzone-body">'
        + '          <div class="brand-dropzone-actions">'
        + '            <button class="btn btn-sm btn-accent" type="button" data-brand-pick="favicon">' + icon("upload", 13) + ' <span data-brand-btn-label="favicon">' + (faviconUrl ? "Replace favicon" : "Upload favicon") + '</span></button>'
        + '            <button class="btn btn-sm btn-danger ' + (faviconUrl ? "" : "hidden") + '" type="button" data-brand-remove="favicon">' + icon("trash", 13) + ' Remove</button>'
        + '          </div>'
        + '          <div><span class="brand-tab-mockup"><img data-brand-tab-icon src="' + esc(favSrc) + '" alt="" data-default-fav="' + esc(defaultFav) + '" onerror="if(this.src!==this.dataset.defaultFav)this.src=this.dataset.defaultFav"><span data-brand-tab-title>' + esc(name + " — Dashboard") + '</span></span></div>'
        + '          <div class="tiny muted">Click or drag &amp; drop · ICO, PNG, SVG or WEBP (32×32 or 64×64, max 5 MB)</div>'
        + '        </div>'
        + '      </div>'
        + '      <input type="file" class="hidden" data-brand-file="favicon" accept=".ico,image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,image/webp,image/gif,image/jpeg">'
        + '      <button type="button" class="brand-url-toggle" data-brand-url-toggle="favicon">' + icon("link", 12) + ' Or paste a favicon URL instead</button>'
        + '      <div class="hidden" data-brand-url-box="favicon">'
        + '        <input class="input" name="c_favicon_url" value="' + esc(faviconUrl) + '" placeholder="https://… or /uploads/branding/…">'
        + '      </div>'
        + '    </div>'
        + '  </div>'

        + (includeFormControls
            ? '<div class="divider"></div><div class="form-grid">'
              + '<div class="field"><label>Theme accent</label><select class="select" name="c_theme">'
              + [["meridian","Meridian (terracotta)"],["teal","Teal"],["navy","Navy blue"],["plum","Plum"],["emerald","Emerald"]].map(([v,l]) => '<option value="' + v + '"' + ((c.theme || "meridian") === v ? " selected" : "") + '>' + l + '</option>').join("")
              + '</select></div>'
              + '<div class="field"><div class="tiny muted" style="margin-bottom:6px">Live portal preview</div>'
              + '  <div class="row" style="gap:10px">'
              + '    <div class="brand-preview-tile ' + (logoUrl ? "" : "is-initial") + '" data-brand-live-logo style="width:44px;height:44px;flex:0 0 44px;border-radius:10px;font-size:20px">'
              +        (logoUrl ? '<img src="' + esc(logoUrl) + '" alt="logo">' : esc(initial))
              + '    </div>'
              + '    <div><b data-brand-live-name style="font-family:var(--serif);font-size:18px">' + esc(name) + '</b><div class="tiny muted" data-brand-live-tagline>' + esc(tagline) + '</div></div>'
              + '  </div>'
              + '</div>'
              + '</div>'
            : '')
        + '</div></div>';
    }

    function bindBrandingUploader(container, initialCompany) {
      const state = {
        name: (initialCompany && initialCompany.name) || "Meridian HR",
        tagline: (initialCompany && initialCompany.tagline) || "People operations",
        logo_url: (initialCompany && initialCompany.logo_url) || "",
        favicon_url: (initialCompany && initialCompany.favicon_url) || "",
      };

      const logoUrlInput = container.querySelector('input[name="c_logo_url"]');
      const favUrlInput = container.querySelector('input[name="c_favicon_url"]');
      const nameInput = container.querySelector('input[name="c_name"]');
      const taglineInput = container.querySelector('input[name="c_tagline"]');

      function currentInitial() {
        return ((state.name || "M").trim().charAt(0) || "M").toUpperCase();
      }

      function refreshPreviews() {
        const init = currentInitial();
        const logoUrl = (state.logo_url || "").trim();
        const favUrl = (state.favicon_url || "").trim();
        const fallbackFav = typeof buildDefaultFaviconHref === "function" ? buildDefaultFaviconHref(init) : "";
        const favSrc = favUrl || fallbackFav;

        if (logoUrlInput && logoUrlInput.value !== logoUrl) logoUrlInput.value = logoUrl;
        if (favUrlInput && favUrlInput.value !== favUrl) favUrlInput.value = favUrl;

        const logoTile = container.querySelector('[data-brand-preview="logo"]');
        if (logoTile) {
          logoTile.classList.toggle("is-initial", !logoUrl);
          if (logoUrl) {
            logoTile.innerHTML = '<img src="' + esc(logoUrl) + '" alt="Company logo">';
            const img = logoTile.querySelector("img");
            if (img) img.onerror = () => { logoTile.classList.add("is-initial"); logoTile.textContent = init; };
          } else {
            logoTile.textContent = init;
          }
        }

        const liveLogo = container.querySelector("[data-brand-live-logo]");
        if (liveLogo) {
          liveLogo.classList.toggle("is-initial", !logoUrl);
          if (logoUrl) {
            liveLogo.innerHTML = '<img src="' + esc(logoUrl) + '" alt="logo">';
            const img = liveLogo.querySelector("img");
            if (img) img.onerror = () => { liveLogo.classList.add("is-initial"); liveLogo.textContent = init; };
          } else {
            liveLogo.textContent = init;
          }
        }

        const favTileImg = container.querySelector('[data-brand-preview="favicon"] img');
        if (favTileImg && favSrc) favTileImg.src = favSrc;
        const tabIcon = container.querySelector("[data-brand-tab-icon]");
        if (tabIcon && favSrc) tabIcon.src = favSrc;
        const tabTitle = container.querySelector("[data-brand-tab-title]");
        if (tabTitle) tabTitle.textContent = (state.name || "Meridian HR") + " — Dashboard";

        const liveName = container.querySelector("[data-brand-live-name]");
        if (liveName) liveName.textContent = state.name || "Meridian HR";
        const liveTagline = container.querySelector("[data-brand-live-tagline]");
        if (liveTagline) liveTagline.textContent = state.tagline || "People operations";

        const logoBtnLbl = container.querySelector('[data-brand-btn-label="logo"]');
        if (logoBtnLbl) logoBtnLbl.textContent = logoUrl ? "Replace image" : "Upload image";
        const favBtnLbl = container.querySelector('[data-brand-btn-label="favicon"]');
        if (favBtnLbl) favBtnLbl.textContent = favUrl ? "Replace favicon" : "Upload favicon";

        const logoRem = container.querySelector('[data-brand-remove="logo"]');
        if (logoRem) logoRem.classList.toggle("hidden", !logoUrl);
        const favRem = container.querySelector('[data-brand-remove="favicon"]');
        if (favRem) favRem.classList.toggle("hidden", !favUrl);
      }

      function syncGlobalBrand(compData) {
        if (!Store.meta) Store.meta = {};
        Store.meta.company = { ...(Store.meta.company || {}), ...(compData || {}) };
        if (typeof applyBrand === "function") applyBrand(Store.meta.company);
      }

      async function handleUploadFile(kind, file) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          toast("Image must be 5 MB or smaller", "error");
          return;
        }
        const drop = container.querySelector('[data-brand-drop="' + kind + '"]');
        const lbl = container.querySelector('[data-brand-btn-label="' + kind + '"]');
        const prevText = lbl ? lbl.textContent : "";
        if (drop) drop.classList.add("is-uploading");
        if (lbl) lbl.textContent = "Uploading…";

        try {
          const fd = new FormData();
          fd.append("kind", kind);
          fd.append("file", file);
          const res = await API.upload("/uploads/branding", fd);
          const uploadedUrl = res.data.url;
          if (kind === "logo") state.logo_url = uploadedUrl;
          else state.favicon_url = uploadedUrl;
          refreshPreviews();
          syncGlobalBrand(res.data.company || { logo_url: state.logo_url, favicon_url: state.favicon_url, name: state.name, tagline: state.tagline });
          toast(kind === "logo" ? "Company logo uploaded & applied" : "Browser favicon uploaded & applied", "success");
        } catch (err) {
          if (lbl) lbl.textContent = prevText;
          handleErr(err);
        } finally {
          if (drop) drop.classList.remove("is-uploading");
        }
      }

      ["logo", "favicon"].forEach(kind => {
        const drop = container.querySelector('[data-brand-drop="' + kind + '"]');
        const fileInput = container.querySelector('[data-brand-file="' + kind + '"]');
        const pickBtn = container.querySelector('[data-brand-pick="' + kind + '"]');
        const remBtn = container.querySelector('[data-brand-remove="' + kind + '"]');
        const urlToggle = container.querySelector('[data-brand-url-toggle="' + kind + '"]');
        const urlBox = container.querySelector('[data-brand-url-box="' + kind + '"]');
        const urlInput = kind === "logo" ? logoUrlInput : favUrlInput;

        const openPicker = () => { if (fileInput) { fileInput.value = ""; fileInput.click(); } };

        if (pickBtn) pickBtn.onclick = (e) => { e.stopPropagation(); openPicker(); };
        if (drop) {
          drop.onclick = (e) => {
            if (e.target.closest("button")) return;
            openPicker();
          };
          drop.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); }
          };
          ["dragenter", "dragover"].forEach(evName => {
            drop.addEventListener(evName, (e) => {
              e.preventDefault();
              e.stopPropagation();
              drop.classList.add("is-dragover");
            });
          });
          ["dragleave", "dragend", "drop"].forEach(evName => {
            drop.addEventListener(evName, (e) => {
              e.preventDefault();
              e.stopPropagation();
              drop.classList.remove("is-dragover");
            });
          });
          drop.addEventListener("drop", (e) => {
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files[0]) handleUploadFile(kind, files[0]);
          });
        }

        if (fileInput) {
          fileInput.onchange = () => {
            if (fileInput.files && fileInput.files[0]) handleUploadFile(kind, fileInput.files[0]);
          };
        }

        if (remBtn) {
          remBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
              const res = await API.del("/uploads/branding/" + kind);
              if (kind === "logo") state.logo_url = "";
              else state.favicon_url = "";
              refreshPreviews();
              syncGlobalBrand(res.data.company || { logo_url: state.logo_url, favicon_url: state.favicon_url, name: state.name, tagline: state.tagline });
              toast(kind === "logo" ? "Company logo removed" : "Browser favicon removed", "success");
            } catch (err) { handleErr(err); }
          };
        }

        if (urlToggle && urlBox) {
          urlToggle.onclick = () => {
            urlBox.classList.toggle("hidden");
            if (!urlBox.classList.contains("hidden") && urlInput) urlInput.focus();
          };
        }

        if (urlInput) {
          urlInput.oninput = () => {
            if (kind === "logo") state.logo_url = urlInput.value.trim();
            else state.favicon_url = urlInput.value.trim();
            refreshPreviews();
          };
          // If standalone (Appearance tab, outside #company-settings-form), apply URL on blur/Enter too
          if (!container.querySelector("#company-settings-form")) {
            urlInput.onchange = async () => {
              const val = urlInput.value.trim();
              try {
                const payload = kind === "logo" ? { logo_url: val } : { favicon_url: val };
                const res = await API.put("/settings/company", { company: payload, platform: {} });
                syncGlobalBrand(res.data.company);
                toast("Branding link saved", "success");
              } catch (err) { handleErr(err); }
            };
          }
        }
      });

      if (nameInput) nameInput.addEventListener("input", () => { state.name = nameInput.value; refreshPreviews(); });
      if (taglineInput) taglineInput.addEventListener("input", () => { state.tagline = taglineInput.value; refreshPreviews(); });

      return { syncGlobalBrand, refreshPreviews, state };
    }

    /* ---------------- TAB: APPEARANCE ---------------- */
    if (tab === "appearance") {
      const themeHtml = window.ThemeSettings ? window.ThemeSettings.render() : '<div class="card"><div class="card-body">Theme settings are unavailable.</div></div>';
      if (isAdmin) {
        try {
          const res = await API.get("/settings/company");
          const c = res.data.company || {};
          stage.innerHTML = '<div class="stack">' + themeHtml + renderBrandingUploaderHTML(c, false) + '</div>';
          bindBrandingUploader(stage, c);
        } catch (err) {
          stage.innerHTML = themeHtml;
        }
      } else {
        stage.innerHTML = themeHtml;
      }
      return;
    }

    /* ---------------- TAB: NOTIFICATION PREFERENCES ---------------- */
    if (tab === "notifications") {
      await renderUserNotifPreferences(stage);
      return;
    }

    /* ---------------- TAB: ORGANIZATION SETUP (Moved to Sidebar) ---------------- */

    if (tab === "organization") {

      go("organisation");

      return;

    }



    /* ---------------- TAB: COMPANY & DEFAULTS ---------------- */
    if (tab === "company" && isAdmin) {
      try {
        const res = await API.get("/settings/company");
        const c = res.data.company || {};
        const p = res.data.platform || {};

        stage.innerHTML = '<form id="company-settings-form" class="stack">'
          + '<div class="card"><div class="card-head"><div><h3>Basic company information</h3><div class="sub">Name, location and branding used across the portal</div></div>'
          + '<div class="right"><button class="btn btn-accent" type="submit">' + icon("check", 14) + ' Save organisation settings</button></div></div>'
          + '<div class="card-body"><div class="form-grid">'
          + '<div class="field"><label>Company display name *</label><input class="input" name="c_name" value="' + esc(c.name || "") + '" required></div>'
          + '<div class="field"><label>Tagline</label><input class="input" name="c_tagline" value="' + esc(c.tagline || "People operations") + '" placeholder="People operations"></div>'
          + '<div class="field"><label>Registered legal name</label><input class="input" name="c_legal_name" value="' + esc(c.legal_name || "") + '"></div>'
          + '<div class="field"><label>Tax ID / Employer TIN</label><input class="input" name="c_tax_id" value="' + esc(c.tax_id || "") + '"></div>'
          + '<div class="field"><label>City (HQ)</label><input class="input" name="c_city" value="' + esc(c.city || "Accra") + '" placeholder="Accra"></div>'
          + '<div class="field"><label>Location label</label><input class="input" name="c_location_name" value="' + esc(c.location_name || "Accra HQ") + '" placeholder="Accra HQ"></div>'
          + '<div class="field"><label>Country</label><input class="input" name="c_country" value="' + esc(c.country || "Ghana") + '"></div>'
          + '<div class="field"><label>Primary currency</label><input class="input" name="c_currency" value="' + esc(c.currency || "GHS") + '"></div>'
          + '<div class="field"><label>Timezone</label><input class="input" name="c_timezone" value="' + esc(c.timezone || "Africa/Accra") + '"></div>'
          + '<div class="field"><label>Official HR email (shown on forms & letters)</label><input class="input" type="email" name="c_email" value="' + esc(c.email || "") + '" placeholder="info@airportwesthotel.com"></div>'
          + '<div class="field"><label>Telephone / Switchboard (shown on forms)</label><input class="input" name="c_phone" value="' + esc(c.phone || "") + '" placeholder="+2330302771388/769104/767870/0244358042."></div>'
          + '<div class="field"><label>Official FAX number (shown on forms)</label><input class="input" name="c_fax" value="' + esc(c.fax || "") + '" placeholder="+2330302765667"></div>'
          + '<div class="field"><label>Official website</label><input class="input" name="c_website" value="' + esc(c.website || "") + '" placeholder="www.airportwesthotel.com"></div>'
          + '<div class="field full"><label>Headquarters / Postal address (shown on footer of A4 forms & letters)</label><input class="input" name="c_address" value="' + esc(c.address || "") + '" placeholder="P.O. Box KIA 30675 Airport Accra, Ghana."></div>'
          + '</div></div></div>'

          + renderBrandingUploaderHTML(c, true)

          + '<div class="card"><div class="card-head"><div><h3>HR, Attendance & Statutory Payroll Rules</h3><div class="sub">Platform-wide policy parameters applied across modules</div></div></div>'
          + '<div class="card-body"><div class="form-grid">'
          + '<div class="field"><label>Employee ID format</label><input class="input mono" name="p_employee_no_format" value="' + esc(p.employee_no_format || "EMP-{0000}") + '"></div>'
          + '<div class="field"><label>Default probation (months)</label><input class="input" type="number" name="p_probation_months" value="' + esc(p.probation_months || "6") + '"></div>'
          + '<div class="field"><label>Standard work week</label><input class="input" name="p_work_week" value="' + esc(p.work_week || "Mon-Fri") + '"></div>'
          + '<div class="field"><label>Attendance grace period (mins)</label><input class="input" type="number" name="p_grace_minutes" value="' + esc(p.grace_minutes || "15") + '"></div>'
          + '<div class="field"><label>SSNIT Employee Rate (%)</label><input class="input" type="number" step="0.1" name="p_ssnit_employee_rate" value="' + esc(p.ssnit_employee_rate || "5.5") + '"></div>'
          + '<div class="field"><label>SSNIT Employer Rate (%)</label><input class="input" type="number" step="0.1" name="p_ssnit_employer_rate" value="' + esc(p.ssnit_employer_rate || "13.0") + '"></div>'
          + '</div></div></div>'
          + '</form>';

        const uploaderCtrl = bindBrandingUploader(stage, c);

        stage.querySelector("#company-settings-form").onsubmit = async (ev) => {
          ev.preventDefault();
          const fd = Object.fromEntries(new FormData(ev.target).entries());
          const company = {};
          const platform = {};
          Object.keys(fd).forEach(k => {
            if (k.startsWith("c_")) company[k.slice(2)] = fd[k];
            else if (k.startsWith("p_")) platform[k.slice(2)] = fd[k];
          });
          platform.default_currency = company.currency || "GHS";
          try {
            const saved = await API.put("/settings/company", { company, platform });
            if (saved && saved.data && saved.data.company) {
              uploaderCtrl.syncGlobalBrand(saved.data.company);
            }
            toast("Organisation & policy settings saved", "success");
          } catch (err) { handleErr(err); }
        };
      } catch (err) {
        stage.innerHTML = emptyState("Could not load company settings", err.message, "alert");
      }
      return;
    }

    /* ---------------- TAB: EMAIL & SMS GATEWAYS ---------------- */
    if (tab === "email_sms" && isAdmin) {
      try {
        const [cfgRes, statusRes] = await Promise.all([API.get("/messaging/config"), API.get("/messaging/status")]);
        const cfg = cfgRes.data.config || {};
        const st = statusRes.data || {};

        stage.innerHTML = '<div class="stack">'
          // Gateway overview cards
          + '<div class="grid grid-2">'
          + '  <div class="gateway-card ' + (st.email_enabled ? "ready" : "") + '">'
          + '    <div class="gw-head"><div class="row">' + icon("mail", 18) + '<b>Outbound Email Gateway</b></div>' + emailGatewayBadge(st) + '</div>'
          + '    <div class="tiny muted" style="margin-top:6px">Used for announcements, company event invitations, leave decisions & payslip alerts.</div>'
          + '  </div>'
          + '  <div class="gateway-card ' + (st.sms_enabled ? "ready" : "") + '">'
          + '    <div class="gw-head"><div class="row">' + icon("message", 18) + '<b>Outbound SMS Gateway</b></div>' + smsGatewayBadge(st) + '</div>'
          + '    <div class="tiny muted" style="margin-top:6px">Supports Sandbox simulation, Africa\'s Talking (Ghana/Africa), Twilio, and Custom HTTP Webhooks.</div>'
          + '  </div>'
          + '</div>'

          + '<form id="gateway-config-form" class="stack">'
          // Default Broadcast & Event Channels
          + '<div class="card"><div class="card-head"><div><h3>Announcement & Event Channel Defaults</h3><div class="sub">Pre-selected channels when HR publishes a new Announcement or Company Event</div></div>'
          + '<div class="right"><button class="btn btn-accent" type="submit">' + icon("check", 14) + ' Save Email & SMS Configuration</button></div></div>'
          + '<div class="card-body"><div class="grid grid-3" style="gap:14px">'
          + '  <div class="channel-box"><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Default Announcement Channels</div>'
          + '    <div class="row" style="gap:16px;flex-wrap:wrap">'
          +        switchHTML('name="ann_default_in_app"', cfg.ann_default_in_app !== "0", "In-App")
          +        switchHTML('name="ann_default_email"', cfg.ann_default_email !== "0", "Email")
          +        switchHTML('name="ann_default_sms"', cfg.ann_default_sms === "1", "SMS")
          + '    </div></div>'
          + '  <div class="channel-box"><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Default Company Event Channels</div>'
          + '    <div class="row" style="gap:16px;flex-wrap:wrap">'
          +        switchHTML('name="evt_default_in_app"', cfg.evt_default_in_app !== "0", "In-App")
          +        switchHTML('name="evt_default_email"', cfg.evt_default_email !== "0", "Email")
          +        switchHTML('name="evt_default_sms"', cfg.evt_default_sms === "1", "SMS")
          + '    </div></div>'
          + '  <div class="field"><label>Default Event Reminder Lead Time (hours)</label><input class="input" type="number" name="evt_default_reminder_hours" value="' + esc(cfg.evt_default_reminder_hours || "24") + '"></div>'
          + '</div></div></div>'

          // EMAIL GATEWAY CARD
          + '<div class="card">'
          + '  <div class="card-head"><div><h3>Email Gateway (SMTP / Sandbox)</h3><div class="sub">Configure live email delivery for employee login credentials, employment letters, announcements & alerts</div></div>'
          + '    <div class="right">' + switchHTML('name="email_enabled" id="cfg-email-enabled"', cfg.email_enabled === "1", "Enable Email") + '</div>'
          + '  </div>'
          + '  <div class="card-body stack">'
          + '    <div class="callout-banner ' + ((cfg.email_mode || "sandbox") === "smtp" ? "green" : "amber") + '" style="flex-wrap:wrap">'
          + '      <div><b>' + ((cfg.email_mode || "sandbox") === "smtp" ? "Live SMTP Mode Enabled" : "Sandbox Simulation Mode Active") + ':</b> '
          +        ((cfg.email_mode || "sandbox") === "smtp"
                     ? "Employee credentials and employment letters are delivered directly via your configured SMTP mail server."
                     : "Emails are safely logged inside Meridian HR. Click a quick provider preset below and enter your SMTP / Gmail App Password to send real emails to external addresses (e.g. @gmail.com).")
          + '      </div>'
          + '      <div class="row" style="gap:6px;flex-wrap:wrap">'
          + '        <button class="btn btn-sm btn-soft" type="button" data-smtp-preset="gmail">Gmail Preset</button>'
          + '        <button class="btn btn-sm btn-soft" type="button" data-smtp-preset="m365">Microsoft 365</button>'
          + '        <button class="btn btn-sm btn-soft" type="button" data-smtp-preset="domain">Custom Domain SSL</button>'
          + '      </div>'
          + '    </div>'
          + '    <div class="form-grid">'
          + '      <div class="field"><label>Email Delivery Mode</label><select class="select" name="email_mode" id="cfg-email-mode">'
          + '        <option value="sandbox"' + ((cfg.email_mode || "sandbox") === "sandbox" ? " selected" : "") + '>Sandbox / Simulated (Safe offline logging)</option>'
          + '        <option value="smtp"' + (cfg.email_mode === "smtp" ? " selected" : "") + '>Live SMTP Server (Send real emails to inboxes)</option>'
          + '      </select></div>'
          + '      <div class="field"><label>Subject Prefix</label><input class="input" name="email_subject_prefix" value="' + esc(cfg.email_subject_prefix || "[Meridian HR]") + '" placeholder="[AWH HR]"></div>'
          + '      <div class="field"><label>Sender Display Name</label><input class="input" name="smtp_from_name" value="' + esc(cfg.smtp_from_name || "Meridian HR") + '"></div>'
          + '      <div class="field"><label>Sender Email Address</label><input class="input" type="email" name="smtp_from_email" value="' + esc(cfg.smtp_from_email || "notifications@meridian.gh") + '"></div>'
          + '      <div class="field full"><label>Reply-To Address (optional)</label><input class="input" type="email" name="smtp_reply_to" value="' + esc(cfg.smtp_reply_to || "") + '" placeholder="hr@company.com"></div>'
          + '    </div>'
          + '    <div id="smtp-fields-wrap" class="channel-box ' + ((cfg.email_mode || "sandbox") === "smtp" ? "" : "hidden") + '">'
          + '      <div class="section-title" style="margin-bottom:6px">SMTP Server Credentials</div>'
          + '      <div class="tiny muted" style="margin-bottom:12px"><b>Using Gmail?</b> Turn on 2-Step Verification on your Google Account → search <b>App passwords</b> → generate a 16-character App Password, then enter your Gmail address in both <i>Sender Email</i> & <i>SMTP Username</i> and paste the 16-character App Password below.</div>'
          + '      <div class="form-grid">'
          + '        <div class="field"><label>SMTP Host</label><input class="input" name="smtp_host" value="' + esc(cfg.smtp_host || "") + '" placeholder="smtp.office365.com or smtp.gmail.com"></div>'
          + '        <div class="field"><label>SMTP Port</label><input class="input" type="number" name="smtp_port" value="' + esc(cfg.smtp_port || "587") + '"></div>'
          + '        <div class="field"><label>Transport Encryption</label><select class="select" name="smtp_encryption">'
          + '          <option value="starttls"' + ((cfg.smtp_encryption || "starttls") === "starttls" ? " selected" : "") + '>STARTTLS (Port 587)</option>'
          + '          <option value="ssl"' + (cfg.smtp_encryption === "ssl" ? " selected" : "") + '>Implicit SSL/TLS (Port 465)</option>'
          + '          <option value="none"' + (cfg.smtp_encryption === "none" ? " selected" : "") + '>Unencrypted (Port 25 / Relay)</option>'
          + '        </select></div>'
          + '        <div class="field"><label>SMTP Username</label><input class="input" name="smtp_username" value="' + esc(cfg.smtp_username || "") + '"></div>'
          + '        <div class="field full"><label>SMTP Password ' + (cfg.smtp_password_set ? '<span class="chip green" style="margin-left:6px">Stored</span>' : '') + '</label>'
          + '          <input class="input" type="password" name="smtp_password" placeholder="' + (cfg.smtp_password_set ? "•••••••• (leave blank to keep)" : "SMTP password or app key") + '"></div>'
          + '      </div>'
          + '    </div>'
          + '    <div class="row-between" style="background:#faf8f3;padding:12px 14px;border-radius:10px;border:1px solid var(--line);flex-wrap:wrap;gap:10px">'
          + '      <div class="small"><b>Verify Email Gateway</b> — Saves current configuration and dispatches a test email.</div>'
          + '      <div class="row"><input class="input" id="test-email-to" style="width:230px;height:34px" value="' + esc(Store.user.email || "") + '" placeholder="recipient@company.com">'
          + '      <button class="btn btn-sm btn-teal" type="button" id="btn-test-email">' + icon("send", 13) + ' Send test email</button></div>'
          + '    </div>'
          + '  </div>'
          + '</div>'

          // SMS GATEWAY CARD
          + '<div class="card">'
          + '  <div class="card-head"><div><h3>SMS Gateway Configuration</h3><div class="sub">Send instant SMS alerts for urgent announcements, town halls, shift updates & reminders</div></div>'
          + '    <div class="right">' + switchHTML('name="sms_enabled" id="cfg-sms-enabled"', cfg.sms_enabled === "1", "Enable SMS") + '</div>'
          + '  </div>'
          + '  <div class="card-body stack">'
          + '    <div class="form-grid">'
          + '      <div class="field"><label>SMS Provider</label><select class="select" name="sms_provider" id="cfg-sms-provider">'
          + '        <option value="sandbox"' + ((cfg.sms_provider || "sandbox") === "sandbox" ? " selected" : "") + '>Sandbox / Simulated (Offline-safe SMS log)</option>'
          + '        <option value="africastalking"' + (cfg.sms_provider === "africastalking" ? " selected" : "") + '>Africa\'s Talking (Ghana / Pan-African)</option>'
          + '        <option value="twilio"' + (cfg.sms_provider === "twilio" ? " selected" : "") + '>Twilio Programmable SMS</option>'
          + '        <option value="custom"' + (cfg.sms_provider === "custom" ? " selected" : "") + '>Custom HTTP JSON Webhook (Hubtel / Arkesel / mNotify)</option>'
          + '      </select></div>'
          + '      <div class="field"><label>Alphanumeric Sender ID</label><input class="input mono" name="sms_sender_id" value="' + esc(cfg.sms_sender_id || "MeridianHR") + '" placeholder="MeridianHR"></div>'
          + '      <div class="field full"><label>SMS Message Prefix</label><input class="input" name="sms_prefix" value="' + esc(cfg.sms_prefix || "Meridian HR: ") + '" placeholder="Meridian HR: "></div>'
          + '    </div>'

          // Twilio fields
          + '    <div id="sms-twilio-box" class="channel-box hidden">'
          + '      <div class="section-title" style="margin-bottom:10px">Twilio Credentials</div>'
          + '      <div class="form-grid">'
          + '        <div class="field"><label>Account SID</label><input class="input mono" name="twilio_account_sid" value="' + esc(cfg.twilio_account_sid || "") + '" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"></div>'
          + '        <div class="field"><label>From Number / Messaging Service</label><input class="input mono" name="twilio_from_number" value="' + esc(cfg.twilio_from_number || "") + '" placeholder="+15005550006"></div>'
          + '        <div class="field full"><label>Auth Token ' + (cfg.twilio_auth_token_set ? '<span class="chip green">Stored</span>' : '') + '</label>'
          + '          <input class="input" type="password" name="twilio_auth_token" placeholder="' + (cfg.twilio_auth_token_set ? "•••••••• (leave blank to keep)" : "Twilio Auth Token") + '"></div>'
          + '      </div>'
          + '    </div>'

          // Africa's Talking fields
          + '    <div id="sms-at-box" class="channel-box hidden">'
          + '      <div class="section-title" style="margin-bottom:10px">Africa\'s Talking Credentials</div>'
          + '      <div class="form-grid">'
          + '        <div class="field"><label>Username (use "sandbox" for AT test)</label><input class="input" name="at_username" value="' + esc(cfg.at_username || "") + '" placeholder="meridian_gh"></div>'
          + '        <div class="field"><label>API Key ' + (cfg.at_api_key_set ? '<span class="chip green">Stored</span>' : '') + '</label>'
          + '          <input class="input" type="password" name="at_api_key" placeholder="' + (cfg.at_api_key_set ? "•••••••• (leave blank to keep)" : "Africa's Talking API Key") + '"></div>'
          + '      </div>'
          + '    </div>'

          // Webhook fields
          + '    <div id="sms-webhook-box" class="channel-box hidden">'
          + '      <div class="section-title" style="margin-bottom:10px">Custom SMS HTTP Webhook</div>'
          + '      <div class="form-grid">'
          + '        <div class="field full"><label>POST Endpoint URL (receives JSON <span class="mono">{ "to": "+233…", "message": "…", "sender": "…" }</span>)</label>'
          + '          <input class="input" name="sms_webhook_url" value="' + esc(cfg.sms_webhook_url || "") + '" placeholder="https://sms.arkesel.com/api/v2/sms/send"></div>'
          + '        <div class="field full"><label>Bearer Token / API Secret ' + (cfg.sms_api_key_set ? '<span class="chip green">Stored</span>' : '') + '</label>'
          + '          <input class="input" type="password" name="sms_api_key" placeholder="' + (cfg.sms_api_key_set ? "•••••••• (leave blank to keep)" : "Optional Bearer token") + '"></div>'
          + '      </div>'
          + '    </div>'

          + '    <div class="row-between" style="background:#faf8f3;padding:12px 14px;border-radius:10px;border:1px solid var(--line);flex-wrap:wrap;gap:10px">'
          + '      <div class="small"><b>Verify SMS Gateway</b> — Saves current configuration and dispatches a test SMS.</div>'
          + '      <div class="row"><input class="input mono" id="test-sms-to" style="width:200px;height:34px" value="' + esc(Store.user.phone || "+233 24 111 0001") + '" placeholder="+233 24 000 0000">'
          + '      <button class="btn btn-sm btn-teal" type="button" id="btn-test-sms">' + icon("send", 13) + ' Send test SMS</button></div>'
          + '    </div>'
          + '  </div>'
          + '</div>'

          + '<div class="row" style="justify-content:flex-end"><button class="btn btn-accent" type="submit">' + icon("check", 14) + ' Save Email & SMS Configuration</button></div>'
          + '</form></div>';

        const syncProviderVisibility = () => {
          const emMode = stage.querySelector("#cfg-email-mode").value;
          stage.querySelector("#smtp-fields-wrap").classList.toggle("hidden", emMode !== "smtp");
          const smsProv = stage.querySelector("#cfg-sms-provider").value;
          stage.querySelector("#sms-twilio-box").classList.toggle("hidden", smsProv !== "twilio");
          stage.querySelector("#sms-at-box").classList.toggle("hidden", smsProv !== "africastalking");
          stage.querySelector("#sms-webhook-box").classList.toggle("hidden", smsProv !== "custom");
        };
        syncProviderVisibility();
        stage.querySelector("#cfg-email-mode").onchange = syncProviderVisibility;
        stage.querySelector("#cfg-sms-provider").onchange = syncProviderVisibility;

        stage.querySelectorAll("[data-smtp-preset]").forEach(btn => {
          btn.onclick = () => {
            const p = btn.dataset.smtpPreset;
            const form = stage.querySelector("#gateway-config-form");
            form.querySelector('[name="email_mode"]').value = "smtp";
            if (p === "gmail") {
              form.querySelector('[name="smtp_host"]').value = "smtp.gmail.com";
              form.querySelector('[name="smtp_port"]').value = "587";
              form.querySelector('[name="smtp_encryption"]').value = "starttls";
            } else if (p === "m365") {
              form.querySelector('[name="smtp_host"]').value = "smtp.office365.com";
              form.querySelector('[name="smtp_port"]').value = "587";
              form.querySelector('[name="smtp_encryption"]').value = "starttls";
            } else {
              form.querySelector('[name="smtp_host"]').value = "mail.yourdomain.com";
              form.querySelector('[name="smtp_port"]').value = "465";
              form.querySelector('[name="smtp_encryption"]').value = "ssl";
            }
            syncProviderVisibility();
            form.querySelector('[name="smtp_username"]').focus();
            toast("Applied SMTP preset — enter your email username & App Password, then click Save.", "info");
          };
        });

        const saveGatewayPayload = async () => {
          const form = stage.querySelector("#gateway-config-form");
          const fd = new FormData(form);
          const payload = {};
          ["email_mode", "email_subject_prefix", "smtp_from_name", "smtp_from_email", "smtp_reply_to",
           "smtp_host", "smtp_port", "smtp_encryption", "smtp_username", "smtp_password",
           "sms_provider", "sms_sender_id", "sms_prefix",
           "twilio_account_sid", "twilio_from_number", "twilio_auth_token",
           "at_username", "at_api_key",
           "sms_webhook_url", "sms_api_key",
           "evt_default_reminder_hours"].forEach(k => {
            payload[k] = fd.get(k) || "";
          });
          ["email_enabled", "sms_enabled",
           "ann_default_in_app", "ann_default_email", "ann_default_sms",
           "evt_default_in_app", "evt_default_email", "evt_default_sms"].forEach(k => {
            payload[k] = form.querySelector('[name="' + k + '"]').checked ? "1" : "0";
          });
          await API.put("/messaging/config", payload);
        };

        stage.querySelector("#gateway-config-form").onsubmit = async (ev) => {
          ev.preventDefault();
          try {
            await saveGatewayPayload();
            toast("Email & SMS configuration saved", "success");
            renderShell();
          } catch (err) { handleErr(err); }
        };

        stage.querySelector("#btn-test-email").onclick = async () => {
          try {
            await saveGatewayPayload();
            const to = stage.querySelector("#test-email-to").value.trim();
            const r = await API.post("/messaging/test-email", { to });
            toast("Email test succeeded (" + (r.data.status || "sent") + " · ref " + (r.data.ref || "ok") + ")", "success");
          } catch (err) { handleErr(err); }
        };

        stage.querySelector("#btn-test-sms").onclick = async () => {
          try {
            await saveGatewayPayload();
            const to = stage.querySelector("#test-sms-to").value.trim();
            const r = await API.post("/messaging/test-sms", { to });
            toast("SMS test succeeded (" + (r.data.status || "sent") + " · ref " + (r.data.ref || "ok") + ")", "success");
          } catch (err) { handleErr(err); }
        };

      } catch (err) {
        stage.innerHTML = emptyState("Could not load gateway settings", err.message, "alert");
      }
      return;
    }

    /* ---------------- TAB: EVENT & BROADCAST ROUTING ---------------- */
    if (tab === "routing" && isAdmin) {
      try {
        const res = await API.get("/messaging/routing");
        const { events, routing } = res.data;

        stage.innerHTML = '<div class="card">'
          + '<div class="card-head"><div><h3>Organisation-Wide Event & Announcement Channel Matrix</h3><div class="sub">Control which channels fire across Meridian HR when announcements, company events, approvals, and payslips occur</div></div>'
          + '<div class="right"><button class="btn btn-accent" id="save-routing-btn">' + icon("check", 14) + ' Save routing rules</button></div></div>'
          + '<div class="table-wrap">'
          + '<table><thead><tr><th>System Event</th><th>Module</th><th class="right">In-App Bell</th><th class="right">Email</th><th class="right">SMS</th></tr></thead><tbody>'
          + events.map(ev => {
              const r = routing[ev.key] || { in_app: true, email: true, sms: false };
              const highlight = ["announcement", "event_published", "event_reminder"].includes(ev.key);
              return '<tr data-route-row="' + esc(ev.key) + '" style="' + (highlight ? "background:#fdfaf3" : "") + '">'
                + '<td><div class="row"><b>' + esc(ev.label) + '</b>' + (highlight ? '<span class="chip teal" style="font-size:10px">Broadcast / Event</span>' : '') + '</div>'
                + '<div class="tiny muted">' + esc(ev.description || "") + '</div></td>'
                + '<td><span class="chip grey">' + esc(ev.category) + '</span></td>'
                + '<td class="right">' + switchHTML('data-rch="in_app"', r.in_app) + '</td>'
                + '<td class="right">' + switchHTML('data-rch="email"', r.email) + '</td>'
                + '<td class="right">' + switchHTML('data-rch="sms"', r.sms) + '</td>'
                + '</tr>';
            }).join("")
          + '</tbody></table></div></div>';

        stage.querySelector("#save-routing-btn").onclick = async () => {
          const out = {};
          stage.querySelectorAll("[data-route-row]").forEach(tr => {
            out[tr.dataset.routeRow] = {
              in_app: tr.querySelector('[data-rch="in_app"]').checked,
              email: tr.querySelector('[data-rch="email"]').checked,
              sms: tr.querySelector('[data-rch="sms"]').checked,
            };
          });
          try {
            await API.put("/messaging/routing", { routing: out });
            toast("Event & announcement routing updated", "success");
          } catch (err) { handleErr(err); }
        };
      } catch (err) {
        stage.innerHTML = emptyState("Could not load routing rules", err.message, "alert");
      }
      return;
    }

    /* ---------------- TAB: DELIVERY LOG ---------------- */
    if (tab === "deliveries" && isAdmin) {
      const loadLogs = async () => {
        const res = await API.get("/messaging/deliveries", { per_page: 300 });
        const rows = res.data || [];
        const sum = res.summary || { total: 0, sent: 0, failed: 0, email: 0, sms: 0 };

        stage.innerHTML = '<div class="grid grid-4" style="margin-bottom:16px">'
          + '<div class="kpi"><div class="label">Total Dispatches</div><div class="value">' + fmtNumber(sum.total) + '</div></div>'
          + '<div class="kpi"><div class="label">Sent / Simulated</div><div class="value" style="color:var(--green)">' + fmtNumber(sum.sent) + '</div></div>'
          + '<div class="kpi"><div class="label">Emails / SMS</div><div class="value">' + fmtNumber(sum.email) + ' / ' + fmtNumber(sum.sms) + '</div></div>'
          + '<div class="kpi"><div class="label">Failed / Blocked</div><div class="value" style="color:' + (sum.failed ? "var(--red)" : "var(--muted)") + '">' + fmtNumber(sum.failed) + '</div></div>'
          + '</div>'
          + renderTable({
              id: "messaging-deliveries-table",
              title: "Outbound Email & SMS Delivery Log",
              sub: "Filter by channel, trigger event, status, or sent date.",
              exportName: "messaging-delivery-log",
              actions: '<button class="btn btn-sm btn-ghost" id="del-refresh">' + icon("refresh", 13) + ' Refresh</button>',
              dateField: "sent_at",
              dateLabel: "Sent",
              filters: [
                { key: "channel", label: "Channel" },
                { key: "event_key", label: "Trigger" },
                { key: "status", label: "Status" },
              ],
              columns: [
                { label: "Time", key: "sent_at", render: r => '<span class="tiny">' + fmtDateTime(r.sent_at || r.created_at) + '</span>' },
                { label: "Channel", key: "channel", render: r => '<span class="chip ' + (r.channel === "sms" ? "purple" : "blue") + '">' + esc((r.channel || "").toUpperCase()) + '</span>' },
                { label: "Trigger", key: "event_key", render: r => '<span class="tiny" style="text-transform:capitalize">' + esc((r.event_key || "").replace(/_/g, " ")) + '</span>' },
                { label: "Recipient", sortKey: "recipient_name", render: r => '<b>' + esc(r.recipient_name || "—") + '</b><div class="mono tiny muted">' + esc(r.recipient || "") + '</div>' },
                { label: "Subject / Message", key: "subject", render: r => '<b>' + esc(r.subject || "SMS") + '</b>' + (r.error ? '<div class="tiny" style="color:var(--red)">' + esc(r.error) + '</div>' : (r.body ? '<div class="tiny muted" style="max-width:290px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.body) + '</div>' : '')) },
                { label: "Status", key: "status", render: r => chip(r.status) },
                { label: "", class: "right", sortable: false, render: r => '<div class="row" style="justify-content:flex-end"><button class="btn btn-sm btn-ghost" data-inspect-del="' + r.id + '">View</button>' + (r.status === "failed" || r.status === "disabled" ? '<button class="btn btn-sm btn-accent" data-retry-del="' + r.id + '">Retry</button>' : '') + '</div>' },
              ],
              rows,
              emptyTitle: "No outbound Email or SMS logs match",
            });

        const refBtn = stage.querySelector("#del-refresh");
        if (refBtn) refBtn.onclick = loadLogs;

        if (!stage._delBound) {
          stage._delBound = true;
          onDelegate(stage, "click", "[data-inspect-del]", (b) => {
            if (typeof openDeliveryPreviewModal === "function") {
              openDeliveryPreviewModal(b.dataset.inspectDel, loadLogs);
              return;
            }
          });
          onDelegate(stage, "click", "[data-retry-del]", async (b) => {
            try {
              await API.post("/messaging/deliveries/" + b.dataset.retryDel + "/retry");
              toast("Delivery retried", "success");
              loadLogs();
            } catch (err) { handleErr(err); }
          });
        }
        stage._latestRows = rows;
      };

      await loadLogs();
    }
  }

  await renderShell();
};

/* ============================================================================
   3. ANNOUNCEMENTS & COMPANY EVENTS (Views.announcements)
============================================================================ */
function openAnnouncementComposer(existing, gwStatus, onSaved) {
  const defAnn = (gwStatus && gwStatus.ann_defaults) || { in_app: true, email: true, sms: false };
  const initInApp = existing ? existing.send_in_app !== false : defAnn.in_app;
  const initEmail = existing ? !!existing.send_email : defAnn.email;
  const initSms = existing ? !!existing.send_sms : defAnn.sms;

  openModal({
    title: existing ? "Edit Announcement" : "Publish Announcement",
    sub: "Target company-wide or specific teams with In-App, Email, and SMS delivery",
    wide: true,
    body: '<form id="ann-composer-form" class="stack">'
      + '<div class="form-grid">'
      + '  <div class="field full"><label>Headline *</label><input class="input" name="title" required value="' + esc(existing ? existing.title : "") + '" placeholder="e.g. Q4 All-Hands Town Hall & Public Holiday Notice"></div>'
      + '  <div class="field"><label>Audience Scope</label><select class="select" name="audience" id="ann-audience">'
      +      ["all", "department", "branch", "role"].map(a => '<option value="' + a + '"' + ((existing ? existing.audience : "all") === a ? " selected" : "") + '>' + (a === "all" ? "All Employees" : "Specific " + a[0].toUpperCase() + a.slice(1)) + '</option>').join("")
      + '  </select></div>'
      + '  <div class="field" id="ann-dept-wrap"><label>Target Department</label><select class="select" name="department_id"><option value="">Select department…</option>'
      +      deptOptions().map(o => '<option value="' + o.value + '"' + (existing && String(existing.department_id) === String(o.value) ? " selected" : "") + '>' + esc(o.label) + '</option>').join("") + '</select></div>'
      + '  <div class="field hidden" id="ann-branch-wrap"><label>Target Branch</label><select class="select" name="branch_id"><option value="">Select branch…</option>'
      +      branchOptions().map(o => '<option value="' + o.value + '"' + (existing && String(existing.branch_id) === String(o.value) ? " selected" : "") + '>' + esc(o.label) + '</option>').join("") + '</select></div>'
      + '  <div class="field hidden" id="ann-role-wrap"><label>Target Role</label><select class="select" name="role_slug"><option value="">Select role…</option>'
      +      ((Store.meta.roles || []).map(r => '<option value="' + esc(r.slug) + '"' + (existing && existing.role_slug === r.slug ? " selected" : "") + '>' + esc(r.name) + '</option>').join("")) + '</select></div>'
      + '  <div class="field"><label>Pin to top?</label><select class="select" name="pinned"><option value="false"' + (!existing || !existing.pinned ? " selected" : "") + '>Standard</option><option value="true"' + (existing && existing.pinned ? " selected" : "") + '>Pinned highlight</option></select></div>'
      + '  <div class="field"><label>Expiry Date (optional)</label><input class="input" type="date" name="expires_at" value="' + esc(existing && existing.expires_at ? String(existing.expires_at).slice(0, 10) : "") + '"></div>'
      + '  <div class="field full"><label>Announcement Body *</label><textarea class="textarea" name="body" rows="4" required placeholder="Write the full announcement details…">' + esc(existing ? existing.body : "") + '</textarea></div>'
      + '</div>'

      + '<div class="channel-box stack" style="gap:12px">'
      + '  <div class="row-between" style="flex-wrap:wrap;gap:8px"><b style="font-size:13px">Notification, Email & SMS Channels</b>'
      + '    <div class="row" style="gap:6px"><span class="tiny muted">Email:</span>' + emailGatewayBadge(gwStatus) + '<span class="tiny muted">SMS:</span>' + smsGatewayBadge(gwStatus) + '</div>'
      + '  </div>'
      + '  <div class="row" style="gap:22px;flex-wrap:wrap">'
      +      switchHTML('name="send_in_app"', initInApp, "In-App Notification")
      +      switchHTML('name="send_email"', initEmail, "Send Email Broadcast")
      +      switchHTML('name="send_sms"', initSms, "Send SMS Alert")
      + '  </div>'
      + '  <div class="form-grid">'
      + '    <div class="field full"><label>Custom Email Subject (optional — defaults to headline)</label><input class="input" name="email_subject" value="' + esc(existing && existing.email_subject ? existing.email_subject : "") + '" placeholder="Optional custom subject line"></div>'
      + '    <div class="field full"><label class="row-between"><span>Custom SMS Copy (optional — auto-summarised if blank)</span><span class="mono tiny" id="ann-sms-len">0 / 160 chars</span></label>'
      + '      <input class="input" name="sms_message" id="ann-sms-input" maxlength="300" value="' + esc(existing && existing.sms_message ? existing.sms_message : "") + '" placeholder="Concise SMS text for mobile recipients…"></div>'
      + '  </div>'
      +    (existing ? '<label class="row small" style="gap:8px"><input type="checkbox" name="rebroadcast"> Re-dispatch Email/SMS broadcast upon saving</label>' : '')
      + '</div>'
      + '</form>',
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-accent" id="ann-submit-btn">' + icon("send", 14) + ' ' + (existing ? "Save changes" : "Publish & Dispatch") + '</button>',
    onMount(card) {
      const audSel = card.querySelector("#ann-audience");
      const syncAud = () => {
        const v = audSel.value;
        card.querySelector("#ann-dept-wrap").classList.toggle("hidden", v !== "department");
        card.querySelector("#ann-branch-wrap").classList.toggle("hidden", v !== "branch");
        card.querySelector("#ann-role-wrap").classList.toggle("hidden", v !== "role");
      };
      syncAud();
      audSel.onchange = syncAud;

      const smsIn = card.querySelector("#ann-sms-input");
      const smsLen = card.querySelector("#ann-sms-len");
      const updLen = () => { smsLen.textContent = (smsIn.value || "").length + " / 160 chars"; };
      updLen();
      smsIn.oninput = updLen;

      card.querySelector("#ann-submit-btn").onclick = async () => {
        const form = card.querySelector("#ann-composer-form");
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const payload = {
          title: fd.get("title").trim(),
          body: fd.get("body").trim(),
          audience: fd.get("audience"),
          department_id: fd.get("audience") === "department" && fd.get("department_id") ? Number(fd.get("department_id")) : null,
          branch_id: fd.get("audience") === "branch" && fd.get("branch_id") ? Number(fd.get("branch_id")) : null,
          role_slug: fd.get("audience") === "role" ? (fd.get("role_slug") || null) : null,
          pinned: fd.get("pinned") === "true",
          expires_at: fd.get("expires_at") || null,
          send_in_app: form.querySelector('[name="send_in_app"]').checked,
          send_email: form.querySelector('[name="send_email"]').checked,
          send_sms: form.querySelector('[name="send_sms"]').checked,
          email_subject: fd.get("email_subject") || null,
          sms_message: fd.get("sms_message") || null,
        };
        try {
          let deliveryInfo = null;
          if (existing) {
            await API.put("/announcements/" + existing.id, payload);
            if (form.querySelector('[name="rebroadcast"]') && form.querySelector('[name="rebroadcast"]').checked) {
              const br = await API.post("/announcements/" + existing.id + "/broadcast", payload);
              deliveryInfo = br.data;
            }
          } else {
            const cr = await API.post("/announcements", payload);
            deliveryInfo = cr.data && cr.data.delivery;
          }
          closeModal();
          loadNotifications();
          if (deliveryInfo) {
            toast("Published · In-app: " + (deliveryInfo.in_app || 0) + ", Email: " + (deliveryInfo.email || 0) + ", SMS: " + (deliveryInfo.sms || 0), "success");
          } else {
            toast("Announcement saved", "success");
          }
          await onSaved();
        } catch (err) { handleErr(err); }
      };
    },
  });
}

function openEventComposer(existing, gwStatus, onSaved) {
  const defEv = (gwStatus && gwStatus.evt_defaults) || { in_app: true, email: true, sms: false };
  const initInApp = existing ? existing.send_in_app !== false : defEv.in_app;
  const initEmail = existing ? !!existing.send_email : defEv.email;
  const initSms = existing ? !!existing.send_sms : defEv.sms;
  const toLocalDT = (iso) => iso ? String(iso).slice(0, 16) : "";

  openModal({
    title: existing ? "Edit Company Event" : "Schedule Company Event",
    sub: "Invite employees with calendar details and automated Email & SMS notifications",
    wide: true,
    body: '<form id="ev-composer-form" class="stack">'
      + '<div class="form-grid">'
      + '  <div class="field full"><label>Event Title *</label><input class="input" name="title" required value="' + esc(existing ? existing.title : "") + '" placeholder="e.g. Q4 Town Hall, Cybersecurity Workshop, Annual Health Screening"></div>'
      + '  <div class="field"><label>Category</label><select class="select" name="category">'
      +      [["town_hall", "Town Hall"], ["training", "Training / Workshop"], ["celebration", "Culture & Celebration"], ["wellness", "Health & Wellness"], ["holiday", "Holiday / Closure"], ["general", "General Event"]].map(([v, l]) => '<option value="' + v + '"' + ((existing ? existing.category : "town_hall") === v ? " selected" : "") + '>' + l + '</option>').join("")
      + '  </select></div>'
      + '  <div class="field"><label>Audience</label><select class="select" name="audience" id="ev-audience">'
      +      ["all", "department", "branch", "role"].map(a => '<option value="' + a + '"' + ((existing ? existing.audience : "all") === a ? " selected" : "") + '>' + (a === "all" ? "All Staff" : "Specific " + a[0].toUpperCase() + a.slice(1)) + '</option>').join("")
      + '  </select></div>'
      + '  <div class="field hidden" id="ev-dept-wrap"><label>Department</label><select class="select" name="department_id"><option value="">Select…</option>' + deptOptions().map(o => '<option value="' + o.value + '"' + (existing && String(existing.department_id) === String(o.value) ? " selected" : "") + '>' + esc(o.label) + '</option>').join("") + '</select></div>'
      + '  <div class="field hidden" id="ev-branch-wrap"><label>Branch</label><select class="select" name="branch_id"><option value="">Select…</option>' + branchOptions().map(o => '<option value="' + o.value + '"' + (existing && String(existing.branch_id) === String(o.value) ? " selected" : "") + '>' + esc(o.label) + '</option>').join("") + '</select></div>'
      + '  <div class="field hidden" id="ev-role-wrap"><label>Role</label><select class="select" name="role_slug"><option value="">Select…</option>' + (Store.meta.roles || []).map(r => '<option value="' + esc(r.slug) + '"' + (existing && existing.role_slug === r.slug ? " selected" : "") + '>' + esc(r.name) + '</option>').join("") + '</select></div>'
      + '  <div class="field"><label>Start Date & Time *</label><input class="input" type="datetime-local" name="start_at" required value="' + esc(existing ? toLocalDT(existing.start_at) : todayISO() + "T10:00") + '"></div>'
      + '  <div class="field"><label>End Date & Time</label><input class="input" type="datetime-local" name="end_at" value="' + esc(existing ? toLocalDT(existing.end_at) : todayISO() + "T11:30") + '"></div>'
      + '  <div class="field"><label>Venue / Physical Location</label><input class="input" name="location" value="' + esc(existing ? existing.location || "" : "") + '" placeholder="Accra HQ Auditorium"></div>'
      + '  <div class="field"><label>Virtual Meeting Link (optional)</label><input class="input" name="meeting_url" value="' + esc(existing ? existing.meeting_url || "" : "") + '" placeholder="https://meet.meridian.gh/…"></div>'
      + '  <div class="field full"><label>Agenda & Description</label><textarea class="textarea" name="description" rows="3" placeholder="Event agenda, speakers, and preparation notes…">' + esc(existing ? existing.description || "" : "") + '</textarea></div>'
      + '</div>'

      + '<div class="channel-box stack" style="gap:10px">'
      + '  <div class="row-between" style="flex-wrap:wrap;gap:8px"><b style="font-size:13px">Event Invitation & Reminder Channels</b>'
      + '    <div class="row" style="gap:6px"><span class="tiny muted">Email:</span>' + emailGatewayBadge(gwStatus) + '<span class="tiny muted">SMS:</span>' + smsGatewayBadge(gwStatus) + '</div>'
      + '  </div>'
      + '  <div class="row" style="gap:22px;flex-wrap:wrap">'
      +      switchHTML('name="send_in_app"', initInApp, "In-App Alert")
      +      switchHTML('name="send_email"', initEmail, "Email Invitation")
      +      switchHTML('name="send_sms"', initSms, "SMS Alert")
      + '  </div>'
      + '  <div class="form-grid">'
      + '    <div class="field"><label>Custom Email Subject (optional)</label><input class="input" name="email_subject" value="' + esc(existing && existing.email_subject ? existing.email_subject : "") + '" placeholder="Invitation: …"></div>'
      + '    <div class="field"><label>Custom SMS Copy (optional)</label><input class="input" name="sms_message" value="' + esc(existing && existing.sms_message ? existing.sms_message : "") + '" placeholder="Concise SMS alert…"></div>'
      + '  </div>'
      +    (existing
              ? '<label class="row small" style="gap:8px"><input type="checkbox" name="notify_update" checked> Notify invited staff via selected channels about this update</label>'
              : '<label class="row small" style="gap:8px"><input type="checkbox" name="dispatch_now" checked> Dispatch invitations immediately upon scheduling</label>')
      + '</div>'
      + '</form>',
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-accent" id="ev-submit-btn">' + icon("calendar", 14) + ' ' + (existing ? "Update Event" : "Schedule & Invite") + '</button>',
    onMount(card) {
      const audSel = card.querySelector("#ev-audience");
      const syncAud = () => {
        const v = audSel.value;
        card.querySelector("#ev-dept-wrap").classList.toggle("hidden", v !== "department");
        card.querySelector("#ev-branch-wrap").classList.toggle("hidden", v !== "branch");
        card.querySelector("#ev-role-wrap").classList.toggle("hidden", v !== "role");
      };
      syncAud();
      audSel.onchange = syncAud;

      card.querySelector("#ev-submit-btn").onclick = async () => {
        const form = card.querySelector("#ev-composer-form");
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const payload = {
          title: fd.get("title").trim(),
          category: fd.get("category"),
          audience: fd.get("audience"),
          department_id: fd.get("audience") === "department" && fd.get("department_id") ? Number(fd.get("department_id")) : null,
          branch_id: fd.get("audience") === "branch" && fd.get("branch_id") ? Number(fd.get("branch_id")) : null,
          role_slug: fd.get("audience") === "role" ? (fd.get("role_slug") || null) : null,
          start_at: fd.get("start_at"),
          end_at: fd.get("end_at") || null,
          location: fd.get("location") || null,
          meeting_url: fd.get("meeting_url") || null,
          description: fd.get("description") || null,
          send_in_app: form.querySelector('[name="send_in_app"]').checked,
          send_email: form.querySelector('[name="send_email"]').checked,
          send_sms: form.querySelector('[name="send_sms"]').checked,
          email_subject: fd.get("email_subject") || null,
          sms_message: fd.get("sms_message") || null,
          dispatch_now: form.querySelector('[name="dispatch_now"]') ? form.querySelector('[name="dispatch_now"]').checked : false,
          notify_update: form.querySelector('[name="notify_update"]') ? form.querySelector('[name="notify_update"]').checked : false,
        };
        try {
          const res = existing
            ? await API.put("/events/" + existing.id, payload)
            : await API.post("/events", payload);
          const deliv = res.data && res.data.delivery;
          closeModal();
          loadNotifications();
          if (deliv) {
            toast("Event scheduled · In-app: " + (deliv.in_app || 0) + ", Email: " + (deliv.email || 0) + ", SMS: " + (deliv.sms || 0), "success");
          } else {
            toast("Event saved", "success");
          }
          await onSaved();
        } catch (err) { handleErr(err); }
      };
    },
  });
}

function openBroadcastReminderModal(kind, item, gwStatus, onDone) {
  const isEvent = kind === "event";
  openModal({
    title: isEvent ? "Send Event Reminder — " + item.title : "Broadcast Announcement — " + item.title,
    sub: "Dispatch immediately across In-App, Email, and SMS channels",
    body: '<form id="bcast-form" class="stack">'
      + '<div class="channel-box stack" style="gap:10px">'
      + '  <div class="row-between"><b class="small">Select Delivery Channels</b><div class="row">' + emailGatewayBadge(gwStatus) + smsGatewayBadge(gwStatus) + '</div></div>'
      + '  <div class="row" style="gap:20px;flex-wrap:wrap">'
      +      switchHTML('name="send_in_app"', item.send_in_app !== false, "In-App")
      +      switchHTML('name="send_email"', item.send_email !== false, "Email")
      +      switchHTML('name="send_sms"', isEvent ? true : !!item.send_sms, "SMS")
      + '  </div>'
      + '</div>'
      + '<div class="field"><label>Custom Email Subject (optional)</label><input class="input" name="email_subject" value="' + esc((isEvent ? "Reminder: " : "") + item.title) + '"></div>'
      + '<div class="field"><label>SMS Alert Copy (concise mobile text)</label><textarea class="textarea" name="sms_message" rows="2">' + esc(isEvent ? ("Reminder: " + item.title + (item.location ? " at " + item.location : "")) : (item.sms_message || item.title)) + '</textarea></div>'
      + '</form>',
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-accent" id="bcast-go">' + icon("send", 14) + ' Dispatch now</button>',
    onMount(card) {
      card.querySelector("#bcast-go").onclick = async () => {
        const form = card.querySelector("#bcast-form");
        const fd = new FormData(form);
        const payload = {
          send_in_app: form.querySelector('[name="send_in_app"]').checked,
          send_email: form.querySelector('[name="send_email"]').checked,
          send_sms: form.querySelector('[name="send_sms"]').checked,
          email_subject: fd.get("email_subject"),
          sms_message: fd.get("sms_message"),
          is_reminder: true,
        };
        try {
          const url = isEvent ? ("/events/" + item.id + "/notify") : ("/announcements/" + item.id + "/broadcast");
          const r = await API.post(url, payload);
          const d = r.data || {};
          closeModal();
          loadNotifications();
          toast("Dispatched — In-app: " + (d.in_app || 0) + ", Email: " + (d.email || 0) + ", SMS: " + (d.sms || 0), "success");
          await onDone();
        } catch (err) { handleErr(err); }
      };
    },
  });
}

Views.announcements = async function (root, params) {
  let tab = (params && params[0] === "events") ? "events" : "announcements";
  const canManage = Store.canManage();

  async function render() {
    root.innerHTML = pageHead("Announcements & Events", "Loading broadcasts & calendar…", "", "Communications") + spinners(3);
    try {
      const [annRes, evRes, gwRes] = await Promise.all([
        API.get("/announcements", { per_page: 50 }),
        API.get("/events"),
        API.get("/messaging/status"),
      ]);
      const anns = annRes.data || [];
      const events = evRes.data || [];
      const gw = gwRes.data || {};

      const headActions = '<div class="row" style="flex-wrap:wrap;gap:8px">'
        + (Store.isAdmin() ? '<button class="btn btn-ghost" onclick="go(\'settings/email_sms\')">' + icon("sliders", 14) + ' Email & SMS Settings</button>' : '')
        + (canManage ? '<button class="btn btn-ghost" id="btn-new-event">' + icon("calendar", 14) + ' Schedule event</button>' : '')
        + (canManage ? '<button class="btn btn-accent" id="btn-new-ann">' + icon("megaphone", 14) + ' New announcement</button>' : '')
        + '</div>';

      const gatewayStrip = canManage
        ? '<div class="card card-pad" style="margin-bottom:16px;background:linear-gradient(90deg,#faf8f2,#f3f7f5)"><div class="row-between" style="flex-wrap:wrap;gap:10px">'
          + '<div class="row" style="gap:14px;flex-wrap:wrap"><span class="tiny muted" style="text-transform:uppercase;letter-spacing:.1em;font-weight:600">Broadcast Gateways</span>'
          + '<span class="row" style="gap:6px">' + icon("mail", 14) + ' <span class="small">Email:</span> ' + emailGatewayBadge(gw) + '</span>'
          + '<span class="row" style="gap:6px">' + icon("message", 14) + ' <span class="small">SMS:</span> ' + smsGatewayBadge(gw) + '</span></div>'
          + (Store.isAdmin() ? '<div class="row" style="gap:10px"><span class="link" onclick="go(\'settings/routing\')">Routing matrix</span><span class="muted">·</span><span class="link" onclick="go(\'settings/deliveries\')">Delivery log →</span></div>' : '')
          + '</div></div>'
        : "";

      let bodyHtml = "";

      if (tab === "announcements") {
        bodyHtml = anns.length ? '<div class="stack">' + anns.map(a => {
          const audLabel = a.audience === "department" ? ("Dept: " + (a.department_name || "#" + a.department_id))
            : a.audience === "branch" ? ("Branch: " + (a.branch_name || "#" + a.branch_id))
            : a.audience === "role" ? ("Role: " + (a.role_slug || ""))
            : "All Employees";
          const ds = a.delivery_stats || { email_sent: 0, sms_sent: 0 };
          return '<div class="card card-pad" style="' + (a.pinned ? "border-left:3px solid var(--accent)" : "") + '">'
            + '<div class="row-between" style="align-items:flex-start;gap:12px">'
            + '  <div>'
            + '    <div class="row" style="gap:8px;flex-wrap:wrap">'
            +        (a.pinned ? '<span class="chip amber">Pinned</span>' : '')
            + '      <span class="chip teal">' + esc(audLabel) + '</span>'
            +        (a.send_in_app !== false ? '<span class="channel-pill active">' + icon("bell", 12) + ' In-App</span>' : '')
            +        (a.send_email ? '<span class="channel-pill active">' + icon("mail", 12) + ' Email' + (ds.email_sent ? " (" + ds.email_sent + ")" : "") + '</span>' : '')
            +        (a.send_sms ? '<span class="channel-pill active">' + icon("message", 12) + ' SMS' + (ds.sms_sent ? " (" + ds.sms_sent + ")" : "") + '</span>' : '')
            + '    </div>'
            + '    <h3 style="font-family:var(--serif);font-size:21px;font-weight:500;margin-top:8px">' + esc(a.title) + '</h3>'
            + '  </div>'
            + '  <div class="row" style="gap:6px">'
            +      (canManage ? '<button class="btn btn-sm btn-ghost" data-bcast-ann="' + a.id + '">' + icon("send", 13) + ' Broadcast</button>' : '')
            +      (canManage ? '<button class="btn btn-sm btn-ghost" data-edit-ann="' + a.id + '">' + icon("edit", 13) + '</button>' : '')
            +      (canManage ? '<button class="btn btn-sm btn-ghost" data-del-ann="' + a.id + '">' + icon("trash", 13) + '</button>' : '')
            + '  </div>'
            + '</div>'
            + '<p style="margin-top:10px;white-space:pre-line;color:var(--ink-3);font-size:13.5px;line-height:1.6">' + esc(a.body) + '</p>'
            + '<div class="row-between tiny muted" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line)">'
            + '  <span>Published ' + fmtDateTime(a.publish_at || a.created_at) + (a.author_name ? " by " + esc(a.author_name) : "") + '</span>'
            + '  <span>' + (a.expires_at ? "Expires " + fmtDate(a.expires_at) : "Active notice") + '</span>'
            + '</div></div>';
        }).join("") + '</div>' : emptyState("No announcements yet", "Publish company news via In-App, Email and SMS.", "megaphone");
      } else {
        // EVENTS TAB
        bodyHtml = events.length ? '<div>' + events.map(ev => {
          const dt = ev.start_at ? new Date(ev.start_at) : new Date();
          const mon = dt.toLocaleDateString("en-GB", { month: "short" });
          const day = dt.getDate();
          const timeStr = ev.all_day ? "All day" : dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            + (ev.end_at ? " – " + new Date(ev.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
          const audLabel = ev.audience === "department" ? ("Dept: " + (ev.department_name || ""))
            : ev.audience === "branch" ? ("Branch: " + (ev.branch_name || ""))
            : ev.audience === "role" ? ("Role: " + (ev.role_slug || ""))
            : "All Staff";
          const rsvp = ev.rsvp || { going: 0, maybe: 0, declined: 0, my_status: null, going_names: [] };
          const del = ev.deliveries || { email_sent: 0, sms_sent: 0 };

          return '<div class="event-card">'
            + '<div class="event-date-badge"><div class="mon">' + esc(mon) + '</div><div class="num">' + day + '</div></div>'
            + '<div style="flex:1;min-width:0">'
            + '  <div class="row-between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">'
            + '    <div>'
            + '      <div class="row" style="gap:8px;flex-wrap:wrap">'
            + '        <span class="chip purple" style="text-transform:capitalize">' + esc((ev.category || "event").replace(/_/g, " ")) + '</span>'
            + '        <span class="chip teal">' + esc(audLabel) + '</span>'
            +          (ev.send_email ? '<span class="channel-pill active">' + icon("mail", 12) + ' Email' + (del.email_sent ? " (" + del.email_sent + ")" : "") + '</span>' : '')
            +          (ev.send_sms ? '<span class="channel-pill active">' + icon("message", 12) + ' SMS' + (del.sms_sent ? " (" + del.sms_sent + ")" : "") + '</span>' : '')
            + '      </div>'
            + '      <h3 style="font-family:var(--serif);font-size:21px;font-weight:500;margin-top:7px">' + esc(ev.title) + '</h3>'
            + '      <div class="row small muted" style="gap:14px;margin-top:4px;flex-wrap:wrap">'
            + '        <span class="row" style="gap:5px">' + icon("clock", 13) + ' ' + fmtDate(ev.start_at) + ' · ' + esc(timeStr) + '</span>'
            +          (ev.location ? '<span class="row" style="gap:5px">' + icon("mapPin", 13) + ' ' + esc(ev.location) + '</span>' : '')
            +          (ev.meeting_url ? '<a class="link row" style="gap:4px" href="' + esc(ev.meeting_url) + '" target="_blank" rel="noopener">' + icon("link", 13) + ' Join online</a>' : '')
            + '      </div>'
            + '    </div>'
            + '    <div class="row" style="gap:6px">'
            +        (canManage ? '<button class="btn btn-sm btn-ghost" data-remind-ev="' + ev.id + '">' + icon("send", 13) + ' Email/SMS Reminder</button>' : '')
            +        (canManage ? '<button class="btn btn-sm btn-ghost" data-edit-ev="' + ev.id + '">' + icon("edit", 13) + '</button>' : '')
            +        (canManage ? '<button class="btn btn-sm btn-ghost" data-del-ev="' + ev.id + '">' + icon("trash", 13) + '</button>' : '')
            + '    </div>'
            + '  </div>'
            +    (ev.description ? '<p class="small" style="color:var(--ink-3);margin-top:10px;line-height:1.55">' + esc(ev.description) + '</p>' : '')
            + '  <div class="row-between" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line);flex-wrap:wrap;gap:10px">'
            + '    <div class="tiny muted">'
            + '      <b>' + rsvp.going + ' going</b> · ' + rsvp.maybe + ' maybe'
            +        (rsvp.going_names && rsvp.going_names.length ? ' (' + esc(rsvp.going_names.slice(0, 3).join(", ")) + (rsvp.going > 3 ? " +" + (rsvp.going - 3) : "") + ')' : '')
            +        (ev.last_reminded_at ? ' · Last reminder ' + timeAgo(ev.last_reminded_at) : '')
            + '    </div>'
            +      (Store.user.employee_id && !Store.isReadOnly()
                    ? '<div class="rsvp-group" data-rsvp-ev="' + ev.id + '">'
                      + '<button class="rsvp-btn going ' + (rsvp.my_status === "going" ? "active" : "") + '" data-rsvp="going">Going</button>'
                      + '<button class="rsvp-btn maybe ' + (rsvp.my_status === "maybe" ? "active" : "") + '" data-rsvp="maybe">Maybe</button>'
                      + '<button class="rsvp-btn declined ' + (rsvp.my_status === "declined" ? "active" : "") + '" data-rsvp="declined">Can\'t make it</button>'
                      + '</div>'
                    : '')
            + '  </div>'
            + '</div></div>';
        }).join("") + '</div>' : emptyState("No company events scheduled", "Schedule town halls, trainings, and celebrations with Email & SMS invites.", "calendar");
      }

      root.innerHTML = '<div class="page-enter">'
        + pageHead("Announcements & Events", "Company-wide broadcasts, town halls, and targeted Email & SMS communications.", headActions, "Communications")
        + gatewayStrip
        + '<div class="tabs" style="margin-bottom:18px">'
        + '  <button class="tab ' + (tab === "announcements" ? "active" : "") + '" data-ctab="announcements">Announcements<span class="count">' + anns.length + '</span></button>'
        + '  <button class="tab ' + (tab === "events" ? "active" : "") + '" data-ctab="events">Company Events<span class="count">' + events.length + '</span></button>'
        + '</div>'
        + bodyHtml
        + '</div>';

      root.querySelectorAll("[data-ctab]").forEach(b => b.onclick = () => { tab = b.dataset.ctab; render(); });

      if (root.querySelector("#btn-new-ann")) root.querySelector("#btn-new-ann").onclick = () => openAnnouncementComposer(null, gw, render);
      if (root.querySelector("#btn-new-event")) root.querySelector("#btn-new-event").onclick = () => { tab = "events"; openEventComposer(null, gw, render); };

      root.querySelectorAll("[data-edit-ann]").forEach(b => b.onclick = () => {
        const item = anns.find(x => String(x.id) === String(b.dataset.editAnn));
        if (item) openAnnouncementComposer(item, gw, render);
      });
      root.querySelectorAll("[data-bcast-ann]").forEach(b => b.onclick = () => {
        const item = anns.find(x => String(x.id) === String(b.dataset.bcastAnn));
        if (item) openBroadcastReminderModal("announcement", item, gw, render);
      });
      root.querySelectorAll("[data-del-ann]").forEach(b => b.onclick = () => confirmDialog("Delete announcement", "Delete this announcement permanently?", async () => {
        await API.del("/announcements/" + b.dataset.delAnn); toast("Announcement deleted", "success"); render();
      }, { danger: true }));

      root.querySelectorAll("[data-edit-ev]").forEach(b => b.onclick = () => {
        const item = events.find(x => String(x.id) === String(b.dataset.editEv));
        if (item) openEventComposer(item, gw, render);
      });
      root.querySelectorAll("[data-remind-ev]").forEach(b => b.onclick = () => {
        const item = events.find(x => String(x.id) === String(b.dataset.remindEv));
        if (item) openBroadcastReminderModal("event", item, gw, render);
      });
      root.querySelectorAll("[data-del-ev]").forEach(b => b.onclick = () => confirmDialog("Delete event", "Cancel and delete this company event?", async () => {
        await API.del("/events/" + b.dataset.delEv); toast("Event deleted", "success"); render();
      }, { danger: true }));

      root.querySelectorAll("[data-rsvp-ev] [data-rsvp]").forEach(btn => btn.onclick = async () => {
        const evid = btn.closest("[data-rsvp-ev]").dataset.rsvpEv;
        try {
          await API.post("/events/" + evid + "/rsvp", { status: btn.dataset.rsvp });
          toast("RSVP updated: " + btn.dataset.rsvp, "success");
          render();
        } catch (err) { handleErr(err); }
      });

    } catch (err) {
      root.innerHTML = pageHead("Announcements & Events", "Error") + emptyState("Unable to load communications", err.message, "alert");
    }
  }

  await render();
};
