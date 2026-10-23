"""Email and SMS delivery for Meridian HR.

Configuration is stored in the application settings table (`delivery.*`).
Supports both Sandbox (safe simulated delivery recorded in the delivery log)
and live gateways (SMTP for email; Twilio, Africa's Talking, and custom HTTP
webhooks for SMS).
"""
import base64
import json
import secrets
import smtplib
import ssl
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from email.utils import formataddr

from models import Setting

EVENT_CATALOG = [
    {"key": "account_credentials", "label": "Portal login credentials", "category": "Onboarding",
     "description": "Welcome email with username, temporary password and sign-in link sent to employees."},
    {"key": "employment_letter", "label": "Employment letter issued", "category": "Onboarding",
     "description": "Official appointment or contract letter issued for an employee's category."},
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
    {"key": "event_published", "label": "Company events", "category": "Events",
     "description": "A company or team event is scheduled or updated."},
    {"key": "event_reminder", "label": "Event reminders", "category": "Events",
     "description": "Reminders dispatched ahead of upcoming company events."},
    {"key": "ticket_update", "label": "Helpdesk updates", "category": "Helpdesk",
     "description": "A helpdesk ticket is assigned, replied to or resolved."},
    {"key": "asset_assigned", "label": "Asset assignments", "category": "Assets",
     "description": "Company equipment is issued to an employee."},
    {"key": "training_enrolled", "label": "Training enrolment", "category": "Training",
     "description": "An employee is enrolled in a learning programme."},
]

EVENT_MAP = {e["key"]: e for e in EVENT_CATALOG}

DEFAULT_ROUTING = {
    "account_credentials": {"in_app": True, "email": True, "sms": True},
    "employment_letter": {"in_app": True, "email": True, "sms": False},
    "leave_submitted": {"in_app": True, "email": True, "sms": False},
    "leave_decision": {"in_app": True, "email": True, "sms": True},
    "expense_submitted": {"in_app": True, "email": True, "sms": False},
    "expense_decision": {"in_app": True, "email": True, "sms": False},
    "payroll_paid": {"in_app": True, "email": True, "sms": True},
    "announcement": {"in_app": True, "email": True, "sms": False},
    "event_published": {"in_app": True, "email": True, "sms": False},
    "event_reminder": {"in_app": True, "email": True, "sms": True},
    "ticket_update": {"in_app": True, "email": True, "sms": False},
    "asset_assigned": {"in_app": True, "email": True, "sms": False},
    "training_enrolled": {"in_app": True, "email": True, "sms": False},
}

DEFAULT_USER_PREF = {"in_app": True, "email": True, "sms": True}

CONFIG_KEYS = [
    "email_enabled", "email_mode", "smtp_host", "smtp_port", "smtp_encryption",
    "smtp_username", "smtp_password", "smtp_from_email", "smtp_from_name",
    "smtp_reply_to", "email_subject_prefix",
    "sms_enabled", "sms_provider", "sms_sender_id", "sms_prefix",
    "twilio_account_sid", "twilio_auth_token", "twilio_from_number",
    "at_username", "at_api_key", "sms_webhook_url", "sms_api_key",
    "ann_default_in_app", "ann_default_email", "ann_default_sms",
    "evt_default_in_app", "evt_default_email", "evt_default_sms",
    "evt_default_reminder_hours",
]

SECRET_KEYS = {"smtp_password", "twilio_auth_token", "at_api_key", "sms_api_key"}

CONFIG_DEFAULTS = {
    "email_enabled": "1",
    "email_mode": "sandbox",
    "smtp_host": "",
    "smtp_port": "587",
    "smtp_encryption": "starttls",
    "smtp_username": "",
    "smtp_from_email": "notifications@meridian.gh",
    "smtp_from_name": "Meridian HR",
    "smtp_reply_to": "hr@meridian.gh",
    "email_subject_prefix": "[Meridian HR]",
    "sms_enabled": "1",
    "sms_provider": "sandbox",
    "sms_sender_id": "MeridianHR",
    "sms_prefix": "Meridian HR: ",
    "ann_default_in_app": "1",
    "ann_default_email": "1",
    "ann_default_sms": "0",
    "evt_default_in_app": "1",
    "evt_default_email": "1",
    "evt_default_sms": "0",
    "evt_default_reminder_hours": "24",
}


