const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  org: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-3h14v3"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4h-4z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  graduation: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  receipt: '<path d="M4 2h16v20l-8-4-8 4V2z"/><path d="M8 8h8M8 12h6"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
  lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.8 3.8M14.6 14.6l3.8 3.8M18.4 5.6l-3.8 3.8M9.4 14.6l-3.8 3.8"/>',
  megaphone: '<path d="M3 11l17-6v14L3 13v-2z"/><path d="M7 13v5a2 2 0 002 2h1a2 2 0 002-2v-3"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  palette: '<circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22a8 8 0 008-8c0-2.2-1.8-4-4-4h-1.5a2.5 2.5 0 010-5C17 5 19 7 19 10a8 8 0 01-8 12z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  bell: '<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5z"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  edit: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 2 .7 2.9a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.9.6 2.9.7a2 2 0 011.7 2z"/>',
  mapPin: '<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1M9 22v-4h6v4"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  play: '<path d="M6 4l14 8-14 8V4z"/>',
  lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6L5.5 5z"/>',
  star: '<path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.9 21l1.2-6.9-5-4.9 6.9-1L12 2z"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/>',
  dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1M9 10h6M9 14h6"/>',
  sparkle: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  home: '<path d="M3 10l9-8 9 8v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10z"/><path d="M9 22V12h6v10"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  message: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 000-7.8z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  link: '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  chevronsLeft: '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>',
  chevronsRight: '<polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>',
  sort: '<path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/>',
  sortUp: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
  sortDown: '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  home: '<path d="M3 10l9-8 9 8v10a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2z"/>',
  chevronsLeft: '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>',
  chevronsRight: '<polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  externalLink: '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  circle: '<circle cx="12" cy="12" r="3"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
};

function icon(name, size) {
  const path = ICONS[name] || ICONS.info;
  return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
}

