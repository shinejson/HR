/* ==========================================================================
   Meridian HR — Enterprise Interactive DataTable & Modern HR Command Palette
   Zero-dependency sorting, multi-facet filtering, date ranges, pagination,
   page-size control, column visibility, density toggle, bulk actions & CSV/Print
   ========================================================================== */

const DT_INSTANCES = new Map();
const DT_STATE_CACHE = new Map();
let _dtUidSeq = 0;

function getDtDensity() {
  try { return localStorage.getItem("hrms_dt_density") || "comfortable"; }
  catch (_) { return "comfortable"; }
}
function setDtDensity(mode) {
  try { localStorage.setItem("hrms_dt_density", mode); } catch (_) {}
  document.documentElement.setAttribute("data-dt-density", mode);
}
setDtDensity(getDtDensity());

/* Delegated event helper — survives tbody pagination, sorting, and filtering */
function onDelegate(container, eventType, selector, handler) {
  if (!container) return;
  container.addEventListener(eventType, function (ev) {
    const target = ev.target && ev.target.closest ? ev.target.closest(selector) : null;
    if (target && container.contains(target)) {
      handler(target, ev);
    }
  });
}

function stripHtmlText(html) {
  if (html === null || html === undefined) return "";
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizeFacetValue(val) {
  const s = String(val === null || val === undefined ? "" : val).trim();
  if (!s) return "—";
  if (/^[A-Z0-9_-]{2,6}$/.test(s) && /\d/.test(s)) return s;
  if (s === s.toLowerCase() && (s.includes("_") || s.length <= 24)) {
    return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  return s;
}

const AUTO_FACET_CANDIDATES = [
  ["department_name", "Department"],
  ["branch_name", "Location"],
  ["status", "Status"],
  ["leave_type_name", "Leave type"],
  ["category_name", "Category"],
  ["category", "Category"],
  ["contract_type", "Contract"],
  ["work_location", "Work mode"],
  ["priority", "Priority"],
  ["stage", "Stage"],
  ["source", "Source"],
  ["kind", "Type"],
  ["mode", "Mode"],
  ["role_name", "Role"],
  ["channel", "Channel"],
  ["owner_role", "Owner"],
  ["event", "Event"],
  ["type", "Type"],
  ["proficiency", "Proficiency"],
  ["period_label", "Pay period"],
];

const AUTO_DATE_CANDIDATES = [
  ["work_date", "Date"],
  ["start_date", "Start date"],
  ["claim_date", "Claim date"],
  ["hire_date", "Joined"],
  ["purchase_date", "Purchased"],
  ["due_date", "Due date"],
  ["holiday_date", "Date"],
  ["scheduled_at", "Scheduled"],
  ["sent_at", "Sent"],
  ["created_at", "Created"],
];

function discoverFacets(cfg, rows) {
  if (Array.isArray(cfg.filters)) {
    return cfg.filters.map(f => {
      const counts = new Map();
      rows.forEach(r => {
        const raw = f.extract ? f.extract(r) : r[f.key];
        if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
          const k = String(raw);
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      });
      let opts = f.options;
      if (!opts) {
        opts = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
          .map(v => ({ value: v, label: humanizeFacetValue(v), count: counts.get(v) }));
      } else {
        opts = opts.map(o => {
          const obj = typeof o === "object" ? { value: String(o.value), label: o.label } : { value: String(o), label: humanizeFacetValue(o) };
          obj.count = counts.get(obj.value) || 0;
          return obj;
        });
      }
      return { key: f.key, label: f.label || humanizeFacetValue(f.key), extract: f.extract, options: opts };
    }).filter(f => f.options && f.options.length > 0);
  }
  if (cfg.autoFilters === false || !rows || rows.length < 2) return [];
  const discovered = [];
  const usedLabels = new Set();
  for (const [key, label] of AUTO_FACET_CANDIDATES) {
    if (discovered.length >= 4) break;
    if (usedLabels.has(label)) continue;
    const counts = new Map();
    let nonEmpty = 0;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i] ? rows[i][key] : undefined;
      if (v !== null && v !== undefined && String(v).trim() !== "" && typeof v !== "object") {
        const s = String(v).trim();
        if (s.length > 48) continue;
        counts.set(s, (counts.get(s) || 0) + 1);
        nonEmpty++;
      }
    }
    if (nonEmpty >= 2 && counts.size >= 2 && counts.size <= 15) {
      usedLabels.add(label);
      const options = Array.from(counts.keys())
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
        .map(v => ({ value: v, label: humanizeFacetValue(v), count: counts.get(v) }));
      discovered.push({ key, label, options });
    }
  }
  return discovered;
}

function discoverDateField(cfg, rows) {
  if (cfg.dateField === false) return null;
  if (typeof cfg.dateField === "string" && cfg.dateField) {
    return { key: cfg.dateField, label: cfg.dateLabel || "Date" };
  }
  if (cfg.autoDateFilter === false || !rows || rows.length < 3) return null;
  for (const [key, label] of AUTO_DATE_CANDIDATES) {
    let validCount = 0;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const v = rows[i] ? rows[i][key] : null;
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) validCount++;
    }
    if (validCount >= 2) return { key, label };
  }
  return null;
}

function parseSortableValue(rawVal) {
  if (rawVal === null || rawVal === undefined) return { empty: true, type: "str", val: "" };
  if (typeof rawVal === "number" && !isNaN(rawVal)) return { empty: false, type: "num", val: rawVal };
  if (typeof rawVal === "boolean") return { empty: false, type: "num", val: rawVal ? 1 : 0 };
  const s = String(rawVal).trim();
  if (!s || s === "—" || s === "-" || s.toLowerCase() === "n/a" || s.toLowerCase() === "never") {
    return { empty: true, type: "str", val: "" };
  }
  // ISO date / datetime
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const ts = Date.parse(s);
    if (!isNaN(ts)) return { empty: false, type: "num", val: ts };
  }
  // Currency / numeric / percentage / "14 day(s)"
  const cleanedMoney = s.replace(/^(GHS|USD|EUR|GBP|₵|\$|€|£)\s*/i, "").replace(/,/g, "");
  if (/^-?\d+(\.\d+)?(%|\s*(days?|day\(s\)|mos?|months?|hrs?|hours?|pts?))?$/i.test(cleanedMoney)) {
    const num = parseFloat(cleanedMoney);
    if (!isNaN(num)) return { empty: false, type: "num", val: num };
  }
  // Compact money e.g. GHS 14.5k / 1.2m
  const compactMatch = s.match(/^(?:GHS\s*)?(-?\d+(?:\.\d+)?)\s*([km])$/i);
  if (compactMatch) {
    const mult = compactMatch[2].toLowerCase() === "m" ? 1e6 : 1e3;
    return { empty: false, type: "num", val: parseFloat(compactMatch[1]) * mult };
  }
  // Formatted date like "22 Oct 2026" or "22 Oct 2026 · 08:45"
  if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/.test(s)) {
    const datePart = s.split("·")[0].trim();
    const ts = Date.parse(datePart);
    if (!isNaN(ts)) return { empty: false, type: "num", val: ts };
  }
  return { empty: false, type: "str", val: s.toLowerCase() };
}