def settings_map():
    rows = Setting.query.filter(Setting.key.like("delivery.%")).all()
    return {r.key[len("delivery."):]: r.value for r in rows}


def config():
    values = dict(CONFIG_DEFAULTS)
    values.update(settings_map())
    return values


def email_provider_ready(cfg):
    mode = (cfg.get("email_mode") or "smtp").lower()
    if mode == "sandbox":
        return True
    return bool(cfg.get("smtp_host") and (cfg.get("smtp_from_email") or cfg.get("smtp_username")))


def sms_provider_ready(cfg):
    provider = (cfg.get("sms_provider") or "twilio").lower()
    if provider == "sandbox":
        return True
    if provider == "twilio":
        return bool(cfg.get("twilio_account_sid") and cfg.get("twilio_auth_token") and cfg.get("twilio_from_number"))
    if provider == "africastalking":
        return bool(cfg.get("at_username") and cfg.get("at_api_key"))
    if provider == "custom":
        return bool(cfg.get("sms_webhook_url"))
    return False


def public_config():
    cfg = config()
    out = {}
    for key in CONFIG_KEYS:
        if key in SECRET_KEYS:
            out[key] = ""
            out[key + "_set"] = bool(cfg.get(key))
        else:
            out[key] = cfg.get(key, "")
    out["email_ready"] = bool(cfg.get("email_enabled") == "1" and email_provider_ready(cfg))
    out["sms_ready"] = bool(cfg.get("sms_enabled") == "1" and sms_provider_ready(cfg))
    return out


def status_summary():
    cfg = config()
    return {
        "email_enabled": cfg.get("email_enabled") == "1",
        "email_mode": cfg.get("email_mode") or "smtp",
        "email_ready": bool(cfg.get("email_enabled") == "1" and email_provider_ready(cfg)),
        "sms_enabled": cfg.get("sms_enabled") == "1",
        "sms_provider": cfg.get("sms_provider") or "twilio",
        "sms_ready": bool(cfg.get("sms_enabled") == "1" and sms_provider_ready(cfg)),
        "ann_defaults": {
            "in_app": cfg.get("ann_default_in_app", "1") == "1",
            "email": cfg.get("ann_default_email", "1") == "1",
            "sms": cfg.get("ann_default_sms", "0") == "1",
        },
        "evt_defaults": {
            "in_app": cfg.get("evt_default_in_app", "1") == "1",
            "email": cfg.get("evt_default_email", "1") == "1",
            "sms": cfg.get("evt_default_sms", "0") == "1",
            "reminder_hours": int(cfg.get("evt_default_reminder_hours") or 24),
        },
        "events": EVENT_CATALOG,
    }


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
        out[key] = dict(DEFAULT_ROUTING.get(key, DEFAULT_USER_PREF))
        out[key].update(stored.get(key) or {})
    return out


def preference_for(user_id, event_key):
    from models import NotificationPreference
    pref = NotificationPreference.query.filter_by(user_id=user_id, event_key=event_key).first()
    if pref:
        return {"in_app": bool(pref.in_app), "email": bool(pref.email), "sms": bool(pref.sms)}
    return dict(DEFAULT_USER_PREF)


def user_preferences_all(user_id):
    from models import NotificationPreference
    rows = {
        r.event_key: {"in_app": bool(r.in_app), "email": bool(r.email), "sms": bool(r.sms)}
        for r in NotificationPreference.query.filter_by(user_id=user_id).all()
    }
    routing = event_routing()
    out = {}
    for ev in EVENT_CATALOG:
        key = ev["key"]
        if key in rows:
            out[key] = rows[key]
        else:
            # Default user opt-in mirrors active routing defaults, with SMS allowed if triggered
            out[key] = {
                "in_app": True,
                "email": True,
                "sms": bool(routing.get(key, {}).get("sms", True)),
            }
    return out


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


