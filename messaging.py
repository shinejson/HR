"""Email and SMS delivery for Meridian HR.

Configuration is stored in the application settings table. Nothing is sent
unless the relevant channel is explicitly enabled and fully configured, so
the demo environment remains safe by default.
"""
import base64
import json
import smtplib
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr

from models import Setting

EVENT_CATALOG = [
    {"key": "leave_submitted", "label": "Leave submitted", "category": "Leave",
     "description": "An employee submits a leave request for approval."},
    {"key": "leave_decision", "label": "Leave decision", "category": "Leave",
     "description": "A leave request is approved or declined."},
    {"key": "expense_submitted", "label": "Expense submitted", "category": "Expenses",
     "description": "An expense claim is routed to a line manager."},
    {"key": "expense_decision", "label": "Expense decision", "category": "Expenses",
     "description": "An expense claim is approved, declined or paid."},
    {"key": "payroll_paid", "label": "Payslip available", "category": "Payroll",
     "description": "A payroll run is marked paid and payslips are released."},
    {"key": "announcement", "label": "Announcements", "category": "Announcements",
     "description": "Company-wide or targeted announcements."},
    {"key": "ticket_update", "label": "Helpdesk updates", "category": "Helpdesk",
     "description": "A helpdesk ticket is assigned, replied to or resolved."},
    {"key": "asset_assigned", "label": "Asset assignments", "category": "Assets",
     "description": "Company equipment is issued to an employee."},
    {"key": "training_enrolled", "label": "Training enrolment", "category": "Training",
     "description": "An employee is enrolled in a learning programme."},
]

EVENT_MAP = {e["key"]: e for e in EVENT_CATALOG}

DEFAULT_ROUTING = {
    "leave_submitted": {"in_app": True, "email": True, "sms": False},
    "leave_decision": {"in_app": True, "email": True, "sms": True},
    "expense_submitted": {"in_app": True, "email": True, "sms": False},
    "expense_decision": {"in_app": True, "email": True, "sms": False},
    "payroll_paid": {"in_app": True, "email": True, "sms": True},
    "announcement": {"in_app": True, "email": True, "sms": False},
    "ticket_update": {"in_app": True, "email": True, "sms": False},
    "asset_assigned": {"in_app": True, "email": True, "sms": False},
    "training_enrolled": {"in_app": True, "email": True, "sms": False},
}

DEFAULT_PREFERENCE = {"in_app": True, "email": True, "sms": False}

CONFIG_KEYS = [
    "email_enabled", "smtp_host", "smtp_port", "smtp_encryption", "smtp_username",
    "smtp_password", "smtp_from_email", "smtp_from_name",
    "sms_enabled", "sms_provider", "sms_sender_id",
    "twilio_account_sid", "twilio_auth_token", "twilio_from_number",
    "at_username", "at_api_key", "sms_webhook_url",
]

SECRET_KEYS = {"smtp_password", "twilio_auth_token", "at_api_key"}

CONFIG_DEFAULTS = {
    "email_enabled": "0", "smtp_port": "587", "smtp_encryption": "starttls",
    "smtp_from_name": "Meridian HR", "sms_enabled": "0", "sms_provider": "twilio",
    "sms_sender_id": "Meridian",
}


def settings_map():
    rows = Setting.query.filter(Setting.key.like("delivery.%")).all()
    return {r.key[len("delivery."):]: r.value for r in rows}


def config():
    values = dict(CONFIG_DEFAULTS)
    values.update(settings_map())
    return values


def public_config():
    cfg = config()
    out = {}
    for key in CONFIG_KEYS:
        if key in SECRET_KEYS:
            out[key] = ""
            out[key + "_set"] = bool(cfg.get(key))
        else:
            out[key] = cfg.get(key, "")
    out["email_ready"] = bool(cfg.get("email_enabled") == "1" and cfg.get("smtp_host") and cfg.get("smtp_from_email"))
    out["sms_ready"] = bool(cfg.get("sms_enabled") == "1" and sms_provider_ready(cfg))
    return out


def sms_provider_ready(cfg):
    provider = cfg.get("sms_provider", "twilio")
    if provider == "twilio":
        return bool(cfg.get("twilio_account_sid") and cfg.get("twilio_auth_token") and cfg.get("twilio_from_number"))
    if provider == "africastalking":
        return bool(cfg.get("at_username") and cfg.get("at_api_key"))
    if provider == "custom":
        return bool(cfg.get("sms_webhook_url"))
    return False


def event_routing():
    raw = Setting.query.filter_by(key="delivery.event_routing").first()
    stored = {}
    if raw and raw.value:
        try:
            stored = json.loads(raw.value)
        except ValueError:
            stored = {}
    out = {}
    for key in EVENT_MAP:
        out[key] = dict(DEFAULT_ROUTING.get(key, DEFAULT_PREFERENCE))
        out[key].update(stored.get(key) or {})
    return out


def preference_for(user_id, event_key):
    from models import NotificationPreference
    pref = NotificationPreference.query.filter_by(user_id=user_id, event_key=event_key).first()
    if pref:
        return {"in_app": bool(pref.in_app), "email": bool(pref.email), "sms": bool(pref.sms)}
    return dict(DEFAULT_PREFERENCE)


