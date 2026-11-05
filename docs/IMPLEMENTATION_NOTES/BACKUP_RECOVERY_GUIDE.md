# Database Backup & Recovery — Complete Guide

The HRMS now ships with a professional, in-app **Backups & Recovery** console for Super Admins
(`System → Backups & recovery` in the sidebar, or `#/backups`). It replaces the old
`backup_database.bat` copy script with verifiable, audited snapshots and one-click restore.

---

## What it does

| Capability | How it works |
|---|---|
| **Create snapshot** | Uses SQLite's *online backup API* — a transaction-safe, consistent copy of `instance/hrms.db` taken while the server keeps running. |
| **Integrity** | Every snapshot gets a **SHA-256 checksum** recorded at creation. "Verify" recomputes the checksum and runs SQLite's `PRAGMA integrity_check` against the file on disk. |
| **Download** | Any snapshot can be downloaded as a plain `.db` file for off-server storage (encrypted drive, NAS, cloud). |
| **Restore** | Restoring first takes an automatic **pre-restore safety snapshot** of the current database, verifies the chosen backup's checksum, then swaps it in and recycles the connection pool. Every restore is therefore reversible. |
| **Retention** | Configurable "keep last N snapshots" (1–100, default 15). Older snapshots are retired automatically after each new backup. |
| **Scheduling** | Optional automatic backups — the server takes a snapshot in the background when the last one is older than the configured interval (1–168 hours, default 24). |
| **Audit trail** | `backup_created`, `backup_deleted`, `backup_restored` and `backup_config_updated` events are written to the platform audit log (Administration → Audit log). |

Snapshots are stored in the `backups/` folder next to the application (git-ignored) and are
registered in the new `database_backups` table.

## Access control

Every backup endpoint is **Super Admin only** — all other roles (including HR Admin and
Auditor) receive `403`. The page itself renders a locked state for non-admins.

## Using the page

1. **Create backups before risky work** — payroll cut-overs, imports, upgrades. Add a label
   such as *"Before November payroll"* so the snapshot is easy to find later.
2. **Watch the status banner** — green means a backup was taken in the last 24 h; amber/red
   warns that the database is getting stale or unprotected.
3. **Verify before trusting** — verification re-checks the file on disk against the recorded
   checksum and reports both checksum and SQLite integrity results.
4. **Keep an off-server copy** — download snapshots regularly; server-side retention is not a
   substitute for off-site storage.
5. **Restore** — requires typing `RESTORE` to confirm. The current state is snapshotted
   automatically first, so an accidental restore can itself be rolled back. After a restore
   the browser reloads; sessions that predate the snapshot must sign in again.

## API reference (Super Admin only)

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/backups` | List snapshots + summary (counts, sizes, live DB size) + config |
| `POST` | `/api/v1/backups` | Create a snapshot (optional `{"label": "..."}`) |
| `GET` | `/api/v1/backups/<id>/download` | Download the `.db` file (accepts `?token=`) |
| `POST` | `/api/v1/backups/<id>/verify` | Recompute checksum + SQLite integrity check |
| `POST` | `/api/v1/backups/<id>/restore` | Verify, safety-snapshot, then restore |
| `DELETE` | `/api/v1/backups/<id>` | Delete the snapshot file and register entry |
| `PUT` | `/api/v1/backups/config` | Update `retention_count`, `auto_enabled`, `interval_hours` |

## Configuration defaults

Stored in the `settings` table under the `backup` group:

- `backup.retention_count = 15`
- `backup.auto_enabled = 0` (off by default)
- `backup.interval_hours = 24`

## Tests

- `PYTHONPATH=. python -m unittest discover -s tests` — includes `tests/test_backup_api.py`
  (create, download, verify, tamper detection, retention pruning, restore + safety snapshot,
  permission guards).
- `node --test tests/test_backups_ui.js` — page rendering, restore confirmation gate,
  verify modal, config saving, nav registration.

## Note on `backup_database.bat`

The legacy Windows script still works as an emergency offline copy, but files it creates are
not registered in the console (no checksum, no restore button). Prefer the in-app console;
use the script only when the server itself will not start.