def format_subject(subject, cfg=None):
    cfg = cfg or config()
    prefix = (cfg.get("email_subject_prefix") or "").strip()
    subj = (subject or "Notification").strip()
    if prefix and not subj.startswith(prefix):
        return f"{prefix} {subj}"
    return subj


def format_sms_body(text, cfg=None):
    cfg = cfg or config()
    prefix = cfg.get("sms_prefix") or ""
    body = (text or "").strip()
    if prefix and not body.startswith(prefix.strip()):
        body = f"{prefix}{body}"
    return body[:320]


def send_email(to_email, subject, text_body, html_body=None):
    cfg = config()
    if cfg.get("email_enabled") != "1":
        return {"ok": False, "status": "disabled", "error": "Email delivery is disabled in gateway settings"}
    if not to_email or "@" not in str(to_email):
        return {"ok": False, "status": "skipped", "error": "Recipient has no valid email address"}
    mode = (cfg.get("email_mode") or "smtp").lower()
    full_subject = format_subject(subject, cfg)
    from_email = cfg.get("smtp_from_email") or cfg.get("smtp_username") or "notifications@meridian.gh"
    msg = EmailMessage()
    msg["Subject"] = full_subject
    msg["From"] = formataddr((cfg.get("smtp_from_name") or "Meridian HR", from_email))
    msg["To"] = to_email
    if cfg.get("smtp_reply_to"):
        msg["Reply-To"] = cfg["smtp_reply_to"]
    msg.set_content(text_body or "")
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    if mode == "sandbox":
        return {
            "ok": True,
            "status": "simulated",
            "error": None,
            "ref": "sim-mail-" + secrets.token_hex(5),
        }
    if not cfg.get("smtp_host"):
        return {"ok": False, "status": "failed", "error": "SMTP host is not configured"}
    if not (cfg.get("smtp_from_email") or cfg.get("smtp_username")):
        return {"ok": False, "status": "failed", "error": "Sender email is not configured"}
    try:
        with _smtp_connect(cfg) as server:
            server.send_message(msg)
        return {"ok": True, "status": "sent", "error": None, "ref": "smtp-" + secrets.token_hex(4)}
    except Exception as exc:
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
    headers = {"Content-Type": "application/json"}
    if cfg.get("sms_api_key"):
        headers["Authorization"] = "Bearer " + cfg.get("sms_api_key")
    payload = json.dumps({
        "to": to_number,
        "message": body,
        "sender": cfg.get("sms_sender_id") or "MeridianHR",
    }).encode()
    req = urllib.request.Request(cfg.get("sms_webhook_url"), data=payload, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode() or "{}")
    return data.get("id") or data.get("message_id") or ("webhook-" + secrets.token_hex(4))


def send_sms(to_number, body):
    cfg = config()
    if cfg.get("sms_enabled") != "1":
        return {"ok": False, "status": "disabled", "error": "SMS delivery is disabled in gateway settings"}
    if not to_number or not str(to_number).strip():
        return {"ok": False, "status": "skipped", "error": "Recipient has no phone number"}
    provider = (cfg.get("sms_provider") or "twilio").lower()
    formatted = format_sms_body(body, cfg)
    if provider == "sandbox":
        return {
            "ok": True,
            "status": "simulated",
            "error": None,
            "ref": "sim-sms-" + secrets.token_hex(5),
        }
    if not sms_provider_ready(cfg):
        return {"ok": False, "status": "failed", "error": f"SMS provider ({provider}) credentials are incomplete"}
    try:
        if provider == "twilio":
            ref = _twilio_send(cfg, to_number, formatted)
        elif provider == "africastalking":
            ref = _africastalking_send(cfg, to_number, formatted)
        elif provider == "custom":
            ref = _custom_send(cfg, to_number, formatted)
        else:
            return {"ok": False, "status": "failed", "error": f"Unknown SMS provider: {provider}"}
        return {"ok": True, "status": "sent", "error": None, "ref": ref}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        return {"ok": False, "status": "failed", "error": f"HTTP {exc.code}: {detail}"}
    except Exception as exc:
        return {"ok": False, "status": "failed", "error": str(exc)[:500]}


