/* ============================================================ OPERATIONS HUB
   Complete Operations module with sub-grouping tabs:
   - Dashboard
   - Assets register
   - Helpdesk / tickets
   - Fleet & Logistics (placeholder: work spaces, rooms, fleet items)
   - Announcements & Events
   - Health & Safety (policies, incidents)
   - Operations settings
================================================================ */
const opsState = { tab: "dashboard" };

Views.operations = async function (root, params) {
  const sub = params && params[0];
  const validTabs = ["dashboard", "assets", "helpdesk", "announcements", "incidents", "settings"];
  opsState.tab = (sub && validTabs.includes(sub)) ? sub : "dashboard";
  root.innerHTML = pageHead("Operations", "Loading operations workspace…") + spinners(4);
  try {
    const [assetRes, assignRes, tktRes, annRes, evRes, empRes] = await Promise.all([
      API.get("/assets", { per_page: 200 }),
      API.get("/asset-assignments", { per_page: 200 }),
      API.get("/tickets", { per_page: 300 }),
      API.get("/announcements", { per_page: 20 }),
      API.get("/events"),
      API.get("/employees", { per_page: 500 }),
    ]);
    const assets = assetRes.data, assignments = assignRes.data;
    const tickets = tktRes.data;
    const announcements = annRes.data;
    const events = evRes.data;
    const employees = empRes.data;

    const openTickets = tickets.filter(t => ["open", "in_progress"].includes(t.status));
    const pendingHigh = tickets.filter(t => t.priority === "high" && t.status !== "closed" && t.status !== "resolved");
    const availableAssets = assets.filter(a => a.status === "available").length;
    const assignedAssets = assets.filter(a => a.status === "assigned").length;
    const totalAssetValue = assets.reduce((s, a) => s + Number(a.value || 0), 0);
    const upcomingEvents = events.filter(ev => ev.status !== "cancelled" && ev.start_at && new Date(ev.start_at) >= new Date(Date.now() - 86400000)).slice(0, 5);

    const tabs = [
      ["dashboard", "Overview"],
      ["assets", "Assets"],
      ["helpdesk", "Helpdesk"],
      ["announcements", "Announcements & Events"],
      ["incidents", "Health & Safety"],
      ["settings", "Ops settings"],
    ];

    let body = "";
    if (opsState.tab === "dashboard") {
      const recentTickets = tickets.slice(0, 6);
      const recentAssets = assets.slice(0, 6);
      body = '<div class="grid grid-4" style="margin-bottom:18px">'
        + kpiCard({ label: "Open tickets", value: openTickets.length, icon: "lifebuoy", tone: "accent", foot: pendingHigh.length + " high priority" })
        + kpiCard({ label: "Assets assigned", value: assignedAssets, icon: "laptop", tone: "teal", foot: availableAssets + " available" })
        + kpiCard({ label: "Asset book value", value: compactMoney(totalAssetValue), icon: "wallet", tone: "purple", foot: assets.length + " registered" })
        + kpiCard({ label: "Upcoming events", value: upcomingEvents.length, icon: "calendar", tone: "blue", foot: "Next 45 days" })
        + '</div>'
        + '<div class="grid grid-3" style="margin-bottom:18px">'
        + '<div class="card span-2"><div class="card-head"><div><h3>Open helpdesk tickets</h3><div class="sub">Priority queue across HR, IT and Operations</div></div><div class="right"><span class="link" data-opstab="helpdesk">Open helpdesk →</span></div></div><div class="card-body">'
        + (recentTickets.length
            ? '<div class="stack" style="gap:0">' + recentTickets.slice(0, 5).map(t =>
                '<div class="list-row" style="cursor:pointer" data-op-ticket="' + t.id + '">'
                + avatarHTML(t.employee_name || "Staff", "avatar-sm")
                + '<div class="body"><b>' + esc(t.subject) + '</b><span>#' + t.id + ' · ' + esc(t.category) + ' · ' + timeAgo(t.created_at) + '</span></div>'
                + chip(t.priority === "high" ? "high" : (t.priority === "low" ? "low" : "medium"), t.priority)
                + chip(t.status)
                + '</div>'
              ).join("") + '</div>'
            : emptyState("Inbox clear", "No open tickets."))
        + '</div></div>'
        + '<div class="card"><div class="card-head"><div><h3>Asset status</h3><div class="sub">Inventory at a glance</div></div></div><div class="card-body stack">'
        + barList([
            { name: "Assigned", value: assignedAssets },
            { name: "Available", value: availableAssets },
            { name: "Maintenance", value: assets.filter(a => a.status === "maintenance").length },
            { name: "Retired", value: assets.filter(a => a.status === "retired").length },
          ], "var(--teal)")
        + '<div class="divider"></div><div class="row-between tiny muted"><span>Total book value</span><b style="color:var(--ink);font-family:var(--serif);font-size:18px;font-weight:500">' + money(totalAssetValue) + '</b></div>'
        + '</div></div>'
        + '</div>'
        + '<div class="grid grid-2">'
        + '<div class="card"><div class="card-head"><div><h3>Upcoming company events</h3><div class="sub">Announcements & operations calendar</div></div><div class="right"><span class="link" data-opstab="announcements">All events →</span></div></div><div class="card-body">'
        + (upcomingEvents.length
            ? upcomingEvents.slice(0, 5).map(ev => '<div class="list-row"><div class="event-date-badge" style="width:46px;flex:0 0 46px"><div class="mon" style="font-size:8px">' + (ev.start_at ? new Date(ev.start_at).toLocaleString("en-GB", { month: "short" }) : "—") + '</div><div class="num" style="font-size:18px">' + (ev.start_at ? new Date(ev.start_at).getDate() : "—") + '</div></div><div class="body"><b>' + esc(ev.title) + '</b><span>' + fmtDateTime(ev.start_at) + (ev.location ? " · " + esc(ev.location) : "") + '</span></div></div>').join("")
            : emptyState("Nothing scheduled", "Events will appear here."))
        + '</div></div>'
        + '<div class="card"><div class="card-head"><div><h3>Recent activity</h3><div class="sub">Latest operations actions</div></div></div><div class="card-body stack">'
        + (assets.length
            ? assets.slice(-3).reverse().map(a => '<div class="list-row"><div class="kpi-icon teal" style="width:30px;height:30px">' + icon("laptop", 14) + '</div><div class="body"><b>' + esc(a.name) + '</b><span class="mono tiny">' + esc(a.tag) + '</span></div>' + chip(a.status) + '</div>').join("")
            : "")
        + (tickets.slice(0, 2).map(t => '<div class="list-row"><div class="kpi-icon accent" style="width:30px;height:30px">' + icon("lifebuoy", 14) + '</div><div class="body"><b>' + esc(t.subject) + '</b><span>#' + t.id + ' · ' + timeAgo(t.created_at) + '</span></div>' + chip(t.status) + '</div>').join(""))
        + '</div></div>'
        + '</div>';

    } else if (opsState.tab === "assets") {
      body = '<div class="grid grid-4" style="margin-bottom:18px">'
        + kpiCard({ label: "Registered", value: assets.length, icon: "laptop", tone: "teal", foot: "All categories" })
        + kpiCard({ label: "Assigned", value: assignedAssets, icon: "user", tone: "blue", foot: "In employee hands" })
        + kpiCard({ label: "Available", value: availableAssets, icon: "checkCircle", tone: "accent", foot: "Ready to issue" })
        + kpiCard({ label: "Book value", value: compactMoney(totalAssetValue), icon: "wallet", tone: "purple", foot: "Purchase value" })
        + '</div>'
        + renderTable({
            id: "ops-assets",
            title: "Asset register",
            sub: "IT equipment, furniture and vehicles tracked across the organisation",
            filters: [
              { key: "category", label: "Category" },
              { key: "status", label: "Status" },
            ],
            columns: [
              { label: "Asset", render: r => '<div class="row"><div class="kpi-icon" style="width:32px;height:32px">' + icon("laptop", 15) + '</div><div><b>' + esc(r.name) + '</b><div class="tiny muted mono">' + esc(r.tag) + '</div></div></div>' },
              { label: "Category", render: r => '<span class="pill-tag">' + esc(r.category || "other") + '</span>' },
              { label: "Serial", render: r => '<span class="mono tiny">' + esc(r.serial_no || "—") + '</span>' },
              { label: "Purchased", render: r => fmtDate(r.purchase_date) },
              { label: "Value", sortValue: r => Number(r.value || 0), render: r => money(r.value || 0) },
              { label: "Status", render: r => chip(r.status) },
            ],
            rows: assets, emptyTitle: "No assets",
          });
    } else if (opsState.tab === "helpdesk") {
      body = '<div class="grid grid-4" style="margin-bottom:18px">'
        + kpiCard({ label: "Open", value: tickets.filter(t => t.status === "open").length, icon: "inbox", tone: "accent" })
        + kpiCard({ label: "In progress", value: tickets.filter(t => t.status === "in_progress").length, icon: "clock", tone: "blue" })
        + kpiCard({ label: "Resolved", value: tickets.filter(t => t.status === "resolved").length, icon: "checkCircle", tone: "teal" })
        + kpiCard({ label: "High priority", value: pendingHigh.length, icon: "alert", tone: "red", foot: "Pending response" })
        + '</div>'
        + renderTable({
            id: "ops-tickets",
            title: "Helpdesk tickets",
            sub: "HR, IT, facilities and confidential grievances",
            dateField: "created_at",
            dateLabel: "Opened",
            filters: [
              { key: "category", label: "Category" },
              { key: "priority", label: "Priority" },
              { key: "status", label: "Status" },
            ],
            columns: [
              { label: "Ticket", render: r => '<b>' + esc(r.subject) + '</b><div class="tiny muted">#' + r.id + ' · ' + esc(r.employee_name || "—") + '</div>' },
              { label: "Priority", render: r => chip(r.priority) },
              { label: "Status", render: r => chip(r.status) },
              { label: "Opened", render: r => timeAgo(r.created_at) },
            ],
            rows: tickets, emptyTitle: "No tickets",
          });
    } else if (opsState.tab === "announcements") {
      body = '<div class="card"><div class="card-head"><div><h3>Announcements</h3><div class="sub">Company-wide broadcasts owned by Operations / HR</div></div></div><div class="card-body">'
        + (announcements.length ? announcements.map(a => '<div class="announcement"><div class="meta">' + icon("megaphone", 12) + '<span>' + fmtDateTime(a.publish_at || a.created_at) + '</span></div><h4>' + esc(a.title) + '</h4><p>' + esc((a.body || "").slice(0, 200)) + '</p></div>').join("") : emptyState("No announcements", ""))
        + '</div></div>';
    } else if (opsState.tab === "incidents") {
      body = '<div class="card card-pad">'
        + emptyState("Health & safety module", "Incident logging and near-miss reporting will be activated in the next release. Use the Helpdesk to raise facilities or safety issues for now.", "shield")
        + '<div class="row" style="justify-content:center;margin-top:14px"><button class="btn btn-ghost" data-opstab="helpdesk">' + icon("lifebuoy", 14) + " Open helpdesk</button></div>"
        + '</div>';
    } else {
      body = '<div class="grid grid-2">'
        + '<div class="card"><div class="card-head"><h3>Operations preferences</h3></div><div class="card-body"><dl class="kv">'
        + '<dt>Default asset condition</dt><dd>Good</dd>'
        + '<dt>Ticket SLA</dt><dd>24 hours (first response)</dd>'
        + '<dt>High priority routing</dt><dd>Head of Operations & HR</dd>'
        + '<dt>Inventory audit</dt><dd>Quarterly</dd>'
        + '</dl></div></div>'
        + '<div class="card"><div class="card-head"><h3>Announcement defaults</h3></div><div class="card-body stack">'
        + '<div class="channel-box"><div class="row-between"><b>Channels</b><span class="tiny muted">In-App always enabled</span></div>'
        + '<div class="row" style="gap:18px;margin-top:8px">'
        + switchHTML('id="ops-email"', true, "Email")
        + switchHTML('id="ops-sms"', false, "SMS")
        + '</div></div>'
        + '<p class="small muted">Full company branding, SMTP and SMS settings are configured under Settings → Company & Defaults.</p>'
        + '<button class="btn btn-accent" onclick="go(\'settings/company\')">' + icon("sliders", 14) + " Open company settings</button>"
        + '</div></div>'
        + '</div>';
    }

    root.innerHTML = pageHead("Operations", "Assets, helpdesk, facilities, announcements and company events.",
      '<button class="btn btn-ghost" id="ops-ticket">' + icon("lifebuoy", 15) + " New ticket</button>"
      + '<button class="btn btn-accent" id="ops-asset">' + icon("plus", 15) + " Register asset</button>",
      "Operations")
      + '<div class="tabs" style="margin-bottom:18px">' + tabs.map(t => '<button class="tab ' + (opsState.tab === t[0] ? "active" : "") + '" data-opstab="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>'
      + '<div class="page-enter">' + body + '</div>';

    root.querySelectorAll("[data-opstab]").forEach(b => b.onclick = () => {
      const tab = b.dataset.opstab;
      opsState.tab = tab;
      // Keep the URL and the sidebar sub-links in sync with the active tab
      go(tab === "dashboard" ? "operations" : "operations/" + tab);
    });
    const at = root.querySelector("#ops-ticket"); if (at) at.onclick = openTicketForm;
    const aa = root.querySelector("#ops-asset"); if (aa) aa.onclick = openAssetForm;
  } catch (e) {
    root.innerHTML = pageHead("Operations", "Unavailable") + emptyState("Could not load operations", e.message, "alert");
  }
};

// color alias for red tone in kpi icon (kpi-icon.red uses red-soft)
document.addEventListener("DOMContentLoaded", () => {
  // ensure red kpi icon class exists; it already maps via CSS .kpi-icon
});
