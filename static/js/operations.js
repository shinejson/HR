/* ============================================================ HOTEL OPERATIONS HUB
   In-Built Operations Department Dashboard & Management System.
   Tailored specifically for Hotel Operations:
   - Role & Permission-based access control (Operations Department,
     super_admin, operations_manager, operations_officer, hr_admin)
   - Executive Operations Dashboard matching OpsFlow design:
     * Top KPIs (Inventory Value, Work Orders, SLA Rate, Low Stock Alerts)
     * Storeroom & Pantry Inventory Levels & Utilization
     * Daily Supplies Movement (Stock In from Vendors vs Stock Out to Floors)
     * Service & Work Order Fulfillment Status Donut
     * Hotel Supplies Low Stock Alerts with Quick Restock
     * Hotel Service Pipeline (Suppliers -> Central Receiving -> Storerooms -> Floor Service)
     * Service SLA On-Time Turnaround Performance
     * Hotel Wings & Room Readiness Board
     * Live Operations Activity Feed
   - Comprehensive Subtabs:
     * Overview Dashboard
     * Supplies & Inventory Register
     * Work Orders Queue
     * Storerooms & Hubs
     * Wings & Room Readiness
     * Equipment Assets
     * Health & Safety
     * Ops Settings
================================================================ */

const opsState = {
  tab: "dashboard",
  period: "this_month",
  inventoryFilter: "all",
  inventorySearch: "",
  workOrderFilter: "all",
  workOrderWing: "all",
  storeroomFilter: "all",
  storeroomSearch: "",
  selectedHubId: null,
  maintenanceSearch: "",
  maintenanceStatus: "",
  maintenanceFrom: "",
  maintenanceTo: "",
};

