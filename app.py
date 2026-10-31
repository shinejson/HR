import hr_crud
import os
import re
import json
import secrets
import csv
import io
import base64
import hashlib
import sqlite3
from html import escape as html_escape
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps

from urllib.parse import quote as url_quote
from flask import Flask, request, jsonify, render_template, send_file, send_from_directory, abort
from flask_cors import CORS
from sqlalchemy import or_, func, false, text, inspect as sqla_inspect
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

from models import (
    db, Role, User, Company, BrandingAsset, Branch, Department, Designation, Grade, Employee,
    EmployeeContact, Dependant, BankAccount, EmploymentHistory, EmployeeSkill,
    EmployeeEducation, Contract, Document, EmploymentLetter, Policy, PolicyAck, JobRequisition,
    JobPosting, Candidate, Application, Interview, OnboardingTemplate, OnboardingTask,
    Offboarding, Shift, Attendance, AttendanceCorrection, LeaveType, LeaveBalance,
    LeaveRequest, Holiday, SalaryComponent, SalaryStructure, TaxBand, PayrollRun,
    Payslip, PayslipItem, Loan, Goal, AppraisalCycle, Appraisal, Training,
    TrainingEnrolment, ExpenseCategory, ExpenseClaim, Asset, AssetAssignment,
    Ticket, TicketComment, Announcement, CompanyEvent, EventRsvp, Notification,
    NotificationPreference, NotificationDelivery, Approval, AuditLog, Setting,
    LoginHistory, DatabaseBackup,
    HotelInventoryItem, HotelStockMovement, HotelWorkOrder,
    HotelStoreroom, HotelStoreroomSection, MaintenanceWork,
)
import models
import messaging
import letters
import hotel_ops
from seed import seed, _paye

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
BRANDING_UPLOAD_DIR = os.path.join(UPLOADS_DIR, "branding")
MAX_BRANDING_BYTES = 5 * 1024 * 1024

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(BASE_DIR, "instance", "hrms.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JSON_SORT_KEYS"] = False
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
os.makedirs(os.path.join(BASE_DIR, "instance"), exist_ok=True)
os.makedirs(BRANDING_UPLOAD_DIR, exist_ok=True)

db.init_app(app)
CORS(app)