function esc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function money(v, currency) {
  const n = Number(v || 0);
  return (currency || "GHS") + " " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const fmtMoney = money;

function fmtNumber(v) {
  const n = Number(v || 0);
  return Number.isInteger(n) ? n.toLocaleString("en-GH") : n.toLocaleString("en-GH", { maximumFractionDigits: 1 });
}

function mask(v) {
  if (!v) return "—";
  const s = String(v);
  if (s.startsWith("••••")) return s;
  if (s.length <= 4) return "••••";
  return "•••• •••• " + s.slice(-4);
}

function compactMoney(v) {
  const n = Number(v || 0);
  if (n >= 1e6) return "GHS " + (n / 1e6).toFixed(1) + "m";
  if (n >= 1e3) return "GHS " + (n / 1e3).toFixed(1) + "k";
  return "GHS " + n.toFixed(0);
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateShort(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fmtTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(d) {
  if (!d) return "—";
  return fmtDate(d) + " · " + fmtTime(d);
}

function timeAgo(d) {
  if (!d) return "—";
  const dt = new Date(d);
  const diff = (Date.now() - dt.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return fmtDate(d);
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

const AVATAR_COLORS = ["#0f766e", "#c2703d", "#2c5d8f", "#6b4a86", "#a97316", "#2f7d5d", "#a83a32", "#3f6b7a"];

function colorFor(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

function avatarHTML(name, cls, extraStyle, photoUrl) {
  if (photoUrl) {
    return '<div class="avatar ' + (cls || "") + '" style="background:' + colorFor(name) + ';overflow:hidden;' + (extraStyle || "") + '">'
      + '<img src="' + esc(photoUrl) + '" alt="' + esc(name) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.remove();this.parentElement.textContent=\'' + esc(initials(name)) + '\'">'
      + '</div>';
  }
  return '<div class="avatar ' + (cls || "") + '" style="background:' + colorFor(name) + ';' + (extraStyle || "") + '">' + esc(initials(name)) + '</div>';
}

const STATUS_MAP = {
  active: "green", present: "green", approved: "green", paid: "green", completed: "green",
  sent: "green", going: "green", simulated: "teal", enabled: "green", ready: "green",
  hired: "green", available: "green", resolved: "green", confirmed: "green", enrolled: "blue",
  pending: "amber", draft: "grey", calculated: "blue", review: "blue", in_progress: "amber",
  maybe: "amber", skipped: "amber", sandbox: "teal",
  late: "amber", remote: "blue", screening: "blue", interview: "purple", assessment: "purple",
  offer: "teal", applied: "grey", scheduled: "blue", open: "teal", filled: "green",
  rejected: "red", absent: "red", terminated: "red", resigned: "grey", cancelled: "grey",
  failed: "red", disabled: "grey", declined: "grey",
  locked: "purple", closed: "grey", inactive: "grey", offboarded: "grey", leave: "blue",
  assigned: "blue", self_review: "amber", in_review: "blue", not_started: "grey",
  probation: "amber", suspended: "red", overdue: "red", expired: "red",
};

function chip(status, label) {
  const key = String(status || "").toLowerCase().replace(/\s+/g, "_");
  const cls = STATUS_MAP[key] || "grey";
  return '<span class="chip chip-' + cls + '">' + esc((label || status || "—").toString().replace(/_/g, " ")) + '</span>';
}

function toast(message, type) {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast " + (type || "");
  el.innerHTML = icon(type === "error" ? "alert" : "checkCircle", 16) + "<span>" + esc(message) + "</span>";
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .25s"; setTimeout(() => el.remove(), 260); }, 3800);
}

function closeModal() {
  document.getElementById("modal-root").classList.remove("open");
  document.getElementById("modal-card").innerHTML = "";
}

function openModal(opts) {
  const root = document.getElementById("modal-root");
  const card = document.getElementById("modal-card");
  card.className = "modal-card" + (opts.wide ? " wide" : "") + (opts.narrow ? " narrow" : "");
  card.innerHTML = ''
    + '<div class="modal-head"><div><h3>' + esc(opts.title || "") + '</h3>'
    + (opts.sub ? '<div class="sub">' + esc(opts.sub) + '</div>' : '')
    + '</div><button class="close" data-close-modal aria-label="Close">' + icon("x", 18) + '</button></div>'
    + '<div class="modal-body" id="modal-body">' + (opts.body || "") + '</div>'
    + (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '');
  root.classList.add("open");
  if (opts.onMount) opts.onMount(card);
  return card;
}

function closeDrawer() {
  document.getElementById("drawer-root").classList.remove("open");
  document.getElementById("drawer-panel").innerHTML = "";
}

function openDrawer(opts) {
  const root = document.getElementById("drawer-root");
  const panel = document.getElementById("drawer-panel");
  panel.className = "drawer-panel" + (opts.wide ? " wide" : "") + (opts.narrow ? " narrow" : "");
  panel.innerHTML = ''
    + '<div class="drawer-head"><div style="min-width:0;flex:1">' + (opts.head || ('<h3 style="font-family:var(--serif);font-size:22px;font-weight:500">' + esc(opts.title || "") + '</h3>'
      + (opts.sub ? '<div class="sub">' + esc(opts.sub) + '</div>' : '')))
    + '</div><button class="icon-btn drawer-head-close" data-close-drawer aria-label="Close">' + icon("x", 17) + '</button></div>'
    + '<div class="drawer-body">' + (opts.body || "") + '</div>'
    + (opts.footer ? '<div class="drawer-foot">' + opts.footer + '</div>' : '');
  root.classList.add("open");
  if (opts.onMount) opts.onMount(panel);
  return panel;
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const drawer = document.getElementById("drawer-root");
  if (drawer && drawer.classList.contains("open")) closeDrawer();
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-close-modal]")) closeModal();
  if (e.target.closest("[data-close-drawer]")) closeDrawer();
});

function confirmDialog(title, message, onConfirm, opts) {
  if (typeof message === "function") {
    opts = onConfirm;
    onConfirm = message;
    message = "Are you sure you want to proceed? This action is recorded in the audit log.";
  }
  opts = opts || {};
  openModal({
    title: title,
    narrow: true,
    body: '<p style="font-size:13px;color:var(--muted);line-height:1.6">' + esc(message) + '</p>',
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button>'
      + '<button class="btn ' + (opts.danger ? "btn-danger" : "btn-accent") + '" id="confirm-yes">' + esc(opts.confirmLabel || "Confirm") + '</button>',
    onMount(card) {
      card.querySelector("#confirm-yes").onclick = async () => {
        try { await onConfirm(); closeModal(); } catch (err) { toast(err.message, "error"); }
      };
    },
  });
}

function fieldHTML(f) {
  const id = "f_" + f.name;
  const required = f.required ? ' required' : '';
  const label = '<label for="' + id + '">' + esc(f.label || f.name) + (f.required ? ' <span class="req">*</span>' : '') + '</label>';
  const hint = f.hint ? '<span class="field-hint">' + esc(f.hint) + '</span>' : '';
  const cls = f.full ? "field full" : "field";
  let input = "";
  if (f.type === "select") {
    const opts = (f.options || []).map(o => {
      const val = typeof o === "object" ? o.value : o;
      const lab = typeof o === "object" ? o.label : o;
      const sel = String(f.value) === String(val) ? " selected" : "";
      return '<option value="' + esc(val) + '"' + sel + '>' + esc(lab) + '</option>';
    }).join("");
    input = '<select class="select" id="' + id + '" name="' + f.name + '"' + required + '>'
      + (f.placeholder ? '<option value="">' + esc(f.placeholder) + '</option>' : "") + opts + '</select>';
  } else if (f.type === "textarea") {
    input = '<textarea class="textarea" id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.placeholder || "") + '"' + required + '>' + esc(f.value || "") + '</textarea>';
  } else if (f.type === "checkbox") {
    return '<label class="row" style="gap:8px;font-size:12.5px;align-self:end;padding-bottom:8px"><input type="checkbox" id="' + id + '" name="' + f.name + '"' + (f.value ? " checked" : "") + '> ' + esc(f.label) + '</label>';
  } else {
    input = '<input class="input" type="' + (f.type || "text") + '" id="' + id + '" name="' + f.name + '" value="' + esc(f.value === null || f.value === undefined ? "" : f.value) + '" placeholder="' + esc(f.placeholder || "") + '"' + required
      + (f.min !== undefined ? ' min="' + f.min + '"' : "") + (f.max !== undefined ? ' max="' + f.max + '"' : "")
      + (f.step ? ' step="' + f.step + '"' : "") + '>';
  }
  return '<div class="' + cls + '">' + label + input + hint + '</div>';
}

function formModal(opts) {
  const fields = opts.fields || [];
  const body = '<form id="modal-form" novalidate>'
    + '<div id="form-error" class="form-error hidden"></div>'
    + '<div class="form-grid">' + fields.map(fieldHTML).join("") + '</div>'
    + '</form>';
  openModal({
    title: opts.title, sub: opts.sub, wide: opts.wide, body: body,
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-accent" id="form-submit">' + esc(opts.submitLabel || "Save") + '</button>',
    onMount(card) {
      const form = card.querySelector("#modal-form");
      const submit = card.querySelector("#form-submit");
      const collect = () => {
        const out = {};
        fields.forEach(f => {
          const el = form.querySelector('[name="' + f.name + '"]');
          if (!el) return;
          if (f.type === "checkbox") out[f.name] = el.checked;
          else out[f.name] = el.value === "" ? null : el.value;
        });
        return out;
      };
      submit.onclick = async (e) => {
        e.preventDefault();
        const missing = fields.filter(f => f.required && !collect()[f.name]);
        const errBox = form.querySelector("#form-error");
        if (missing.length) {
          errBox.textContent = "Please complete: " + missing.map(m => m.label || m.name).join(", ");
          errBox.classList.remove("hidden");
          return;
        }
        submit.disabled = true;
        try {
          await opts.onSubmit(collect());
          closeModal();
          toast(opts.successMessage || "Saved successfully", "success");
        } catch (err) {
          errBox.textContent = err.message;
          errBox.classList.remove("hidden");
        } finally { submit.disabled = false; }
      };
      form.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); submit.click(); }
      });
    },
  });
}