Views.operations = async function (root, params) {
  // 1. Check Role & Permission & Department Access
  if (!Store.canOperations || !Store.canOperations()) {
    root.innerHTML = pageHead("Hotel Operations", "Restricted Area", "", "Department")
      + '<div class="card card-pad" style="max-width:640px;margin:32px auto;text-align:center;box-shadow:var(--shadow)">'
      + '<div class="kpi-icon red" style="width:58px;height:58px;margin:0 auto 16px;border-radius:18px">'
      + icon("alert", 26) + '</div>'
      + '<h2 style="font-family:var(--serif);font-size:22px;margin:0 0 10px;color:var(--ink)">Access Restricted: Hotel Operations Department</h2>'
      + '<p style="color:var(--muted);font-size:13.5px;line-height:1.6;margin-bottom:22px">'
      + 'You are currently signed in as <b>' + esc((Store.user && Store.user.name) || "Staff Member") + '</b> ('
      + esc((Store.user && Store.user.role) || "Employee") + ' · '
      + esc((Store.user && Store.user.department) || "No department assigned") + ').<br>'
      + 'The <b>Hotel Operations Dashboard</b> is restricted to members of the <b>Operations Department</b>, Hotel General Managers, and accounts with the <code>operations</code> permission.'
      + '</p>'
      + '<div class="row" style="justify-content:center;gap:12px">'
      + '<button class="btn btn-accent" onclick="go(\'dashboard\')">' + icon("home", 14) + ' Return to General Overview</button>'
      + '<button class="btn btn-ghost" onclick="go(\'profile\')">' + icon("user", 14) + ' View My Profile</button>'
      + '</div>'
      + '</div>';
    return;
  }

  const sub = params && params[0];
  const validTabs = ["dashboard", "inventory", "workorders", "maintenance", "storerooms", "readiness", "assets", "safety", "settings"];
  opsState.tab = (sub && validTabs.includes(sub)) ? sub : "dashboard";

  root.innerHTML = pageHead("Hotel Operations", "Loading operations workspace…", "", "Department") + spinners(4);

  try {
    // Fetch data in parallel
    const [dashRes, invRes, woRes, storeRes, assetRes, maintenanceRes] = await Promise.all([
      API.get("/operations/dashboard", { period: opsState.period }),
      API.get("/operations/inventory"),
      API.get("/operations/work-orders"),
      API.get("/operations/storerooms"),
      API.get("/assets", { per_page: 200 }),
      opsState.tab === "maintenance"
        ? API.get("/operations/maintenance", maintenanceApiFilters())
        : Promise.resolve({ data: [] }),
    ]);

    const dash = (dashRes && dashRes.data) || {};
    const inventory = (invRes && invRes.data) || [];
    const workOrders = (woRes && woRes.data) || [];
    const storerooms = (storeRes && storeRes.data) || [];
    const assets = (assetRes && assetRes.data) || [];
    const maintenanceWorks = (maintenanceRes && maintenanceRes.data) || [];

    const tabs = [
      ["dashboard", "Overview"],
      ["inventory", "Supplies & Inventory"],
      ["workorders", "Work Orders"],
      ["maintenance", "Maintenance"],
      ["storerooms", "Storerooms & Hubs"],
      ["readiness", "Wings & Readiness"],
      ["assets", "Assets Register"],
      ["safety", "Health & Safety"],
      ["settings", "Ops Settings"],
    ];

    let body = "";

    // ============================================================ TAB: DASHBOARD
    if (opsState.tab === "dashboard") {
      const kpis = dash.kpis || {};
      const userName = (Store.user && Store.user.name) ? Store.user.name.split(" ")[0] : "Operations Team";

      // 1. Welcome Banner matching image 1
      const bannerHTML = '<div class="ops-banner">'
        + '<div class="greeting">'
        + avatarHTML((Store.user && Store.user.name) || "Emma Johnson", "avatar-md")
        + '<div>'
        + '<h2>Good morning, ' + esc(userName) + ' <span style="font-style:normal">👋</span></h2>'
        + '<div class="sub">Here\'s what\'s happening with hotel operations today · Grand Meridian Hotel</div>'
        + '</div></div>'
        + '<div class="controls">'
        + '<div class="ops-period-select">' + icon("calendar", 13)
        + '<select id="ops-period-dropdown">'
        + '<option value="today"' + (opsState.period === "today" ? " selected" : "") + '>Today (Live)</option>'
        + '<option value="this_week"' + (opsState.period === "this_week" ? " selected" : "") + '>This Week</option>'
        + '<option value="this_month"' + (opsState.period === "this_month" ? " selected" : "") + '>This Month</option>'
        + '<option value="last_30_days"' + (opsState.period === "last_30_days" ? " selected" : "") + '>Last 30 Days</option>'
        + '</select></div>'
        + '<button class="btn btn-ghost" id="ops-btn-quick-restock">' + icon("zap", 14) + ' Restock Supplies</button>'
        + '<button class="btn btn-accent" id="ops-btn-quick-wo">' + icon("plus", 14) + ' New Work Order</button>'
        + '</div>'
        + '</div>';

      // 2. Top 4 KPI Cards matching image 1
      const kpiRow = '<div class="grid grid-4" style="margin-bottom:20px">'
        + '<div class="card kpi"><div class="kpi-top"><div>'
        + '<div class="kpi-label">Total Inventory Value</div>'
        + '<div class="kpi-value" style="font-family:var(--serif);font-size:25px;font-weight:600">' + esc(kpis.inventory_value_formatted || "$184,520") + '</div>'
        + '</div><div class="kpi-icon teal">' + icon("box", 18) + '</div></div>'
        + '<div class="kpi-foot"><span class="kpi-delta up">↑ 12%</span><span class="kpi-delta-sub">vs last month</span></div></div>'

        + '<div class="card kpi"><div class="kpi-top"><div>'
        + '<div class="kpi-label">Total Work Orders</div>'
        + '<div class="kpi-value" style="font-family:var(--serif);font-size:25px;font-weight:600">' + (kpis.total_orders ? kpis.total_orders.toLocaleString() : "1,842") + '</div>'
        + '</div><div class="kpi-icon blue">' + icon("clipboard", 18) + '</div></div>'
        + '<div class="kpi-foot"><span class="kpi-delta up">↑ 8%</span><span class="kpi-delta-sub">vs last month</span></div></div>'

        + '<div class="card kpi"><div class="kpi-top"><div>'
        + '<div class="kpi-label">Fulfillment Rate</div>'
        + '<div class="kpi-value" style="font-family:var(--serif);font-size:25px;font-weight:600">' + (kpis.fulfillment_rate || 96.2) + '%</div>'
        + '</div><div class="kpi-icon accent">' + icon("checkCircle", 18) + '</div></div>'
        + '<div class="kpi-foot"><span class="kpi-delta up">↑ 2.4%</span><span class="kpi-delta-sub">vs last month</span></div></div>'

        + '<div class="card kpi"><div class="kpi-top"><div>'
        + '<div class="kpi-label">Low Stock Items</div>'
        + '<div class="kpi-value" style="font-family:var(--serif);font-size:25px;font-weight:600;color:var(--red)">' + (kpis.low_stock_items || 14) + '</div>'
        + '</div><div class="kpi-icon red">' + icon("alert", 18) + '</div></div>'
        + '<div class="kpi-foot"><span class="kpi-delta down">↓ 33%</span><span class="kpi-delta-sub">vs last month</span></div></div>'
        + '</div>';

      // 3. Row 1: Storeroom Inventory Levels (Left) & Stock Movement Chart (Right)
      const storeroomsList = dash.storerooms || [];
      const stockMovement = dash.stock_movement || { labels: [], stock_in: [], stock_out: [] };

      const storeroomTableHTML = '<div class="card span-2"><div class="card-head">'
        + '<div><h3>Inventory Levels by Storeroom</h3><div class="sub">Active hotel inventory across floors and central stores</div></div>'
        + '<div class="right"><span class="link" data-opstab="storerooms">View All Storerooms →</span></div>'
        + '</div><div class="card-body" style="padding:10px 18px">'
        + '<table class="storeroom-table">'
        + '<thead><tr>'
        + '<th>Storeroom</th>'
        + '<th>Items</th>'
        + '<th>In Stock</th>'
        + '<th>Low Stock</th>'
        + '<th style="width:130px">Utilization</th>'
        + '</tr></thead>'
        + '<tbody>'
        + storeroomsList.slice(0, 5).map(s => {
            const barTone = s.utilization > 85 ? "var(--teal)" : (s.utilization > 70 ? "var(--blue)" : "var(--accent)");
            return '<tr>'
              + '<td><div class="row" style="gap:8px"><span>' + icon("mapPin", 13) + '</span><div><b>' + esc(s.name) + '</b><div class="tiny muted">' + esc(s.location) + '</div></div></div></td>'
              + '<td>' + s.items.toLocaleString() + '</td>'
              + '<td>' + s.in_stock.toLocaleString() + '</td>'
              + '<td><span class="chip ' + (s.low_stock > 3 ? "red" : "amber") + '">' + s.low_stock + '</span></td>'
              + '<td><div class="row" style="gap:8px"><div class="progress" style="flex:1"><i style="width:' + s.utilization + '%;background:' + barTone + '"></i></div><b class="tiny">' + s.utilization + '%</b></div></td>'
              + '</tr>';
          }).join("")
        + '</tbody></table>'
        + '</div></div>';

      // Custom Dual Bar Chart for Stock Movement
      const chartHTML = '<div class="card span-2"><div class="card-head">'
        + '<div><h3>Stock Movement</h3><div class="sub">Supplies Received (Stock In) vs Issued to Floors (Stock Out)</div></div>'
        + '<div class="right"><div class="row" style="gap:14px">'
        + '<div class="row" style="gap:6px;font-size:11.5px"><span style="width:8px;height:8px;border-radius:2px;background:#3b82f6;display:inline-block"></span><span class="muted">Stock In</span></div>'
        + '<div class="row" style="gap:6px;font-size:11.5px"><span style="width:8px;height:8px;border-radius:2px;background:#10b981;display:inline-block"></span><span class="muted">Stock Out</span></div>'
        + '</div></div>'
        + '</div><div class="card-body">'
        + renderStockMovementSVG(stockMovement)
        + '</div></div>';

      const row1 = '<div class="grid grid-4" style="margin-bottom:20px">' + storeroomTableHTML + chartHTML + '</div>';

      // 4. Row 2: Order Fulfillment Donut (Left) & Low Stock Alerts (Right)
      const woStatus = dash.work_order_status || { total: 1842, items: [] };
      const lowStockAlerts = dash.low_stock_alerts || [];

      const fulfillmentDonutHTML = '<div class="card span-2" style="display:flex;flex-direction:column">'
        + '<div class="card-head">'
        + '<div><h3>Service & Work Order Fulfillment</h3><div class="sub">Current monthly turnover and guest requests breakdown</div></div>'
        + '<div class="right"><span class="pill-tag">' + esc((opsState.period || "this_month").replace("_", " ").toUpperCase()) + '</span></div>'
        + '</div><div class="card-body" style="display:flex;align-items:center;justify-content:center;flex:1;padding:22px 20px">'
        + '<div class="donut-stat-row">'
        + '<div style="position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        + donut(woStatus.items, 150)
        + '<div style="position:absolute;text-align:center;pointer-events:none">'
        + '<div style="font-family:var(--serif);font-size:22px;font-weight:700;color:var(--ink);line-height:1.1">' + (woStatus.total ? woStatus.total.toLocaleString() : "1,842") + '</div>'
        + '<div class="tiny muted" style="font-weight:500;margin-top:2px">Total Orders</div>'
        + '</div>'
        + '</div>'
        + '<div class="donut-legend">'
        + woStatus.items.map(item =>
            '<div class="donut-legend-item" style="cursor:pointer" title="View ' + esc(item.label) + ' work orders" data-filter-wo="' + (item.status || "") + '">'
            + '<div class="legend-left"><span class="legend-dot" style="background:' + item.color + '"></span><span style="font-weight:500">' + esc(item.label) + '</span></div>'
            + '<div style="display:flex;align-items:center"><span class="legend-val">' + item.value.toLocaleString() + '</span><span class="legend-pct">' + item.pct + '%</span></div>'
            + '</div>'
          ).join("")
        + '</div>'
        + '</div>'
        + '</div></div>';

      const lowStockCardHTML = '<div class="card span-2" style="display:flex;flex-direction:column">'
        + '<div class="card-head">'
        + '<div><h3>Low Stock Alerts</h3><div class="sub">Hotel consumables and guest amenities below par levels</div></div>'
        + '<div class="right"><span class="link" data-opstab="inventory" style="cursor:pointer">View All Supplies →</span></div>'
        + '</div><div class="card-body" style="padding:6px 14px 10px;flex:1;display:flex;flex-direction:column;justify-content:center">'
        + '<div class="low-stock-wrap">'
        + '<table class="low-stock-table">'
        + '<thead><tr>'
        + '<th style="min-width:180px">Item Description</th>'
        + '<th>SKU</th>'
        + '<th>Current</th>'
        + '<th>Reorder Level</th>'
        + '<th style="text-align:right">Action</th>'
        + '</tr></thead>'
        + '<tbody>'
        + (lowStockAlerts.length ? lowStockAlerts.slice(0, 5).map(item => {
            const ratio = item.current / Math.max(item.reorder_level, 1);
            const tone = ratio <= 0.4 ? "red" : (ratio <= 0.8 ? "amber" : "blue");
            return '<tr>'
              + '<td><div class="row" style="gap:10px;align-items:center;min-width:180px">'
              + '<div class="kpi-icon ' + tone + '" style="width:30px;height:30px;border-radius:8px;flex-shrink:0">' + icon(item.icon || "box", 14) + '</div>'
              + '<div><div style="font-weight:600;font-size:12.5px;color:var(--ink);line-height:1.25">' + esc(item.name) + '</div><div class="tiny muted" style="margin-top:2px">' + esc(item.location) + '</div></div>'
              + '</div></td>'
              + '<td class="sku-cell"><span class="chip-plain mono tiny">' + esc(item.sku) + '</span></td>'
              + '<td class="current-cell"><span class="chip red" style="font-weight:600">● ' + item.current + ' ' + esc(item.unit) + '</span></td>'
              + '<td class="reorder-cell">' + item.reorder_level + ' ' + esc(item.unit) + '</td>'
              + '<td class="action-cell"><button class="btn btn-sm btn-soft" data-quick-restock-id="' + item.id + '" style="white-space:nowrap;padding:5px 12px;font-size:11.5px">' + icon("zap", 11) + ' Restock</button></td>'
              + '</tr>';
          }).join("") : '<tr><td colspan="5" class="tiny muted" style="text-align:center;padding:24px"><div class="row" style="justify-content:center;gap:6px">' + icon("checkCircle", 16) + ' <span>All hotel items are stocked above par levels.</span></div></td></tr>')
        + '</tbody></table>'
        + '</div>'
        + '</div></div>';

      const row2 = '<div class="grid grid-4" style="margin-bottom:20px">' + fulfillmentDonutHTML + lowStockCardHTML + '</div>';

      // 5. Row 3: Hotel Operations Service Flow & SLA Turnaround Status
      const serviceFlow = dash.service_flow || [];
      const slaPerf = dash.sla_performance || { on_time_pct: 94.6, on_time: 1560, delayed: 184, exception: 98 };

      const pipelineHTML = '<div class="card span-2"><div class="card-head">'
        + '<div><h3>Hotel Operations Service Flow</h3><div class="sub">End-to-end procurement, storeroom readiness, and room turnaround</div></div>'
        + '<div class="right"><span class="link" data-opstab="readiness">Room Turnover →</span></div>'
        + '</div><div class="card-body">'
        + '<div class="ops-pipeline">'
        + serviceFlow.map((step, idx) =>
            '<div class="ops-pipeline-step">'
            + '<div class="step-icon kpi-icon ' + (step.tone || "teal") + '">' + icon(step.icon || "box", 18) + '</div>'
            + '<div class="step-count">' + step.count + '</div>'
            + '<div class="step-title">' + esc(step.title) + '</div>'
            + '<div class="step-sub">' + esc(step.status) + '</div>'
            + '</div>'
          ).join("")
        + '</div>'
        + '</div></div>';

      const slaDonutItems = [
        { label: "On Time (< 25m)", value: slaPerf.on_time, color: "#10b981" },
        { label: "Delayed (> 25m)", value: slaPerf.delayed, color: "#f59e0b" },
        { label: "Exceptions / Escalated", value: slaPerf.exception, color: "#ef4444" },
      ];

      const slaHTML = '<div class="card span-2"><div class="card-head">'
        + '<div><h3>Service SLA Performance</h3><div class="sub">Housekeeping < 25m · Maintenance < 20m · Guest Requests < 15m</div></div>'
        + '<div class="right"><span class="pill-tag green">Target: 92%</span></div>'
        + '</div><div class="card-body">'
        + '<div class="donut-stat-row">'
        + '<div style="position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        + donut(slaDonutItems, 140)
        + '<div style="position:absolute;text-align:center;pointer-events:none">'
        + '<div style="font-family:var(--serif);font-size:22px;font-weight:600;color:var(--ink);line-height:1.1">' + slaPerf.on_time_pct + '%</div>'
        + '<div class="tiny muted">On-Time SLA</div>'
        + '</div>'
        + '</div>'
        + '<div class="donut-legend">'
        + '<div class="donut-legend-item"><div class="legend-left"><span class="legend-dot" style="background:#10b981"></span><span>On Time Fulfillment</span></div><b>' + slaPerf.on_time.toLocaleString() + '</b></div>'
        + '<div class="donut-legend-item"><div class="legend-left"><span class="legend-dot" style="background:#f59e0b"></span><span>Delayed Requests</span></div><b>' + slaPerf.delayed.toLocaleString() + '</b></div>'
        + '<div class="donut-legend-item"><div class="legend-left"><span class="legend-dot" style="background:#ef4444"></span><span>Exceptions & Escalations</span></div><b>' + slaPerf.exception.toLocaleString() + '</b></div>'
        + '</div>'
        + '</div>'
        + '</div></div>';

      const row3 = '<div class="grid grid-4" style="margin-bottom:20px">' + pipelineHTML + slaHTML + '</div>';

      // 6. Row 4: Hotel Wings & Room Readiness (Left) & Recent Operations Activity (Right)
      const wings = dash.wings_performance || [];
      const activities = dash.recent_activity || [];

      const wingsHTML = '<div class="card span-2"><div class="card-head">'
        + '<div><h3>Hotel Wings & Property Readiness</h3><div class="sub">Live room occupancy, turnover status, and operational health</div></div>'
        + '<div class="right"><span class="link" data-opstab="readiness">Floor Plans →</span></div>'
        + '</div><div class="card-body" style="padding:12px 20px">'
        + '<div class="stack" style="gap:2px">'
        + wings.map(w =>
            '<div class="wing-item">'
            + '<div class="wing-info">'
            + '<div class="row" style="gap:6px">'
            + '<span style="color:' + w.color + '">' + icon("building", 13) + '</span>'
            + '<span class="wing-name">' + esc(w.wing) + '</span>'
            + '<span class="pill-tag" style="font-size:10px">' + esc(w.type) + '</span>'
            + '</div>'
            + '<div class="wing-sub">' + w.occupied + ' occupied · ' + w.turnover_in_progress + ' turnover in progress · ' + (w.total_rooms - w.occupied - w.turnover_in_progress) + ' ready</div>'
            + '</div>'
            + '<div class="wing-meter-box">'
            + '<div class="row-between tiny"><span class="muted">Readiness</span><b>' + w.readiness + '%</b></div>'
            + '<div class="wing-meter-bar"><div class="wing-meter-fill" style="width:' + w.readiness + '%;background:' + w.color + '"></div></div>'
            + '</div>'
            + '<span class="kpi-delta up tiny" style="width:48px;text-align:right">' + w.change + '</span>'
            + '</div>'
          ).join("")
        + '</div>'
        + '</div></div>';

      const activityHTML = '<div class="card span-2"><div class="card-head">'
        + '<div><h3>Recent Operations Activity</h3><div class="sub">Audit trail of deliveries, work orders, and turnover inspections</div></div>'
        + '<div class="right"><span class="link" onclick="go(\'admin/audit\')">View Audit Log →</span></div>'
        + '</div><div class="card-body" style="padding:12px 20px">'
        + '<div class="stack" style="gap:0">'
        + activities.slice(0, 5).map(a =>
            '<div class="list-row">'
            + '<div class="kpi-icon ' + (a.tone || "teal") + '" style="width:32px;height:32px;border-radius:9px;flex-shrink:0">'
            + icon(a.icon === "shopping-cart" ? "receipt" : (a.icon === "box" ? "box" : (a.icon === "alert" ? "alert" : (a.icon === "sparkle" ? "sparkle" : "sliders"))), 14)
            + '</div>'
            + '<div class="body">'
            + '<b>' + esc(a.title) + '</b>'
            + '<span>' + esc(a.desc) + '</span>'
            + '</div>'
            + '<div class="tiny muted" style="white-space:nowrap;margin-left:auto">' + esc(a.time_ago) + '</div>'
            + '</div>'
          ).join("")
        + '</div>'
        + '</div></div>';

      const row4 = '<div class="grid grid-4" style="margin-bottom:20px">' + wingsHTML + activityHTML + '</div>';

      body = bannerHTML + kpiRow + row1 + row2 + row3 + row4;

    // ============================================================ TAB: INVENTORY
    } else if (opsState.tab === "inventory") {
      const items = inventory;
      const lowCount = items.filter(i => (i.current_stock || 0) <= (i.reorder_level || 0)).length;
      const totalVal = items.reduce((s, i) => s + (Number(i.current_stock || 0) * Number(i.unit_cost || 0)), 0);

      body = '<div class="grid grid-4" style="margin-bottom:18px">'
        + kpiCard({ label: "Registered Supplies", value: items.length, icon: "box", tone: "teal", foot: "Across 6 Hotel Storerooms" })
        + kpiCard({ label: "Low Stock Items", value: lowCount, icon: "alert", tone: "red", foot: "Below Par Reorder Level" })
        + kpiCard({ label: "Total Book Value", value: compactMoney(totalVal), icon: "wallet", tone: "purple", foot: "Supplies On Hand" })
        + kpiCard({ label: "Active Suppliers", value: "18", icon: "building", tone: "blue", foot: "Vetted Hospitality Vendors" })
        + '</div>'
        + '<div class="row-between" style="margin-bottom:14px;gap:12px;flex-wrap:wrap">'
        + '<div class="row" style="gap:10px">'
        + '<input class="input" id="ops-inv-search" placeholder="Search supplies, SKU, supplier…" style="width:280px" value="' + esc(opsState.inventorySearch) + '">'
        + '<select class="select" id="ops-inv-loc" style="width:220px">'
        + '<option value="">All Storerooms & Hubs</option>'
        + storerooms.map(s => '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>').join("")
        + '</select>'
        + '</div>'
        + '<div class="row" style="gap:8px">'
        + '<button class="btn btn-ghost" id="ops-btn-add-stock">' + icon("plus", 14) + ' Receive Stock</button>'
        + '<button class="btn btn-accent" id="ops-btn-new-item">' + icon("sparkle", 14) + ' Register Supply Item</button>'
        + '</div>'
        + '</div>'
        + renderTable({
            id: "hotel-inventory-table",
            title: "Hotel Supplies & Consumables Register",
            sub: "Linens, guest amenities, F&B supplies, cleaning sanitizers, and engineering spares",
            filters: [
              { key: "category", label: "Category" },
              { key: "location", label: "Storeroom" },
              { key: "status", label: "Stock Status" },
            ],
            columns: [
              {
                label: "Supply Item",
                render: r => '<div class="row" style="gap:8px">'
                  + '<div class="kpi-icon ' + (r.status === "low_stock" ? "red" : "teal") + '" style="width:30px;height:30px;border-radius:8px">' + icon(r.icon || "box", 14) + '</div>'
                  + '<div><b>' + esc(r.name) + '</b><div class="mono tiny muted">' + esc(r.sku) + ' · ' + esc(r.supplier || "Vendor") + '</div></div>'
                  + '</div>',
              },
              { label: "Category", render: r => '<span class="pill-tag">' + esc(r.category) + '</span>' },
              { label: "Storeroom", render: r => '<span class="tiny muted">' + esc(r.location) + '</span>' },
              {
                label: "Stock Level",
                render: r => {
                  const pct = Math.min(100, Math.round((r.current_stock / (r.ideal_par_level || 100)) * 100));
                  const barColor = r.current_stock <= r.reorder_level ? "var(--red)" : "var(--teal)";
                  return '<div style="width:110px">'
                    + '<div class="row-between tiny"><b>' + r.current_stock + ' ' + esc(r.unit) + '</b><span class="muted">' + pct + '%</span></div>'
                    + '<div class="progress" style="height:5px;margin-top:3px"><i style="width:' + pct + '%;background:' + barColor + '"></i></div>'
                    + '</div>';
                },
              },
              { label: "Reorder Par", render: r => '<span class="muted">' + r.reorder_level + ' ' + esc(r.unit) + '</span>' },
              { label: "Unit Cost", render: r => money(r.unit_cost) },
              { label: "Total Value", render: r => money(r.total_value) },
              { label: "Status", render: r => chip(r.status === "low_stock" ? "red" : (r.status === "out_of_stock" ? "red" : "green"), r.status.replace("_", " ")) },
              {
                label: "", class: "right",
                render: r => '<button class="btn btn-sm btn-soft" data-adjust-stock="' + r.id + '">' + icon("zap", 12) + ' Adjust</button>',
              },
            ],
            rows: items, emptyTitle: "No inventory items found",
          });

    // ============================================================ TAB: WORK ORDERS
    } else if (opsState.tab === "workorders") {
      const orders = workOrders;
      const openCount = orders.filter(w => w.status === "open").length;
      const progCount = orders.filter(w => w.status === "in_progress").length;
      const doneCount = orders.filter(w => w.status === "completed").length;

      body = '<div class="grid grid-4" style="margin-bottom:18px">'
        + kpiCard({ label: "Open Requests", value: openCount, icon: "inbox", tone: "accent", foot: "Pending dispatch" })
        + kpiCard({ label: "In Progress", value: progCount, icon: "clock", tone: "blue", foot: "Staff on floor" })
        + kpiCard({ label: "Completed Today", value: doneCount, icon: "checkCircle", tone: "teal", foot: "Turnover verified" })
        + kpiCard({ label: "High Priority", value: orders.filter(w => w.priority === "high").length, icon: "alert", tone: "red", foot: "Urgent turnaround" })
        + '</div>'
        + '<div class="row-between" style="margin-bottom:14px">'
        + '<div class="row" style="gap:10px">'
        + '<select class="select" id="ops-wo-wing-select" style="width:200px">'
        + '<option value="">All Hotel Wings</option>'
        + '<option value="East Wing">East Wing</option>'
        + '<option value="West Wing">West Wing</option>'
        + '<option value="Penthouse">Penthouse VIP</option>'
        + '<option value="Public Areas">Public Areas & Banqueting</option>'
        + '<option value="Wellness & Pool">Wellness & Pool Pavilion</option>'
        + '</select>'
        + '</div>'
        + '<button class="btn btn-accent" id="ops-btn-new-wo-tab">' + icon("plus", 14) + ' Create Work Order</button>'
        + '</div>'
        + renderTable({
            id: "hotel-work-orders-table",
            title: "Hotel Work Orders & Service Queue",
            sub: "Housekeeping turnovers, maintenance repairs, VIP arrivals, and guest requests",
            dateField: "created_at",
            dateLabel: "Logged",
            filters: [
              { key: "category", label: "Category" },
              { key: "priority", label: "Priority" },
              { key: "status", label: "Status" },
              { key: "wing", label: "Wing" },
            ],
            columns: [
              {
                label: "Order #",
                render: r => '<b>#' + esc(r.order_no) + '</b><div class="tiny muted">' + esc(r.category) + '</div>',
              },
              {
                label: "Location / Room",
                render: r => '<div><b>' + esc(r.location) + '</b><div class="tiny muted">' + esc(r.wing) + ' · ' + esc(r.floor) + '</div></div>',
              },
              {
                label: "Details",
                render: r => '<div><b>' + esc(r.title) + '</b>' + (r.description ? '<div class="tiny muted">' + esc(r.description.slice(0, 90)) + '</div>' : "") + '</div>',
              },
              { label: "Priority", render: r => chip(r.priority === "high" ? "high" : (r.priority === "emergency" ? "red" : "medium"), r.priority) },
              { label: "Status", render: r => chip(r.status === "completed" ? "green" : (r.status === "in_progress" ? "blue" : "amber"), r.status.replace("_", " ")) },
              { label: "Assigned To", render: r => esc(r.assigned_to) },
              { label: "Time Logged", render: r => timeAgo(r.created_at) },
              {
                label: "", class: "right",
                render: r => '<select class="select ops-wo-status-select" data-wo-id="' + r.id + '" style="height:27px;font-size:11.5px;padding:2px 8px">'
                  + ["open", "in_progress", "completed", "inspected", "cancelled"].map(st =>
                      '<option value="' + st + '"' + (r.status === st ? " selected" : "") + '>' + st.replace("_", " ") + '</option>'
                    ).join("")
                  + '</select>',
              },
            ],
            rows: orders, emptyTitle: "No work orders in queue",
          });

    // ============================================================ TAB: MAINTENANCE
    } else if (opsState.tab === "maintenance") {
      const scheduledCount = maintenanceWorks.filter(w => w.status === "scheduled").length;
      const inProgressCount = maintenanceWorks.filter(w => w.status === "in_progress").length;
      const completedCount = maintenanceWorks.filter(w => w.status === "completed").length;
      const totalCharges = maintenanceWorks.reduce((sum, work) => sum + Number(work.amount || 0), 0);

      body = '<div class="grid grid-4" style="margin-bottom:18px">'
        + kpiCard({ label: "Scheduled", value: scheduledCount, icon: "calendar", tone: "blue", foot: "Planned maintenance jobs" })
        + kpiCard({ label: "In Progress", value: inProgressCount, icon: "clock", tone: "amber", foot: "Work underway" })
        + kpiCard({ label: "Completed", value: completedCount, icon: "checkCircle", tone: "teal", foot: "Completed in this view" })
        + kpiCard({ label: "Total Charges", value: money(totalCharges, "GHS"), icon: "wallet", tone: "purple", foot: "Based on current filters" })
        + '</div>'
        + '<div class="card card-pad" style="margin-bottom:16px">'
        + '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">'
        + '<div class="field" style="flex:1;min-width:220px;margin:0"><label for="ops-maint-search">Search maintenance</label><input class="input" id="ops-maint-search" value="' + esc(opsState.maintenanceSearch) + '" placeholder="Work, worker, location or remarks…"></div>'
        + '<div class="field" style="min-width:155px;margin:0"><label for="ops-maint-status">Status</label><select class="select" id="ops-maint-status"><option value="">All statuses</option>'
        + [["scheduled", "Scheduled"], ["in_progress", "In progress"], ["completed", "Completed"], ["cancelled", "Cancelled"]].map(o => '<option value="' + o[0] + '"' + (opsState.maintenanceStatus === o[0] ? " selected" : "") + '>' + o[1] + '</option>').join("")
        + '</select></div>'
        + '<div class="field" style="min-width:145px;margin:0"><label for="ops-maint-from">From date</label><input class="input" id="ops-maint-from" type="date" value="' + esc(opsState.maintenanceFrom) + '"></div>'
        + '<div class="field" style="min-width:145px;margin:0"><label for="ops-maint-to">To date</label><input class="input" id="ops-maint-to" type="date" value="' + esc(opsState.maintenanceTo) + '"></div>'
        + '<button class="btn btn-ghost" id="ops-maint-apply">Apply filters</button>'
        + '<button class="btn btn-soft" id="ops-maint-clear">Clear</button>'
        + '</div>'
        + '<div class="tiny muted" style="margin-top:10px">The selected dates, status and search are used for both the printed and emailed report.</div>'
        + '</div>'
        + renderMaintenanceTable(maintenanceWorks);

    } else if (opsState.tab === "storerooms") {
      const allStorerooms = storerooms || [];
      const totalSections = allStorerooms.reduce((acc, s) => acc + (s.sections_count || (s.sections ? s.sections.length : 0)), 0);
      const totalRooms = allStorerooms.reduce((acc, s) => acc + (s.rooms_count || (s.sections ? s.sections.filter(sec => sec.section_type === "room" || sec.room_number).length : 0)), 0);
      const totalEquipments = allStorerooms.reduce((acc, s) => acc + (s.equipment_count || 0), 0);
      const totalStockItems = allStorerooms.reduce((acc, s) => acc + (s.stock_count || 0), 0);

      // Filtering by category / type
      const stFilter = opsState.storeroomFilter || "all";
      const stSearch = (opsState.storeroomSearch || "").toLowerCase().trim();

      const filteredStorerooms = allStorerooms.filter(s => {
        if (stFilter !== "all") {
          if (stFilter === "rooms_hub" && s.hub_type !== "rooms_hub" && !s.name.toLowerCase().includes("rooms")) return false;
          if (stFilter === "central_storeroom" && s.hub_type !== "central_storeroom" && !s.name.toLowerCase().includes("linen") && !s.name.toLowerCase().includes("central")) return false;
          if (stFilter === "pantry" && s.hub_type !== "pantry" && !s.name.toLowerCase().includes("pantry")) return false;
          if (stFilter === "fnb_store" && s.hub_type !== "fnb_store" && !s.name.toLowerCase().includes("f&b") && !s.name.toLowerCase().includes("bar")) return false;
          if (stFilter === "engineering_store" && s.hub_type !== "engineering_store" && !s.name.toLowerCase().includes("engineering") && !s.name.toLowerCase().includes("facilities")) return false;
        }
        if (stSearch) {
          const matchName = (s.name || "").toLowerCase().includes(stSearch);
          const matchLoc = (s.location || "").toLowerCase().includes(stSearch);
          const matchCode = (s.code || "").toLowerCase().includes(stSearch);
          const matchSec = (s.sections || []).some(sec => 
            (sec.name || "").toLowerCase().includes(stSearch) ||
            (sec.room_number || "").toLowerCase().includes(stSearch) ||
            (sec.equipments || []).some(e => (e.name || "").toLowerCase().includes(stSearch) || (e.tag || "").toLowerCase().includes(stSearch))
          );
          if (!matchName && !matchLoc && !matchCode && !matchSec) return false;
        }
        return true;
      });

      // 1. KPI Summary Strip
      const kpisHTML = '<div class="grid grid-4" style="margin-bottom:20px">'
        + kpiCard({ label: "Storerooms & Hubs", value: allStorerooms.length, icon: "layers", tone: "teal", foot: "Active Locations" })
        + kpiCard({ label: "Sub-Sections & Rooms", value: totalSections, icon: "bed", tone: "blue", foot: totalRooms + " Guest Rooms Active" })
        + kpiCard({ label: "Placed Equipment", value: totalEquipments, icon: "laptop", tone: "purple", foot: "In-Room & Store Assets" })
        + kpiCard({ label: "Stocked Supplies", value: totalStockItems, icon: "box", tone: "green", foot: "Supplies in Hubs & Rooms" })
        + '</div>';

      // 2. Controls Toolbar: Search, Filter Chips, and Action Buttons in a single card
      const controlsHTML = '<div class="card ops-toolbar-card">'
        + '<div class="ops-toolbar-row">'
        + '<div class="ops-toolbar-left">'
        + '<div class="searchbox" style="flex:0 0 240px">'
        + icon("search", 14)
        + '<input type="text" id="ops-storeroom-search" class="input" placeholder="Search storerooms, rooms, equipment…" value="' + esc(opsState.storeroomSearch || "") + '">'
        + '</div>'
        + '<div class="filter-chips">'
        + [
            ["all", "All Hubs (" + allStorerooms.length + ")"],
            ["rooms_hub", "Rooms Hubs"],
            ["central_storeroom", "Central Stores"],
            ["pantry", "Housekeeping Pantries"],
            ["engineering_store", "Engineering"],
            ["fnb_store", "F&B Stores"],
          ].map(([k, label]) =>
            '<button class="filter-chip ' + (stFilter === k ? "active" : "") + '" data-store-filter="' + k + '">' + label + '</button>'
          ).join("")
        + '</div>'
        + '</div>'
        + '<div class="ops-toolbar-right">'
        + '<button class="btn btn-sm btn-ghost" id="ops-btn-add-section">' + icon("plus", 13) + ' Add Room / Space</button>'
        + '<button class="btn btn-sm btn-ghost" id="ops-btn-place-eq">' + icon("laptop", 13) + ' Place Equipment</button>'
        + '<button class="btn btn-sm btn-ghost" id="ops-btn-alloc-stock">' + icon("box", 13) + ' Stock Supplies</button>'
        + '<button class="btn btn-sm btn-accent" id="ops-btn-new-storeroom">' + icon("plus", 13) + ' New Storeroom / Hub</button>'
        + '</div>'
        + '</div>'
        + '</div>';

      // 3. Selected Hub Drilldown Panel (when user clicks into a hub)
      let drilldownHTML = "";
      const selectedHub = opsState.selectedHubId ? allStorerooms.find(s => s.id === opsState.selectedHubId) : null;
      if (selectedHub) {
        const sections = selectedHub.sections || [];
        drilldownHTML = '<div class="drilldown-panel">'
          + '<div class="drilldown-header">'
          + '<div class="row" style="gap:12px;align-items:center">'
          + '<button class="btn btn-sm btn-ghost" id="ops-btn-close-drilldown">' + icon("arrowLeft", 14) + ' All Hubs</button>'
          + '<div class="hub-icon-box" style="width:40px;height:40px">' + icon(selectedHub.icon || "layers", 20) + '</div>'
          + '<div>'
          + '<div class="row" style="gap:8px;align-items:center">'
          + '<h3 style="font-family:var(--serif);font-size:19px;margin:0;font-weight:600">' + esc(selectedHub.name) + '</h3>'
          + '<span class="pill-tag mono" style="font-size:11px">' + esc(selectedHub.code || "") + '</span>'
          + '<span class="chip teal">' + esc((selectedHub.hub_type || "hub").replace("_", " ").toUpperCase()) + '</span>'
          + '</div>'
          + '<div class="tiny muted" style="margin-top:2px">' + esc(selectedHub.location) + ' · Floor: ' + esc(selectedHub.floor || "—") + ' · Supervisor: <b>' + esc(selectedHub.manager_name || "—") + '</b> · Utilization: <b>' + selectedHub.capacity_utilization + '%</b></div>'
          + '</div>'
          + '</div>'
          + '<div class="row" style="gap:8px">'
          + '<button class="btn btn-sm btn-ghost" data-edit-store-id="' + selectedHub.id + '">' + icon("edit", 13) + ' Edit Hub</button>'
          + '<button class="btn btn-sm btn-accent" data-add-section-to-hub="' + selectedHub.id + '">' + icon("plus", 13) + ' Add Room / Space to this Hub</button>'
          + '</div>'
          + '</div>'
          + (sections.length === 0
              ? emptyState("No Sub-Sections or Rooms in this Hub", "Create rooms, storage bays, or housekeeping carts inside this hub to start tracking equipment and stock.", "box")
              : '<div class="room-grid">'
                + sections.map(sec => {
                    const isRoom = sec.section_type === "room" || Boolean(sec.room_number);
                    const eqList = sec.equipments || [];
                    const stockList = sec.stock || [];
                    const statusClass = sec.room_status || "clean";

                    return '<div class="room-card">'
                      + '<div class="room-card-head">'
                      + '<div class="row" style="gap:8px;align-items:center;min-width:0">'
                      + (sec.room_number ? ('<span class="room-number-pill">' + esc(sec.room_number) + '</span>') : ('<span class="pill-tag mono">' + esc(sec.code || "SPACE") + '</span>'))
                      + '<div style="min-width:0"><b style="font-size:13.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(sec.name) + '</b>'
                      + '<span class="tiny muted">' + esc(sec.room_type || sec.section_type || "Space") + (sec.supervisor_name ? (' · ' + esc(sec.supervisor_name)) : '') + '</span></div>'
                      + '</div>'
                      + '<div class="row" style="gap:6px">'
                      + '<select class="room-status-select ' + statusClass + '" data-section-status-id="' + sec.id + '" title="Change live status">'
                      + [
                          ["clean", "Clean / Ready"],
                          ["occupied", "Occupied"],
                          ["turnover_in_progress", "Turnover"],
                          ["inspected", "Inspected"],
                          ["maintenance", "Maintenance"],
                        ].map(([val, lbl]) => '<option value="' + val + '"' + (sec.room_status === val ? ' selected' : '') + '>' + lbl + '</option>').join("")
                      + '</select>'
                      + '</div>'
                      + '</div>'
                      + '<div class="room-card-body">'
                      // Equipment list inside space
                      + '<div class="subspace-section">'
                      + '<div class="subspace-section-header"><span>Equipment Placed (' + eqList.length + ')</span>'
                      + '<button class="btn btn-xs btn-ghost" data-place-eq-sec-id="' + sec.id + '">' + icon("plus", 10) + ' Place Equipment</button>'
                      + '</div>'
                      + (eqList.length === 0
                          ? '<div class="tiny muted" style="padding:4px 0">No equipment placed in this space yet.</div>'
                          : '<div class="item-chip-list">'
                            + eqList.map(eq =>
                                '<div class="item-chip">'
                                + '<div class="name-wrap">'
                                + '<span class="item-title" title="' + esc(eq.name) + '">' + esc(eq.name) + '</span>'
                                + '<span class="item-sub">' + esc(eq.tag) + (eq.serial_no ? (' · ' + esc(eq.serial_no)) : '') + '</span>'
                                + '</div>'
                                + '<span class="condition-pill ' + (eq.condition || 'operational') + '">' + (eq.condition || 'operational') + '</span>'
                                + '<button class="remove-btn" title="Unassign equipment from this space" data-unassign-eq-sec="' + sec.id + '" data-unassign-eq-id="' + eq.id + '" data-eq-name="' + esc(eq.name) + '">×</button>'
                                + '</div>'
                              ).join("")
                            + '</div>'
                        )
                      + '</div>'
                      // Stock list inside space
                      + '<div class="subspace-section">'
                      + '<div class="subspace-section-header"><span>Stocked Supplies (' + stockList.length + ')</span>'
                      + '<button class="btn btn-xs btn-ghost" data-alloc-stock-sec-id="' + sec.id + '">' + icon("plus", 10) + ' Stock Supplies</button>'
                      + '</div>'
                      + (stockList.length === 0
                          ? '<div class="tiny muted" style="padding:4px 0">No supplies stocked in this space.</div>'
                          : '<div class="item-chip-list">'
                            + stockList.map(st =>
                                '<div class="item-chip">'
                                + '<div class="name-wrap">'
                                + '<span class="item-title" title="' + esc(st.name) + '">' + esc(st.name) + '</span>'
                                + '<span class="item-sub">' + esc(st.sku) + ' · <b>' + st.current_stock + ' ' + esc(st.unit) + '</b></span>'
                                + '</div>'
                                + '<span class="pill-tag ' + (st.status === 'low_stock' ? 'amber' : 'green') + '" style="font-size:9.5px">' + (st.status === 'low_stock' ? 'Low' : 'OK') + '</span>'
                                + '<button class="remove-btn" title="Unlink stock from this space" data-unlink-stock-sec="' + sec.id + '" data-unlink-stock-id="' + st.id + '" data-st-name="' + esc(st.name) + '">×</button>'
                                + '</div>'
                              ).join("")
                            + '</div>'
                        )
                      + '</div>'
                      + '</div>'
                      + '<div class="room-card-foot">'
                      + '<button class="btn btn-xs btn-ghost" data-edit-section-id="' + sec.id + '" data-parent-store-id="' + selectedHub.id + '">' + icon("edit", 11) + ' Edit Room</button>'
                      + '<button class="btn btn-xs btn-ghost" style="color:var(--red)" data-del-section-id="' + sec.id + '" data-section-name="' + esc(sec.name) + '">' + icon("trash", 11) + ' Delete</button>'
                      + '</div>'
                      + '</div>';
                  }).join("")
                + '</div>'
            )
          + '</div>';
      }

      // 4. Storeroom / Hub Cards Grid
      const cardsHTML = '<div class="hub-grid">'
        + filteredStorerooms.map(s => {
            const isSelected = opsState.selectedHubId === s.id;
            const secCount = s.sections_count || (s.sections ? s.sections.length : 0);
            const eqCount = s.equipment_count || 0;
            const stockCount = s.stock_count || 0;
            const roomsCount = s.rooms_count || (s.sections ? s.sections.filter(sec => sec.section_type === "room" || sec.room_number).length : 0);

            return '<div class="hub-card' + (isSelected ? ' selected' : '') + '">'
              + '<div class="hub-card-header">'
              + '<div class="row" style="gap:10px;min-width:0;flex:1;align-items:center">'
              + '<div class="hub-icon-box">' + icon(s.icon || "layers", 20) + '</div>'
              + '<div class="hub-title-box">'
              + '<div class="row" style="gap:6px;align-items:center">'
              + '<h3>' + esc(s.name) + '</h3>'
              + '</div>'
              + '<div class="row" style="gap:6px;align-items:center">'
              + '<span class="pill-tag mono" style="font-size:10px">' + esc(s.code || "") + '</span>'
              + '<span class="chip teal" style="font-size:9.5px;padding:1px 6px">' + esc((s.hub_type || "storeroom").replace("_", " ").toUpperCase()) + '</span>'
              + '</div>'
              + '</div>'
              + '</div>'
              + '<div class="row" style="gap:5px;flex-shrink:0">'
              + '<button class="hub-action-btn" title="Edit Hub" data-edit-store-id="' + s.id + '">' + icon("edit", 13) + '</button>'
              + '<button class="hub-action-btn danger" title="Delete Hub" data-del-store-id="' + s.id + '" data-store-name="' + esc(s.name) + '">' + icon("trash", 13) + '</button>'
              + '</div>'
              + '</div>'
              + '<div class="hub-card-body">'
              + '<div class="hub-meta-row"><span class="lbl">Location:</span><span class="val"><b>' + esc(s.location) + '</b></span></div>'
              + '<div class="hub-meta-row"><span class="lbl">Wing & Floor:</span><span class="val">' + esc(s.wing || "Central Facility") + ' · ' + esc(s.floor || "—") + '</span></div>'
              + '<div class="hub-meta-row"><span class="lbl">Supervisor:</span><span class="val"><b>' + esc(s.manager_name || "—") + '</b></span></div>'
              + '<div class="hub-meter-box">'
              + '<div class="row-between tiny" style="margin-bottom:4px">'
              + '<span class="muted">Capacity Utilization</span>'
              + '<b>' + (s.capacity_utilization || 0) + '%</b>'
              + '</div>'
              + '<div class="progress" style="height:6px"><i style="width:' + (s.capacity_utilization || 0) + '%;background:' + (s.capacity_utilization > 85 ? 'var(--amber)' : 'var(--teal)') + '"></i></div>'
              + '</div>'
              + '<div class="hub-stats-strip">'
              + '<div><div class="stat-val">' + secCount + '</div><div class="stat-lbl">' + (roomsCount > 0 ? (roomsCount + ' Rooms') : 'Spaces') + '</div></div>'
              + '<div><div class="stat-val">' + eqCount + '</div><div class="stat-lbl">Equipments</div></div>'
              + '<div><div class="stat-val">' + stockCount + '</div><div class="stat-lbl">Stock Items</div></div>'
              + '</div>'
              + (s.description ? ('<p class="tiny muted" style="margin:2px 0 0;line-height:1.4">' + esc(s.description) + '</p>') : '')
              + '</div>'
              + '<div class="hub-card-actions">'
              + '<button class="btn btn-sm ' + (isSelected ? 'btn-ghost' : 'btn-accent') + '" style="width:100%" data-select-hub-id="' + s.id + '">'
              + icon(isSelected ? "chevronUp" : "layers", 13) + ' ' + (isSelected ? 'Hide Sub-Sections & Rooms' : ('Manage Rooms, Equipment & Stock (' + secCount + ') →'))
              + '</button>'
              + '</div>'
              + '</div>';
          }).join("")
        + '</div>';

      body = kpisHTML + controlsHTML + drilldownHTML + cardsHTML;

    // ============================================================ TAB: READINESS
    } else if (opsState.tab === "readiness") {
      const wings = dash.wings_performance || [];
      body = '<div class="card card-pad" style="margin-bottom:20px">'
        + '<h3>Hotel Property Wings & Room Readiness</h3>'
        + '<p class="muted small">Live turnover inspection, occupancy tracking, and maintenance clearance across all wings.</p>'
        + '<div class="divider"></div>'
        + '<div class="stack" style="gap:14px">'
        + wings.map(w =>
            '<div class="card card-pad" style="background:var(--paper)">'
            + '<div class="row-between">'
            + '<div><h4 style="font-size:15px;margin:0 0 3px">' + esc(w.wing) + '</h4>'
            + '<div class="tiny muted">' + esc(w.type) + ' · Total Rooms: ' + w.total_rooms + '</div></div>'
            + '<div class="row" style="gap:10px">'
            + '<span class="chip green"><b>' + w.occupied + '</b> Occupied</span>'
            + '<span class="chip amber"><b>' + w.turnover_in_progress + '</b> Turnover in progress</span>'
            + '<span class="chip blue"><b>' + (w.total_rooms - w.occupied - w.turnover_in_progress) + '</b> Inspected & Ready</span>'
            + '</div>'
            + '</div>'
            + '<div class="progress" style="height:8px;margin-top:12px"><i style="width:' + w.readiness + '%;background:' + w.color + '"></i></div>'
            + '</div>'
          ).join("")
        + '</div>'
        + '</div>';

    // ============================================================ TAB: ASSETS
    } else if (opsState.tab === "assets") {
      const totalVal = assets.reduce((s, a) => s + Number(a.value || 0), 0);
      body = '<div class="grid grid-4" style="margin-bottom:18px">'
        + kpiCard({ label: "Registered Equipment", value: assets.length, icon: "laptop", tone: "teal", foot: "Hotel Assets" })
        + kpiCard({ label: "In Active Service", value: assets.filter(a => a.status === "assigned" || a.status === "available").length, icon: "checkCircle", tone: "blue", foot: "Laundry, POS, HVAC" })
        + kpiCard({ label: "Under Maintenance", value: assets.filter(a => a.status === "maintenance").length, icon: "alert", tone: "amber", foot: "Workshop repair" })
        + kpiCard({ label: "Total Book Value", value: compactMoney(totalVal), icon: "wallet", tone: "purple", foot: "Capitalized Cost" })
        + '</div>'
        + renderTable({
            id: "ops-assets-table",
            title: "Hotel Equipment & Machinery Assets",
            sub: "Laundry extractors, HVAC chillers, POS terminals, golf carts, and keycard encoders",
            filters: [
              { key: "category", label: "Category" },
              { key: "status", label: "Status" },
            ],
            columns: [
              { label: "Asset", render: r => '<div class="row"><div class="kpi-icon teal" style="width:32px;height:32px">' + icon("laptop", 15) + '</div><div><b>' + esc(r.name) + '</b><div class="tiny muted mono">' + esc(r.tag) + '</div></div></div>' },
              { label: "Category", render: r => '<span class="pill-tag">' + esc(r.category || "other") + '</span>' },
              { label: "Serial #", render: r => '<span class="mono tiny">' + esc(r.serial_no || "—") + '</span>' },
              { label: "Purchased", render: r => fmtDate(r.purchase_date) },
              { label: "Value", sortValue: r => Number(r.value || 0), render: r => money(r.value || 0) },
              { label: "Status", render: r => chip(r.status) },
            ],
            rows: assets, emptyTitle: "No equipment registered",
          });

    // ============================================================ TAB: SAFETY
    } else if (opsState.tab === "safety") {
      body = '<div class="grid grid-2">'
        + '<div class="card card-pad">'
        + '<h3>Hygiene & Food Safety Protocols</h3>'
        + '<p class="muted small">Daily sanitization audits, kitchen cold room temperature logs, and HACCP compliance.</p>'
        + '<div class="divider"></div>'
        + '<ul class="stack" style="gap:10px;padding-left:18px;font-size:13px">'
        + '<li><b>Turnover Sanitization Protocol:</b> Hospital-grade EPA sanitizer sprayed on high-touch surfaces (door levers, remotes, thermostat).</li>'
        + '<li><b>Linen Laundry Thermal Wash:</b> Egyptian cotton sheets laundered at 65°C minimum with oxygen bleach.</li>'
        + '<li><b>Water Safety:</b> Daily chlorine and pH tests logged at 06:00 and 14:00 at the Heated Infinity Pool.</li>'
        + '<li><b>Kitchen Refrigeration:</b> Cold room temperatures monitored below 4°C; walk-in freezers at -18°C.</li>'
        + '</ul>'
        + '</div>'
        + '<div class="card card-pad">'
        + '<h3>Fire Safety & Emergency Preparedness</h3>'
        + '<p class="muted small">Fire extinguisher inspections, smoke detector checks, and emergency exits clear verification.</p>'
        + '<div class="divider"></div>'
        + '<dl class="kv">'
        + '<dt>Exit Signage Illumination</dt><dd><span class="chip green">Passed (100%)</span></dd>'
        + '<dt>Fire Extinguisher Inspection</dt><dd>Scheduled Monthly (Next: 15 Nov)</dd>'
        + '<dt>Kitchen Suppression System</dt><dd>Ansul R-102 Certified</dd>'
        + '<dt>Emergency Assembly Area</dt><dd>East Garden Courtyard</dd>'
        + '</dl>'
        + '</div>'
        + '</div>';

    // ============================================================ TAB: SETTINGS
    } else {
      body = '<div class="grid grid-2">'
        + '<div class="card"><div class="card-head"><h3>Hotel Operations Preferences</h3></div><div class="card-body"><dl class="kv">'
        + '<dt>Turnover Target SLA</dt><dd>25 minutes (Checkout to Clean)</dd>'
        + '<dt>Maintenance Response SLA</dt><dd>20 minutes (Guest Room Priority)</dd>'
        + '<dt>Default Par Ratio</dt><dd>3x King Linens per Room</dd>'
        + '<dt>Inspection Standard</dt><dd>Dual Supervisor Sign-off for VIP</dd>'
        + '<dt>Vendor Receiving Bay</dt><dd>Ground Floor Bay A (06:00 - 18:00)</dd>'
        + '</dl></div></div>'
        + '<div class="card"><div class="card-head"><h3>Hospitality Emergency Routing</h3></div><div class="card-body stack">'
        + '<div class="channel-box"><div class="row-between"><b>Department Alert Escalation</b><span class="tiny muted">Operations & Concierge</span></div>'
        + '<p class="tiny muted" style="margin-top:6px">High-priority guest room defects automatically trigger notifications to the Duty Manager and Engineering Lead.</p>'
        + '</div>'
        + '<button class="btn btn-accent" onclick="go(\'settings\')">' + icon("sliders", 14) + ' Open System Settings</button>'
        + '</div></div>'
        + '</div>';
    }

    // Render outer shell
    const isMaintenanceTab = opsState.tab === "maintenance";
    const pageActions = isMaintenanceTab
      ? '<button class="btn btn-ghost" id="ops-maint-print">' + icon("printer", 15) + ' Print report</button>'
        + '<button class="btn btn-ghost" id="ops-maint-send">' + icon("send", 15) + ' Send report to MD</button>'
        + '<button class="btn btn-accent" id="ops-maint-new">' + icon("plus", 15) + ' Schedule maintenance</button>'
      : '<button class="btn btn-ghost" id="ops-top-restock">' + icon("zap", 15) + ' Restock Supplies</button>'
        + '<button class="btn btn-accent" id="ops-top-wo">' + icon("plus", 15) + ' New Work Order</button>';
    root.innerHTML = pageHead(
      "Hotel Operations",
      isMaintenanceTab
        ? "Schedule repairs and inspections, assign employees or contractors, track GHS charges, and report to the Managing Director."
        : "Executive command centre for storerooms, linen inventory, guest work orders, room turnaround, and property readiness.",
      pageActions,
      "Department"
    )
    + '<div class="tabs" style="margin-bottom:20px">'
    + tabs.map(t => '<button class="tab ' + (opsState.tab === t[0] ? "active" : "") + '" data-opstab="' + t[0] + '">' + t[1] + '</button>').join("")
    + '</div>'
    + '<div class="page-enter">' + body + '</div>';

    // Attach Tab Navigation
    root.querySelectorAll("[data-opstab]").forEach(b => {
      b.onclick = () => {
        const tab = b.dataset.opstab;
        opsState.tab = tab;
        go(tab === "dashboard" ? "operations" : "operations/" + tab);
      };
    });

    // Attach Top Action Buttons
    const btnRestock = root.querySelector("#ops-top-restock") || root.querySelector("#ops-btn-quick-restock");
    if (btnRestock) btnRestock.onclick = () => openStockAdjustModal();
    const btnRestock2 = root.querySelector("#ops-btn-add-stock");
    if (btnRestock2) btnRestock2.onclick = () => openStockAdjustModal();

    const btnWO = root.querySelector("#ops-top-wo") || root.querySelector("#ops-btn-quick-wo") || root.querySelector("#ops-btn-new-wo-tab");
    if (btnWO) btnWO.onclick = () => openNewWorkOrderModal();

    const btnNewMaintenance = root.querySelector("#ops-maint-new");
    if (btnNewMaintenance) btnNewMaintenance.onclick = () => openMaintenanceForm();
    const btnPrintMaintenance = root.querySelector("#ops-maint-print");
    if (btnPrintMaintenance) btnPrintMaintenance.onclick = () => printMaintenanceReport(maintenanceWorks, maintenanceApiFilters());
    const btnSendMaintenance = root.querySelector("#ops-maint-send");
    if (btnSendMaintenance) btnSendMaintenance.onclick = () => sendMaintenanceReport(maintenanceWorks.length);

    const applyMaintenanceFilters = () => {
      const search = (root.querySelector("#ops-maint-search")?.value || "").trim();
      const status = root.querySelector("#ops-maint-status")?.value || "";
      const from = root.querySelector("#ops-maint-from")?.value || "";
      const to = root.querySelector("#ops-maint-to")?.value || "";
      if (from && to && from > to) {
        toast("The end date must be on or after the start date", "error");
        return;
      }
      opsState.maintenanceSearch = search;
      opsState.maintenanceStatus = status;
      opsState.maintenanceFrom = from;
      opsState.maintenanceTo = to;
      Views.operations(root, ["maintenance"]);
    };
    const applyMaintenanceButton = root.querySelector("#ops-maint-apply");
    if (applyMaintenanceButton) applyMaintenanceButton.onclick = applyMaintenanceFilters;
    const clearMaintenanceButton = root.querySelector("#ops-maint-clear");
    if (clearMaintenanceButton) clearMaintenanceButton.onclick = () => {
      opsState.maintenanceSearch = "";
      opsState.maintenanceStatus = "";
      opsState.maintenanceFrom = "";
      opsState.maintenanceTo = "";
      Views.operations(root, ["maintenance"]);
    };
    const maintenanceSearchInput = root.querySelector("#ops-maint-search");
    if (maintenanceSearchInput) maintenanceSearchInput.onkeydown = event => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyMaintenanceFilters();
      }
    };
    root.querySelectorAll("[data-maint-edit]").forEach(button => {
      button.onclick = () => {
        const record = maintenanceWorks.find(work => work.id === Number(button.dataset.maintEdit));
        if (record) openMaintenanceForm(record);
      };
    });
    root.querySelectorAll(".ops-maint-status-select").forEach(select => {
      select.onchange = async () => {
        select.disabled = true;
        try {
          await API.put("/operations/maintenance/" + select.dataset.maintId, { status: select.value });
          toast("Maintenance status updated", "success");
          Views.operations(root, ["maintenance"]);
        } catch (e) {
          toast("Could not update maintenance status: " + e.message, "error");
          select.disabled = false;
        }
      };
    });

    const btnNewItem = root.querySelector("#ops-btn-new-item");
    if (btnNewItem) btnNewItem.onclick = () => openNewInventoryItemModal();

    // Attach Period Dropdown
    const periodDropdown = root.querySelector("#ops-period-dropdown");
    if (periodDropdown) {
      periodDropdown.onchange = () => {
        opsState.period = periodDropdown.value;
        Views.operations(root, [opsState.tab]);
      };
    }

    // Filter work orders when clicking legend items in fulfillment donut
    root.querySelectorAll("[data-filter-wo]").forEach(b => {
      b.onclick = () => {
        const filter = b.dataset.filterWo;
        if (filter) {
          opsState.tab = "workorders";
          opsState.workOrderFilter = filter;
          go("operations/workorders");
        }
      };
    });

    // Attach Quick Restock buttons from alerts
    root.querySelectorAll("[data-quick-restock-id]").forEach(b => {
      b.onclick = () => openStockAdjustModal(Number(b.dataset.quickRestockId));
    });

    root.querySelectorAll("[data-adjust-stock]").forEach(b => {
      b.onclick = () => openStockAdjustModal(Number(b.dataset.adjustStock));
    });

    // Attach Status Update on Work Orders
    root.querySelectorAll(".ops-wo-status-select").forEach(sel => {
      sel.onchange = async () => {
        const woId = sel.dataset.woId;
        const newStatus = sel.value;
        try {
          await API.put("/operations/work-orders/" + woId + "/status", { status: newStatus });
          toast("Work order status updated to " + newStatus, "success");
        } catch (e) {
          toast("Could not update status: " + e.message, "error");
        }
      };
    });

    // Storeroom Filter Click
    root.querySelectorAll("[data-filter-store]").forEach(b => {
      b.onclick = () => {
        opsState.tab = "inventory";
        go("operations/inventory");
      };
    });

    // ---------------- STOREROOMS & ROOMS INTERACTIVE LISTENERS ----------------
    // Top Action Buttons
    const btnNewStore = root.querySelector("#ops-btn-new-storeroom");
    if (btnNewStore) btnNewStore.onclick = () => openStoreroomFormModal();

    const btnAddSec = root.querySelector("#ops-btn-add-section");
    if (btnAddSec) btnAddSec.onclick = () => openSectionFormModal(opsState.selectedHubId || null);

    const btnPlaceEq = root.querySelector("#ops-btn-place-eq");
    if (btnPlaceEq) btnPlaceEq.onclick = () => openAssignEquipmentModal();

    const btnAllocSt = root.querySelector("#ops-btn-alloc-stock");
    if (btnAllocSt) btnAllocSt.onclick = () => openAssignStockModal();

    // Select Hub for Drilldown
    root.querySelectorAll("[data-select-hub-id]").forEach(b => {
      b.onclick = () => {
        const hid = Number(b.dataset.selectHubId);
        opsState.selectedHubId = (opsState.selectedHubId === hid) ? null : hid;
        Views.operations(root, [opsState.tab]);
      };
    });

    const btnCloseDrill = root.querySelector("#ops-btn-close-drilldown");
    if (btnCloseDrill) {
      btnCloseDrill.onclick = () => {
        opsState.selectedHubId = null;
        Views.operations(root, [opsState.tab]);
      };
    }

    // Category / Type filter pills
    root.querySelectorAll("[data-store-filter]").forEach(b => {
      b.onclick = () => {
        opsState.storeroomFilter = b.dataset.storeFilter;
        Views.operations(root, [opsState.tab]);
      };
    });

    // Search input
    const storeSearchInp = root.querySelector("#ops-storeroom-search");
    if (storeSearchInp) {
      storeSearchInp.oninput = () => {
        opsState.storeroomSearch = storeSearchInp.value;
      };
      storeSearchInp.onkeydown = (e) => {
        if (e.key === "Enter") {
          opsState.storeroomSearch = storeSearchInp.value;
          Views.operations(root, [opsState.tab]);
        }
      };
    }

    // Edit Storeroom / Hub
    root.querySelectorAll("[data-edit-store-id]").forEach(b => {
      b.onclick = () => {
        const sid = Number(b.dataset.editStoreId);
        const store = (storerooms || []).find(s => s.id === sid);
        if (store) openStoreroomFormModal(store);
      };
    });

    // Delete Storeroom / Hub
    root.querySelectorAll("[data-del-store-id]").forEach(b => {
      b.onclick = () => {
        const sid = Number(b.dataset.delStoreId);
        const sname = b.dataset.storeName || "this hub";
        confirmDialog("Delete Storeroom / Hub", "Are you sure you want to remove '" + sname + "'? Child sub-sections will be deleted, and assets will be detached safely.", async () => {
          await API.delete("/operations/storerooms/" + sid);
          toast("Storeroom removed successfully", "success");
          if (opsState.selectedHubId === sid) opsState.selectedHubId = null;
          Views.operations(root, [opsState.tab]);
        }, { danger: true, confirmLabel: "Delete Hub" });
      };
    });

    // Add Section inside Hub Drilldown
    root.querySelectorAll("[data-add-section-to-hub]").forEach(b => {
      b.onclick = () => {
        const hid = Number(b.dataset.addSectionToHub);
        openSectionFormModal(hid);
      };
    });

    // Edit Section / Room
    root.querySelectorAll("[data-edit-section-id]").forEach(b => {
      b.onclick = () => {
        const secId = Number(b.dataset.editSectionId);
        const parentId = Number(b.dataset.parentStoreId);
        const parentStore = (storerooms || []).find(s => s.id === parentId);
        const sec = parentStore && (parentStore.sections || []).find(s => s.id === secId);
        if (sec) openSectionFormModal(parentId, sec);
      };
    });

    // Delete Section / Room
    root.querySelectorAll("[data-del-section-id]").forEach(b => {
      b.onclick = () => {
        const secId = Number(b.dataset.delSectionId);
        const sname = b.dataset.sectionName || "this space";
        confirmDialog("Delete Sub-Section / Room", "Are you sure you want to remove '" + sname + "'? Placed equipment and inventory items will be unlinked safely.", async () => {
          await API.delete("/operations/sections/" + secId);
          toast("Sub-section removed successfully", "success");
          Views.operations(root, [opsState.tab]);
        }, { danger: true, confirmLabel: "Delete Section" });
      };
    });

    // Live Room Status Selector change
    root.querySelectorAll("[data-section-status-id]").forEach(sel => {
      sel.onchange = async () => {
        const secId = Number(sel.dataset.sectionStatusId);
        const newStatus = sel.value;
        try {
          await API.put("/operations/sections/" + secId, { room_status: newStatus });
          sel.className = "room-status-select " + newStatus;
          toast("Room status changed to " + newStatus.replace(/_/g, " "), "success");
        } catch (err) {
          toast("Failed to update status: " + err.message, "error");
        }
      };
    });

    // Place Equipment in Section
    root.querySelectorAll("[data-place-eq-sec-id]").forEach(b => {
      b.onclick = () => openAssignEquipmentModal(Number(b.dataset.placeEqSecId));
    });

    // Allocate Stock in Section
    root.querySelectorAll("[data-alloc-stock-sec-id]").forEach(b => {
      b.onclick = () => openAssignStockModal(Number(b.dataset.allocStockSecId));
    });

    // Unassign Equipment from Section
    root.querySelectorAll("[data-unassign-eq-id]").forEach(b => {
      b.onclick = () => {
        const secId = Number(b.dataset.unassignEqSec);
        const eqId = Number(b.dataset.unassignEqId);
        const eqName = b.dataset.eqName || "this equipment";
        confirmDialog("Unassign Equipment", "Remove '" + eqName + "' from this room / space? It will remain available in the central assets register.", async () => {
          await API.post("/operations/sections/" + secId + "/remove-equipment/" + eqId);
          toast("Equipment removed from space", "success");
          Views.operations(root, [opsState.tab]);
        }, { confirmLabel: "Remove" });
      };
    });

    // Unlink Stock from Section
    root.querySelectorAll("[data-unlink-stock-id]").forEach(b => {
      b.onclick = () => {
        const secId = Number(b.dataset.unlinkStockSec);
        const stId = Number(b.dataset.unlinkStockId);
        const stName = b.dataset.stName || "this item";
        confirmDialog("Unlink Stock Supply", "Remove '" + stName + "' allocation from this space?", async () => {
          await API.post("/operations/sections/" + secId + "/remove-stock/" + stId);
          toast("Supply unlinked from space", "success");
          Views.operations(root, [opsState.tab]);
        }, { confirmLabel: "Unlink" });
      };
    });

  } catch (e) {
    root.innerHTML = pageHead("Hotel Operations", "Error loading operations", "", "Department")
      + emptyState("Unable to load Hotel Operations", e.message, "alert");
  }
};