def _smtp_connect(cfg):
    host = (cfg.get("smtp_host") or "").strip()
    port = int(cfg.get("smtp_port") or 587)
    encryption = (cfg.get("smtp_encryption") or "starttls").lower()
    if encryption == "ssl":
        server = smtplib.SMTP_SSL(host, port, timeout=10, context=ssl.create_default_context())
    else:
        server = smtplib.SMTP(host, port, timeout=10)
        server.ehlo()
        if encryption == "starttls":
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
    username = (cfg.get("smtp_username") or "").strip()
    password = cfg.get("smtp_password") or ""
    if username and password:
        server.login(username, password)
    return server


def send_email(to_email, subject, text_body, html_body=None):
    cfg = config()
    if cfg.get("email_enabled") != "1":
        return {"ok": False, "status": "disabled", "error": "Email delivery is disabled"}
    if not cfg.get("smtp_host"):
        return {"ok": False, "status": "failed", "error": "SMTP host is not configured"}
    if not to_email:
        return {"ok": False, "status": "skipped", "error": "Recipient has no email address"}
    from_email = cfg.get("smtp_from_email") or cfg.get("smtp_username")
    if not from_email:
        return {"ok": False, "status": "failed", "error": "Sender email is not configured"}
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg.get("smtp_from_name") or "Meridian HR", from_email))
    msg["To"] = to_email
    msg.set_content(text_body or "")
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    try:
        with _smtp_connect(cfg) as server:
            server.send_message(msg)
        return {"ok": True, "status": "sent", "error": None}
    except Exception as exc:  # network and auth errors are surfaced in the delivery log
        return {"ok": False, "status": "failed", "error": str(exc)[:500]}


def _twilio_send(cfg, to_number, body):
    sid = cfg.get("twilio_account_sid")
    token = cfg.get("twilio_auth_token")
    from_number = cfg.get("twilio_from_number")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{urllib.parse.quote(sid)}/Messages.json"
    payload = urllib.parse.urlencode({"To": to_number, "From": from_number, "Body": body}).encode()
    auth = base64.b64encode(f"{sid}:{token}".encode()).decode()
    req = urllib.request.Request(url, data=payload, method="POST", headers={
        "Authorization": "Basic " + auth,
        "Content-Type": "application/x-www-form-urlencoded",
    })
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode() or "{}")
    return data.get("sid")


def _africastalking_send(cfg, to_number, body):
    payload = urllib.parse.urlencode({
        "username": cfg.get("at_username"),
        "to": to_number,
        "message": body,
        "from": cfg.get("sms_sender_id") or "",
    }).encode()
    req = urllib.request.Request(
        "https://api.africastalking.com/version1/messaging",
        data=payload, method="POST", headers={
            "apiKey": cfg.get("at_api_key") or "",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        })
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode() or "{}")
    recipients = ((data.get("SMSMessageData") or {}).get("Recipients") or [{}])
    return recipients[0].get("messageId")


def _custom_send(cfg, to_number, body):
    payload = json.dumps({"to": to_number, "message": body, "sender": cfg.get("sms_sender_id")}).encode()
    req = urllib.request.Request(cfg.get("sms_webhook_url"), data=payload, method="POST", headers={
        "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode() or "{}")
    return data.get("id") or data.get("message_id")


def send_sms(to_number, body):
    cfg = config()
    if cfg.get("sms_enabled") != "1":
        return {"ok": False, "status": "disabled", "error": "SMS delivery is disabled"}
    if not to_number:
        return {"ok": False, "status": "skipped", "error": "Recipient has no phone number"}
    provider = (cfg.get("sms_provider") or "twilio").lower()
    if not sms_provider_ready(cfg):
        return {"ok": False, "status": "failed", "error": "SMS provider credentials are incomplete"}
    try:
        if provider == "twilio":
            ref = _twilio_send(cfg, to_number, body)
        elif provider == "africastalking":
            ref = _africastalking_send(cfg, to_number, body)
        elif provider == "custom":
            ref = _custom_send(cfg, to_number, body)
        else:
            return {"ok": False, "status": "failed", "error": "Unknown SMS provider"}
        return {"ok": True, "status": "sent", "error": None, "ref": ref}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        return {"ok": False, "status": "failed", "error": f"HTTP {exc.code}: {detail}"}
    except Exception as exc:
        return {"ok": False, "status": "failed", "error": str(exc)[:500]}


def html_email(title, body, link=None):
    safe_body = (body or "").replace("\n", "<br>")
    action = ""
    if link:
        action = f'<p style="margin-top:24px"><a href="{link}" style="background:#b86b3f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open Meridian HR</a></p>'
    return (
        '<div style="font-family:Inter,Arial,sans-serif;background:#f5f3ee;padding:28px">'
        '<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e6e0d5;border-radius:14px;overflow:hidden">'
        '<div style="background:#14312e;color:#fff;padding:20px 26px"><b style="font-size:17px">Meridian HR</b>'
        '<div style="font-size:11px;color:#b9cbc4;letter-spacing:.12em;margin-top:3px">PEOPLE OPERATIONS</div></div>'
        f'<div style="padding:26px"><h2 style="font-size:20px;color:#1f2a27;margin:0 0 12px">{title}</h2>'
        f'<div style="font-size:14px;line-height:1.7;color:#56615d">{safe_body}</div>{action}</div>'
        '<div style="padding:16px 26px;border-top:1px solid #eee8dd;color:#8a918d;font-size:11px">'
        'This message was sent by the Meridian HR system.</div></div></div>'
    )