function getColumnCellText(col, row, origIdx) {
  if (col.exportValue) return String(col.exportValue(row, origIdx) ?? "");
  if (col.render) return stripHtmlText(col.render(row, origIdx));
  const raw = row[col.key];
  return raw === null || raw === undefined ? "" : String(raw);
}

function getColumnSortParsed(col, row, origIdx) {
  if (col.sortValue) return parseSortableValue(col.sortValue(row, origIdx));
  if (col.sortKey && row[col.sortKey] !== undefined) return parseSortableValue(row[col.sortKey]);
  if (col.key && row[col.key] !== undefined) return parseSortableValue(row[col.key]);
  return parseSortableValue(getColumnCellText(col, row, origIdx));
}

function getRowUid(cfg, row, origIdx) {
  if (cfg.rowId) return String(cfg.rowId(row, origIdx));
  if (row && row.uid !== undefined && row.uid !== null) return String(row.uid);
  if (row && row.id !== undefined && row.id !== null) return String(row.id);
  return String(origIdx);
}

function computeDtViewModel(inst) {
  const { cfg, state, facets, dateInfo } = inst;
  const rows = cfg.rows || [];
  const cols = cfg.columns || [];
  const tokens = (state.search || "").toLowerCase().trim().split(/\s+/).filter(Boolean);

  // Filter rows while preserving original index in cfg.rows
  const matched = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // 1. Facet filters
    let passFacets = true;
    for (const f of facets) {
      const fv = state.filters[f.key];
      if (fv !== undefined && fv !== "") {
        const rv = f.extract ? f.extract(row) : row[f.key];
        if (String(rv ?? "") !== String(fv)) { passFacets = false; break; }
      }
    }
    if (!passFacets) continue;

    // 2. Date range filter
    if (dateInfo && (state.dateFrom || state.dateTo)) {
      const rawDate = row[dateInfo.key] ? String(row[dateInfo.key]).slice(0, 10) : "";
      if (!rawDate) continue;
      if (state.dateFrom && rawDate < state.dateFrom) continue;
      if (state.dateTo && rawDate > state.dateTo) continue;
    }

    // 3. Multi-token search across row fields + rendered column text
    if (tokens.length) {
      if (inst._searchCorpus[i] === undefined) {
        const parts = [];
        for (const k in row) {
          const v = row[k];
          if (v !== null && v !== undefined && typeof v !== "object") parts.push(String(v));
        }
        for (let ci = 0; ci < cols.length; ci++) {
          if (cols[ci].label) parts.push(getColumnCellText(cols[ci], row, i));
        }
        inst._searchCorpus[i] = parts.join(" ").toLowerCase();
      }
      const hay = inst._searchCorpus[i];
      let allMatch = true;
      for (let ti = 0; ti < tokens.length; ti++) {
        if (!hay.includes(tokens[ti])) { allMatch = false; break; }
      }
      if (!allMatch) continue;
    }

    matched.push({ row, origIdx: i });
  }

  // Sort matched rows
  if (state.sortCol !== null && cols[state.sortCol]) {
    const col = cols[state.sortCol];
    const dir = state.sortDir === "desc" ? -1 : 1;
    const decorated = matched.map(item => ({
      item,
      parsed: getColumnSortParsed(col, item.row, item.origIdx),
    }));
    decorated.sort((a, b) => {
      if (a.parsed.empty && b.parsed.empty) return a.item.origIdx - b.item.origIdx;
      if (a.parsed.empty) return 1;
      if (b.parsed.empty) return -1;
      if (a.parsed.type === "num" && b.parsed.type === "num") {
        const diff = a.parsed.val - b.parsed.val;
        return diff !== 0 ? diff * dir : (a.item.origIdx - b.item.origIdx);
      }
      const cmp = String(a.parsed.val).localeCompare(String(b.parsed.val), undefined, { numeric: true, sensitivity: "base" });
      return cmp !== 0 ? cmp * dir : (a.item.origIdx - b.item.origIdx);
    });
    for (let i = 0; i < decorated.length; i++) matched[i] = decorated[i].item;
  }

  const totalRows = rows.length;
  const totalFiltered = matched.length;
  const pageSize = Number(state.pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;
  const startIdx = (state.page - 1) * pageSize;
  const pageItems = matched.slice(startIdx, startIdx + pageSize);

  return {
    rows,
    cols,
    matched,
    pageItems,
    totalRows,
    totalFiltered,
    pageSize,
    totalPages,
    page: state.page,
    startIdx,
  };
}

function countActiveDtFilters(inst) {
  const { state } = inst;
  let n = 0;
  if ((state.search || "").trim()) n++;
  if (state.dateFrom) n++;
  if (state.dateTo) n++;
  Object.keys(state.filters || {}).forEach(k => {
    if (state.filters[k] !== undefined && state.filters[k] !== "") n++;
  });
  return n;
}

function buildDtPageButtons(page, totalPages) {
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    const s = Math.max(2, page - 1);
    const e = Math.min(totalPages - 1, page + 1);
    for (let i = s; i <= e; i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }
  return pages.map(p => {
    if (p === "…") return '<span class="dt-ellipsis">…</span>';
    return '<button type="button" class="dt-page-btn ' + (p === page ? "active" : "") + '" data-dt-page="' + p + '">' + p + '</button>';
  }).join("");
}

function renderDtBulkBarHTML(inst, vm) {
  if (!inst.cfg.selectable) return "";
  const count = inst.selected.size;
  if (!count) return '<div class="dt-bulk-slot"></div>';
  const actions = (inst.cfg.bulkActions || []).map((ba, idx) =>
    '<button type="button" class="btn btn-sm ' + (ba.className || "btn-soft") + '" data-dt-bulk="' + idx + '">'
    + (ba.icon ? icon(ba.icon, 13) + " " : "") + esc(ba.label) + '</button>'
  ).join("");
  return '<div class="dt-bulk-slot"><div class="dt-bulk-bar">'
    + '<div class="row" style="gap:10px"><span class="dt-bulk-count">' + count + ' selected</span>'
    + '<button type="button" class="btn btn-sm btn-ghost" data-dt-clear-sel>Clear</button>'
    + (vm.totalFiltered > count ? '<button type="button" class="btn btn-sm btn-ghost" data-dt-sel-all-filtered>Select all ' + vm.totalFiltered + ' filtered</button>' : '')
    + '</div>'
    + '<div class="row wrap" style="gap:6px">'
    + actions
    + '<button type="button" class="btn btn-sm btn-ghost" data-dt-export-sel>' + icon("download", 13) + ' Export selected</button>'
    + '</div></div></div>';
}

