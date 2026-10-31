# Two-Factor Authentication (2FA) — Implementation Guide

The **Account & Security** tab previously showed a two-factor switch that only flipped a
database flag: nothing was ever verified, no authenticator was enrolled, and sign-in never
asked for a code. That switch has been replaced with a real, RFC 6238 TOTP implementation.

---

## What works now

| Area | Behaviour |
| --- | --- |
| Settings › Account & Security | Live 2FA card: status, **Enable two-factor authentication** wizard, recovery codes, trusted-device list, turn-off flow |
| Enrolment | QR code + manual setup key + 10 one-time recovery codes; **nothing is enabled until a code from the app is verified** |
| Sign-in | Password is followed by a **6-digit code** step. `Trust this device for 1 month` checkbox (30 days) skips the code on that browser only |
| Recovery | Any unused recovery code works once, then is burned. Codes can be regenerated (password required) |
| Users without 2FA | Prompted after every sign-in (skippable, snoozed 7 days) **and** shown a dashboard banner + settings callout |
| Audit | `mfa_setup_started`, `mfa_enabled`, `mfa_disabled`, `mfa_login_verified`, `mfa_trusted_device_revoked`, `mfa_recovery_codes_regenerated` are written to the audit log |
| Sign-in history | Each row now shows the method — `Password` or `Password + 2FA` |
| Brute force | 5 wrong codes in 15 minutes → 423 "Try again in 15 minutes" |

Accounts that had the old flag set (with no secret) are treated as **not protected** and are
prompted to enrol, so nobody is locked out by the old behaviour.

---

## User flows

### Enrolling (any role, including admins)
1. Settings › **Account & Security** → **Enable two-factor authentication** (or dashboard banner → *Set up 2FA*).
2. Scan the QR code with Google Authenticator, Microsoft Authenticator, Authy, 1Password, etc. — or type the setup key.
3. Save the 10 recovery codes (copy / download).
4. Enter the current 6-digit code → **Verify & enable**.

### Signing in afterwards
1. Email/username/employee ID + password.
2. Enter the 6-digit code.
3. Leave **Trust this device for 1 month** ticked to skip the code on this browser for 30 days.
   Revoke any device later from Settings › Account & Security › Trusted devices.

### Turning 2FA off
Settings › Account & Security → **Turn off**. Requires the account password **plus** a current
authenticator code (or a recovery code). All trusted devices are removed.

---

## API reference (`/api/v1`)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` | – | Returns `{token, user}` or `{mfa_required, challenge, account, trust_days}`. Send `trusted_device` to skip the code |
| POST | `/auth/mfa/verify` | – | `{challenge, code, remember_device}` → session token. `challenge` lasts 5 minutes |
| GET | `/auth/mfa/status` | ✔ | Enrolment state, recovery codes left, trusted devices |
| POST | `/auth/mfa/setup` | ✔ | Creates secret + QR payload + recovery codes (not yet enabled) |
| POST | `/auth/mfa/confirm` | ✔ | `{code}` → enables 2FA |
| POST | `/auth/mfa/disable` | ✔ | `{password, code}` |
| POST | `/auth/mfa/recovery-codes` | ✔ | `{password}` → 10 new codes (old ones die) |
| GET | `/auth/mfa/devices` | ✔ | Trusted devices |
| DELETE | `/auth/mfa/devices/<id>` | ✔ | Revoke one device |
| POST | `/auth/mfa/prompt-dismiss` | ✔ | Snooze the enrolment reminder for 7 days |
| PUT | `/auth/mfa` | ✔ | Legacy toggle — enabling now returns 422 (must use the verified setup flow) |

---

## Files

| File | Change |
| --- | --- |
| `mfa.py` | New — TOTP (RFC 6238), recovery codes, trusted devices, signed login challenges |
| `models.py` | `User.mfa_secret / mfa_recovery_codes / mfa_confirmed_at / mfa_prompt_snoozed_at`, `LoginHistory.mfa_used`, new `MfaTrustedDevice` table |
| `app.py` | Login second factor, `/auth/mfa/*` endpoints, `ensure_schema()` columns, stable `secret_key` for challenges |
| `static/js/mfa.js` | New — QR wizard, recovery codes, trusted devices, post-login reminder (shared by settings, dashboard and sign-in) |
| `static/js/vendor-qrcode.js` | Vendored `qrcode-generator` 2.0.4 (MIT, offline QR rendering) |
| `static/js/api.js`, `static/js/app.js` | `verifyMfa()`, sign-in code step, trusted-device storage, reminder hooks |
| `static/js/settings_notifications.js` | Real 2FA card replaces the dead switch; sign-in history "Method" column |
| `static/js/views.js`, `static/js/views3.js` | Dashboard reminder banner, Preferences security card |
| `templates/index.html` | MFA step markup, `mfa.js` include, asset version bump `1.0.22` |
| `tests/test_mfa_api.py` | 20 tests: setup/confirm, gating, trusted device (30 days), expiry, recovery codes, throttling, disable, prompt snooze |

---

## Notes

* No new Python dependency: TOTP is implemented with `hmac`/`hashlib`, challenges use
  `itsdangerous` (ships with Flask).
* The challenge signing key is read from `HRMS_SECRET_KEY`, otherwise generated once into
  `instance/secret_key.txt` (git-ignored). Keep that file out of backups you share, or set the
  environment variable in production.
* Existing databases migrate automatically on start (`ensure_schema()` adds the columns and
  `db.create_all()` adds `mfa_trusted_devices`).
* Assets are cache-busted to `?v=1.0.22` — bump again after future JS/CSS edits.

## Tests

```bash
python -m pytest tests -q          # 41 passed
python -m pytest tests/test_mfa_api.py -q   # 2FA suite only
```