function renderTable(cfg) {
  const cols = cfg.columns || [];
  let head = '<tr>' + cols.map(c => '<th' + (c.class ? ' class="' + c.class + '"' : "") + '>' + esc(c.label) + '</th>').join("") + '</tr>';
  let body = "";
  if (!cfg.rows || !cfg.rows.length) {
    body = '<tr><td colspan="' + cols.length + '">' + emptyState(cfg.emptyTitle || "Nothing here yet", cfg.emptyText || "Records will appear here once added.") + '</td></tr>';
  } else {
    body = cfg.rows.map((row, i) => {
      const tds = cols.map(c => {
        const val = c.render ? c.render(row, i) : esc(row[c.key] === null || row[c.key] === undefined ? "—" : row[c.key]);
        return '<td' + (c.class ? ' class="' + c.class + '"' : "") + '>' + val + '</td>';
      }).join("");
      return '<tr' + (cfg.onRowClick ? ' class="clickable" data-row="' + i + '"' : "") + '>' + tds + '</tr>';
    }).join("");
  }
  const table = '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  return '<div class="card">' + (cfg.title ? '<div class="card-head"><div><h3>' + esc(cfg.title) + '</h3>' + (cfg.sub ? '<div class="sub">' + esc(cfg.sub) + '</div>' : '') + '</div><div class="right">' + (cfg.actions || "") + '</div></div>' : "")
    + table + (cfg.footer || "") + '</div>';
}