function renderDtTableSectionHTML(inst, vm) {
  const { cfg, state } = inst;
  const cols = vm.cols;
  const visibleCols = cols.map((c, idx) => ({ col: c, idx })).filter(x => !state.hiddenCols.has(x.idx));
  const selectable = !!cfg.selectable;

  const allOnPageSelected = selectable && vm.pageItems.length > 0 && vm.pageItems.every(it => inst.selected.has(getRowUid(cfg, it.row, it.origIdx)));

  let headCells = "";
  if (selectable) {
    headCells += '<th class="dt-check-col"><input type="checkbox" class="dt-checkbox" data-dt-check-page ' + (allOnPageSelected ? "checked" : "") + ' aria-label="Select page rows"></th>';
  }
  headCells += visibleCols.map(({ col, idx }) => {
    const canSort = col.sortable !== false && !!String(col.label || "").trim();
    const isSorted = state.sortCol === idx;
    const sortCls = canSort ? " dt-sortable" + (isSorted ? " dt-sorted-" + state.sortDir : "") : "";
    const cls = ((col.class || "") + sortCls).trim();
    const sortInd = !canSort ? "" : (isSorted
      ? '<span class="dt-sort-ind active">' + (state.sortDir === "asc" ? "↑" : "↓") + '</span>'
      : '<span class="dt-sort-ind">↕</span>');
    return '<th' + (cls ? ' class="' + cls + '"' : "") + (canSort ? ' data-dt-sort="' + idx + '" title="Sort by ' + esc(col.label) + '"' : "") + '>'
      + (canSort ? '<span class="dt-th-inner"><span>' + esc(col.label) + '</span>' + sortInd + '</span>' : esc(col.label))
      + '</th>';
  }).join("");

  const colSpan = Math.max(1, visibleCols.length + (selectable ? 1 : 0));
  let bodyRows = "";
  if (!vm.pageItems.length) {
    const hasFilters = countActiveDtFilters(inst) > 0 && vm.totalRows > 0;
    bodyRows = '<tr><td colspan="' + colSpan + '">'
      + (hasFilters
        ? '<div class="empty"><div class="icon">' + icon("filter", 20) + '</div><h4>No matching records</h4><p>No records match your current search or filter criteria.</p><button type="button" class="btn btn-sm btn-soft" style="margin-top:10px" data-dt-reset>Clear all filters</button></div>'
        : emptyState(cfg.emptyTitle || "Nothing here yet", cfg.emptyText || "Records will appear here once added.", cfg.emptyIcon))
      + '</td></tr>';
  } else {
    bodyRows = vm.pageItems.map(({ row, origIdx }) => {
      const uid = getRowUid(cfg, row, origIdx);
      const isSel = selectable && inst.selected.has(uid);
      let tds = "";
      if (selectable) {
        tds += '<td class="dt-check-col"><input type="checkbox" class="dt-checkbox" data-dt-check-row="' + esc(uid) + '" ' + (isSel ? "checked" : "") + ' aria-label="Select row"></td>';
      }
      tds += visibleCols.map(({ col }) => {
        const val = col.render ? col.render(row, origIdx) : esc(row[col.key] === null || row[col.key] === undefined ? "—" : row[col.key]);
        return '<td' + (col.class ? ' class="' + col.class + '"' : "") + '>' + val + '</td>';
      }).join("");
      const trClasses = [];
      if (cfg.onRowClick) trClasses.push("clickable");
      if (isSel) trClasses.push("dt-row-selected");
      return '<tr' + (trClasses.length ? ' class="' + trClasses.join(" ") + '"' : "") + ' data-row="' + origIdx + '" data-dt-uid="' + esc(uid) + '">' + tds + '</tr>';
    }).join("");
  }

  return '<div class="table-wrap dt-table-wrap"><table><thead><tr>' + headCells + '</tr></thead><tbody>' + bodyRows + '</tbody></table></div>';
}

function renderDtFooterHTML(inst, vm) {
  if (inst.cfg.footer !== undefined && inst.cfg.serverSide) return inst.cfg.footer;
  const from = vm.totalFiltered === 0 ? 0 : vm.startIdx + 1;
  const to = Math.min(vm.startIdx + vm.pageSize, vm.totalFiltered);
  const filteredNote = vm.totalFiltered < vm.totalRows
    ? ' <span class="muted">(filtered from ' + vm.totalRows + ' total)</span>'
    : '';

  const sizeOptions = [5, 10, 25, 50, 100].map(sz =>
    '<option value="' + sz + '"' + (Number(vm.pageSize) === sz ? " selected" : "") + '>' + sz + ' / page</option>'
  ).join("");

  return '<div class="table-foot dt-foot">'
    + '<div class="dt-foot-info">'
    + (vm.totalFiltered > 0
      ? 'Showing <b>' + from + '–' + to + '</b> of <b>' + vm.totalFiltered + '</b> record' + (vm.totalFiltered === 1 ? "" : "s") + filteredNote
      : '0 records' + filteredNote)
    + '</div>'
    + '<div class="dt-foot-controls">'
    + '<label class="dt-pagesize-wrap" title="Rows per page"><select class="dt-pagesize" data-dt-pagesize>' + sizeOptions + '</select></label>'
    + '<div class="pager dt-pager">'
    + '<button type="button" class="dt-page-btn" data-dt-page="1" title="First page" ' + (vm.page <= 1 ? "disabled" : "") + '>«</button>'
    + '<button type="button" class="dt-page-btn" data-dt-page="' + (vm.page - 1) + '" title="Previous page" ' + (vm.page <= 1 ? "disabled" : "") + '>‹</button>'
    + buildDtPageButtons(vm.page, vm.totalPages)
    + '<button type="button" class="dt-page-btn" data-dt-page="' + (vm.page + 1) + '" title="Next page" ' + (vm.page >= vm.totalPages ? "disabled" : "") + '>›</button>'
    + '<button type="button" class="dt-page-btn" data-dt-page="' + vm.totalPages + '" title="Last page" ' + (vm.page >= vm.totalPages ? "disabled" : "") + '>»</button>'
    + '</div>'
    + (vm.totalPages > 4
      ? '<div class="dt-jump" title="Jump to page"><span>Go</span><input type="number" min="1" max="' + vm.totalPages + '" value="' + vm.page + '" class="dt-jump-input" data-dt-jump></div>'
      : '')
    + '</div></div>';
}

