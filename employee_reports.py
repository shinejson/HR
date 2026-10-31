"""Permission-aware, branded HR reports.

Reports are read-only projections of existing HR records.  Both the JSON preview
and the printable document use the same scope, filters and data builder, so a
printout cannot contain records that were hidden from the preview.
"""
from datetime import date, datetime
from decimal import Decimal
import secrets

from flask import Blueprint, jsonify, render_template, request
from sqlalchemy import or_, and_

from models import (
    db, Company, Department, Employee, Attendance, LeaveBalance, LeaveRequest,
    Payslip, PayrollRun, Appraisal, AppraisalCycle, Goal, Training, TrainingEnrolment, Contract, Document,
)

reports_bp = Blueprint("employee_reports", __name__, url_prefix="/api/v1/employee-reports")

ORGANISATION_ROLES = {"super_admin", "hr_admin", "hr_officer", "payroll", "auditor"}
HR_ROLES = {"super_admin", "hr_admin", "hr_officer", "auditor"}
PAYROLL_ROLES = {"super_admin", "hr_admin", "payroll", "auditor"}

# `date_field` is an explicit reporting convention, not a generic created-at
# filter. The UI displays its label so users know exactly what a period means.
REPORT_TYPES = [
    {"key": "staff", "title": "Staff directory", "icon": "users", "group": "People",
     "description": "Employee numbers, roles, departments, contact details and employment status.",
     "scope": "department", "date_field": "hire_date", "date_label": "Hire date",
     "status_label": "Employee status", "statuses": ["active", "probation", "suspended", "resigned", "terminated"]},
    {"key": "profile", "title": "Employee profile", "icon": "user", "group": "People",
     "description": "An individual employment record with job, department and reporting-line details.",
     "scope": "employee"},
    {"key": "attendance", "title": "Attendance report", "icon": "clock", "group": "Time & absence",
     "description": "Daily attendance, clock-in/out times, lateness and recorded overtime.",
     "scope": "both", "date_field": "work_date", "date_label": "Work date",
     "status_label": "Attendance status", "statuses": ["present", "late", "absent", "remote", "half_day", "leave", "on_leave"]},
    {"key": "leave", "title": "Leave report", "icon": "calendar", "group": "Time & absence",
     "description": "Leave applications, dates, days requested and approval status.",
     "scope": "both", "date_field": "start_date", "date_label": "Leave dates (overlapping)",
     "status_label": "Leave status", "statuses": ["pending", "approved", "rejected", "cancelled"]},
    {"key": "leave-balances", "title": "Leave balance report", "icon": "calendar", "group": "Time & absence",
     "description": "Annual entitlement, carry-over, days taken, pending days and remaining balance.",
     "scope": "both", "year_filter": True},
    {"key": "payroll", "title": "Payroll report", "icon": "wallet", "group": "Compensation",
     "description": "Payslip earnings, PAYE, SSNIT, other deductions and net pay by payroll period.",
     "scope": "both", "date_field": "period_start", "date_label": "Payroll month",
     "status_label": "Payroll status", "statuses": ["draft", "calculated", "approved", "paid"]},
    {"key": "performance", "title": "Performance report", "icon": "target", "group": "Talent",
     "description": "Appraisal scores, review comments and employee goals with progress.",
     "scope": "both", "date_field": "start_date", "date_label": "Review start / goal due date",
     "status_label": "Record status", "statuses": ["draft", "self_review", "in_review", "completed", "submitted", "active", "on_hold", "cancelled"]},
    {"key": "training", "title": "Training report", "icon": "graduation", "group": "Talent",
     "description": "Training enrolments, programme dates, completion status and assessment scores.",
     "scope": "both", "date_field": "start_date", "date_label": "Training start",
     "status_label": "Enrolment status", "statuses": ["enrolled", "completed", "cancelled", "failed"]},
    {"key": "contracts", "title": "Contract report", "icon": "briefcase", "group": "People",
     "description": "Employment contract types, effective dates, expiry dates and contract notes.",
     "scope": "both", "date_field": "start_date", "date_label": "Contract start",
     "status_label": "Contract status", "statuses": ["active", "expired", "terminated", "renewed", "draft"]},
    {"key": "documents", "title": "Document register", "icon": "file", "group": "People",
     "description": "Document titles, categories and expiry dates. Attached files are not included.",
     "scope": "both", "date_field": "expires_at", "date_label": "Document expiry"},
]
TYPE_MAP = {item["key"]: item for item in REPORT_TYPES}