// ============================================================ MAINTENANCE SCHEDULE & REPORTS
function maintenanceApiFilters() {
  return {
    q: opsState.maintenanceSearch,
    status: opsState.maintenanceStatus,
    from_date: opsState.maintenanceFrom,
    to_date: opsState.maintenanceTo,
  };
}

function maintenanceReportPeriod(filters) {
  filters = filters || {};
  const start = filters.from_date;
  const end = filters.to_date;
  let period = start && end ? fmtDate(start) + " – " + fmtDate(end)
    : (start ? "From " + fmtDate(start) : (end ? "Through " + fmtDate(end) : "All scheduled dates"));
  if (filters.status) period += " · " + filters.status.replace(/_/g, " ");
  if (filters.q) period += " · Search: " + filters.q;
  return period;
}

function renderMaintenanceTable(records) {
  const rows = records || [];
  const head = '<tr><th>Reference</th><th>Scheduled</th><th>Work & location</th><th>Worker</th>'
    + '<th>Charge</th><th>Status</th><th>Remarks</th><th></th></tr>';
  const body = rows.length ? rows.map(work => {
    const details = work.description
      ? '<div class="tiny muted" style="max-width:260px">' + esc(work.description) + '</div>' : '';
    const remarks = work.remarks || "—";
    const statusOptions = ["scheduled", "in_progress", "completed", "cancelled"].map(status =>
      '<option value="' + status + '"' + (work.status === status ? " selected" : "") + '>'
      + status.replace(/_/g, " ") + '</option>'
    ).join("");
    return '<tr>'
      + '<td><b class="mono">' + esc(work.reference_no) + '</b><div class="tiny muted">' + esc(work.category) + '</div></td>'
      + '<td><b>' + esc(fmtDate(work.scheduled_at)) + '</b><div class="tiny muted">' + esc(fmtTime(work.scheduled_at)) + '</div></td>'
      + '<td><b>' + esc(work.title) + '</b><div class="tiny muted">' + esc(work.location) + '</div>' + details + '</td>'
      + '<td>' + esc(work.worker_name || "—") + '</td>'
      + '<td><b>' + esc(money(work.amount || 0, "GHS")) + '</b></td>'
      + '<td><select class="select ops-maint-status-select" data-maint-id="' + work.id + '" aria-label="Update status for ' + esc(work.reference_no) + '" style="min-width:125px;height:32px">' + statusOptions + '</select></td>'
      + '<td><span class="tiny" title="' + esc(remarks) + '" style="display:block;max-width:190px;white-space:normal">' + esc(remarks.length > 96 ? remarks.slice(0, 93) + "…" : remarks) + '</span></td>'
      + '<td><button type="button" class="btn btn-sm btn-ghost" data-maint-edit="' + work.id + '">' + icon("edit", 12) + ' Edit</button></td>'
      + '</tr>';
  }).join("") : '<tr><td colspan="8">' + emptyState("No maintenance work found", "Schedule a repair, inspection or preventive maintenance job to get started.", "calendar") + '</td></tr>';

  return '<div class="card"><div class="card-head"><div><h3>Maintenance schedule & charge register</h3>'
    + '<div class="sub">' + rows.length + ' record(s) · Filter the schedule, then print or email this report to the MD.</div></div></div>'
    + '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div>';
}