function renderDtToolbarHTML(inst, vm) {
  const { cfg, state, facets, dateInfo } = inst;
  if (cfg.toolbar === false) return "";
  if (!vm.totalRows && !countActiveDtFilters(inst) && !cfg.alwaysToolbar) return "";

  const activeFilters = countActiveDtFilters(inst);
  const namedCols = (cfg.columns || []).map((c, idx) => ({ label: c.label, idx })).filter(x => String(x.label || "").trim());
  const density = getDtDensity();

  const facetSelects = facets.map(f => {
    const cur = state.filters[f.key] ?? "";
    const opts = '<option value="">' + esc(f.label) + ': All</option>'
      + f.options.map(o => '<option value="' + esc(o.value) + '"' + (String(cur) === String(o.value) ? " selected" : "") + '>'
        + esc(o.label) + (o.count !== undefined ? " (" + o.count + ")" : "") + '</option>').join("");
    return '<select class="dt-filter-select ' + (cur !== "" ? "active" : "") + '" data-dt-filter="' + esc(f.key) + '" title="Filter by ' + esc(f.label) + '">' + opts + '</select>';
  }).join("");

  const dateControls = dateInfo
    ? '<div class="dt-date-range" title="Filter by ' + esc(dateInfo.label) + '">'
      + '<span class="dt-date-lbl">' + icon("calendar", 12) + ' ' + esc(dateInfo.label) + '</span>'
      + '<input type="date" class="dt-date-input" data-dt-date-from value="' + esc(state.dateFrom || "") + '" title="From date">'
      + '<span class="muted tiny">–</span>'
      + '<input type="date" class="dt-date-input" data-dt-date-to value="' + esc(state.dateTo || "") + '" title="To date">'
      + '</div>'
    : "";

  const colMenu = namedCols.length > 1
    ? '<div class="dt-col-menu-wrap">'
      + '<button type="button" class="btn btn-sm btn-ghost dt-tool-btn" data-dt-col-btn title="Show or hide columns">' + icon("columns", 13) + ' <span>Columns</span></button>'
      + '<div class="dt-col-popover hidden" data-dt-col-pop>'
      + '<div class="dt-col-pop-head"><b>Visible columns</b><button type="button" class="link tiny" data-dt-col-reset>Show all</button></div>'
      + namedCols.map(c =>
        '<label class="dt-col-item"><input type="checkbox" data-dt-col-toggle="' + c.idx + '" ' + (!state.hiddenCols.has(c.idx) ? "checked" : "") + '> <span>' + esc(c.label) + '</span></label>'
      ).join("")
      + '</div></div>'
    : "";

  return '<div class="dt-toolbar">'
    + '<div class="dt-toolbar-left">'
    + '<div class="dt-search-box">'
    + icon("search", 14)
    + '<input type="search" class="dt-search-input" data-dt-search placeholder="' + esc(cfg.searchPlaceholder || "Search & filter table…") + '" value="' + esc(state.search || "") + '">'
    + (state.search ? '<button type="button" class="dt-search-clear" data-dt-clear-search title="Clear search">×</button>' : '')
    + '</div>'
    + facetSelects
    + dateControls
    + '<span class="dt-reset-slot">'
    + (activeFilters > 0
      ? '<button type="button" class="btn btn-sm btn-ghost dt-reset-btn" data-dt-reset>' + icon("x", 12) + ' Reset (' + activeFilters + ')</button>'
      : '')
    + '</span>'
    + '</div>'
    + '<div class="dt-toolbar-right">'
    + '<button type="button" class="btn btn-sm btn-ghost dt-tool-btn" data-dt-density title="Toggle row density">'
    + icon("list", 13) + ' <span>' + (density === "compact" ? "Compact" : "Comfort") + '</span></button>'
    + colMenu
    + '<button type="button" class="btn btn-sm btn-ghost dt-tool-btn" data-dt-export title="Export filtered rows to CSV">' + icon("download", 13) + ' <span>CSV</span></button>'
    + '<button type="button" class="btn btn-sm btn-ghost dt-tool-btn" data-dt-print title="Print table">' + icon("printer", 13) + '</button>'
    + '</div></div>';
}

/* Override global renderTable so all 45+ tables across every view become live DataTables */
function renderTable(cfg) {
  cfg = cfg || {};
  // Prune detached instances periodically
  if (DT_INSTANCES.size > 40) {
    for (const [k, v] of DT_INSTANCES.entries()) {
      if (v.el && !document.body.contains(v.el)) DT_INSTANCES.delete(k);
    }
  }
  const cols = cfg.columns || [];
  const rows = cfg.rows || [];
  const routeKey = (typeof Store !== "undefined" && Store.route) ? Store.route : "app";
  const colSig = cols.map(c => c.label || "").join("|");
  const stateKey = routeKey + "::" + (cfg.id || cfg.title || colSig);

  let saved = DT_STATE_CACHE.get(stateKey);
  if (!saved) {
    saved = {
      search: "",
      filters: {},
      dateFrom: "",
      dateTo: "",
      sortCol: cfg.defaultSortCol !== undefined ? cfg.defaultSortCol : null,
      sortDir: cfg.defaultSortDir || "asc",
      page: 1,
      pageSize: cfg.defaultPageSize || cfg.pageSize || 10,
      hiddenCols: new Set(),
    };
    DT_STATE_CACHE.set(stateKey, saved);
  }

  const dtId = "dt_" + (++_dtUidSeq);
  const inst = {
    dtId,
    stateKey,
    cfg,
    state: saved,
    facets: discoverFacets(cfg, rows),
    dateInfo: discoverDateField(cfg, rows),
    selected: new Set(),
    _searchCorpus: {},
    el: null,
  };
  DT_INSTANCES.set(dtId, inst);

  const vm = computeDtViewModel(inst);
  const headHTML = cfg.title
    ? '<div class="card-head"><div><h3>' + esc(cfg.title) + '</h3>' + (cfg.sub ? '<div class="sub">' + esc(cfg.sub) + '</div>' : '') + '</div><div class="right row wrap" style="gap:8px">' + (cfg.actions || "") + '</div></div>'
    : "";

  return '<div class="' + (cfg.noCard ? "dt-root dt-nocard" : "card dt-root") + '" data-dt-id="' + dtId + '">'
    + headHTML
    + renderDtToolbarHTML(inst, vm)
    + renderDtBulkBarHTML(inst, vm)
    + '<div class="dt-body-slot">' + renderDtTableSectionHTML(inst, vm) + '</div>'
    + '<div class="dt-foot-slot">' + renderDtFooterHTML(inst, vm) + '</div>'
    + '</div>';
}