function emptyState(title, text, iconName) {
  return '<div class="empty"><div class="icon">' + icon(iconName || "inbox", 22) + '</div><h4>' + esc(title) + '</h4><p>' + esc(text || "") + '</p></div>';
}

function pagerHTML(meta) {
  if (!meta || meta.pages <= 1) return '<div class="table-foot"><span>' + (meta ? meta.total : 0) + ' record(s)</span></div>';
  let buttons = "";
  const start = Math.max(1, meta.page - 2);
  const end = Math.min(meta.pages, start + 4);
  for (let i = start; i <= end; i++) buttons += '<button class="' + (i === meta.page ? "active" : "") + '" data-page="' + i + '">' + i + '</button>';
  return '<div class="table-foot"><span>Page ' + meta.page + ' of ' + meta.pages + ' · ' + meta.total + ' record(s)</span><div class="spacer"></div><div class="pager">'
    + '<button data-page="' + (meta.page - 1) + '" ' + (meta.page <= 1 ? "disabled" : "") + '>‹</button>' + buttons
    + '<button data-page="' + (meta.page + 1) + '" ' + (meta.page >= meta.pages ? "disabled" : "") + '>›</button></div></div>';
}

function bindPager(container, fn) {
  container.querySelectorAll("[data-page]").forEach(b => {
    b.onclick = () => { if (!b.disabled) fn(Number(b.dataset.page)); };
  });
}

function barList(items, color) {
  const max = Math.max.apply(null, items.map(i => Number(i.count || i.value || 0)).concat([1]));
  return items.map(i => {
    const v = Number(i.count || i.value || 0);
    return '<div class="bar-row"><div class="name">' + esc(i.name) + '</div><div class="track"><div class="fill" style="width:' + Math.round(v / max * 100) + '%;background:' + (color || "var(--teal)") + '"></div></div><div class="val">' + v + '</div></div>';
  }).join("");
}

