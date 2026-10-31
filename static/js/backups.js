/* ============================================================ BACKUPS & RECOVERY
   Professional database backup console: create, verify, download, restore and
   retire snapshots of the HRMS SQLite database, with retention & scheduling. */

function fmtBytes(bytes) {
  const n = Number(bytes || 0);
  if (n <= 0) return "0 KB";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function backupFreshness(lastIso) {
  if (!lastIso) return { label: "No backup yet", chip: '<span class="chip chip-red">Unprotected</span>' };
  const ageH = (Date.now() - new Date(lastIso).getTime()) / 3600000;
  if (ageH <= 24) return { label: timeAgo(lastIso), chip: '<span class="chip chip-green">Protected</span>' };
  if (ageH <= 72) return { label: timeAgo(lastIso), chip: '<span class="chip chip-amber">Getting stale</span>' };
  return { label: timeAgo(lastIso), chip: '<span class="chip chip-red">Stale</span>' };
}

function reloadBackups() {
  const view = document.getElementById("view");
  if (view) Views.backups(view);
}

/* ------------------------------------------------------------ create */
function openCreateBackupModal() {
  openModal({
    title: "Create database backup",
    sub: "A consistent snapshot of the live HRMS database",
    narrow: true,
    body: '<div class="stack" style="gap:12px">'
      + '<div class="field"><label for="bk-label">Label (optional)</label>'
      + '<input class="input" id="bk-label" maxlength="180" placeholder="e.g. Before November payroll run">'
      + '<span class="field-hint">Labels make snapshots easy to recognise later.</span></div>'
      + '<div class="drawer-note">' + icon("info", 13)
      + ' The snapshot is taken with SQLite\u2019s online backup API — the system stays online while it runs, and a SHA-256 checksum is recorded for integrity checks.</div>'
      + '</div>',
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button>'
      + '<button class="btn btn-accent" id="bk-create-go">' + icon("copy", 14) + ' Create snapshot</button>',
    onMount(card) {
      const btn = card.querySelector("#bk-create-go");
      btn.onclick = async () => {
        btn.disabled = true;
        btn.innerHTML = "Creating snapshot…";
        try {
          const res = await API.post("/backups", { label: card.querySelector("#bk-label").value || null });
          closeModal();
          toast(res.data.label ? "Backup created — " + res.data.label : "Backup created successfully", "success");
          if (res.pruned > 0) toast(res.pruned + " old snapshot(s) retired by the retention policy", "info");
          reloadBackups();
        } catch (e) {
          btn.disabled = false;
          btn.innerHTML = icon("copy", 14) + " Create snapshot";
          toast(e.message, "error");
        }
      };
    },
  });
}

/* ------------------------------------------------------------ verify */
function openVerifyBackupModal(backup) {
  openModal({
    title: "Verify snapshot integrity",
    sub: backup.filename,
    narrow: true,
    body: '<div class="stack" style="text-align:center;padding:6px 0">'
      + '<div id="bk-verify-spin">' + icon("refresh", 22) + '<p class="small muted" style="margin-top:8px">Recomputing SHA-256 checksum and running the SQLite integrity check…</p></div>'
      + '<div id="bk-verify-result" class="hidden"></div>'
      + '</div>',
    footer: '<button class="btn btn-ghost" data-close-modal>Close</button>',
    onMount(card) {
      API.post("/backups/" + backup.id + "/verify").then(res => {
        const d = res.data;
        const line = (ok, text) => '<div class="row" style="gap:8px;justify-content:center;font-size:13px;margin-top:8px">'
          + '<span style="color:' + (ok ? "var(--teal)" : "#a83a32") + '">' + icon(ok ? "checkCircle" : "xCircle", 16) + '</span><span>' + esc(text) + '</span></div>';
        card.querySelector("#bk-verify-spin").classList.add("hidden");
        const box = card.querySelector("#bk-verify-result");
        box.classList.remove("hidden");
        box.innerHTML = '<div style="font-size:34px;line-height:1;color:' + (d.valid ? "var(--teal)" : "#a83a32") + '">'
          + icon(d.valid ? "shield" : "alert", 30) + '</div>'
          + '<h4 style="margin:10px 0 2px;font-size:16px">' + (d.valid ? "Snapshot is valid" : "Snapshot failed verification") + '</h4>'
          + line(d.checksum_match, d.checksum_match ? "SHA-256 checksum matches the register" : "Checksum mismatch — the file changed after creation")
          + line(d.integrity_ok, d.integrity_ok ? "SQLite integrity check passed" : "SQLite integrity check failed")
          + '<div class="tiny muted mono" style="margin-top:12px;word-break:break-all">' + esc(d.checksum_sha256 || "") + '</div>';
      }).catch(e => {
        card.querySelector("#bk-verify-spin").innerHTML = '<p class="small" style="color:#a83a32">' + esc(e.message) + '</p>';
      });
    },
  });
}

/* ------------------------------------------------------------ restore */
function openRestoreBackupModal(backup) {
  openModal({
    title: "Restore database snapshot",
    sub: backup.filename + " · " + fmtDateTime(backup.created_at),
    body: '<div class="stack" style="gap:12px">'
      + '<div class="callout-banner red" style="margin:0">'
      + '<div><b>This replaces ALL current data.</b> Every record created or changed after '
      + esc(fmtDateTime(backup.created_at)) + ' will be lost, and signed-in users may need to sign in again.</div></div>'
      + '<div class="drawer-note">' + icon("shield", 13)
      + ' A safety snapshot of the current database is taken automatically before anything is overwritten, so this restore can itself be undone.</div>'
      + '<div class="drawer-meta">'
      + '<div class="item"><span>Snapshot</span><b class="mono">' + esc(backup.filename) + '</b></div>'
      + '<div class="item"><span>Taken</span><b>' + esc(fmtDateTime(backup.created_at)) + '</b></div>'
      + '<div class="item"><span>Size</span><b>' + esc(fmtBytes(backup.size_bytes)) + '</b></div>'
      + '<div class="item"><span>Checksum</span><b>' + (backup.checksum_match === false ? "recorded" : "verified before restore") + '</b></div>'
      + '</div>'
      + '<div class="field"><label for="bk-restore-word">Type <b>RESTORE</b> to confirm</label>'
      + '<input class="input" id="bk-restore-word" autocomplete="off" placeholder="RESTORE"></div>'
      + '</div>',
    footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button>'
      + '<button class="btn btn-danger" id="bk-restore-go" disabled>Restore snapshot</button>',
    onMount(card) {
      const word = card.querySelector("#bk-restore-word");
      const btn = card.querySelector("#bk-restore-go");
      word.oninput = () => { btn.disabled = word.value.trim() !== "RESTORE"; };
      word.focus();
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = "Restoring database…";
        try {
          const res = await API.post("/backups/" + backup.id + "/restore", {});
          card.innerHTML = '<div class="modal-head"><div><h3>Restore complete</h3>'
            + '<div class="sub">The snapshot is now the live database</div></div></div>'
            + '<div class="modal-body"><div class="stack" style="text-align:center;padding:10px 0">'
            + '<div style="color:var(--teal)">' + icon("checkCircle", 34) + '</div>'
            + '<p class="small muted" style="margin:6px 0 0">Restored <b class="mono">' + esc(res.data.restored) + '</b>. '
            + 'A safety snapshot of the previous state was saved as <b class="mono">' + esc(res.data.pre_restore_snapshot.filename) + '</b>.</p>'
            + '<p class="small muted" style="margin:8px 0 0">The page will reload now — if your session predates the snapshot you will be asked to sign in again.</p>'
            + '</div></div>'
            + '<div class="modal-foot"><button class="btn btn-accent" id="bk-restore-done">Continue</button></div>';
          card.querySelector("#bk-restore-done").onclick = () => location.reload();
          setTimeout(() => location.reload(), 4000);
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "Restore snapshot";
          toast(e.message, "error");
        }
      };
    },
  });
}