/* Refresh a DataTable without losing input focus when searching */
function refreshDtInstance(inst, mode) {
  const rootEl = inst.el;
  if (!rootEl) return;
  const vm = computeDtViewModel(inst);

  if (mode === "full") {
    const oldToolbar = rootEl.querySelector(".dt-toolbar");
    const newToolbarHTML = renderDtToolbarHTML(inst, vm);
    if (oldToolbar && newToolbarHTML) {
      oldToolbar.outerHTML = newToolbarHTML;
    } else if (!oldToolbar && newToolbarHTML) {
      const slot = rootEl.querySelector(".dt-bulk-slot") || rootEl.querySelector(".dt-body-slot");
      if (slot) slot.insertAdjacentHTML("beforebegin", newToolbarHTML);
    }
  } else {
    // Soft update: keep search box focused & update clear button + reset badge + active filter styles
    const resetSlot = rootEl.querySelector(".dt-reset-slot");
    const activeFilters = countActiveDtFilters(inst);
    if (resetSlot) {
      resetSlot.innerHTML = activeFilters > 0
        ? '<button type="button" class="btn btn-sm btn-ghost dt-reset-btn" data-dt-reset>' + icon("x", 12) + ' Reset (' + activeFilters + ')</button>'
        : '';
    }
    const searchBox = rootEl.querySelector(".dt-search-box");
    if (searchBox) {
      const existingClear = searchBox.querySelector(".dt-search-clear");
      if (inst.state.search && !existingClear) {
        searchBox.insertAdjacentHTML("beforeend", '<button type="button" class="dt-search-clear" data-dt-clear-search title="Clear search">×</button>');
      } else if (!inst.state.search && existingClear) {
        existingClear.remove();
      }
    }
    rootEl.querySelectorAll("[data-dt-filter]").forEach(sel => {
      sel.classList.toggle("active", sel.value !== "");
    });
  }

  const bulkSlot = rootEl.querySelector(".dt-bulk-slot");
  if (bulkSlot) {
    bulkSlot.outerHTML = renderDtBulkBarHTML(inst, vm);
  }
  const bodySlot = rootEl.querySelector(".dt-body-slot");
  if (bodySlot) bodySlot.innerHTML = renderDtTableSectionHTML(inst, vm);
  const footSlot = rootEl.querySelector(".dt-foot-slot");
  if (footSlot) footSlot.innerHTML = renderDtFooterHTML(inst, vm);

  if (typeof inst.cfg.onRender === "function") {
    inst.cfg.onRender(rootEl, vm);
  }
}

