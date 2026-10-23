import os
import re
import json
import secrets
import csv
import io
from datetime import datetime, date, timedelta
from decimal import Decimal, InvalidOperation
from functools import wraps

from flask import Flask, request, jsonify, render_template, send_file, abort
from flask_cors import CORS
from sqlalchemy import or_, func, false, text, inspect as sqla_inspect
from werkzeug.security import generate_password_hash, check_password_hash

from models import (
    db, Role, User, Company, Branch, Department, Designation, Grade, Employee,
    EmployeeContact, Dependant, BankAccount, EmploymentHistory, EmployeeSkill,
    EmployeeEducation, Contract, Document, Policy, PolicyAck, JobRequisition,
    JobPosting, Candidate, Application, Interview, OnboardingTemplate, OnboardingTask,
    Offboarding, Shift, Attendance, AttendanceCorrection, LeaveType, LeaveBalance,
    LeaveRequest, Holiday, SalaryComponent, SalaryStructure, TaxBand, PayrollRun,
    Payslip, PayslipItem, Loan, Goal, AppraisalCycle, Appraisal, Training,
    TrainingEnrolment, ExpenseCategory, ExpenseClaim, Asset, AssetAssignment,
    Ticket, TicketComment, Announcement, CompanyEvent, EventRsvp, Notification,
    NotificationPreference, NotificationDelivery, Approval, AuditLog, Setting,
    LoginHistory,
)
import messaging
from seed import seed, _paye

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(BASE_DIR, "instance", "hrms.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JSON_SORT_KEYS"] = False
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
os.makedirs(os.path.join(BASE_DIR, "instance"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "uploads"), exist_ok=True)

db.init_app(app)
CORS(app)


def ensure_schema():
    """Add columns introduced after the first database was created."""
    insp = sqla_inspect(db.engine)
    tables = set(insp.get_table_names())
    alterations = {
        "employees": [
            ("bio", "TEXT"),
            ("personal_email", "VARCHAR(180)"),
            ("blood_group", "VARCHAR(10)"),
            ("linkedin_url", "VARCHAR(255)"),
            ("work_location", "VARCHAR(80) DEFAULT 'Office'"),
        ],
        "announcements": [
            ("branch_id", "INTEGER"),
            ("role_slug", "VARCHAR(80)"),
            ("send_in_app", "BOOLEAN DEFAULT 1"),
            ("send_email", "BOOLEAN DEFAULT 0"),
            ("send_sms", "BOOLEAN DEFAULT 0"),
            ("email_subject", "VARCHAR(255)"),
            ("sms_message", "VARCHAR(320)"),
        ],
        "notifications": [
            ("category", "VARCHAR(40) DEFAULT 'general'"),
            ("event_key", "VARCHAR(60)"),
        ],
        "notification_deliveries": [
            ("event_id", "INTEGER"),
            ("body", "TEXT"),
        ],
        "companies": [
            ("city", "VARCHAR(80) DEFAULT 'Accra'"),
            ("location_name", "VARCHAR(120) DEFAULT 'Accra HQ'"),
            ("tagline", "VARCHAR(180) DEFAULT 'People operations'"),
            ("favicon_url", "TEXT"),
            ("theme", "VARCHAR(60) DEFAULT 'meridian'"),
        ],
        "departments": [
            ("description", "TEXT"),
            ("budget", "NUMERIC(15,2) DEFAULT 0"),
            ("target_headcount", "INTEGER DEFAULT 0"),
            ("status", "VARCHAR(20) DEFAULT 'active'"),
            ("email", "VARCHAR(180)"),
            ("phone", "VARCHAR(40)"),
        ],
    }
    with db.engine.begin() as conn:
        for table, spec in alterations.items():
            if table in tables:
                cols = {c["name"] for c in insp.get_columns(table)}
                for col_name, col_type in spec:
                    if col_name not in cols:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"))


def ensure_delivery_settings():
    for key, value in messaging.CONFIG_DEFAULTS.items():
        full = "delivery." + key
        if not Setting.query.filter_by(key=full).first():
            db.session.add(Setting(key=full, value=value, group_name="delivery"))
    if not Setting.query.filter_by(key="delivery.event_routing").first():
        db.session.add(Setting(key="delivery.event_routing",
                               value=json.dumps(messaging.DEFAULT_ROUTING), group_name="delivery"))
    db.session.commit()


def ensure_demo_enrichment():
    """Idempotently populate skills, education, career timeline and company events."""
    employees = Employee.query.filter(Employee.deleted_at.is_(None)).order_by(Employee.id.asc()).all()
    if not employees:
        return
    emp_by_id = {e.id: e for e in employees}
    bios = {
        1: "Chief Executive leading Meridian Ghana's strategic expansion across West Africa, governance and board alignment.",
        2: "People & Culture leader overseeing talent strategy, statutory compliance, compensation architecture and employee relations.",
        3: "HR Generalist managing onboarding, employee lifecycle records, policy compliance and helpdesk operations.",
        4: "Finance executive responsible for corporate treasury, statutory tax governance, audit readiness and payroll sign-off.",
        5: "Payroll & Benefits specialist managing monthly payroll runs, SSNIT/PAYE remittances, loans and staff reimbursements.",
        6: "Engineering Manager leading platform reliability, API architecture and developer mentorship across Accra HQ.",
        7: "Full-stack Software Engineer focused on time-tracking, employee self-service experiences and API performance.",
        8: "Backend Engineer working on core HR workflows, database optimisation and automated integrations.",
        9: "Software Engineering intern contributing to UI components, automated testing and developer tooling.",
        10: "Regional Sales Manager driving enterprise partnerships and commercial growth from the Kumasi Hub.",
    }
    blood_groups = ["O+", "A+", "B+", "O+", "A-", "AB+", "O+", "B+", "A+", "O+", "O-", "A+", "B+", "O+"]
    work_locs = ["Accra HQ (Office)", "Accra HQ (Hybrid)", "Accra HQ (Office)", "Accra HQ (Office)",
                 "Accra HQ (Hybrid)", "Accra HQ (Hybrid)", "Hybrid · Accra", "Hybrid · Accra",
                 "Accra HQ (Office)", "Kumasi Hub", "Kumasi Hub", "Accra HQ (Field)",
                 "Accra HQ (Hybrid)", "Accra HQ (Office)"]
    changed = False
    for idx, emp in enumerate(employees):
        if not emp.bio:
            emp.bio = bios.get(emp.id, f"{emp.designation.title if emp.designation else 'Team member'} in {emp.department.name if emp.department else 'Meridian Ghana'}, committed to operational excellence.")
            changed = True
        if not emp.blood_group:
            emp.blood_group = blood_groups[idx % len(blood_groups)]
            changed = True
        if not emp.personal_email:
            emp.personal_email = f"{emp.first_name.lower()}.{emp.last_name.lower()}@gmail.com"
            changed = True
        if not emp.work_location or emp.work_location == "Office":
            emp.work_location = work_locs[idx % len(work_locs)]
            changed = True
        if not emp.linkedin_url:
            emp.linkedin_url = f"https://linkedin.com/in/{emp.first_name.lower()}-{emp.last_name.lower()}"
            changed = True

    if EmployeeSkill.query.count() == 0:
        skill_seed = [
            (1, "Executive Leadership", "leadership", "expert", 12, True),
            (1, "Corporate Governance", "domain", "expert", 10, True),
            (2, "Strategic HRBP", "domain", "expert", 9, True),
            (2, "Ghana Labour Act (Act 651)", "domain", "expert", 8, True),
            (2, "Compensation & Benefits", "domain", "advanced", 7, True),
            (3, "Employee Relations", "domain", "advanced", 4, True),
            (3, "HRIS Administration", "tool", "advanced", 4, True),
            (4, "IFRS Financial Reporting", "domain", "expert", 11, True),
            (5, "PAYE & SSNIT Compliance", "domain", "expert", 5, True),
            (5, "Payroll Reconciliation", "technical", "advanced", 4, True),
            (6, "Python & Flask Architecture", "technical", "expert", 8, True),
            (6, "Engineering Management", "leadership", "advanced", 5, True),
            (6, "PostgreSQL & Cloud Infra", "technical", "advanced", 7, True),
            (7, "Python / REST APIs", "technical", "advanced", 4, True),
            (7, "TypeScript & Modern JS", "technical", "advanced", 4, True),
            (7, "SQL & Performance Tuning", "technical", "intermediate", 3, False),
            (8, "Backend Systems", "technical", "advanced", 3, True),
            (8, "Automated Testing", "technical", "intermediate", 3, False),
            (9, "JavaScript & CSS", "technical", "intermediate", 1, False),
            (10, "Enterprise B2B Sales", "domain", "expert", 7, True),
        ]
        for eid, name, cat, prof, yrs, ver in skill_seed:
            if eid in emp_by_id:
                db.session.add(EmployeeSkill(
                    employee_id=eid, name=name, category=cat, proficiency=prof,
                    years_experience=yrs, verified=ver,
                ))
        changed = True

    if EmployeeEducation.query.count() == 0:
        edu_seed = [
            (1, "degree", "University of Ghana Business School", "Executive MBA", "Strategic Management", 2012, 2014, None, None),
            (2, "degree", "Kwame Nkrumah University of Science & Technology", "BSc Human Resource Management", "Human Resources", 2005, 2009, None, None),
            (2, "certification", "CIPD / CIHRM Ghana", "Chartered HR Practitioner", "People Operations", 2018, 2018, "CIHRM-GH-4412", None),
            (4, "certification", "ACCA", "Fellow Chartered Certified Accountant (FCCA)", "Accounting & Finance", 2011, 2011, "ACCA-992014", None),
            (5, "degree", "University of Professional Studies, Accra (UPSA)", "BSc Accounting", "Accounting", 2013, 2017, None, None),
            (6, "degree", "Ashesi University", "BSc Computer Science", "Software Engineering", 2008, 2012, None, None),
            (6, "certification", "Amazon Web Services", "AWS Solutions Architect – Associate", "Cloud Architecture", 2024, 2024, "AWS-SAA-88310", date(2027, 6, 30)),
            (7, "degree", "University of Ghana, Legon", "BSc Computer Science", "Computer Science", 2015, 2019, None, None),
            (7, "certification", "Linux Foundation", "Kubernetes Application Developer", "Cloud Native", 2024, 2024, "CKAD-2409-118", date(2027, 9, 15)),
            (8, "degree", "KNUST", "BSc Computer Engineering", "Software Systems", 2017, 2021, None, None),
        ]
        for eid, kind, inst, qual, field, sy, ey, cred, exp in edu_seed:
            if eid in emp_by_id:
                db.session.add(EmployeeEducation(
                    employee_id=eid, kind=kind, institution=inst, qualification=qual,
                    field_of_study=field, start_year=sy, end_year=ey, credential_id=cred,
                    expires_at=exp,
                ))
        changed = True

    if EmploymentHistory.query.count() <= len(employees):
        extra_hist = [
            (6, "confirmation", "Probation", "Confirmed Permanent", date(2021, 4, 12), "Completed 90-day probation with distinction"),
            (6, "promotion", "Senior Software Engineer", "Engineering Manager", date(2023, 7, 1), "Promoted to lead core platform engineering team"),
            (7, "confirmation", "Probation", "Confirmed Permanent", date(2022, 11, 15), "Confirmed following strong onboarding delivery"),
            (7, "salary_revision", "GHS 5,400.00", "GHS 6,500.00", date(2025, 1, 1), "Annual merit review adjustment (+20.4%)"),
            (2, "salary_revision", "GHS 14,000.00", "GHS 16,000.00", date(2025, 1, 1), "Executive leadership compensation review"),
        ]
        for eid, ev_type, fv, tv, eff, notes in extra_hist:
            if eid in emp_by_id:
                db.session.add(EmploymentHistory(
                    employee_id=eid, event_type=ev_type, from_value=fv, to_value=tv,
                    effective_date=eff, notes=notes,
                ))
        changed = True

    if CompanyEvent.query.count() == 0:
        now_dt = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
        eng_dept = Department.query.filter_by(code="ENG").first()
        accra_br = Branch.query.filter_by(code="ACC").first()
        ev1 = CompanyEvent(
            title="Q4 All-Hands Town Hall & Strategy Update",
            description="Quarterly company-wide briefing with CEO Ama Mensah covering Q3 milestones, 2027 people roadmap, and live Q&A.",
            category="town_hall",
            location="Accra HQ Atrium & Google Meet",
            meeting_url="https://meet.meridian.gh/q4-town-hall",
            start_at=(now_dt + timedelta(days=6)).replace(hour=15),
            end_at=(now_dt + timedelta(days=6)).replace(hour=16, minute=30),
            audience="all",
            organizer_id=1,
            send_in_app=True, send_email=True, send_sms=True,
            reminder_hours=24,
            status="scheduled",
        )
        ev2 = CompanyEvent(
            title="Annual Wellness & Occupational Health Screening",
            description="Complimentary vitals check, ergonomic consultation and flu vaccination clinic for all Accra staff.",
            category="wellness",
            location="Accra HQ · Executive Boardroom B",
            start_at=(now_dt + timedelta(days=3)).replace(hour=9),
            end_at=(now_dt + timedelta(days=3)).replace(hour=16),
            audience="branch",
            branch_id=accra_br.id if accra_br else None,
            organizer_id=2,
            send_in_app=True, send_email=True, send_sms=False,
            reminder_hours=48,
            status="scheduled",
        )
        ev3 = CompanyEvent(
            title="Engineering Architecture & Security Review",
            description="Pre-freeze technical readiness review ahead of the November payroll cut-over.",
            category="training",
            location="Engineering War Room / Meet",
            meeting_url="https://meet.meridian.gh/eng-arch",
            start_at=(now_dt + timedelta(days=9)).replace(hour=10),
            end_at=(now_dt + timedelta(days=9)).replace(hour=12),
            audience="department",
            department_id=eng_dept.id if eng_dept else None,
            organizer_id=6,
            send_in_app=True, send_email=True, send_sms=False,
            reminder_hours=24,
            status="scheduled",
        )
        db.session.add_all([ev1, ev2, ev3])
        db.session.flush()
        for eid in [1, 2, 3, 6, 7, 8]:
            if eid in emp_by_id:
                db.session.add(EventRsvp(event_id=ev1.id, employee_id=eid, status="going"))
        for eid in [2, 3, 7]:
            if eid in emp_by_id:
                db.session.add(EventRsvp(event_id=ev2.id, employee_id=eid, status="going"))
        changed = True

    if NotificationDelivery.query.count() == 0:
        first_ann = Announcement.query.first()
        first_ev = CompanyEvent.query.first()
        sample_users = User.query.order_by(User.id.asc()).limit(4).all()
        for idx, su in enumerate(sample_users):
            db.session.add(NotificationDelivery(
                announcement_id=first_ann.id if first_ann else None,
                user_id=su.id, event_key="announcement", channel="email",
                recipient=su.email,
                subject="[Meridian HR] " + (first_ann.title if first_ann else "Q4 town hall"),
                body=first_ann.body if first_ann else "Company-wide announcement",
                status="simulated", provider_ref=f"sim-mail-seed0{idx + 1}",
                sent_at=datetime.utcnow() - timedelta(hours=3),
            ))
        if first_ev and sample_users:
            for idx, su in enumerate(sample_users[:2]):
                phone = su.employee.phone if su.employee else "+233 24 111 0001"
                db.session.add(NotificationDelivery(
                    event_id=first_ev.id,
                    user_id=su.id, event_key="event_published", channel="sms",
                    recipient=phone,
                    subject=first_ev.title,
                    body=f"Meridian HR: Event Invitation: {first_ev.title} at {first_ev.location}",
                    status="simulated", provider_ref=f"sim-sms-seed0{idx + 1}",
                    sent_at=datetime.utcnow() - timedelta(hours=2),
                ))
        changed = True

    for n in Notification.query.all():
        if not n.category or n.category == "general":
            low = (n.title or "").lower()
            if "leave" in low:
                n.category = "Leave"
                n.event_key = n.event_key or "leave_submitted"
                if n.link == "/approvals":
                    n.link = "/leave"
                changed = True
            elif "welcome" in low:
                n.category = "General"
                changed = True

    if changed:
        db.session.commit()


def bootstrap_database():
    with app.app_context():
        db.create_all()
        ensure_schema()
        if User.query.count() == 0:
            seed(app)
        ensure_delivery_settings()
        ensure_demo_enrichment()


READ_ONLY = {"auditor"}