def _number(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _display(value, kind="text"):
    if value is None or value == "":
        return "—"
    if kind == "date" and isinstance(value, (date, datetime)):
        return value.strftime("%d %b %Y")
    if kind == "datetime" and isinstance(value, datetime):
        return value.strftime("%d %b %Y, %H:%M")
    if kind == "time" and isinstance(value, datetime):
        return value.strftime("%H:%M")
    if kind == "money":
        return f"GHS {float(value or 0):,.2f}"
    if kind == "number":
        return f"{float(value or 0):g}"
    return str(_number(value)).replace("_", " ").strip() or "—"


def _columns(*specs):
    return [{"key": key, "label": label, "format": kind} for key, label, kind in specs]


def _employee_columns():
    return _columns(("employee_no", "Employee no.", "text"), ("employee_name", "Employee", "text"))


def _section(title, columns, rows, description=""):
    return {"title": title, "columns": columns, "rows": rows, "description": description,
            "record_count": len(rows)}


def _employee_payload(employee):
    if not employee:
        return None
    return {"id": employee.id, "name": employee.full_name, "employee_no": employee.employee_no,
            "department_id": employee.department_id,
            "department_name": employee.department.name if employee.department else "Unassigned",
            "designation_title": employee.designation.title if employee.designation else "",
            "status": employee.status, "photo_url": employee.photo_url}


def _company_payload():
    company = Company.query.first()
    fields = ("name", "legal_name", "tagline", "address", "city", "country", "phone", "email", "website", "logo_url")
    result = {field: (getattr(company, field, None) or "").strip() for field in fields}
    result["name"] = result["name"] or "Company"
    result["initial"] = result["name"][:1].upper()
    return result


def register_report_routes(app, login_required, error, audit):
    """Register once; reuse the host application's authentication and audit trail."""

    def guarded(fn):
        reports_bp.add_url_rule("/" + fn.__name__.replace("_", "-"), view_func=login_required(fn))
        return fn

    def role():
        return request.user.role.slug if request.user.role else "employee"

    def is_self(employee_id):
        return request.user.employee_id is not None and request.user.employee_id == employee_id

    def visible_employees(report_type=None):
        query = Employee.query.filter(Employee.deleted_at.is_(None))
        if role() in ORGANISATION_ROLES:
            employees = query.order_by(Employee.first_name, Employee.last_name).all()
        else:
            ids = {request.user.employee_id} if request.user.employee_id else set()
            if role() == "manager" and request.user.employee_id:
                ids.update(e.id for e in Employee.query.filter_by(manager_id=request.user.employee_id,
                                                                 deleted_at=None).all())
            employees = query.filter(Employee.id.in_(ids)).order_by(Employee.first_name, Employee.last_name).all() if ids else []
        if report_type == "payroll":
            employees = [e for e in employees if is_self(e.id) or role() in PAYROLL_ROLES]
        elif report_type == "documents":
            employees = [e for e in employees if is_self(e.id) or role() in HR_ROLES or role() == "manager"]
        return employees

    def may_view(employee, report_type, allowed_ids=None):
        if allowed_ids is None:
            allowed_ids = {e.id for e in visible_employees()}
        if employee is None or employee.id not in allowed_ids:
            return False
        if report_type == "payroll":
            return is_self(employee.id) or role() in PAYROLL_ROLES
        if report_type == "documents":
            return is_self(employee.id) or role() in HR_ROLES or role() == "manager"
        return True

    def accessible_types(employee=None, allowed_ids=None):
        return [t for t in REPORT_TYPES if (employee is not None or t["scope"] != "employee") and
                (employee is None or may_view(employee, t["key"], allowed_ids))]

    def parse_id(name):
        raw = request.args.get(name)
        if raw is None or raw == "":
            return None
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValueError(f"{name} must be a valid integer")
        if value < 0 or str(value) != str(raw):
            raise ValueError(f"{name} must be a valid non-negative integer")
        return value

    def parse_filters(report_type):
        definition = TYPE_MAP.get(report_type)
        if not definition:
            raise ValueError("Choose a valid report type")
        start = request.args.get("date_from", "").strip()
        end = request.args.get("date_to", "").strip()
        parsed = []
        for value in (start, end):
            try:
                parsed.append(date.fromisoformat(value) if value else None)
            except ValueError:
                raise ValueError("Dates must use YYYY-MM-DD")
        if parsed[0] and parsed[1] and parsed[0] > parsed[1]:
            raise ValueError("The start date must not be after the end date")
        year = request.args.get("year", "").strip()
        if year and (not year.isdigit() or not 1900 <= int(year) <= 2200):
            raise ValueError("Year must be between 1900 and 2200")
        return {"department_id": parse_id("department_id"), "employee_id": parse_id("employee_id"),
                "date_from": parsed[0], "date_to": parsed[1], "year": int(year) if year else None,
                "status": request.args.get("status", "").strip(),
                "q": request.args.get("q", "").strip()[:200]}

    def resolve_scope(filters, report_type):
        if filters["department_id"] is not None:
            if report_type == "payroll" and role() not in PAYROLL_ROLES:
                return error("Department payroll reports require payroll access", 403)
            if report_type == "documents" and role() not in HR_ROLES | {"manager"}:
                return error("You do not have permission to view department documents", 403)
        department = None
        employee = None
        if filters["department_id"] is not None:
            did = filters["department_id"]
            department = db.session.get(Department, did) if did else None
            if did and not department:
                return error("Department not found", 404)
        if filters["employee_id"] is not None:
            employee = db.session.get(Employee, filters["employee_id"])
            if not employee or employee.deleted_at is not None:
                return error("Employee not found", 404)
            if not may_view(employee, report_type):
                return error("You do not have permission to view this employee report", 403)
            if department or filters["department_id"] == 0:
                if (employee.department_id or 0) != filters["department_id"]:
                    return error("This employee does not belong to the selected department", 422)
        elif report_type == "profile":
            return error("Select an employee for a profile report", 422)
        employees = [employee] if employee else visible_employees(report_type)
        if filters["department_id"] is not None:
            employees = [e for e in employees if (e.department_id or 0) == filters["department_id"]]
        # Do not expose department leadership or membership outside the user's scope.
        if department and not employees and role() not in ORGANISATION_ROLES:
            return error("You do not have permission to view this department report", 403)
        return employees, department, employee

    def date_window(query, column, filters, overlap_end=None):
        if filters["date_from"]:
            query = query.filter((overlap_end or column) >= filters["date_from"])
        if filters["date_to"]:
            query = query.filter(column <= filters["date_to"])
        return query

    def build_report(report_type, filters, employees, department, employee):
        definition = TYPE_MAP[report_type]
        currency = getattr(Company.query.first(), "currency", "GHS") or "GHS"
        by_id = {e.id: e for e in employees}
        ids = list(by_id)
        sections = []
        summary = []

        def person(row_employee):
            return {"employee_id": row_employee.id, "employee_no": row_employee.employee_no,
                    "employee_name": row_employee.full_name,
                    "department_name": row_employee.department.name if row_employee.department else "Unassigned"}

        def add(title, columns, rows, description=""):
            if filters["q"]:
                needle = filters["q"].casefold()
                rows = [r for r in rows if needle in " ".join(str(v or "") for v in r.values()).casefold()]
            if filters["status"]:
                rows = [r for r in rows if str(r.get("status", "")).casefold() == filters["status"].casefold()]
            sections.append(_section(title, columns, rows, description))
            return rows

        if report_type in ("staff", "profile"):
            rows = []
            for e in employees:
                if filters["date_from"] and (not e.hire_date or e.hire_date < filters["date_from"]):
                    continue
                if filters["date_to"] and (not e.hire_date or e.hire_date > filters["date_to"]):
                    continue
                rows.append({**person(e), "designation_title": e.designation.title if e.designation else "—",
                             "email": e.email, "phone": e.phone, "hire_date": _display(e.hire_date, "date"),
                             "contract_type": _display(e.contract_type), "status": e.status})
            if report_type == "profile":
                e = employee
                fields = [("Employee number", e.employee_no), ("Full name", e.full_name),
                          ("Department", e.department.name if e.department else "Unassigned"),
                          ("Designation", e.designation.title if e.designation else "—"),
                          ("Branch / location", e.branch.name if e.branch else "—"),
                          ("Work arrangement", _display(e.work_location)),
                          ("Employment status", _display(e.status)), ("Contract type", _display(e.contract_type)),
                          ("Staff category", e.staff_category or "—"), ("Hire date", _display(e.hire_date, "date")),
                          ("Confirmation date", _display(e.confirmation_date, "date")),
                          ("Probation end", _display(e.probation_end, "date")),
                          ("End date", _display(e.end_date, "date")),
                          ("Line manager", e.manager.full_name if e.manager else "—"),
                          ("Head of department", e.hod.full_name if e.hod else (e.department.head.full_name if e.department and e.department.head else "—")),
                          ("Work email", e.email), ("Phone", e.phone)]
                sections.append({"title": "Employment details", "kind": "fields",
                                 "fields": [{"label": label, "value": str(value or "—")} for label, value in fields],
                                 "record_count": 1})
                summary = [{"label": "Employee", "value": e.full_name},
                           {"label": "Department", "value": e.department.name if e.department else "Unassigned"},
                           {"label": "Status", "value": _display(e.status)}]
            else:
                add("Employee register", _employee_columns() + _columns(
                    ("department_name", "Department", "text"), ("designation_title", "Designation", "text"),
                    ("email", "Work email", "text"), ("phone", "Phone", "text"),
                    ("hire_date", "Hire date", "text"), ("contract_type", "Contract", "text"), ("status", "Status", "status")), rows)
                summary = [{"label": "Employees", "value": str(len(rows))},
                           {"label": "Active", "value": str(sum(r["status"] == "active" for r in rows))},
                           {"label": "Probation", "value": str(sum(r["status"] == "probation" for r in rows))}]
        elif report_type == "attendance":
            query = date_window(Attendance.query.filter(Attendance.employee_id.in_(ids)), Attendance.work_date, filters)
            records = query.order_by(Attendance.work_date.desc(), Attendance.id.desc()).all()
            rows = [{**person(r.employee), "work_date": _display(r.work_date, "date"),
                     "clock_in": _display(r.clock_in, "time"), "clock_out": _display(r.clock_out, "time"),
                     "overtime_hours": _display((r.overtime_minutes or 0) / 60, "number"),
                     "source": _display(r.source), "status": r.status, "notes": r.notes or "—"} for r in records]
            rows = add("Attendance register", _employee_columns() + _columns(
                ("work_date", "Work date", "text"), ("clock_in", "Clock in", "text"),
                ("clock_out", "Clock out", "text"), ("overtime_hours", "Overtime (hrs)", "text"),
                ("status", "Status", "status"), ("source", "Source", "text"), ("notes", "Notes", "text")), rows)
            summary = [{"label": "Attendance records", "value": str(len(rows))},
                       {"label": "Present / remote", "value": str(sum(r["status"] in ("present", "remote", "late") for r in rows))},
                       {"label": "Late", "value": str(sum(r["status"] == "late" for r in rows))},
                       {"label": "Overtime hours", "value": _display(sum(float(r["overtime_hours"]) for r in rows), "number")}]
        elif report_type == "leave":
            query = date_window(LeaveRequest.query.filter(LeaveRequest.employee_id.in_(ids)),
                                LeaveRequest.start_date, filters, LeaveRequest.end_date)
            rows = [{**person(r.employee), "leave_type": r.leave_type.name if r.leave_type else "—",
                     "start_date": _display(r.start_date, "date"), "end_date": _display(r.end_date, "date"),
                     "days": _display(r.days, "number"), "resumption_date": _display(r.resumption_date, "date"),
                     "reason": r.reason or "—", "status": r.status}
                    for r in query.order_by(LeaveRequest.start_date.desc()).all()]
            rows = add("Leave applications", _employee_columns() + _columns(
                ("leave_type", "Leave type", "text"), ("start_date", "From", "text"), ("end_date", "To", "text"),
                ("days", "Days", "text"), ("resumption_date", "Resumption", "text"),
                ("status", "Status", "status"), ("reason", "Reason", "text")), rows)
            summary = [{"label": "Applications", "value": str(len(rows))},
                       {"label": "Approved", "value": str(sum(r["status"] == "approved" for r in rows))},
                       {"label": "Pending", "value": str(sum(r["status"] == "pending" for r in rows))},
                       {"label": "Approved days", "value": _display(sum(float(r["days"]) for r in rows if r["status"] == "approved"), "number")}]
        elif report_type == "leave-balances":
            query = LeaveBalance.query.filter(LeaveBalance.employee_id.in_(ids))
            if filters["year"]:
                query = query.filter(LeaveBalance.year == filters["year"])
            rows = []
            for r in query.order_by(LeaveBalance.year.desc(), LeaveBalance.id).all():
                remaining = float(r.entitled or 0) + float(r.carried_over or 0) - float(r.taken or 0) - float(r.pending or 0)
                rows.append({**person(r.employee), "leave_type": r.leave_type.name if r.leave_type else "—",
                             "year": str(r.year), "entitled": _display(r.entitled, "number"),
                             "carried_over": _display(r.carried_over, "number"), "taken": _display(r.taken, "number"),
                             "pending": _display(r.pending, "number"), "remaining": _display(remaining, "number")})
            rows = add("Leave entitlement balances", _employee_columns() + _columns(
                ("leave_type", "Leave type", "text"), ("year", "Year", "text"), ("entitled", "Entitled", "text"),
                ("carried_over", "Carry-over", "text"), ("taken", "Taken", "text"),
                ("pending", "Pending", "text"), ("remaining", "Remaining", "text")), rows,
                "Days. Remaining = entitlement + carry-over − taken − pending.")
            summary = [{"label": "Balance records", "value": str(len(rows))},
                       {"label": "Remaining days", "value": _display(sum(float(r["remaining"]) for r in rows), "number")}]
        elif report_type == "payroll":
            query = Payslip.query.join(Payslip.run).filter(Payslip.employee_id.in_(ids))
            if filters["date_from"]:
                first = filters["date_from"].replace(day=1)
                query = query.filter(or_(PayrollRun.period_year > first.year,
                    and_(PayrollRun.period_year == first.year, PayrollRun.period_month >= first.month)))
            if filters["date_to"]:
                query = query.filter(or_(PayrollRun.period_year < filters["date_to"].year,
                    and_(PayrollRun.period_year == filters["date_to"].year, PayrollRun.period_month <= filters["date_to"].month)))
            records = query.order_by(PayrollRun.period_year.desc(), PayrollRun.period_month.desc()).all()
            rows = [{**person(r.employee), "period": f"{r.run.period_year}-{r.run.period_month:02d}",
                     "gross": _display(r.gross, "money").replace("GHS", currency),
                     "tax": _display(r.tax, "money").replace("GHS", currency),
                     "ssnit": _display(r.ssnit, "money").replace("GHS", currency),
                     "other_deductions": _display(r.other_deductions, "money").replace("GHS", currency),
                     "net": _display(r.net, "money").replace("GHS", currency), "status": r.run.status} for r in records]
            rows = add("Payslip register", _employee_columns() + _columns(
                ("period", "Period", "text"), ("gross", "Gross pay", "text"), ("tax", "PAYE", "text"),
                ("ssnit", "SSNIT", "text"), ("other_deductions", "Other deductions", "text"),
                ("net", "Net pay", "text"), ("status", "Run status", "status")), rows,
                f"All amounts in {currency}. Draft runs are explicitly identified by run status.")
            # Use the filtered rows for totals, not the unfiltered query.
            money_value = lambda value: float(value.split(" ", 1)[1].replace(",", ""))
            summary = [{"label": "Payslips", "value": str(len(rows))},
                       {"label": "Gross pay", "value": f"{currency} {sum(money_value(r['gross']) for r in rows):,.2f}"},
                       {"label": "Net pay", "value": f"{currency} {sum(money_value(r['net']) for r in rows):,.2f}"}]
        elif report_type == "performance":
            query = Appraisal.query.filter(Appraisal.employee_id.in_(ids))
            if filters["date_from"] or filters["date_to"]:
                query = query.join(Appraisal.cycle)
                query = date_window(query, AppraisalCycle.start_date, filters)
            rows = [{**person(r.employee), "title": r.cycle.name if r.cycle else "—",
                     "self_score": _display(r.self_score, "number"), "manager_score": _display(r.manager_score, "number"),
                     "final_score": _display(r.final_score, "number"), "status": r.status,
                     "comments": r.manager_comments or r.self_comments or "—"}
                    for r in query.order_by(Appraisal.id.desc()).all()]
            rows = add("Appraisals", _employee_columns() + _columns(
                ("title", "Review cycle", "text"), ("self_score", "Self / 5", "text"),
                ("manager_score", "Manager / 5", "text"), ("final_score", "Final / 5", "text"),
                ("status", "Status", "status"), ("comments", "Review comments", "text")), rows)
            goals = Goal.query.filter(Goal.employee_id.in_(ids))
            goals = date_window(goals, Goal.due_date, filters)
            goal_rows = [{**person(r.employee), "title": r.title, "due_date": _display(r.due_date, "date"),
                          "progress": f"{r.progress or 0}%", "weight": f"{r.weight or 0}%",
                          "status": r.status, "comments": r.description or "—"}
                         for r in goals.order_by(Goal.due_date.desc()).all()]
            goal_rows = add("Employee goals", _employee_columns() + _columns(
                ("title", "Goal", "text"), ("due_date", "Due date", "text"), ("progress", "Progress", "text"),
                ("weight", "Weight", "text"), ("status", "Status", "status"), ("comments", "Description", "text")), goal_rows)
            summary = [{"label": "Appraisals", "value": str(len(rows))},
                       {"label": "Goals", "value": str(len(goal_rows))},
                       {"label": "Completed goals", "value": str(sum(r["status"] == "completed" for r in goal_rows))}]
        elif report_type == "training":
            query = TrainingEnrolment.query.join(TrainingEnrolment.training).filter(TrainingEnrolment.employee_id.in_(ids))
            query = date_window(query, Training.start_date, filters)
            rows = [{**person(r.employee), "title": r.training.title if r.training else "—",
                     "provider": r.training.provider if r.training else "—",
                     "start_date": _display(r.training.start_date if r.training else None, "date"),
                     "end_date": _display(r.training.end_date if r.training else None, "date"),
                     "score": _display(r.score, "number"), "completed_at": _display(r.completed_at, "date"), "status": r.status}
                    for r in query.order_by(Training.start_date.desc()).all()]
            rows = add("Training enrolments", _employee_columns() + _columns(
                ("title", "Programme", "text"), ("provider", "Provider", "text"),
                ("start_date", "Start", "text"), ("end_date", "End", "text"),
                ("score", "Score", "text"), ("completed_at", "Completed on", "text"), ("status", "Status", "status")), rows)
            summary = [{"label": "Enrolments", "value": str(len(rows))},
                       {"label": "Completed", "value": str(sum(r["status"] == "completed" for r in rows))},
                       {"label": "In progress", "value": str(sum(r["status"] == "enrolled" for r in rows))}]
        elif report_type == "contracts":
            query = date_window(Contract.query.filter(Contract.employee_id.in_(ids)), Contract.start_date, filters)
            rows = [{**person(by_id[r.employee_id]), "type": _display(r.type),
                     "start_date": _display(r.start_date, "date"), "end_date": _display(r.end_date, "date"),
                     "status": r.status, "notes": r.notes or "—"}
                    for r in query.order_by(Contract.start_date.desc()).all()]
            rows = add("Employment contracts", _employee_columns() + _columns(
                ("type", "Contract type", "text"), ("start_date", "Start date", "text"),
                ("end_date", "End date", "text"), ("status", "Status", "status"), ("notes", "Notes", "text")), rows)
            summary = [{"label": "Contracts", "value": str(len(rows))},
                       {"label": "Active", "value": str(sum(r["status"] == "active" for r in rows))}]
        elif report_type == "documents":
            query = date_window(Document.query.filter(Document.employee_id.in_(ids)), Document.expires_at, filters)
            rows = [{**person(r.employee), "title": r.title, "category": _display(r.category),
                     "expires_at": _display(r.expires_at, "date"), "uploaded_on": _display(r.created_at, "date"),
                     "notes": r.notes or "—"} for r in query.order_by(Document.expires_at.asc()).all()]
            rows = add("Employee document register", _employee_columns() + _columns(
                ("title", "Document", "text"), ("category", "Category", "text"),
                ("uploaded_on", "Registered", "text"), ("expires_at", "Expires", "text"), ("notes", "Notes", "text")), rows,
                "Register only; confidential document attachments must be opened from the Documents module.")
            summary = [{"label": "Documents", "value": str(len(rows))},
                       {"label": "With expiry date", "value": str(sum(r["expires_at"] != "—" for r in rows))}]

        scope_name = employee.full_name if employee else (department.name if department else ("Unassigned" if filters["department_id"] == 0 else "All accessible departments"))
        period = "All dates"
        if definition.get("year_filter"):
            period = str(filters["year"] or "All years")
        elif definition.get("date_field") and (filters["date_from"] or filters["date_to"]):
            period = f"{_display(filters['date_from'], 'date') if filters['date_from'] else 'Earliest'} – {_display(filters['date_to'], 'date') if filters['date_to'] else 'Latest'}"
        return {"report": definition, "title": definition["title"], "company": _company_payload(),
                "scope": {"label": scope_name, "department_id": filters["department_id"],
                          "department_name": department.name if department else ("Unassigned" if filters["department_id"] == 0 else None),
                          "employee": _employee_payload(employee), "period": period,
                          "status": filters["status"] or "All statuses", "search": filters["q"] or None},
                "generated_at": datetime.utcnow().strftime("%d %b %Y, %H:%M UTC"),
                "generated_by": request.user.employee.full_name if request.user.employee else request.user.email,
                "reference": "HR-" + report_type[:3].upper() + "-" + datetime.utcnow().strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper(),
                "record_count": sum(s["record_count"] for s in sections), "summary": summary, "sections": sections,
                "organisation_types": [t["key"] for t in accessible_types()
                    if (t["key"] != "payroll" or role() in PAYROLL_ROLES)
                    and (t["key"] != "documents" or role() in HR_ROLES | {"manager"})],
                "back_path": f"reports/employee/{employee.id}" if employee else (f"reports/department/{department.id}" if department else "reports")}

    def prepare():
        report_type = request.args.get("type", "staff").strip()
        try:
            filters = parse_filters(report_type)
        except ValueError as exc:
            return None, error(str(exc), 422)
        resolved = resolve_scope(filters, report_type)
        if len(resolved) == 2:  # Flask error response: (response, status_code).
            return None, resolved
        return build_report(report_type, filters, *resolved), None

    @guarded
    def catalog():
        employees = visible_employees()
        allowed_ids = {e.id for e in employees}
        departments = Department.query.order_by(Department.name).all() if role() in ORGANISATION_ROLES else []
        if role() not in ORGANISATION_ROLES:
            dept_ids = {e.department_id for e in employees if e.department_id}
            departments = Department.query.filter(Department.id.in_(dept_ids)).order_by(Department.name).all() if dept_ids else []
        department_rows = []
        for department in list(departments) + [None]:
            if department is None and not any(e.department_id is None for e in employees):
                continue
            members = [e for e in employees if e.department_id == (department.id if department else None)]
            department_rows.append({"id": department.id if department else 0,
                "name": department.name if department else "Unassigned", "code": department.code if department else "",
                "head_name": department.head.full_name if department and department.head and department.head.id in allowed_ids else None,
                "employee_count": len(members), "active_count": sum(e.status in ("active", "probation") for e in members),
                "report_types": [t["key"] for t in accessible_types()
                    if (t["key"] != "payroll" or role() in PAYROLL_ROLES)
                    and (t["key"] != "documents" or role() in HR_ROLES | {"manager"})]})
        organisation_types = [t["key"] for t in accessible_types()
                              if (t["key"] != "payroll" or role() in PAYROLL_ROLES)
                              and (t["key"] != "documents" or role() in HR_ROLES | {"manager"})]
        return jsonify({"data": {"types": REPORT_TYPES, "organisation_types": organisation_types, "departments": department_rows,
            "employees": [{**_employee_payload(e), "report_types": [t["key"] for t in accessible_types(e, allowed_ids)]} for e in employees],
            "scope_label": "Organisation-wide" if role() in ORGANISATION_ROLES else ("Your team and your own records" if role() == "manager" else "Your own records"),
            "can_view_analytics": role() in ORGANISATION_ROLES | {"manager"}}})

    @guarded
    def detail():
        data, failure = prepare()
        if failure:
            return failure
        audit(request.user, "employee_report_viewed", "employee_reports", data["scope"].get("employee", {}).get("id") if data["scope"].get("employee") else data["scope"]["department_id"],
              new={"type": data["report"]["key"], "records": data["record_count"], "period": data["scope"]["period"]})
        db.session.commit()
        return jsonify({"data": data})

    @guarded
    def print_report():
        data, failure = prepare()
        if failure:
            return failure
        audit(request.user, "employee_report_printed", "employee_reports", data["scope"].get("employee", {}).get("id") if data["scope"].get("employee") else data["scope"]["department_id"],
              new={"type": data["report"]["key"], "records": data["record_count"], "reference": data["reference"]})
        db.session.commit()
        response = app.make_response(render_template("reports/print.html", report=data))
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    app.register_blueprint(reports_bp)