function defaultMaintenanceDateTime() {
  const value = new Date();
  value.setHours(value.getHours() + 1, 0, 0, 0);
  const pad = number => String(number).padStart(2, "0");
  return value.getFullYear() + "-" + pad(value.getMonth() + 1) + "-" + pad(value.getDate())
    + "T" + pad(value.getHours()) + ":" + pad(value.getMinutes());
}

async function openMaintenanceForm(record) {
  try {
    const response = await API.get("/employees", { per_page: 500 });
    const employees = (response.data || []).filter(employee => ["active", "probation"].includes(employee.status));
    const employeeOptions = employees.map(employee => ({
      value: employee.id,
      label: (employee.full_name || employee.employee_name || [employee.first_name, employee.last_name].filter(Boolean).join(" "))
        + (employee.department_name ? " · " + employee.department_name : ""),
    }));
    const fields = [
      { name: "title", label: "Maintenance work", placeholder: "e.g. Service the main generator", required: true },
      {
        name: "category", label: "Work type", type: "select", required: true,
        options: ["Preventive", "Repair", "Inspection", "Electrical", "Plumbing", "HVAC", "Other"],
        value: record ? record.category : "Repair",
      },
      { name: "location", label: "Location / asset", placeholder: "e.g. Staff quarters, Room 204, generator house", required: true },
      {
        name: "scheduled_at", label: "Scheduled date & time", type: "datetime-local", required: true,
        value: record && record.scheduled_at ? String(record.scheduled_at).slice(0, 16) : defaultMaintenanceDateTime(),
      },
      {
        name: "worker_id", label: "Assigned worker", type: "select", required: true,
        placeholder: "Select an employee or contractor",
        options: [{ value: "external", label: "External contractor" }].concat(employeeOptions),
        value: record ? (record.worker_id || "external") : "",
      },
      {
        name: "worker_name", label: "Contractor name", placeholder: "Enter the contractor's name",
        value: record && !record.worker_id ? record.worker_name : "",
        hint: "Only needed when External contractor is selected.",
      },
      { name: "amount", label: "Charge (GHS)", type: "number", min: 0, step: "0.01", default: 0, required: true, value: record ? record.amount : 0 },
      ...(record ? [{
        name: "status", label: "Status", type: "select", value: record.status,
        options: ["scheduled", "in_progress", "completed", "cancelled"],
      }] : []),
      { name: "description", label: "Work details", type: "textarea", rows: 3, full: true, placeholder: "Describe the work to be done, materials or checks required…", value: record ? record.description : "" },
      { name: "remarks", label: "Remarks", type: "textarea", rows: 3, full: true, placeholder: "Add an update, completion note or other remarks…", value: record ? record.remarks : "" },
    ];

    openFormModal({
      title: record ? "Edit maintenance work" : "Schedule maintenance work",
      subtitle: "Assign an employee or contractor, record the GHS charge, and add work notes.",
      wide: true,
      fields,
      submitLabel: record ? "Save changes" : "Schedule work",
      successMessage: record ? "Maintenance work updated" : "Maintenance work scheduled",
      async onSubmit(values) {
        const externalWorker = String(values.worker_id) === "external";
        const payload = {
          title: values.title,
          category: values.category,
          location: values.location,
          scheduled_at: values.scheduled_at,
          worker_id: externalWorker ? null : Number(values.worker_id),
          worker_name: externalWorker ? values.worker_name : null,
          amount: Number(values.amount),
          description: values.description,
          remarks: values.remarks,
        };
        if (record) payload.status = values.status;
        if (record) await API.put("/operations/maintenance/" + record.id, payload);
        else await API.post("/operations/maintenance", payload);
        const view = document.getElementById("view");
        if (view) await Views.operations(view, ["maintenance"]);
      },
    });
  } catch (error) {
    toast("Could not load workers: " + error.message, "error");
  }
}

