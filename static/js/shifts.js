/* ============================================================
   SHIFT ROSTER MANAGEMENT - Weekly Calendar Grid
   Auto-Run Scheduling & Department Grouping Engine
   ============================================================ */

const RosterState = {
  weekStart: null,
  departmentId: "all",
  roster: [],
  shifts: [],
  departments: [],
  departmentName: "All Departments",
  isAll: true,
  selectedCells: new Set(),
  canEdit: false,
  isLoading: false,
};

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNum = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

function formatDateRange(start, end) {
  const sMonth = start.toLocaleDateString("en-GB", { month: "short" });
  const eMonth = end.toLocaleDateString("en-GB", { month: "short" });
  const sDay = start.getDate();
  const eDay = end.getDate();
  const sYear = start.getFullYear();
  const eYear = end.getFullYear();

  if (sYear === eYear) {
    if (sMonth === eMonth) {
      return `${sMonth} ${sDay} – ${eDay}, ${sYear}`;
    }
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${sYear}`;
  }
  return `${sMonth} ${sDay}, ${sYear} – ${eMonth} ${eDay}, ${sYear}`;
}

function isDateToday(dateStr) {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return dateStr === `${y}-${m}-${d}`;
}

/**
 * Main Roster View Handler (Standalone #/roster page)
 */
Views.roster = async function (root, params) {
  if (params && params[0]) {
    RosterState.departmentId = params[0] === "all" ? "all" : (isNaN(Number(params[0])) ? "all" : Number(params[0]));
  }
  await renderRosterComponent(root, { embedded: false });
};

/**
 * Reusable component function that can mount into standalone or embedded tab
 */
async function renderRosterComponent(container, options = {}) {
  const isEmbedded = !!options.embedded;

  if (!RosterState.weekStart) {
    RosterState.weekStart = getMonday(new Date());
  }

  container.innerHTML = '<div class="card card-pad" style="text-align:center;padding:48px 20px">'
    + '<div class="spinner" style="margin:0 auto 14px"></div>'
    + '<div class="muted">Loading weekly shift roster…</div>'
    + '</div>';

  await loadRoster(container, isEmbedded);
}

// Make accessible to views2.js tabs
window.renderRosterComponent = renderRosterComponent;

async function loadRoster(container, isEmbedded) {
  try {
    const params = {};
    if (RosterState.weekStart) params.week_start = RosterState.weekStart;
    if (RosterState.departmentId) params.department_id = RosterState.departmentId;

    const res = await API.get("/roster", params);
    const data = res.data || {};

    RosterState.roster = data.roster || [];
    RosterState.shifts = data.shifts || [];
    RosterState.departments = data.departments || [];
    RosterState.weekStart = data.week_start || RosterState.weekStart;
    RosterState.departmentId = data.department_id !== undefined ? data.department_id : RosterState.departmentId;
    RosterState.departmentName = data.department_name || "All Departments";
    RosterState.isAll = data.is_all !== undefined ? !!data.is_all : (RosterState.departmentId === "all");
    RosterState.canEdit = !!data.can_edit;
    RosterState.selectedCells.clear();

    renderRosterGrid(container, data, isEmbedded);
  } catch (err) {
    console.error("Failed to load shift roster:", err);
    if (err && (err.status === 403 || (err.message && err.message.toLowerCase().includes("permission")))) {
      container.innerHTML = '<div class="card card-pad" style="text-align:center;padding:60px 20px">'
        + '<div style="font-size:44px;margin-bottom:14px">🔒</div>'
        + '<h3 style="margin-bottom:8px">Access Restricted</h3>'
        + '<p class="muted" style="max-width:440px;margin:0 auto 16px">'
        + esc(err.message || "You do not have permission to view or manage this department roster.")
        + '</p>'
        + (RosterState.departments && RosterState.departments.length > 0
          ? '<div style="margin-top:16px"><select class="select" id="roster-fallback-dept" style="width:220px">'
            + RosterState.departments.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")
            + '</select></div>'
          : '')
        + '</div>';

      const fb = container.querySelector("#roster-fallback-dept");
      if (fb) {
        fb.onchange = () => {
          RosterState.departmentId = Number(fb.value);
          loadRoster(container, isEmbedded);
        };
      }
    } else {
      container.innerHTML = '<div class="card card-pad" style="text-align:center;padding:50px 20px">'
        + '<div style="font-size:36px;margin-bottom:12px;color:var(--red)">⚠️</div>'
        + '<h3 style="margin-bottom:6px">Unable to Load Shift Roster</h3>'
        + '<p class="muted" style="margin-bottom:16px">' + esc(err.message || "An unexpected error occurred.") + '</p>'
        + '<button class="btn btn-soft" id="btn-roster-retry">' + icon("refresh", 14) + ' Try Again</button>'
        + '</div>';

      const retryBtn = container.querySelector("#btn-roster-retry");
      if (retryBtn) retryBtn.onclick = () => loadRoster(container, isEmbedded);
    }
  }
}

function renderRosterGrid(container, data, isEmbedded) {
  const weekStart = new Date(data.week_start + "T00:00:00");
  const weekEnd = new Date(data.week_end + "T00:00:00");
  const weekDisplay = formatDateRange(weekStart, weekEnd);

  // Generate 7 days (Mon-Sun)
  const days = [];
  const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    days.push({
      dateStr,
      dayName: dayNames[i],
      dayNum: d.getDate(),
      monthShort: d.toLocaleDateString("en-GB", { month: "short" }),
      isToday: isDateToday(dateStr),
      isWeekend: i >= 5,
    });
  }

  // Department selector with "All Departments (Grouped)" option
  const deptList = RosterState.departments || [];
  let deptSelectHtml = "";
  if (deptList.length > 0) {
    const isAllSelected = String(RosterState.departmentId) === "all";
    deptSelectHtml = '<div style="display:flex;align-items:center;gap:8px">'
      + '<span class="tiny muted" style="font-weight:600;letter-spacing:.05em">VIEW:</span>'
      + '<select class="select" id="roster-dept-select" style="min-width:230px;font-weight:600;font-size:12.5px">'
      + (Store.isRole("super_admin", "hr_admin", "hr_officer") || deptList.length > 1
          ? `<option value="all"${isAllSelected ? " selected" : ""}>🏢 All Departments (Grouped)</option>`
          : "")
      + deptList.map(dept => {
          const sel = !isAllSelected && String(dept.id) === String(RosterState.departmentId) ? " selected" : "";
          return `<option value="${dept.id}"${sel}>${esc(dept.name)}</option>`;
        }).join("")
      + '</select>'
      + '</div>';
  } else if (data.department_name) {
    deptSelectHtml = `<div class="pill-tag" style="font-size:12px;font-weight:600">${esc(data.department_name)} Department</div>`;
  }

  // Header actions for standalone page
  let headHtml = "";
  if (!isEmbedded) {
    const headerActions = (RosterState.canEdit
        ? '<button class="btn btn-accent" id="btn-auto-roster" title="Automatically generate and balance shifts across departments">' + icon("zap", 14) + ' Auto-Run Roster</button>'
        : '')
      + (RosterState.canEdit
        ? '<button class="btn btn-soft" id="btn-bulk-assign" style="display:none">' + icon("check", 14) + ' Assign Selected</button>'
        : '')
      + '<button class="btn btn-ghost" id="btn-manage-shifts">' + icon("settings", 14) + ' Shift Types</button>'
      + (Store.isRole("super_admin", "hr_admin", "hr_officer")
        ? '<a href="#/shifts" class="btn btn-ghost" title="Shift configuration">' + icon("clock", 14) + ' Config</a>'
        : '');

    headHtml = pageHead(
      "Weekly Shift Roster",
      "Department weekly schedule — Auto-run shifts, balance coverage, and view staff grouped by department",
      headerActions,
      "Time & Absence"
    );
  }

  // Shifts legend pills
  const legendHtml = '<div class="row" style="gap:6px;align-items:center;flex-wrap:wrap">'
    + '<span class="tiny muted" style="font-weight:600;margin-right:2px">SHIFTS:</span>'
    + RosterState.shifts.map(s => {
        return `<span class="roster-legend" style="background:${s.color || '#0f766e'};color:white;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700" title="${esc(s.name)} (${esc(s.start_time || '')} – ${esc(s.end_time || '')})">`
          + esc(s.code || s.name.slice(0, 2).toUpperCase())
          + `</span>`;
      }).join("")
    + '</div>';

  // Toolbar
  const toolbarHtml = '<div class="card card-pad" style="padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">'
    + '<div class="row" style="gap:14px;align-items:center;flex-wrap:wrap">'
    + deptSelectHtml
    + '<div class="row" style="gap:6px;align-items:center">'
    + '<button class="btn btn-ghost btn-sm" id="btn-prev-week" title="Previous Week" style="padding:4px 8px">' + icon("chevronLeft", 14) + '</button>'
    + '<div id="roster-week-label" style="min-width:190px;text-align:center;font-weight:700;font-size:13px;letter-spacing:.02em;color:var(--text)">'
    + weekDisplay
    + '</div>'
    + '<button class="btn btn-ghost btn-sm" id="btn-next-week" title="Next Week" style="padding:4px 8px">' + icon("chevronRight", 14) + '</button>'
    + '<button class="btn btn-soft btn-sm" id="btn-today" style="margin-left:4px">Today</button>'
    + '</div>'
    + '</div>'
    + '<div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">'
    + (isEmbedded && RosterState.canEdit
        ? '<button class="btn btn-accent btn-sm" id="btn-auto-roster">' + icon("zap", 13) + ' Auto-Run Roster</button>'
        : '')
    + (isEmbedded && RosterState.canEdit
        ? '<button class="btn btn-soft btn-sm" id="btn-bulk-assign" style="display:none">' + icon("check", 13) + ' Assign Selected</button>'
        : '')
    + (isEmbedded
        ? '<button class="btn btn-ghost btn-sm" id="btn-manage-shifts" style="font-size:12px">' + icon("settings", 13) + ' Shift Types</button>'
        : '')
    + legendHtml
    + '</div>'
    + '</div>';

  // Build Grouped Table Rows
  let tableRowsHtml = "";
  const employees = RosterState.roster || [];

  if (employees.length === 0) {
    tableRowsHtml = '<tr><td colspan="8" style="text-align:center;padding:64px 20px">'
      + '<div style="font-size:36px;margin-bottom:10px;color:var(--muted-2)">👥</div>'
      + '<div style="font-weight:600;font-size:14px;margin-bottom:4px">No Active Employees to Display</div>'
      + '<div class="tiny muted">There are no active employees registered under the selected department filter.</div>'
      + '</td></tr>';
  } else {
    // Group employees by department_id
    const deptGroups = new Map();
    employees.forEach(emp => {
      const deptId = emp.department_id || 0;
      if (!deptGroups.has(deptId)) {
        deptGroups.set(deptId, {
          deptId: deptId,
          deptName: emp.department_name || "General Department",
          members: []
        });
      }
      deptGroups.get(deptId).members.push(emp);
    });

    // Render each department group
    deptGroups.forEach(group => {
      const memberCount = group.members.length;

      // Department Section Header Row
      tableRowsHtml += '<tr class="roster-dept-header-row">'
        + '<td colspan="8" class="roster-dept-header-cell">'
        + '<div class="row-between" style="align-items:center">'
        + '<div class="row" style="gap:10px;align-items:center">'
        + '<span style="font-size:16px">🏢</span>'
        + '<span class="roster-dept-title">' + esc(group.deptName) + '</span>'
        + '<span class="chip teal" style="font-size:11px;font-weight:600;padding:2px 8px">' + memberCount + ' Team Member' + (memberCount > 1 ? 's' : '') + '</span>'
        + '</div>'
        + (RosterState.canEdit
            ? '<button type="button" class="btn btn-ghost btn-sm btn-dept-auto-schedule" data-dept-id="' + group.deptId + '" data-dept-name="' + esc(group.deptName) + '" style="font-size:11px;padding:3px 10px;height:26px" title="Auto-schedule shifts for ' + esc(group.deptName) + '">'
              + icon("zap", 12) + ' Auto-Schedule ' + esc(group.deptName)
              + '</button>'
            : '')
        + '</div>'
        + '</td>'
        + '</tr>';

      // Employees under this department
      group.members.forEach(emp => {
        let cellsHtml = "";
        days.forEach(d => {
          const assignment = (emp.days && emp.days[d.dateStr]) || {};
          const shiftCode = assignment.shift_code || "";
          const shiftColor = assignment.shift_color || "";
          const shiftName = assignment.shift_name || "";
          const cellId = `${emp.employee_id}_${d.dateStr}`;
          const isSelected = RosterState.selectedCells.has(cellId);

          let badgeContent = "";
          if (shiftCode) {
            badgeContent = `<div class="roster-shift-badge" style="background:${shiftColor || '#0f766e'};color:white" title="${esc(shiftName)}">${esc(shiftCode)}</div>`;
          } else {
            badgeContent = `<div class="roster-shift-badge" style="background:transparent;color:var(--muted-2);border:1px dashed var(--line);font-size:13px;font-weight:400" title="Click to assign shift">+</div>`;
          }

          const cellClasses = [
            "roster-cell",
            d.isWeekend ? "roster-weekend" : "",
            d.isToday ? "roster-today" : "",
            RosterState.canEdit ? "roster-clickable" : "",
            isSelected ? "roster-selected" : "",
          ].filter(Boolean).join(" ");

          cellsHtml += `<td class="${cellClasses}" `
            + `data-cell-id="${cellId}" `
            + `data-employee-id="${emp.employee_id}" `
            + `data-employee-name="${esc(emp.employee_name)}" `
            + `data-work-date="${d.dateStr}" `
            + `data-shift-id="${assignment.shift_id || ''}" `
            + `data-notes="${esc(assignment.notes || '')}">`
            + badgeContent
            + `</td>`;
        });

        tableRowsHtml += '<tr class="roster-row">'
          + '<td class="roster-td-name" style="position:sticky;left:0;z-index:2;background:var(--card)">'
          + personCell({ name: emp.employee_name, employee_no: emp.employee_no })
          + '</td>'
          + cellsHtml
          + '</tr>';
      });
    });
  }

  const tableHtml = '<div class="card" style="overflow-x:auto;box-shadow:var(--shadow-sm)">'
    + '<table class="roster-table">'
    + '<thead><tr>'
    + '<th class="roster-th-name" style="position:sticky;left:0;z-index:3;background:var(--paper);min-width:200px">TEAM MEMBER</th>'
    + days.map(d => {
        const thClasses = [
          "roster-th-day",
          d.isWeekend ? "roster-weekend" : "",
          d.isToday ? "roster-today" : "",
        ].filter(Boolean).join(" ");

        return `<th class="${thClasses}">`
          + `<div style="font-weight:700;font-size:11px">${d.dayName}</div>`
          + `<div style="font-size:12px;font-weight:600;margin-top:2px;color:${d.isToday ? 'var(--teal)' : 'var(--text)'}">${d.dayNum} ${d.monthShort}</div>`
          + `</th>`;
      }).join("")
    + '</tr></thead>'
    + '<tbody>'
    + tableRowsHtml
    + '</tbody>'
    + '</table>'
    + '</div>';

  container.innerHTML = headHtml + toolbarHtml + tableHtml;

  // Bind interactive events
  bindRosterEvents(container, isEmbedded);
}

function bindRosterEvents(container, isEmbedded) {
  // 1. Previous / Next / Today
  const prevBtn = container.querySelector("#btn-prev-week");
  const nextBtn = container.querySelector("#btn-next-week");
  const todayBtn = container.querySelector("#btn-today");

  if (prevBtn) {
    prevBtn.onclick = () => {
      const d = new Date(RosterState.weekStart + "T00:00:00");
      d.setDate(d.getDate() - 7);
      RosterState.weekStart = getMonday(d);
      loadRoster(container, isEmbedded);
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      const d = new Date(RosterState.weekStart + "T00:00:00");
      d.setDate(d.getDate() + 7);
      RosterState.weekStart = getMonday(d);
      loadRoster(container, isEmbedded);
    };
  }

  if (todayBtn) {
    todayBtn.onclick = () => {
      RosterState.weekStart = getMonday(new Date());
      loadRoster(container, isEmbedded);
    };
  }

  // 2. Department selector
  const deptSelect = container.querySelector("#roster-dept-select");
  if (deptSelect) {
    deptSelect.onchange = () => {
      const val = deptSelect.value;
      RosterState.departmentId = val === "all" ? "all" : Number(val);
      loadRoster(container, isEmbedded);
    };
  }

  // 3. Auto-Run Shift Roster button
  const autoBtn = container.querySelector("#btn-auto-roster");
  if (autoBtn) {
    autoBtn.onclick = () => openAutoGenerateModal(null, null, container, isEmbedded);
  }

  // 4. Per-Department Quick Auto-Schedule buttons
  container.querySelectorAll(".btn-dept-auto-schedule").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const deptId = Number(btn.dataset.deptId);
      const deptName = btn.dataset.deptName;
      openAutoGenerateModal(deptId, deptName, container, isEmbedded);
    };
  });

  // 5. Shift Types modal
  const manageBtn = container.querySelector("#btn-manage-shifts");
  if (manageBtn) {
    manageBtn.onclick = () => openManageShiftsModal();
  }

  // 6. Bulk assign button
  const bulkBtn = container.querySelector("#btn-bulk-assign");
  if (bulkBtn) {
    bulkBtn.onclick = () => openBulkAssignModal(container, isEmbedded);
  }

  // 7. Clickable cells
  if (RosterState.canEdit) {
    container.querySelectorAll(".roster-clickable").forEach(cell => {
      cell.onclick = (e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey || RosterState.selectedCells.size > 0) {
          toggleCellSelection(cell, container);
        } else {
          const empId = Number(cell.dataset.employeeId);
          const empName = cell.dataset.employeeName;
          const workDate = cell.dataset.workDate;
          const shiftId = cell.dataset.shiftId ? Number(cell.dataset.shiftId) : null;
          const notes = cell.dataset.notes || "";
          openAssignShiftModal({ id: empId, name: empName }, workDate, shiftId, notes, container, isEmbedded);
        }
      };

      cell.oncontextmenu = (e) => {
        e.preventDefault();
        toggleCellSelection(cell, container);
      };
    });
  }
}

function toggleCellSelection(cell, container) {
  const cellId = cell.dataset.cellId;
  if (!cellId) return;

  if (RosterState.selectedCells.has(cellId)) {
    RosterState.selectedCells.delete(cellId);
    cell.classList.remove("roster-selected");
  } else {
    RosterState.selectedCells.add(cellId);
    cell.classList.add("roster-selected");
  }

  const bulkBtn = container.querySelector("#btn-bulk-assign");
  if (bulkBtn) {
    if (RosterState.selectedCells.size > 0) {
      bulkBtn.style.display = "inline-flex";
      bulkBtn.innerHTML = icon("check", 14) + ` Assign Selected (${RosterState.selectedCells.size})`;
    } else {
      bulkBtn.style.display = "none";
    }
  }
}

/**
 * AUTO-RUN MODAL: Auto-schedule shifts with chosen algorithm
 */
function openAutoGenerateModal(preSelectedDeptId, preSelectedDeptName, container, isEmbedded) {
  const deptList = RosterState.departments || [];
  const currentWeekStart = RosterState.weekStart || getMonday(new Date());

  // Calculate next week Monday
  const nextWeekDate = new Date(currentWeekStart + "T00:00:00");
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeekStart = getMonday(nextWeekDate);

  const currentRangeLabel = formatDateRange(new Date(currentWeekStart + "T00:00:00"), new Date(new Date(currentWeekStart + "T00:00:00").getTime() + 6 * 86400000));
  const nextRangeLabel = formatDateRange(new Date(nextWeekStart + "T00:00:00"), new Date(new Date(nextWeekStart + "T00:00:00").getTime() + 6 * 86400000));

  let deptSelectHtml = '<select class="select" id="auto-dept-select" style="width:100%;font-weight:600">'
    + '<option value="all"' + (!preSelectedDeptId ? ' selected' : '') + '>🏢 All Departments (Grouped Schedule)</option>'
    + deptList.map(dept => {
        const isSel = preSelectedDeptId && String(dept.id) === String(preSelectedDeptId);
        return `<option value="${dept.id}"${isSel ? ' selected' : ''}>${esc(dept.name)}</option>`;
      }).join("")
    + '</select>';

  const bodyHtml = '<div class="stack" style="gap:18px">'
    + '<div class="card card-pad" style="background:var(--paper);padding:12px 16px;border-left:3px solid var(--teal)">'
    + '<div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px">' + icon("zap", 15) + ' Auto-Run Shift Scheduler</div>'
    + '<div class="tiny muted" style="margin-top:2px">Automatically distribute shifts across active employees using fair rotations, hospital-grade 24/7 coverage, or standard business schedules.</div>'
    + '</div>'

    + '<div class="grid grid-2" style="gap:12px">'
    + '<div class="form-group">'
    + '<label class="label">Target Department(s)</label>'
    + deptSelectHtml
    + '</div>'
    + '<div class="form-group">'
    + '<label class="label">Target Week</label>'
    + '<select class="select" id="auto-week-select" style="width:100%;font-weight:600">'
    + '<option value="' + currentWeekStart + '" selected>Current Week (' + currentRangeLabel + ')</option>'
    + '<option value="' + nextWeekStart + '">Next Week (' + nextRangeLabel + ')</option>'
    + '</select>'
    + '</div>'
    + '</div>'

    + '<div class="form-group">'
    + '<label class="label">Scheduling Algorithm / Strategy</label>'
    + '<div class="stack" style="gap:10px" id="strategy-options">'

    + '<label class="strategy-card selected">'
    + '<input type="radio" name="auto_strategy" value="balanced_rotation" checked style="display:none">'
    + '<div class="strategy-icon">🔄</div>'
    + '<div class="strategy-content">'
    + '<div class="strategy-title">Balanced Shift Rotation (Recommended)</div>'
    + '<div class="strategy-desc">5 working days + 2 rest days per employee. Staggers days off across staff so the department always has active coverage every day, fairly rotating Early, Afternoon, Mid, and Late shifts.</div>'
    + '</div>'
    + '</label>'

    + '<label class="strategy-card">'
    + '<input type="radio" name="auto_strategy" value="standard_weekdays" style="display:none">'
    + '<div class="strategy-icon">🏢</div>'
    + '<div class="strategy-content">'
    + '<div class="strategy-title">Standard Business Week (Mon – Fri)</div>'
    + '<div class="strategy-desc">Monday through Friday scheduled on standard working hours; Saturday and Sunday marked as Day Off (OFF). Ideal for corporate, HR, Finance, and Administration.</div>'
    + '</div>'
    + '</label>'

    + '<label class="strategy-card">'
    + '<input type="radio" name="auto_strategy" value="hospitality_24_7" style="display:none">'
    + '<div class="strategy-icon">🏨</div>'
    + '<div class="strategy-content">'
    + '<div class="strategy-title">24/7 Hospitality Continuous Coverage</div>'
    + '<div class="strategy-desc">Round-the-clock hotel coverage (Early morning checkouts, Afternoon operations, Late night audit). Staff assigned 5 on / 2 off with seamless rotational handovers.</div>'
    + '</div>'
    + '</label>'

    + '<label class="strategy-card">'
    + '<input type="radio" name="auto_strategy" value="copy_previous_week" style="display:none">'
    + '<div class="strategy-icon">📋</div>'
    + '<div class="strategy-content">'
    + '<div class="strategy-title">Copy From Previous Week</div>'
    + '<div class="strategy-desc">Replicates the exact shift assignments from the preceding week into the target week, preserving established shift patterns.</div>'
    + '</div>'
    + '</label>'

    + '</div>'
    + '</div>'

    + '<div style="background:var(--card);padding:10px 14px;border:1px solid var(--line);border-radius:8px">'
    + '<label class="row" style="cursor:pointer;font-size:12.5px;font-weight:500;gap:8px">'
    + '<input type="checkbox" id="auto-overwrite-toggle" style="accent-color:var(--teal)">'
    + '<span>Overwrite existing shift assignments <span class="muted tiny">(If unchecked, only empty/unassigned slots will be filled)</span></span>'
    + '</label>'
    + '</div>'

    + '<div class="row-between" style="margin-top:8px">'
    + '<button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>'
    + '<button type="button" class="btn btn-accent" id="btn-run-auto-schedule">' + icon("zap", 14) + ' Run Auto-Schedule</button>'
    + '</div>'
    + '</div>';

  openModal({
    title: "Auto-Run Shift Roster",
    sub: preSelectedDeptName ? `Scheduling for ${preSelectedDeptName}` : "Bulk automated scheduling across departments",
    body: bodyHtml,
    wide: true,
  });

  // Strategy card selection highlighting
  document.querySelectorAll(".strategy-card").forEach(card => {
    card.onclick = () => {
      document.querySelectorAll(".strategy-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    };
  });

  // Run button handler
  const runBtn = document.getElementById("btn-run-auto-schedule");
  if (runBtn) {
    runBtn.onclick = async () => {
      const deptVal = document.getElementById("auto-dept-select").value;
      const targetWeek = document.getElementById("auto-week-select").value;
      const stratRadio = document.querySelector('input[name="auto_strategy"]:checked');
      const strategy = stratRadio ? stratRadio.value : "balanced_rotation";
      const overwrite = document.getElementById("auto-overwrite-toggle").checked;

      runBtn.disabled = true;
      runBtn.innerHTML = spinners(1) + " Scheduling…";

      try {
        const payload = {
          week_start: targetWeek,
          department_id: deptVal,
          strategy: strategy,
          overwrite: overwrite,
        };

        const res = await API.post("/roster/auto-generate", payload);
        toast(res.message || "Shift roster auto-generated successfully!", "teal");
        closeModal();

        // Update current viewed week if user generated for next week
        RosterState.weekStart = targetWeek;
        RosterState.departmentId = deptVal === "all" ? "all" : Number(deptVal);
        await loadRoster(container, isEmbedded);
      } catch (err) {
        toast(err.message || "Failed to auto-generate shift roster", "error");
        runBtn.disabled = false;
        runBtn.innerHTML = icon("zap", 14) + " Run Auto-Schedule";
      }
    };
  }
}

function openAssignShiftModal(employee, workDate, currentShiftId, currentNotes, container, isEmbedded) {
  const dateObj = new Date(workDate + "T00:00:00");
  const dateDisplay = dateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  let shiftOptionsHtml = RosterState.shifts.map(shift => {
    const isChecked = currentShiftId === shift.id;
    return '<label class="shift-option" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid ' + (isChecked ? 'var(--teal)' : 'var(--line)') + ';border-radius:8px;cursor:pointer;transition:all .15s;background:var(--card)">'
      + '<input type="radio" name="shift_choice" value="' + shift.id + '"' + (isChecked ? ' checked' : '') + ' style="margin:0;accent-color:var(--teal)">'
      + '<div class="roster-shift-badge" style="background:' + (shift.color || '#0f766e') + ';color:white;min-width:44px">' + esc(shift.code || shift.name.slice(0, 2).toUpperCase()) + '</div>'
      + '<div style="flex:1">'
      + '<div style="font-weight:600;font-size:12.5px">' + esc(shift.name) + '</div>'
      + '<div class="tiny muted">' + esc(shift.start_time || '—') + ' – ' + esc(shift.end_time || '—') + '</div>'
      + '</div>'
      + '</label>';
  }).join("");

  // Day off / clear option
  const isOffChecked = !currentShiftId;
  shiftOptionsHtml += '<label class="shift-option" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid ' + (isOffChecked ? 'var(--teal)' : 'var(--line)') + ';border-radius:8px;cursor:pointer;transition:all .15s;background:var(--card)">'
    + '<input type="radio" name="shift_choice" value=""' + (isOffChecked ? ' checked' : '') + ' style="margin:0;accent-color:var(--teal)">'
    + '<div class="roster-shift-badge" style="background:#94a3b8;color:white;min-width:44px">OFF</div>'
    + '<div style="flex:1">'
    + '<div style="font-weight:600;font-size:12.5px">Day Off (OFF)</div>'
    + '<div class="tiny muted">No work hours scheduled</div>'
    + '</div>'
    + '</label>';

  const bodyHtml = '<div class="stack" style="gap:16px">'
    + '<div class="grid grid-2" style="gap:10px">'
    + shiftOptionsHtml
    + '</div>'
    + '<div class="form-group">'
    + '<label class="label">Assignment Notes (Optional)</label>'
    + '<input class="input" type="text" id="roster-assign-notes" placeholder="e.g. Covering front desk turnover" value="' + esc(currentNotes || '') + '">'
    + '</div>'
    + '<div class="row-between" style="margin-top:8px">'
    + '<button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>'
    + '<button type="button" class="btn btn-accent" id="btn-save-roster-assignment">' + icon("check", 14) + ' Save Assignment</button>'
    + '</div>'
    + '</div>';

  openModal({
    title: "Assign Shift",
    sub: `${employee.name} — ${dateDisplay}`,
    body: bodyHtml,
    wide: true,
  });

  // Highlight active radio on click
  document.querySelectorAll(".shift-option").forEach(opt => {
    const radio = opt.querySelector('input[type="radio"]');
    opt.onclick = () => {
      radio.checked = true;
      document.querySelectorAll(".shift-option").forEach(o => o.style.borderColor = "var(--line)");
      opt.style.borderColor = "var(--teal)";
    };
  });

  const saveBtn = document.getElementById("btn-save-roster-assignment");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const selected = document.querySelector('input[name="shift_choice"]:checked');
      const shiftId = selected && selected.value ? Number(selected.value) : null;
      const notesInput = document.getElementById("roster-assign-notes");
      const notes = notesInput ? notesInput.value.trim() : "";

      saveBtn.disabled = true;
      saveBtn.innerHTML = spinners(1) + " Saving…";

      try {
        await API.post("/roster/assign", {
          employee_id: employee.id,
          work_date: workDate,
          shift_id: shiftId,
          notes: notes,
        });

        toast("Shift assigned successfully", "teal");
        closeModal();
        await loadRoster(container, isEmbedded);
      } catch (err) {
        toast(err.message || "Failed to assign shift", "error");
        saveBtn.disabled = false;
        saveBtn.innerHTML = icon("check", 14) + " Save Assignment";
      }
    };
  }
}

function openBulkAssignModal(container, isEmbedded) {
  const selectedCount = RosterState.selectedCells.size;
  if (selectedCount === 0) {
    toast("No cells selected for bulk assignment", "error");
    return;
  }

  let shiftOptionsHtml = RosterState.shifts.map(shift => {
    return '<label class="shift-option" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid var(--line);border-radius:8px;cursor:pointer;background:var(--card)">'
      + '<input type="radio" name="bulk_shift_choice" value="' + shift.id + '" style="margin:0;accent-color:var(--teal)">'
      + '<div class="roster-shift-badge" style="background:' + (shift.color || '#0f766e') + ';color:white;min-width:44px">' + esc(shift.code || shift.name.slice(0, 2).toUpperCase()) + '</div>'
      + '<div style="flex:1">'
      + '<div style="font-weight:600;font-size:12.5px">' + esc(shift.name) + '</div>'
      + '<div class="tiny muted">' + esc(shift.start_time || '—') + ' – ' + esc(shift.end_time || '—') + '</div>'
      + '</div>'
      + '</label>';
  }).join("");

  // Option for OFF
  shiftOptionsHtml += '<label class="shift-option" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid var(--line);border-radius:8px;cursor:pointer;background:var(--card)">'
    + '<input type="radio" name="bulk_shift_choice" value="" style="margin:0;accent-color:var(--teal)">'
    + '<div class="roster-shift-badge" style="background:#94a3b8;color:white;min-width:44px">OFF</div>'
    + '<div style="flex:1">'
    + '<div style="font-weight:600;font-size:12.5px">Day Off (OFF)</div>'
    + '<div class="tiny muted">Clear to Day Off</div>'
    + '</div>'
    + '</label>';

  const bodyHtml = '<div class="stack" style="gap:16px">'
    + '<div class="card card-pad" style="background:var(--paper);padding:10px 14px;border-left:3px solid var(--teal)">'
    + '<div style="font-weight:600;font-size:13px">Applying to ' + selectedCount + ' selected shift slot' + (selectedCount > 1 ? 's' : '') + '</div>'
    + '<div class="tiny muted">All selected employee slots will be updated with the chosen shift.</div>'
    + '</div>'
    + '<div class="grid grid-2" style="gap:10px">'
    + shiftOptionsHtml
    + '</div>'
    + '<div class="row-between" style="margin-top:10px">'
    + '<button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>'
    + '<button type="button" class="btn btn-accent" id="btn-save-bulk-shifts">' + icon("check", 14) + ' Apply to ' + selectedCount + ' Slots</button>'
    + '</div>'
    + '</div>';

  openModal({
    title: "Bulk Assign Shift",
    sub: `${selectedCount} shift assignments selected`,
    body: bodyHtml,
    wide: true,
  });

  document.querySelectorAll(".shift-option").forEach(opt => {
    const radio = opt.querySelector('input[type="radio"]');
    opt.onclick = () => {
      radio.checked = true;
      document.querySelectorAll(".shift-option").forEach(o => o.style.borderColor = "var(--line)");
      opt.style.borderColor = "var(--teal)";
    };
  });

  const saveBtn = document.getElementById("btn-save-bulk-shifts");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const selected = document.querySelector('input[name="bulk_shift_choice"]:checked');
      if (!selected) {
        toast("Please select a shift to apply", "error");
        return;
      }
      const shiftId = selected.value ? Number(selected.value) : null;

      const assignments = [];
      document.querySelectorAll(".roster-selected").forEach(cell => {
        const empId = Number(cell.dataset.employeeId);
        const workDate = cell.dataset.workDate;
        if (empId && workDate) {
          assignments.push({
            employee_id: empId,
            work_date: workDate,
            shift_id: shiftId,
          });
        }
      });

      if (assignments.length === 0) {
        toast("No valid assignments found in selected cells", "error");
        return;
      }

      saveBtn.disabled = true;
      saveBtn.innerHTML = spinners(1) + " Updating…";

      try {
        const res = await API.post("/roster/bulk-assign", { assignments });
        toast(res.message || `${assignments.length} shifts assigned successfully`, "teal");
        closeModal();
        RosterState.selectedCells.clear();
        await loadRoster(container, isEmbedded);
      } catch (err) {
        toast(err.message || "Failed to bulk assign shifts", "error");
        saveBtn.disabled = false;
        saveBtn.innerHTML = icon("check", 14) + ` Apply to ${selectedCount} Slots`;
      }
    };
  }
}

function openManageShiftsModal() {
  const shifts = RosterState.shifts || [];

  const listHtml = shifts.map(s => {
    return '<tr style="border-bottom:1px solid var(--line)">'
      + '<td style="padding:10px 12px">'
      + '<span class="roster-shift-badge" style="background:' + (s.color || '#0f766e') + ';color:white;min-width:44px">'
      + esc(s.code || s.name.slice(0, 2).toUpperCase())
      + '</span>'
      + '</td>'
      + '<td style="padding:10px 12px;font-weight:600;font-size:13px">' + esc(s.name) + '</td>'
      + '<td style="padding:10px 12px;font-size:12.5px;color:var(--muted-2)">' + esc(s.start_time || '—') + ' – ' + esc(s.end_time || '—') + '</td>'
      + '<td style="padding:10px 12px;text-align:center">'
      + '<div style="width:24px;height:24px;border-radius:6px;background:' + (s.color || '#0f766e') + ';margin:0 auto;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.1)"></div>'
      + '</td>'
      + '</tr>';
  }).join("");

  const bodyHtml = '<div class="stack" style="gap:14px">'
    + '<div class="card" style="max-height:360px;overflow-y:auto">'
    + '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'
    + '<thead><tr style="background:var(--paper);border-bottom:2px solid var(--line)">'
    + '<th style="text-align:left;padding:10px 12px;font-size:10px;letter-spacing:.08em;color:var(--muted-2);font-weight:700">CODE</th>'
    + '<th style="text-align:left;padding:10px 12px;font-size:10px;letter-spacing:.08em;color:var(--muted-2);font-weight:700">SHIFT NAME</th>'
    + '<th style="text-align:left;padding:10px 12px;font-size:10px;letter-spacing:.08em;color:var(--muted-2);font-weight:700">HOURS</th>'
    + '<th style="text-align:center;padding:10px 12px;font-size:10px;letter-spacing:.08em;color:var(--muted-2);font-weight:700">COLOR</th>'
    + '</tr></thead>'
    + '<tbody>'
    + listHtml
    + '</tbody>'
    + '</table>'
    + '</div>'
    + (Store.isRole("super_admin", "hr_admin", "hr_officer")
      ? '<div class="row-between" style="margin-top:8px">'
        + '<div class="tiny muted">To add or edit working hours and overtime multipliers, visit Shift Configuration.</div>'
        + '<button type="button" class="btn btn-accent btn-sm" id="btn-go-shift-config">' + icon("settings", 13) + ' Shift Configuration</button>'
        + '</div>'
      : '')
    + '</div>';

  openModal({
    title: "Operational Shift Types",
    sub: "Configured shifts for department scheduling",
    body: bodyHtml,
    wide: true,
  });

  const goBtn = document.getElementById("btn-go-shift-config");
  if (goBtn) {
    goBtn.onclick = () => {
      closeModal();
      location.hash = "#/shifts";
    };
  }
}
