"""Two-factor authentication API tests (in-memory database).

Run with:  python -m pytest tests/test_mfa_api.py -q
"""
import unittest
from datetime import datetime
from unittest.mock import patch

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash

original_init = SQLAlchemy.init_app


def memory_init(self, application):
    application.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
    return original_init(self, application)


with patch.object(SQLAlchemy, 'init_app', memory_init):
    from app import app, db, User, MfaTrustedDevice, LoginHistory
    import mfa


class TotpUnitTest(unittest.TestCase):
    def test_rfc4226_reference_vector(self):
        # base32 of the RFC 4226 shared secret "12345678901234567890"
        secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        self.assertEqual(mfa.totp(secret, at=datetime(1970, 1, 1, 0, 0, 59)), "287082")

    def test_verify_accepts_current_step_only(self):
        secret = mfa.generate_secret()
        code = mfa.totp(secret)
        self.assertTrue(mfa.verify_totp(secret, code))
        self.assertFalse(mfa.verify_totp(secret, "000000" if code != "000000" else "111111"))

    def test_provisioning_uri(self):
        uri = mfa.provisioning_uri("JBSWY3DPEHPK3PXP", "ama@example.com")
        self.assertTrue(uri.startswith("otpauth://totp/"))
        self.assertIn("secret=JBSWY3DPEHPK3PXP", uri)
        self.assertIn("issuer=Meridian", uri)