READ_PERMS = {
    "users": {"super_admin"},
    "roles": {"super_admin"},
    "settings": {"super_admin"},
    "audit-logs": {"super_admin", "auditor"},
    "payroll-runs": {"super_admin", "hr_admin", "payroll", "auditor"},
    "salary-components": {"super_admin", "hr_admin", "payroll", "auditor"},
    "salary-structures": {"super_admin", "hr_admin", "payroll", "auditor"},
    "payslips": {"super_admin", "hr_admin", "payroll", "auditor", "manager", "employee"},
    "loans": {"super_admin", "hr_admin", "payroll", "auditor", "manager", "employee"},
    "claims": {"super_admin", "hr_admin", "payroll", "auditor", "manager", "employee"},
    "requisitions": {"super_admin", "hr_admin", "hr_officer", "recruiter"},
    "job-postings": {"super_admin", "hr_admin", "hr_officer", "recruiter"},
    "candidates": {"super_admin", "hr_admin", "hr_officer", "recruiter"},
    "applications": {"super_admin", "hr_admin", "hr_officer", "recruiter"},
    "interviews": {"super_admin", "hr_admin", "hr_officer", "recruiter", "manager"},
    "onboarding-templates": {"super_admin", "hr_admin", "hr_officer"},
    "onboarding-tasks": {"super_admin", "hr_admin", "hr_officer", "manager", "employee"},
    "offboardings": {"super_admin", "hr_admin", "hr_officer", "manager"},
    "corrections": {"super_admin", "hr_admin", "hr_officer", "manager", "employee"},
    "documents": {"super_admin", "hr_admin", "hr_officer", "manager", "employee"},
    "policies": {"super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"},
    "assets": {"super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"},
    "asset-assignments": {"super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"},
    "tickets": {"super_admin", "hr_admin", "hr_officer", "manager", "employee"},
    "approvals": {"super_admin", "hr_admin", "hr_officer", "payroll", "manager", "employee"},
    "bank-accounts": {"super_admin", "hr_admin", "payroll", "employee", "auditor"},
    "contracts": {"super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"},
    "employment-history": {"super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"},
    "contacts": {"super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"},
    "dependants": {"super_admin", "hr_admin", "hr_officer", "payroll", "manager", "employee"},
    "employee-skills": {"super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"},
    "employee-education": {"super_admin", "hr_admin", "hr_officer", "manager", "employee", "auditor"},
}

def can_read(user, resource):
    role = role_of(user)
    allowed = READ_PERMS.get(resource)
    return allowed is None or role in allowed

WRITE_PERMS = {
    "employees": {"super_admin", "hr_admin", "hr_officer"},
    "departments": {"super_admin", "hr_admin"},
    "designations": {"super_admin", "hr_admin"},
    "grades": {"super_admin", "hr_admin"},
    "branches": {"super_admin", "hr_admin"},
    "companies": {"super_admin", "hr_admin"},
    "users": {"super_admin"},
    "roles": {"super_admin"},
    "settings": {"super_admin", "hr_admin"},
    "documents": {"super_admin", "hr_admin", "hr_officer"},
    "policies": {"super_admin", "hr_admin", "hr_officer"},
    "requisitions": {"super_admin", "hr_admin", "hr_officer", "recruiter"},
    "job-postings": {"super_admin", "hr_admin", "hr_officer", "recruiter"},
    "candidates": {"super_admin", "hr_admin", "hr_officer", "recruiter"},
    "applications": {"super_admin", "hr_admin", "hr_officer", "recruiter"},
    "interviews": {"super_admin", "hr_admin", "hr_officer", "recruiter"},
    "onboarding-tasks": {"super_admin", "hr_admin", "hr_officer"},
    "offboardings": {"super_admin", "hr_admin", "hr_officer"},
    "shifts": {"super_admin", "hr_admin", "hr_officer"},
    "attendance": {"super_admin", "hr_admin", "hr_officer"},
    "corrections": {"super_admin", "hr_admin", "hr_officer"},
    "leave-types": {"super_admin", "hr_admin", "hr_officer"},
    "leave-balances": {"super_admin", "hr_admin", "hr_officer"},
    "holidays": {"super_admin", "hr_admin", "hr_officer"},
    "salary-components": {"super_admin", "hr_admin", "payroll"},
    "salary-structures": {"super_admin", "hr_admin", "payroll"},
    "payroll-runs": {"super_admin", "hr_admin", "payroll"},
    "loans": {"super_admin", "hr_admin", "payroll"},
    "goals": {"super_admin", "hr_admin", "hr_officer", "manager"},
    "appraisal-cycles": {"super_admin", "hr_admin", "hr_officer"},
    "appraisals": {"super_admin", "hr_admin", "hr_officer", "manager"},
    "trainings": {"super_admin", "hr_admin", "hr_officer"},
    "enrolments": {"super_admin", "hr_admin", "hr_officer", "manager"},
    "expense-categories": {"super_admin", "hr_admin", "payroll"},
    "claims": {"super_admin", "hr_admin", "payroll"},
    "assets": {"super_admin", "hr_admin", "hr_officer"},
    "asset-assignments": {"super_admin", "hr_admin", "hr_officer"},
    "tickets": {"super_admin", "hr_admin", "hr_officer"},
    "announcements": {"super_admin", "hr_admin", "hr_officer"},
    "events": {"super_admin", "hr_admin", "hr_officer"},
    "approvals": {"super_admin", "hr_admin", "hr_officer", "payroll", "manager"},
    "contacts": {"super_admin", "hr_admin", "hr_officer"},
    "dependants": {"super_admin", "hr_admin", "hr_officer"},
    "bank-accounts": {"super_admin", "hr_admin", "payroll"},
    "contracts": {"super_admin", "hr_admin", "hr_officer"},
    "employment-history": {"super_admin", "hr_admin", "hr_officer"},
    "employee-skills": {"super_admin", "hr_admin", "hr_officer"},
    "employee-education": {"super_admin", "hr_admin", "hr_officer"},
}
SELF_WRITE = {
    "leave-requests", "tickets", "claims", "loans", "goals",
    "contacts", "dependants", "bank-accounts", "employee-skills", "employee-education",
}


# ---------------------------------------------------------------- helpers

def conv(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, datetime):
        return v.isoformat(timespec="seconds")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, bool):
        return v
    return v


def parse_value(model, key, value):
    col = model.__table__.columns[key] if key in model.__table__.columns else None
    if col is None:
        return value
    if value is None or value == "":
        return None
    try:
        py = col.type.python_type
    except Exception:
        return value
    if py is bool:
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("1", "true", "yes", "on")
    if py is int:
        return int(value)
    if py is float:
        return float(value)
    if py is Decimal:
        return Decimal(str(value))
    if py is date:
        return date.fromisoformat(str(value)[:10])
    if py is datetime:
        txt = str(value).replace("Z", "")
        return datetime.fromisoformat(txt[:19])
    return str(value)


def label(obj, path):
    cur = obj
    for part in path.split("."):
        if cur is None:
            return None
        cur = getattr(cur, part, None)
    if callable(cur):
        cur = cur()
    return conv(cur)


def serialize(obj, resource=None):
    if obj is None:
        return None
    cfg = RESOURCES.get(resource or "", {})
    out = {}
    for col in obj.__table__.columns:
        out[col.name] = conv(getattr(obj, col.name))
    for field, path in cfg.get("labels", {}).items():
        out[field] = label(obj, path)
    for field in cfg.get("props", []):
        val = getattr(obj, field, None)
        out[field] = conv(val() if callable(val) else val)
    for field in cfg.get("hide", []):
        out.pop(field, None)
    return out


def error(msg, code=400, errors=None):
    payload = {"message": msg}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), code


def auth_user():
    header = request.headers.get("Authorization", "")
    token = header.split(" ", 1)[1].strip() if header.lower().startswith("bearer ") else None
    token = token or request.args.get("token")
    if not token:
        return None
    user = User.query.filter_by(token=token, status="active").first()
    if not user or user.deleted_at is not None:
        return None
    if user.token_expires_at and user.token_expires_at < datetime.utcnow():
        return None
    return user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = auth_user()
        if not user:
            return error("Unauthenticated", 401)
        request.user = user
        return fn(*args, **kwargs)
    return wrapper


def role_of(user):
    return user.role.slug if user.role else "employee"


def can_write(user, resource):
    role = role_of(user)
    if role == "super_admin":
        return True
    if role in READ_ONLY:
        return False
    return role in WRITE_PERMS.get(resource, set())


def can_self_write(user, resource):
    return resource in SELF_WRITE


def write_guard(resource):
    def deco(fn):
        @wraps(fn)
        @login_required
        def wrapper(*args, **kwargs):
            if not can_write(request.user, resource) and not can_self_write(request.user, resource):
                return error("You do not have permission to perform this action", 403)
            if role_of(request.user) in READ_ONLY:
                return error("Auditor accounts are read-only", 403)
            return fn(*args, **kwargs)
        return wrapper
    return deco


def scoped(query, model, resource, user):
    role = role_of(user)
    if model is Notification:
        return query.filter(Notification.user_id == user.id)
    if model is Approval and role not in ("super_admin", "hr_admin", "hr_officer", "payroll", "auditor"):
        if not user.employee_id:
            return query.filter(false())
        return query.filter(or_(Approval.requester_id == user.employee_id,
                                Approval.approver_id == user.employee_id))
    if role in ("super_admin", "hr_admin", "hr_officer", "payroll", "recruiter", "auditor"):
        return query
    if not hasattr(model, "employee_id") and model is not Employee:
        return query
    if role == "manager":
        if model is Payslip:
            return query.filter(Payslip.employee_id == user.employee_id)
        if model is Employee:
            team = [user.employee_id]
            if user.employee_id:
                team += [e.id for e in Employee.query.filter_by(manager_id=user.employee_id).all()]
            return query.filter(Employee.id.in_([t for t in team if t]))
        return query.filter(model.employee_id.in_(
            [user.employee_id] + [e.id for e in Employee.query.filter_by(manager_id=user.employee_id).all()]
        ))
    if role == "employee":
        if model is Employee:
            return query.filter(Employee.id == user.employee_id)
        if model is Payslip:
            return query.filter(Payslip.employee_id == user.employee_id)
        return query.filter(model.employee_id == user.employee_id)
    return query


def audit(user, event, entity, entity_id, old=None, new=None):
    db.session.add(AuditLog(
        user_id=user.id if user else None, event=event, entity=entity, entity_id=entity_id,
        old_values=str(old)[:2000] if old is not None else None,
        new_values=str(new)[:2000] if new is not None else None,
        ip=request.remote_addr,
    ))


def notify(user_id, title, body, link="/app", category="general", event_key=None):
    if user_id:
        db.session.add(Notification(user_id=user_id, title=title, body=body, link=link,
                                    category=category, event_key=event_key))


def public_app_link(link):
    host = request.headers.get("X-Forwarded-Host") or request.host
    scheme = request.headers.get("X-Forwarded-Proto") or request.scheme
    if link.startswith("/app"):
        path = link[4:] or "/"
    elif link.startswith("/"):
        path = link
    else:
        path = "/" + link
    return f"{scheme}://{host}/#{path}"


def _record_delivery(result, user, event_key, channel, recipient, subject,
                     body=None, notification_id=None, announcement_id=None, event_id=None):
    db.session.add(NotificationDelivery(
        notification_id=notification_id, announcement_id=announcement_id, event_id=event_id,
        user_id=user.id if user else None, event_key=event_key, channel=channel,
        recipient=recipient, subject=(subject or "")[:255], body=body,
        status=result.get("status", "failed"),
        error=result.get("error"), provider_ref=result.get("ref"),
        sent_at=datetime.utcnow() if result.get("ok") else None,
    ))


def dispatch_event(event_key, users, title, body, link="/app", email_subject=None,
                   sms_body=None, channels=None, announcement_id=None, event_id=None,
                   meta_rows=None, badge=None):
    """Create in-app notifications and fan out email/SMS according to routing."""
    routing = dict(messaging.event_routing().get(event_key) or messaging.DEFAULT_USER_PREF)
    explicit_channels = bool(channels)
    if channels:
        for key in ("in_app", "email", "sms"):
            if key in channels:
                routing[key] = bool(channels[key])
    cfg = messaging.config()
    event = messaging.EVENT_MAP.get(event_key, {})
    category = event.get("category", "General")
    counts = {
        "in_app": 0, "email": 0, "sms": 0, "failed": 0, "skipped": 0,
        "recipients": 0,
        "email_disabled": bool(routing.get("email") and cfg.get("email_enabled") != "1"),
        "sms_disabled": bool(routing.get("sms") and cfg.get("sms_enabled") != "1"),
    }
    seen = set()
    email_subject = email_subject or title
    sms_text = (sms_body or (title + " — " + (body or "")))[:320]
    for user in users or []:
        if not user or not user.id or user.id in seen:
            continue
        seen.add(user.id)
        if getattr(user, "status", "active") != "active":
            continue
        counts["recipients"] += 1
        pref = messaging.preference_for(user.id, event_key)
        notification = None
        if routing.get("in_app") and pref.get("in_app"):
            notification = Notification(
                user_id=user.id, title=title[:180], body=(body or "")[:255],
                link=link, category=category, event_key=event_key,
            )
            db.session.add(notification)
            db.session.flush()
            counts["in_app"] += 1
        if routing.get("email") and pref.get("email"):
            if cfg.get("email_enabled") == "1" or explicit_channels:
                target = user.email
                html_doc = messaging.html_email(
                    title, body, public_app_link(link),
                    meta_rows=meta_rows, badge=badge or category,
                )
                result = messaging.send_email(target, email_subject, body, html_doc)
                _record_delivery(
                    result, user, event_key, "email", target, email_subject,
                    body=body, notification_id=notification.id if notification else None,
                    announcement_id=announcement_id, event_id=event_id,
                )
                if result.get("ok"):
                    counts["email"] += 1
                elif result.get("status") == "skipped":
                    counts["skipped"] += 1
                else:
                    counts["failed"] += 1
        if routing.get("sms") and pref.get("sms"):
            if cfg.get("sms_enabled") == "1" or explicit_channels:
                target = user.employee.phone if user.employee else None
                result = messaging.send_sms(target, sms_text)
                _record_delivery(
                    result, user, event_key, "sms", target, title,
                    body=sms_text, notification_id=notification.id if notification else None,
                    announcement_id=announcement_id, event_id=event_id,
                )
                if result.get("ok"):
                    counts["sms"] += 1
                elif result.get("status") == "skipped":
                    counts["skipped"] += 1
                else:
                    counts["failed"] += 1
    return counts


def audience_users(audience="all", department_id=None, branch_id=None, role_slug=None):
    q = User.query.filter(User.status == "active", User.deleted_at.is_(None),
                          User.employee_id.isnot(None))
    q = q.join(Employee, User.employee_id == Employee.id).filter(
        Employee.deleted_at.is_(None), Employee.status.in_(["active", "probation"])
    )
    if audience == "department" and department_id:
        q = q.filter(Employee.department_id == int(department_id))
    elif audience == "branch" and branch_id:
        q = q.filter(Employee.branch_id == int(branch_id))
    elif audience == "role" and role_slug:
        q = q.join(Role, User.role_id == Role.id).filter(Role.slug == role_slug)
    return q.all()


def deliver_announcement(announcement, data=None):
    data = data or {}
    channels = {
        "in_app": bool(data.get("send_in_app", announcement.send_in_app if announcement.send_in_app is not None else True)),
        "email": bool(data.get("send_email", announcement.send_email)),
        "sms": bool(data.get("send_sms", announcement.send_sms)),
    }
    recipients = audience_users(
        announcement.audience, announcement.department_id,
        announcement.branch_id, announcement.role_slug,
    )
    email_subject = (data.get("email_subject") or announcement.email_subject or announcement.title)
    sms_text = (data.get("sms_message") or announcement.sms_message or f"{announcement.title}: {(announcement.body or '')[:220]}")
    return dispatch_event(
        "announcement", recipients, announcement.title, announcement.body or "",
        "/announcements", email_subject=email_subject, sms_body=sms_text,
        channels=channels, announcement_id=announcement.id, badge="Announcement",
    )