function printMaintenanceReport(records, filters) {
  const rows = records || [];
  const period = maintenanceReportPeriod(filters);
  const total = rows.reduce((sum, work) => sum + Number(work.amount || 0), 0);
  const company = (Store.meta && Store.meta.company && Store.meta.company.name) || "Company";
  const tableRows = rows.map(work => '<tr>'
    + '<td>' + esc(work.reference_no) + '</td>'
    + '<td>' + esc(fmtDateTime(work.scheduled_at)) + '</td>'
    + '<td><b>' + esc(work.title) + '</b>' + (work.description ? '<div class="detail">' + esc(work.description) + '</div>' : '') + '</td>'
    + '<td>' + esc(work.location) + '</td>'
    + '<td>' + esc(work.worker_name || "—") + '</td>'
    + '<td class="amount">' + esc(money(work.amount || 0, "GHS")) + '</td>'
    + '<td>' + esc((work.status || "").replace(/_/g, " ")) + '</td>'
    + '<td>' + esc(work.remarks || "—") + '</td>'
    + '</tr>').join("");
  const win = window.open("", "_blank", "width=1100,height=760");
  if (!win) {
    toast("Allow pop-ups to print the maintenance report", "error");
    return;
  }
  win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Maintenance Work Report</title>'
    + '<style>body{font-family:Inter,Arial,sans-serif;padding:30px;color:#172624}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c2703d;padding-bottom:16px;margin-bottom:18px}h1{font-family:Georgia,serif;font-size:27px;margin:0 0 5px}.muted,.detail{color:#69756f;font-size:11px;line-height:1.5}.summary{display:flex;gap:18px;margin:18px 0}.summary div{padding:11px 14px;background:#f6f4ef;border-radius:8px}.summary b{display:block;font-size:17px;margin-top:3px}table{border-collapse:collapse;width:100%;font-size:11px}th{text-align:left;background:#f2f0e9;padding:9px 8px;border-bottom:2px solid #d7d2c8;text-transform:uppercase;font-size:9px;letter-spacing:.04em}td{padding:8px;border-bottom:1px solid #e8e5dc;vertical-align:top}.amount{text-align:right;white-space:nowrap}.empty{text-align:center;padding:25px;color:#69756f}.foot{margin-top:24px;font-size:10px;color:#69756f}@media print{body{padding:10px}header{break-inside:avoid}tr{break-inside:avoid}}</style>'
    + '</head><body><header><div><h1>Maintenance Work Report</h1><div class="muted">' + esc(company) + ' · ' + esc(period) + '</div></div><div class="muted">Prepared ' + esc(fmtDateTime(new Date().toISOString())) + '</div></header>'
    + '<div class="summary"><div>Work items<b>' + rows.length + '</b></div><div>Total maintenance charges<b>' + esc(money(total, "GHS")) + '</b></div></div>'
    + '<table><thead><tr><th>Ref</th><th>Scheduled</th><th>Work</th><th>Location</th><th>Worker</th><th>Charge</th><th>Status</th><th>Remarks</th></tr></thead><tbody>'
    + (tableRows || '<tr><td class="empty" colspan="8">No maintenance work matches these filters.</td></tr>')
    + '</tbody></table><div class="foot">Generated from the Hotel Operations maintenance schedule.</div>'
    + '<script>window.onload=function(){window.print();}<\/script></body></html>');
  win.document.close();
}