function exportDtToCSV(inst, onlySelected) {
  const vm = computeDtViewModel(inst);
  const cols = vm.cols
    .map((c, idx) => ({ col: c, idx }))
    .filter(x => !inst.state.hiddenCols.has(x.idx) && String(x.col.label || "").trim());
  const sourceItems = onlySelected
    ? vm.matched.filter(it => inst.selected.has(getRowUid(inst.cfg, it.row, it.origIdx)))
    : vm.matched;
  if (!sourceItems.length) {
    toast("No rows to export", "error");
    return;
  }
  const escCsv = (val) => {
    const s = String(val ?? "").replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? '"' + s + '"' : s;
  };
  const header = cols.map(x => escCsv(x.col.label)).join(",");
  const lines = sourceItems.map(({ row, origIdx }) =>
    cols.map(x => escCsv(getColumnCellText(x.col, row, origIdx))).join(",")
  );
  const csv = "\uFEFF" + [header].concat(lines).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const rawName = inst.cfg.exportName || inst.cfg.title || (typeof Store !== "undefined" && Store.route) || "meridian-hr-export";
  a.href = url;
  a.download = String(rawName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + todayISO() + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast("Exported " + sourceItems.length + " row(s) to CSV", "success");
}

function printDtTable(inst) {
  const vm = computeDtViewModel(inst);
  const cols = vm.cols
    .map((c, idx) => ({ col: c, idx }))
    .filter(x => !inst.state.hiddenCols.has(x.idx) && String(x.col.label || "").trim());
  const title = inst.cfg.title || (document.getElementById("crumb") && document.getElementById("crumb").textContent) || "Meridian HR Report";
  const rowsHtml = vm.matched.map(({ row, origIdx }) =>
    "<tr>" + cols.map(x => "<td>" + esc(getColumnCellText(x.col, row, origIdx) || "—") + "</td>").join("") + "</tr>"
  ).join("");
  const win = window.open("", "_blank", "width=980,height=720");
  if (!win) return toast("Allow pop-ups to print table", "error");
  win.document.write('<!doctype html><html><head><title>' + esc(title) + ' — Meridian HR</title>'
    + '<style>body{font-family:Inter,-apple-system,sans-serif;padding:32px;color:#14201d}h1{font-size:22px;margin:0 0 4px}.meta{color:#5a6561;font-size:12px;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;background:#f4f1ea;padding:9px 10px;border-bottom:2px solid #d5cfc3;font-size:11px;text-transform:uppercase;letter-spacing:.04em}td{padding:8px 10px;border-bottom:1px solid #e9e4d9}@media print{body{padding:12px}}</style>'
    + '</head><body><h1>' + esc(title) + '</h1><div class="meta">Meridian HR · Printed ' + esc(fmtDateTime(new Date().toISOString())) + ' · ' + vm.matched.length + ' record(s)</div>'
    + '<table><thead><tr>' + cols.map(x => '<th>' + esc(x.col.label) + '</th>').join("") + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>'
    + '<script>window.onload=function(){window.print();}<\/script></body></html>');
  win.document.close();
}

function hydrateDtElement(rootEl) {
  if (!rootEl || rootEl._dtHydrated) return;
  const dtId = rootEl.getAttribute("data-dt-id");
  const inst = DT_INSTANCES.get(dtId);
  if (!inst) return;
  rootEl._dtHydrated = true;
  inst.el = rootEl;

  // Live search input (delegated)
  rootEl.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t) return;
    if (t.matches("[data-dt-search]")) {
      inst.state.search = t.value;
      inst.state.page = 1;
      refreshDtInstance(inst, "soft");
    }
  });

  // Select / Date / Checkbox / Page-jump changes
  rootEl.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t) return;
    if (t.matches("[data-dt-filter]")) {
      const key = t.getAttribute("data-dt-filter");
      inst.state.filters[key] = t.value;
      inst.state.page = 1;
      refreshDtInstance(inst, "soft");
    } else if (t.matches("[data-dt-date-from]")) {
      inst.state.dateFrom = t.value;
      inst.state.page = 1;
      refreshDtInstance(inst, "soft");
    } else if (t.matches("[data-dt-date-to]")) {
      inst.state.dateTo = t.value;
      inst.state.page = 1;
      refreshDtInstance(inst, "soft");
    } else if (t.matches("[data-dt-pagesize]")) {
      inst.state.pageSize = Number(t.value) || 10;
      inst.state.page = 1;
      refreshDtInstance(inst, "soft");
    } else if (t.matches("[data-dt-jump]")) {
      const p = Number(t.value);
      if (p >= 1) {
        inst.state.page = p;
        refreshDtInstance(inst, "soft");
      }
    } else if (t.matches("[data-dt-col-toggle]")) {
      const colIdx = Number(t.getAttribute("data-dt-col-toggle"));
      if (t.checked) inst.state.hiddenCols.delete(colIdx);
      else if (inst.cfg.columns.length - inst.state.hiddenCols.size > 1) inst.state.hiddenCols.add(colIdx);
      else t.checked = true;
      refreshDtInstance(inst, "soft");
    } else if (t.matches("[data-dt-check-page]")) {
      const vm = computeDtViewModel(inst);
      vm.pageItems.forEach(({ row, origIdx }) => {
        const uid = getRowUid(inst.cfg, row, origIdx);
        if (t.checked) inst.selected.add(uid);
        else inst.selected.delete(uid);
      });
      refreshDtInstance(inst, "soft");
    } else if (t.matches("[data-dt-check-row]")) {
      const uid = t.getAttribute("data-dt-check-row");
      if (t.checked) inst.selected.add(uid);
      else inst.selected.delete(uid);
      refreshDtInstance(inst, "soft");
    }
  });

  // Clicks: sort, page, reset, density, columns popover, export, print, bulk actions, clickable rows
  rootEl.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!t || !t.closest) return;

    const sortTh = t.closest("[data-dt-sort]");
    if (sortTh && rootEl.contains(sortTh)) {
      const idx = Number(sortTh.getAttribute("data-dt-sort"));
      if (inst.state.sortCol === idx) {
        if (inst.state.sortDir === "asc") inst.state.sortDir = "desc";
        else { inst.state.sortCol = null; inst.state.sortDir = "asc"; }
      } else {
        inst.state.sortCol = idx;
        inst.state.sortDir = "asc";
      }
      inst.state.page = 1;
      refreshDtInstance(inst, "soft");
      return;
    }

    const pageBtn = t.closest("[data-dt-page]");
    if (pageBtn && rootEl.contains(pageBtn)) {
      if (pageBtn.disabled) return;
      inst.state.page = Number(pageBtn.getAttribute("data-dt-page")) || 1;
      refreshDtInstance(inst, "soft");
      return;
    }

    const clearSearch = t.closest("[data-dt-clear-search]");
    if (clearSearch && rootEl.contains(clearSearch)) {
      inst.state.search = "";
      inst.state.page = 1;
      const inp = rootEl.querySelector("[data-dt-search]");
      if (inp) { inp.value = ""; inp.focus(); }
      refreshDtInstance(inst, "soft");
      return;
    }

    const resetBtn = t.closest("[data-dt-reset]");
    if (resetBtn && rootEl.contains(resetBtn)) {
      inst.state.search = "";
      inst.state.filters = {};
      inst.state.dateFrom = "";
      inst.state.dateTo = "";
      inst.state.page = 1;
      refreshDtInstance(inst, "full");
      return;
    }

    const densityBtn = t.closest("[data-dt-density]");
    if (densityBtn && rootEl.contains(densityBtn)) {
      const next = getDtDensity() === "compact" ? "comfortable" : "compact";
      setDtDensity(next);
      document.querySelectorAll("[data-dt-density] span").forEach(sp => {
        sp.textContent = next === "compact" ? "Compact" : "Comfort";
      });
      return;
    }

    const colBtn = t.closest("[data-dt-col-btn]");
    if (colBtn && rootEl.contains(colBtn)) {
      ev.stopPropagation();
      const pop = rootEl.querySelector("[data-dt-col-pop]");
      if (pop) pop.classList.toggle("hidden");
      return;
    }

    const colReset = t.closest("[data-dt-col-reset]");
    if (colReset && rootEl.contains(colReset)) {
      inst.state.hiddenCols.clear();
      rootEl.querySelectorAll("[data-dt-col-toggle]").forEach(cb => { cb.checked = true; });
      refreshDtInstance(inst, "soft");
      return;
    }

    const exportBtn = t.closest("[data-dt-export]");
    if (exportBtn && rootEl.contains(exportBtn)) {
      exportDtToCSV(inst, false);
      return;
    }

    const exportSelBtn = t.closest("[data-dt-export-sel]");
    if (exportSelBtn && rootEl.contains(exportSelBtn)) {
      exportDtToCSV(inst, true);
      return;
    }

    const printBtn = t.closest("[data-dt-print]");
    if (printBtn && rootEl.contains(printBtn)) {
      printDtTable(inst);
      return;
    }

    const clearSelBtn = t.closest("[data-dt-clear-sel]");
    if (clearSelBtn && rootEl.contains(clearSelBtn)) {
      inst.selected.clear();
      refreshDtInstance(inst, "soft");
      return;
    }

    const selAllFiltered = t.closest("[data-dt-sel-all-filtered]");
    if (selAllFiltered && rootEl.contains(selAllFiltered)) {
      const vm = computeDtViewModel(inst);
      vm.matched.forEach(({ row, origIdx }) => inst.selected.add(getRowUid(inst.cfg, row, origIdx)));
      refreshDtInstance(inst, "soft");
      return;
    }

    const bulkBtn = t.closest("[data-dt-bulk]");
    if (bulkBtn && rootEl.contains(bulkBtn)) {
      const idx = Number(bulkBtn.getAttribute("data-dt-bulk"));
      const actionDef = (inst.cfg.bulkActions || [])[idx];
      if (actionDef && typeof actionDef.onAction === "function") {
        const selectedIds = Array.from(inst.selected);
        const selectedRows = (inst.cfg.rows || []).filter((r, i) => inst.selected.has(getRowUid(inst.cfg, r, i)));
        await actionDef.onAction(selectedIds, selectedRows, inst);
      }
      return;
    }

    // Row click callback support (when cfg.onRowClick is a function)
    if (typeof inst.cfg.onRowClick === "function") {
      if (t.closest("button, a, input, select, textarea, label, [data-no-rowclick]")) return;
      const tr = t.closest("tbody tr[data-row]");
      if (tr && rootEl.contains(tr)) {
        const origIdx = Number(tr.getAttribute("data-row"));
        const row = (inst.cfg.rows || [])[origIdx];
        if (row) inst.cfg.onRowClick(row, origIdx);
      }
    }
  });

  if (typeof inst.cfg.onRender === "function") {
    inst.cfg.onRender(rootEl, computeDtViewModel(inst));
  }
}