def deliver_company_event(ev, data=None, is_reminder=False):
    data = data or {}
    channels = {
        "in_app": bool(data.get("send_in_app", ev.send_in_app if ev.send_in_app is not None else True)),
        "email": bool(data.get("send_email", ev.send_email)),
        "sms": bool(data.get("send_sms", ev.send_sms)),
    }
    recipients = audience_users(ev.audience, ev.department_id, ev.branch_id, ev.role_slug)
    when_str = ev.start_at.strftime("%a, %d %b %Y · %H:%M") if ev.start_at else "Upcoming"
    if ev.end_at:
        when_str += f" – {ev.end_at.strftime('%H:%M')}"
    meta_rows = [
        ("When", when_str),
        ("Location", ev.location or "TBA"),
        ("Category", (ev.category or "general").replace("_", " ").title()),
        ("Meeting link", ev.meeting_url or ""),
    ]
    prefix = "Reminder: " if is_reminder else "Event Invitation: "
    title = f"{prefix}{ev.title}"
    body = (ev.description or "You are invited to an upcoming company event.") + f"\nWhen: {when_str}" + (f" · Location: {ev.location}" if ev.location else "")
    email_subject = data.get("email_subject") or ev.email_subject or title
    sms_default = f"{prefix}{ev.title} on {ev.start_at.strftime('%d %b %H:%M') if ev.start_at else 'soon'}" + (f" at {ev.location}" if ev.location else "")
    sms_text = data.get("sms_message") or ev.sms_message or sms_default
    return dispatch_event(
        "event_reminder" if is_reminder else "event_published",
        recipients, title, body, "/announcements/events",
        email_subject=email_subject, sms_body=sms_text,
        channels=channels, event_id=ev.id, meta_rows=meta_rows,
        badge="Event Reminder" if is_reminder else "Company Event",
    )


def user_for_employee(employee_id):
    return User.query.filter_by(employee_id=employee_id).first()


def employee_of(user):
    return db.session.get(Employee, user.employee_id) if user.employee_id else None


# ---------------------------------------------------------------- resources

RESOURCES = {
    "employees": dict(model=Employee, order="id", search=["first_name", "last_name", "employee_no", "email", "phone", "work_location", "contract_type"],
                      labels={"employee_name": "full_name", "department_name": "department.name", "designation_title": "designation.title",
                              "branch_name": "branch.name", "manager_name": "manager.full_name",
                              "grade_name": "grade.name"}),
    "departments": dict(model=Department, order="name", search=["name", "code"],
                        labels={"head_name": "head_id", "branch_name": "branch.name"}),
    "designations": dict(model=Designation, order="title", search=["title"]),
    "grades": dict(model=Grade, order="level", search=["name"]),
    "branches": dict(model=Branch, order="name", search=["name", "city"]),
    "companies": dict(model=Company, order="name", search=["name"]),
    "users": dict(model=User, order="id", search=["email"], hide=["password_hash", "token"],
                  labels={"role_name": "role.name", "employee_name": "employee.full_name"}),
    "roles": dict(model=Role, order="id", search=["name"]),
    "documents": dict(model=Document, order="id", search=["title", "category"],
                      labels={"employee_name": "employee.full_name"}),
    "policies": dict(model=Policy, order="id", search=["title", "category"]),
    "requisitions": dict(model=JobRequisition, order="id", search=["title"],
                         labels={"department_name": "department.name"}),
    "job-postings": dict(model=JobPosting, order="id", search=["title", "location"],
                         labels={"department_name": "department.name"}),
    "candidates": dict(model=Candidate, order="id", search=["first_name", "last_name", "email"], props=["full_name"]),
    "applications": dict(model=Application, order="id", search=["stage"],
                         labels={"candidate_name": "candidate.full_name", "job_title": "job_posting.title",
                                 "candidate_email": "candidate.email"}),
    "interviews": dict(model=Interview, order="id", search=["location"],
                       labels={"candidate_name": "application.candidate.full_name",
                               "job_title": "application.job_posting.title"}),
    "onboarding-tasks": dict(model=OnboardingTask, order="id", search=["title"],
                             labels={"employee_name": "employee.full_name",
                                     "department_name": "employee.department.name"}),
    "onboarding-templates": dict(model=OnboardingTemplate, order="id", search=["name"]),
    "offboardings": dict(model=Offboarding, order="id", search=["reason"],
                         labels={"employee_name": "employee.full_name",
                                 "department_name": "employee.department.name"}),
    "shifts": dict(model=Shift, order="id", search=["name"]),
    "attendance": dict(model=Attendance, order="work_date", search=["status"],
                       labels={"employee_name": "employee.full_name", "employee_no": "employee.employee_no",
                               "department_name": "employee.department.name"}),
    "corrections": dict(model=AttendanceCorrection, order="id", search=["status", "reason"],
                        labels={"employee_name": "employee.full_name",
                                "department_name": "employee.department.name"}),
    "leave-types": dict(model=LeaveType, order="id", search=["name"]),
    "leave-balances": dict(model=LeaveBalance, order="id", search=[],
                           labels={"employee_name": "employee.full_name", "leave_type_name": "leave_type.name",
                                   "department_name": "employee.department.name"}),
    "leave-requests": dict(model=LeaveRequest, order="start_date", search=["status", "reason"],
                           labels={"employee_name": "employee.full_name", "leave_type_name": "leave_type.name",
                                   "employee_no": "employee.employee_no",
                                   "department_name": "employee.department.name"}),
    "holidays": dict(model=Holiday, order="holiday_date", search=["name"]),
    "salary-components": dict(model=SalaryComponent, order="id", search=["name"]),
    "salary-structures": dict(model=SalaryStructure, order="id", search=[],
                              labels={"employee_name": "employee.full_name", "component_name": "component.name"}),
    "payroll-runs": dict(model=PayrollRun, order="id", search=["status"]),
    "payslips": dict(model=Payslip, order="id", search=[],
                     labels={"employee_name": "employee.full_name", "employee_no": "employee.employee_no",
                             "department_name": "employee.department.name",
                             "period_year": "run.period_year", "period_month": "run.period_month",
                             "run_status": "run.status"}),
    "loans": dict(model=Loan, order="id", search=["status", "reason"],
                  labels={"employee_name": "employee.full_name",
                          "department_name": "employee.department.name"}),
    "goals": dict(model=Goal, order="id", search=["title", "status"],
                  labels={"employee_name": "employee.full_name",
                          "department_name": "employee.department.name"}),
    "appraisal-cycles": dict(model=AppraisalCycle, order="id", search=["name"]),
    "appraisals": dict(model=Appraisal, order="id", search=["status"],
                       labels={"employee_name": "employee.full_name", "cycle_name": "cycle.name",
                               "reviewer_name": "reviewer_id",
                               "department_name": "employee.department.name"}),
    "trainings": dict(model=Training, order="id", search=["title", "provider"]),
    "enrolments": dict(model=TrainingEnrolment, order="id", search=["status"],
                       labels={"employee_name": "employee.full_name", "training_title": "training.title",
                               "department_name": "employee.department.name"}),
    "expense-categories": dict(model=ExpenseCategory, order="id", search=["name"]),
    "claims": dict(model=ExpenseClaim, order="id", search=["title", "status"],
                   labels={"employee_name": "employee.full_name", "category_name": "category.name",
                           "department_name": "employee.department.name"}),
    "assets": dict(model=Asset, order="id", search=["tag", "name", "serial_no"]),
    "asset-assignments": dict(model=AssetAssignment, order="id", search=["condition_out"],
                              labels={"asset_name": "asset.name", "asset_tag": "asset.tag",
                                      "employee_name": "employee.full_name"}),
    "tickets": dict(model=Ticket, order="id", search=["subject", "category", "status"],
                    labels={"employee_name": "employee.full_name",
                            "assignee_name": "assignee_id"}),
    "announcements": dict(model=Announcement, order="id", search=["title", "body"]),
    "approvals": dict(model=Approval, order="id", search=["status", "request_type"],
                      labels={"requester_name": "requester.full_name",
                              "approver_name": "approver.full_name"}),
    "audit-logs": dict(model=AuditLog, order="id", search=["event", "entity"], props=["user_name"]),
    "settings": dict(model=Setting, order="id", search=["key", "group_name"]),
    "notifications": dict(model=Notification, order="id", search=["title", "body", "category"]),
    "contacts": dict(model=EmployeeContact, order="id", search=["name"]),
    "dependants": dict(model=Dependant, order="id", search=["name"]),
    "bank-accounts": dict(model=BankAccount, order="id", search=["bank_name"]),
    "employment-history": dict(model=EmploymentHistory, order="id", search=["event_type"]),
    "employee-skills": dict(model=EmployeeSkill, order="id", search=["name", "category"]),
    "employee-education": dict(model=EmployeeEducation, order="id", search=["qualification", "institution"]),
    "contracts": dict(model=Contract, order="id", search=["type", "status"]),
}


def get_resource(name):
    cfg = RESOURCES.get(name)
    if not cfg:
        return None, None
    return cfg, cfg["model"]


def apply_filters(query, model, cfg):
    search = request.args.get("search", "").strip()
    if search and cfg.get("search"):
        clauses = [getattr(model, f).ilike(f"%{search}%") for f in cfg["search"]
                   if hasattr(model, f)]
        if clauses:
            query = query.filter(or_(*clauses))
    if model is Notification:
        unread = request.args.get("unread")
        if unread == "1":
            query = query.filter(Notification.read_at.is_(None))
        elif unread == "0":
            query = query.filter(Notification.read_at.isnot(None))
        cat = (request.args.get("category") or "").strip()
        if cat:
            query = query.filter(func.lower(Notification.category) == cat.lower())
    for key in request.args:
        if key in ("page", "per_page", "search", "sort", "order", "token", "from", "to", "date_from", "date_to", "unread"):
            continue
        if model is Notification and key == "category":
            continue
        if hasattr(model, key):
            val = request.args.get(key)
            if val is not None and val != "":
                try:
                    query = query.filter(getattr(model, key) == parse_value(model, key, val))
                except Exception:
                    pass
    date_from = request.args.get("date_from") or request.args.get("from")
    date_to = request.args.get("date_to") or request.args.get("to")
    if date_from or date_to:
        date_col_name = next((c for c in ("work_date", "start_date", "claim_date", "hire_date", "purchase_date", "due_date", "holiday_date", "created_at") if hasattr(model, c)), None)
        if date_col_name:
            dcol = getattr(model, date_col_name)
            try:
                if date_from:
                    if date_col_name == "created_at":
                        query = query.filter(dcol >= datetime.fromisoformat(date_from))
                    else:
                        query = query.filter(dcol >= date.fromisoformat(date_from[:10]))
                if date_to:
                    if date_col_name == "created_at":
                        dt_end = datetime.fromisoformat(date_to[:10] + "T23:59:59") if len(date_to) <= 10 else datetime.fromisoformat(date_to)
                        query = query.filter(dcol <= dt_end)
                    else:
                        query = query.filter(dcol <= date.fromisoformat(date_to[:10]))
            except Exception:
                pass
    sort = request.args.get("sort")
    if sort and hasattr(model, sort):
        col = getattr(model, sort)
        query = query.order_by(col.desc() if request.args.get("order") == "desc" else col.asc())
    else:
        order = cfg.get("order", "id")
        col = getattr(model, order, None)
        if col is not None:
            query = query.order_by(col.desc() if order in ("id", "work_date", "holiday_date", "start_date") else col.asc())
    return query


# ---------------------------------------------------------------- auth routes