def ensure_schema():
    """Add columns introduced after the first database was created."""
    insp = sqla_inspect(db.engine)
    tables = set(insp.get_table_names())
    alterations = {
        "users": [
            ("username", "VARCHAR(80)"),
            ("last_activity_at", "DATETIME"),
        ],
        "employees": [
            ("bio", "TEXT"),
            ("personal_email", "VARCHAR(180)"),
            ("blood_group", "VARCHAR(10)"),
            ("linkedin_url", "VARCHAR(255)"),
            ("work_location", "VARCHAR(80) DEFAULT 'Office'"),
            ("end_date", "DATE"),
            ("staff_category", "VARCHAR(60) DEFAULT 'General Staff'"),
            ("hod_id", "INTEGER"),
            ("accountant_id", "INTEGER"),
            ("md_id", "INTEGER"),
            ("signature_url", "VARCHAR(255)"),
        ],
        "leave_balances": [
            ("carried_over", "NUMERIC(6,2) DEFAULT 0"),
        ],
        "leave_requests": [
            ("hod_approved_at", "DATETIME"),
            ("hod_approved_by", "INTEGER"),
            ("accountant_approved_at", "DATETIME"),
            ("accountant_approved_by", "INTEGER"),
            ("md_approved_at", "DATETIME"),
            ("md_approved_by", "INTEGER"),
            ("employee_signature", "VARCHAR(255)"),
            ("hod_signature", "VARCHAR(255)"),
            ("accountant_signature", "VARCHAR(255)"),
            ("md_signature", "VARCHAR(255)"),
            ("resumption_date", "DATE"),
            ("leave_already_taken", "NUMERIC(6,2) DEFAULT 0"),
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
            ("html_body", "TEXT"),
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
    routing_row = Setting.query.filter_by(key="delivery.event_routing").first()
    if not routing_row:
        db.session.add(Setting(key="delivery.event_routing",
                               value=json.dumps(messaging.DEFAULT_ROUTING), group_name="delivery"))
    else:
        try:
            saved = json.loads(routing_row.value or "{}")
        except ValueError:
            saved = {}
        updated = False
        for k, v in messaging.DEFAULT_ROUTING.items():
            if k not in saved:
                saved[k] = dict(v)
                updated = True
        if updated:
            routing_row.value = json.dumps(saved)
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
        slug_first = re.sub(r"[^a-z0-9]+", ".", (emp.first_name or "").lower()).strip(".") or "staff"
        slug_last = re.sub(r"[^a-z0-9]+", ".", (emp.last_name or "").lower()).strip(".") or "member"
        if not emp.personal_email or " " in emp.personal_email:
            emp.personal_email = f"{slug_first}.{slug_last}@gmail.com"
            changed = True
        if not emp.work_location or emp.work_location == "Office":
            emp.work_location = work_locs[idx % len(work_locs)]
            changed = True
        if not emp.linkedin_url or " " in emp.linkedin_url:
            emp.linkedin_url = f"https://linkedin.com/in/{slug_first.replace('.', '-')}-{slug_last.replace('.', '-')}"
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

    # Ensure every existing user has a clean unique username
    for u in User.query.filter(User.deleted_at.is_(None)).order_by(User.id.asc()).all():
        if not u.username:
            u.username = generate_unique_username(emp=u.employee, email=u.email, exclude_user_id=u.id)
            changed = True

    # Ensure every active/probation employee has staff_category, contract, employment letter, and user account
    for emp in employees:
        inferred_sc = letters.infer_staff_category(emp)
        if not emp.staff_category or emp.staff_category == "General Staff":
            emp.staff_category = inferred_sc
            changed = True
            let_existing = EmploymentLetter.query.filter_by(employee_id=emp.id).first()
            if let_existing and (not let_existing.staff_category or let_existing.staff_category == "General Staff"):
                let_existing.staff_category = inferred_sc
        existing_user = User.query.filter_by(employee_id=emp.id).first()
        if not existing_user and (emp.email or emp.personal_email):
            init_pw = f"Awh@2026#{emp.id:02d}"
            provision_employee_onboarding(
                emp,
                data={"password": init_pw, "must_change_password": True},
                portal_base="http://localhost:5000",
                send_email_flag=True,
            )
            changed = True
        else:
            if not Contract.query.filter_by(employee_id=emp.id).first():
                db.session.add(Contract(
                    employee_id=emp.id,
                    type=emp.contract_type or "permanent",
                    start_date=emp.hire_date or date.today(),
                    end_date=emp.end_date,
                    status="active",
                ))
                changed = True
            letter_obj = letters.ensure_letter_for_employee(emp)
            if not Document.query.filter_by(employee_id=emp.id, category="employment_letter").first():
                tpl = letters.get_merged_templates().get(letter_obj.category_key, {})
                db.session.add(Document(
                    employee_id=emp.id,
                    category="employment_letter",
                    title=f"{tpl.get('letter_title', 'Employment Letter').title()} ({letter_obj.reference_no})",
                    file_name=f"{emp.employee_no}-{letter_obj.category_key}-letter.pdf",
                    notes=f"Official {tpl.get('label', emp.contract_type)} appointment letter",
                ))
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
        hotel_ops.seed_hotel_operations(db, models)


READ_ONLY = {"auditor"}

READ_PERMS = {
    "users": {"super_admin", "hr_admin"},
    "hotel-inventory": {"super_admin", "hr_admin", "operations_manager", "operations_officer", "hotel_manager", "manager", "employee", "auditor"},
    "hotel-work-orders": {"super_admin", "hr_admin", "operations_manager", "operations_officer", "hotel_manager", "manager", "employee", "auditor"},
    "hotel-stock-movements": {"super_admin", "hr_admin", "operations_manager", "operations_officer", "hotel_manager", "auditor"},
    "roles": {"super_admin", "hr_admin"},
    "settings": {"super_admin", "hr_admin"},
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
    "assets": {"super_admin", "hr_admin", "hr_officer", "operations_manager", "operations_officer", "hotel_manager", "manager", "employee", "auditor"},
    "asset-assignments": {"super_admin", "hr_admin", "hr_officer", "operations_manager", "operations_officer", "hotel_manager", "manager", "employee", "auditor"},
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
    "hotel-inventory": {"super_admin", "hr_admin", "operations_manager", "operations_officer", "hotel_manager"},
    "hotel-work-orders": {"super_admin", "hr_admin", "operations_manager", "operations_officer", "hotel_manager", "manager", "employee"},
    "hotel-stock-movements": {"super_admin", "hr_admin", "operations_manager", "operations_officer", "hotel_manager"},
    "departments": {"super_admin", "hr_admin", "hr_officer"},
    "designations": {"super_admin", "hr_admin", "hr_officer"},
    "grades": {"super_admin", "hr_admin"},
    "branches": {"super_admin", "hr_admin"},
    "companies": {"super_admin", "hr_admin"},
    "users": {"super_admin", "hr_admin"},
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
    "assets": {"super_admin", "hr_admin", "hr_officer", "operations_manager", "operations_officer", "hotel_manager"},
    "asset-assignments": {"super_admin", "hr_admin", "hr_officer", "operations_manager", "operations_officer", "hotel_manager"},
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


SESSION_TIMEOUT_MINUTES = 30


def auth_user():
    header = request.headers.get("Authorization", "")
    token = header.split(" ", 1)[1].strip() if header.lower().startswith("bearer ") else None
    token = token or request.args.get("token")
    if not token:
        return None
    user = User.query.filter_by(token=token, status="active").first()
    if not user or user.deleted_at is not None:
        return None
    if user.employee_id:
        emp = db.session.get(Employee, user.employee_id)
        if not emp or emp.deleted_at is not None or emp.status not in ("active", "probation"):
            user.token = None
            user.token_expires_at = None
            user.status = "inactive"
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()
            return None
    now = datetime.utcnow()
    if user.token_expires_at and user.token_expires_at < now:
        user.token = None
        user.token_expires_at = None
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
        return None

    threshold = now + timedelta(minutes=SESSION_TIMEOUT_MINUTES - 1)
    if not user.token_expires_at or user.token_expires_at < threshold:
        user.token_expires_at = now + timedelta(minutes=SESSION_TIMEOUT_MINUTES)
        user.last_activity_at = now
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
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


def public_app_link(link, base_override=None):
    if base_override:
        base = base_override.rstrip("/")
    else:
        try:
            host = request.headers.get("X-Forwarded-Host") or request.host
            scheme = request.headers.get("X-Forwarded-Proto") or request.scheme
            base = f"{scheme}://{host}"
        except RuntimeError:
            base = os.environ.get("PUBLIC_APP_URL", "http://localhost:5000").rstrip("/")
    if link.startswith("/app"):
        path = link[4:] or "/"
    elif link.startswith("/"):
        path = link
    else:
        path = "/" + link
    return f"{base}/#{path}"


def _record_delivery(result, user, event_key, channel, recipient, subject,
                     body=None, html_body=None, notification_id=None, announcement_id=None, event_id=None):
    rec = NotificationDelivery(
        notification_id=notification_id, announcement_id=announcement_id, event_id=event_id,
        user_id=user.id if user else None, event_key=event_key, channel=channel,
        recipient=recipient, subject=(subject or "")[:255], body=body, html_body=html_body,
        status=result.get("status", "failed"),
        error=result.get("error"), provider_ref=result.get("ref"),
        sent_at=datetime.utcnow() if result.get("ok") else None,
    )
    db.session.add(rec)
    db.session.flush()
    return rec


_VALID_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clean_username_token(raw):
    raw_str = (raw or "").strip().lower()
    if "@" in raw_str:
        raw_str = raw_str.split("@", 1)[0]
    cleaned = re.sub(r"[^a-z0-9._-]+", "", raw_str)
    cleaned = re.sub(r"[._-]{2,}", ".", cleaned).strip("._-")
    return cleaned[:60]


def generate_unique_username(emp=None, email=None, preferred=None, exclude_user_id=None):
    candidates = []
    if preferred:
        candidates.append(_clean_username_token(preferred))
    if emp:
        first_tok = _clean_username_token((emp.first_name or "").split()[0] if emp.first_name else "")
        last_tok = _clean_username_token((emp.last_name or "").split()[-1] if emp.last_name else "")
        if first_tok and last_tok:
            candidates.append(f"{first_tok}.{last_tok}")
            candidates.append(f"{first_tok[0]}{last_tok}")
    raw_mail = email or (emp.email if emp else "") or ""
    if "@" in raw_mail:
        candidates.append(_clean_username_token(raw_mail.split("@", 1)[0]))
    if emp and emp.employee_no:
        candidates.append(_clean_username_token(emp.employee_no))
    base = next((c for c in candidates if len(c) >= 3), "staff.user")
    attempt = base
    n = 2
    while True:
        q = User.query.filter(func.lower(User.username) == attempt.lower())
        if exclude_user_id:
            q = q.filter(User.id != exclude_user_id)
        if not q.first():
            return attempt
        attempt = f"{base}{n}"
        n += 1


def generate_temp_password(comp=None):
    comp = comp or Company.query.first()
    prefix = "".join(ch for ch in (comp.name if comp and comp.name else "Mhr") if ch.isalpha())[:3].capitalize() or "Mhr"
    alphabet_digits = "23456789"
    alphabet_upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    digits = "".join(secrets.choice(alphabet_digits) for _ in range(4))
    tail = "".join(secrets.choice(alphabet_upper) for _ in range(2))
    return f"{prefix}@{digits}{tail}"


def provision_employee_onboarding(emp, data=None, actor=None, portal_base=None,
                                  reset_existing=False, send_email_flag=True):
    """Create or update portal login account, employment letter, contract & dispatch welcome email."""
    data = data or {}
    comp = Company.query.first()
    company_name = (comp.name if comp and comp.name else "Meridian HR").strip()
    company_legal = (comp.legal_name if comp and comp.legal_name else company_name).strip()

    if not emp.staff_category:
        emp.staff_category = letters.infer_staff_category(emp)

    # Ensure Contract record exists
    contract = Contract.query.filter_by(employee_id=emp.id).order_by(Contract.id.desc()).first()
    if not contract:
        contract = Contract(
            employee_id=emp.id,
            type=emp.contract_type or "permanent",
            start_date=emp.hire_date or date.today(),
            end_date=emp.end_date,
            status="active",
        )
        db.session.add(contract)
    else:
        contract.type = emp.contract_type or contract.type
        if emp.end_date:
            contract.end_date = emp.end_date

    # Ensure Employment Letter + Document Vault entry exist
    letter_obj = letters.ensure_letter_for_employee(emp, sync_category=True)
    tpl = letters.get_merged_templates().get(letter_obj.category_key, {})
    cat_label = tpl.get("label", (emp.contract_type or "Permanent").replace("_", " ").title())
    doc_entry = Document.query.filter_by(employee_id=emp.id, category="employment_letter").first()
    doc_title = f"{tpl.get('letter_title', 'Employment Letter').title()} ({letter_obj.reference_no})"
    if not doc_entry:
        db.session.add(Document(
            employee_id=emp.id,
            category="employment_letter",
            title=doc_title,
            file_name=f"{emp.employee_no}-{letter_obj.category_key}-letter.pdf",
            notes=f"Official {cat_label} appointment letter ({emp.staff_category})",
            uploaded_by=actor.id if actor else None,
        ))
    else:
        doc_entry.title = doc_title

    # Ensure initial EmploymentHistory hired entry exists
    if EmploymentHistory.query.filter_by(employee_id=emp.id).count() == 0:
        role_desc = emp.designation.title if emp.designation else "Staff Member"
        dept_desc = emp.department.name if emp.department else "General"
        db.session.add(EmploymentHistory(
            employee_id=emp.id,
            effective_date=emp.hire_date or date.today(),
            event_type="hired",
            to_value=f"{role_desc} · {dept_desc}",
            notes=f"Appointed under {cat_label} ({emp.staff_category})",
        ))

    # Ensure standard leave balances exist for current year
    yr = date.today().year
    for lt in LeaveType.query.all():
        if not LeaveBalance.query.filter_by(employee_id=emp.id, leave_type_id=lt.id, year=yr).first():
            db.session.add(LeaveBalance(
                employee_id=emp.id, leave_type_id=lt.id, year=yr,
                entitled=lt.days_per_year or 0, taken=0, pending=0,
            ))

    # Determine whether to create/update User login account
    create_account = data.get("create_account")
    if create_account is None:
        create_account = True
    else:
        create_account = str(create_account).lower() not in ("0", "false", "no", "off")

    login_email = (emp.email or emp.personal_email or "").strip().lower()
    if not create_account or not login_email:
        return {
            "account_created": False,
            "email_sent": False,
            "reason": "Account creation skipped or no email address provided",
            "letter_reference": letter_obj.reference_no,
            "category_label": cat_label,
        }

    linked_user = User.query.filter_by(employee_id=emp.id).first()
    if not linked_user:
        linked_user = User.query.filter(func.lower(User.email) == login_email).first()

    role_id = data.get("role_id")
    if role_id:
        role_obj = db.session.get(Role, int(role_id))
    elif data.get("role_slug"):
        role_obj = Role.query.filter_by(slug=data["role_slug"]).first()
    else:
        role_obj = None
    if not role_obj:
        role_obj = Role.query.filter_by(slug="employee").first()

    supplied_password = (data.get("password") or "").strip()
    plain_password = None
    account_created = False

    if not linked_user:
        plain_password = supplied_password or generate_temp_password(comp)
        uname = generate_unique_username(emp=emp, email=login_email, preferred=data.get("username"))
        must_change = data.get("must_change_password")
        if must_change is None:
            must_change = True
        else:
            must_change = str(must_change).lower() not in ("0", "false", "no", "off")
        linked_user = User(
            username=uname,
            email=login_email,
            password_hash=generate_password_hash(plain_password),
            employee_id=emp.id,
            role_id=role_obj.id if role_obj else 7,
            status="active",
            must_change_password=bool(must_change),
        )
        db.session.add(linked_user)
        db.session.flush()
        account_created = True
    else:
        linked_user.deleted_at = None
        linked_user.employee_id = emp.id
        linked_user.status = "active"
        if not linked_user.username or data.get("username"):
            linked_user.username = generate_unique_username(
                emp=emp, email=login_email,
                preferred=data.get("username") or linked_user.username,
                exclude_user_id=linked_user.id,
            )
        if login_email and linked_user.email.lower() != login_email:
            clash = User.query.filter(func.lower(User.email) == login_email, User.id != linked_user.id).first()
            if not clash:
                linked_user.email = login_email
        if role_id and role_obj:
            linked_user.role_id = role_obj.id
        if reset_existing or supplied_password:
            plain_password = supplied_password or generate_temp_password(comp)
            linked_user.password_hash = generate_password_hash(plain_password)
            linked_user.failed_attempts = 0
            linked_user.locked_until = None
            must_change = data.get("must_change_password")
            linked_user.must_change_password = True if must_change is None else (
                str(must_change).lower() not in ("0", "false", "no", "off")
            )
            db.session.flush()

    result_info = {
        "account_created": account_created,
        "user_id": linked_user.id,
        "username": linked_user.username,
        "email": linked_user.email,
        "employee_no": emp.employee_no,
        "temporary_password": plain_password,
        "letter_reference": letter_obj.reference_no,
        "category_key": letter_obj.category_key,
        "category_label": cat_label,
        "staff_category": emp.staff_category,
        "email_sent": False,
        "email_status": "skipped",
        "email_mode": messaging.config().get("email_mode", "sandbox"),
        "email_error": None,
        "delivery_id": None,
    }

    if send_email_flag and plain_password:
        portal_link = public_app_link("/employment-letters", base_override=portal_base)
        designation = emp.designation.title if emp.designation else "Staff Member"
        department = emp.department.name if emp.department else "General Operations"
        subject = f"Welcome to {company_legal} — Portal Login Credentials & {cat_label} Letter"
        body_text = (
            f"Dear {emp.full_name},\n\n"
            f"Welcome to {company_legal}! Your employee portal account and official {cat_label} "
            f"Employment Letter (Ref: {letter_obj.reference_no}) are now ready.\n\n"
            f"Use the credentials below to sign in, view, accept, and print your Employment Letter:\n"
            f"  • Portal URL: {portal_link}\n"
            f"  • Username: {linked_user.username}\n"
            f"  • Registered Email: {linked_user.email}\n"
            f"  • Employee ID: {emp.employee_no}\n"
            f"  • Temporary Password: {plain_password}\n\n"
            f"Note: You can sign in using your Username ({linked_user.username}), Registered Email ({linked_user.email}), "
            f"or Employee ID ({emp.employee_no}). For security, please update your password after your first sign-in."
        )
        meta_rows = [
            ("Employee Name", emp.full_name),
            ("Position & Department", f"{designation} · {department}"),
            ("Employment Category", f"{cat_label} ({emp.staff_category})"),
            ("Letter Reference", letter_obj.reference_no),
            ("Username", linked_user.username),
            ("Registered Email", linked_user.email),
            ("Employee ID", emp.employee_no),
            ("Temporary Password", plain_password),
            ("Portal Sign-In URL", portal_link),
        ]
        html_doc = messaging.html_email(
            f"Welcome aboard, {emp.first_name}! Your Portal Account is Ready",
            f"Congratulations on your appointment with {company_legal} as {designation} ({cat_label}).\n\n"
            f"Your self-service HR account has been created so you can view, digitally sign, and print your "
            f"official Employment Letter, access payslips, request leave, and manage your profile.",
            link=portal_link,
            meta_rows=meta_rows,
            badge=f"{cat_label} · Onboarding",
            action_label="Sign In & View Employment Letter",
        )
        notif = Notification(
            user_id=linked_user.id,
            title=f"Welcome to {company_name} — View Your {cat_label} Letter",
            body=f"Your official {cat_label} letter ({letter_obj.reference_no}) is ready to view, accept, and print.",
            link="/employment-letters",
            category="Onboarding",
            event_key="account_credentials",
        )
        db.session.add(notif)
        db.session.flush()

        recipients_to_mail = [linked_user.email]
        also_cc = str(data.get("also_personal_email", "")).lower() in ("1", "true", "yes", "on")
        if also_cc and emp.personal_email and _VALID_EMAIL_RE.match(emp.personal_email.strip()):
            pe = emp.personal_email.strip().lower()
            if pe not in [x.lower() for x in recipients_to_mail]:
                recipients_to_mail.append(pe)

        primary_res = None
        primary_rec = None
        for idx_mail, target_email in enumerate(recipients_to_mail):
            mail_res = messaging.send_email(target_email, subject, body_text, html_doc)
            rec = _record_delivery(
                mail_res, linked_user, "account_credentials", "email", target_email, subject,
                body=body_text, html_body=html_doc, notification_id=notif.id,
            )
            if idx_mail == 0:
                primary_res = mail_res
                primary_rec = rec

        letter_obj.emailed_at = datetime.utcnow()
        cfg = messaging.config()
        if cfg.get("sms_enabled") == "1" and emp.phone:
            sms_msg = (
                f"{company_name}: Welcome {emp.first_name}! Login at {portal_link} | "
                f"User: {linked_user.username} | Pass: {plain_password}"
            )[:320]
            sms_res = messaging.send_sms(emp.phone, sms_msg)
            _record_delivery(sms_res, linked_user, "account_credentials", "sms", emp.phone,
                             "Portal Login Credentials", body=sms_msg, notification_id=notif.id)

        if primary_res:
            result_info["email_sent"] = bool(primary_res.get("ok"))
            result_info["email_status"] = primary_res.get("status", "failed")
            result_info["email_error"] = primary_res.get("error")
            result_info["delivery_id"] = primary_rec.id if primary_rec else None
            result_info["recipients"] = recipients_to_mail

    return result_info


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
                    body=body, html_body=html_doc,
                    notification_id=notification.id if notification else None,
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
    "employees": dict(model=Employee, order="id", search=["first_name", "last_name", "employee_no", "email", "phone", "work_location", "contract_type", "staff_category"],
                      labels={"employee_name": "full_name", "department_name": "department.name", "designation_title": "designation.title",
                              "branch_name": "branch.name", "manager_name": "manager.full_name",
                              "grade_name": "grade.name",
                              "hod_name": "hod.full_name", "accountant_name": "accountant.full_name", "md_name": "md.full_name"}),
    "departments": dict(model=Department, order="name", search=["name", "code"],
                        labels={"head_name": "head_id", "branch_name": "branch.name"}),
    "designations": dict(model=Designation, order="title", search=["title"]),
    "grades": dict(model=Grade, order="level", search=["name"]),
    "branches": dict(model=Branch, order="name", search=["name", "city"]),
    "companies": dict(model=Company, order="name", search=["name"]),
    "users": dict(model=User, order="id", search=["email", "username"], hide=["password_hash", "token"],
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
                                   "department_name": "employee.department.name",
                                   "hod_name": "hod_approver.full_name",
                                   "accountant_name": "accountant_approver.full_name",
                                   "md_name": "md_approver.full_name"}),
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
    "assets": dict(model=Asset, order="id", search=["tag", "name", "serial_no", "room_number", "category"],
                   labels={"storeroom_name": "storeroom.name", "section_name": "section.name"}),
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
    "hotel-inventory": dict(model=HotelInventoryItem, order="id", search=["name", "sku", "category", "location", "supplier"]),
    "hotel-work-orders": dict(model=HotelWorkOrder, order="id", search=["order_no", "title", "location", "category"]),
    "hotel-stock-movements": dict(model=HotelStockMovement, order="id", search=["reference_no", "source_dest"]),
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
    ident = (data.get("email") or data.get("username") or "").strip()
    ident_low = ident.lower()
    password = data.get("password") or ""
    user = None
    if ident_low:
        # 1. Exact match on active User email or username
        user = User.query.filter(
            User.deleted_at.is_(None),
            or_(
                func.lower(User.email) == ident_low,
                func.lower(User.username) == ident_low,
            ),
        ).first()

        # 2. Match by Employee number, personal email, work email, or full name
        if not user:
            ident_clean = ident_low.replace("-", "").replace(" ", "").replace("_", "")
            emp_match = Employee.query.filter(
                Employee.deleted_at.is_(None),
                Employee.status.in_(["active", "probation"]),
                or_(
                    func.lower(Employee.employee_no) == ident_low,
                    func.lower(func.replace(func.replace(Employee.employee_no, "-", ""), " ", "")) == ident_clean,
                    func.lower(Employee.email) == ident_low,
                    func.lower(Employee.personal_email) == ident_low,
                    func.lower(Employee.first_name + " " + Employee.last_name) == ident_low,
                ),
            ).first()
            if emp_match:
                user = User.query.filter_by(employee_id=emp_match.id).first()
                if user and user.deleted_at is not None:
                    user.deleted_at = None
                    user.status = "active"
                    db.session.commit()

        # 3. Handle email/username prefix variations (e.g. "shineamaze" vs "shineamazeoutlook.com")
        if not user:
            prefix = ident_low.split("@", 1)[0]
            if len(prefix) >= 3:
                user = User.query.filter(
                    or_(
                        func.lower(User.username) == prefix,
                        func.lower(User.username).like(f"{prefix}%"),
                        func.lower(User.email).like(f"{prefix}@%"),
                    )
                ).first()
                if user and user.deleted_at is not None:
                    emp = Employee.query.filter_by(id=user.employee_id).first() if user.employee_id else None
                    if emp and emp.deleted_at is None and emp.status in ("active", "probation"):
                        user.deleted_at = None
                        user.status = "active"
                        db.session.commit()
                    else:
                        user = None

        # 4. If matching user was soft-deleted but employee is active, auto-restore
        if user and user.deleted_at is not None:
            emp = Employee.query.filter_by(id=user.employee_id).first() if user.employee_id else None
            if emp and emp.deleted_at is None and emp.status in ("active", "probation"):
                user.deleted_at = None
                user.status = "active"
                db.session.commit()
            else:
                user = None
    if not user:
        db.session.add(LoginHistory(ip=request.remote_addr, user_agent=request.user_agent.string[:255],
                                    success=False))
        db.session.commit()
        return error("Invalid username/email or password", 401)
    raw_pw = data.get("password") or ""
    cleaned_pw = raw_pw.strip()
    pw_matches = False

    if check_password_hash(user.password_hash, raw_pw) or (cleaned_pw and check_password_hash(user.password_hash, cleaned_pw)):
        pw_matches = True
    elif user.must_change_password and len(cleaned_pw) >= 4:
        variants = {
            cleaned_pw.upper(),
            cleaned_pw[:4] + cleaned_pw[4:].upper(),
            (cleaned_pw[:1].upper() + cleaned_pw[1:4].lower() + cleaned_pw[4:].upper()) if len(cleaned_pw) >= 5 else cleaned_pw,
        }
        for v in variants:
            if check_password_hash(user.password_hash, v):
                pw_matches = True
                break

    if not pw_matches:
        if user.locked_until and user.locked_until > datetime.utcnow():
            return error("Account temporarily locked due to multiple failed attempts. Try again in a few minutes.", 423)
        user.failed_attempts = (user.failed_attempts or 0) + 1
        if user.failed_attempts >= 5:
            user.locked_until = datetime.utcnow() + timedelta(minutes=15)
            user.failed_attempts = 0
        db.session.add(LoginHistory(user_id=user.id, ip=request.remote_addr,
                                    user_agent=request.user_agent.string[:255], success=False))
        db.session.commit()
        return error("Invalid username/email or password", 401)

    # Password matches! Unlock user immediately if previously locked
    user.locked_until = None
    user.failed_attempts = 0
    if user.status != "active":
        return error("This account is inactive", 403)
    if user.employee_id:
        emp = db.session.get(Employee, user.employee_id)
        if not emp or emp.deleted_at is not None:
            user.status = "inactive"
            user.token = None
            db.session.commit()
            return error("This employee account has been deleted or archived", 403)
        if emp.status not in ("active", "probation"):
            user.status = "inactive"
            user.token = None
            db.session.commit()
            return error(f"Your employment status is '{emp.status.replace('_', ' ').capitalize()}'. Portal login access is inactive.", 403)
    now = datetime.utcnow()
    user.token = secrets.token_hex(32)
    user.token_expires_at = now + timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    user.last_login_at = now
    user.last_activity_at = now
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


@app.post("/api/v1/auth/ping")
@login_required
def ping_session():
    now = datetime.utcnow()
    request.user.token_expires_at = now + timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    request.user.last_activity_at = now
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    return jsonify({
        "data": {
            "status": "active",
            "last_activity_at": conv(request.user.last_activity_at),
            "session_timeout_seconds": SESSION_TIMEOUT_MINUTES * 60,
        }
    })


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


def has_operations_access(user):
    if not user or getattr(user, "deleted_at", None) is not None:
        return False
    role = role_of(user)
    if role == "super_admin":
        return True
    if role in ("operations_manager", "operations_officer", "hotel_manager", "hr_admin"):
        return True
    perms = (user.role.permissions if user.role and user.role.permissions else "").split(",")
    perms = [p.strip() for p in perms]
    if "*" in perms or "operations" in perms or "operations.view" in perms:
        return True
    emp = user.employee
    if emp and emp.department:
        dept_name = (emp.department.name or "").lower()
        dept_code = (emp.department.code or "").upper()
        if "operations" in dept_name or dept_code == "OPS":
            return True
    return False


def operations_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        if not has_operations_access(request.user):
            return error("Access Denied: You do not have permission to access Hotel Operations. This section is restricted to the Operations department and authorized personnel.", 403)
        return fn(*args, **kwargs)
    return wrapper


def public_user(user):
    emp = user.employee
    return {
        "id": user.id,
        "username": user.username or (user.email.split("@")[0] if user.email else None),
        "email": user.email,
        "status": user.status,
        "mfa_enabled": bool(user.mfa_enabled),
        "must_change_password": bool(user.must_change_password),
        "role": user.role.name if user.role else None,
        "role_slug": user.role.slug if user.role else None,
        "permissions": user.role.permissions if user.role else "",
        "employee_id": emp.id if emp else None,
        "employee_no": emp.employee_no if emp else None,
        "contract_type": emp.contract_type if emp else None,
        "staff_category": emp.staff_category if emp else None,
        "name": emp.full_name if emp else user.email.split("@")[0].title(),
        "phone": emp.phone if emp else None,
        "job_title": emp.designation.title if emp and emp.designation else "",
        "department": emp.department.name if emp and emp.department else "",
        "department_code": emp.department.code if emp and emp.department else "",
        "can_access_operations": has_operations_access(user),
        "photo_url": emp.photo_url if emp else None,
        "last_login_at": conv(user.last_login_at),
        "last_activity_at": conv(getattr(user, "last_activity_at", None)),
        "session_timeout_minutes": SESSION_TIMEOUT_MINUTES,
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
    emp_users_map = {}
    emp_letters_map = {}
    if resource == "employees" and rows:
        eids = [r.id for r in rows]
        emp_users_map = {
            u.employee_id: u
            for u in User.query.filter(User.employee_id.in_(eids), User.deleted_at.is_(None)).all()
        }
        emp_letters_map = {
            l.employee_id: l
            for l in EmploymentLetter.query.filter(EmploymentLetter.employee_id.in_(eids)).order_by(EmploymentLetter.id.asc()).all()
        }
    data = []
    for r in rows:
        item = serialize(r, resource)
        for h in cfg.get("hide", []):
            item.pop(h, None)
        if resource == "announcements":
            enrich_announcement(item)
        elif resource == "employees":
            lu = emp_users_map.get(r.id)
            el = emp_letters_map.get(r.id)
            item["has_account"] = bool(lu)
            item["username"] = lu.username if lu else None
            item["letter_reference"] = el.reference_no if el else None
            item["letter_status"] = el.status if el else None
            item["category_label"] = letters.EMPLOYMENT_CATEGORIES.get(
                el.category_key if el else letters.infer_category_key(r), {}
            ).get("label", r.contract_type)
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


def admin_conflict(model, fields, obj=None):
    """Return a friendly conflict message for administration records (or None)."""
    if model is User:
        email = (fields.get("email") or "").strip() if isinstance(fields.get("email"), str) else fields.get("email")
        if email:
            q = User.query.filter(func.lower(User.email) == str(email).strip().lower())
            if obj:
                q = q.filter(User.id != obj.id)
            if q.first():
                return "That email address is already used by another account"
        username = fields.get("username")
        if username:
            q = User.query.filter(func.lower(User.username) == str(username).strip().lower())
            if obj:
                q = q.filter(User.id != obj.id)
            if q.first():
                return "That username is already taken"
        if fields.get("employee_id"):
            q = User.query.filter(User.employee_id == fields["employee_id"], User.deleted_at.is_(None))
            if obj:
                q = q.filter(User.id != obj.id)
            if q.first():
                return "That employee is already linked to another login"
    if model is Role:
        for attr, msg in (("name", "A role with that name already exists"),
                          ("slug", "A role with that slug already exists")):
            value = fields.get(attr)
            if value:
                q = Role.query.filter(func.lower(getattr(Role, attr)) == str(value).strip().lower())
                if obj:
                    q = q.filter(Role.id != obj.id)
                if q.first():
                    return msg
    if model is Setting:
        key = fields.get("key")
        if key:
            q = Setting.query.filter(Setting.key == str(key).strip())
            if obj:
                q = q.filter(Setting.id != obj.id)
            if q.first():
                return "A setting with that key already exists"
    if model is Asset:
        tag = fields.get("tag")
        if tag:
            q = Asset.query.filter(func.lower(Asset.tag) == str(tag).strip().lower())
            if obj:
                q = q.filter(Asset.id != obj.id)
            if q.first():
                return f"An equipment asset with tag '{tag}' already exists. Please choose a unique tag."
    return None


def finance_fields(model, fields, obj=None):
    """Validate financial CRUD and keep workflow/computed fields server-owned."""
    allowed = {
        ExpenseClaim: {"employee_id", "category_id", "title", "amount", "claim_date", "description"},
        ExpenseCategory: {"name", "limit_amount", "requires_receipt"},
        PayrollRun: {"period_year", "period_month", "notes"},
        SalaryComponent: {"name", "code", "kind", "is_taxable", "is_statutory", "calculation"},
    }
    if model not in allowed:
        return
    if obj and model is ExpenseClaim and obj.status != "pending":
        raise ValueError("Only pending claims can be edited or deleted")
    if obj and model is PayrollRun and obj.status not in ("draft", "calculated"):
        raise ValueError("Only draft or calculated payroll runs can be edited or deleted")
    for key in list(fields):
        if key not in allowed[model]:
            del fields[key]
    if obj and model is ExpenseClaim:
        fields.pop("employee_id", None)
    values = {key: fields.get(key, getattr(obj, key, None)) for key in allowed[model]}
    if model is ExpenseClaim:
        eid = values["employee_id"] or request.user.employee_id
        if not eid or not db.session.get(Employee, eid):
            raise ValueError("Select a valid employee")
        fields["employee_id"] = eid
        if not str(values["title"] or "").strip():
            raise ValueError("Claim title is required")
        if values["amount"] is None or not values["amount"].is_finite() or values["amount"] <= 0:
            raise ValueError("Claim amount must be greater than zero")
        if not values["category_id"] or not db.session.get(ExpenseCategory, values["category_id"]):
            raise ValueError("Select a valid expense category")
        if not values["claim_date"]:
            raise ValueError("Expense date is required")
    if model is ExpenseCategory:
        if not str(values["name"] or "").strip():
            raise ValueError("Category name is required")
        limit = values["limit_amount"]
        if limit is not None and (not limit.is_finite() or limit < 0):
            raise ValueError("Category limit cannot be negative")
    if model is SalaryComponent:
        for key in ("name", "code"):
            if not str(values[key] or "").strip():
                raise ValueError(f"Component {key} is required")
            if key in fields:
                fields[key] = str(fields[key]).strip()
        for key, options, default in (("kind", {"earning", "deduction"}, "earning"),
                                      ("calculation", {"fixed", "percent", "band"}, "fixed")):
            if values[key] is not None and values[key] not in options:
                raise ValueError(f"Invalid component {key}")
            if not obj and key not in fields:
                fields[key] = default
        duplicate = SalaryComponent.query.filter_by(code=fields.get("code", values["code"]))
        if obj:
            duplicate = duplicate.filter(SalaryComponent.id != obj.id)
        if duplicate.first():
            raise ValueError("A salary component with this code already exists")
    if model is PayrollRun:
        if not values["period_month"] or not 1 <= values["period_month"] <= 12 or not values["period_year"] or not 2000 <= values["period_year"] <= 2100:
            raise ValueError("Enter a valid payroll month and year (2000–2100)")
        duplicate = PayrollRun.query.filter_by(period_month=values["period_month"], period_year=values["period_year"])
        if obj:
            duplicate = duplicate.filter(PayrollRun.id != obj.id)
        if duplicate.first():
            raise ValueError("A payroll run already exists for this period")


def clear_run_payslips(run):
    ids = db.session.query(Payslip.id).filter_by(run_id=run.id)
    PayslipItem.query.filter(PayslipItem.payslip_id.in_(ids)).delete(synchronize_session=False)
    Payslip.query.filter_by(run_id=run.id).delete(synchronize_session=False)


def _create(resource, model):
    if role_of(request.user) in READ_ONLY:
        return error("Auditor accounts are read-only", 403)
    if not can_write(request.user, resource) and not can_self_write(request.user, resource):
        return error("You do not have permission to perform this action", 403)
    data = request.get_json(silent=True) or {}
    try:
        fields = writable_fields(model, data)
        finance_fields(model, fields)
        hr_crud.validate(model, fields)
    except ValueError as e:
        return error(str(e), 422)
    conflict = admin_conflict(model, fields)
    if conflict:
        return error(conflict, 409)
    raw_user_pwd = None
    if model is User:
        raw_user_pwd = (data.get("password") or "").strip() or generate_temp_password()
        fields["password_hash"] = generate_password_hash(raw_user_pwd)
        linked_emp_for_user = db.session.get(Employee, fields["employee_id"]) if fields.get("employee_id") else None
        fields["username"] = generate_unique_username(
            emp=linked_emp_for_user,
            email=fields.get("email"),
            preferred=data.get("username"),
        )
        if "must_change_password" not in fields:
            fields["must_change_password"] = True
    if model is Employee and not fields.get("employee_no"):
        fields["employee_no"] = next_employee_no()
    if model is Employee:
        fields.setdefault("company_id", 1)
        fields.setdefault("status", "active")
        fields.setdefault("contract_type", "permanent")
    if hasattr(model, "created_by"):
        fields["created_by"] = request.user.id
    obj = model(**fields)
    if model is PayrollRun:
        obj.prepared_by = request.user.id
    self_only = not can_write(request.user, resource) and can_self_write(request.user, resource)
    if self_only and hasattr(obj, "employee_id"):
        obj.employee_id = request.user.employee_id
    elif model in (LeaveRequest, ExpenseClaim, Ticket, Loan, Goal) and role_of(request.user) == "employee":
        obj.employee_id = request.user.employee_id
    if model is LeaveRequest:
        emp = db.session.get(Employee, obj.employee_id or 0)
        if emp:
            obj.approver_id = emp.hod_id or emp.manager_id
            if not getattr(obj, "employee_signature", None) and getattr(emp, "signature_url", None):
                obj.employee_signature = emp.signature_url
        # Automatically calculate leave_already_taken if not explicitly provided
        if not getattr(obj, "leave_already_taken", None) or float(obj.leave_already_taken or 0) == 0:
            yr = obj.start_date.year if obj.start_date else datetime.utcnow().year
            prior_approved = LeaveRequest.query.filter(
                LeaveRequest.employee_id == obj.employee_id,
                LeaveRequest.status == "approved",
                db.func.extract("year", LeaveRequest.start_date) == yr
            ).all()
            obj.leave_already_taken = sum(float(r.days or 0) for r in prior_approved)
        # Default resumption_date if not explicitly provided
        if not getattr(obj, "resumption_date", None) and obj.end_date:
            nxt = obj.end_date + timedelta(days=1)
            while nxt.weekday() >= 5:
                nxt += timedelta(days=1)
            obj.resumption_date = nxt
    db.session.add(obj)
    db.session.flush()
    credentials_dispatch = None
    if model is Employee:
        send_creds = data.get("send_credentials")
        send_creds_flag = True if send_creds is None else (str(send_creds).lower() not in ("0", "false", "no", "off"))
        credentials_dispatch = provision_employee_onboarding(
            obj, data=data, actor=request.user, send_email_flag=send_creds_flag,
        )
    elif model is User and raw_user_pwd:
        send_creds = data.get("send_credentials")
        if send_creds is None or str(send_creds).lower() not in ("0", "false", "no", "off"):
            comp = Company.query.first()
            comp_name = (comp.legal_name or comp.name) if comp else "Meridian HR"
            portal_link = public_app_link("/")
            subj = f"Your {comp_name} Portal Login Credentials"
            body_txt = (
                f"Hello {obj.employee.full_name if obj.employee else obj.username},\n\n"
                f"Your {comp_name} portal login account has been provisioned.\n\n"
                f"  • Portal URL: {portal_link}\n"
                f"  • Username: {obj.username}\n"
                f"  • Login Email: {obj.email}\n"
                f"  • Temporary Password: {raw_user_pwd}\n"
            )
            html_doc = messaging.html_email(
                f"Your {comp_name} Login Credentials",
                "Use the account details below to sign in to the HR portal.",
                link=portal_link,
                meta_rows=[
                    ("Username", obj.username),
                    ("Registered Email", obj.email),
                    ("Temporary Password", raw_user_pwd),
                    ("Portal URL", portal_link),
                ],
                badge="Account Access",
                action_label="Sign In Now",
            )
            m_res = messaging.send_email(obj.email, subj, body_txt, html_doc)
            rec = _record_delivery(m_res, obj, "account_credentials", "email", obj.email, subj,
                                   body=body_txt, html_body=html_doc)
            credentials_dispatch = {
                "account_created": True,
                "user_id": obj.id,
                "username": obj.username,
                "email": obj.email,
                "temporary_password": raw_user_pwd,
                "email_sent": bool(m_res.get("ok")),
                "email_status": m_res.get("status"),
                "email_mode": messaging.config().get("email_mode", "sandbox"),
                "email_error": m_res.get("error"),
                "delivery_id": rec.id if rec else None,
            }
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
    if credentials_dispatch:
        payload["credentials_dispatch"] = credentials_dispatch
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
        finance_fields(model, fields, obj)
        hr_crud.validate(model, fields, obj)
    except ValueError as e:
        return error(str(e), 422)
    conflict = admin_conflict(model, fields, obj)
    if conflict:
        return error(conflict, 409)
    if model is User and obj.id == request.user.id:
        if fields.get("status") == "inactive":
            return error("You cannot deactivate your own account", 409)
        if "role_id" in fields and fields["role_id"] != obj.role_id:
            return error("You cannot change your own role", 409)
    if model is Role:
        if obj.is_system and fields.get("slug") and fields["slug"] != obj.slug:
            return error("System role slugs cannot be changed", 409)
        if obj.slug == "super_admin" and "permissions" in fields and fields["permissions"] != "*":
            return error("The Super Admin role must keep all permissions", 409)
    if model is PayrollRun:
        clear_run_payslips(obj)
        obj.status = "draft"
        obj.employee_count = obj.total_gross = obj.total_tax = obj.total_net = 0
    for k, v in fields.items():
        old[k] = conv(getattr(obj, k))
        setattr(obj, k, v)
    if model is User and data.get("password"):
        obj.password_hash = generate_password_hash(data["password"])
        obj.token = None
    if model is Employee:
        db.session.flush()
        letters.ensure_letter_for_employee(
            obj,
            sync_category=any(k in fields for k in ("contract_type", "status", "staff_category", "end_date")),
        )
        c_row = Contract.query.filter_by(employee_id=obj.id).order_by(Contract.id.desc()).first()
        if c_row and "contract_type" in fields:
            c_row.type = obj.contract_type or c_row.type
        if c_row and "end_date" in fields:
            c_row.end_date = obj.end_date
        lu = User.query.filter_by(employee_id=obj.id).first()
        if lu:
            if "status" in fields:
                st = str(fields["status"]).lower().strip()
                if st in ("active", "probation"):
                    lu.status = "active"
                    lu.deleted_at = None
                else:
                    lu.status = "inactive"
                    lu.token = None
                    lu.token_expires_at = None
            if obj.email and lu.email.lower() != obj.email.lower():
                if not User.query.filter(func.lower(User.email) == obj.email.lower(), User.id != lu.id).first():
                    lu.email = obj.email.strip().lower()
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
    conflict = hr_crud.deletion_conflict(model, obj)
    if conflict:
        return error(conflict, 409)
    if model in (ExpenseClaim, PayrollRun):
        try:
            finance_fields(model, {}, obj)
        except ValueError as exc:
            return error(str(exc), 409)
    if model is PayrollRun:
        clear_run_payslips(obj)
    if model is ExpenseClaim:
        Approval.query.filter_by(request_type="expense", request_id=obj.id).delete()
    if model is SalaryComponent and SalaryStructure.query.filter_by(component_id=obj.id).first():
        return error("This component is assigned to salary structures and cannot be deleted", 409)
    if model is ExpenseCategory and ExpenseClaim.query.filter_by(category_id=obj.id).first():
        return error("This category is used by claims and cannot be deleted", 409)
    if model is User:
        if obj.id == request.user.id:
            return error("You cannot delete your own account", 409)
        if obj.role and obj.role.slug == "super_admin":
            remaining = User.query.join(Role, User.role_id == Role.id).filter(
                Role.slug == "super_admin", User.deleted_at.is_(None),
                User.status == "active", User.id != obj.id,
            ).count()
            if remaining == 0:
                return error("At least one active Super Admin account must remain", 409)
    if model is Role:
        if obj.is_system:
            return error("System roles cannot be deleted", 409)
        if User.query.filter(User.role_id == obj.id, User.deleted_at.is_(None)).first():
            return error("This role is still assigned to users. Reassign them first.", 409)
    if model is Asset:
        active_assign = AssetAssignment.query.filter_by(asset_id=obj.id, returned_at=None).first()
        if active_assign:
            return error(f"Cannot delete asset '{obj.name}' because it is currently assigned to an employee. Return it first.", 409)
        AssetAssignment.query.filter_by(asset_id=obj.id).delete()
    if model is Employee:
        if request.user.employee_id == obj.id:
            return error("You cannot delete your own employee record", 409)
        Department.query.filter_by(head_id=obj.id).update({Department.head_id: None})
        Employee.query.filter_by(manager_id=obj.id).update({Employee.manager_id: None})
        lu = User.query.filter_by(employee_id=obj.id).first()
        if lu:
            lu.status = "inactive"
            lu.token = None
            lu.token_expires_at = None
            lu.deleted_at = datetime.utcnow()
        obj.status = "inactive"
    if model is Department:
        emp_count = Employee.query.filter(Employee.department_id == obj.id, Employee.deleted_at.is_(None)).count()
        if emp_count > 0:
            return error(f"Cannot delete department '{obj.name}' because {emp_count} active employee(s) are currently assigned to it. Please reassign them first.", 409)
        child_depts = Department.query.filter_by(parent_id=obj.id).count()
        if child_depts > 0:
            return error(f"Cannot delete department '{obj.name}' because it has {child_depts} sub-department(s). Please delete or reassign them first.", 409)
        desig_with_emps = Employee.query.join(Designation, Employee.designation_id == Designation.id).filter(
            Designation.department_id == obj.id, Employee.deleted_at.is_(None)
        ).count()
        if desig_with_emps > 0:
            return error(f"Cannot delete department '{obj.name}' because its job designations are held by {desig_with_emps} active employee(s). Please reassign them first.", 409)
        Employee.query.filter(Employee.department_id == obj.id, Employee.deleted_at.isnot(None)).update({Employee.department_id: None})
        Designation.query.filter_by(department_id=obj.id).delete()
        JobRequisition.query.filter_by(department_id=obj.id).update({JobRequisition.department_id: None})
        JobPosting.query.filter_by(department_id=obj.id).update({JobPosting.department_id: None})
        OnboardingTemplate.query.filter_by(department_id=obj.id).update({OnboardingTemplate.department_id: None})
        CompanyEvent.query.filter_by(department_id=obj.id).update({CompanyEvent.department_id: None})
        Announcement.query.filter_by(department_id=obj.id).update({Announcement.department_id: None})
    if model is Designation:
        emp_count = Employee.query.filter(Employee.designation_id == obj.id, Employee.deleted_at.is_(None)).count()
        if emp_count > 0:
            return error(f"Cannot delete designation '{obj.title}' because {emp_count} active employee(s) hold this title. Please reassign them first.", 409)
        Employee.query.filter(Employee.designation_id == obj.id, Employee.deleted_at.isnot(None)).update({Employee.designation_id: None})
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


# ---------------------------------------------------------------- hotel operations endpoints

@app.get("/api/v1/operations/dashboard")
@operations_required
def operations_dashboard():
    period = request.args.get("period", "this_month")
    data = hotel_ops.calculate_operations_dashboard(models, period=period)
    return jsonify({"data": data})


@app.get("/api/v1/operations/inventory")
@operations_required
def get_operations_inventory():
    q = request.args.get("q", "").strip().lower()
    location = request.args.get("location")
    category = request.args.get("category")
    status = request.args.get("status")

    query = HotelInventoryItem.query
    if location:
        query = query.filter(HotelInventoryItem.location == location)
    if category:
        query = query.filter(HotelInventoryItem.category == category)
    if status == "low_stock":
        query = query.filter(HotelInventoryItem.current_stock <= HotelInventoryItem.reorder_level)
    elif status == "out_of_stock":
        query = query.filter(HotelInventoryItem.current_stock <= 0)
    elif status == "in_stock":
        query = query.filter(HotelInventoryItem.current_stock > HotelInventoryItem.reorder_level)

    items = query.order_by(HotelInventoryItem.id.asc()).all()
    if q:
        items = [i for i in items if q in i.name.lower() or q in i.sku.lower() or q in (i.supplier or "").lower()]

    return jsonify({"data": [
        {
            "id": i.id,
            "name": i.name,
            "sku": i.sku,
            "category": i.category,
            "location": i.location,
            "current_stock": i.current_stock,
            "reorder_level": i.reorder_level,
            "ideal_par_level": i.ideal_par_level,
            "unit": i.unit,
            "unit_cost": float(i.unit_cost or 0),
            "total_value": float(i.current_stock or 0) * float(i.unit_cost or 0),
            "supplier": i.supplier,
            "status": "out_of_stock" if i.current_stock <= 0 else ("low_stock" if i.current_stock <= i.reorder_level else "in_stock"),
            "icon": i.icon or "box",
            "notes": i.notes,
        }
        for i in items
    ]})


@app.post("/api/v1/operations/inventory/adjust")
@operations_required
def adjust_operations_inventory():
    body = request.get_json(silent=True) or {}
    item_id = body.get("item_id")
    qty = int(body.get("quantity") or 0)
    mtype = body.get("movement_type", "in")
    reason = body.get("reason", "Manual adjustment")
    ref = body.get("reference_no", f"ADJ-{datetime.utcnow().strftime('%Y%m%d%H%M')}")

    if not item_id:
        return error("Item ID is required", 422)
    item = db.session.get(HotelInventoryItem, item_id)
    if not item:
        return error("Inventory item not found", 404)
    if qty <= 0 and mtype != "set":
        return error("Quantity must be greater than zero", 422)

    old_stock = item.current_stock
    if mtype == "in":
        item.current_stock += qty
    elif mtype == "out":
        if item.current_stock < qty:
            return error(f"Insufficient stock on hand ({item.current_stock} {item.unit} available)", 422)
        item.current_stock -= qty
    elif mtype == "set":
        item.current_stock = max(0, qty)

    if item.current_stock <= 0:
        item.status = "out_of_stock"
    elif item.current_stock <= item.reorder_level:
        item.status = "low_stock"
    else:
        item.status = "in_stock"

    movement = HotelStockMovement(
        item_id=item.id,
        movement_type=mtype,
        quantity=qty,
        source_dest=reason,
        reference_no=ref,
        performed_by=request.user.id,
        movement_date=date.today(),
    )
    db.session.add(movement)
    audit(request.user, "inventory_adjusted", "hotel_inventory_items", item.id,
          {"old_stock": old_stock}, {"new_stock": item.current_stock, "type": mtype, "qty": qty})
    db.session.commit()

    return jsonify({
        "message": f"Inventory updated for {item.name}. New stock: {item.current_stock} {item.unit}",
        "data": {
            "id": item.id,
            "current_stock": item.current_stock,
            "status": item.status,
        }
    })


@app.post("/api/v1/operations/inventory")
@operations_required
def create_operations_inventory_item():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    sku = (body.get("sku") or "").strip().upper()
    if not name or not sku:
        return error("Name and SKU are required", 422)
    if HotelInventoryItem.query.filter_by(sku=sku).first():
        return error("An item with this SKU already exists", 422)

    item = HotelInventoryItem(
        name=name,
        sku=sku,
        category=body.get("category", "General Supplies"),
        location=body.get("location", "Central Linen & Laundry Store"),
        current_stock=int(body.get("current_stock") or 0),
        reorder_level=int(body.get("reorder_level") or 20),
        ideal_par_level=int(body.get("ideal_par_level") or 100),
        unit=body.get("unit", "units"),
        unit_cost=Decimal(str(body.get("unit_cost") or 0)),
        supplier=body.get("supplier"),
        icon=body.get("icon", "box"),
        notes=body.get("notes"),
    )
    if item.current_stock <= 0:
        item.status = "out_of_stock"
    elif item.current_stock <= item.reorder_level:
        item.status = "low_stock"
    else:
        item.status = "in_stock"

    db.session.add(item)
    audit(request.user, "inventory_item_created", "hotel_inventory_items", None, None, {"sku": sku, "name": name})
    db.session.commit()
    return jsonify({"message": "Inventory item registered", "data": {"id": item.id, "sku": item.sku}}), 201


@app.get("/api/v1/operations/work-orders")
@operations_required
def get_operations_work_orders():
    status = request.args.get("status")
    wing = request.args.get("wing")
    priority = request.args.get("priority")
    category = request.args.get("category")

    query = HotelWorkOrder.query
    if status:
        query = query.filter(HotelWorkOrder.status == status)
    if wing:
        query = query.filter(HotelWorkOrder.wing == wing)
    if priority:
        query = query.filter(HotelWorkOrder.priority == priority)
    if category:
        query = query.filter(HotelWorkOrder.category == category)

    orders = query.order_by(HotelWorkOrder.id.desc()).all()
    return jsonify({"data": [
        {
            "id": w.id,
            "order_no": w.order_no,
            "category": w.category,
            "location": w.location,
            "wing": w.wing,
            "floor": w.floor,
            "title": w.title,
            "description": w.description,
            "priority": w.priority,
            "status": w.status,
            "reported_by": w.reported_by,
            "assigned_to": w.assigned_to.full_name if w.assigned_to else "Unassigned",
            "assigned_to_id": w.assigned_to_id,
            "created_at": conv(w.created_at),
            "completed_at": conv(w.completed_at),
        }
        for w in orders
    ]})


@app.post("/api/v1/operations/work-orders")
@operations_required
def create_operations_work_order():
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    loc = (body.get("location") or "").strip()
    if not title or not loc:
        return error("Title and Location are required", 422)

    count = HotelWorkOrder.query.count() + 1
    order_no = f"WO-{420 + count}"

    wo = HotelWorkOrder(
        order_no=order_no,
        category=body.get("category", "Maintenance"),
        location=loc,
        wing=body.get("wing", "East Wing"),
        floor=body.get("floor", "Floor 1"),
        title=title,
        description=body.get("description"),
        priority=body.get("priority", "medium"),
        status="open",
        reported_by=body.get("reported_by") or (request.user.employee.full_name if request.user.employee else request.user.email),
        assigned_to_id=body.get("assigned_to_id"),
        created_at=datetime.utcnow(),
    )
    db.session.add(wo)
    audit(request.user, "work_order_created", "hotel_work_orders", None, None, {"order_no": order_no, "title": title})
    db.session.commit()
    return jsonify({"message": "Work order created", "data": {"id": wo.id, "order_no": wo.order_no}}), 201


@app.put("/api/v1/operations/work-orders/<int:wo_id>/status")
@operations_required
def update_operations_work_order_status(wo_id):
    wo = db.session.get(HotelWorkOrder, wo_id)
    if not wo:
        return error("Work order not found", 404)
    body = request.get_json(silent=True) or {}
    new_status = body.get("status")
    if new_status not in ("open", "in_progress", "completed", "inspected", "cancelled"):
        return error("Invalid status", 422)

    old_status = wo.status
    wo.status = new_status
    if new_status in ("completed", "inspected") and not wo.completed_at:
        wo.completed_at = datetime.utcnow()
    audit(request.user, "work_order_status_updated", "hotel_work_orders", wo.id,
          {"old_status": old_status}, {"new_status": new_status})
    db.session.commit()
    return jsonify({"message": f"Work order #{wo.order_no} status changed to {new_status}"})


def _serialize_equipment(asset):
    return {
        "id": asset.id,
        "name": asset.name,
        "tag": asset.tag,
        "category": asset.category or "Hospitality Equipment",
        "serial_no": asset.serial_no or "—",
        "condition": asset.condition or "operational",
        "status": asset.status or "in_use",
        "storeroom_id": asset.storeroom_id,
        "section_id": asset.section_id,
        "room_number": asset.room_number or "",
        "value": float(asset.value or 0),
        "notes": asset.notes or "",
    }


def _serialize_stock_item(item):
    return {
        "id": item.id,
        "name": item.name,
        "sku": item.sku,
        "category": item.category,
        "location": item.location,
        "storeroom_id": item.storeroom_id,
        "section_id": item.section_id,
        "current_stock": item.current_stock or 0,
        "reorder_level": item.reorder_level or 0,
        "ideal_par_level": item.ideal_par_level or 0,
        "unit": item.unit or "units",
        "unit_cost": float(item.unit_cost or 0),
        "supplier": item.supplier or "",
        "status": item.status or "in_stock",
        "icon": item.icon or "box",
        "notes": item.notes or "",
    }


def _serialize_section(sec):
    eq_list = Asset.query.filter_by(section_id=sec.id).order_by(Asset.id.asc()).all()
    st_list = HotelInventoryItem.query.filter_by(section_id=sec.id).order_by(HotelInventoryItem.id.asc()).all()
    return {
        "id": sec.id,
        "storeroom_id": sec.storeroom_id,
        "name": sec.name,
        "code": sec.code or f"SEC-{sec.id:03d}",
        "section_type": sec.section_type or "sub_section",
        "room_number": sec.room_number or "",
        "room_type": sec.room_type or "",
        "room_status": sec.room_status or "clean",
        "capacity": sec.capacity or 1,
        "supervisor_name": sec.supervisor_name or "",
        "notes": sec.notes or "",
        "equipment_count": len(eq_list),
        "stock_count": len(st_list),
        "equipments": [_serialize_equipment(a) for a in eq_list],
        "stock": [_serialize_stock_item(it) for it in st_list],
    }


def _serialize_storeroom(s, include_sections=True):
    sections = HotelStoreroomSection.query.filter_by(storeroom_id=s.id).order_by(HotelStoreroomSection.id.asc()).all()
    eq_count = Asset.query.filter_by(storeroom_id=s.id).count()
    st_count = HotelInventoryItem.query.filter_by(storeroom_id=s.id).count()
    rooms_count = sum(1 for sec in sections if (sec.section_type == "room" or bool(sec.room_number)))
    data = {
        "id": s.id,
        "name": s.name,
        "code": s.code,
        "hub_type": s.hub_type or "storeroom",
        "category": s.category,
        "location": s.location,
        "floor": s.floor or "Ground Floor",
        "wing": s.wing or "Central Facility",
        "manager_name": s.manager_name or "Operations Supervisor",
        "manager_id": s.manager_id,
        "capacity_utilization": s.capacity_utilization or 0,
        "max_capacity": s.max_capacity or 100,
        "icon": s.icon or "layers",
        "description": s.description or "",
        "status": s.status or "active",
        "sections_count": len(sections),
        "rooms_count": rooms_count,
        "equipment_count": eq_count,
        "stock_count": st_count,
        "created_at": s.created_at.isoformat() if hasattr(s, "created_at") and s.created_at else None,
    }
    if include_sections:
        data["sections"] = [_serialize_section(sec) for sec in sections]
    return data


MAINTENANCE_CATEGORIES = ("Preventive", "Repair", "Inspection", "Electrical", "Plumbing", "HVAC", "Other")
MAINTENANCE_STATUSES = ("scheduled", "in_progress", "completed", "cancelled")


def _maintenance_work_dict(work):
    return {
        "id": work.id,
        "reference_no": work.reference_no,
        "title": work.title,
        "category": work.category,
        "location": work.location,
        "scheduled_at": conv(work.scheduled_at),
        "description": work.description,
        "worker_id": work.worker_id,
        "worker_name": work.worker_name or (work.worker.full_name if work.worker else ""),
        "amount": float(work.amount or 0),
        "status": work.status,
        "remarks": work.remarks,
        "completed_at": conv(work.completed_at),
        "created_at": conv(work.created_at),
        "updated_at": conv(work.updated_at),
    }


def _maintenance_filters_query(filters):
    """Build the same validated filtered set for the screen and its report actions."""
    status = str(filters.get("status") or "").strip().lower()
    if status and status not in MAINTENANCE_STATUSES:
        return None, None, "Invalid maintenance status filter"

    parsed_dates = {}
    for key in ("from_date", "to_date"):
        raw = str(filters.get(key) or "").strip()
        if not raw:
            parsed_dates[key] = None
            continue
        try:
            parsed_dates[key] = date.fromisoformat(raw)
        except (TypeError, ValueError):
            return None, None, f"{key.replace('_', ' ').title()} must be a valid date"

    from_date = parsed_dates["from_date"]
    to_date = parsed_dates["to_date"]
    if from_date and to_date and from_date > to_date:
        return None, None, "The end date must be on or after the start date"

    query = MaintenanceWork.query.outerjoin(Employee, MaintenanceWork.worker_id == Employee.id)
    if status:
        query = query.filter(MaintenanceWork.status == status)
    if from_date:
        query = query.filter(MaintenanceWork.scheduled_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        query = query.filter(MaintenanceWork.scheduled_at < datetime.combine(to_date + timedelta(days=1), datetime.min.time()))

    search = re.sub(r"[\r\n\t]+", " ", str(filters.get("q") or filters.get("search") or "").strip())[:120]
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(
            MaintenanceWork.reference_no.ilike(pattern),
            MaintenanceWork.title.ilike(pattern),
            MaintenanceWork.category.ilike(pattern),
            MaintenanceWork.location.ilike(pattern),
            MaintenanceWork.description.ilike(pattern),
            MaintenanceWork.worker_name.ilike(pattern),
            MaintenanceWork.remarks.ilike(pattern),
            Employee.first_name.ilike(pattern),
            Employee.last_name.ilike(pattern),
        ))
    query = query.order_by(MaintenanceWork.scheduled_at.desc(), MaintenanceWork.id.desc())
    return query, {
        "status": status,
        "from_date": from_date,
        "to_date": to_date,
        "search": search,
    }, None


def _maintenance_schedule_value(raw):
    if not raw:
        return None
    try:
        scheduled_at = datetime.fromisoformat(str(raw).strip().replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if scheduled_at.tzinfo:
        scheduled_at = scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
    return scheduled_at


def _maintenance_input_values(data, work=None, creating=False):
    values = {}
    text_fields = (("title", 180, True), ("location", 180, True))
    for key, max_length, required in text_fields:
        if creating or key in data:
            value = str(data.get(key) or "").strip()
            if required and not value:
                return None, f"{key.title()} is required"
            if len(value) > max_length:
                return None, f"{key.title()} must be {max_length} characters or fewer"
            values[key] = value

    if creating or "category" in data:
        category = str(data.get("category") or ("Repair" if creating else "")).strip()
        if category not in MAINTENANCE_CATEGORIES:
            return None, "Choose a valid maintenance category"
        values["category"] = category

    if creating or "scheduled_at" in data:
        scheduled_at = _maintenance_schedule_value(data.get("scheduled_at"))
        if not scheduled_at:
            return None, "A valid scheduled date and time are required"
        values["scheduled_at"] = scheduled_at

    if creating or "description" in data:
        description = str(data.get("description") or "").strip()
        if len(description) > 4000:
            return None, "Work details must be 4,000 characters or fewer"
        values["description"] = description or None

    if creating or "remarks" in data:
        remarks = str(data.get("remarks") or "").strip()
        if len(remarks) > 4000:
            return None, "Remarks must be 4,000 characters or fewer"
        values["remarks"] = remarks or None

    if creating or "worker_id" in data or "worker_name" in data:
        raw_worker_id = data.get("worker_id", work.worker_id if work else None)
        raw_worker_name = data.get("worker_name", work.worker_name if work else None)
        if raw_worker_id in (None, "", "external"):
            worker_name = str(raw_worker_name or "").strip()
            if not worker_name:
                return None, "Select an employee or enter the external worker's name"
            if len(worker_name) > 120:
                return None, "Worker name must be 120 characters or fewer"
            values["worker_id"] = None
            values["worker_name"] = worker_name
        else:
            try:
                worker_id = int(raw_worker_id)
            except (TypeError, ValueError):
                return None, "Choose a valid worker"
            worker = db.session.get(Employee, worker_id)
            if not worker or worker.deleted_at or worker.status not in ("active", "probation"):
                return None, "The selected worker is not an active employee"
            values["worker_id"] = worker.id
            values["worker_name"] = worker.full_name

    if creating or "amount" in data:
        raw_amount = data.get("amount", 0 if creating else None)
        try:
            amount = Decimal(str(raw_amount))
        except (InvalidOperation, TypeError, ValueError):
            return None, "Enter a valid maintenance charge in GHS"
        if not amount.is_finite() or amount < 0 or amount > Decimal("9999999999.99"):
            return None, "The maintenance charge must be between GHS 0.00 and GHS 9,999,999,999.99"
        values["amount"] = amount.quantize(Decimal("0.01"))

    if not creating and "status" in data:
        status = str(data.get("status") or "").strip().lower()
        if status not in MAINTENANCE_STATUSES:
            return None, "Choose a valid maintenance status"
        values["status"] = status

    return values, None


def _maintenance_period_label(filters):
    start = filters.get("from_date")
    end = filters.get("to_date")
    if start and end:
        label = f"{start.strftime('%d %b %Y')} – {end.strftime('%d %b %Y')}"
    elif start:
        label = f"From {start.strftime('%d %b %Y')} onward"
    elif end:
        label = f"Through {end.strftime('%d %b %Y')}"
    else:
        label = "All scheduled dates"
    if filters.get("status"):
        label += f" · {filters['status'].replace('_', ' ').title()}"
    if filters.get("search"):
        label += f" · Search: {filters['search']}"
    return label


def _maintenance_md_contact():
    candidates = []
    actor_employee = request.user.employee if request.user else None
    if actor_employee and actor_employee.md_id:
        md = db.session.get(Employee, actor_employee.md_id)
        if md and not md.deleted_at and md.status in ("active", "probation"):
            candidates.append(md)

    executives = (Employee.query.join(Designation, Employee.designation_id == Designation.id)
                  .filter(Employee.deleted_at.is_(None), Employee.status.in_(["active", "probation"]),
                          or_(Designation.title.ilike("%managing director%"),
                              Designation.title.ilike("%chief executive%"),
                              func.lower(Designation.title).in_(["ceo", "md"])))
                  .order_by(Designation.level.desc(), Employee.id.asc()).all())
    candidates.extend(executives)

    admin_user = (User.query.join(Role, User.role_id == Role.id)
                  .filter(Role.slug == "super_admin", User.status == "active", User.deleted_at.is_(None))
                  .order_by(User.id.asc()).first())
    if admin_user and admin_user.employee:
        candidates.append(admin_user.employee)

    seen = set()
    for employee in candidates:
        if not employee or employee.id in seen or employee.deleted_at:
            continue
        seen.add(employee.id)
        user = (User.query.filter_by(employee_id=employee.id, status="active")
                .filter(User.deleted_at.is_(None)).first())
        emails = (employee.email, employee.personal_email, user.email if user else None)
        email = next((value.strip() for value in emails
                      if value and _VALID_EMAIL_RE.match(value.strip())), None)
        if email:
            return employee, user, email
    return None, None, None


@app.get("/api/v1/operations/maintenance")
@operations_required
def get_operations_maintenance():
    query, filters, filter_error = _maintenance_filters_query(request.args)
    if filter_error:
        return error(filter_error, 422)
    return jsonify({"data": [_maintenance_work_dict(work) for work in query.all()]})


@app.post("/api/v1/operations/maintenance")
@operations_required
def create_operations_maintenance():
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return error("Maintenance work must be submitted as an object", 422)
    values, validation_error = _maintenance_input_values(body, creating=True)
    if validation_error:
        return error(validation_error, 422)

    work = MaintenanceWork(
        reference_no=f"MW-{date.today().strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}",
        status="scheduled",
        created_by=request.user.id,
        **values,
    )
    db.session.add(work)
    db.session.flush()
    audit(request.user, "maintenance_work_scheduled", "maintenance_works", work.id, None,
          {"reference_no": work.reference_no, "title": work.title, "worker": work.worker_name,
           "amount": str(work.amount), "scheduled_at": work.scheduled_at.isoformat()})
    db.session.commit()
    return jsonify({"message": "Maintenance work scheduled", "data": _maintenance_work_dict(work)}), 201


@app.put("/api/v1/operations/maintenance/<int:work_id>")
@operations_required
def update_operations_maintenance(work_id):
    work = db.session.get(MaintenanceWork, work_id)
    if not work:
        return error("Maintenance work not found", 404)
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return error("Maintenance updates must be submitted as an object", 422)
    values, validation_error = _maintenance_input_values(body, work=work)
    if validation_error:
        return error(validation_error, 422)
    if not values:
        return error("No maintenance fields were provided", 422)

    old_values = {key: getattr(work, key) for key in values}
    old_status = work.status
    for key, value in values.items():
        setattr(work, key, value)
    if "status" in values:
        if values["status"] == "completed" and not work.completed_at:
            work.completed_at = datetime.utcnow()
        elif values["status"] != "completed":
            work.completed_at = None
    work.updated_by = request.user.id
    audit(request.user, "maintenance_work_updated", "maintenance_works", work.id,
          {key: str(value) for key, value in old_values.items()},
          {key: str(getattr(work, key)) for key in values})
    if old_status != work.status:
        audit(request.user, "maintenance_status_updated", "maintenance_works", work.id,
              {"status": old_status}, {"status": work.status})
    db.session.commit()
    return jsonify({"message": "Maintenance work updated", "data": _maintenance_work_dict(work)})


@app.post("/api/v1/operations/maintenance/report/send")
@operations_required
def send_operations_maintenance_report():
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return error("Report filters must be submitted as an object", 422)
    query, filters, filter_error = _maintenance_filters_query(body)
    if filter_error:
        return error(filter_error, 422)
    records = query.all()
    employee, recipient_user, recipient_email = _maintenance_md_contact()
    if not recipient_email:
        return error("No Managing Director email is configured. Add an active MD or CEO employee with an email address.", 422)

    company = Company.query.first()
    company_name = company.name if company and company.name else "Company"
    period = _maintenance_period_label(filters)
    total_amount = sum((work.amount or Decimal("0.00") for work in records), Decimal("0.00"))
    title = f"Maintenance work report — {period}"
    prepared_by = request.user.employee.full_name if request.user.employee else request.user.email
    intro = (f"The maintenance report for {period} includes {len(records)} work item(s), "
             f"with total charges of GHS {total_amount:,.2f}. Prepared by {prepared_by}.")

    plain_lines = [title, company_name, intro, ""]
    if records:
        for work in records:
            schedule = work.scheduled_at.strftime("%d %b %Y, %H:%M")
            worker_name = work.worker_name or (work.worker.full_name if work.worker else "Unassigned")
            plain_lines.extend([
                f"{work.reference_no} | {schedule} | {work.title}",
                f"Location: {work.location} | Worker: {worker_name} | Charge: GHS {float(work.amount or 0):,.2f} | Status: {work.status.replace('_', ' ').title()}",
                f"Details: {work.description or '—'}",
                f"Remarks: {work.remarks or '—'}",
                "",
            ])
    else:
        plain_lines.append("No maintenance works match the selected report filters.")
    plain_body = "\n".join(plain_lines)

    table_rows = []
    for work in records:
        worker_name = work.worker_name or (work.worker.full_name if work.worker else "Unassigned")
        work_details_html = (
            f'<br><span style="color:#69756f">{html_escape(work.description)}</span>'
            if work.description else ""
        )
        table_rows.append(
            "<tr>"
            f"<td>{html_escape(work.reference_no or '')}</td>"
            f"<td>{html_escape(work.scheduled_at.strftime('%d %b %Y, %H:%M'))}</td>"
            f"<td><strong>{html_escape(work.title)}</strong>{work_details_html}</td>"
            f"<td>{html_escape(work.location)}</td>"
            f"<td>{html_escape(worker_name)}</td>"
            f'<td style="text-align:right;white-space:nowrap">GHS {float(work.amount or 0):,.2f}</td>'
            f"<td>{html_escape(work.status.replace('_', ' ').title())}</td>"
            f"<td>{html_escape(work.remarks or '—')}</td>"
            "</tr>"
        )
    report_table = (
        '<div style="margin-top:20px;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
        '<thead><tr style="background:#f4f1ea;text-align:left">'
        '<th style="padding:8px;border-bottom:1px solid #d8d2c7">Ref</th>'
        '<th style="padding:8px;border-bottom:1px solid #d8d2c7">Scheduled</th>'
        '<th style="padding:8px;border-bottom:1px solid #d8d2c7">Work</th>'
        '<th style="padding:8px;border-bottom:1px solid #d8d2c7">Location</th>'
        '<th style="padding:8px;border-bottom:1px solid #d8d2c7">Worker</th>'
        '<th style="padding:8px;border-bottom:1px solid #d8d2c7;text-align:right">Charge</th>'
        '<th style="padding:8px;border-bottom:1px solid #d8d2c7">Status</th>'
        '<th style="padding:8px;border-bottom:1px solid #d8d2c7">Remarks</th>'
        '</tr></thead><tbody>'
        + ("".join(table_rows) if table_rows else '<tr><td colspan="8" style="padding:12px">No maintenance works match the selected filters.</td></tr>')
        + '</tbody></table></div>'
        + f'<p style="margin-top:16px;font-weight:700">Total maintenance charges: GHS {total_amount:,.2f}</p>'
    )
    html_body = messaging.html_email(
        title, intro, public_app_link("/operations/maintenance"),
        meta_rows=[("Report period", period), ("Work items", str(len(records))),
                   ("Total charges", f"GHS {total_amount:,.2f}"), ("Prepared by", prepared_by)],
        badge="Maintenance report", action_label="Open maintenance schedule", extra_html=report_table,
    )
    mail_result = messaging.send_email(recipient_email, title, plain_body, html_body)

    notification = None
    if recipient_user:
        notification = Notification(
            user_id=recipient_user.id,
            title="Maintenance report shared",
            body=f"{len(records)} work item(s) · GHS {total_amount:,.2f} · {period}",
            link="/operations/maintenance",
            category="Operations",
            event_key="maintenance_report",
        )
        db.session.add(notification)
        db.session.flush()
    _record_delivery(
        mail_result, recipient_user, "maintenance_report", "email", recipient_email, title,
        body=plain_body, html_body=html_body,
        notification_id=notification.id if notification else None,
    )
    audit(request.user, "maintenance_report_sent", "maintenance_works", None, None,
          {"recipient": recipient_email, "record_count": len(records),
           "total_amount": str(total_amount), "email_status": mail_result.get("status")})
    db.session.commit()

    return jsonify({
        "message": "Maintenance report shared with the Managing Director",
        "data": {
            "recipient_name": employee.full_name if employee else recipient_email,
            "recipient_email": recipient_email,
            "email_status": mail_result.get("status", "failed"),
            "email_error": mail_result.get("error"),
            "email_mode": messaging.config().get("email_mode", "smtp"),
            "in_app_notified": bool(notification),
            "record_count": len(records),
            "total_amount": float(total_amount),
        },
    })


@app.get("/api/v1/operations/storerooms")
@operations_required
def get_operations_storerooms():
    storerooms = HotelStoreroom.query.order_by(HotelStoreroom.id.asc()).all()
    if not storerooms:
        hotel_ops.seed_hotel_operations(db, models)
        storerooms = HotelStoreroom.query.order_by(HotelStoreroom.id.asc()).all()
    return jsonify({"data": [_serialize_storeroom(s, include_sections=True) for s in storerooms]})


@app.post("/api/v1/operations/storerooms")
@operations_required
def create_operations_storeroom():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return error("Storeroom / Hub name is required", 400)

    code = (data.get("code") or "").strip().upper()
    if not code:
        code = f"HUB-{secrets.token_hex(2).upper()}"
    existing = HotelStoreroom.query.filter_by(code=code).first()
    if existing:
        code = f"{code}-{secrets.token_hex(2).upper()}"

    s = HotelStoreroom(
        name=name,
        code=code,
        hub_type=data.get("hub_type") or "rooms_hub",
        category=data.get("category") or "Hospitality Hub",
        location=data.get("location") or "Main Building",
        floor=data.get("floor") or "Ground Floor",
        wing=data.get("wing") or "Central Facility",
        manager_name=data.get("manager_name") or "Operations Supervisor",
        capacity_utilization=int(data.get("capacity_utilization") or 0),
        max_capacity=int(data.get("max_capacity") or 100),
        icon=data.get("icon") or "layers",
        description=data.get("description") or "",
        status=data.get("status") or "active",
    )
    db.session.add(s)
    db.session.flush()

    audit(request.user, "hotel_storeroom_created", "hotel_storerooms", s.id,
          None, {"name": s.name, "code": s.code, "hub_type": s.hub_type})
    db.session.commit()
    return jsonify({"message": f"Storeroom '{s.name}' created successfully", "data": _serialize_storeroom(s, True)}), 201


@app.get("/api/v1/operations/storerooms/<int:storeroom_id>")
@operations_required
def get_operations_storeroom_detail(storeroom_id):
    s = HotelStoreroom.query.get(storeroom_id)
    if not s:
        return error("Storeroom not found", 404)
    return jsonify({"data": _serialize_storeroom(s, include_sections=True)})


@app.put("/api/v1/operations/storerooms/<int:storeroom_id>")
@operations_required
def update_operations_storeroom(storeroom_id):
    s = HotelStoreroom.query.get(storeroom_id)
    if not s:
        return error("Storeroom not found", 404)
    data = request.get_json(silent=True) or {}

    old_vals = {"name": s.name, "location": s.location, "capacity_utilization": s.capacity_utilization}

    if "name" in data and data["name"]:
        s.name = data["name"].strip()
    if "code" in data and data["code"]:
        s.code = data["code"].strip().upper()
    if "hub_type" in data:
        s.hub_type = data["hub_type"]
    if "category" in data and data["category"]:
        s.category = data["category"].strip()
    if "location" in data and data["location"]:
        s.location = data["location"].strip()
    if "floor" in data and data["floor"]:
        s.floor = data["floor"].strip()
    if "wing" in data and data["wing"]:
        s.wing = data["wing"].strip()
    if "manager_name" in data:
        s.manager_name = (data["manager_name"] or "").strip()
    if "capacity_utilization" in data and data["capacity_utilization"] is not None:
        try:
            s.capacity_utilization = max(0, min(100, int(data["capacity_utilization"])))
        except (ValueError, TypeError):
            pass
    if "max_capacity" in data and data["max_capacity"] is not None:
        try:
            s.max_capacity = max(1, int(data["max_capacity"]))
        except (ValueError, TypeError):
            pass
    if "icon" in data and data["icon"]:
        s.icon = data["icon"]
    if "description" in data:
        s.description = data["description"]
    if "status" in data and data["status"]:
        s.status = data["status"]

    audit(request.user, "hotel_storeroom_updated", "hotel_storerooms", s.id,
          old_vals, {"name": s.name, "location": s.location, "capacity_utilization": s.capacity_utilization})
    db.session.commit()
    return jsonify({"message": f"Storeroom '{s.name}' updated successfully", "data": _serialize_storeroom(s, True)})


@app.delete("/api/v1/operations/storerooms/<int:storeroom_id>")
@operations_required
def delete_operations_storeroom(storeroom_id):
    s = HotelStoreroom.query.get(storeroom_id)
    if not s:
        return error("Storeroom not found", 404)

    # Detach assets and inventory items first
    Asset.query.filter_by(storeroom_id=s.id).update({"storeroom_id": None, "section_id": None, "room_number": None})
    HotelInventoryItem.query.filter_by(storeroom_id=s.id).update({"storeroom_id": None, "section_id": None})
    # Remove sections
    HotelStoreroomSection.query.filter_by(storeroom_id=s.id).delete()

    name = s.name
    db.session.delete(s)
    audit(request.user, "hotel_storeroom_deleted", "hotel_storerooms", storeroom_id, {"name": name}, None)
    db.session.commit()
    return jsonify({"message": f"Storeroom '{name}' and its sub-sections removed successfully"})


# ---------------- SUB-SECTIONS & ROOMS CRUD ----------------
@app.post("/api/v1/operations/storerooms/<int:storeroom_id>/sections")
@operations_required
def create_operations_section(storeroom_id):
    s = HotelStoreroom.query.get(storeroom_id)
    if not s:
        return error("Storeroom / Hub not found", 404)
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return error("Section / Room name is required", 400)

    section_type = data.get("section_type") or "room"
    room_number = (data.get("room_number") or "").strip()
    code = (data.get("code") or "").strip().upper()
    if not code:
        if room_number:
            code = f"RM-{room_number}"
        else:
            code = f"SEC-{secrets.token_hex(2).upper()}"

    sec = HotelStoreroomSection(
        storeroom_id=s.id,
        name=name,
        code=code,
        section_type=section_type,
        room_number=room_number,
        room_type=data.get("room_type") or ("Standard Room" if section_type == "room" else "Storage Bay"),
        room_status=data.get("room_status") or "clean",
        capacity=int(data.get("capacity") or (2 if section_type == "room" else 100)),
        supervisor_name=data.get("supervisor_name") or s.manager_name or "Supervisor",
        notes=data.get("notes") or "",
    )
    db.session.add(sec)
    db.session.flush()

    audit(request.user, "hotel_section_created", "hotel_storeroom_sections", sec.id,
          None, {"name": sec.name, "room_number": sec.room_number, "storeroom_id": s.id})
    db.session.commit()
    return jsonify({"message": f"Sub-section / Room '{sec.name}' created successfully", "data": _serialize_section(sec)}), 201


@app.put("/api/v1/operations/sections/<int:section_id>")
@operations_required
def update_operations_section(section_id):
    sec = HotelStoreroomSection.query.get(section_id)
    if not sec:
        return error("Sub-section / Room not found", 404)
    data = request.get_json(silent=True) or {}

    old_vals = {"name": sec.name, "room_status": sec.room_status, "room_number": sec.room_number}

    if "name" in data and data["name"]:
        sec.name = data["name"].strip()
    if "code" in data and data["code"]:
        sec.code = data["code"].strip().upper()
    if "section_type" in data and data["section_type"]:
        sec.section_type = data["section_type"]
    if "room_number" in data:
        new_room_no = (data["room_number"] or "").strip()
        sec.room_number = new_room_no
        if new_room_no:
            Asset.query.filter_by(section_id=sec.id).update({"room_number": new_room_no})
    if "room_type" in data:
        sec.room_type = (data["room_type"] or "").strip()
    if "room_status" in data and data["room_status"]:
        sec.room_status = data["room_status"].strip()
    if "capacity" in data and data["capacity"] is not None:
        try:
            sec.capacity = max(1, int(data["capacity"]))
        except (ValueError, TypeError):
            pass
    if "supervisor_name" in data:
        sec.supervisor_name = (data["supervisor_name"] or "").strip()
    if "notes" in data:
        sec.notes = data["notes"]

    audit(request.user, "hotel_section_updated", "hotel_storeroom_sections", sec.id,
          old_vals, {"name": sec.name, "room_status": sec.room_status, "room_number": sec.room_number})
    db.session.commit()
    return jsonify({"message": f"Section '{sec.name}' updated successfully", "data": _serialize_section(sec)})


@app.delete("/api/v1/operations/sections/<int:section_id>")
@operations_required
def delete_operations_section(section_id):
    sec = HotelStoreroomSection.query.get(section_id)
    if not sec:
        return error("Sub-section / Room not found", 404)

    # Detach assets and inventory items
    Asset.query.filter_by(section_id=sec.id).update({"section_id": None, "room_number": None})
    HotelInventoryItem.query.filter_by(section_id=sec.id).update({"section_id": None})

    name = sec.name
    db.session.delete(sec)
    audit(request.user, "hotel_section_deleted", "hotel_storeroom_sections", section_id, {"name": name}, None)
    db.session.commit()
    return jsonify({"message": f"Sub-section / Room '{name}' removed successfully"})


# ---------------- EQUIPMENT & STOCK ASSIGNMENT ----------------
@app.post("/api/v1/operations/sections/<int:section_id>/assign-equipment")
@operations_required
def assign_operations_equipment(section_id):
    sec = HotelStoreroomSection.query.get(section_id)
    if not sec:
        return error("Sub-section / Room not found", 404)
    data = request.get_json(silent=True) or {}

    asset_id = data.get("asset_id")
    if asset_id:
        asset = Asset.query.get(asset_id)
        if not asset:
            return error("Selected equipment asset not found", 404)
        asset.storeroom_id = sec.storeroom_id
        asset.section_id = sec.id
        asset.room_number = sec.room_number or data.get("room_number") or ""
        if "condition" in data and data["condition"]:
            asset.condition = data["condition"]
        if "status" in data and data["status"]:
            asset.status = data["status"]
        else:
            asset.status = "in_use"
    else:
        name = (data.get("name") or "").strip()
        if not name:
            return error("Equipment name is required", 400)
        tag = (data.get("tag") or "").strip().upper()
        if not tag:
            prefix = f"EQP-{sec.room_number}" if sec.room_number else f"EQP-{sec.id}"
            tag = f"{prefix}-{secrets.token_hex(2).upper()}"
        existing = Asset.query.filter_by(tag=tag).first()
        if existing:
            tag = f"{tag}-{secrets.token_hex(2).upper()}"

        try:
            val = Decimal(str(data.get("value") or 0))
        except (InvalidOperation, TypeError):
            val = Decimal(0)

        asset = Asset(
            name=name,
            tag=tag,
            category=data.get("category") or "Hospitality Electronics & Appliances",
            serial_no=data.get("serial_no") or f"SN-{secrets.token_hex(4).upper()}",
            condition=data.get("condition") or "operational",
            status=data.get("status") or "in_use",
            value=val,
            storeroom_id=sec.storeroom_id,
            section_id=sec.id,
            room_number=sec.room_number or "",
            notes=data.get("notes") or f"Placed in {sec.name}",
        )
        db.session.add(asset)

    db.session.flush()
    audit(request.user, "hotel_equipment_placed", "assets", asset.id,
          None, {"section_id": sec.id, "room_number": sec.room_number, "equipment_name": asset.name})
    db.session.commit()
    return jsonify({"message": f"Equipment '{asset.name}' placed in {sec.name} successfully", "data": _serialize_equipment(asset)})


@app.post("/api/v1/operations/sections/<int:section_id>/remove-equipment/<int:asset_id>")
@operations_required
def remove_operations_equipment(section_id, asset_id):
    asset = Asset.query.filter_by(id=asset_id, section_id=section_id).first()
    if not asset:
        return error("Equipment not found in this section / room", 404)
    asset.section_id = None
    asset.room_number = None
    asset.status = "available"
    db.session.commit()
    return jsonify({"message": f"Equipment '{asset.name}' unassigned from room / space successfully"})


@app.post("/api/v1/operations/sections/<int:section_id>/assign-stock")
@operations_required
def assign_operations_stock(section_id):
    sec = HotelStoreroomSection.query.get(section_id)
    if not sec:
        return error("Sub-section / Room not found", 404)
    data = request.get_json(silent=True) or {}

    item_id = data.get("item_id")
    if item_id:
        item = HotelInventoryItem.query.get(item_id)
        if not item:
            return error("Selected inventory item not found", 404)
        item.storeroom_id = sec.storeroom_id
        item.section_id = sec.id
        if "location" not in data or not data["location"]:
            item.location = f"{sec.storeroom.name} · {sec.name}" if sec.storeroom else sec.name
    else:
        name = (data.get("name") or "").strip()
        if not name:
            return error("Stock item name is required", 400)
        sku = (data.get("sku") or "").strip().upper()
        if not sku:
            sku = f"STK-{secrets.token_hex(3).upper()}"
        existing = HotelInventoryItem.query.filter_by(sku=sku).first()
        if existing:
            sku = f"{sku}-{secrets.token_hex(2).upper()}"

        try:
            cost = Decimal(str(data.get("unit_cost") or 0))
        except (InvalidOperation, TypeError):
            cost = Decimal(0)

        item = HotelInventoryItem(
            name=name,
            sku=sku,
            category=data.get("category") or "Guest Supplies",
            location=f"{sec.storeroom.name} · {sec.name}" if sec.storeroom else sec.name,
            storeroom_id=sec.storeroom_id,
            section_id=sec.id,
            current_stock=int(data.get("current_stock") or 10),
            reorder_level=int(data.get("reorder_level") or 5),
            ideal_par_level=int(data.get("ideal_par_level") or 30),
            unit=data.get("unit") or "units",
            unit_cost=cost,
            supplier=data.get("supplier") or "Hospitality Vendor",
            status="in_stock" if int(data.get("current_stock") or 10) > int(data.get("reorder_level") or 5) else "low_stock",
            icon=data.get("icon") or "box",
            notes=data.get("notes") or "",
        )
        db.session.add(item)

    db.session.flush()
    audit(request.user, "hotel_stock_assigned", "hotel_inventory_items", item.id,
          None, {"section_id": sec.id, "item_name": item.name})
    db.session.commit()
    return jsonify({"message": f"Stock '{item.name}' allocated to {sec.name} successfully", "data": _serialize_stock_item(item)})


@app.post("/api/v1/operations/sections/<int:section_id>/remove-stock/<int:item_id>")
@operations_required
def remove_operations_stock(section_id, item_id):
    item = HotelInventoryItem.query.filter_by(id=item_id, section_id=section_id).first()
    if not item:
        return error("Stock item not found in this section", 404)
    item.section_id = None
    db.session.commit()
    return jsonify({"message": f"Stock item '{item.name}' unlinked from section"})


@app.get("/api/v1/operations/equipment")
@operations_required
def get_operations_equipment():
    assets = Asset.query.order_by(Asset.id.desc()).all()
    return jsonify({"data": [_serialize_equipment(a) for a in assets]})



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

    data["hod_id"] = emp.hod_id
    data["hod_name"] = emp.hod.full_name if emp.hod else None
    data["hod_card"] = {
        "id": emp.hod.id,
        "name": emp.hod.full_name,
        "title": emp.hod.designation.title if emp.hod.designation else "Head of Department",
        "department": emp.hod.department.name if emp.hod.department else "",
        "email": emp.hod.email,
        "photo_url": emp.hod.photo_url,
    } if emp.hod else None

    data["accountant_id"] = emp.accountant_id
    data["accountant_name"] = emp.accountant.full_name if emp.accountant else None
    data["accountant_card"] = {
        "id": emp.accountant.id,
        "name": emp.accountant.full_name,
        "title": emp.accountant.designation.title if emp.accountant.designation else "Accountant",
        "department": emp.accountant.department.name if emp.accountant.department else "",
        "email": emp.accountant.email,
        "photo_url": emp.accountant.photo_url,
    } if emp.accountant else None

    data["md_id"] = emp.md_id
    data["md_name"] = emp.md.full_name if emp.md else None
    data["md_card"] = {
        "id": emp.md.id,
        "name": emp.md.full_name,
        "title": emp.md.designation.title if emp.md.designation else "Managing Director",
        "department": emp.md.department.name if emp.md.department else "",
        "email": emp.md.email,
        "photo_url": emp.md.photo_url,
    } if emp.md else None

    data["signature_url"] = emp.signature_url

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
        "username": linked_user.username or linked_user.email.split("@")[0],
        "email": linked_user.email,
        "role": linked_user.role.name if linked_user.role else None,
        "role_slug": linked_user.role.slug if linked_user.role else None,
        "status": linked_user.status,
        "mfa_enabled": bool(linked_user.mfa_enabled),
        "must_change_password": bool(linked_user.must_change_password),
        "last_login_at": conv(linked_user.last_login_at),
    } if linked_user else None

    letter_obj = letters.ensure_letter_for_employee(emp)
    tpl_meta = letters.get_merged_templates().get(letter_obj.category_key, {})
    data["employment_letter"] = {
        "id": letter_obj.id,
        "reference_no": letter_obj.reference_no,
        "category_key": letter_obj.category_key,
        "category_label": tpl_meta.get("label", emp.contract_type),
        "letter_title": letter_obj.letter_title or tpl_meta.get("letter_title", "Employment Letter"),
        "staff_category": letter_obj.staff_category or emp.staff_category,
        "status": letter_obj.status,
        "accepted_at": conv(letter_obj.accepted_at),
        "accepted_signature": letter_obj.accepted_signature,
        "emailed_at": conv(letter_obj.emailed_at),
        "issue_date": conv(letter_obj.issue_date),
    }
    if linked_user and (is_self or role_of(request.user) in ("super_admin", "hr_admin", "hr_officer")):
        cred_dels = (
            NotificationDelivery.query.filter_by(user_id=linked_user.id)
            .filter(NotificationDelivery.event_key.in_(["account_credentials", "employment_letter"]))
            .order_by(NotificationDelivery.id.desc())
            .limit(5)
            .all()
        )
        data["credential_deliveries"] = [
            {
                "id": cd.id,
                "event_key": cd.event_key,
                "channel": cd.channel,
                "recipient": cd.recipient,
                "subject": cd.subject,
                "status": cd.status,
                "sent_at": conv(cd.sent_at or cd.created_at),
            }
            for cd in cred_dels
        ]
    else:
        data["credential_deliveries"] = []

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
        ent = float(b.entitled or 0)
        carr = float(b.carried_over or 0)
        tk = float(b.taken or 0)
        pd = float(b.pending or 0)
        tot = ent + carr
        rem = max(0.0, tot - tk - pd)
        avail = max(0.0, tot - tk)
        carry_next = rem
        item["entitled"] = ent
        item["carried_over"] = carr
        item["total_allocation"] = tot
        item["taken"] = tk
        item["pending"] = pd
        item["remaining"] = rem
        item["available"] = avail
        item["carry_over_next_year"] = carry_next
        if b.leave_type:
            item["color"] = b.leave_type.color
            item["code"] = b.leave_type.code
            item["paid"] = bool(b.leave_type.paid)
            item["leave_type_name"] = b.leave_type.name
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
        "hod_id", "accountant_id", "md_id", "signature_url",
    }
    old, updated = {}, {}
    for k in allowed_fields:
        if k in data:
            old[k] = conv(getattr(emp, k))
            val = parse_value(Employee, k, data[k])
            if k in ("hod_id", "accountant_id", "md_id") and (val == 0 or val == "0" or val == ""):
                val = None
            setattr(emp, k, val)
            updated[k] = conv(val)
    audit(request.user, "self_profile_update", "employees", emp.id, old=old, new=updated)
    db.session.commit()
    return jsonify({"data": serialize(emp, "employees")})


def _save_data_or_file(subfolder, prefix, eid):
    """Save an uploaded file or base64 data URL into uploads/<subfolder>/"""
    target_dir = os.path.join(UPLOADS_DIR, subfolder)
    os.makedirs(target_dir, exist_ok=True)
    
    # 1. Check multipart file
    for file_key in ("file", "image", "photo", "signature"):
        f = request.files.get(file_key)
        if f and f.filename:
            raw = f.read(5 * 1024 * 1024 + 1)
            if not raw:
                return None, "Uploaded file is empty"
            if len(raw) > 5 * 1024 * 1024:
                return None, "File exceeds 5MB size limit"
            ext = _detect_image_ext(raw, f.filename) or ".png"
            fname = f"{prefix}_{eid}_{secrets.token_hex(6)}{ext}"
            fpath = os.path.join(target_dir, fname)
            with open(fpath, "wb") as out:
                out.write(raw)
            return f"/uploads/{subfolder}/{fname}", None

    # 2. Check JSON or form body
    body = request.get_json(silent=True) or request.form.to_dict() or {}
    raw_str = (body.get("data") or body.get("image") or body.get("photo") or 
               body.get("signature") or body.get("photo_url") or body.get("signature_url"))
    if raw_str and isinstance(raw_str, str):
        raw_str = raw_str.strip()
        if raw_str.startswith("data:image/") and ";base64," in raw_str:
            meta, b64 = raw_str.split(";base64,", 1)
            ext = ".png"
            if "jpeg" in meta or "jpg" in meta:
                ext = ".jpg"
            elif "webp" in meta:
                ext = ".webp"
            elif "svg" in meta:
                ext = ".svg"
            try:
                raw_bytes = base64.b64decode(b64)
            except Exception:
                return None, "Invalid base64 image data"
            if len(raw_bytes) > 5 * 1024 * 1024:
                return None, "Image exceeds 5MB size limit"
            fname = f"{prefix}_{eid}_{secrets.token_hex(6)}{ext}"
            fpath = os.path.join(target_dir, fname)
            with open(fpath, "wb") as out:
                out.write(raw_bytes)
            return f"/uploads/{subfolder}/{fname}", None
        elif raw_str.startswith("http://") or raw_str.startswith("https://") or raw_str.startswith("/uploads/"):
            return raw_str, None

    return None, "No file or valid image data received"


@app.post("/api/v1/employees/<int:eid>/upload-photo")
@login_required
def upload_employee_photo(eid):
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Employee not found", 404)
    is_self = (request.user.employee_id == eid)
    is_hr = role_of(request.user) in ("super_admin", "hr_admin", "hr_officer")
    if not is_self and not is_hr:
        return error("Forbidden", 403)
    
    url, err_msg = _save_data_or_file("profiles", "emp_photo", eid)
    if not url:
        return error(err_msg or "Failed to upload photo", 400)
    
    old_url = emp.photo_url
    emp.photo_url = url
    audit(request.user, "upload_photo", "employees", emp.id, old={"photo_url": old_url}, new={"photo_url": url})
    db.session.commit()
    return jsonify({"message": "Profile photo updated successfully", "photo_url": url, "data": serialize(emp, "employees")})


@app.post("/api/v1/employees/<int:eid>/upload-signature")
@login_required
def upload_employee_signature(eid):
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Employee not found", 404)
    is_self = (request.user.employee_id == eid)
    is_hr = role_of(request.user) in ("super_admin", "hr_admin", "hr_officer")
    if not is_self and not is_hr:
        return error("Forbidden", 403)
    
    url, err_msg = _save_data_or_file("signatures", "emp_sig", eid)
    if not url:
        return error(err_msg or "Failed to upload signature", 400)
    
    old_url = emp.signature_url
    emp.signature_url = url
    audit(request.user, "upload_signature", "employees", emp.id, old={"signature_url": old_url}, new={"signature_url": url})
    db.session.commit()
    return jsonify({"message": "Signature updated successfully", "signature_url": url, "data": serialize(emp, "employees")})


# ---------------------------------------------------------------- credentials & employment letters

def _can_access_employee_letter(user, emp):
    role = role_of(user)
    if role in ("super_admin", "hr_admin", "hr_officer", "payroll", "auditor"):
        return True
    if user.employee_id == emp.id:
        return True
    if role == "manager" and emp.manager_id == user.employee_id:
        return True
    return False


@app.post("/api/v1/employees/<int:eid>/send-credentials")
@login_required
def send_employee_credentials(eid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("You do not have permission to send login credentials", 403)
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Employee not found", 404)
    if not (emp.email or emp.personal_email):
        return error("Employee does not have a registered email address on file", 422)
    data = request.get_json(silent=True) or {}
    dispatch = provision_employee_onboarding(
        emp,
        data=data,
        actor=request.user,
        reset_existing=True,
        send_email_flag=True,
    )
    audit(request.user, "send_credentials", "employees", emp.id,
          new={"email": dispatch.get("email"), "username": dispatch.get("username"), "status": dispatch.get("email_status")})
    db.session.commit()
    return jsonify({"data": dispatch})


@app.post("/api/v1/employees/send-credentials-bulk")
@login_required
def send_credentials_bulk():
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    ids = data.get("ids")
    only_missing = bool(data.get("only_missing_accounts", True))
    q = Employee.query.filter(Employee.deleted_at.is_(None), Employee.status.in_(["active", "probation"]))
    if isinstance(ids, list) and ids:
        q = q.filter(Employee.id.in_([int(x) for x in ids]))
    results = []
    for emp in q.all():
        if only_missing and User.query.filter_by(employee_id=emp.id).first():
            continue
        if not (emp.email or emp.personal_email):
            continue
        res = provision_employee_onboarding(
            emp, data={}, actor=request.user, reset_existing=not only_missing, send_email_flag=True
        )
        results.append(res)
    audit(request.user, "send_credentials_bulk", "employees", None, new={"count": len(results)})
    db.session.commit()
    return jsonify({"data": {"sent": len(results), "results": results}})


@app.get("/api/v1/employment-letters")
@login_required
def list_employment_letters():
    role = role_of(request.user)
    q = Employee.query.filter(Employee.deleted_at.is_(None))
    if role == "employee":
        q = q.filter(Employee.id == (request.user.employee_id or 0))
    elif role == "manager":
        team_ids = [request.user.employee_id] + [
            e.id for e in Employee.query.filter_by(manager_id=request.user.employee_id).all()
        ]
        q = q.filter(Employee.id.in_([i for i in team_ids if i]))
    category_filter = (request.args.get("category") or "").strip().lower()
    staff_filter = (request.args.get("staff_category") or "").strip()
    search_q = (request.args.get("q") or "").strip().lower()

    emps = q.order_by(Employee.id.desc()).all()
    templates = letters.get_merged_templates()
    user_map = {u.employee_id: u for u in User.query.filter(User.deleted_at.is_(None)).all()}
    items = []
    summary_by_cat = {k: 0 for k in templates.keys()}
    dirty = False
    for emp in emps:
        let = EmploymentLetter.query.filter_by(employee_id=emp.id).order_by(EmploymentLetter.id.desc()).first()
        if not let:
            let = letters.ensure_letter_for_employee(emp)
            dirty = True
        cat_key = let.category_key if let.category_key in templates else letters.infer_category_key(emp)
        tpl = templates[cat_key]
        summary_by_cat[cat_key] = summary_by_cat.get(cat_key, 0) + 1
        staff_cat = let.staff_category or emp.staff_category or letters.infer_staff_category(emp)
        if category_filter and cat_key != category_filter:
            continue
        if staff_filter and staff_cat != staff_filter:
            continue
        hay = " ".join([
            emp.full_name, emp.employee_no, emp.email or "", let.reference_no or "",
            tpl["label"], staff_cat, emp.department.name if emp.department else "",
            emp.designation.title if emp.designation else "",
        ]).lower()
        if search_q and search_q not in hay:
            continue
        lu = user_map.get(emp.id)
        items.append({
            "id": let.id,
            "employee_id": emp.id,
            "employee_no": emp.employee_no,
            "employee_name": emp.full_name,
            "email": emp.email,
            "photo_url": emp.photo_url,
            "department_name": emp.department.name if emp.department else "—",
            "designation_title": emp.designation.title if emp.designation else "—",
            "reference_no": let.reference_no,
            "category_key": cat_key,
            "category_label": tpl["label"],
            "category_badge": tpl["badge"],
            "category_tone": tpl["tone"],
            "staff_category": staff_cat,
            "letter_title": let.letter_title or tpl["letter_title"],
            "effective_date": conv(let.effective_date or emp.hire_date),
            "end_date": conv(let.end_date or emp.end_date),
            "basic_salary": float(emp.basic_salary or 0) if (role in ("super_admin", "hr_admin", "hr_officer", "payroll", "auditor") or request.user.employee_id == emp.id) else None,
            "status": let.status or "issued",
            "accepted_at": conv(let.accepted_at),
            "accepted_signature": let.accepted_signature,
            "emailed_at": conv(let.emailed_at),
            "has_account": bool(lu),
            "username": lu.username if lu else None,
        })
    if dirty:
        db.session.commit()
    return jsonify({
        "data": items,
        "categories": letters.category_options(),
        "staff_categories": letters.STAFF_CATEGORIES,
        "summary_by_category": summary_by_cat,
    })


@app.get("/api/v1/employment-letters/templates")
@login_required
def get_letter_templates():
    templates = letters.get_merged_templates()
    return jsonify({
        "data": [templates[k] for k in letters.EMPLOYMENT_CATEGORIES.keys()],
        "staff_categories": letters.STAFF_CATEGORIES,
    })


@app.put("/api/v1/employment-letters/templates/<category_key>")
@login_required
def update_letter_template(category_key):
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    try:
        saved = letters.save_template_override(category_key, data)
    except ValueError as e:
        return error(str(e), 422)
    audit(request.user, "update_letter_template", "settings", None, new={"category": category_key})
    db.session.commit()
    return jsonify({"data": saved})


@app.get("/api/v1/employees/<int:eid>/employment-letter")
@login_required
def get_employee_letter(eid):
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Employee not found", 404)
    if not _can_access_employee_letter(request.user, emp):
        return error("You do not have permission to view this employment letter", 403)
    preview_cat = (request.args.get("category_key") or "").strip().lower()
    letter_obj = letters.ensure_letter_for_employee(emp)
    db.session.commit()
    if preview_cat and preview_cat in letters.EMPLOYMENT_CATEGORIES and preview_cat != letter_obj.category_key:
        # Non-destructive category preview for HR editing
        orig_cat = letter_obj.category_key
        letter_obj.category_key = preview_cat
        payload = letters.build_letter_payload(emp, letter=letter_obj, standalone=False)
        db.session.rollback()
    else:
        payload = letters.build_letter_payload(emp, letter=letter_obj, standalone=False)
    payload["can_customize"] = role_of(request.user) in ("super_admin", "hr_admin", "hr_officer")
    payload["can_accept"] = (request.user.employee_id == emp.id) or role_of(request.user) in ("super_admin", "hr_admin", "hr_officer")
    payload["categories"] = letters.category_options()
    payload["staff_categories"] = letters.STAFF_CATEGORIES
    return jsonify({"data": payload})


@app.put("/api/v1/employees/<int:eid>/employment-letter")
@login_required
def update_employee_letter(eid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Employee not found", 404)
    data = request.get_json(silent=True) or {}
    letter_obj = letters.ensure_letter_for_employee(emp)
    if data.get("category_key") in letters.EMPLOYMENT_CATEGORIES:
        new_cat = data["category_key"]
        if letter_obj.category_key != new_cat:
            tpl = letters.get_merged_templates()[new_cat]
            letter_obj.category_key = new_cat
            emp.contract_type = new_cat
            if not data.get("letter_title"):
                letter_obj.letter_title = tpl["letter_title"]
            if not data.get("subject_line"):
                letter_obj.subject_line = None
            if not data.get("working_hours"):
                letter_obj.working_hours = tpl["working_hours"]
            if not data.get("notice_period"):
                letter_obj.notice_period = tpl["notice_period"]
            if data.get("probation_months") is None:
                letter_obj.probation_months = tpl.get("probation_months", 0)
    if "staff_category" in data and data["staff_category"]:
        letter_obj.staff_category = str(data["staff_category"]).strip()
        emp.staff_category = letter_obj.staff_category
    for str_fld in ("letter_title", "subject_line", "working_hours", "notice_period",
                    "custom_clauses", "signatory_name", "signatory_title"):
        if str_fld in data:
            val = data[str_fld]
            setattr(letter_obj, str_fld, str(val).strip() if val is not None else None)
    if "probation_months" in data and data["probation_months"] != "":
        letter_obj.probation_months = int(data["probation_months"])
    for dt_fld in ("issue_date", "effective_date", "end_date"):
        if dt_fld in data:
            setattr(letter_obj, dt_fld, date.fromisoformat(str(data[dt_fld])[:10]) if data[dt_fld] else None)
    if "end_date" in data:
        emp.end_date = letter_obj.end_date
    audit(request.user, "update_employment_letter", "employment_letters", letter_obj.id)
    db.session.commit()
    return jsonify({"data": letters.build_letter_payload(emp, letter=letter_obj, standalone=False)})


@app.post("/api/v1/employees/<int:eid>/employment-letter/accept")
@login_required
def accept_employee_letter(eid):
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Employee not found", 404)
    if request.user.employee_id != emp.id and role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Only the named employee or HR can sign this letter", 403)
    data = request.get_json(silent=True) or {}
    signature = (data.get("signature") or emp.full_name).strip()
    if len(signature) < 2:
        return error("Please enter your full name as signature", 422)
    letter_obj = letters.ensure_letter_for_employee(emp)
    letter_obj.status = "accepted"
    letter_obj.accepted_at = datetime.utcnow()
    letter_obj.accepted_signature = signature
    letter_obj.accepted_ip = request.remote_addr
    audit(request.user, "accept_employment_letter", "employment_letters", letter_obj.id,
          new={"signature": signature})
    db.session.commit()
    return jsonify({"data": letters.build_letter_payload(emp, letter=letter_obj, standalone=False)})


@app.post("/api/v1/employees/<int:eid>/employment-letter/send")
@login_required
def send_employee_letter_email(eid):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Employee not found", 404)
    target = (emp.email or emp.personal_email or "").strip()
    if not target:
        return error("Employee has no email address on file", 422)
    letter_obj = letters.ensure_letter_for_employee(emp)
    payload = letters.build_letter_payload(emp, letter=letter_obj, standalone=False)
    comp = Company.query.first()
    comp_legal = (comp.legal_name or comp.name) if comp else "Meridian HR"
    portal_link = public_app_link("/employment-letters")
    subj = f"{payload['letter_title']} — {emp.full_name} ({letter_obj.reference_no})"
    body_txt = (
        f"Dear {emp.full_name},\n\n"
        f"Please find attached/linked your official {payload['category_label']} Employment Letter "
        f"(Ref: {letter_obj.reference_no}) from {comp_legal} for your appointment as "
        f"{payload['designation_title']} in {payload['department_name']}.\n\n"
        f"Open your HR portal to view, digitally accept, and print or save your Employment Letter as PDF:\n"
        f"{portal_link}"
    )
    html_doc = messaging.html_email(
        payload["letter_title"],
        f"Dear {emp.first_name}, your official {payload['category_label']} Appointment Letter "
        f"from {comp_legal} has been issued and is enclosed below. Sign in to the HR Portal at any time "
        f"to countersign and print or save a PDF copy.",
        link=portal_link,
        meta_rows=[
            ("Reference No.", letter_obj.reference_no),
            ("Employment Category", f"{payload['category_label']} ({payload['staff_category']})"),
            ("Position & Department", f"{payload['designation_title']} · {payload['department_name']}"),
            ("Effective Start Date", payload["effective_date"] or "—"),
        ],
        badge=payload["category_badge"],
        action_label="Open Portal to Sign & Print PDF",
        extra_html=f'<div style="margin-top:20px;border-top:2px solid #e6e0d5;padding-top:18px">{payload["html"]}</div>',
    )
    linked_user = User.query.filter_by(employee_id=emp.id).first()
    notif = None
    if linked_user:
        notif = Notification(
            user_id=linked_user.id,
            title=f"Official {payload['category_label']} Letter Sent",
            body=f"Ref {letter_obj.reference_no} was emailed to {target}. Click to view or print.",
            link="/employment-letters",
            category="Onboarding",
            event_key="employment_letter",
        )
        db.session.add(notif)
        db.session.flush()
    res = messaging.send_email(target, subj, body_txt, html_doc)
    rec = _record_delivery(
        res, linked_user, "employment_letter", "email", target, subj,
        body=body_txt, html_body=html_doc, notification_id=notif.id if notif else None,
    )
    letter_obj.emailed_at = datetime.utcnow()
    audit(request.user, "email_employment_letter", "employment_letters", letter_obj.id,
          new={"recipient": target, "status": res.get("status")})
    db.session.commit()
    return jsonify({
        "data": {
            "ok": bool(res.get("ok")),
            "status": res.get("status"),
            "error": res.get("error"),
            "recipient": target,
            "delivery_id": rec.id if rec else None,
            "mode": messaging.config().get("email_mode", "sandbox"),
        }
    })


@app.get("/api/v1/employees/<int:eid>/employment-letter/print")
@login_required
def print_employee_letter(eid):
    emp = db.session.get(Employee, eid)
    if not emp or emp.deleted_at is not None:
        return error("Employee not found", 404)
    if not _can_access_employee_letter(request.user, emp):
        return error("Forbidden", 403)
    letter_obj = letters.ensure_letter_for_employee(emp)
    db.session.commit()
    auto_p = str(request.args.get("auto_print", "1")).lower() in ("1", "true", "yes")
    payload = letters.build_letter_payload(emp, letter=letter_obj, standalone=True, auto_print=auto_p)
    resp = app.make_response(payload["standalone_html"])
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    return resp


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
                company_id=1, status="active",
                contract_type=row.get("contract_type", "permanent"),
                staff_category=row.get("staff_category") or None,
            )
            db.session.add(emp)
            db.session.flush()
            provision_employee_onboarding(emp, data=row, actor=request.user, send_email_flag=True)
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

    # Ensure default balances exist for this employee for this year
    types = LeaveType.query.all()
    created_any = False
    for lt in types:
        b = LeaveBalance.query.filter_by(employee_id=emp_id, leave_type_id=lt.id, year=year).first()
        if not b:
            days = 30.0 if lt.code == "ANL" else float(lt.days_per_year or 0)
            b = LeaveBalance(employee_id=emp_id, leave_type_id=lt.id, year=year,
                             entitled=days, taken=0, pending=0, carried_over=0)
            db.session.add(b)
            created_any = True
    if created_any:
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

    balances = LeaveBalance.query.filter_by(employee_id=emp_id, year=year).all()
    out = []
    anl_entitled = 30.0
    anl_carried = 0.0
    anl_taken = 0.0
    anl_pending = 0.0

    for b in balances:
        item = serialize(b, "leave-balances")
        ent = float(b.entitled or 0)
        carr = float(b.carried_over or 0)
        tk = float(b.taken or 0)
        pd = float(b.pending or 0)
        tot = ent + carr
        rem = max(0.0, tot - tk - pd)
        avail = max(0.0, tot - tk)
        carry_next = rem
        item["entitled"] = ent
        item["carried_over"] = carr
        item["total_allocation"] = tot
        item["taken"] = tk
        item["pending"] = pd
        item["remaining"] = rem
        item["available"] = avail
        item["carry_over_next_year"] = carry_next
        if b.leave_type:
            item["code"] = b.leave_type.code
            item["color"] = b.leave_type.color
            item["paid"] = bool(b.leave_type.paid)
            item["leave_type_name"] = b.leave_type.name
            if b.leave_type.code == "ANL":
                anl_entitled = ent
                anl_carried = carr
                anl_taken = tk
                anl_pending = pd
        out.append(item)

    anl_total = anl_entitled + anl_carried
    anl_remaining = max(0.0, anl_total - anl_taken - anl_pending)
    anl_available = max(0.0, anl_total - anl_taken)

    metrics = {
        "annual_entitlement": anl_entitled,
        "carried_over_from_prior_year": anl_carried,
        "total_allocation": anl_total,
        "taken": anl_taken,
        "pending": anl_pending,
        "available": anl_available,
        "remaining": anl_remaining,
        "carry_over_to_next_year": anl_remaining,
    }
    return jsonify({"data": out, "metrics": metrics})


@app.post("/api/v1/leave/carry-over")
@login_required
def set_leave_carry_over():
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    data = request.get_json(silent=True) or {}
    emp_id = data.get("employee_id")
    leave_type_id = data.get("leave_type_id")
    year = data.get("year", date.today().year)
    carried = float(data.get("carried_over", 0))
    if not emp_id or not leave_type_id:
        return error("employee_id and leave_type_id are required", 400)
    bal = LeaveBalance.query.filter_by(employee_id=emp_id, leave_type_id=leave_type_id, year=year).first()
    if not bal:
        bal = LeaveBalance(employee_id=emp_id, leave_type_id=leave_type_id, year=year,
                           entitled=30.0, taken=0, pending=0, carried_over=carried)
        db.session.add(bal)
    else:
        bal.carried_over = carried
    db.session.commit()
    return jsonify({"message": "Carry over updated", "data": serialize(bal, "leave-balances")})


@app.post("/api/v1/leave-requests/<int:rid>/approve-level")
@login_required
def approve_leave_level(rid):
    """Multi-level approval: HOD -> Accountant -> Managing Director"""
    user = request.user
    lr = db.session.get(LeaveRequest, rid)
    if not lr:
        return error("Not found", 404)
    
    role = role_of(user)
    emp = user.employee
    req_emp = db.session.get(Employee, lr.employee_id) if lr.employee_id else None
    data = request.get_json(silent=True) or {}
    approval_level = data.get("level")  # "hod", "accountant", "md"
    
    # Check if user has permission to approve at this level
    can_approve_hod = (
        role in ("super_admin", "hr_admin") or 
        (req_emp and req_emp.hod_id and req_emp.hod_id == user.employee_id) or
        (req_emp and not req_emp.hod_id and req_emp.manager_id and req_emp.manager_id == user.employee_id) or
        (role == "manager" and req_emp and req_emp.manager_id == user.employee_id) or
        (emp and emp.designation and emp.designation.title and "head" in emp.designation.title.lower())
    )
    can_approve_accountant = (
        role in ("super_admin", "hr_admin") or
        (req_emp and req_emp.accountant_id and req_emp.accountant_id == user.employee_id) or
        (emp and emp.designation and emp.designation.title and "accountant" in emp.designation.title.lower())
    )
    can_approve_md = (
        role in ("super_admin",) or
        (req_emp and req_emp.md_id and req_emp.md_id == user.employee_id) or
        (emp and emp.designation and emp.designation.title and
         ("managing director" in emp.designation.title.lower() or 
          "md" in emp.designation.title.lower() or
          "chief executive" in emp.designation.title.lower() or
          "ceo" in emp.designation.title.lower()))
    )
    
    # Optional signature provided in payload, fallback to approver's profile signature
    sig_url = data.get("signature_url") or (emp.signature_url if emp else None)
    
    if approval_level == "hod" and can_approve_hod:
        if lr.hod_approved_at:
            return error("HOD has already approved this request", 409)
        lr.hod_approved_by = user.employee_id
        lr.hod_approved_at = datetime.utcnow()
        if sig_url:
            lr.hod_signature = sig_url
        toast_msg = "Leave approved by Head of Department"
    elif approval_level == "accountant" and can_approve_accountant:
        if not lr.hod_approved_at:
            return error("HOD must approve first", 403)
        if lr.accountant_approved_at:
            return error("Accountant has already approved this request", 409)
        lr.accountant_approved_by = user.employee_id
        lr.accountant_approved_at = datetime.utcnow()
        if sig_url:
            lr.accountant_signature = sig_url
        toast_msg = "Leave approved by Accountant"
    elif approval_level == "md" and can_approve_md:
        if not lr.hod_approved_at or not lr.accountant_approved_at:
            return error("HOD and Accountant must approve first", 403)
        if lr.md_approved_at:
            return error("MD has already approved this request", 409)
        lr.md_approved_by = user.employee_id
        lr.md_approved_at = datetime.utcnow()
        if sig_url:
            lr.md_signature = sig_url
        lr.status = "approved"
        lr.approver_id = user.employee_id
        lr.decided_at = datetime.utcnow()
        toast_msg = "Leave fully approved by Managing Director"
        
        # Update leave balance and attendance
        year = lr.start_date.year
        bal = LeaveBalance.query.filter_by(employee_id=lr.employee_id, leave_type_id=lr.leave_type_id,
                                           year=year).first()
        if bal:
            bal.pending = max(Decimal("0"), Decimal(bal.pending or 0) - Decimal(lr.days or 0))
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
        
        # Notify employee
        requester = user_for_employee(lr.employee_id)
        if requester:
            dispatch_event(
                "leave_decision", [requester],
                "Leave Approved",
                f"Your {lr.leave_type.name if lr.leave_type else 'leave'} request ({lr.days} day(s), {lr.start_date} to {lr.end_date}) has been fully approved.",
                "/leave",
            )
    else:
        return error("You do not have permission to approve at this level", 403)
    
    audit(user, f"leave_approve_{approval_level}", "leave_requests", lr.id)
    db.session.commit()
    return jsonify({"data": serialize(lr, "leave-requests"), "message": toast_msg})


@app.post("/api/v1/leave-requests/<int:rid>/reject-level")
@login_required
def reject_leave_level(rid):
    """Reject at any level stops the approval chain"""
    user = request.user
    lr = db.session.get(LeaveRequest, rid)
    if not lr:
        return error("Not found", 404)
    
    role = role_of(user)
    data = request.get_json(silent=True) or {}
    
    # Any approver can reject
    can_reject = (role in ("super_admin", "hr_admin", "manager") or 
                  lr.approver_id == user.employee_id)
    
    if not can_reject:
        return error("You do not have permission to reject this request", 403)
    
    if lr.status != "pending":
        return error("This request has already been decided", 409)
    
    lr.status = "rejected"
    lr.approver_id = user.employee_id
    lr.decided_at = datetime.utcnow()
    lr.decision_note = data.get("note")
    
    # Update leave balance
    year = lr.start_date.year
    bal = LeaveBalance.query.filter_by(employee_id=lr.employee_id, leave_type_id=lr.leave_type_id,
                                       year=year).first()
    if bal:
        bal.pending = max(Decimal("0"), Decimal(bal.pending or 0) - Decimal(lr.days or 0))
    
    # Notify employee
    requester = user_for_employee(lr.employee_id)
    if requester:
        dispatch_event(
            "leave_decision", [requester],
            "Leave Rejected",
            f"Your {lr.leave_type.name if lr.leave_type else 'leave'} request ({lr.days} day(s), {lr.start_date} to {lr.end_date}) was rejected. Reason: {lr.decision_note or 'Not specified'}",
            "/leave",
        )
    
    audit(user, "leave_rejected", "leave_requests", lr.id)
    db.session.commit()
    return jsonify({"data": serialize(lr, "leave-requests")})


@app.get("/api/v1/leave-requests/<int:rid>/preview")
@login_required
def preview_leave_request(rid):
    """Return JSON with rendered HTML form for in-app preview modal"""
    lr = db.session.get(LeaveRequest, rid)
    if not lr:
        return error("Not found", 404)
    user = request.user
    role = role_of(user)
    if lr.employee_id != user.employee_id and role not in ("super_admin", "hr_admin", "hr_officer", "manager"):
        return error("You do not have permission to view this leave request", 403)
    
    from leave_form import build_leave_form_html
    html_content = build_leave_form_html(lr, standalone=False)
    return jsonify({
        "data": {
            "id": lr.id,
            "status": lr.status,
            "employee_id": lr.employee_id,
            "employee_name": lr.employee.full_name if lr.employee else "",
            "employee_no": lr.employee.employee_no if lr.employee else "",
            "leave_type": lr.leave_type.name if lr.leave_type else "",
            "start_date": lr.start_date.strftime("%Y-%m-%d") if lr.start_date else None,
            "end_date": lr.end_date.strftime("%Y-%m-%d") if lr.end_date else None,
            "days": float(lr.days or 0),
            "html": html_content,
        }
    })


@app.get("/api/v1/leave-requests/<int:rid>/print")
@login_required
def print_leave_request(rid):
    """Standalone printable HTML page matching the official Leave Request Form"""
    lr = db.session.get(LeaveRequest, rid)
    if not lr:
        return error("Not found", 404)
    user = request.user
    role = role_of(user)
    if lr.employee_id != user.employee_id and role not in ("super_admin", "hr_admin", "hr_officer", "manager"):
        return error("You do not have permission to print this leave request", 403)
    
    from leave_form import build_leave_form_html
    return build_leave_form_html(lr, standalone=True)


@app.get("/api/v1/leave-requests/<int:rid>/pdf")
@login_required
def download_leave_request_pdf(rid):
    """Generate official single-page PDF matching Airport West Hotel Leave Request Form"""
    user = request.user
    lr = db.session.get(LeaveRequest, rid)
    if not lr:
        return error("Not found", 404)
    
    role = role_of(user)
    if lr.employee_id != user.employee_id and role not in ("super_admin", "hr_admin", "hr_officer", "manager"):
        return error("You do not have permission to download this leave request", 403)
    
    from leave_form import build_leave_form_pdf
    pdf_bytes = build_leave_form_pdf(lr)
    buffer = io.BytesIO(pdf_bytes)
    
    emp = lr.employee
    filename = f"Leave_Request_{emp.employee_no or emp.id}_{lr.start_date.strftime('%Y%m%d') if lr.start_date else 'request'}.pdf"
    return send_file(
        buffer,
        as_attachment=True,
        download_name=filename,
        mimetype="application/pdf",
    )


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
    if run.status not in ("draft", "calculated"):
        return error("Only draft or calculated payroll runs can be recalculated", 409)
    clear_run_payslips(run)
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
    creds = provision_employee_onboarding(emp, actor=request.user, send_email_flag=True)
    audit(request.user, "candidate_hired", "applications", aid)
    db.session.commit()
    out = serialize(emp, "employees")
    out["credentials_dispatch"] = creds
    return jsonify({"data": out}), 201


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
            elif action == "set_status" and value in ("active", "probation", "on_leave", "suspended", "inactive", "terminated", "resigned"):
                emp.status = value
                lu = User.query.filter_by(employee_id=emp.id).first()
                if lu:
                    if value in ("active", "probation"):
                        lu.status = "active"
                        lu.deleted_at = None
                    else:
                        lu.status = "inactive"
                        lu.token = None
                        lu.token_expires_at = None
                processed += 1
            elif action == "delete":
                if request.user.employee_id == emp.id:
                    continue
                Department.query.filter_by(head_id=emp.id).update({Department.head_id: None})
                Employee.query.filter_by(manager_id=emp.id).update({Employee.manager_id: None})
                lu = User.query.filter_by(employee_id=emp.id).first()
                if lu:
                    lu.status = "inactive"
                    lu.token = None
                    lu.token_expires_at = None
                    lu.deleted_at = datetime.utcnow()
                emp.status = "inactive"
                emp.deleted_at = datetime.utcnow()
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


@app.get("/api/v1/messaging/deliveries/<int:did>")
@login_required
def get_delivery_detail(did):
    rec = db.session.get(NotificationDelivery, did)
    if not rec:
        return error("Not found", 404)
    role = role_of(request.user)
    if role not in ("super_admin", "hr_admin", "hr_officer", "auditor") and rec.user_id != request.user.id:
        return error("Forbidden", 403)
    d = serialize(rec)
    if rec.user_id:
        u = db.session.get(User, rec.user_id)
        d["recipient_name"] = u.employee.full_name if u and u.employee else (u.email if u else None)
    if not d.get("html_body") and rec.channel == "email":
        d["html_body"] = messaging.html_email(
            rec.subject or "Notification", rec.body or "", public_app_link("/notifications")
        )
    return jsonify({"data": d})


@app.post("/api/v1/messaging/deliveries/<int:did>/retry")
@login_required
def retry_delivery(did):
    if role_of(request.user) not in ("super_admin", "hr_admin", "hr_officer"):
        return error("Forbidden", 403)
    rec = db.session.get(NotificationDelivery, did)
    if not rec:
        return error("Not found", 404)
    body = rec.body or rec.subject or "Meridian HR notification"
    if rec.channel == "email":
        html_content = rec.html_body or messaging.html_email(
            rec.subject or "Notification", body, public_app_link("/notifications")
        )
        res = messaging.send_email(
            rec.recipient, rec.subject or "Meridian HR Notification", body, html_content,
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


_UPLOAD_MIMES = {
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
}


def _detect_image_ext(raw, orig_filename=""):
    """Validate raw image bytes and return a safe file extension, or None if invalid."""
    if not raw or len(raw) < 4:
        return None
    orig_ext = os.path.splitext(orig_filename or "")[1].lower()
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return ".ico" if orig_ext == ".ico" else ".png"
    if raw[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return ".webp"
    if raw[:4] in (b"\x00\x00\x01\x00", b"\x00\x00\x02\x00"):
        return ".ico"
    if raw[:2] == b"BM":
        return ".bmp"
    if len(raw) >= 12 and raw[4:8] == b"ftyp":
        return ".avif"
    # SVG vector check (UTF-8 text containing an <svg element)
    try:
        head = raw[:8192].decode("utf-8", errors="ignore").lstrip("\ufeff \t\r\n")
        if "<svg" in head.lower():
            return ".svg"
    except Exception:
        pass
    return None


def _cleanup_branding_file(url_path, comp=None):
    """Remove a previously uploaded branding asset if no longer referenced."""
    if not url_path or not isinstance(url_path, str):
        return
    clean_url = url_path.split("?", 1)[0].strip()
    if not clean_url.startswith("/uploads/branding/"):
        return
    if comp:
        still_used = {
            (comp.logo_url or "").split("?", 1)[0].strip(),
            (comp.favicon_url or "").split("?", 1)[0].strip(),
        }
        if clean_url in still_used:
            return
    rel_name = os.path.basename(clean_url)
    asset = BrandingAsset.query.filter_by(stored_name=rel_name).first()
    if asset:
        db.session.delete(asset)
        db.session.commit()
    candidate = os.path.realpath(os.path.join(BRANDING_UPLOAD_DIR, rel_name))
    root_real = os.path.realpath(BRANDING_UPLOAD_DIR)
    if candidate.startswith(root_real + os.sep) and os.path.isfile(candidate):
        try:
            os.remove(candidate)
        except OSError:
            pass


@app.post("/api/v1/uploads/branding")
@login_required
def upload_branding_asset():
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    kind = (request.form.get("kind") or "logo").strip().lower()
    if kind not in ("logo", "favicon"):
        return error("Invalid branding asset type", 400)
    f = request.files.get("file")
    if not f or not f.filename:
        return error("Please select an image file to upload", 400)
    raw = f.read(MAX_BRANDING_BYTES + 1)
    if not raw:
        return error("Uploaded file is empty", 400)
    if len(raw) > MAX_BRANDING_BYTES:
        return error("Image must be 5 MB or smaller", 400)
    ext = _detect_image_ext(raw, f.filename)
    if not ext:
        return error("Unsupported image format. Please upload PNG, JPG, SVG, WEBP, GIF, or ICO.", 400)

    safe_stem = secure_filename(os.path.splitext(f.filename)[0])[:32] or kind
    stored_name = f"{kind}_{safe_stem}_{secrets.token_hex(6)}{ext}"
    mime_type = _UPLOAD_MIMES.get(ext, "application/octet-stream")
    db.session.add(BrandingAsset(
        kind=kind,
        stored_name=stored_name,
        orig_filename=f.filename,
        mime_type=mime_type,
        content=raw,
    ))

    url = f"/uploads/branding/{stored_name}"
    comp = Company.query.first()
    if not comp:
        comp = Company(name="Meridian Ghana Ltd")
        db.session.add(comp)

    attr = "logo_url" if kind == "logo" else "favicon_url"
    old_url = getattr(comp, attr, None)
    if request.form.get("save", "1") != "0":
        setattr(comp, attr, url)
        audit(request.user, f"company_{kind}_uploaded", "companies", comp.id or 1, new={attr: url})
    db.session.commit()
    _cleanup_branding_file(old_url, comp)

    return jsonify({"data": {
        "kind": kind,
        "url": url,
        "filename": f.filename,
        "size": len(raw),
        "company": serialize(comp, "companies") if comp.id else {},
    }})


@app.delete("/api/v1/uploads/branding/<string:kind>")
@login_required
def delete_branding_asset(kind):
    if role_of(request.user) not in ("super_admin", "hr_admin"):
        return error("Forbidden", 403)
    kind = (kind or "").strip().lower()
    if kind not in ("logo", "favicon"):
        return error("Invalid branding asset type", 400)
    comp = Company.query.first()
    if not comp:
        return jsonify({"data": {"company": {}}})
    attr = "logo_url" if kind == "logo" else "favicon_url"
    old_url = getattr(comp, attr, None)
    setattr(comp, attr, None)
    audit(request.user, f"company_{kind}_removed", "companies", comp.id or 1)
    db.session.commit()
    _cleanup_branding_file(old_url, comp)
    return jsonify({"data": {"company": serialize(comp, "companies")}})


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
    old_logo = comp.logo_url
    old_favicon = comp.favicon_url
    for k in ("name", "legal_name", "country", "city", "location_name", "tagline", "currency", "timezone", "address",
              "phone", "email", "tax_id", "logo_url", "favicon_url", "theme", "website", "fax"):
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
    _cleanup_branding_file(old_logo, comp)
    _cleanup_branding_file(old_favicon, comp)
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
@app.get("/api/v1/company-events")
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
        "employees": [{"id": e.id, "name": e.full_name, "employee_no": e.employee_no,
                       "department_id": e.department_id, "designation_id": e.designation_id,
                       "hire_date": e.hire_date.isoformat() if e.hire_date else None}
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
        "session_timeout_minutes": SESSION_TIMEOUT_MINUTES,
        "employment_categories": letters.category_options(),
        "staff_categories": letters.STAFF_CATEGORIES,
    }})


# ---------------------------------------------------------------- database backups & recovery

BACKUP_DIR = os.path.join(BASE_DIR, "backups")
BACKUP_CONFIG_DEFAULTS = {"retention_count": 15, "auto_enabled": False, "interval_hours": 24}
BACKUP_TRIGGERS = {"manual": "Manual", "scheduled": "Scheduled", "pre_restore": "Pre-restore"}
_auto_backup_last_check = None


def super_admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        if role_of(request.user) != "super_admin":
            return error("Only Super Admin accounts can manage database backups", 403)
        return fn(*args, **kwargs)
    return wrapper


def _backup_dir():
    path = app.config.get("HRMS_BACKUP_DIR") or BACKUP_DIR
    os.makedirs(path, exist_ok=True)
    return path


def _backup_path(filename):
    # basename() keeps every snapshot inside the backups folder, whatever the input.
    return os.path.join(_backup_dir(), os.path.basename(str(filename)))


def _live_db_path():
    uri = app.config.get("SQLALCHEMY_DATABASE_URI") or ""
    if uri.startswith("sqlite:///"):
        return uri[len("sqlite:///"):]
    return None


def _sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sqlite_integrity_ok(path):
    conn = sqlite3.connect(path)
    try:
        row = conn.execute("PRAGMA integrity_check").fetchone()
        return bool(row) and row[0] == "ok"
    finally:
        conn.close()


def _backup_setting(key):
    row = Setting.query.filter_by(key="backup." + key).first()
    if row is None:
        return BACKUP_CONFIG_DEFAULTS[key]
    default = BACKUP_CONFIG_DEFAULTS[key]
    if isinstance(default, bool):
        return str(row.value).lower() in ("1", "true", "yes", "on")
    try:
        return int(row.value)
    except (TypeError, ValueError):
        return default


def _backup_config():
    return {key: _backup_setting(key) for key in BACKUP_CONFIG_DEFAULTS}


def _backup_creator_name(user_id):
    creator = db.session.get(User, user_id) if user_id else None
    if creator is None:
        return "System"
    emp = getattr(creator, "employee", None)
    return (emp.full_name if emp else None) or creator.email or "Unknown user"


def _backup_dict(row):
    return {
        "id": row.id,
        "filename": row.filename,
        "label": row.label,
        "trigger": row.trigger,
        "trigger_label": BACKUP_TRIGGERS.get(row.trigger, row.trigger),
        "status": row.status,
        "size_bytes": row.size_bytes or 0,
        "checksum_sha256": row.checksum_sha256,
        "duration_ms": row.duration_ms,
        "notes": row.notes,
        "created_at": conv(row.created_at),
        "created_by": row.created_by,
        "created_by_name": _backup_creator_name(row.created_by),
    }


def _create_db_backup(trigger="manual", label=None, user=None, notes=None):
    """Take a transaction-safe snapshot of the live SQLite database file.

    Uses the sqlite3 online backup API so the copy is consistent even while
    other threads keep serving requests.
    """
    live = _live_db_path()
    if not live or not os.path.exists(live):
        raise RuntimeError("Database backups require a file-based SQLite database")
    started = datetime.utcnow()
    filename = "hrms_" + started.strftime("%Y%m%d_%H%M%S") + "_" + secrets.token_hex(3) + ".db"
    target = _backup_path(filename)
    src = sqlite3.connect(live)
    try:
        dst = sqlite3.connect(target)
        try:
            with dst:
                src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    row = DatabaseBackup(
        filename=filename,
        label=(str(label).strip()[:180] if label else None),
        trigger=trigger,
        status="completed",
        size_bytes=os.path.getsize(target),
        checksum_sha256=_sha256_file(target),
        duration_ms=max(0, int((datetime.utcnow() - started).total_seconds() * 1000)),
        notes=(str(notes).strip()[:500] if notes else None),
    )
    row.created_by = user.id if user else None
    db.session.add(row)
    return row


def _prune_backups(keep=None):
    """Delete the oldest snapshots beyond the retention window; newest is always kept."""
    if keep is None:
        keep = _backup_setting("retention_count")
    try:
        keep = max(1, int(keep))
    except (TypeError, ValueError):
        keep = BACKUP_CONFIG_DEFAULTS["retention_count"]
    rows = DatabaseBackup.query.order_by(DatabaseBackup.created_at.desc(), DatabaseBackup.id.desc()).all()
    pruned = 0
    for row in rows[keep:]:
        try:
            path = _backup_path(row.filename)
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass
        db.session.delete(row)
        pruned += 1
    return pruned


@app.get("/api/v1/backups")
@super_admin_required
def list_backups():
    rows = DatabaseBackup.query.order_by(DatabaseBackup.created_at.desc(), DatabaseBackup.id.desc()).all()
    live = _live_db_path()
    live_size = os.path.getsize(live) if live and os.path.exists(live) else None
    last = rows[0] if rows else None
    return jsonify({
        "data": [_backup_dict(r) for r in rows],
        "summary": {
            "count": len(rows),
            "total_bytes": sum(r.size_bytes or 0 for r in rows),
            "live_db_bytes": live_size,
            "last_backup_at": conv(last.created_at) if last else None,
            "file_based": bool(live),
            "backup_dir": _backup_dir(),
        },
        "config": _backup_config(),
    })


@app.post("/api/v1/backups")
@super_admin_required
def create_backup():
    body = request.get_json(silent=True) or {}
    label = body.get("label")
    if label is not None and len(str(label)) > 180:
        return error("Backup label must be 180 characters or fewer", 422)
    try:
        row = _create_db_backup("manual", label=label, user=request.user)
    except RuntimeError as exc:
        return error(str(exc), 422)
    except sqlite3.Error as exc:
        return error(f"Backup failed: {exc}", 500)
    db.session.flush()  # assigns row.id so the audit entry can reference it
    audit(request.user, "backup_created", "database-backup", row.id,
          new={"filename": row.filename, "size_bytes": row.size_bytes})
    pruned = _prune_backups()
    db.session.commit()
    return jsonify({"data": _backup_dict(row), "pruned": pruned}), 201


@app.get("/api/v1/backups/<int:bid>/download")
@super_admin_required
def download_backup(bid):
    row = db.session.get(DatabaseBackup, bid)
    if not row:
        return error("Backup not found", 404)
    path = _backup_path(row.filename)
    if not os.path.exists(path):
        return error("Backup file is missing from the server", 404)
    resp = send_file(path, mimetype="application/x-sqlite3", as_attachment=True,
                     download_name=row.filename)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


@app.post("/api/v1/backups/<int:bid>/verify")
@super_admin_required
def verify_backup(bid):
    row = db.session.get(DatabaseBackup, bid)
    if not row:
        return error("Backup not found", 404)
    path = _backup_path(row.filename)
    if not os.path.exists(path):
        return error("Backup file is missing from the server", 404)
    checksum = _sha256_file(path)
    try:
        integrity_ok = _sqlite_integrity_ok(path)
    except sqlite3.Error:
        integrity_ok = False
    return jsonify({"data": {
        "id": row.id,
        "filename": row.filename,
        "checksum_sha256": checksum,
        "checksum_match": checksum == row.checksum_sha256,
        "integrity_ok": integrity_ok,
        "valid": integrity_ok and checksum == row.checksum_sha256,
        "verified_at": datetime.utcnow().isoformat(timespec="seconds"),
    }})


@app.delete("/api/v1/backups/<int:bid>")
@super_admin_required
def delete_backup(bid):
    row = db.session.get(DatabaseBackup, bid)
    if not row:
        return error("Backup not found", 404)
    path = _backup_path(row.filename)
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError as exc:
        return error(f"Could not delete the backup file: {exc}", 500)
    audit(request.user, "backup_deleted", "database-backup", bid, old={"filename": row.filename})
    db.session.delete(row)
    db.session.commit()
    return jsonify({"data": {"id": bid, "deleted": True}})


@app.put("/api/v1/backups/config")
@super_admin_required
def update_backup_config():
    body = request.get_json(silent=True) or {}
    updates = {}
    if "retention_count" in body:
        try:
            keep = int(body.get("retention_count"))
        except (TypeError, ValueError):
            return error("Retention count must be a number of snapshots", 422)
        if not 1 <= keep <= 100:
            return error("Retention count must be between 1 and 100 snapshots", 422)
        updates["retention_count"] = keep
    if "interval_hours" in body:
        try:
            hours = int(body.get("interval_hours"))
        except (TypeError, ValueError):
            return error("Automatic backup interval must be a number of hours", 422)
        if not 1 <= hours <= 168:
            return error("Automatic backup interval must be between 1 and 168 hours", 422)
        updates["interval_hours"] = hours
    if "auto_enabled" in body:
        updates["auto_enabled"] = "1" if body.get("auto_enabled") in (True, "1", "true", "on", "yes") else "0"
    if not updates:
        return error("No valid backup settings were provided", 422)
    for key, value in updates.items():
        setting = Setting.query.filter_by(key="backup." + key).first()
        if setting:
            setting.value = str(value)
        else:
            db.session.add(Setting(key="backup." + key, value=str(value), group_name="backup"))
    audit(request.user, "backup_config_updated", "database-backup", None, new=updates)
    pruned = _prune_backups() if "retention_count" in updates else 0
    db.session.commit()
    return jsonify({"data": _backup_config(), "pruned": pruned})


@app.post("/api/v1/backups/<int:bid>/restore")
@super_admin_required
def restore_backup(bid):
    row = db.session.get(DatabaseBackup, bid)
    if not row:
        return error("Backup not found", 404)
    source = _backup_path(row.filename)
    if not os.path.exists(source):
        return error("Backup file is missing from the server", 404)
    live = _live_db_path()
    if not live:
        return error("Restore requires a file-based SQLite database", 422)

    try:
        if not _sqlite_integrity_ok(source):
            return error("This backup failed its integrity check and cannot be restored", 422)
        if _sha256_file(source) != row.checksum_sha256:
            return error("Backup checksum does not match the register — the file may have been altered", 422)
    except sqlite3.Error:
        return error("Backup file could not be read as a SQLite database", 422)

    # Safety net: snapshot the current state before anything is overwritten.
    actor_id = request.user.id
    source_name = row.filename
    try:
        pre = _create_db_backup("pre_restore", label="Pre-restore snapshot", user=request.user,
                                notes=f"Automatic snapshot taken before restoring {source_name}")
        db.session.commit()
    except (RuntimeError, sqlite3.Error) as exc:
        db.session.rollback()
        return error(f"Could not create the pre-restore safety snapshot: {exc}", 500)
    pre_payload = {"id": pre.id, "filename": pre.filename, "size_bytes": pre.size_bytes,
                   "checksum_sha256": pre.checksum_sha256, "created_at": conv(pre.created_at)}

    src = sqlite3.connect(source)
    try:
        dst = sqlite3.connect(live)
        try:
            with dst:
                src.backup(dst)
        finally:
            dst.close()
    except sqlite3.Error as exc:
        return error(f"Restore failed while writing the database: {exc}", 500)
    finally:
        src.close()

    # Stale journal sidecars belong to the previous database generation.
    for suffix in ("-wal", "-shm", "-journal"):
        try:
            sidecar = live + suffix
            if os.path.exists(sidecar):
                os.remove(sidecar)
        except OSError:
            pass

    # Drop pooled connections so every later request reads the restored file.
    # Skipped for in-memory engines (tests) — disposing would discard the database.
    engine_url = db.engine.url
    if engine_url.drivername == "sqlite" and engine_url.database:
        db.session.remove()
        db.engine.dispose()

    # The restored file may pre-date the snapshot register: keep it in sync with
    # what is on disk so the safety snapshot stays visible in the UI.
    if not DatabaseBackup.query.filter_by(filename=pre_payload["filename"]).first():
        re_register = DatabaseBackup(
            filename=pre_payload["filename"], label="Pre-restore snapshot", trigger="pre_restore",
            status="completed", size_bytes=pre_payload["size_bytes"],
            checksum_sha256=pre_payload["checksum_sha256"],
            notes=f"Automatic snapshot taken before restoring {source_name}",
        )
        re_register.created_by = actor_id
        db.session.add(re_register)
    db.session.add(AuditLog(
        user_id=actor_id, event="backup_restored", entity="database-backup", entity_id=bid,
        old_values=str({"filename": source_name})[:2000],
        new_values=str({"pre_restore_snapshot": pre_payload["filename"]})[:2000],
        ip=request.remote_addr,
    ))
    db.session.commit()
    return jsonify({"data": {"restored": source_name, "pre_restore_snapshot": pre_payload}})


@app.before_request
def _maybe_auto_backup():
    """Create a scheduled snapshot when automatic backups are due (throttled check)."""
    global _auto_backup_last_check
    now_ts = datetime.utcnow()
    if _auto_backup_last_check and (now_ts - _auto_backup_last_check).total_seconds() < 600:
        return None
    _auto_backup_last_check = now_ts
    try:
        if not app.config.get("HRMS_BACKUPS_AUTOCHECK", True):
            return None
        if not _live_db_path():
            return None
        if not _backup_setting("auto_enabled"):
            return None
        interval_hours = max(1, _backup_setting("interval_hours"))
        last = DatabaseBackup.query.order_by(DatabaseBackup.created_at.desc(), DatabaseBackup.id.desc()).first()
        if last and last.created_at and (now_ts - last.created_at).total_seconds() < interval_hours * 3600:
            return None
        row = _create_db_backup("scheduled", label="Automatic scheduled backup")
        _prune_backups()
        db.session.commit()
        app.logger.info("Scheduled database backup created: %s", row.filename)
    except Exception:
        db.session.rollback()
    return None


# ---------------------------------------------------------------- pages & uploads

@app.get("/uploads/<path:filename>")
def serve_uploaded_file(filename):
    ext = os.path.splitext(filename)[1].lower()
    if filename.startswith("branding/") and "/" not in filename[len("branding/"):]:
        asset = BrandingAsset.query.filter_by(stored_name=filename[len("branding/"):]).first()
        if asset:
            resp = send_file(io.BytesIO(asset.content), mimetype=asset.mime_type or _UPLOAD_MIMES.get(ext))
            resp.headers["X-Content-Type-Options"] = "nosniff"
            if ext == ".svg":
                resp.headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
            resp.headers["Cache-Control"] = "public, max-age=86400"
            return resp
    resp = send_from_directory(UPLOADS_DIR, filename, mimetype=_UPLOAD_MIMES.get(ext))
    resp.headers["X-Content-Type-Options"] = "nosniff"
    if ext == ".svg":
        resp.headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


def _brand_template_ctx():
    try:
        comp = Company.query.first()
    except Exception:
        comp = None
    name = (comp.name if comp and comp.name else "Meridian HR").strip()
    tagline = (comp.tagline if comp and comp.tagline else "People operations").strip()
    initial = (name[:1] or "M").upper()
    svg = (
        f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
        f"<rect width='64' height='64' rx='14' fill='#10201f'/>"
        f"<text x='32' y='44' font-family='Georgia' font-size='34' fill='#c2703d' text-anchor='middle'>{url_quote(initial[:1])}</text>"
        f"</svg>"
    )
    default_favicon = "data:image/svg+xml," + url_quote(svg, safe=":/,='")
    return {
        "name": name,
        "tagline": tagline,
        "initial": initial,
        "logo_url": (comp.logo_url or "").strip() if comp else "",
        "favicon_url": ((comp.favicon_url or "").strip() if comp else "") or default_favicon,
        "default_favicon": default_favicon,
        "location_label": f"{name} · {(comp.location_name if comp and comp.location_name else ((comp.city + ' HQ') if comp and comp.city else 'Accra HQ'))}",
    }


@app.context_processor
def inject_brand_context():
    return {"brand": _brand_template_ctx()}


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
    if request.path.startswith("/api/") or request.path.startswith("/uploads/"):
        return error("Not found", 404)
    return render_template("index.html", brand=_brand_template_ctx())


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