function sendMaintenanceReport(recordCount) {
  const count = Number(recordCount || 0);
  confirmDialog(
    "Send maintenance report to the MD?",
    "This will share " + count + " maintenance record(s) and their GHS charges, worker names, schedule, and remarks with the Managing Director. The report uses your current filters.",
    async () => {
      const response = await API.post("/operations/maintenance/report/send", maintenanceApiFilters());
      const result = (response && response.data) || {};
      const recipient = result.recipient_name || "the Managing Director";
      if (result.email_status === "sent") {
        toast("Maintenance report emailed to " + recipient + " (" + result.recipient_email + ")", "success");
      } else if (result.email_status === "simulated") {
        toast("Report prepared for " + recipient + "; email is in sandbox mode and was not delivered externally.", "success");
      } else if (result.in_app_notified) {
        toast("MD notified in the app; email could not be delivered: " + (result.email_error || result.email_status), "error");
      } else {
        toast("Report email could not be delivered: " + (result.email_error || result.email_status), "error");
      }
    },
    { confirmLabel: "Send report" }
  );
}


// ============================================================ CUSTOM STOCK MOVEMENT SVG DUAL-BAR CHART
function renderStockMovementSVG(data) {
  const labels = data.labels || [];
  const stockIn = data.stock_in || [];
  const stockOut = data.stock_out || [];
  const count = labels.length;
  if (!count) return '<div class="empty-state tiny muted">No movement data recorded</div>';

  const w = 580, h = 210, padL = 36, padB = 28, padT = 16, padR = 12;
  const maxVal = Math.max.apply(null, stockIn.concat(stockOut).concat([10000])) * 1.1;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const groupW = chartW / count;
  const barW = Math.max(5, Math.min(10, groupW * 0.32));

  // Grid lines
  let gridLines = "";
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const gy = padT + (chartH * (1 - i / gridSteps));
    const valLabel = Math.round((maxVal * i / gridSteps) / 1000) + "K";
    gridLines += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (w - padR) + '" y2="' + gy + '" stroke="var(--line)" stroke-dasharray="3 4"/>'
      + '<text x="' + (padL - 6) + '" y="' + (gy + 3) + '" font-size="8.5" fill="var(--muted)" text-anchor="end" font-family="var(--sans)">' + valLabel + '</text>';
  }

  // Bars and labels
  let barsHTML = "";
  let xLabels = "";

  for (let i = 0; i < count; i++) {
    const groupX = padL + i * groupW + (groupW / 2);
    const inH = (stockIn[i] / maxVal) * chartH;
    const outH = (stockOut[i] / maxVal) * chartH;
    const inY = padT + (chartH - inH);
    const outY = padT + (chartH - outH);

    // Stock In bar (blue)
    barsHTML += '<rect x="' + (groupX - barW - 1.5) + '" y="' + inY + '" width="' + barW + '" height="' + inH + '" fill="#3b82f6" rx="2.5"><title>Stock In: ' + stockIn[i].toLocaleString() + '</title></rect>';
    // Stock Out bar (green/teal)
    barsHTML += '<rect x="' + (groupX + 1.5) + '" y="' + outY + '" width="' + barW + '" height="' + outH + '" fill="#10b981" rx="2.5"><title>Stock Out: ' + stockOut[i].toLocaleString() + '</title></rect>';

    // X Axis Label (alternate if crowded)
    if (count <= 14 || i % 2 === 0) {
      xLabels += '<text x="' + groupX + '" y="' + (h - 8) + '" font-size="8.5" fill="var(--muted)" text-anchor="middle" font-family="var(--sans)">' + esc(labels[i]) + '</text>';
    }
  }

  return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;display:block">'
    + gridLines
    + barsHTML
    + xLabels
    + '</svg>';
}


