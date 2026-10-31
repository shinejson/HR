"""Two-factor authentication helpers (RFC 6238 TOTP, recovery codes, trusted devices).

Everything here is dependency-free: the only third-party pieces used are
werkzeug (already required by the app) and itsdangerous (shipped with Flask).
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import struct
from datetime import datetime, timedelta

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

import models

ISSUER = "Meridian HR"
SECRET_BYTES = 20           # 160-bit secret, as recommended by RFC 4226
STEP_SECONDS = 30
DIGITS = 6
VERIFY_WINDOW = 1           # accept the previous/next 30s step for clock drift
CHALLENGE_MAX_AGE = 300     # 5 minutes to enter the code after the password
TRUST_DAYS = 30             # "trust this device for 1 month"
RECOVERY_CODE_COUNT = 10
RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I, O, 0, 1


# --------------------------------------------------------------------- secrets
def generate_secret():
    """Return a fresh base32 TOTP secret (no padding), suitable for otpauth://."""
    return base64.b32encode(os.urandom(SECRET_BYTES)).decode("ascii").rstrip("=")


def _decode_secret(secret):
    raw = (secret or "").strip().replace(" ", "").upper()
    if not raw:
        raise ValueError("missing secret")
    padding = "=" * ((8 - len(raw) % 8) % 8)
    return base64.b32decode(raw + padding, casefold=True)


# ------------------------------------------------------------------------ TOTP
def totp(secret, at=None, step=STEP_SECONDS, digits=DIGITS):
    """Compute the RFC 6238 code for `at` (datetime, defaults to now UTC)."""
    moment = at or datetime.utcnow()
    counter = int(moment.timestamp() if moment.tzinfo else
                  (moment - datetime(1970, 1, 1)).total_seconds()) // step
    digest = hmac.new(_decode_secret(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(binary % (10 ** digits)).zfill(digits)


def normalize_code(code):
    return "".join(ch for ch in str(code or "") if ch.isalnum()).upper()


def verify_totp(secret, code, window=VERIFY_WINDOW, at=None):
    """Constant-time check of a 6 digit code, tolerating +-`window` steps."""
    candidate = normalize_code(code)
    if len(candidate) != DIGITS or not candidate.isdigit():
        return False
    moment = at or datetime.utcnow()
    for offset in range(-window, window + 1):
        if hmac.compare_digest(totp(secret, moment + timedelta(seconds=offset * STEP_SECONDS)), candidate):
            return True
    return False


def provisioning_uri(secret, account_name, issuer=ISSUER):
    from urllib.parse import quote

    label = quote(f"{issuer}:{account_name}", safe="")
    return (
        f"otpauth://totp/{label}"
        f"?secret={secret}&issuer={quote(issuer, safe='')}"
        f"&algorithm=SHA1&digits={DIGITS}&period={STEP_SECONDS}"
    )


# -------------------------------------------------------------- recovery codes
def _hash_code(code, salt):
    return hashlib.sha256((salt + normalize_code(code)).encode("utf-8")).hexdigest()


def generate_recovery_codes(count=RECOVERY_CODE_COUNT):
    """Return (plaintext_codes, json_payload_to_store)."""
    plain, stored = [], []
    for _ in range(count):
        raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(8))
        code = raw[:4] + "-" + raw[4:]
        salt = secrets.token_hex(8)
        plain.append(code)
        stored.append({"salt": salt, "hash": _hash_code(code, salt), "used_at": None})
    return plain, json.dumps(stored)


def load_recovery_codes(raw):
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    return data if isinstance(data, list) else []


def recovery_codes_remaining(raw):
    return sum(1 for item in load_recovery_codes(raw) if not item.get("used_at"))


def consume_recovery_code(user, code):
    """Mark a recovery code as used (single use) when it matches."""
    candidate = normalize_code(code)
    if len(candidate) != 8:
        return False
    records = load_recovery_codes(user.mfa_recovery_codes)
    for item in records:
        if item.get("used_at"):
            continue
        if hmac.compare_digest(_hash_code(candidate, item.get("salt", "")), item.get("hash", "")):
            item["used_at"] = datetime.utcnow().isoformat()
            user.mfa_recovery_codes = json.dumps(records)
            return True
    return False


# --------------------------------------------------------------------- devices
def hash_device_token(token):
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def new_device_token():
    return secrets.token_urlsafe(32)


def describe_client(user_agent):
    """Friendly, short label for the trusted device list."""
    ua = (user_agent or "").lower()
    browser = "Browser"
    for needle, name in (("edg/", "Edge"), ("opr/", "Opera"), ("chrome", "Chrome"),
                         ("firefox", "Firefox"), ("safari", "Safari")):
        if needle in ua:
            browser = name
            break
    platform = None
    for needle, name in (("iphone", "iPhone"), ("ipad", "iPad"), ("android", "Android"),
                         ("windows", "Windows"), ("mac os", "macOS"), ("linux", "Linux")):
        if needle in ua:
            platform = name
            break
    if browser == "Browser" and not platform:
        return "Web browser"
    if not platform:
        return browser
    if browser == "Browser":
        return f"Browser on {platform}"
    return f"{browser} on {platform}"


def trusted_device(user, token):
    """Return the matching, unexpired trusted device row for this user, if any."""
    if not token:
        return None
    row = models.MfaTrustedDevice.query.filter_by(
        user_id=user.id, token_hash=hash_device_token(token)
    ).first()
    if not row:
        return None
    if row.expires_at and row.expires_at < datetime.utcnow():
        return None
    return row


def trust_device(user, ip=None, user_agent=None, days=TRUST_DAYS):
    """Create a trusted-device row; returns (row, plaintext_token)."""
    token = new_device_token()
    row = models.MfaTrustedDevice(
        user_id=user.id,
        token_hash=hash_device_token(token),
        label=describe_client(user_agent),
        ip=ip,
        user_agent=(user_agent or "")[:255] or None,
        expires_at=datetime.utcnow() + timedelta(days=days),
    )
    models.db.session.add(row)
    return row, token


def clear_devices(user):
    models.MfaTrustedDevice.query.filter_by(user_id=user.id).delete()


# ------------------------------------------------------------------ challenges
def _serializer(app):
    return URLSafeTimedSerializer(app.secret_key, salt="hrms-mfa-challenge")


def issue_challenge(app, user):
    # Binding the challenge to the current password hash invalidates it when the
    # password changes, and the timestamp limits the window to CHALLENGE_MAX_AGE.
    fingerprint = hashlib.sha256(
        f"{user.password_hash}".encode("utf-8")
    ).hexdigest()[:16]
    return _serializer(app).dumps({"uid": user.id, "fp": fingerprint})


def read_challenge(app, token):
    """Return the challenged user id, or None when the token is unusable."""
    try:
        payload = _serializer(app).loads(token or "", max_age=CHALLENGE_MAX_AGE)
    except (SignatureExpired, BadSignature, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload.get("uid")


def challenge_matches(user, token, app):
    try:
        payload = _serializer(app).loads(token or "", max_age=CHALLENGE_MAX_AGE)
    except (SignatureExpired, BadSignature, TypeError):
        return False
    fingerprint = hashlib.sha256(f"{user.password_hash}".encode("utf-8")).hexdigest()[:16]
    return payload.get("uid") == user.id and payload.get("fp") == fingerprint
