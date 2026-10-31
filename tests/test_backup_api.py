"""Database backup & recovery API tests; the live database file is a temp fixture."""
import hashlib
import os
import shutil
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from flask_sqlalchemy import SQLAlchemy

original_init = SQLAlchemy.init_app

def memory_init(self, application):
    application.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
    return original_init(self, application)

with patch.object(SQLAlchemy, 'init_app', memory_init):
    from app import app, db, User, AuditLog, DatabaseBackup, Setting


class BackupApiTest(unittest.TestCase):
    def setUp(self):
        self.ctx = app.app_context()
        self.ctx.push()
        self.client = app.test_client()
        self.admin = User.query.filter(User.role.has(slug='super_admin')).first()
        self.admin.token = 'backup-test-admin'
        self.employee = User.query.filter(User.role.has(slug='employee')).first()
        self.employee.token = 'backup-test-employee'
        db.session.commit()
        # Isolated workspace: temp backup folder + temp "live" database file.
        self.tmpdir = tempfile.mkdtemp(prefix='hrms-backup-test-')
        self.backup_dir = os.path.join(self.tmpdir, 'backups')
        self.live_path = os.path.join(self.tmpdir, 'live.db')
        self._seed_live_db('original-marker')
        app.config['HRMS_BACKUP_DIR'] = self.backup_dir
        app.config['HRMS_BACKUPS_AUTOCHECK'] = False
        self._patcher = patch('app._live_db_path', side_effect=lambda: self.live_path)
        self._patcher.start()
        self.addCleanup(self._patcher.stop)
        for row in DatabaseBackup.query.all():
            db.session.delete(row)
        for key in ('backup.retention_count', 'backup.auto_enabled', 'backup.interval_hours'):
            row = Setting.query.filter_by(key=key).first()
            if row:
                db.session.delete(row)
        db.session.commit()

    def tearDown(self):
        db.session.rollback()
        app.config.pop('HRMS_BACKUP_DIR', None)
        app.config.pop('HRMS_BACKUPS_AUTOCHECK', None)
        shutil.rmtree(self.tmpdir, ignore_errors=True)
        self.ctx.pop()

    def call(self, method, path, data=None, employee=False):
        return self.client.open('/api/v1/' + path, method=method, json=data,
            headers={'Authorization': 'Bearer backup-test-' + ('employee' if employee else 'admin')})

    def _seed_live_db(self, marker):
        if os.path.exists(self.live_path):
            os.remove(self.live_path)
        conn = sqlite3.connect(self.live_path)
        conn.execute('CREATE TABLE marker (value TEXT)')
        conn.execute('INSERT INTO marker (value) VALUES (?)', (marker,))
        conn.commit()
        conn.close()

    def _live_markers(self):
        conn = sqlite3.connect(self.live_path)
        try:
            return [r[0] for r in conn.execute('SELECT value FROM marker')]
        finally:
            conn.close()

    def _snapshot_markers(self, filename):
        conn = sqlite3.connect(os.path.join(self.backup_dir, filename))
        try:
            return [r[0] for r in conn.execute('SELECT value FROM marker')]
        finally:
            conn.close()

    # ------------------------------------------------------------------ access

    def test_backup_endpoints_require_super_admin(self):
        for method, path in (('GET', 'backups'), ('POST', 'backups'),
                             ('PUT', 'backups/config'), ('POST', 'backups/1/restore'),
                             ('POST', 'backups/1/verify'), ('DELETE', 'backups/1')):
            self.assertEqual(self.call(method, path, employee=True).status_code, 403,
                             f'{method} {path} must be super-admin only')

    # ------------------------------------------------------------ list/create

    def test_list_and_create_snapshot(self):
        listing = self.call('GET', 'backups')
        self.assertEqual(listing.status_code, 200, listing.json)
        self.assertEqual(listing.json['data'], [])
        summary = listing.json['summary']
        self.assertEqual(summary['count'], 0)
        self.assertTrue(summary['file_based'])
        self.assertEqual(summary['live_db_bytes'], os.path.getsize(self.live_path))
        self.assertEqual(listing.json['config'], {'retention_count': 15, 'auto_enabled': False, 'interval_hours': 24})

        created = self.call('POST', 'backups', {'label': 'Before payroll cutover'})
        self.assertEqual(created.status_code, 201, created.json)
        row = created.json['data']
        self.assertEqual(row['label'], 'Before payroll cutover')
        self.assertEqual(row['trigger'], 'manual')
        self.assertEqual(row['created_by_name'], self.admin.employee.full_name)
        path = os.path.join(self.backup_dir, row['filename'])
        self.assertTrue(os.path.exists(path))
        self.assertEqual(row['size_bytes'], os.path.getsize(path))
        with open(path, 'rb') as fh:
            self.assertEqual(row['checksum_sha256'], hashlib.sha256(fh.read()).hexdigest())
        self.assertEqual(self._snapshot_markers(row['filename']), ['original-marker'])

        listing = self.call('GET', 'backups')
        self.assertEqual(listing.json['summary']['count'], 1)
        self.assertEqual(listing.json['summary']['last_backup_at'], row['created_at'])
        self.assertTrue(AuditLog.query.filter_by(event='backup_created', entity_id=row['id']).first())

    def test_label_length_is_validated(self):
        self.assertEqual(self.call('POST', 'backups', {'label': 'x' * 181}).status_code, 422)

    # ------------------------------------------------- download/verify/delete

    def test_download_verify_and_delete_snapshot(self):
        row = self.call('POST', 'backups').json['data']
        bid = row['id']

        download = self.client.get(f'/api/v1/backups/{bid}/download?token=backup-test-admin')
        self.assertEqual(download.status_code, 200)
        with open(os.path.join(self.backup_dir, row['filename']), 'rb') as fh:
            self.assertEqual(download.data, fh.read())
        self.assertIn('attachment', download.headers.get('Content-Disposition', ''))
        download.close()

        verified = self.call('POST', f'backups/{bid}/verify')
        self.assertEqual(verified.status_code, 200, verified.json)
        self.assertTrue(verified.json['data']['valid'])
        self.assertTrue(verified.json['data']['checksum_match'])
        self.assertTrue(verified.json['data']['integrity_ok'])

        # Flip a byte inside the file: the checksum must no longer match.
        path = os.path.join(self.backup_dir, row['filename'])
        with open(path, 'r+b') as fh:
            fh.seek(100)
            fh.write(bytes([fh.read(1)[0] ^ 0xFF]))
        tampered = self.call('POST', f'backups/{bid}/verify')
        self.assertFalse(tampered.json['data']['checksum_match'])
        self.assertFalse(tampered.json['data']['valid'])

        deleted = self.call('DELETE', f'backups/{bid}')
        self.assertEqual(deleted.status_code, 200, deleted.json)
        self.assertFalse(os.path.exists(path))
        self.assertEqual(self.call('GET', 'backups').json['summary']['count'], 0)
        self.assertTrue(AuditLog.query.filter_by(event='backup_deleted', entity_id=bid).first())
        self.assertEqual(self.call('DELETE', f'backups/{bid}').status_code, 404)

    # ------------------------------------------------------------- retention

    def test_retention_prunes_the_oldest_snapshots(self):
        config = self.call('PUT', 'backups/config', {'retention_count': 2})
        self.assertEqual(config.status_code, 200, config.json)
        self.assertEqual(config.json['data']['retention_count'], 2)

        first = self.call('POST', 'backups', {'label': 'oldest'}).json['data']
        self.call('POST', 'backups', {'label': 'middle'})
        third = self.call('POST', 'backups', {'label': 'newest'})
        self.assertEqual(third.json['pruned'], 1)

        listing = self.call('GET', 'backups').json
        self.assertEqual(listing['summary']['count'], 2)
        self.assertEqual([r['label'] for r in listing['data']], ['newest', 'middle'])
        self.assertFalse(os.path.exists(os.path.join(self.backup_dir, first['filename'])))
        self.assertIsNone(DatabaseBackup.query.filter_by(filename=first['filename']).first())

    def test_config_validation_rejects_bad_values(self):
        self.assertEqual(self.call('PUT', 'backups/config', {'retention_count': 0}).status_code, 422)
        self.assertEqual(self.call('PUT', 'backups/config', {'retention_count': 101}).status_code, 422)
        self.assertEqual(self.call('PUT', 'backups/config', {'interval_hours': 0}).status_code, 422)
        self.assertEqual(self.call('PUT', 'backups/config', {'interval_hours': 'daily'}).status_code, 422)
        self.assertEqual(self.call('PUT', 'backups/config', {}).status_code, 422)

        toggled = self.call('PUT', 'backups/config', {'auto_enabled': True, 'interval_hours': 12})
        self.assertEqual(toggled.status_code, 200, toggled.json)
        self.assertTrue(toggled.json['data']['auto_enabled'])
        self.assertEqual(toggled.json['data']['interval_hours'], 12)
        self.assertTrue(AuditLog.query.filter_by(event='backup_config_updated').first())

    # --------------------------------------------------------------- restore

    def test_restore_replaces_live_db_and_keeps_safety_snapshot(self):
        backup = self.call('POST', 'backups', {'label': 'known good'}).json['data']
        self._seed_live_db('changed-after-backup')
        self.assertEqual(self._live_markers(), ['changed-after-backup'])

        restored = self.call('POST', f"backups/{backup['id']}/restore", {})
        self.assertEqual(restored.status_code, 200, restored.json)
        self.assertEqual(restored.json['data']['restored'], backup['filename'])

        # The live database is back to the backed-up state.
        self.assertEqual(self._live_markers(), ['original-marker'])

        # The state that was overwritten is preserved as a pre-restore snapshot.
        pre = restored.json['data']['pre_restore_snapshot']
        self.assertTrue(pre['filename'].startswith('hrms_'))
        self.assertEqual(self._snapshot_markers(pre['filename']), ['changed-after-backup'])
        pre_row = DatabaseBackup.query.filter_by(filename=pre['filename']).first()
        self.assertIsNotNone(pre_row)
        self.assertEqual(pre_row.trigger, 'pre_restore')
        self.assertEqual(DatabaseBackup.query.count(), 2)
        self.assertTrue(AuditLog.query.filter_by(event='backup_restored', entity_id=backup['id']).first())

    def test_restore_guards_against_bad_sources(self):
        # Missing file on disk.
        row = self.call('POST', 'backups').json['data']
        os.remove(os.path.join(self.backup_dir, row['filename']))
        self.assertEqual(self.call('POST', f"backups/{row['id']}/restore", {}).status_code, 404)

        # Tampered file fails the checksum guard and must not touch the live DB.
        tampered = self.call('POST', 'backups').json['data']
        path = os.path.join(self.backup_dir, tampered['filename'])
        with open(path, 'r+b') as fh:
            fh.seek(200)
            fh.write(bytes([fh.read(1)[0] ^ 0xFF]))
        response = self.call('POST', f"backups/{tampered['id']}/restore", {})
        self.assertEqual(response.status_code, 422, response.json)
        self.assertIn('checksum', response.json['message'])
        self.assertEqual(self._live_markers(), ['original-marker'])

        # Unknown backup id.
        self.assertEqual(self.call('POST', 'backups/999999/restore', {}).status_code, 404)

    def test_restore_requires_file_based_database(self):
        row = self.call('POST', 'backups').json['data']
        with patch('app._live_db_path', return_value=None):
            response = self.call('POST', f"backups/{row['id']}/restore", {})
        self.assertEqual(response.status_code, 422, response.json)

    def test_create_requires_file_based_database(self):
        with patch('app._live_db_path', return_value=None):
            response = self.call('POST', 'backups', {})
        self.assertEqual(response.status_code, 422, response.json)


if __name__ == '__main__':
    unittest.main()
