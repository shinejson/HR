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
  const validTabs = ["dashboard", "inventory", "workorders", "storerooms", "readiness", "assets", "safety", "settings"];
  opsState.tab = (sub && validTabs.includes(sub)) ? sub : "dashboard";

  root.innerHTML = pageHead("Hotel Operations", "Loading operations workspace…", "", "Department") + spinners(4);

  try {
    // Fetch data in parallel
    const [dashRes, invRes, woRes, storeRes, assetRes] = await Promise.all([
      API.get("/operations/dashboard", { period: opsState.period }),
      API.get("/operations/inventory"),
      API.get("/operations/work-orders"),
      API.get("/operations/storerooms"),
      API.get("/assets", { per_page: 200 }),
    ]);

    const dash = (dashRes && dashRes.data) || {};
    const inventory = (invRes && invRes.data) || [];
    const workOrders = (woRes && woRes.data) || [];
    const storerooms = (storeRes && storeRes.data) || [];
    const assets = (assetRes && assetRes.data) || [];

    const tabs = [
      ["dashboard", "Overview"],
      ["inventory", "Supplies & Inventory"],
      ["workorders", "Work Orders"],
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

      const fulfillmentDonutHTML = '<div class="card span-2"><div class="card-head">'
        + '<div><h3>Service & Work Order Fulfillment</h3><div class="sub">Current monthly turnover and guest requests breakdown</div></div>'
        + '<div class="right"><span class="pill-tag">' + esc(opsState.period.replace("_", " ").toUpperCase()) + '</span></div>'
        + '</div><div class="card-body">'
        + '<div class="donut-stat-row">'
        + '<div style="position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        + donut(woStatus.items, 150)
        + '<div style="position:absolute;text-align:center;pointer-events:none">'
        + '<div style="font-family:var(--serif);font-size:20px;font-weight:600;color:var(--ink);line-height:1.1">' + (woStatus.total ? woStatus.total.toLocaleString() : "1,842") + '</div>'
        + '<div class="tiny muted">Total Orders</div>'
        + '</div>'
        + '</div>'
        + '<div class="donut-legend">'
        + woStatus.items.map(item =>
            '<div class="donut-legend-item">'
            + '<div class="legend-left"><span class="legend-dot" style="background:' + item.color + '"></span><span>' + esc(item.label) + '</span></div>'
            + '<div><span class="legend-val">' + item.value.toLocaleString() + '</span><span class="legend-pct">' + item.pct + '%</span></div>'
            + '</div>'
          ).join("")
        + '</div>'
        + '</div>'
        + '</div></div>';

      const lowStockCardHTML = '<div class="card span-2"><div class="card-head">'
        + '<div><h3>Low Stock Alerts</h3><div class="sub">Hotel consumables and guest amenities below par levels</div></div>'
        + '<div class="right"><span class="link" data-opstab="inventory">View All Supplies →</span></div>'
        + '</div><div class="card-body" style="padding:10px 18px">'
        + '<table class="low-stock-table">'
        + '<thead><tr>'
        + '<th>Item Description</th>'
        + '<th>SKU</th>'
        + '<th>Current</th>'
        + '<th>Reorder Level</th>'
        + '<th style="text-align:right">Action</th>'
        + '</tr></thead>'
        + '<tbody>'
        + (lowStockAlerts.length ? lowStockAlerts.slice(0, 5).map(item =>
            '<tr>'
            + '<td><div class="row" style="gap:8px">'
            + '<div class="kpi-icon ' + (item.current <= item.reorder_level / 2 ? "red" : "amber") + '" style="width:28px;height:28px;border-radius:7px">' + icon(item.icon || "box", 13) + '</div>'
            + '<div><b>' + esc(item.name) + '</b><div class="tiny muted">' + esc(item.location) + '</div></div>'
            + '</div></td>'
            + '<td><span class="mono tiny">' + esc(item.sku) + '</span></td>'
            + '<td><span class="chip red"><b>' + item.current + '</b> ' + esc(item.unit) + '</span></td>'
            + '<td><span class="muted">' + item.reorder_level + ' ' + esc(item.unit) + '</span></td>'
            + '<td style="text-align:right"><button class="btn btn-sm btn-soft" data-quick-restock-id="' + item.id + '">' + icon("zap", 11) + ' Restock</button></td>'
            + '</tr>'
          ).join("") : '<tr><td colspan="5" class="tiny muted" style="text-align:center;padding:20px">All hotel items are stocked above par levels.</td></tr>')
        + '</tbody></table>'
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

    // ============================================================ TAB: STOREROOMS
    } else if (opsState.tab === "storerooms") {
      body = '<div class="grid grid-3">'
        + storerooms.map(s =>
            '<div class="card"><div class="card-head">'
            + '<div class="row" style="gap:10px">'
            + '<div class="kpi-icon teal" style="width:34px;height:34px;border-radius:9px">' + icon(s.icon || "layers", 16) + '</div>'
            + '<div><h3>' + esc(s.name) + '</h3><div class="sub">' + esc(s.location) + '</div></div>'
            + '</div>'
            + '</div><div class="card-body stack">'
            + '<p class="small muted">' + esc(s.description) + '</p>'
            + '<div class="divider"></div>'
            + '<dl class="kv">'
            + '<dt>Category</dt><dd>' + esc(s.category) + '</dd>'
            + '<dt>Supervisor</dt><dd>' + esc(s.manager) + '</dd>'
            + '<dt>Capacity Meter</dt><dd><div class="progress" style="width:100px;margin-top:5px"><i style="width:' + s.capacity_utilization + '%;background:var(--teal)"></i></div></dd>'
            + '<dt>Utilization</dt><dd><b>' + s.capacity_utilization + '%</b></dd>'
            + '</dl>'
            + '<button class="btn btn-sm btn-ghost" data-filter-store="' + esc(s.name) + '">' + icon("eye", 12) + ' Inspect Storeroom Supplies</button>'
            + '</div></div>'
          ).join("")
        + '</div>';

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
    root.innerHTML = pageHead(
      "Hotel Operations",
      "Executive command centre for storerooms, linen inventory, guest work orders, room turnaround, and property readiness.",
      '<button class="btn btn-ghost" id="ops-top-restock">' + icon("zap", 15) + ' Restock Supplies</button>'
      + '<button class="btn btn-accent" id="ops-top-wo">' + icon("plus", 15) + ' New Work Order</button>',
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

  } catch (e) {
    root.innerHTML = pageHead("Hotel Operations", "Error loading operations", "", "Department")
      + emptyState("Unable to load Hotel Operations", e.message, "alert");
  }
};


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

    openFormModal({
      title: "Hotel Stock Adjustment & Restock",
      subtitle: "Record vendor deliveries received, stock issued to floors, or audit count",
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
        { name: "quantity", label: "Quantity", type: "number", default: 50, required: true },
        { name: "reason", label: "Source / Destination / Floor", default: "Central Store Delivery", hint: "e.g., 'Vendor: Nile Heritage' or 'Issued to 4th Floor Housekeeping'" },
        { name: "reference_no", label: "PO or Reference #", default: "PO-" + Math.floor(1000 + Math.random() * 9000) },
      ],
      submitLabel: "Update Inventory Stock",
      async onSubmit(vals) {
        await API.post("/operations/inventory/adjust", {
          item_id: Number(vals.item_id),
          quantity: Number(vals.quantity),
          movement_type: vals.movement_type,
          reason: vals.reason,
          reference_no: vals.reference_no,
        });
        toast("Inventory updated successfully!", "success");
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