/* ------------------------------------------------------------ detail drawer */
function openBackupDrawer(backup) {
  const head = '<div><h3 class="mono" style="font-size:16px;word-break:break-all">' + esc(backup.filename) + '</h3>'
    + '<div class="sub">' + esc(backup.trigger_label || backup.trigger) + ' snapshot · ' + esc(fmtDateTime(backup.created_at)) + '</div></div>';
  const body = '<div class="drawer-section">Snapshot</div><div class="drawer-meta">'
    + drawerMetaItem("Label", backup.label)
    + drawerMetaItem("Trigger", backup.trigger_label || backup.trigger)
    + drawerMetaItem("Status", backup.status)
    + drawerMetaItem("Size", fmtBytes(backup.size_bytes))
    + drawerMetaItem("Duration", backup.duration_ms !== null && backup.duration_ms !== undefined ? backup.duration_ms + " ms" : null)
    + drawerMetaItem("Created by", backup.created_by_name)
    + drawerMetaItem("Created", fmtDateTime(backup.created_at))
    + drawerMetaItem("Notes", backup.notes)
    + '</div>'
    + '<div class="drawer-section">Integrity</div>'
    + '<div class="drawer-code" style="word-break:break-all">' + esc(backup.checksum_sha256 || "—") + '</div>'
    + '<div class="drawer-note" style="margin-top:10px">' + icon("shield", 13)
    + ' SHA-256 recorded at creation time. Use “Verify” to re-check the file on disk against this value.</div>'
    + '<div class="drawer-section">Recovery</div>'
    + '<div class="drawer-note">' + icon("info", 13)
    + ' To recover, download this file for off-server storage, or restore it directly. Restoring first takes an automatic safety snapshot of the current database.</div>';
  const footer = '<div class="left row" style="gap:8px">'
    + '<button class="btn btn-ghost" id="bk-d-verify">' + icon("shield", 13) + ' Verify</button>'
    + '<button class="btn btn-danger" id="bk-d-restore">' + icon("refresh", 13) + ' Restore</button>'
    + '</div>'
    + '<a class="btn btn-ghost" href="/api/v1/backups/' + backup.id + '/download?token=' + encodeURIComponent(API.token || "") + '">' + icon("download", 13) + ' Download</a>'
    + '<button class="btn btn-accent" data-close-drawer>Done</button>';
  openDrawer({
    wide: true, head: head, body: body, footer: footer,
    onMount(panel) {
      panel.querySelector("#bk-d-verify").onclick = () => openVerifyBackupModal(backup);
      panel.querySelector("#bk-d-restore").onclick = () => { closeDrawer(); openRestoreBackupModal(backup); };
    },
  });
}