class MfaApiTest(unittest.TestCase):
    def setUp(self):
        self.ctx = app.app_context()
        self.ctx.push()
        self.client = app.test_client()
        self.user = User.query.filter(User.role.has(slug='employee')).first()
        self.user.password_hash = generate_password_hash("Employee@123")
        self.user.mfa_enabled = False
        self.user.mfa_secret = None
        self.user.mfa_recovery_codes = None
        self.user.mfa_confirmed_at = None
        self.user.mfa_prompt_snoozed_at = None
        self.user.token = "mfa-test-token"
        self.user.token_expires_at = None
        self.user.locked_until = None
        self.user.failed_attempts = 0
        MfaTrustedDevice.query.filter_by(user_id=self.user.id).delete()
        LoginHistory.query.filter_by(user_id=self.user.id).delete()
        db.session.commit()
        app.config["WTF_CSRF_ENABLED"] = False

    def tearDown(self):
        db.session.remove()
        self.ctx.pop()

    # ---------------------------------------------------------------- helpers
    def auth(self):
        # Sign-in rotates the bearer token, so always read the current value.
        return {"Authorization": "Bearer " + (self.user.token or "mfa-test-token")}

    def login(self, **extra):
        payload = {"email": self.user.email, "password": "Employee@123"}
        payload.update(extra)
        return self.client.post("/api/v1/auth/login", json=payload)

    def setup_and_confirm(self):
        setup = self.client.post("/api/v1/auth/mfa/setup", headers=self.auth()).get_json()["data"]
        code = mfa.totp(setup["secret"])
        confirm = self.client.post("/api/v1/auth/mfa/confirm", json={"code": code}, headers=self.auth())
        return setup, confirm

    # ------------------------------------------------------------------ tests
    def test_status_defaults_to_disabled(self):
        res = self.client.get("/api/v1/auth/mfa/status", headers=self.auth())
        self.assertEqual(res.status_code, 200)
        data = res.get_json()["data"]
        self.assertFalse(data["enabled"])
        self.assertEqual(data["recovery_codes_remaining"], 0)

    def test_setup_returns_secret_qr_payload_and_recovery_codes(self):
        res = self.client.post("/api/v1/auth/mfa/setup", headers=self.auth())
        self.assertEqual(res.status_code, 200)
        data = res.get_json()["data"]
        self.assertTrue(data["secret"])
        self.assertTrue(data["otpauth_uri"].startswith("otpauth://totp/"))
        self.assertEqual(len(data["recovery_codes"]), mfa.RECOVERY_CODE_COUNT)
        # A setup alone must not switch 2FA on — it has to be verified.
        status = self.client.get("/api/v1/auth/mfa/status", headers=self.auth()).get_json()["data"]
        self.assertFalse(status["enabled"])
        self.assertTrue(status["pending_setup"])

    def test_confirm_with_wrong_code_keeps_2fa_off(self):
        self.client.post("/api/v1/auth/mfa/setup", headers=self.auth())
        res = self.client.post("/api/v1/auth/mfa/confirm", json={"code": "000000"}, headers=self.auth())
        self.assertEqual(res.status_code, 422)
        self.assertFalse(self.client.get("/api/v1/auth/mfa/status", headers=self.auth()).get_json()["data"]["enabled"])

    def test_confirm_enables_2fa_and_login_then_requires_a_code(self):
        _, confirm = self.setup_and_confirm()
        self.assertEqual(confirm.status_code, 200)
        self.assertTrue(confirm.get_json()["data"]["enabled"])

        res = self.login()
        self.assertEqual(res.status_code, 200)
        data = res.get_json()["data"]
        self.assertTrue(data.get("mfa_required"))
        self.assertNotIn("token", data)
        self.assertTrue(data["challenge"])

    def test_verify_with_valid_code_issues_session(self):
        _, confirm = self.setup_and_confirm()
        challenge = self.login().get_json()["data"]["challenge"]
        setup_secret = self.user.mfa_secret
        res = self.client.post("/api/v1/auth/mfa/verify",
                               json={"challenge": challenge, "code": mfa.totp(setup_secret)})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()["data"]
        self.assertTrue(data["token"])
        self.assertEqual(data["user"]["id"], self.user.id)
        self.assertFalse(data["used_recovery_code"])

    def test_verify_rejects_bad_code(self):
        self.setup_and_confirm()
        challenge = self.login().get_json()["data"]["challenge"]
        res = self.client.post("/api/v1/auth/mfa/verify", json={"challenge": challenge, "code": "123456"})
        self.assertEqual(res.status_code, 422)

    def test_repeated_bad_codes_are_throttled(self):
        self.setup_and_confirm()
        challenge = self.login().get_json()["data"]["challenge"]
        statuses = []
        for _ in range(6):
            statuses.append(self.client.post("/api/v1/auth/mfa/verify",
                                             json={"challenge": challenge, "code": "111111"}).status_code)
        self.assertEqual(statuses[:5], [422] * 5)
        self.assertEqual(statuses[5], 423)

    def test_verify_rejects_tampered_challenge(self):
        self.setup_and_confirm()
        res = self.client.post("/api/v1/auth/mfa/verify",
                               json={"challenge": "not-a-real-challenge", "code": mfa.totp(self.user.mfa_secret)})
        self.assertEqual(res.status_code, 401)

    def test_trust_device_for_one_month_skips_code(self):
        _, confirm = self.setup_and_confirm()
        challenge = self.login().get_json()["data"]["challenge"]
        verify = self.client.post("/api/v1/auth/mfa/verify", json={
            "challenge": challenge,
            "code": mfa.totp(self.user.mfa_secret),
            "remember_device": True,
        }).get_json()["data"]
        device_token = verify["trusted_device"]
        self.assertTrue(device_token)
        self.assertEqual(verify["trust_days"], 30)

        device = MfaTrustedDevice.query.filter_by(user_id=self.user.id).first()
        self.assertIsNotNone(device)
        # ~30 days from now
        self.assertGreater((device.expires_at - datetime.utcnow()).days, 28)

        res = self.login(trusted_device=device_token)
        data = res.get_json()["data"]
        self.assertFalse(data.get("mfa_required", False))
        self.assertTrue(data.get("token"))

    def test_expired_trusted_device_requires_code_again(self):
        self.setup_and_confirm()
        challenge = self.login().get_json()["data"]["challenge"]
        token = self.client.post("/api/v1/auth/mfa/verify", json={
            "challenge": challenge, "code": mfa.totp(self.user.mfa_secret), "remember_device": True,
        }).get_json()["data"]["trusted_device"]
        device = MfaTrustedDevice.query.filter_by(user_id=self.user.id).first()
        device.expires_at = datetime(2000, 1, 1)
        db.session.commit()
        self.assertTrue(self.login(trusted_device=token).get_json()["data"].get("mfa_required"))

    def test_recovery_code_is_single_use(self):
        setup, _ = self.setup_and_confirm()
        code = setup["recovery_codes"][0]
        challenge = self.login().get_json()["data"]["challenge"]
        first = self.client.post("/api/v1/auth/mfa/verify", json={"challenge": challenge, "code": code})
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.get_json()["data"]["used_recovery_code"])
        self.assertEqual(first.get_json()["data"]["recovery_codes_remaining"], mfa.RECOVERY_CODE_COUNT - 1)

        challenge2 = self.login().get_json()["data"]["challenge"]
        second = self.client.post("/api/v1/auth/mfa/verify", json={"challenge": challenge2, "code": code})
        self.assertEqual(second.status_code, 422)

    def test_regenerate_recovery_codes_requires_password(self):
        self.setup_and_confirm()
        bad = self.client.post("/api/v1/auth/mfa/recovery-codes", json={"password": "nope"}, headers=self.auth())
        self.assertEqual(bad.status_code, 422)
        good = self.client.post("/api/v1/auth/mfa/recovery-codes", json={"password": "Employee@123"}, headers=self.auth())
        self.assertEqual(good.status_code, 200)
        self.assertEqual(len(good.get_json()["data"]["recovery_codes"]), mfa.RECOVERY_CODE_COUNT)

    def test_disable_requires_password_and_code(self):
        self.setup_and_confirm()
        no_pw = self.client.post("/api/v1/auth/mfa/disable", json={"code": mfa.totp(self.user.mfa_secret)}, headers=self.auth())
        self.assertEqual(no_pw.status_code, 422)
        wrong_code = self.client.post("/api/v1/auth/mfa/disable",
                                      json={"password": "Employee@123", "code": "000000"}, headers=self.auth())
        self.assertEqual(wrong_code.status_code, 422)
        ok = self.client.post("/api/v1/auth/mfa/disable",
                              json={"password": "Employee@123", "code": mfa.totp(self.user.mfa_secret)},
                              headers=self.auth())
        self.assertEqual(ok.status_code, 200)
        self.assertFalse(ok.get_json()["data"]["enabled"])
        self.assertFalse(self.login().get_json()["data"].get("mfa_required"))
        self.assertEqual(MfaTrustedDevice.query.filter_by(user_id=self.user.id).count(), 0)

    def test_legacy_toggle_cannot_enable_2fa(self):
        res = self.client.put("/api/v1/auth/mfa", json={"enabled": True}, headers=self.auth())
        self.assertEqual(res.status_code, 422)
        self.assertFalse(self.client.get("/api/v1/auth/mfa/status", headers=self.auth()).get_json()["data"]["enabled"])

    def test_devices_can_be_listed_and_revoked(self):
        self.setup_and_confirm()
        challenge = self.login().get_json()["data"]["challenge"]
        self.client.post("/api/v1/auth/mfa/verify", json={
            "challenge": challenge, "code": mfa.totp(self.user.mfa_secret), "remember_device": True,
        })
        devices = self.client.get("/api/v1/auth/mfa/devices", headers=self.auth()).get_json()["data"]
        self.assertEqual(len(devices), 1)
        revoked = self.client.delete(f"/api/v1/auth/mfa/devices/{devices[0]['id']}", headers=self.auth())
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(revoked.get_json()["data"], [])

    def test_prompt_due_for_users_without_2fa_then_snoozed(self):
        me = self.client.get("/api/v1/auth/me", headers=self.auth()).get_json()["data"]
        self.assertTrue(me["mfa_prompt_due"])
        dismissed = self.client.post("/api/v1/auth/mfa/prompt-dismiss", headers=self.auth())
        self.assertEqual(dismissed.status_code, 200)
        me2 = self.client.get("/api/v1/auth/me", headers=self.auth()).get_json()["data"]
        self.assertFalse(me2["mfa_prompt_due"])

    def test_login_history_records_second_factor(self):
        self.setup_and_confirm()
        challenge = self.login().get_json()["data"]["challenge"]
        self.client.post("/api/v1/auth/mfa/verify",
                         json={"challenge": challenge, "code": mfa.totp(self.user.mfa_secret)})
        history = self.client.get("/api/v1/auth/login-history", headers=self.auth()).get_json()["data"]
        self.assertTrue(any(row["mfa_used"] and row["success"] for row in history))


if __name__ == "__main__":
    unittest.main()