/* Enhanced server-side pagerHTML with page-size selector & full First/Prev/Next/Last buttons */
function pagerHTML(meta, opts) {
  opts = opts || {};
  if (!meta) return '<div class="table-foot dt-foot"><span>0 records</span></div>';
  const page = Number(meta.page) || 1;
  const pages = Math.max(1, Number(meta.pages) || 1);
  const total = Number(meta.total) || 0;
  const perPage = Number(meta.per_page) || 12;
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const sizes = opts.sizes || [10, 12, 25, 50, 100];
  const sizeOptions = sizes.map(sz =>
    '<option value="' + sz + '"' + (perPage === sz ? " selected" : "") + '>' + sz + ' / page</option>'
  ).join("");

  const pBtns = buildDtPageButtons(page, pages).replace(/data-dt-page=/g, "data-page=");

  return '<div class="table-foot dt-foot">'
    + '<div class="dt-foot-info">' + (total > 0 ? 'Showing <b>' + from + '–' + to + '</b> of <b>' + total + '</b> record' + (total === 1 ? "" : "s") : '0 records') + '</div>'
    + '<div class="dt-foot-controls">'
    + (opts.showPageSize !== false ? '<label class="dt-pagesize-wrap"><select class="dt-pagesize" data-per-page>' + sizeOptions + '</select></label>' : '')
    + '<div class="pager dt-pager">'
    + '<button type="button" class="dt-page-btn" data-page="1" title="First page" ' + (page <= 1 ? "disabled" : "") + '>«</button>'
    + '<button type="button" class="dt-page-btn" data-page="' + (page - 1) + '" title="Previous page" ' + (page <= 1 ? "disabled" : "") + '>‹</button>'
    + pBtns
    + '<button type="button" class="dt-page-btn" data-page="' + (page + 1) + '" title="Next page" ' + (page >= pages ? "disabled" : "") + '>›</button>'
    + '<button type="button" class="dt-page-btn" data-page="' + pages + '" title="Last page" ' + (page >= pages ? "disabled" : "") + '>»</button>'
    + '</div></div></div>';
}

function bindPager(container, fn, onPerPage) {
  if (!container) return;
  container.querySelectorAll("[data-page]").forEach(b => {
    b.onclick = () => { if (!b.disabled) fn(Number(b.dataset.page)); };
  });
  const pp = container.querySelector("[data-per-page]");
  if (pp && typeof onPerPage === "function") {
    pp.onchange = () => onPerPage(Number(pp.value));
  }
}

/* Auto-hydrate all DataTables inserted anywhere in the DOM */
function scanAndHydrateDataTables(root) {
  const scope = root && root.querySelectorAll ? root : document;
  if (root && root.nodeType === 1 && root.hasAttribute && root.hasAttribute("data-dt-id")) {
    hydrateDtElement(root);
  }
  scope.querySelectorAll("[data-dt-id]").forEach(hydrateDtElement);
}

if (typeof MutationObserver !== "undefined") {
  const dtObserver = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        const n = added[j];
        if (n.nodeType === 1) scanAndHydrateDataTables(n);
      }
    }
  });
  if (document.body) {
    dtObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      dtObserver.observe(document.body, { childList: true, subtree: true });
      scanAndHydrateDataTables(document);
    });
  }
}

document.addEventListener("click", (ev) => {
  if (!ev.target || !ev.target.closest || !ev.target.closest(".dt-col-menu-wrap")) {
    document.querySelectorAll("[data-dt-col-pop]:not(.hidden)").forEach(p => p.classList.add("hidden"));
  }
});

/* ==========================================================================
   Modern HR Command Palette (Ctrl+K / ⌘K) — Instant People, Modules & Actions
   ========================================================================== */

let _cmdOpen = false;
let _cmdActiveIdx = 0;