function lineChart(labels, series, opts) {
  opts = opts || {};
  const w = 640, h = 190, padL = 34, padB = 26, padT = 14, padR = 12;
  const all = series.reduce((a, s) => a.concat(s.values.map(Number)), []);
  const max = Math.max.apply(null, all.concat([1])) * 1.15;
  const stepX = (w - padL - padR) / Math.max(labels.length - 1, 1);
  const y = v => padT + (h - padT - padB) * (1 - Number(v) / max);
  let grid = "";
  for (let i = 0; i <= 3; i++) {
    const gy = padT + (h - padT - padB) * i / 3;
    grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (w - padR) + '" y2="' + gy + '" stroke="#e9e4d9" stroke-dasharray="3 4"/>'
      + '<text x="' + (padL - 7) + '" y="' + (gy + 3) + '" font-size="8" fill="#8b948f" text-anchor="end">' + Math.round(max * (1 - i / 3)) + '</text>';
  }
  let paths = series.map((s, si) => {
    const pts = s.values.map((v, i) => [padL + i * stepX, y(v)]);
    let d = "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
    const areaD = d + " L" + (padL + (pts.length - 1) * stepX) + " " + (h - padB) + " L" + padL + " " + (h - padB) + " Z";
    return '<path d="' + areaD + '" fill="' + s.color + '" opacity=".08"/><path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="#fff" stroke="' + s.color + '" stroke-width="1.6"/>').join("");
  }).join("");
  let xlabels = labels.map((l, i) => '<text x="' + (padL + i * stepX) + '" y="' + (h - 7) + '" font-size="8" fill="#8b948f" text-anchor="middle">' + esc(l) + '</text>').join("");
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto">' + grid + paths + xlabels + '</svg>';
}

function donut(items, size) {
  const s = size || 120, r = 42, c = 2 * Math.PI * r;
  const total = items.reduce((a, i) => a + Number(i.value), 0) || 1;
  let offset = 0;
  const circles = items.map(i => {
    const frac = Number(i.value) / total;
    const seg = '<circle cx="' + (s / 2) + '" cy="' + (s / 2) + '" r="' + r + '" fill="none" stroke="' + i.color + '" stroke-width="14" stroke-dasharray="' + (frac * c).toFixed(1) + ' ' + c.toFixed(1) + '" stroke-dashoffset="' + (-offset * c).toFixed(1) + '" transform="rotate(-90 ' + (s / 2) + ' ' + (s / 2) + ')"/>';
    offset += frac;
    return seg;
  }).join("");
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '"><circle cx="' + (s / 2) + '" cy="' + (s / 2) + '" r="' + r + '" fill="none" stroke="#eee9df" stroke-width="14"/>' + circles + '</svg>';
}

function kpiCard(o) {
  return '<div class="card kpi"><div class="kpi-top"><div><div class="kpi-label">' + esc(o.label) + '</div><div class="kpi-value">' + o.value + '</div></div>'
    + '<div class="kpi-icon ' + (o.tone || "") + '">' + icon(o.icon || "chart", 17) + '</div></div>'
    + '<div class="kpi-foot">' + (o.foot || "") + '</div></div>';
}

function pageHead(title, sub, actions, eyebrow) {
  return '<div class="page-head"><div class="title-wrap">' + (eyebrow ? '<div class="eyebrow">' + esc(eyebrow) + '</div>' : "")
    + '<h1>' + esc(title) + '</h1>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : "") + '</div>'
    + '<div class="actions">' + (actions || "") + '</div></div>';
}

function debounce(fn, wait) {
  let t;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait || 260);
  };
}

function optionsFrom(arr, labelKey, valueKey) {
  return (arr || []).map(x => ({ value: x[valueKey || "id"], label: x[labelKey || "name"] }));
}

function openFormModal(opts) {
  const vals = opts.values || {};
  const mappedFields = (opts.fields || []).map(f => ({
    ...f,
    value: f.value !== undefined ? f.value : (vals[f.name] !== undefined && vals[f.name] !== null ? vals[f.name] : f.default),
  }));
  return formModal({ ...opts, fields: mappedFields });
}

function empOptions() { return optionsFrom((Store.meta && Store.meta.employees) || [], "name", "id"); }
function desigOptions() { return optionsFrom((Store.meta && Store.meta.designations) || [], "title", "id"); }
function gradeOptions() { return optionsFrom((Store.meta && Store.meta.grades) || [], "name", "id"); }
function branchOptions() { return optionsFrom((Store.meta && Store.meta.branches) || [], "name", "id"); }

function spinners(n) {
  return '<div class="loading-block">' + Array.from({ length: n || 3 }).map(() => '<div class="skeleton" style="height:42px"></div>').join("") + '</div>';
}