def _esc_html(val):
    return (
        str(val or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _brand_info():
    try:
        from models import Company
        comp = Company.query.first()
    except Exception:
        comp = None
    name = (comp.name if comp and comp.name else "Meridian HR").strip()
    legal = (comp.legal_name if comp and comp.legal_name else "").strip()
    tagline = (comp.tagline if comp and comp.tagline else "People Operations").strip()
    address = (comp.address if comp and comp.address else "").strip()
    return {
        "name": name,
        "display": f"{name} — {legal}" if legal and legal.lower() != name.lower() else name,
        "tagline": tagline.upper(),
        "address": address,
    }


def html_email(title, body, link=None, meta_rows=None, badge=None, action_label=None, extra_html=""):
    brand = _brand_info()
    safe_body = _esc_html(body or "").replace("\n", "<br>")
    badge_html = ""
    if badge:
        badge_html = (
            f'<div style="display:inline-block;background:#f7e9de;color:#a85c2d;font-size:11px;'
            f'font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;'
            f'border-radius:6px;margin-bottom:10px">{_esc_html(badge)}</div>'
        )
    meta_html = ""
    if meta_rows:
        rows = "".join(
            f'<tr><td style="padding:7px 14px 7px 0;color:#6b7773;font-size:12.5px;white-space:nowrap;'
            f'border-bottom:1px solid #efeae0;vertical-align:top">{_esc_html(k)}</td>'
            f'<td style="padding:7px 0;color:#1d2b29;font-size:13px;font-weight:600;'
            f'border-bottom:1px solid #efeae0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">{_esc_html(v)}</td></tr>'
            for k, v in meta_rows if v
        )
        if rows:
            meta_html = (
                '<div style="margin:18px 0;padding:14px 18px;background:#faf8f3;border:1px solid #e6e0d5;'
                f'border-radius:10px"><table style="border-collapse:collapse;width:100%">{rows}</table></div>'
            )
    action = ""
    if link:
        btn_text = _esc_html(action_label or f"Open {_esc_html(brand['name'])} Portal")
        action = (
            f'<p style="margin-top:24px"><a href="{_esc_html(link)}" style="display:inline-block;background:#c2703d;'
            f'color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">'
            f'{btn_text}</a></p>'
        )
    addr_line = f" &middot; {_esc_html(brand['address'])}" if brand["address"] else ""
    return (
        '<div style="font-family:Inter,Arial,sans-serif;background:#f5f3ee;padding:28px">'
        '<div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e6e0d5;border-radius:14px;overflow:hidden">'
        f'<div style="background:#14312e;color:#fff;padding:20px 26px"><b style="font-size:17px">{_esc_html(brand["display"])}</b>'
        f'<div style="font-size:11px;color:#b9cbc4;letter-spacing:.12em;margin-top:3px">{_esc_html(brand["tagline"])}</div></div>'
        f'<div style="padding:26px">{badge_html}<h2 style="font-size:20px;color:#1f2a27;margin:0 0 12px">{_esc_html(title)}</h2>'
        f'<div style="font-size:14px;line-height:1.7;color:#56615d">{safe_body}</div>{meta_html}{extra_html}{action}</div>'
        '<div style="padding:16px 26px;border-top:1px solid #eee8dd;color:#8a918d;font-size:11px">'
        f'Sent by {_esc_html(brand["display"])}{addr_line}. Keep any login credentials confidential.</div></div></div>'
    )