@app.post("/api/v1/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user:
        db.session.add(LoginHistory(ip=request.remote_addr, user_agent=request.user_agent.string[:255],
                                    success=False))
        db.session.commit()
        return error("Invalid email or password", 401)
    if user.locked_until and user.locked_until > datetime.utcnow():
        return error("Account temporarily locked. Try again later.", 423)
    if not check_password_hash(user.password_hash, password):
        user.failed_attempts = (user.failed_attempts or 0) + 1
        if user.failed_attempts >= 5:
            user.locked_until = datetime.utcnow() + timedelta(minutes=15)
            user.failed_attempts = 0
        db.session.add(LoginHistory(user_id=user.id, ip=request.remote_addr,
                                    user_agent=request.user_agent.string[:255], success=False))
        db.session.commit()
        return error("Invalid email or password", 401)
    if user.status != "active":
        return error("This account is inactive", 403)
    user.token = secrets.token_hex(32)
    user.token_expires_at = datetime.utcnow() + timedelta(days=7)
    user.last_login_at = datetime.utcnow()
    user.last_login_ip = request.remote_addr
    user.failed_attempts = 0
    user.locked_until = None
    db.session.add(LoginHistory(user_id=user.id, ip=request.remote_addr,
                                user_agent=request.user_agent.string[:255], success=True))
    db.session.commit()
    return jsonify({"data": {"token": user.token, "user": public_user(user)}})


@app.post("/api/v1/auth/logout")
@login_required
def logout():
    request.user.token = None
    request.user.token_expires_at = None
    db.session.commit()
    return jsonify({"message": "Signed out"})


@app.get("/api/v1/auth/me")
@login_required
def me():
    return jsonify({"data": public_user(request.user)})


@app.post("/api/v1/auth/change-password")
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    if not check_password_hash(request.user.password_hash, data.get("current_password", "")):
        return error("Current password is incorrect", 422)
    new = data.get("new_password", "")
    if len(new) < 8:
        return error("Password must be at least 8 characters", 422)
    request.user.password_hash = generate_password_hash(new)
    request.user.must_change_password = False
    audit(request.user, "password_changed", "users", request.user.id)
    db.session.commit()
    return jsonify({"message": "Password updated"})


def public_user(user):
    emp = user.employee
    return {
        "id": user.id, "email": user.email, "status": user.status,
        "mfa_enabled": bool(user.mfa_enabled),
        "role": user.role.name if user.role else None,
        "role_slug": user.role.slug if user.role else None,
        "permissions": user.role.permissions if user.role else "",
        "employee_id": emp.id if emp else None,
        "employee_no": emp.employee_no if emp else None,
        "name": emp.full_name if emp else user.email.split("@")[0].title(),
        "phone": emp.phone if emp else None,
        "job_title": emp.designation.title if emp and emp.designation else "",
        "department": emp.department.name if emp and emp.department else "",
        "photo_url": emp.photo_url if emp else None,
        "last_login_at": conv(user.last_login_at),
    }


@app.get("/api/v1/auth/login-history")
@login_required
def login_history():
    rows = (LoginHistory.query.filter_by(user_id=request.user.id)
            .order_by(LoginHistory.id.desc()).limit(20).all())
    return jsonify({"data": [
        {"id": r.id, "ip": r.ip, "user_agent": r.user_agent,
         "success": bool(r.success), "created_at": conv(r.created_at)}
        for r in rows
    ]})


@app.put("/api/v1/auth/mfa")
@login_required
def toggle_mfa():
    data = request.get_json(silent=True) or {}
    raw = data.get("enabled") if "enabled" in data else data.get("mfa_enabled")
    enabled = bool(raw)
    request.user.mfa_enabled = enabled
    audit(request.user, "mfa_" + ("enabled" if enabled else "disabled"), "users", request.user.id)
    db.session.commit()
    return jsonify({"data": {"mfa_enabled": enabled}})


def enrich_announcement(item_dict):
    aid = item_dict.get("id")
    author_id = item_dict.get("author_id")
    if author_id:
        u = db.session.get(User, author_id)
        item_dict["author_name"] = (u.employee.full_name if u and u.employee else (u.email if u else "HR Team"))
    else:
        item_dict["author_name"] = "HR Team"
    if item_dict.get("department_id"):
        d = db.session.get(Department, item_dict["department_id"])
        item_dict["department_name"] = d.name if d else None
    if item_dict.get("branch_id"):
        b = db.session.get(Branch, item_dict["branch_id"])
        item_dict["branch_name"] = b.name if b else None
    if aid:
        dels = NotificationDelivery.query.filter_by(announcement_id=aid).all()
        item_dict["deliveries"] = {
            "email_sent": sum(1 for x in dels if x.channel == "email" and x.status in ("sent", "simulated")),
            "sms_sent": sum(1 for x in dels if x.channel == "sms" and x.status in ("sent", "simulated")),
            "failed": sum(1 for x in dels if x.status in ("failed", "disabled")),
            "total": len(dels),
        }
    return item_dict


# ---------------------------------------------------------------- generic CRUD

@app.get("/api/v1/<resource>")
@login_required
def list_resource(resource):
    cfg, model = get_resource(resource)
    if not model:
        return error("Unknown resource", 404)
    if not can_read(request.user, resource):
        return error("You do not have permission to view this resource", 403)
    query = model.query
    if hasattr(model, "deleted_at"):
        query = query.filter(model.deleted_at.is_(None))
    query = scoped(query, model, resource, request.user)
    query = apply_filters(query, model, cfg)
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 25)), 1), 500)
    total = query.count()
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    data = []
    for r in rows:
        item = serialize(r, resource)
        for h in cfg.get("hide", []):
            item.pop(h, None)
        if resource == "announcements":
            enrich_announcement(item)
        data.append(item)
    return jsonify({
        "data": data,
        "meta": {"page": page, "per_page": per_page, "total": total,
                 "pages": (total + per_page - 1) // per_page},
        "links": {"self": request.path},
    })


@app.get("/api/v1/<resource>/<int:rid>")
@login_required
def get_one(resource, rid):
    cfg, model = get_resource(resource)
    if not model:
        return error("Unknown resource", 404)
    if not can_read(request.user, resource):
        return error("You do not have permission to view this resource", 403)
    query = model.query
    if hasattr(model, "deleted_at"):
        query = query.filter(model.deleted_at.is_(None))
    query = scoped(query, model, resource, request.user)
    obj = query.filter(model.id == rid).first()
    if not obj:
        return error("Not found", 404)
    data = serialize(obj, resource)
    for h in cfg.get("hide", []):
        data.pop(h, None)
    return jsonify({"data": data})


def writable_fields(model, data):
    banned = {"id", "created_at", "updated_at", "deleted_at", "created_by", "updated_by", "password_hash", "token"}
    out = {}
    for k, v in data.items():
        if k in banned:
            continue
        if k in model.__table__.columns:
            try:
                out[k] = parse_value(model, k, v)
            except (ValueError, InvalidOperation, TypeError):
                raise ValueError(f"Invalid value for {k}")
    return out


@app.post("/api/v1/<resource>")
@login_required
def create_resource(resource):
    cfg, model = get_resource(resource)
    if not model:
        return error("Unknown resource", 404)
    return _create(resource, model)


def _create(resource, model):
    if role_of(request.user) in READ_ONLY:
        return error("Auditor accounts are read-only", 403)
    if not can_write(request.user, resource) and not can_self_write(request.user, resource):
        return error("You do not have permission to perform this action", 403)
    data = request.get_json(silent=True) or {}
    try:
        fields = writable_fields(model, data)
    except ValueError as e:
        return error(str(e), 422)
    if model is User:
        pwd = data.get("password") or "ChangeMe@123"
        fields["password_hash"] = generate_password_hash(pwd)
    if model is Employee and not fields.get("employee_no"):
        fields["employee_no"] = next_employee_no()
    if model is Employee:
        fields.setdefault("company_id", 1)
        fields.setdefault("status", "active")
    if hasattr(model, "created_by"):
        fields["created_by"] = request.user.id
    obj = model(**fields)
    self_only = not can_write(request.user, resource) and can_self_write(request.user, resource)
    if self_only and hasattr(obj, "employee_id"):
        obj.employee_id = request.user.employee_id
    elif model in (LeaveRequest, ExpenseClaim, Ticket, Loan, Goal) and role_of(request.user) == "employee":
        obj.employee_id = request.user.employee_id
    if model is LeaveRequest:
        emp = db.session.get(Employee, obj.employee_id or 0)
        if emp:
            obj.approver_id = emp.manager_id
    db.session.add(obj)
    db.session.flush()
    if model is LeaveRequest:
        if not obj.days or not data.get("days"):
            obj.days = working_days(obj.start_date, obj.end_date)
        bal = LeaveBalance.query.filter_by(employee_id=obj.employee_id,
                                           leave_type_id=obj.leave_type_id,
                                           year=obj.start_date.year).first()
        if not bal:
            bal = LeaveBalance(employee_id=obj.employee_id, leave_type_id=obj.leave_type_id,
                               year=obj.start_date.year,
                               entitled=obj.leave_type.days_per_year if obj.leave_type else 0,
                               taken=0, pending=0)
            db.session.add(bal)
        bal.pending = Decimal(bal.pending or 0) + Decimal(obj.days or 0)
        db.session.add(Approval(request_type="leave", request_id=obj.id,
                                requester_id=obj.employee_id, approver_id=obj.approver_id,
                                status="pending"))
        if obj.approver_id:
            approver_user = user_for_employee(obj.approver_id)
            if approver_user:
                dispatch_event("leave_submitted", [approver_user], "Leave request awaiting you",
                               f"{emp.full_name if emp else 'An employee'} requested {obj.days} day(s).",
                               "/app/leave")
    delivery = None
    if model is ExpenseClaim:
        claimant = db.session.get(Employee, obj.employee_id) if obj.employee_id else None
        approver_id = claimant.manager_id if claimant else None
        db.session.add(Approval(request_type="expense", request_id=obj.id,
                                requester_id=obj.employee_id, approver_id=approver_id,
                                status="pending"))
        manager_user = user_for_employee(approver_id) if approver_id else None
        if manager_user:
            dispatch_event("expense_submitted", [manager_user], "Expense claim awaiting you",
                           f"{claimant.full_name} submitted {obj.title} for {obj.amount}.",
                           "/app/expenses")
    if model is Announcement:
        delivery = deliver_announcement(obj, data)
    if model is TrainingEnrolment:
        trainee = user_for_employee(obj.employee_id) if obj.employee_id else None
        if trainee:
            dispatch_event("training_enrolled", [trainee], "You have been enrolled in training",
                           f"{obj.training.title if obj.training else 'A training programme'} has been added to your learning plan.",
                           "/app/training")
    audit(request.user, "create", resource, obj.id, new=fields)
    db.session.commit()
    payload = serialize(obj, resource)
    if resource == "announcements":
        enrich_announcement(payload)
    if delivery:
        payload["delivery"] = delivery
    return jsonify({"data": payload}), 201


def next_employee_no():
    year = date.today().year
    count = Employee.query.count() + 1
    return f"EMP-{year}-{count:04d}"


def working_days(start, end):
    if not start or not end:
        return 1
    days = 0
    d = start
    holidays = {h.holiday_date for h in Holiday.query.all()}
    while d <= end:
        if d.weekday() < 5 and d not in holidays:
            days += 1
        d += timedelta(days=1)
    return max(days, 1)


@app.put("/api/v1/<resource>/<int:rid>")
@login_required
def update_resource(resource, rid):
    cfg, model = get_resource(resource)
    if not model:
        return error("Unknown resource", 404)
    if role_of(request.user) in READ_ONLY:
        return error("Auditor accounts are read-only", 403)
    if not can_write(request.user, resource) and not can_self_write(request.user, resource):
        return error("You do not have permission to perform this action", 403)
    obj = db.session.get(model, rid)
    if not obj:
        return error("Not found", 404)
    if can_self_write(request.user, resource) and not can_write(request.user, resource):
        if getattr(obj, "employee_id", None) != request.user.employee_id:
            return error("You can only modify your own records", 403)
    data = request.get_json(silent=True) or {}
    old = {}
    try:
        fields = writable_fields(model, data)
    except ValueError as e:
        return error(str(e), 422)
    for k, v in fields.items():
        old[k] = conv(getattr(obj, k))
        setattr(obj, k, v)
    if model is User and data.get("password"):
        obj.password_hash = generate_password_hash(data["password"])
        obj.token = None
    if hasattr(obj, "updated_by"):
        obj.updated_by = request.user.id
    audit(request.user, "update", resource, obj.id, old=old, new=fields)
    db.session.commit()
    return jsonify({"data": serialize(obj, resource)})


@app.delete("/api/v1/<resource>/<int:rid>")
@login_required
def delete_resource(resource, rid):
    cfg, model = get_resource(resource)
    if not model:
        return error("Unknown resource", 404)
    if role_of(request.user) in READ_ONLY:
        return error("Auditor accounts are read-only", 403)
    if not can_write(request.user, resource) and not can_self_write(request.user, resource):
        return error("You do not have permission to perform this action", 403)
    obj = db.session.get(model, rid)
    if not obj:
        return error("Not found", 404)
    if can_self_write(request.user, resource) and not can_write(request.user, resource):
        if getattr(obj, "employee_id", None) != request.user.employee_id:
            return error("You can only delete your own records", 403)
    if model is User and obj.id == request.user.id:
        return error("You cannot delete your own account", 409)
    if hasattr(obj, "deleted_at"):
        obj.deleted_at = datetime.utcnow()
        audit(request.user, "soft_delete", resource, obj.id)
    else:
        audit(request.user, "delete", resource, obj.id, old={c.name: conv(getattr(obj, c.name)) for c in obj.__table__.columns})
        db.session.delete(obj)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


# ---------------------------------------------------------------- dashboard & reports

@app.get("/api/v1/dashboard")
@login_required
def dashboard():
    user = request.user
    today = date.today()
    emp_q = Employee.query.filter(Employee.deleted_at.is_(None))
    if role_of(user) == "employee":
        emp_q = emp_q.filter(Employee.id == user.employee_id)
    elif role_of(user) == "manager":
        emp_q = emp_q.filter(or_(Employee.id == user.employee_id, Employee.manager_id == user.employee_id))
    employees = emp_q.all()
    headcount = len(employees)
    active = sum(1 for e in employees if e.status == "active")
    dept_counts = {}
    for e in employees:
        name = e.department.name if e.department else "Unassigned"
        dept_counts[name] = dept_counts.get(name, 0) + 1
    month = today.replace(day=1)
    new_hires = sum(1 for e in employees if e.hire_date and e.hire_date >= month)
    pending_leave = LeaveRequest.query.filter_by(status="pending").count()
    if role_of(user) in ("employee", "manager"):
        pending_leave = LeaveRequest.query.filter_by(status="pending", approver_id=user.employee_id).count()
    open_tickets = Ticket.query.filter(Ticket.status.in_(["open", "in_progress"])).count()
    open_vacancies = sum(p.vacancies or 0 for p in JobPosting.query.filter_by(status="open").all())
    latest_run = PayrollRun.query.order_by(PayrollRun.id.desc()).first()
    present_today = Attendance.query.filter_by(work_date=today).count()
    on_leave_today = LeaveRequest.query.filter(
        LeaveRequest.status == "approved", LeaveRequest.start_date <= today,
        LeaveRequest.end_date >= today).count()
    expiring = []
    for d in Document.query.filter(Document.expires_at.isnot(None)).all():
        if d.expires_at and today <= d.expires_at <= today + timedelta(days=45):
            expiring.append({"title": d.title, "date": conv(d.expires_at), "employee": d.employee.full_name if d.employee else "-"})
    birthdays = []
    for e in employees:
        if e.dob and (e.dob.month, e.dob.day) >= (today.month, today.day) and \
                (e.dob.month, e.dob.day) <= ((today + timedelta(days=30)).month, (today + timedelta(days=30)).day):
            birthdays.append({"name": e.full_name, "date": f"{e.dob.strftime('%d %b')}"})
    announcements = [serialize(a, "announcements") for a in
                     Announcement.query.order_by(Announcement.pinned.desc(), Announcement.id.desc()).limit(4)]
    my_balances = []
    if user.employee_id:
        for b in LeaveBalance.query.filter_by(employee_id=user.employee_id, year=today.year).all():
            if b.leave_type.gender_restriction and b.leave_type.gender_restriction != (
                    employee_of(user).gender if employee_of(user) else None):
                continue
            my_balances.append({"type": b.leave_type.name, "color": b.leave_type.color,
                                "remaining": float(b.entitled) - float(b.taken) - float(b.pending),
                                "entitled": float(b.entitled)})
    return jsonify({"data": {
        "headcount": headcount, "active": active, "new_hires": new_hires,
        "pending_approvals": pending_leave, "open_tickets": open_tickets,
        "open_vacancies": open_vacancies, "present_today": present_today,
        "on_leave_today": on_leave_today,
        "payroll_cost": float(latest_run.total_gross) if latest_run else 0,
        "payroll_status": latest_run.status if latest_run else "none",
        "departments": [{"name": k, "count": v} for k, v in sorted(dept_counts.items(), key=lambda x: -x[1])],
        "expiring_documents": expiring[:5], "birthdays": birthdays[:6],
        "announcements": announcements, "my_leave": my_balances,
        "company": {"name": (Company.query.first().name if Company.query.first() else "Company")},
    }})


@app.get("/api/v1/reports/overview")
@login_required
def report_overview():
    today = date.today()
    employees = Employee.query.filter(Employee.deleted_at.is_(None)).all()
    headcount = len(employees)
    by_dept = {}
    by_gender = {}
    by_contract = {}
    for e in employees:
        d = e.department.name if e.department else "Unassigned"
        by_dept[d] = by_dept.get(d, 0) + 1
        g = (e.gender or "unspecified").title()
        by_gender[g] = by_gender.get(g, 0) + 1
        c = (e.contract_type or "permanent").replace("_", " ").title()
        by_contract[c] = by_contract.get(c, 0) + 1
    leave_by_status = {}
    for lr in LeaveRequest.query.all():
        leave_by_status[lr.status] = leave_by_status.get(lr.status, 0) + 1
    payroll = []
    for run in PayrollRun.query.order_by(PayrollRun.id.asc()).all():
        payroll.append({"period": f"{run.period_year}-{run.period_month:02d}",
                        "gross": float(run.total_gross), "net": float(run.total_net),
                        "tax": float(run.total_tax), "status": run.status})
    attendance = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        if d.weekday() >= 5:
            continue
        rows = Attendance.query.filter_by(work_date=d).all()
        present = sum(1 for r in rows if r.status in ("present", "late", "remote"))
        attendance.append({"date": conv(d), "present": present,
                           "late": sum(1 for r in rows if r.status == "late"),
                           "absent": sum(1 for r in rows if r.status == "absent")})
    turnover = Employee.query.filter(Employee.status.in_(["resigned", "terminated"])).count()
    return jsonify({"data": {
        "headcount": headcount, "turnover": turnover,
        "turnover_rate": round((turnover / headcount * 100) if headcount else 0, 1),
        "by_department": [{"name": k, "count": v} for k, v in sorted(by_dept.items(), key=lambda x: -x[1])],
        "by_gender": [{"name": k, "count": v} for k, v in by_gender.items()],
        "by_contract": [{"name": k, "count": v} for k, v in by_contract.items()],
        "leave_by_status": leave_by_status, "payroll": payroll, "attendance": attendance,
        "training_completion": {"completed": TrainingEnrolment.query.filter_by(status="completed").count(),
                                "enrolled": TrainingEnrolment.query.filter_by(status="enrolled").count()},
        "asset_count": Asset.query.count(),
        "assets_assigned": Asset.query.filter_by(status="assigned").count(),
    }})


@app.get("/api/v1/reports/headcount")
@login_required
def report_headcount():
    rows = db.session.query(Department.name, func.count(Employee.id)).outerjoin(
        Employee, Employee.department_id == Department.id).group_by(Department.name).all()
    return jsonify({"data": [{"department": r[0], "count": r[1]} for r in rows]})


# ---------------------------------------------------------------- employee detail

@app.get("/api/v1/employees/<int:eid>/profile")
@login_required
def employee_profile(eid):
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Not found", 404)
    role = role_of(request.user)
    is_self = (request.user.employee_id == eid)
    if role == "employee" and not is_self:
        return error("Forbidden", 403)
    if role == "manager" and not is_self and emp.manager_id != request.user.employee_id:
        return error("Forbidden", 403)

    can_view_comp = is_self or role in ("super_admin", "hr_admin", "payroll", "auditor")
    can_view_sensitive = is_self or role in ("super_admin", "hr_admin", "hr_officer", "payroll", "auditor")

    data = serialize(emp, "employees")
    data["full_name"] = emp.full_name
    data["is_self"] = is_self
    data["can_view_compensation"] = can_view_comp
    data["can_view_sensitive"] = can_view_sensitive
    if emp.hire_date:
        days_total = max(0, (date.today() - emp.hire_date).days)
        yrs, rem_days = divmod(days_total, 365)
        mos = rem_days // 30
        data["tenure_label"] = (f"{yrs}y {mos}m" if yrs > 0 else (f"{mos}m" if mos > 0 else f"{days_total}d"))
    else:
        data["tenure_label"] = "—"
    if not can_view_comp:
        data.pop("basic_salary", None)
    if not can_view_sensitive:
        for k in ("national_id", "tax_number", "ssnit_number"):
            if data.get(k):
                data[k] = "•••• " + str(data[k])[-3:]

    if emp.grade:
        data["grade_band"] = {"min": float(emp.grade.min_salary or 0), "max": float(emp.grade.max_salary or 0)}

    if emp.manager:
        data["manager_card"] = {
            "id": emp.manager.id,
            "name": emp.manager.full_name,
            "title": emp.manager.designation.title if emp.manager.designation else "",
            "department": emp.manager.department.name if emp.manager.department else "",
            "email": emp.manager.email,
            "photo_url": emp.manager.photo_url,
        }
    else:
        data["manager_card"] = None

    directs = (Employee.query.filter(Employee.manager_id == eid, Employee.deleted_at.is_(None))
               .order_by(Employee.first_name.asc()).all())
    data["direct_reports"] = [
        {
            "id": r.id, "name": r.full_name, "employee_no": r.employee_no,
            "title": r.designation.title if r.designation else "",
            "department": r.department.name if r.department else "",
            "status": r.status, "photo_url": r.photo_url,
        }
        for r in directs
    ]

    linked_user = User.query.filter_by(employee_id=eid).first()
    data["account"] = {
        "id": linked_user.id,
        "email": linked_user.email,
        "role": linked_user.role.name if linked_user.role else None,
        "role_slug": linked_user.role.slug if linked_user.role else None,
        "status": linked_user.status,
        "mfa_enabled": bool(linked_user.mfa_enabled),
        "last_login_at": conv(linked_user.last_login_at),
    } if linked_user else None

    data["contacts"] = [serialize(c) for c in EmployeeContact.query.filter_by(employee_id=eid).all()]
    data["dependants"] = [serialize(d) for d in Dependant.query.filter_by(employee_id=eid).all()]
    data["skills"] = [serialize(s) for s in EmployeeSkill.query.filter_by(employee_id=eid).order_by(EmployeeSkill.id.asc()).all()]
    data["education"] = [serialize(ed) for ed in EmployeeEducation.query.filter_by(employee_id=eid).order_by(EmployeeEducation.end_year.desc().nullslast()).all()]
    data["history"] = [serialize(h) for h in EmploymentHistory.query.filter_by(employee_id=eid)
                       .order_by(EmploymentHistory.effective_date.desc(), EmploymentHistory.id.desc()).all()]
    data["contracts"] = [serialize(c) for c in Contract.query.filter_by(employee_id=eid).order_by(Contract.start_date.desc().nullslast()).all()]
    data["documents"] = [serialize(d, "documents") for d in Document.query.filter_by(employee_id=eid).order_by(Document.id.desc()).all()]

    acks_by_pol = {
        a.policy_id: conv(a.acknowledged_at)
        for a in PolicyAck.query.filter_by(employee_id=eid).all()
    }
    data["policies"] = [
        {
            "id": p.id, "title": p.title, "category": p.category, "version": p.version,
            "published_at": conv(p.published_at), "requires_ack": bool(p.requires_ack),
            "acknowledged": p.id in acks_by_pol,
            "acknowledged_at": acks_by_pol.get(p.id),
        }
        for p in Policy.query.order_by(Policy.id.asc()).all()
    ]

    balances = []
    for b in LeaveBalance.query.filter_by(employee_id=eid, year=date.today().year).all():
        item = serialize(b, "leave-balances")
        if b.leave_type:
            item["color"] = b.leave_type.color
            item["code"] = b.leave_type.code
            item["paid"] = bool(b.leave_type.paid)
        balances.append(item)
    data["leave_balances"] = balances
    data["leave_requests"] = [serialize(l, "leave-requests") for l in
                              LeaveRequest.query.filter_by(employee_id=eid).order_by(LeaveRequest.id.desc()).limit(15)]

    att_rows = (Attendance.query.filter_by(employee_id=eid)
                .order_by(Attendance.work_date.desc()).limit(30).all())
    data["attendance"] = [serialize(a, "attendance") for a in att_rows]
    cutoff = date.today() - timedelta(days=30)
    att_30 = [a for a in att_rows if a.work_date and a.work_date >= cutoff]
    present_c = sum(1 for a in att_30 if a.status in ("present", "remote"))
    late_c = sum(1 for a in att_30 if a.status == "late")
    absent_c = sum(1 for a in att_30 if a.status == "absent")
    leave_c = sum(1 for a in att_30 if a.status == "leave")
    ot_mins = sum(int(a.overtime_minutes or 0) for a in att_30)
    denom = max(present_c + late_c + absent_c, 1)
    data["attendance_summary"] = {
        "present": present_c, "late": late_c, "absent": absent_c,
        "leave": leave_c, "overtime_minutes": ot_mins,
        "rate": round((present_c + late_c) / denom * 100),
    }

    if can_view_comp:
        data["bank_accounts"] = [serialize(b) for b in BankAccount.query.filter_by(employee_id=eid).all()]
        structs = []
        for s in SalaryStructure.query.filter_by(employee_id=eid).all():
            st_item = serialize(s, "salary-structures")
            if s.component:
                st_item["kind"] = s.component.kind
                st_item["code"] = s.component.code
                st_item["is_taxable"] = bool(s.component.is_taxable)
            structs.append(st_item)
        data["salary_structure"] = structs
        slips = []
        for p in Payslip.query.filter_by(employee_id=eid).order_by(Payslip.id.desc()).limit(12):
            ps_item = serialize(p, "payslips")
            if p.run:
                ps_item["period_year"] = p.run.period_year
                ps_item["period_month"] = p.run.period_month
                ps_item["period_label"] = date(p.run.period_year, max(1, min(12, p.run.period_month)), 1).strftime("%B %Y")
                ps_item["run_status"] = p.run.status
                ps_item["paid_at"] = conv(p.run.paid_at)
            ps_item["items"] = [serialize(it) for it in PayslipItem.query.filter_by(payslip_id=p.id).all()]
            slips.append(ps_item)
        data["payslips"] = slips
        data["loans"] = [serialize(l, "loans") for l in Loan.query.filter_by(employee_id=eid).order_by(Loan.id.desc()).all()]
        data["claims"] = [serialize(c, "claims") for c in ExpenseClaim.query.filter_by(employee_id=eid).order_by(ExpenseClaim.id.desc()).limit(10)]
    else:
        data["bank_accounts"] = []
        data["salary_structure"] = []
        data["payslips"] = []
        data["loans"] = []
        data["claims"] = []

    all_assigns = (AssetAssignment.query.filter_by(employee_id=eid)
                   .order_by(AssetAssignment.id.desc()).all())
    assets_list = []
    for a in all_assigns:
        ai = serialize(a, "asset-assignments")
        if a.asset:
            ai["category"] = a.asset.category
            ai["serial_no"] = a.asset.serial_no
            ai["value"] = float(a.asset.value or 0)
        assets_list.append(ai)
    data["assets"] = [a for a in assets_list if not a.get("returned_at")]
    data["asset_history"] = assets_list

    data["goals"] = [serialize(g, "goals") for g in Goal.query.filter_by(employee_id=eid).order_by(Goal.id.desc()).all()]
    appr_list = []
    for ap in Appraisal.query.filter_by(employee_id=eid).order_by(Appraisal.id.desc()).all():
        ap_item = serialize(ap, "appraisals")
        rev = db.session.get(Employee, ap.reviewer_id) if ap.reviewer_id else None
        ap_item["reviewer_full_name"] = rev.full_name if rev else "—"
        appr_list.append(ap_item)
    data["appraisals"] = appr_list

    train_list = []
    for te in TrainingEnrolment.query.filter_by(employee_id=eid).order_by(TrainingEnrolment.id.desc()).all():
        ti = serialize(te, "enrolments")
        if te.training:
            ti["provider"] = te.training.provider
            ti["category"] = te.training.category
            ti["mode"] = te.training.mode
            ti["start_date"] = conv(te.training.start_date)
        train_list.append(ti)
    data["trainings"] = train_list
    data["onboarding"] = [serialize(t, "onboarding-tasks") for t in
                          OnboardingTask.query.filter_by(employee_id=eid).order_by(OnboardingTask.due_date.asc().nullslast()).all()]

    checks = [
        ("Phone number", bool(emp.phone)),
        ("Date of birth", bool(emp.dob)),
        ("Residential address", bool(emp.address and emp.city)),
        ("National ID & SSNIT", bool(emp.national_id and emp.ssnit_number)),
        ("Emergency contact", len(data["contacts"]) > 0),
        ("Bank / MoMo account", BankAccount.query.filter_by(employee_id=eid).count() > 0),
        ("Skills & qualifications", (len(data["skills"]) + len(data["education"])) > 0),
        ("Bio summary", bool(emp.bio)),
    ]
    done_checks = sum(1 for _, ok in checks if ok)
    data["completeness"] = {
        "percent": round(done_checks / len(checks) * 100),
        "missing": [label_txt for label_txt, ok in checks if not ok],
    }
    return jsonify({"data": data})


@app.put("/api/v1/employees/<int:eid>/self")
@login_required
def employee_self_update(eid):
    if role_of(request.user) in READ_ONLY:
        return error("Auditor accounts are read-only", 403)
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Not found", 404)
    is_self = (request.user.employee_id == eid)
    is_hr = role_of(request.user) in ("super_admin", "hr_admin", "hr_officer")
    if not is_self and not is_hr:
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    allowed_fields = {
        "phone", "personal_email", "address", "city", "marital_status",
        "bio", "blood_group", "linkedin_url", "photo_url", "other_names", "work_location",
    }
    old, updated = {}, {}
    for k in allowed_fields:
        if k in data:
            old[k] = conv(getattr(emp, k))
            val = parse_value(Employee, k, data[k])
            setattr(emp, k, val)
            updated[k] = conv(val)
    audit(request.user, "self_profile_update", "employees", emp.id, old=old, new=updated)
    db.session.commit()
    return jsonify({"data": serialize(emp, "employees")})


@app.post("/api/v1/employees/<int:eid>/confirm")
@login_required
def confirm_employee_probation(eid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Not found", 404)
    data = request.get_json(silent=True) or {}
    eff = date.fromisoformat(data["effective_date"]) if data.get("effective_date") else date.today()
    old_status = emp.status
    emp.status = "active"
    emp.confirmation_date = eff
    db.session.add(EmploymentHistory(
        employee_id=emp.id, event_type="confirmation",
        from_value=old_status, to_value="Confirmed Permanent",
        effective_date=eff, notes=data.get("notes") or "Probation completed and employment confirmed",
    ))
    audit(request.user, "employee_confirmed", "employees", emp.id, old={"status": old_status}, new={"status": "active"})
    db.session.commit()
    return jsonify({"data": serialize(emp, "employees")})


@app.post("/api/v1/employees/<int:eid>/career-event")
@login_required
def add_career_event(eid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Not found", 404)
    data = request.get_json(silent=True) or {}
    event_type = (data.get("event_type") or "promotion").strip()
    eff = date.fromisoformat(data["effective_date"][:10]) if data.get("effective_date") else date.today()
    from_val = data.get("from_value")
    to_val = data.get("to_value")

    if data.get("designation_id"):
        new_des = db.session.get(Designation, int(data["designation_id"]))
        if new_des:
            from_val = from_val or (emp.designation.title if emp.designation else "—")
            to_val = to_val or new_des.title
            emp.designation_id = new_des.id
    if data.get("department_id"):
        new_dept = db.session.get(Department, int(data["department_id"]))
        if new_dept:
            if event_type == "transfer":
                from_val = from_val or (emp.department.name if emp.department else "—")
                to_val = to_val or new_dept.name
            emp.department_id = new_dept.id
    if data.get("grade_id"):
        emp.grade_id = int(data["grade_id"])
    if data.get("branch_id"):
        emp.branch_id = int(data["branch_id"])
    if data.get("new_salary") not in (None, ""):
        old_sal = Decimal(str(emp.basic_salary or 0))
        new_sal = Decimal(str(data["new_salary"]))
        if event_type == "salary_revision":
            from_val = from_val or f"GHS {old_sal:,.2f}"
            to_val = to_val or f"GHS {new_sal:,.2f}"
        emp.basic_salary = new_sal
        basic_comp = SalaryComponent.query.filter_by(code="BASIC").first()
        if basic_comp:
            ss = SalaryStructure.query.filter_by(employee_id=emp.id, component_id=basic_comp.id).first()
            if ss:
                ss.amount = new_sal
                ss.effective_date = eff

    hist = EmploymentHistory(
        employee_id=emp.id, event_type=event_type,
        from_value=from_val, to_value=to_val,
        effective_date=eff, notes=data.get("notes"),
    )
    db.session.add(hist)
    audit(request.user, "career_event", "employees", emp.id, new={"event_type": event_type, "to": to_val})
    db.session.commit()
    return jsonify({"data": serialize(hist)}), 201


@app.post("/api/v1/employees/import")
@login_required
def employee_import():
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    payload = request.get_json(silent=True) or {}
    rows = payload.get("rows") or []
    created, errors = 0, []
    for idx, row in enumerate(rows, start=2):
        try:
            if not row.get("first_name") or not row.get("last_name"):
                raise ValueError("first_name and last_name are required")
            emp = Employee(
                employee_no=row.get("employee_no") or next_employee_no(),
                first_name=row["first_name"], last_name=row["last_name"],
                email=row.get("email"), phone=row.get("phone"), gender=row.get("gender"),
                hire_date=date.fromisoformat(row["hire_date"]) if row.get("hire_date") else date.today(),
                department_id=row.get("department_id"), designation_id=row.get("designation_id"),
                basic_salary=Decimal(str(row.get("basic_salary") or 0)),
                company_id=1, status="active", contract_type=row.get("contract_type", "permanent"),
            )
            db.session.add(emp)
            created += 1
        except Exception as e:
            errors.append({"row": idx, "error": str(e)})
    db.session.commit()
    return jsonify({"data": {"created": created, "errors": errors}})


@app.get("/api/v1/employees/export.csv")
@login_required
def employee_export():
    rows = Employee.query.filter(Employee.deleted_at.is_(None)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["employee_no", "first_name", "last_name", "email", "phone", "department",
                "designation", "hire_date", "status", "basic_salary"])
    for e in rows:
        w.writerow([e.employee_no, e.first_name, e.last_name, e.email, e.phone,
                    e.department.name if e.department else "", e.designation.title if e.designation else "",
                    conv(e.hire_date), e.status, float(e.basic_salary or 0)])
    mem = io.BytesIO(buf.getvalue().encode("utf-8"))
    return send_file(mem, mimetype="text/csv", as_attachment=True, download_name="employees.csv")


# ---------------------------------------------------------------- attendance actions

@app.post("/api/v1/attendance/clock-in")
@login_required
def clock_in():
    emp = employee_of(request.user)
    if not emp:
        return error("No employee record linked to this account", 409)
    today = date.today()
    rec = Attendance.query.filter_by(employee_id=emp.id, work_date=today).first()
    if rec and rec.clock_in:
        return error("You have already clocked in today", 409)
    default_shift = Shift.query.filter_by(is_default=True).first()
    now = datetime.now()
    status = "present"
    if default_shift:
        start_h = int(default_shift.start_time.split(":")[0])
        start_m = int(default_shift.start_time.split(":")[1]) + (default_shift.grace_minutes or 0)
        limit = now.replace(hour=start_h, minute=0, second=0, microsecond=0) + timedelta(minutes=start_m)
        if now > limit:
            status = "late"
    if not rec:
        rec = Attendance(employee_id=emp.id, work_date=today, source="web")
        db.session.add(rec)
    rec.clock_in = now
    rec.status = status
    audit(request.user, "clock_in", "attendance", rec.id)
    db.session.commit()
    return jsonify({"data": serialize(rec, "attendance")})


@app.post("/api/v1/attendance/clock-out")
@login_required
def clock_out():
    emp = employee_of(request.user)
    if not emp:
        return error("No employee record linked to this account", 409)
    rec = Attendance.query.filter_by(employee_id=emp.id, work_date=date.today()).first()
    if not rec or not rec.clock_in:
        return error("You have not clocked in today", 409)
    rec.clock_out = datetime.now()
    worked = (rec.clock_out - rec.clock_in).total_seconds() / 60
    if worked > 540:
        rec.overtime_minutes = int(worked - 540)
    db.session.commit()
    return jsonify({"data": serialize(rec, "attendance")})


@app.post("/api/v1/corrections/<int:rid>/approve")
@login_required
def approve_correction(rid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer", "manager"):
        return error("Forbidden", 403)
    corr = db.session.get(AttendanceCorrection, rid)
    if not corr:
        return error("Not found", 404)
    corr.status = "approved"
    rec = Attendance.query.filter_by(employee_id=corr.employee_id, work_date=corr.work_date).first()
    if not rec:
        rec = Attendance(employee_id=corr.employee_id, work_date=corr.work_date, source="correction")
        db.session.add(rec)
    if corr.requested_clock_in:
        rec.clock_in = datetime.combine(corr.work_date, datetime.strptime(corr.requested_clock_in, "%H:%M").time())
    if corr.requested_clock_out:
        rec.clock_out = datetime.combine(corr.work_date, datetime.strptime(corr.requested_clock_out, "%H:%M").time())
    db.session.commit()
    return jsonify({"data": serialize(corr, "corrections")})


# ---------------------------------------------------------------- leave actions

@app.post("/api/v1/leave-requests/<int:rid>/approve")
@login_required
def approve_leave(rid):
    return decide_leave(rid, "approved")


@app.post("/api/v1/leave-requests/<int:rid>/reject")
@login_required
def reject_leave(rid):
    return decide_leave(rid, "rejected")


@app.post("/api/v1/leave-requests/<int:rid>/cancel")
@login_required
def cancel_leave(rid):
    lr = db.session.get(LeaveRequest, rid)
    if not lr:
        return error("Not found", 404)
    if lr.employee_id != request.user.employee_id and role_of(request.user) not in (
            "super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    if lr.status != "pending":
        return error("Only pending requests can be cancelled", 409)
    lr.status = "cancelled"
    bal = LeaveBalance.query.filter_by(employee_id=lr.employee_id, leave_type_id=lr.leave_type_id,
                                       year=lr.start_date.year).first()
    if bal:
        bal.pending = max(Decimal("0"), Decimal(bal.pending or 0) - Decimal(lr.days or 0))
    db.session.commit()
    return jsonify({"data": serialize(lr, "leave-requests")})


def decide_leave(rid, decision):
    user = request.user
    lr = db.session.get(LeaveRequest, rid)
    if not lr:
        return error("Not found", 404)
    role = role_of(user)
    allowed = role in ("super_admin", "hr_admin", "hr_officer") or lr.approver_id == user.employee_id
    if not allowed:
        return error("You are not the approver for this request", 403)
    if lr.status != "pending":
        return error("This request has already been decided", 409)
    lr.status = decision
    lr.approver_id = user.employee_id
    lr.decided_at = datetime.utcnow()
    lr.decision_note = (request.get_json(silent=True) or {}).get("note")
    year = lr.start_date.year
    bal = LeaveBalance.query.filter_by(employee_id=lr.employee_id, leave_type_id=lr.leave_type_id,
                                       year=year).first()
    if bal:
        bal.pending = max(Decimal("0"), Decimal(bal.pending or 0) - Decimal(lr.days or 0))
        if decision == "approved":
            bal.taken = Decimal(bal.taken or 0) + Decimal(lr.days or 0)
            d = lr.start_date
            while d <= lr.end_date:
                if d.weekday() < 5 and not Holiday.query.filter_by(holiday_date=d).first():
                    rec = Attendance.query.filter_by(employee_id=lr.employee_id, work_date=d).first()
                    if not rec:
                        rec = Attendance(employee_id=lr.employee_id, work_date=d, source="leave")
                        db.session.add(rec)
                    rec.status = "leave"
                d += timedelta(days=1)
    for ap in Approval.query.filter_by(request_type="leave", request_id=lr.id).all():
        ap.status = decision
        ap.decided_at = datetime.utcnow()
        ap.comments = lr.decision_note
    requester = user_for_employee(lr.employee_id)
    if requester:
        dispatch_event(
            "leave_decision", [requester],
            f"Leave {decision}",
            f"Your {lr.leave_type.name if lr.leave_type else 'leave'} request ({lr.days} day(s), {lr.start_date} to {lr.end_date}) was {decision}.",
            "/leave",
        )
    audit(user, f"leave_{decision}", "leave_requests", lr.id)
    db.session.commit()
    return jsonify({"data": serialize(lr, "leave-requests")})


@app.get("/api/v1/leave/summary")
@login_required
def leave_summary():
    emp_id = request.args.get("employee_id", type=int) or request.user.employee_id
    if request.user.employee_id != emp_id and role_of(request.user) in ("employee",):
        return error("Forbidden", 403)
    year = request.args.get("year", type=int) or date.today().year
    balances = LeaveBalance.query.filter_by(employee_id=emp_id, year=year).all()
    return jsonify({"data": [serialize(b, "leave-balances") for b in balances]})


# ---------------------------------------------------------------- payroll

def compute_payslip(emp, run):
    structures = SalaryStructure.query.filter_by(employee_id=emp.id).all()
    earnings = []
    gross = Decimal("0")
    basic = Decimal(str(emp.basic_salary or 0))
    if structures:
        for s in structures:
            comp = s.component
            if comp.kind == "earning":
                amt = Decimal(str(s.amount or 0))
                earnings.append((comp.name, amt))
                gross += amt
    else:
        earnings.append(("Basic Pay", basic))
        gross = basic
    if not earnings:
        earnings.append(("Basic Pay", basic))
        gross = basic
    ssnit = (basic * Decimal("0.055")).quantize(Decimal("0.01"))
    taxable = gross - ssnit
    tax = _paye(taxable)
    other = Decimal("0")
    for loan in Loan.query.filter_by(employee_id=emp.id, status="active").all():
        other += Decimal(str(loan.instalment or 0))
    net = gross - ssnit - tax - other
    return gross, ssnit, tax, other, net, earnings


@app.post("/api/v1/payroll-runs/<int:rid>/calculate")
@login_required
def calculate_payroll(rid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "payroll"):
        return error("Forbidden", 403)
    run = db.session.get(PayrollRun, rid)
    if not run:
        return error("Not found", 404)
    if run.status in ("locked", "paid"):
        return error("Locked payroll runs cannot be recalculated", 409)
    Payslip.query.filter_by(run_id=run.id).delete()
    employees = Employee.query.filter(Employee.deleted_at.is_(None), Employee.status == "active").all()
    tg = tt = tn = Decimal("0")
    for emp in employees:
        gross, ssnit, tax, other, net, earnings = compute_payslip(emp, run)
        ps = Payslip(run_id=run.id, employee_id=emp.id, gross=gross, tax=tax, ssnit=ssnit,
                     other_deductions=other, net=net)
        db.session.add(ps)
        db.session.flush()
        for name, amt in earnings:
            db.session.add(PayslipItem(payslip_id=ps.id, name=name, kind="earning", amount=amt))
        db.session.add(PayslipItem(payslip_id=ps.id, name="SSNIT 5.5%", kind="deduction", amount=ssnit))
        db.session.add(PayslipItem(payslip_id=ps.id, name="PAYE", kind="deduction", amount=tax))
        if other:
            db.session.add(PayslipItem(payslip_id=ps.id, name="Loan repayment", kind="deduction", amount=other))
        tg += gross
        tt += tax
        tn += net
    run.employee_count = len(employees)
    run.total_gross = tg
    run.total_tax = tt
    run.total_net = tn
    if run.status == "draft":
        run.status = "calculated"
    audit(request.user, "payroll_calculated", "payroll_runs", run.id)
    db.session.commit()
    return jsonify({"data": serialize(run, "payroll-runs")})


@app.post("/api/v1/payroll-runs/<int:rid>/approve")
@login_required
def approve_payroll(rid):
    user = request.user
    if role_of(user) not in ("super_admin", "hr_admin"):
        return error("Only HR Admin may approve a payroll run", 403)
    run = db.session.get(PayrollRun, rid)
    if not run:
        return error("Not found", 404)
    if run.prepared_by == user.id:
        return error("The approver cannot be the preparer", 409)
    if run.status not in ("calculated", "review"):
        return error("Only calculated runs can be approved", 409)
    run.status = "approved"
    run.approved_by = user.id
    audit(user, "payroll_approved", "payroll_runs", run.id)
    db.session.commit()
    return jsonify({"data": serialize(run, "payroll-runs")})


@app.post("/api/v1/payroll-runs/<int:rid>/lock")
@login_required
def lock_payroll(rid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "payroll"):
        return error("Forbidden", 403)
    run = db.session.get(PayrollRun, rid)
    if not run:
        return error("Not found", 404)
    if run.status != "approved":
        return error("Only approved runs can be locked", 409)
    run.status = "locked"
    run.locked_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"data": serialize(run, "payroll-runs")})


@app.post("/api/v1/payroll-runs/<int:rid>/pay")
@login_required
def pay_payroll(rid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "payroll"):
        return error("Forbidden", 403)
    run = db.session.get(PayrollRun, rid)
    if not run:
        return error("Not found", 404)
    if run.status != "locked":
        return error("Payroll must be locked before payment", 409)
    run.status = "paid"
    run.paid_at = datetime.utcnow()
    paid_users = []
    for ps in Payslip.query.filter_by(run_id=run.id).all():
        u = user_for_employee(ps.employee_id)
        if u:
            paid_users.append(u)
        for loan in Loan.query.filter_by(employee_id=ps.employee_id, status="active").all():
            loan.balance = max(Decimal("0"), Decimal(loan.balance or 0) - Decimal(loan.instalment or 0))
            if loan.balance == 0:
                loan.status = "completed"
    period_label = date(run.period_year, max(1, min(12, run.period_month)), 1).strftime("%B %Y")
    dispatch_event(
        "payroll_paid", paid_users,
        f"Payslip available — {period_label}",
        f"Your payslip for {period_label} has been released and is ready to view in Meridian HR.",
        "/payroll",
    )
    db.session.commit()
    return jsonify({"data": serialize(run, "payroll-runs")})


@app.get("/api/v1/payslips/<int:pid>/detail")
@login_required
def payslip_detail(pid):
    ps = db.session.get(Payslip, pid)
    if not ps:
        return error("Not found", 404)
    if role_of(request.user) == "employee" and ps.employee_id != request.user.employee_id:
        return error("Forbidden", 403)
    data = serialize(ps, "payslips")
    data["employee"] = serialize(ps.employee, "employees")
    data["items"] = [serialize(i) for i in PayslipItem.query.filter_by(payslip_id=pid).all()]
    data["run"] = serialize(ps.run, "payroll-runs")
    return jsonify({"data": data})


@app.post("/api/v1/loans/<int:lid>/approve")
@login_required
def approve_loan(lid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "payroll"):
        return error("Forbidden", 403)
    loan = db.session.get(Loan, lid)
    if not loan:
        return error("Not found", 404)
    loan.status = "active"
    loan.balance = loan.principal
    db.session.commit()
    return jsonify({"data": serialize(loan, "loans")})


# ---------------------------------------------------------------- recruitment

@app.patch("/api/v1/applications/<int:aid>/stage")
@login_required
def move_stage(aid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer", "recruiter"):
        return error("Forbidden", 403)
    app_obj = db.session.get(Application, aid)
    if not app_obj:
        return error("Not found", 404)
    stage = (request.get_json(silent=True) or {}).get("stage")
    if stage not in ("applied", "screening", "interview", "assessment", "offer", "hired", "rejected"):
        return error("Invalid stage", 422)
    app_obj.stage = stage
    db.session.commit()
    return jsonify({"data": serialize(app_obj, "applications")})


@app.post("/api/v1/applications/<int:aid>/hire")
@login_required
def hire_candidate(aid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    app_obj = db.session.get(Application, aid)
    if not app_obj:
        return error("Not found", 404)
    cand = app_obj.candidate
    existing = Employee.query.filter_by(email=cand.email).first()
    if existing:
        return error("An employee with this email already exists", 409)
    emp = Employee(
        employee_no=next_employee_no(), first_name=cand.first_name, last_name=cand.last_name,
        email=cand.email, phone=cand.phone, hire_date=date.today(), status="active",
        department_id=app_obj.job_posting.department_id, contract_type="permanent",
        company_id=1, basic_salary=0, city="Accra",
    )
    db.session.add(emp)
    db.session.flush()
    app_obj.stage = "hired"
    app_obj.job_posting.status = "filled" if app_obj.job_posting.vacancies <= 1 else app_obj.job_posting.status
    tasks = [
        ("Create email and system accounts", "IT", 1),
        ("Issue equipment", "IT", 2),
        ("Payroll setup and bank details", "Finance", 3),
        ("Welcome briefing and policy acknowledgement", "HR", 3),
        ("Assign buddy and 30-day plan", "Manager", 5),
    ]
    for title, owner, days in tasks:
        db.session.add(OnboardingTask(employee_id=emp.id, title=title, owner_role=owner,
                                      due_date=date.today() + timedelta(days=days)))
    audit(request.user, "candidate_hired", "applications", aid)
    db.session.commit()
    return jsonify({"data": serialize(emp, "employees")}), 201


@app.get("/api/v1/recruitment/board")
@login_required
def recruitment_board():
    postings = JobPosting.query.filter(JobPosting.status == "open").all()
    board = {}
    for p in postings:
        board[str(p.id)] = {"posting": serialize(p, "job-postings"), "applications": []}
    for a in Application.query.all():
        key = str(a.job_posting_id)
        if key in board:
            board[key]["applications"].append(serialize(a, "applications"))
    return jsonify({"data": {"postings": [serialize(p, "job-postings") for p in postings],
                             "board": board}})


# ---------------------------------------------------------------- assets, claims, tickets, approvals

@app.post("/api/v1/assets/<int:aid>/assign")
@login_required
def assign_asset(aid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    asset = db.session.get(Asset, aid)
    if not asset:
        return error("Not found", 404)
    data = request.get_json(silent=True) or {}
    if not data.get("employee_id"):
        return error("employee_id is required", 422)
    if asset.status == "assigned":
        return error("This asset is already assigned", 409)
    assignment = AssetAssignment(asset_id=asset.id, employee_id=int(data["employee_id"]),
                                 assigned_at=date.today(), condition_out=data.get("condition", "good"))
    asset.status = "assigned"
    db.session.add(assignment)
    assignee_user = user_for_employee(int(data["employee_id"]))
    if assignee_user:
        dispatch_event(
            "asset_assigned", [assignee_user],
            f"Equipment issued: {asset.name}",
            f"{asset.name} ({asset.tag}) has been assigned to you in condition '{assignment.condition_out}'.",
            "/assets",
        )
    db.session.commit()
    return jsonify({"data": serialize(assignment, "asset-assignments")}), 201


@app.post("/api/v1/assets/<int:aid>/return")
@login_required
def return_asset(aid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    asset = db.session.get(Asset, aid)
    if not asset:
        return error("Not found", 404)
    assignment = AssetAssignment.query.filter_by(asset_id=aid, returned_at=None).first()
    if not assignment:
        return error("This asset is not currently assigned", 409)
    assignment.returned_at = date.today()
    assignment.condition_in = (request.get_json(silent=True) or {}).get("condition", "good")
    asset.status = "available"
    db.session.commit()
    return jsonify({"data": serialize(assignment, "asset-assignments")})


@app.post("/api/v1/claims/<int:cid>/approve")
@login_required
def approve_claim(cid):
    return decide_claim(cid, "approved")


@app.post("/api/v1/claims/<int:cid>/reject")
@login_required
def reject_claim(cid):
    return decide_claim(cid, "rejected")


@app.post("/api/v1/claims/<int:cid>/pay")
@login_required
def pay_claim(cid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "payroll"):
        return error("Forbidden", 403)
    claim = db.session.get(ExpenseClaim, cid)
    if not claim:
        return error("Not found", 404)
    if claim.status != "approved":
        return error("Only approved claims can be paid", 409)
    claim.status = "paid"
    claimant_user = user_for_employee(claim.employee_id)
    if claimant_user:
        dispatch_event(
            "expense_decision", [claimant_user],
            "Expense claim reimbursed",
            f"Your expense claim '{claim.title}' (GHS {float(claim.amount):,.2f}) has been marked paid.",
            "/expenses",
        )
    db.session.commit()
    return jsonify({"data": serialize(claim, "claims")})


def decide_claim(cid, decision):
    role = role_of(request.user)
    claim = db.session.get(ExpenseClaim, cid)
    if not claim:
        return error("Not found", 404)
    emp = employee_of(request.user)
    is_manager = emp and claim.employee and claim.employee.manager_id == emp.id
    if role not in ("super_admin", "hr_admin", "payroll") and not is_manager:
        return error("Forbidden", 403)
    if claim.status != "pending":
        return error("This claim has already been decided", 409)
    claim.status = decision
    if decision == "approved" and role == "manager":
        claim.description = (claim.description or "") + "\n[Approved by line manager]"
    for ap in Approval.query.filter_by(request_type="expense", request_id=cid).all():
        ap.status = decision
        ap.decided_at = datetime.utcnow()
    claimant_user = user_for_employee(claim.employee_id)
    if claimant_user:
        dispatch_event(
            "expense_decision", [claimant_user],
            f"Expense claim {decision}",
            f"Your expense claim '{claim.title}' (GHS {float(claim.amount):,.2f}) was {decision}.",
            "/expenses",
        )
    db.session.commit()
    return jsonify({"data": serialize(claim, "claims")})


@app.post("/api/v1/tickets/<int:tid>/status")
@login_required
def set_ticket_status(tid):
    role = role_of(request.user)
    ticket = db.session.get(Ticket, tid)
    if not ticket:
        return error("Not found", 404)
    if role not in ("super_admin", "hr_admin", "hr_officer") and ticket.employee_id != request.user.employee_id:
        return error("Forbidden", 403)
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in ("open", "in_progress", "resolved", "closed"):
        return error("Invalid status", 422)
    ticket.status = status
    owner_user = user_for_employee(ticket.employee_id)
    if owner_user and owner_user.id != request.user.id:
        dispatch_event(
            "ticket_update", [owner_user],
            f"Ticket #{ticket.id} marked {status.replace('_', ' ')}",
            f"Your helpdesk ticket '{ticket.subject}' is now {status.replace('_', ' ')}.",
            "/helpdesk",
        )
    db.session.commit()
    return jsonify({"data": serialize(ticket, "tickets")})


@app.post("/api/v1/tickets/<int:tid>/assign")
@login_required
def assign_ticket(tid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    ticket = db.session.get(Ticket, tid)
    if not ticket:
        return error("Not found", 404)
    ticket.assignee_id = (request.get_json(silent=True) or {}).get("assignee_id")
    ticket.status = "in_progress"
    targets = []
    if ticket.assignee_id:
        au = user_for_employee(int(ticket.assignee_id))
        if au:
            targets.append(au)
    owner_user = user_for_employee(ticket.employee_id)
    if owner_user:
        targets.append(owner_user)
    if targets:
        dispatch_event(
            "ticket_update", targets,
            f"Ticket #{ticket.id} assigned",
            f"Helpdesk ticket '{ticket.subject}' is now in progress.",
            "/helpdesk",
        )
    db.session.commit()
    return jsonify({"data": serialize(ticket, "tickets")})


@app.post("/api/v1/tickets/<int:tid>/comments")
@login_required
def add_ticket_comment(tid):
    ticket = db.session.get(Ticket, tid)
    if not ticket:
        return error("Not found", 404)
    body = (request.get_json(silent=True) or {}).get("body", "").strip()
    if not body:
        return error("Comment body is required", 422)
    c = TicketComment(ticket_id=tid, author_id=request.user.id, body=body)
    db.session.add(c)
    targets = []
    owner_user = user_for_employee(ticket.employee_id)
    if owner_user and owner_user.id != request.user.id:
        targets.append(owner_user)
    if ticket.assignee_id:
        au = user_for_employee(ticket.assignee_id)
        if au and au.id != request.user.id:
            targets.append(au)
    if targets:
        dispatch_event(
            "ticket_update", targets,
            f"New reply on ticket #{ticket.id}",
            f"{request.user.employee.full_name if request.user.employee else request.user.email}: {body[:160]}",
            "/helpdesk",
        )
    db.session.commit()
    return jsonify({"data": serialize(c)}), 201


@app.get("/api/v1/tickets/<int:tid>/detail")
@login_required
def ticket_detail(tid):
    ticket = db.session.get(Ticket, tid)
    if not ticket:
        return error("Not found", 404)
    role = role_of(request.user)
    if ticket.employee_id != request.user.employee_id and role in ("employee",):
        return error("Forbidden", 403)
    data = serialize(ticket, "tickets")
    comments = []
    for c in TicketComment.query.filter_by(ticket_id=tid).order_by(TicketComment.id.asc()).all():
        item = serialize(c)
        author = db.session.get(User, c.author_id) if c.author_id else None
        item["author_name"] = (author.employee.full_name if author and author.employee else
                               (author.email if author else "System"))
        comments.append(item)
    data["comments"] = comments
    return jsonify({"data": data})


@app.get("/api/v1/approvals/inbox")
@login_required
def approvals_inbox():
    user = request.user
    role = role_of(user)
    items = []
    if role in ("super_admin", "hr_admin", "hr_officer"):
        leave_q = LeaveRequest.query.filter_by(status="pending")
        claim_q = ExpenseClaim.query.filter_by(status="pending")
        loan_q = Loan.query.filter_by(status="pending")
        corr_q = AttendanceCorrection.query.filter_by(status="pending")
    elif role == "manager":
        leave_q = LeaveRequest.query.filter_by(status="pending", approver_id=user.employee_id)
        claim_q = ExpenseClaim.query.join(Employee, Employee.id == ExpenseClaim.employee_id).filter(
            ExpenseClaim.status == "pending", Employee.manager_id == user.employee_id)
        loan_q = Loan.query.filter(Loan.id < 0)
        corr_q = AttendanceCorrection.query.join(Employee, Employee.id == AttendanceCorrection.employee_id).filter(
            AttendanceCorrection.status == "pending", Employee.manager_id == user.employee_id)
    elif role == "payroll":
        leave_q = LeaveRequest.query.filter(LeaveRequest.id < 0)
        claim_q = ExpenseClaim.query.filter_by(status="pending")
        loan_q = Loan.query.filter_by(status="pending")
        corr_q = AttendanceCorrection.query.filter(AttendanceCorrection.id < 0)
    else:
        leave_q = LeaveRequest.query.filter(LeaveRequest.id < 0)
        claim_q = ExpenseClaim.query.filter(ExpenseClaim.id < 0)
        loan_q = Loan.query.filter(Loan.id < 0)
        corr_q = AttendanceCorrection.query.filter(AttendanceCorrection.id < 0)
    for lr in leave_q.all():
        emp = lr.employee
        items.append({
            "type": "leave", "id": lr.id, "uid": f"leave:{lr.id}",
            "employee_id": lr.employee_id,
            "employee_name": emp.full_name if emp else "—",
            "department_name": emp.department.name if emp and emp.department else "—",
            "title": f"{emp.full_name if emp else 'Employee'} – {lr.leave_type.name if lr.leave_type else 'Leave'}",
            "subtitle": f"{lr.days} day(s) · {lr.start_date} to {lr.end_date}",
            "detail": lr.reason or "Annual / statutory time-off request",
            "status": lr.status, "amount": None, "requested_at": conv(lr.created_at),
        })
    for c in claim_q.all():
        emp = c.employee
        items.append({
            "type": "expense", "id": c.id, "uid": f"expense:{c.id}",
            "employee_id": c.employee_id,
            "employee_name": emp.full_name if emp else "—",
            "department_name": emp.department.name if emp and emp.department else "—",
            "title": f"{emp.full_name if emp else 'Employee'} – {c.title}",
            "subtitle": c.category.name if c.category else "Expense reimbursement",
            "detail": c.description or f"Incurred on {c.claim_date or '—'}",
            "status": c.status, "amount": float(c.amount), "requested_at": conv(c.created_at),
        })
    for l in loan_q.all():
        emp = l.employee
        items.append({
            "type": "loan", "id": l.id, "uid": f"loan:{l.id}",
            "employee_id": l.employee_id,
            "employee_name": emp.full_name if emp else "—",
            "department_name": emp.department.name if emp and emp.department else "—",
            "title": f"{emp.full_name if emp else 'Employee'} – {l.loan_type.replace('_', ' ').title()}",
            "subtitle": f"Instalment GHS {float(l.instalment or 0):,.2f}/mo · {l.reason or 'Staff advance'}",
            "detail": l.reason or "Staff loan / salary advance",
            "status": l.status, "amount": float(l.principal), "requested_at": conv(l.created_at),
        })
    for corr in corr_q.all():
        emp = corr.employee
        items.append({
            "type": "correction", "id": corr.id, "uid": f"correction:{corr.id}",
            "employee_id": corr.employee_id,
            "employee_name": emp.full_name if emp else "—",
            "department_name": emp.department.name if emp and emp.department else "—",
            "title": f"{emp.full_name if emp else 'Employee'} – Clock correction",
            "subtitle": f"{corr.work_date} · {corr.requested_clock_in or '—'} → {corr.requested_clock_out or '—'}",
            "detail": corr.reason or "Attendance time adjustment",
            "status": corr.status, "amount": None, "requested_at": conv(corr.created_at),
        })
    items.sort(key=lambda x: x["requested_at"] or "", reverse=True)
    return jsonify({"data": items})


@app.post("/api/v1/approvals/decide")
@login_required
def decide_approval():
    data = request.get_json(silent=True) or {}
    kind, rid, decision = data.get("type"), data.get("id"), data.get("decision")
    if decision not in ("approved", "rejected"):
        return error("Invalid decision", 422)
    if kind == "leave":
        return decide_leave(int(rid), decision)
    if kind == "expense":
        return decide_claim(int(rid), decision)
    if kind == "correction":
        if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer", "manager"):
            return error("Forbidden", 403)
        if decision == "approved":
            return approve_correction(int(rid))
        corr = db.session.get(AttendanceCorrection, int(rid))
        if not corr:
            return error("Not found", 404)
        corr.status = "rejected"
        db.session.commit()
        return jsonify({"data": serialize(corr, "corrections")})
    if kind == "loan":
        if role_of(request.user) not in ("super_admin", "hr_admin", "payroll"):
            return error("Forbidden", 403)
        loan = db.session.get(Loan, int(rid))
        if not loan:
            return error("Not found", 404)
        loan.status = "active" if decision == "approved" else "rejected"
        db.session.commit()
        return jsonify({"data": serialize(loan, "loans")})
    return error("Unknown approval type", 422)


@app.post("/api/v1/bulk-action")
@login_required
def bulk_action():
    data = request.get_json(silent=True) or {}
    entity = (data.get("entity") or "").strip()
    action = (data.get("action") or "").strip()
    ids = data.get("ids") or []
    value = data.get("value")
    if not entity or not action or not isinstance(ids, list) or not ids:
        return error("entity, action, and non-empty ids list are required", 422)
    role = role_of(request.user)
    processed = 0
    errors_count = 0

    if entity == "employees":
        if role not in ("super_admin", "hr_admin", "hr_officer"):
            return error("Forbidden", 403)
        for raw_id in ids:
            emp = db.session.get(Employee, int(raw_id))
            if not emp or emp.deleted_at is not None:
                continue
            if action == "set_work_location" and value in ("office", "hybrid", "remote"):
                emp.work_location = value
                processed += 1
            elif action == "set_status" and value in ("active", "probation", "on_leave", "suspended"):
                emp.status = value
                processed += 1
        audit(request.user, f"bulk_employees_{action}", "employees", None)
        db.session.commit()
    elif entity == "leave":
        if action not in ("approved", "rejected"):
            return error("Invalid leave bulk action", 422)
        for raw_id in ids:
            res = decide_leave(int(raw_id), action)
            status_code = res[1] if isinstance(res, tuple) else res.status_code
            if status_code < 400:
                processed += 1
            else:
                errors_count += 1
    elif entity == "expense":
        for raw_id in ids:
            if action in ("approved", "rejected"):
                res = decide_claim(int(raw_id), action)
            elif action == "paid":
                res = pay_claim(int(raw_id))
            else:
                return error("Invalid expense bulk action", 422)
            status_code = res[1] if isinstance(res, tuple) else res.status_code
            if status_code < 400:
                processed += 1
            else:
                errors_count += 1
    elif entity == "onboarding":
        if role not in ("super_admin", "hr_admin", "hr_officer", "manager"):
            return error("Forbidden", 403)
        for raw_id in ids:
            t = db.session.get(OnboardingTask, int(raw_id))
            if t and action in ("completed", "in_progress", "pending"):
                t.status = action
                processed += 1
        db.session.commit()
    elif entity == "approvals":
        if action not in ("approved", "rejected"):
            return error("Invalid approvals bulk action", 422)
        for uid in ids:
            if not isinstance(uid, str) or ":" not in uid:
                continue
            kind, rid = uid.split(":", 1)
            if kind == "leave":
                res = decide_leave(int(rid), action)
            elif kind == "expense":
                res = decide_claim(int(rid), action)
            elif kind == "correction":
                if role not in ("super_admin", "hr_admin", "hr_officer", "manager"):
                    errors_count += 1
                    continue
                if action == "approved":
                    res = approve_correction(int(rid))
                else:
                    corr = db.session.get(AttendanceCorrection, int(rid))
                    if corr:
                        corr.status = "rejected"
                        db.session.commit()
                        processed += 1
                    continue
            elif kind == "loan":
                if role not in ("super_admin", "hr_admin", "payroll"):
                    errors_count += 1
                    continue
                loan = db.session.get(Loan, int(rid))
                if loan:
                    loan.status = "active" if action == "approved" else "rejected"
                    db.session.commit()
                    processed += 1
                continue
            else:
                continue
            status_code = res[1] if isinstance(res, tuple) else res.status_code
            if status_code < 400:
                processed += 1
            else:
                errors_count += 1
    else:
        return error("Unsupported entity for bulk action", 422)

    return jsonify({"data": {"processed": processed, "skipped": errors_count}})


@app.post("/api/v1/notifications/<int:nid>/read")
@login_required
def read_notification(nid):
    n = db.session.get(Notification, nid)
    if not n or n.user_id != request.user.id:
        return error("Not found", 404)
    n.read_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"data": serialize(n, "notifications")})


@app.post("/api/v1/notifications/<int:nid>/unread")
@login_required
def unread_notification(nid):
    n = db.session.get(Notification, nid)
    if not n or n.user_id != request.user.id:
        return error("Not found", 404)
    n.read_at = None
    db.session.commit()
    return jsonify({"data": serialize(n, "notifications")})


@app.delete("/api/v1/notifications/<int:nid>")
@login_required
def remove_notification(nid):
    n = db.session.get(Notification, nid)
    if not n or n.user_id != request.user.id:
        return error("Not found", 404)
    db.session.delete(n)
    db.session.commit()
    return jsonify({"message": "Notification deleted"})


@app.delete("/api/v1/notifications/clear-read")
@login_required
def clear_read_notifications():
    deleted = Notification.query.filter(
        Notification.user_id == request.user.id,
        Notification.read_at.isnot(None),
    ).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({"data": {"deleted": deleted}})


@app.post("/api/v1/notifications/read-all")
@login_required
def read_all_notifications():
    Notification.query.filter_by(user_id=request.user.id, read_at=None).update(
        {"read_at": datetime.utcnow()})
    db.session.commit()
    return jsonify({"message": "All notifications marked read"})


@app.get("/api/v1/notifications/unread")
@login_required
def unread_count():
    rows = Notification.query.filter_by(user_id=request.user.id).all()
    unread = sum(1 for r in rows if r.read_at is None)
    by_cat = {}
    for r in rows:
        cat = (r.category or "General").title()
        by_cat[cat] = by_cat.get(cat, 0) + 1
    return jsonify({"data": {"count": unread, "total": len(rows), "by_category": by_cat}})


@app.get("/api/v1/notifications/preferences")
@login_required
def get_notification_preferences():
    prefs = messaging.user_preferences_all(request.user.id)
    return jsonify({"data": {
        "events": messaging.EVENT_CATALOG,
        "preferences": prefs,
        "routing": messaging.event_routing(),
        "status": messaging.status_summary(),
    }})


@app.put("/api/v1/notifications/preferences")
@login_required
def save_notification_preferences():
    if role_of(request.user) in READ_ONLY:
        return error("Auditor accounts are read-only", 403)
    data = request.get_json(silent=True) or {}
    prefs_in = data.get("preferences") or {}
    for ev_key, channels in prefs_in.items():
        if ev_key not in messaging.EVENT_MAP or not isinstance(channels, dict):
            continue
        row = NotificationPreference.query.filter_by(user_id=request.user.id, event_key=ev_key).first()
        if not row:
            row = NotificationPreference(user_id=request.user.id, event_key=ev_key)
            db.session.add(row)
        row.in_app = bool(channels.get("in_app", True))
        row.email = bool(channels.get("email", True))
        row.sms = bool(channels.get("sms", False))
    db.session.commit()
    return jsonify({"data": messaging.user_preferences_all(request.user.id)})


@app.post("/api/v1/notifications/test-self")
@login_required
def send_self_test_notification():
    data = request.get_json(silent=True) or {}
    channels = {
        "in_app": bool(data.get("in_app", True)),
        "email": bool(data.get("email", True)),
        "sms": bool(data.get("sms", False)),
    }
    counts = dispatch_event(
        "announcement", [request.user],
        "Test notification from Meridian HR",
        "Your notification channels are active and routed to your account.",
        "/notifications",
        channels=channels,
        badge="Channel Test",
    )
    db.session.commit()
    return jsonify({"data": counts})


# ---------------------------------------------------------------- messaging, email & sms config

@app.get("/api/v1/messaging/status")
@login_required
def messaging_status():
    return jsonify({"data": messaging.status_summary()})


@app.get("/api/v1/messaging/config")
@login_required
def get_messaging_config():
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    return jsonify({"data": {
        "config": messaging.public_config(),
        "events": messaging.EVENT_CATALOG,
        "routing": messaging.event_routing(),
    }})


@app.put("/api/v1/messaging/config")
@login_required
def save_messaging_config():
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    updated_keys = []
    for key in messaging.CONFIG_KEYS:
        if key not in data:
            continue
        val = data[key]
        if key in messaging.SECRET_KEYS and (val is None or val == ""):
            if not data.get("clear_" + key):
                continue
            val = ""
        if isinstance(val, bool):
            val = "1" if val else "0"
        else:
            val = "" if val is None else str(val).strip()
        full_key = "delivery." + key
        row = Setting.query.filter_by(key=full_key).first()
        if not row:
            row = Setting(key=full_key, group_name="delivery")
            db.session.add(row)
        row.value = val
        updated_keys.append(key)
    audit(request.user, "messaging_config_updated", "settings", 0, new={"keys": updated_keys})
    db.session.commit()
    return jsonify({"data": messaging.public_config()})


@app.get("/api/v1/messaging/routing")
@login_required
def get_messaging_routing():
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    return jsonify({"data": {
        "events": messaging.EVENT_CATALOG,
        "routing": messaging.event_routing(),
    }})


@app.put("/api/v1/messaging/routing")
@login_required
def save_messaging_routing():
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    routing_in = data.get("routing") or {}
    merged = messaging.event_routing()
    for ev_key, ch in routing_in.items():
        if ev_key in messaging.EVENT_MAP and isinstance(ch, dict):
            merged[ev_key] = {
                "in_app": bool(ch.get("in_app", True)),
                "email": bool(ch.get("email", True)),
                "sms": bool(ch.get("sms", False)),
            }
    row = Setting.query.filter_by(key="delivery.event_routing").first()
    if not row:
        row = Setting(key="delivery.event_routing", group_name="delivery")
        db.session.add(row)
    row.value = json.dumps(merged)
    audit(request.user, "event_routing_updated", "settings", row.id or 0)
    db.session.commit()
    return jsonify({"data": merged})


@app.post("/api/v1/messaging/test-email")
@login_required
def test_email_gateway():
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    to_email = (data.get("to") or request.user.email or "").strip()
    subject = data.get("subject") or "Gateway Verification Test"
    body = data.get("body") or "This is a test email from Meridian HR confirming your SMTP / Sandbox email configuration."
    html_doc = messaging.html_email(
        subject, body, public_app_link("/settings"),
        meta_rows=[("Initiated by", request.user.email), ("Mode", messaging.config().get("email_mode", "smtp").upper())],
        badge="Gateway Test",
    )
    res = messaging.send_email(to_email, subject, body, html_doc)
    _record_delivery(res, request.user, "test_email", "email", to_email, subject, body=body)
    db.session.commit()
    if not res.get("ok"):
        return error(res.get("error") or "Email test failed", 422)
    return jsonify({"data": res})


@app.post("/api/v1/messaging/test-sms")
@login_required
def test_sms_gateway():
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    emp = employee_of(request.user)
    to_number = (data.get("to") or (emp.phone if emp else "") or "").strip()
    body = data.get("body") or "Test SMS confirming your Meridian HR SMS gateway is active."
    res = messaging.send_sms(to_number, body)
    _record_delivery(res, request.user, "test_sms", "sms", to_number, "SMS Gateway Test", body=body)
    db.session.commit()
    if not res.get("ok"):
        return error(res.get("error") or "SMS test failed", 422)
    return jsonify({"data": res})


@app.get("/api/v1/messaging/deliveries")
@login_required
def list_deliveries():
    role = role_of(request.user)
    q = NotificationDelivery.query
    if role not in ("super_admin", "hr_admin", "hr_officer", "auditor"):
        q = q.filter(NotificationDelivery.user_id == request.user.id)
    channel = (request.args.get("channel") or "").strip()
    status = (request.args.get("status") or "").strip()
    event_key = (request.args.get("event_key") or "").strip()
    if channel:
        q = q.filter(NotificationDelivery.channel == channel)
    if status:
        q = q.filter(NotificationDelivery.status == status)
    if event_key:
        q = q.filter(NotificationDelivery.event_key == event_key)
    limit = min(max(int(request.args.get("per_page", 60)), 1), 200)
    rows = q.order_by(NotificationDelivery.id.desc()).limit(limit).all()
    items = []
    for r in rows:
        d = serialize(r)
        if r.user_id:
            u = db.session.get(User, r.user_id)
            d["recipient_name"] = u.employee.full_name if u and u.employee else (u.email if u else None)
        items.append(d)
    summary = {
        "total": q.count(),
        "sent": q.filter(NotificationDelivery.status.in_(["sent", "simulated"])).count(),
        "failed": q.filter(NotificationDelivery.status.in_(["failed", "disabled"])).count(),
        "email": q.filter(NotificationDelivery.channel == "email").count(),
        "sms": q.filter(NotificationDelivery.channel == "sms").count(),
    }
    return jsonify({"data": items, "summary": summary})


@app.post("/api/v1/messaging/deliveries/<int:did>/retry")
@login_required
def retry_delivery(did):
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    rec = db.session.get(NotificationDelivery, did)
    if not rec:
        return error("Not found", 404)
    body = rec.body or rec.subject or "Meridian HR notification"
    if rec.channel == "email":
        res = messaging.send_email(
            rec.recipient, rec.subject or "Meridian HR Notification", body,
            messaging.html_email(rec.subject or "Notification", body, public_app_link("/notifications")),
        )
    else:
        res = messaging.send_sms(rec.recipient, body)
    rec.status = res.get("status", "failed")
    rec.error = res.get("error")
    rec.provider_ref = res.get("ref") or rec.provider_ref
    if res.get("ok"):
        rec.sent_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"data": serialize(rec)})


# ---------------------------------------------------------------- company & platform settings

@app.get("/api/v1/settings/company")
@login_required
def get_company_settings():
    comp = Company.query.first()
    general_rows = Setting.query.filter(Setting.group_name != "delivery").order_by(Setting.group_name, Setting.key).all()
    kv = {r.key: r.value for r in general_rows}
    return jsonify({"data": {
        "company": serialize(comp, "companies") if comp else {},
        "platform": kv,
        "rows": [serialize(r, "settings") for r in general_rows],
    }})


@app.put("/api/v1/settings/company")
@login_required
def update_company_settings():
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    comp_in = data.get("company") or {}
    plat_in = data.get("platform") or {}
    comp = Company.query.first()
    if not comp:
        comp = Company(name=comp_in.get("name") or "Meridian Ghana Ltd")
        db.session.add(comp)
    for k in ("name", "legal_name", "country", "city", "location_name", "tagline", "currency", "timezone", "address",
              "phone", "email", "tax_id", "logo_url", "favicon_url", "theme", "website"):
        if k in comp_in:
            setattr(comp, k, comp_in[k])
    group_map = {
        "employee_no_format": "hr", "probation_months": "hr",
        "work_week": "attendance", "grace_minutes": "attendance",
        "default_currency": "payroll", "ssnit_employee_rate": "payroll", "ssnit_employer_rate": "payroll",
        "company_name": "branding", "brand_primary": "branding",
    }
    for k, val in plat_in.items():
        if k.startswith("delivery."):
            continue
        row = Setting.query.filter_by(key=k).first()
        if not row:
            row = Setting(key=k, group_name=group_map.get(k, "general"))
            db.session.add(row)
        row.value = "" if val is None else str(val)
    if "name" in comp_in:
        cn = Setting.query.filter_by(key="company_name").first()
        if cn:
            cn.value = comp.name
    audit(request.user, "company_settings_updated", "companies", comp.id or 1)
    db.session.commit()
    return get_company_settings()


# ---------------------------------------------------------------- announcements broadcast & company events

@app.post("/api/v1/announcements/<int:aid>/broadcast")
@login_required
def broadcast_announcement(aid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    ann = db.session.get(Announcement, aid)
    if not ann:
        return error("Not found", 404)
    data = request.get_json(silent=True) or {}
    counts = deliver_announcement(ann, data)
    audit(request.user, "announcement_broadcast", "announcements", ann.id, new=counts)
    db.session.commit()
    return jsonify({"data": counts})


def serialize_event(ev, current_emp_id=None):
    d = serialize(ev)
    if ev.organizer_id:
        u = db.session.get(User, ev.organizer_id)
        d["organizer_name"] = u.employee.full_name if u and u.employee else (u.email if u else "HR Team")
    else:
        d["organizer_name"] = "HR Team"
    if ev.department_id:
        dept = db.session.get(Department, ev.department_id)
        d["department_name"] = dept.name if dept else None
    if ev.branch_id:
        br = db.session.get(Branch, ev.branch_id)
        d["branch_name"] = br.name if br else None
    rsvps = EventRsvp.query.filter_by(event_id=ev.id).all()
    going_ids = [r.employee_id for r in rsvps if r.status == "going"]
    maybe_ids = [r.employee_id for r in rsvps if r.status == "maybe"]
    going_names = []
    for eid in going_ids[:6]:
        emp = db.session.get(Employee, eid)
        if emp:
            going_names.append(emp.full_name)
    my_rsvp = None
    if current_emp_id:
        mine = next((r for r in rsvps if r.employee_id == current_emp_id), None)
        my_rsvp = mine.status if mine else None
    d["rsvp"] = {
        "going": len(going_ids),
        "maybe": len(maybe_ids),
        "declined": sum(1 for r in rsvps if r.status == "declined"),
        "going_names": going_names,
        "my_status": my_rsvp,
    }
    dels = NotificationDelivery.query.filter_by(event_id=ev.id).all()
    d["deliveries"] = {
        "email_sent": sum(1 for x in dels if x.channel == "email" and x.status in ("sent", "simulated")),
        "sms_sent": sum(1 for x in dels if x.channel == "sms" and x.status in ("sent", "simulated")),
        "failed": sum(1 for x in dels if x.status in ("failed", "disabled")),
        "total": len(dels),
    }
    return d


@app.get("/api/v1/events")
@login_required
def list_company_events():
    rows = CompanyEvent.query.order_by(CompanyEvent.start_at.asc()).all()
    emp_id = request.user.employee_id
    return jsonify({"data": [serialize_event(ev, emp_id) for ev in rows]})


@app.post("/api/v1/events")
@login_required
def create_company_event():
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    if not data.get("title") or not data.get("start_at"):
        return error("Title and start date/time are required", 422)
    try:
        fields = writable_fields(CompanyEvent, data)
    except ValueError as e:
        return error(str(e), 422)
    fields.setdefault("organizer_id", request.user.id)
    fields.setdefault("status", "scheduled")
    ev = CompanyEvent(**fields)
    db.session.add(ev)
    db.session.flush()
    delivery = None
    if data.get("dispatch_now", True):
        delivery = deliver_company_event(ev, data, is_reminder=False)
    audit(request.user, "create", "events", ev.id, new={"title": ev.title})
    db.session.commit()
    out = serialize_event(ev, request.user.employee_id)
    if delivery:
        out["delivery"] = delivery
    return jsonify({"data": out}), 201


@app.put("/api/v1/events/<int:evid>")
@login_required
def update_company_event(evid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    ev = db.session.get(CompanyEvent, evid)
    if not ev:
        return error("Not found", 404)
    data = request.get_json(silent=True) or {}
    try:
        fields = writable_fields(CompanyEvent, data)
    except ValueError as e:
        return error(str(e), 422)
    for k, v in fields.items():
        setattr(ev, k, v)
    delivery = None
    if data.get("notify_update"):
        delivery = deliver_company_event(ev, data, is_reminder=False)
    audit(request.user, "update", "events", ev.id)
    db.session.commit()
    out = serialize_event(ev, request.user.employee_id)
    if delivery:
        out["delivery"] = delivery
    return jsonify({"data": out})


@app.delete("/api/v1/events/<int:evid>")
@login_required
def delete_company_event(evid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    ev = db.session.get(CompanyEvent, evid)
    if not ev:
        return error("Not found", 404)
    EventRsvp.query.filter_by(event_id=evid).delete()
    db.session.delete(ev)
    audit(request.user, "delete", "events", evid)
    db.session.commit()
    return jsonify({"message": "Event deleted"})


@app.post("/api/v1/events/<int:evid>/rsvp")
@login_required
def rsvp_company_event(evid):
    ev = db.session.get(CompanyEvent, evid)
    if not ev:
        return error("Not found", 404)
    if not request.user.employee_id:
        return error("No employee record linked to this account", 409)
    status = ((request.get_json(silent=True) or {}).get("status") or "going").lower()
    if status not in ("going", "maybe", "declined"):
        return error("Invalid RSVP status", 422)
    row = EventRsvp.query.filter_by(event_id=evid, employee_id=request.user.employee_id).first()
    if not row:
        row = EventRsvp(event_id=evid, employee_id=request.user.employee_id)
        db.session.add(row)
    row.status = status
    db.session.commit()
    return jsonify({"data": serialize_event(ev, request.user.employee_id)})


@app.post("/api/v1/events/<int:evid>/notify")
@login_required
def notify_company_event(evid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    ev = db.session.get(CompanyEvent, evid)
    if not ev:
        return error("Not found", 404)
    data = request.get_json(silent=True) or {}
    is_rem = bool(data.get("is_reminder", True))
    counts = deliver_company_event(ev, data, is_reminder=is_rem)
    if is_rem:
        ev.last_reminded_at = datetime.utcnow()
    audit(request.user, "event_broadcast", "events", ev.id, new=counts)
    db.session.commit()
    return jsonify({"data": counts})


@app.post("/api/v1/policies/<int:pid>/acknowledge")
@login_required
def acknowledge_policy(pid):
    policy = db.session.get(Policy, pid)
    if not policy:
        return error("Not found", 404)
    if not request.user.employee_id:
        return error("No employee record linked to this account", 409)
    existing = PolicyAck.query.filter_by(policy_id=pid, employee_id=request.user.employee_id).first()
    if not existing:
        db.session.add(PolicyAck(policy_id=pid, employee_id=request.user.employee_id))
        db.session.commit()
    return jsonify({"message": "Policy acknowledged"})


@app.get("/api/v1/policies/<int:pid>/acks")
@login_required
def policy_acks(pid):
    acks = PolicyAck.query.filter_by(policy_id=pid).all()
    return jsonify({"data": {"count": len(acks), "employee_ids": [a.employee_id for a in acks]}})


@app.get("/api/v1/org-chart")
@login_required
def org_chart():
    employees = Employee.query.filter(Employee.deleted_at.is_(None), Employee.status == "active").all()
    nodes = {}
    for e in employees:
        nodes[e.id] = {"id": e.id, "name": e.full_name, "title": e.designation.title if e.designation else "",
                       "department": e.department.name if e.department else "", "manager_id": e.manager_id,
                       "children": []}
    roots = []
    for e in employees:
        node = nodes[e.id]
        if e.manager_id and e.manager_id in nodes and e.manager_id != e.id:
            nodes[e.manager_id]["children"].append(node)
        else:
            roots.append(node)
    return jsonify({"data": roots})


@app.get("/api/v1/meta")
@login_required
def meta():
    company = Company.query.first()
    comp_data = {}
    if company:
        for fld in ("id", "name", "legal_name", "city", "location_name", "tagline", "country",
                    "currency", "timezone", "address", "phone", "email", "tax_id",
                    "logo_url", "favicon_url", "theme", "website"):
            comp_data[fld] = getattr(company, fld)
    return jsonify({"data": {
        "company": comp_data,
        "departments": [{"id": d.id, "name": d.name} for d in Department.query.order_by(Department.name)],
        "designations": [{"id": d.id, "title": d.title, "department_id": d.department_id}
                         for d in Designation.query.order_by(Designation.title)],
        "grades": [{"id": g.id, "name": g.name} for g in Grade.query.order_by(Grade.level)],
        "branches": [{"id": b.id, "name": b.name} for b in Branch.query.order_by(Branch.name)],
        "employees": [{"id": e.id, "name": e.full_name, "employee_no": e.employee_no}
                      for e in Employee.query.filter(Employee.deleted_at.is_(None), Employee.status == "active")
                      .order_by(Employee.first_name)],
        "roles": [{"id": r.id, "name": r.name, "slug": r.slug} for r in Role.query.order_by(Role.id)],
        "leave_types": [{"id": t.id, "name": t.name, "color": t.color, "paid": t.paid}
                        for t in LeaveType.query.all()],
        "expense_categories": [{"id": c.id, "name": c.name} for c in ExpenseCategory.query.all()],
        "shifts": [{"id": s.id, "name": s.name} for s in Shift.query.all()],
        "assets": [{"id": a.id, "name": a.name, "tag": a.tag, "status": a.status}
                   for a in Asset.query.order_by(Asset.name)],
        "tax_bands": [serialize(t) for t in TaxBand.query.order_by(TaxBand.min_amount)],
    }})


# ---------------------------------------------------------------- pages

@app.get("/")
def index():
    return render_template("index.html")


@app.get("/app")
@app.get("/app/<path:path>")
def spa(path=None):
    return render_template("index.html")


@app.get("/api/v1/brand")
def public_brand():
    comp = Company.query.first()
    out = {
        "name": comp.name if comp else "Meridian HR",
        "tagline": (comp.tagline if comp else None) or "People operations",
        "city": (comp.city if comp else None) or "Accra",
        "location_name": (comp.location_name if comp else None) or "Accra HQ",
        "logo_url": comp.logo_url if comp else None,
        "favicon_url": comp.favicon_url if comp else None,
        "theme": comp.theme if comp else "meridian",
        "accent": "#c2703d",
        "teal": "#0f766e",
    }
    return jsonify({"data": out})


@app.get("/health")
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat()})


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return error("Not found", 404)
    return render_template("index.html")


@app.errorhandler(413)
def too_large(e):
    return error("File too large (max 20 MB)", 413)


@app.errorhandler(500)
def server_error(e):
    db.session.rollback()
    return error("An unexpected error occurred", 500)


bootstrap_database()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