function getCommandCatalog(query) {
  const q = (query || "").toLowerCase().trim();
  const canManage = typeof Store !== "undefined" && Store.canManage && Store.canManage();
  const roleSlug = typeof Store !== "undefined" && Store.role ? Store.role() : null;
  const isManagerOrUp = typeof Store !== "undefined" && Store.isRole && Store.isRole("super_admin", "hr_admin", "hr_officer", "manager", "payroll");

  // 1. Quick Actions
  const actions = [
    { group: "Quick Actions", icon: "user", title: "Open My 360° Employee Profile", sub: "Personal file, contracts, compensation & skills", keywords: "me profile my file", run: () => { if (Store.user && Store.user.employee_id) openEmployeeProfile(Store.user.employee_id); else go("settings"); } },
    { group: "Quick Actions", icon: "calendar", title: "Apply for Leave", sub: "Submit annual, sick, or compassionate leave", keywords: "time off vacation request leave", run: () => { go("leave"); setTimeout(() => { if (typeof openLeaveForm === "function") openLeaveForm(); }, 180); } },
    { group: "Quick Actions", icon: "receipt", title: "Submit Expense Claim", sub: "Request reimbursement in GHS", keywords: "reimburse receipt expense claim", run: () => { go("expenses"); setTimeout(() => { if (typeof openClaimForm === "function") openClaimForm(); }, 180); } },
    { group: "Quick Actions", icon: "lifebuoy", title: "Raise HR Helpdesk Ticket", sub: "Confidential HR support or query", keywords: "support help ticket grievance", run: () => { go("helpdesk"); setTimeout(() => { if (typeof openTicketForm === "function") openTicketForm(); }, 180); } },
    { group: "Quick Actions", icon: "bell", title: "View Notification Centre", sub: "Unread alerts, leave updates & broadcasts", keywords: "alerts inbox notifications", run: () => go("notifications") },
    { group: "Quick Actions", icon: "list", title: "Toggle Compact / Comfortable Tables", sub: "Switch table row density across all modules", keywords: "density compact comfortable table", run: () => { const next = getDtDensity() === "compact" ? "comfortable" : "compact"; setDtDensity(next); toast("Table density set to " + next, "success"); } },
  ];
  if (isManagerOrUp) {
    actions.unshift({ group: "Quick Actions", icon: "checkCircle", title: "Open Unified Approvals Inbox", sub: "Approve or reject leave, claims, loans & clock edits", keywords: "inbox approve reject pending", run: () => go("approvals") });
  }
  if (canManage) {
    actions.push(
      { group: "Quick Actions", icon: "plus", title: "Add New Employee", sub: "Onboard staff member into directory", keywords: "hire onboard new staff employee", run: () => { go("employees"); setTimeout(() => { if (typeof openEmployeeForm === "function") openEmployeeForm(); }, 200); } },
      { group: "Quick Actions", icon: "megaphone", title: "Publish Announcement or Event", sub: "Broadcast via In-App, Email & SMS", keywords: "broadcast townhall email sms announcement event", run: () => go("announcements") },
      { group: "Quick Actions", icon: "mail", title: "Configure Email & SMS Gateways", sub: "SMTP, Africa's Talking, Hubtel & Twilio routing", keywords: "smtp sms email gateway settings", run: () => go("settings/email_sms") }
    );
  }

  // 2. Modules (flatten grouped NAV)
  const flatNav = [];
  ((typeof NAV !== "undefined" ? NAV : []) || []).forEach(g => {
    (g.items || []).forEach(it => {
      if (!it.roles || (roleSlug && it.roles.includes(roleSlug))) {
        flatNav.push({
          group: "Modules",
          icon: it.icon,
          title: it.label,
          sub: g.label + " module",
          keywords: (it.id + " " + it.label + " " + g.label).toLowerCase(),
          run: () => go(it.id),
        });
      }
    });
  });

  // 3. Employees Directory (from Store.meta.employees)
  const deptMap = {};
  ((Store && Store.meta && Store.meta.departments) || []).forEach(d => { deptMap[d.id] = d.name; });
  const emps = ((Store && Store.meta && Store.meta.employees) || []).map(e => {
    const fullName = e.name || e.full_name || "Employee";
    const deptName = e.department_name || deptMap[e.department_id] || "Directory";
    return {
      group: "People Directory",
      avatar: fullName,
      photo: e.photo_url,
      title: fullName,
      sub: (e.title || e.designation_title || "Staff") + " · " + deptName + (e.employee_no ? " · " + e.employee_no : ""),
      keywords: [fullName, e.email, e.employee_no, deptName, e.title].filter(Boolean).join(" ").toLowerCase(),
      run: () => openEmployeeProfile(e.id),
    };
  });

  const all = (q ? emps.concat(actions, flatNav) : actions.slice(0, 6).concat(flatNav.slice(0, 8), emps.slice(0, 6)));
  if (!q) return all;
  const tokens = q.split(/\s+/).filter(Boolean);
  return all.filter(it => {
    const hay = (it.title + " " + it.sub + " " + (it.keywords || "")).toLowerCase();
    return tokens.every(tk => hay.includes(tk));
  }).slice(0, 24);
}

function openCommandPalette(initialQuery) {
  let overlay = document.getElementById("cmd-palette-backdrop");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "cmd-palette-backdrop";
    overlay.className = "cmd-backdrop";
    document.body.appendChild(overlay);
  }
  _cmdOpen = true;
  _cmdActiveIdx = 0;

  overlay.innerHTML = '<div class="cmd-dialog" role="dialog" aria-label="Command palette">'
    + '<div class="cmd-head">'
    + icon("search", 17)
    + '<input type="text" id="cmd-input" class="cmd-input" placeholder="Search employees, HR modules, or type a quick action…" autocomplete="off" value="' + esc(initialQuery || "") + '">'
    + '<kbd class="cmd-kbd">ESC</kbd>'
    + '</div>'
    + '<div class="cmd-results" id="cmd-results"></div>'
    + '<div class="cmd-foot">'
    + '<span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>'
    + '<span><kbd>↵</kbd> Open</span>'
    + '<span><kbd>ESC</kbd> Close</span>'
    + '<span style="margin-left:auto">Meridian HR Quick Jump</span>'
    + '</div></div>';
  overlay.classList.add("open");

  const input = overlay.querySelector("#cmd-input");
  const resultsEl = overlay.querySelector("#cmd-results");
  let currentItems = [];

  function closeCmd() {
    _cmdOpen = false;
    overlay.classList.remove("open");
  }

  function renderCmdList() {
    currentItems = getCommandCatalog(input.value);
    if (_cmdActiveIdx >= currentItems.length) _cmdActiveIdx = Math.max(0, currentItems.length - 1);
    if (!currentItems.length) {
      resultsEl.innerHTML = '<div class="empty" style="padding:28px 16px"><h4>No matches found</h4><p class="small muted">Try searching an employee name, department, or module.</p></div>';
      return;
    }
    let lastGroup = "";
    let html = "";
    currentItems.forEach((it, idx) => {
      if (it.group !== lastGroup) {
        lastGroup = it.group;
        html += '<div class="cmd-group">' + esc(it.group) + '</div>';
      }
      html += '<div class="cmd-item ' + (idx === _cmdActiveIdx ? "active" : "") + '" data-cmd-idx="' + idx + '">'
        + (it.avatar ? avatarHTML(it.avatar, "avatar-sm", "", it.photo) : '<div class="cmd-item-icon">' + icon(it.icon || "arrowRight", 15) + '</div>')
        + '<div class="cmd-item-body"><b>' + esc(it.title) + '</b><span>' + esc(it.sub || "") + '</span></div>'
        + '<span class="cmd-enter">↵</span>'
        + '</div>';
    });
    resultsEl.innerHTML = html;
    const activeNode = resultsEl.querySelector(".cmd-item.active");
    if (activeNode) activeNode.scrollIntoView({ block: "nearest" });
  }

  renderCmdList();
  setTimeout(() => { input.focus(); input.select(); }, 20);

  input.oninput = () => { _cmdActiveIdx = 0; renderCmdList(); };
  input.onkeydown = (ev) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (currentItems.length) { _cmdActiveIdx = (_cmdActiveIdx + 1) % currentItems.length; renderCmdList(); }
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (currentItems.length) { _cmdActiveIdx = (_cmdActiveIdx - 1 + currentItems.length) % currentItems.length; renderCmdList(); }
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const chosen = currentItems[_cmdActiveIdx];
      if (chosen) { closeCmd(); chosen.run(); }
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      closeCmd();
    }
  };
  resultsEl.onclick = (ev) => {
    const row = ev.target.closest("[data-cmd-idx]");
    if (!row) return;
    const chosen = currentItems[Number(row.getAttribute("data-cmd-idx"))];
    if (chosen) { closeCmd(); chosen.run(); }
  };
  overlay.onclick = (ev) => { if (ev.target === overlay) closeCmd(); };
}

document.addEventListener("keydown", (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") {
    if (!Store || !Store.user) return;
    ev.preventDefault();
    openCommandPalette("");
  }
});