// ============================================================ MODAL: STOCK ADJUSTMENT / RESTOCK
async function openStockAdjustModal(prefillItemId) {
  try {
    const res = await API.get("/operations/inventory");
    const items = res.data || [];
    const itemOpts = items.map(i => ({ value: i.id, label: i.name + " (" + i.sku + ") · " + i.current_stock + " " + i.unit }));
    const targetItem = (prefillItemId && items.find(i => i.id === prefillItemId)) || items[0];

    const suggestedQty = targetItem 
      ? Math.max(20, (targetItem.ideal_par_level || targetItem.reorder_level * 2) - targetItem.current_stock)
      : 50;

    const modalTitle = targetItem ? ("Restock: " + targetItem.name) : "Hotel Stock Adjustment & Restock";
    const modalSub = targetItem 
      ? ("Current: " + targetItem.current_stock + " " + targetItem.unit + " · Par Threshold: " + targetItem.reorder_level + " " + targetItem.unit + (targetItem.ideal_par_level ? (" · Target Par: " + targetItem.ideal_par_level + " " + targetItem.unit) : ""))
      : "Record vendor deliveries received, stock issued to floors, or audit count";

    openFormModal({
      title: modalTitle,
      sub: modalSub,
      subtitle: modalSub,
      fields: [
        {
          name: "item_id", label: "Select Supply Item", type: "select",
          options: itemOpts, value: prefillItemId || (items[0] && items[0].id),
          required: true,
        },
        {
          name: "movement_type", label: "Action Type", type: "select",
          options: [
            { value: "in", label: "Stock In (Vendor Delivery / Receiving)" },
            { value: "out", label: "Stock Out (Issued to Housekeeping / Floor / F&B)" },
            { value: "set", label: "Inventory Audit Count (Set Stock Level)" },
          ],
          value: "in", required: true,
        },
        { name: "quantity", label: "Quantity to Restock / Move", type: "number", default: suggestedQty, required: true },
        { name: "reason", label: "Source / Destination / Floor", default: targetItem ? ("Vendor Delivery · " + (targetItem.supplier || "Central Receiving Store")) : "Central Store Delivery", hint: "e.g., 'Vendor: Nile Heritage' or 'Issued to 4th Floor Housekeeping'" },
        { name: "reference_no", label: "PO or Reference #", default: "PO-" + Math.floor(1000 + Math.random() * 9000) },
      ],
      submitLabel: "Confirm & Restock Stock",
      async onSubmit(vals) {
        await API.post("/operations/inventory/adjust", {
          item_id: Number(vals.item_id),
          quantity: Number(vals.quantity),
          movement_type: vals.movement_type,
          reason: vals.reason,
          reference_no: vals.reference_no,
        });
        toast("Inventory updated and restocked successfully!", "success");
        const view = document.getElementById("view");
        if (view) Views.operations(view, [opsState.tab]);
      },
    });
  } catch (e) {
    toast("Failed to load items: " + e.message, "error");
  }
}


// ============================================================ MODAL: NEW WORK ORDER
async function openNewWorkOrderModal() {
  try {
    const empRes = await API.get("/employees", { per_page: 200 });
    const employees = empRes.data || [];
    const empOpts = [{ value: "", label: "Unassigned" }].concat(
      employees.map(e => ({ value: e.id, label: e.full_name + (e.department_name ? " (" + e.department_name + ")" : "") }))
    );

    openFormModal({
      title: "Create Hotel Work Order",
      subtitle: "Dispatch housekeeping, maintenance, guest request, or facilities task",
      fields: [
        { name: "title", label: "Work Order Summary", placeholder: "e.g. AC thermostat check in Suite 402", required: true },
        {
          name: "category", label: "Category", type: "select",
          options: [
            { value: "Housekeeping", label: "Housekeeping / Room Turnover" },
            { value: "Maintenance", label: "Engineering & Maintenance" },
            { value: "Guest Request", label: "Guest Concierge Request" },
            { value: "Facilities", label: "Facilities & Banquets" },
            { value: "Safety & Hygiene", label: "Health, Safety & Hygiene" },
          ],
          value: "Maintenance", required: true,
        },
        { name: "location", label: "Room # or Location", placeholder: "e.g. Room 304 or Grand Ballroom", required: true },
        {
          name: "wing", label: "Hotel Wing", type: "select",
          options: [
            { value: "East Wing", label: "East Wing (Deluxe Rooms)" },
            { value: "West Wing", label: "West Wing (Executive Suites)" },
            { value: "Penthouse", label: "Penthouse & VIP Floor" },
            { value: "Public Areas", label: "Lobby, Restaurant & Banquets" },
            { value: "Wellness & Pool", label: "Wellness Pavilion & Pool" },
          ],
          value: "East Wing", required: true,
        },
        { name: "floor", label: "Floor", placeholder: "Floor 3", default: "Floor 1" },
        {
          name: "priority", label: "Priority", type: "select",
          options: [
            { value: "low", label: "Low Priority (Scheduled Routine)" },
            { value: "medium", label: "Medium (Turnover SLA Standard)" },
            { value: "high", label: "High (Guest in Room / VIP Arrival)" },
            { value: "emergency", label: "Emergency (Immediate Response)" },
          ],
          value: "medium", required: true,
        },
        { name: "assigned_to_id", label: "Assign Staff", type: "select", options: empOpts, value: "" },
        { name: "description", label: "Full Instructions / Defect Notes", type: "textarea", placeholder: "Describe the defect or requested items in detail…" },
      ],
      submitLabel: "Dispatch Work Order",
      async onSubmit(vals) {
        await API.post("/operations/work-orders", {
          title: vals.title,
          category: vals.category,
          location: vals.location,
          wing: vals.wing,
          floor: vals.floor,
          priority: vals.priority,
          assigned_to_id: vals.assigned_to_id ? Number(vals.assigned_to_id) : null,
          description: vals.description,
        });
        toast("Work order created and dispatched!", "success");
        const view = document.getElementById("view");
        if (view) Views.operations(view, [opsState.tab]);
      },
    });
  } catch (e) {
    toast("Failed: " + e.message, "error");
  }
}


// ============================================================ MODAL: REGISTER NEW INVENTORY ITEM
function openNewInventoryItemModal() {
  openFormModal({
    title: "Register Hotel Supply Item",
    subtitle: "Add a new consumable, linen, or amenity to the central catalog",
    fields: [
      { name: "name", label: "Item Name", placeholder: "e.g. Scented Diffuser Sticks (White Tea)", required: true },
      { name: "sku", label: "SKU Code", placeholder: "e.g. AMN-DIF-16", required: true },
      {
        name: "category", label: "Category", type: "select",
        options: [
          { value: "Linen & Bedding", label: "Linen & Bedding" },
          { value: "Guest Amenities", label: "Guest Amenities" },
          { value: "Food & Beverage", label: "Food & Beverage Provisions" },
          { value: "Cleaning Supplies", label: "Cleaning & Disinfection" },
          { value: "Engineering & Spares", label: "Engineering & Spares" },
          { value: "Front Desk Supplies", label: "Front Desk & Stationery" },
        ],
        value: "Guest Amenities", required: true,
      },
      {
        name: "location", label: "Primary Storeroom", type: "select",
        options: [
          { value: "Central Linen & Laundry Store", label: "Central Linen & Laundry Store" },
          { value: "Housekeeping Central Pantry", label: "Housekeeping Central Pantry" },
          { value: "F&B & Bar Storeroom", label: "F&B & Bar Storeroom" },
          { value: "Facilities & Engineering Store", label: "Facilities & Engineering Store" },
          { value: "Front Desk & Concierge Supplies", label: "Front Desk & Concierge Supplies" },
          { value: "Guest Amenities & Mini-Bar Hub", label: "Guest Amenities & Mini-Bar Hub" },
        ],
        value: "Housekeeping Central Pantry", required: true,
      },
      { name: "current_stock", label: "Initial Stock Quantity", type: "number", default: 100, required: true },
      { name: "reorder_level", label: "Reorder Par Threshold", type: "number", default: 25, required: true },
      { name: "ideal_par_level", label: "Ideal Target Par", type: "number", default: 150 },
      { name: "unit", label: "Unit of Measure", placeholder: "pcs, sets, bottles, boxes", default: "pcs" },
      { name: "unit_cost", label: "Unit Purchase Cost ($)", type: "number", default: 5.50 },
      { name: "supplier", label: "Preferred Supplier", placeholder: "e.g. Ocean Amenities Ltd" },
    ],
    submitLabel: "Save Supply Item",
    async onSubmit(vals) {
      await API.post("/operations/inventory", vals);
      toast("New supply item registered in catalog", "success");
      const view = document.getElementById("view");
      if (view) Views.operations(view, [opsState.tab]);
    },
  });
}