/* ------------------------------------------------------------ page */
Views.backups = async function (root) {
  if (!Store.canAdmin()) {
    root.innerHTML = pageHead("Backups & Recovery", "Restricted area")
      + emptyState("No access", "Only Super Admin accounts can manage database backups.", "lock");
    return;
  }
  root.innerHTML = pageHead("Backups & Recovery", "Loading backup register…") + spinners(3);
  try {
    const res = await API.get("/backups");
    const rows = res.data || [], s = res.summary || {}, cfg = res.config || {};
    const fresh = backupFreshness(s.last_backup_at);

    const banner = !s.file_based
      ? '<div class="callout-banner amber" style="margin-bottom:16px"><div><b>Backups unavailable:</b> the server is running on an in-memory database, so there is no database file to snapshot.</div></div>'
      : s.count === 0
        ? '<div class="callout-banner red" style="margin-bottom:16px"><div><b>No backups yet.</b> Create your first snapshot now — the HRMS database is currently unprotected.</div></div>'
        : (Date.now() - new Date(s.last_backup_at).getTime() > 86400000
          ? '<div class="callout-banner amber" style="margin-bottom:16px"><div><b>The last backup is older than 24 hours.</b> Take a fresh snapshot or switch on automatic backups below.</div></div>'
          : '<div class="callout-banner green" style="margin-bottom:16px"><div><b>Backup protection is active.</b> Last snapshot ' + esc(fresh.label) + ' · ' + s.count + ' snapshot(s) retained on the server.</div></div>');

    const headActions = '<button class="btn btn-ghost" id="bk-refresh">' + icon("refresh", 15) + ' Refresh</button>'
      + (s.file_based ? '<button class="btn btn-accent" id="bk-create">' + icon("plus", 15) + ' Create backup</button>' : "");

    const table = renderTable({
      id: "backups-table",
      title: "Backup history",
      sub: "Every snapshot taken on this server, newest first",
      exportName: "hrms-database-backups",
      searchPlaceholder: "Search snapshots by file, label or creator…",
      dateField: "created_at",
      dateLabel: "Created",
      onRowClick: r => openBackupDrawer(r),
      filters: [{ key: "trigger", label: "Trigger" }],
      columns: [
        {
          label: "Snapshot", sortKey: "filename", render: r =>
            '<div><b class="mono" style="font-size:12px">' + esc(r.filename) + '</b>'
            + (r.label ? '<div class="tiny muted">' + esc(r.label) + '</div>' : '') + '</div>'
        },
        { label: "Trigger", key: "trigger", render: r => '<span class="pill-tag">' + esc(r.trigger_label || r.trigger) + '</span>' },
        { label: "Size", sortKey: "size_bytes", render: r => fmtBytes(r.size_bytes) },
        { label: "Created by", key: "created_by_name", render: r => esc(r.created_by_name || "System") },
        { label: "Created", key: "created_at", render: r => '<span title="' + esc(fmtDateTime(r.created_at)) + '">' + esc(timeAgo(r.created_at)) + '</span>' },
        { label: "Checksum", sortable: false, render: r => '<span class="mono tiny">' + esc((r.checksum_sha256 || "—").slice(0, 12)) + '…</span>' },
        {
          label: "", class: "right", sortable: false, render: r => '<div class="row" style="gap:4px;justify-content:flex-end">'
            + '<a class="btn btn-sm btn-ghost" href="/api/v1/backups/' + r.id + '/download?token=' + encodeURIComponent(API.token || "") + '" title="Download snapshot">' + icon("download", 12) + '</a>'
            + '<button class="btn btn-sm btn-ghost" data-bk-verify="' + r.id + '" title="Verify integrity">' + icon("shield", 12) + '</button>'
            + '<button class="btn btn-sm btn-ghost" data-bk-restore="' + r.id + '" title="Restore this snapshot">' + icon("refresh", 12) + '</button>'
            + '<button class="btn btn-sm btn-ghost" data-bk-delete="' + r.id + '" title="Delete snapshot">' + icon("trash", 12) + '</button></div>'
        },
      ],
      rows: rows,
      emptyTitle: "No snapshots yet",
      emptyText: "Create your first database backup to start protecting the HRMS.",
    });

    const configCard = '<div class="card"><div class="card-head"><div><h3>Schedule & retention</h3>'
      + '<div class="sub">Automate snapshots and cap server storage</div></div></div>'
      + '<div class="card-body stack" style="gap:12px">'
      + '<label class="row" style="gap:8px;font-size:12.5px;padding:10px 12px;border:1px solid var(--line);border-radius:10px">'
      + '<input type="checkbox" id="bk-auto" ' + (cfg.auto_enabled ? "checked" : "") + '> '
      + '<span><b>Automatic backups</b><div class="tiny muted">Take a snapshot in the background when one is due.</div></span></label>'
      + '<div class="field"><label for="bk-interval">Backup every (hours)</label>'
      + '<input class="input" type="number" id="bk-interval" min="1" max="168" value="' + Number(cfg.interval_hours || 24) + '"' + (cfg.auto_enabled ? "" : " disabled") + '></div>'
      + '<div class="field"><label for="bk-retention">Keep last (snapshots)</label>'
      + '<input class="input" type="number" id="bk-retention" min="1" max="100" value="' + Number(cfg.retention_count || 15) + '">'
      + '<span class="field-hint">Older snapshots are retired automatically after each new backup.</span></div>'
      + '<button class="btn btn-accent" id="bk-save-config" style="width:100%">Save configuration</button>'
      + '<div class="drawer-note">' + icon("info", 13) + ' Snapshots are stored in <span class="mono tiny">' + esc(s.backup_dir || "backups/") + '</span> on the server. Download copies regularly and keep at least one off-server.</div>'
      + '</div></div>';

    const recoveryCard = '<div class="card"><div class="card-head"><div><h3>Recovery playbook</h3>'
      + '<div class="sub">How to use this console</div></div></div>'
      + '<div class="card-body stack" style="gap:10px;font-size:12.5px;color:var(--muted)">'
      + '<div class="row" style="gap:10px;align-items:flex-start"><span class="kpi-icon teal" style="min-width:30px;height:30px">' + icon("copy", 14) + '</span><span><b style="color:var(--ink)">1 · Snapshot before risky work.</b> Label backups before payroll runs, imports or upgrades so you can roll back precisely.</span></div>'
      + '<div class="row" style="gap:10px;align-items:flex-start"><span class="kpi-icon blue" style="min-width:30px;height:30px">' + icon("shield", 14) + '</span><span><b style="color:var(--ink)">2 · Verify before trusting.</b> Verification re-checks the SHA-256 checksum and runs a SQLite integrity check.</span></div>'
      + '<div class="row" style="gap:10px;align-items:flex-start"><span class="kpi-icon accent" style="min-width:30px;height:30px">' + icon("download", 14) + '</span><span><b style="color:var(--ink)">3 · Keep an off-server copy.</b> Downloads are plain SQLite files — store them on encrypted external storage.</span></div>'
      + '<div class="row" style="gap:10px;align-items:flex-start"><span class="kpi-icon purple" style="min-width:30px;height:30px">' + icon("refresh", 14) + '</span><span><b style="color:var(--ink)">4 · Restore is reversible.</b> Every restore first saves a safety snapshot of the current state.</span></div>'
      + '</div></div>';

    root.innerHTML = pageHead("Backups & Recovery", "Protect the HRMS with verifiable database snapshots, scheduled copies and one-click recovery.", headActions, "System")
      + banner
      + '<div class="grid grid-4" style="margin-bottom:18px">'
      + kpiCard({ label: "Live database", value: s.live_db_bytes ? fmtBytes(s.live_db_bytes) : "—", icon: "layers", tone: "teal", foot: "Current size of hrms.db" })
      + kpiCard({ label: "Snapshots stored", value: s.count || 0, icon: "copy", tone: "blue", foot: "Retention keeps the last " + (cfg.retention_count || 15) })
      + kpiCard({ label: "Backup storage used", value: fmtBytes(s.total_bytes), icon: "box", tone: "purple", foot: "Across all retained snapshots" })
      + kpiCard({ label: "Last backup", value: fresh.label, icon: "clock", tone: "accent", foot: fresh.chip })
      + '</div>'
      + '<div class="page-enter">' + table + '</div>'
      + '<div class="grid grid-2" style="margin-top:18px">' + configCard + recoveryCard + '</div>';

    root.querySelector("#bk-refresh").onclick = () => reloadBackups();
    const createBtn = root.querySelector("#bk-create");
    if (createBtn) createBtn.onclick = () => openCreateBackupModal();

    const autoChk = root.querySelector("#bk-auto");
    const intervalInp = root.querySelector("#bk-interval");
    autoChk.onchange = () => { intervalInp.disabled = !autoChk.checked; };
    root.querySelector("#bk-save-config").onclick = async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      btn.textContent = "Saving…";
      try {
        const out = await API.put("/backups/config", {
          auto_enabled: autoChk.checked,
          interval_hours: Number(intervalInp.value || 24),
          retention_count: Number(root.querySelector("#bk-retention").value || 15),
        });
        toast("Backup configuration saved", "success");
        if (out.pruned > 0) toast(out.pruned + " old snapshot(s) retired to match the new retention", "info");
        reloadBackups();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "Save configuration";
        toast(e.message, "error");
      }
    };

    onDelegate(root, "click", "[data-bk-verify]", b => {
      const r = rows.find(x => Number(x.id) === Number(b.dataset.bkVerify));
      if (r) openVerifyBackupModal(r);
    });
    onDelegate(root, "click", "[data-bk-restore]", b => {
      const r = rows.find(x => Number(x.id) === Number(b.dataset.bkRestore));
      if (r) openRestoreBackupModal(r);
    });
    onDelegate(root, "click", "[data-bk-delete]", b => {
      const r = rows.find(x => Number(x.id) === Number(b.dataset.bkDelete));
      if (!r) return;
      confirmDialog("Delete backup snapshot",
        "This permanently deletes " + r.filename + " from the server. If this is your only copy, download it first.",
        async () => {
          await API.del("/backups/" + r.id);
          toast("Snapshot deleted", "success");
          reloadBackups();
        }, { danger: true, confirmLabel: "Delete snapshot" });
    });
  } catch (e) {
    root.innerHTML = pageHead("Backups & Recovery", "Unavailable")
      + emptyState("Could not load the backup register", e.message, "alert");
  }
};