// ============================================================ MODAL: STOREROOM / HUB FORM (CREATE & EDIT)
function openStoreroomFormModal(existing) {
  const isEdit = Boolean(existing && existing.id);
  openFormModal({
    title: isEdit ? ("Edit Storeroom / Hub: " + existing.name) : "Create Hotel Storeroom / Rooms Hub",
    subtitle: isEdit ? "Update storeroom details, location, and capacity" : "Register a central storeroom, floor pantry, or guest room hub",
    fields: [
      { name: "name", label: "Storeroom / Hub Name", placeholder: "e.g. West Wing Executive Rooms Hub", default: existing ? existing.name : "", required: true },
      { name: "code", label: "Hub Code", placeholder: "e.g. HUB-WW-01", default: existing ? existing.code : "" },
      {
        name: "hub_type", label: "Hub Type", type: "select",
        options: [
          { value: "rooms_hub", label: "Rooms Hub (Guest Rooms & Suites Wing)" },
          { value: "central_storeroom", label: "Central Storeroom (Linen & Bulk Laundry)" },
          { value: "pantry", label: "Housekeeping Floor Pantry" },
          { value: "engineering_store", label: "Facilities & Engineering Workshop" },
          { value: "fnb_store", label: "F&B, Bar & Kitchen Storeroom" },
          { value: "frontdesk", label: "Front Desk & Concierge Storage" },
        ],
        default: existing ? (existing.hub_type || "rooms_hub") : "rooms_hub",
        required: true,
      },
      { name: "category", label: "Category", placeholder: "e.g. Guest Rooms & Suites", default: existing ? existing.category : "Guest Rooms & Suites", required: true },
      { name: "location", label: "Physical Location", placeholder: "e.g. Floors 4-7 West Wing Corridor", default: existing ? existing.location : "", required: true },
      { name: "floor", label: "Floor Level", placeholder: "e.g. Floors 4-7 or Ground Floor", default: existing ? existing.floor : "Ground Floor" },
      { name: "wing", label: "Hotel Wing", placeholder: "e.g. West Wing, East Wing, Penthouse", default: existing ? existing.wing : "West Wing" },
      { name: "manager_name", label: "Supervisor / Lead In-Charge", placeholder: "e.g. Daniel Osei", default: existing ? existing.manager_name : "Daniel Osei" },
      { name: "capacity_utilization", label: "Current Utilization (%)", type: "number", default: existing ? (existing.capacity_utilization || 0) : 50 },
      { name: "max_capacity", label: "Max Capacity (Rooms / Bays)", type: "number", default: existing ? (existing.max_capacity || 100) : 100 },
      {
        name: "icon", label: "Icon Graphic", type: "select",
        options: [
          { value: "layers", label: "Layers (Central Store)" },
          { value: "bed", label: "Bed (Rooms Hub / Linen)" },
          { value: "sparkle", label: "Sparkle (Housekeeping / Amenities)" },
          { value: "coffee", label: "Coffee (F&B / Mini-Bar)" },
          { value: "sliders", label: "Sliders (Engineering / HVAC)" },
          { value: "box", label: "Box (Supplies / Inventory)" },
          { value: "key", label: "Key (Front Desk / Access)" },
          { value: "star", label: "Star (VIP / Executive Suites)" },
        ],
        default: existing ? (existing.icon || "layers") : "layers",
      },
      { name: "description", label: "Description & Purpose", type: "textarea", placeholder: "Notes on rooms serviced, stock kept, and operating hours…", default: existing ? existing.description : "" },
    ],
    submitLabel: isEdit ? "Update Storeroom / Hub" : "Create Storeroom / Hub",
    async onSubmit(vals) {
      if (isEdit) {
        await API.put("/operations/storerooms/" + existing.id, vals);
        toast("Storeroom updated successfully", "success");
      } else {
        const res = await API.post("/operations/storerooms", vals);
        toast("Storeroom created successfully", "success");
        if (res && res.data && res.data.id) {
          opsState.selectedHubId = res.data.id;
        }
      }
      const view = document.getElementById("view");
      if (view) Views.operations(view, [opsState.tab]);
    },
  });
}


// ============================================================ MODAL: SUB-SECTION & ROOM FORM (CREATE & EDIT)
async function openSectionFormModal(prefillStoreroomId, existing) {
  try {
    const storeRes = await API.get("/operations/storerooms");
    const storerooms = storeRes.data || [];
    const storeOpts = storerooms.map(s => ({
      value: s.id,
      label: s.name + " (" + (s.hub_type || "hub").replace("_", " ") + ")"
    }));

    const isEdit = Boolean(existing && existing.id);
    const parentId = prefillStoreroomId || (existing && existing.storeroom_id) || (storerooms[0] && storerooms[0].id);

    openFormModal({
      title: isEdit ? ("Edit Sub-Section / Room: " + existing.name) : "Add Sub-Section, Room or Space",
      subtitle: isEdit ? "Modify room specifications, type, or supervisor" : "Configure a guest room, storage bay, or housekeeping cart station in this hub",
      fields: [
        {
          name: "storeroom_id", label: "Parent Hub / Storeroom", type: "select",
          options: storeOpts, default: parentId, required: true,
        },
        {
          name: "section_type", label: "Space Classification", type: "select",
          options: [
            { value: "room", label: "Hotel Guest Room / Suite" },
            { value: "storage_bay", label: "Storage Bay / Core Area" },
            { value: "pantry", label: "Housekeeping Floor Pantry" },
            { value: "service_cart", label: "Turnover Service Cart Station" },
            { value: "space", label: "General Hub Sub-Section / Space" },
            { value: "shelf", label: "Storage Rack / Shelving Unit" },
          ],
          default: existing ? (existing.section_type || "room") : "room",
          required: true,
        },
        { name: "room_number", label: "Room / Bay # (if applicable)", placeholder: "e.g. 401, 402, 201, Bay-A", default: existing ? existing.room_number : "" },
        { name: "name", label: "Section / Room Display Name", placeholder: "e.g. Suite 401 · Executive King Suite", default: existing ? existing.name : "", required: true },
        {
          name: "room_type", label: "Room Type / Space Specification", placeholder: "e.g. Executive Suite, Deluxe King, Standard Twin, Linen Bay",
          default: existing ? existing.room_type : "Executive Suite",
        },
        {
          name: "room_status", label: "Operational Status", type: "select",
          options: [
            { value: "clean", label: "Clean / Inspected & Ready" },
            { value: "occupied", label: "Occupied by Guest" },
            { value: "turnover_in_progress", label: "Turnover in Progress" },
            { value: "inspected", label: "Supervisor Inspection Pending" },
            { value: "maintenance", label: "Out of Order / Maintenance" },
          ],
          default: existing ? (existing.room_status || "clean") : "clean",
          required: true,
        },
        { name: "capacity", label: "Capacity (Guests or Units)", type: "number", default: existing ? (existing.capacity || 2) : 2 },
        { name: "supervisor_name", label: "Supervisor / Room Attendant", placeholder: "e.g. Ama Mensah", default: existing ? existing.supervisor_name : "" },
        { name: "notes", label: "Notes & Amenities Features", type: "textarea", placeholder: "Key features, special guest requests, bed configuration…", default: existing ? existing.notes : "" },
      ],
      submitLabel: isEdit ? "Update Space" : "Save Room / Space",
      async onSubmit(vals) {
        if (isEdit) {
          await API.put("/operations/sections/" + existing.id, vals);
          toast("Room / Space updated successfully", "success");
        } else {
          await API.post("/operations/storerooms/" + vals.storeroom_id + "/sections", vals);
          toast("Room / Space added to hub successfully", "success");
        }
        opsState.selectedHubId = Number(vals.storeroom_id);
        const view = document.getElementById("view");
        if (view) Views.operations(view, [opsState.tab]);
      },
    });
  } catch (err) {
    toast("Error loading hub details: " + err.message, "error");
  }
}


// ============================================================ MODAL: PLACE EQUIPMENT IN ROOM / SPACE
async function openAssignEquipmentModal(prefillSectionId) {
  try {
    const storeRes = await API.get("/operations/storerooms");
    const storerooms = storeRes.data || [];
    const allSections = [];
    storerooms.forEach(s => {
      (s.sections || []).forEach(sec => {
        allSections.push({
          value: sec.id,
          label: (sec.room_number ? ("[" + sec.room_number + "] ") : "") + sec.name + " (" + s.name + ")",
        });
      });
    });

    if (allSections.length === 0) {
      toast("Please create at least one room or sub-section first", "warning");
      return;
    }

    const targetSecId = prefillSectionId || allSections[0].value;

    openFormModal({
      title: "Place Equipment Asset in Room / Space",
      subtitle: "Deploy TVs, espresso machines, mini-bars, safes, or machinery to a specific hotel room or section",
      fields: [
        {
          name: "section_id", label: "Target Room / Sub-Section", type: "select",
          options: allSections, default: targetSecId, required: true,
        },
        { name: "name", label: "Equipment / Asset Name", placeholder: 'e.g. Samsung 55" 4K Smart Hospitality TV', required: true },
        { name: "tag", label: "Asset Tag (leave blank to auto-generate)", placeholder: "e.g. EQP-TV-401" },
        {
          name: "category", label: "Equipment Category", type: "select",
          options: [
            { value: "Hospitality Electronics & Entertainment", label: "Electronics & Smart TVs" },
            { value: "In-Room Hospitality Appliances", label: "In-Room Appliances (Coffee, Mini-Bar, Safe)" },
            { value: "Climate Control & Air Handling", label: "Climate Control, HVAC & Thermostats" },
            { value: "Housekeeping & Laundry Machinery", label: "Housekeeping & Laundry Machinery" },
            { value: "Facilities & Engineering Tools", label: "Engineering & Maintenance Equipment" },
            { value: "Other Hospitality Assets", label: "Other Asset" },
          ],
          default: "Hospitality Electronics & Entertainment",
          required: true,
        },
        { name: "serial_no", label: "Serial Number", placeholder: "e.g. SN-401-SAMS-001" },
        {
          name: "condition", label: "Operating Condition", type: "select",
          options: [
            { value: "operational", label: "Operational & Tested" },
            { value: "excellent", label: "Brand New / Mint Condition" },
            { value: "good", label: "Good / Standard Wear" },
            { value: "needs_inspection", label: "Needs Supervisor Inspection" },
            { value: "faulty", label: "Faulty / Requires Maintenance" },
          ],
          default: "operational",
          required: true,
        },
        { name: "value", label: "Book / Replacement Value ($)", type: "number", default: 450.00 },
        { name: "notes", label: "Equipment Notes", placeholder: "Warranty, port connections, or maintenance notes…" },
      ],
      submitLabel: "Place Equipment in Room",
      async onSubmit(vals) {
        await API.post("/operations/sections/" + vals.section_id + "/assign-equipment", vals);
        toast("Equipment placed in room / space successfully", "success");
        // Find which storeroom owns this section so we can select it
        for (const s of storerooms) {
          if ((s.sections || []).some(sec => sec.id === Number(vals.section_id))) {
            opsState.selectedHubId = s.id;
            break;
          }
        }
        const view = document.getElementById("view");
        if (view) Views.operations(view, [opsState.tab]);
      },
    });
  } catch (err) {
    toast("Error loading spaces: " + err.message, "error");
  }
}


// ============================================================ MODAL: ALLOCATE STOCK TO ROOM / SPACE
async function openAssignStockModal(prefillSectionId) {
  try {
    const [storeRes, invRes] = await Promise.all([
      API.get("/operations/storerooms"),
      API.get("/operations/inventory"),
    ]);
    const storerooms = storeRes.data || [];
    const invItems = invRes.data || [];

    const allSections = [];
    storerooms.forEach(s => {
      (s.sections || []).forEach(sec => {
        allSections.push({
          value: sec.id,
          label: (sec.room_number ? ("[" + sec.room_number + "] ") : "") + sec.name + " (" + s.name + ")",
        });
      });
    });

    if (allSections.length === 0) {
      toast("Please create at least one room or sub-section first", "warning");
      return;
    }

    const targetSecId = prefillSectionId || allSections[0].value;

    openFormModal({
      title: "Stock Supplies in Room / Space",
      subtitle: "Allocate bedding, towels, amenities, coffee, or spare parts to this space",
      fields: [
        {
          name: "section_id", label: "Target Room / Sub-Section", type: "select",
          options: allSections, default: targetSecId, required: true,
        },
        { name: "name", label: "Supply Item Name", placeholder: "e.g. Egyptian Cotton King Bed Sheets (400TC)", required: true },
        { name: "sku", label: "SKU Code (leave blank to auto-generate)", placeholder: "e.g. LIN-KNG-01" },
        {
          name: "category", label: "Category", type: "select",
          options: [
            { value: "Linen & Bedding", label: "Linen & Bedding" },
            { value: "Guest Amenities", label: "Guest Amenities" },
            { value: "Food & Beverage", label: "Food & Beverage Provisions" },
            { value: "Cleaning Supplies", label: "Cleaning & Disinfection" },
            { value: "Engineering & Spares", label: "Engineering & Spares" },
            { value: "Front Desk Supplies", label: "Front Desk & Stationery" },
          ],
          default: "Linen & Bedding",
          required: true,
        },
        { name: "current_stock", label: "Quantity to Stock", type: "number", default: 20, required: true },
        { name: "reorder_level", label: "Par Reorder Threshold", type: "number", default: 5 },
        { name: "unit", label: "Unit of Measure", placeholder: "sets, pcs, boxes, bottles", default: "sets" },
        { name: "unit_cost", label: "Unit Cost ($)", type: "number", default: 45.00 },
        { name: "supplier", label: "Supplier", placeholder: "e.g. Nile Heritage Hospitality Linens Ltd", default: "Nile Heritage Hospitality Linens Ltd" },
      ],
      submitLabel: "Confirm & Stock Supplies",
      async onSubmit(vals) {
        await API.post("/operations/sections/" + vals.section_id + "/assign-stock", vals);
        toast("Supplies allocated to room / space successfully", "success");
        for (const s of storerooms) {
          if ((s.sections || []).some(sec => sec.id === Number(vals.section_id))) {
            opsState.selectedHubId = s.id;
            break;
          }
        }
        const view = document.getElementById("view");
        if (view) Views.operations(view, [opsState.tab]);
      },
    });
  } catch (err) {
    toast("Error loading spaces: " + err.message, "error");
  }
}
