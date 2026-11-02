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
    Loan, LoanRepayment, LeaveEncashment, LeaveType, Shift, ShiftAssignment,
    HotelWorkOrder, MaintenanceWork, MaintenanceCategory,
    HotelStoreroom, HotelStoreroomSection, HotelInventoryItem, HotelStockMovement,
)

reports_bp = Blueprint("employee_reports", __name__, url_prefix="/api/v1/employee-reports")

ORGANISATION_ROLES = {"super_admin", "hr_admin", "hr_officer", "payroll", "auditor"}
HR_ROLES = {"super_admin", "hr_admin", "hr_officer", "auditor"}
PAYROLL_ROLES = {"super_admin", "hr_admin", "payroll", "auditor"}
FINANCE_HR_ROLES = {"super_admin", "hr_admin", "hr_officer", "payroll", "auditor"}
ENCASHMENT_ROLES = {"super_admin", "hr_admin", "hr_officer", "payroll", "auditor", "manager"}

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
    {"key": "shift-roster", "title": "Shift roster & 24/7 coverage audit", "icon": "clock", "group": "Time & absence",
     "description": "Weekly shift schedules, daily 24/7 departmental coverage counts, shift codes and scheduled vs actual attendance.",
     "scope": "both", "date_field": "work_date", "date_label": "Work date",
     "status_label": "Assignment status", "statuses": ["scheduled", "present", "late", "absent", "off"]},
    {"key": "leave", "title": "Leave report", "icon": "calendar", "group": "Time & absence",
     "description": "Leave applications, dates, days requested and approval status.",
     "scope": "both", "date_field": "start_date", "date_label": "Leave dates (overlapping)",
     "status_label": "Leave status", "statuses": ["pending", "approved", "rejected", "cancelled"]},
    {"key": "leave-balances", "title": "Leave balance report", "icon": "calendar", "group": "Time & absence",
     "description": "Annual entitlement, carry-over, days taken, pending days and remaining balance.",
     "scope": "both", "year_filter": True},
    {"key": "leave-encashment", "title": "Leave encashment audit", "icon": "receipt", "group": "Time & absence",
     "description": "Sold leave records, days encashed, daily compensation rates, payout amounts and balance deductions.",
     "scope": "both", "date_field": "created_at", "date_label": "Application date", "year_filter": True,
     "status_label": "Encashment status", "statuses": ["pending", "approved", "rejected", "paid"]},
    {"key": "payroll", "title": "Payroll report", "icon": "wallet", "group": "Compensation",
     "description": "Payslip earnings, PAYE, SSNIT, other deductions and net pay by payroll period.",
     "scope": "both", "date_field": "period_start", "date_label": "Payroll month",
     "status_label": "Payroll status", "statuses": ["draft", "calculated", "approved", "paid"]},
    {"key": "loans", "title": "Staff loans & repayment ledger", "icon": "wallet", "group": "Compensation",
     "description": "Staff loan records, principal, monthly deductions, repayment history and real-time outstanding balances.",
     "scope": "both", "date_field": "start_date", "date_label": "Loan start date",
     "status_label": "Loan status", "statuses": ["pending", "active", "completed", "rejected"]},
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
    {"key": "hotel-workorders", "title": "Hotel work orders & maintenance SLA audit", "icon": "building", "group": "Hotel operations",
     "description": "Room readiness, guest work orders, maintenance SLA turnaround times, wing backlogs and repair costs.",
     "scope": "both", "date_field": "created_at", "date_label": "Reported date",
     "status_label": "Work order status", "statuses": ["open", "in_progress", "completed", "cancelled", "on_hold"]},
    {"key": "hotel-inventory", "title": "Hotel storeroom & inventory valuation audit", "icon": "briefcase", "group": "Hotel operations",
     "description": "Storeroom asset valuation, low stock & reorder alerts, par level variance, and stock movement audit trails.",
     "scope": "both", "date_field": "movement_date", "date_label": "Movement date",
     "status_label": "Stock status", "statuses": ["in_stock", "low_stock", "out_of_stock", "on_order"]},
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
        if report_type in ("payroll", "loans"):
            employees = [e for e in employees if is_self(e.id) or role() in FINANCE_HR_ROLES]
        elif report_type == "leave-encashment":
            employees = [e for e in employees if is_self(e.id) or role() in ENCASHMENT_ROLES]
        elif report_type in ("shift-roster", "hotel-workorders", "hotel-inventory"):
            employees = [e for e in employees if is_self(e.id) or role() in ORGANISATION_ROLES or role() == "manager"]
        elif report_type == "documents":
            employees = [e for e in employees if is_self(e.id) or role() in HR_ROLES or role() == "manager"]
        return employees

    def may_view(employee, report_type, allowed_ids=None):
        if allowed_ids is None:
            allowed_ids = {e.id for e in visible_employees()}
        if employee is None or employee.id not in allowed_ids:
            return False
        if report_type in ("payroll", "loans"):
            return is_self(employee.id) or role() in FINANCE_HR_ROLES
        if report_type == "leave-encashment":
            return is_self(employee.id) or role() in ENCASHMENT_ROLES
        if report_type in ("shift-roster", "hotel-workorders", "hotel-inventory"):
            return is_self(employee.id) or role() in ORGANISATION_ROLES or role() == "manager"
        if report_type == "documents":
            return is_self(employee.id) or role() in HR_ROLES or role() == "manager"
        return True

    def can_access_org_type(key):
        if key in ("payroll", "loans"):
            return role() in FINANCE_HR_ROLES
        if key == "leave-encashment":
            return role() in ENCASHMENT_ROLES
        if key in ("shift-roster", "hotel-workorders", "hotel-inventory"):
            return role() in ORGANISATION_ROLES | {"manager"}
        if key == "documents":
            return role() in HR_ROLES | {"manager"}
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
            if report_type in ("payroll", "loans") and role() not in FINANCE_HR_ROLES:
                return error(f"Department {report_type} reports require payroll or HR access", 403)
            if report_type == "leave-encashment" and role() not in ENCASHMENT_ROLES:
                return error("You do not have permission to view department leave encashment reports", 403)
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
        elif report_type == "shift-roster":
            query = date_window(ShiftAssignment.query.filter(ShiftAssignment.employee_id.in_(ids)), ShiftAssignment.work_date, filters)
            assignments = query.order_by(ShiftAssignment.work_date.asc(), ShiftAssignment.department_id.asc(), ShiftAssignment.employee_id.asc()).all()

            att_map = {}
            if assignments:
                min_date = min(a.work_date for a in assignments)
                max_date = max(a.work_date for a in assignments)
                atts = Attendance.query.filter(
                    Attendance.employee_id.in_(ids),
                    Attendance.work_date >= min_date,
                    Attendance.work_date <= max_date
                ).all()
                for a in atts:
                    att_map[(a.employee_id, a.work_date)] = a

            today_val = date.today()
            reg_rows = []
            coverage_by_date = {}

            for a in assignments:
                emp = a.employee or by_id.get(a.employee_id)
                dept_name = a.department.name if a.department else (emp.department.name if emp and emp.department else "Unassigned")
                shift = a.shift
                shift_name = shift.name if shift else "Day Off"
                shift_code = (shift.code if shift and shift.code else ("OFF" if not shift else "—")).upper()
                is_off = not shift or shift_code == "OFF" or "off" in shift_name.lower()
                shift_hours = f"{shift.start_time} – {shift.end_time}" if (shift and not is_off and shift.start_time and shift.end_time) else "—"

                att = att_map.get((a.employee_id, a.work_date))
                clock_in_str = _display(att.clock_in, "time") if att and att.clock_in else "—"
                clock_out_str = _display(att.clock_out, "time") if att and att.clock_out else "—"

                if is_off:
                    if att and att.clock_in:
                        variance = "Worked on Rest Day"
                        status_tag = "present"
                    else:
                        variance = "Scheduled Rest Day"
                        status_tag = "off"
                else:
                    if att:
                        if att.status == "late":
                            variance = f"Late ({att.notes or 'Tardy'})"
                            status_tag = "late"
                        else:
                            variance = "Attended On Time"
                            status_tag = "present"
                    else:
                        if a.work_date > today_val:
                            variance = "Scheduled Upcoming"
                            status_tag = "scheduled"
                        elif a.work_date == today_val:
                            variance = "Scheduled Today"
                            status_tag = "scheduled"
                        else:
                            variance = "Absent / No Show"
                            status_tag = "absent"

                day_abbr = a.work_date.strftime("%a")
                formatted_date = _display(a.work_date, "date")

                reg_rows.append({
                    "work_date": formatted_date,
                    "day_name": day_abbr,
                    **person(emp),
                    "department_name": dept_name,
                    "shift_label": f"{shift_name} ({shift_code})" if not is_off else "Scheduled Day Off (OFF)",
                    "shift_hours": shift_hours,
                    "clock_in": clock_in_str,
                    "clock_out": clock_out_str,
                    "variance": variance,
                    "status": status_tag,
                    "notes": a.notes or "—",
                    "_is_off": is_off,
                    "_is_night": bool(shift and any(x in (shift.name.lower() + " " + shift_code.lower()) for x in ("late", "night", "l", "n"))),
                    "_is_morning": bool(shift and any(x in (shift.name.lower() + " " + shift_code.lower()) for x in ("early", "morning", "e"))),
                    "_is_afternoon": bool(shift and any(x in (shift.name.lower() + " " + shift_code.lower()) for x in ("afternoon", "mid", "a", "m"))),
                    "_has_att": bool(att and att.clock_in),
                })

                cov_key = (a.work_date, dept_name)
                if cov_key not in coverage_by_date:
                    coverage_by_date[cov_key] = {
                        "date": a.work_date,
                        "day": day_abbr,
                        "dept": dept_name,
                        "total_scheduled": 0,
                        "morning": 0,
                        "afternoon": 0,
                        "night": 0,
                        "off": 0,
                        "attended": 0,
                    }
                cd = coverage_by_date[cov_key]
                if is_off:
                    cd["off"] += 1
                else:
                    cd["total_scheduled"] += 1
                    if any(x in (shift_name.lower() + " " + shift_code.lower()) for x in ("late", "night", "l", "n")):
                        cd["night"] += 1
                    elif any(x in (shift_name.lower() + " " + shift_code.lower()) for x in ("early", "morning", "e")):
                        cd["morning"] += 1
                    else:
                        cd["afternoon"] += 1
                if att and att.clock_in:
                    cd["attended"] += 1

            cov_rows = []
            for cov_key in sorted(coverage_by_date.keys(), key=lambda k: (k[0], k[1])):
                cd = coverage_by_date[cov_key]
                cov_rows.append({
                    "work_date": _display(cd["date"], "date"),
                    "day_name": cd["day"],
                    "department_name": cd["dept"],
                    "total_scheduled": str(cd["total_scheduled"]),
                    "morning_count": str(cd["morning"]),
                    "afternoon_count": str(cd["afternoon"]),
                    "night_count": str(cd["night"]),
                    "off_count": str(cd["off"]),
                    "attended_count": str(cd["attended"]),
                    "coverage_audit": f"M: {cd['morning']} | A: {cd['afternoon']} | N: {cd['night']} | OFF: {cd['off']}",
                    "status": "completed" if cd["attended"] >= cd["total_scheduled"] and cd["total_scheduled"] > 0 else ("active" if cd["date"] >= today_val else "pending"),
                })

            cov_rows = add("24/7 Daily department coverage summary", _columns(
                ("work_date", "Date", "text"),
                ("day_name", "Day", "text"),
                ("department_name", "Department", "text"),
                ("total_scheduled", "On Duty", "text"),
                ("morning_count", "Morning (E)", "text"),
                ("afternoon_count", "Afternoon (A/M)", "text"),
                ("night_count", "Night (L/N)", "text"),
                ("off_count", "Rest Day (OFF)", "text"),
                ("attended_count", "Checked In", "text"),
                ("coverage_audit", "Shift Breakdown", "text"),
            ), cov_rows, "Audited 24-hour round-the-clock staffing levels across hotel wings and departments.")

            reg_rows = add("Shift assignments & attendance audit", _columns(
                ("work_date", "Date", "text"),
                ("day_name", "Day", "text"),
            ) + _employee_columns() + _columns(
                ("department_name", "Department", "text"),
                ("shift_label", "Assigned Shift", "text"),
                ("shift_hours", "Shift Hours", "text"),
                ("clock_in", "Clock In", "text"),
                ("clock_out", "Clock Out", "text"),
                ("variance", "Attendance Audit", "text"),
                ("status", "Status", "status"),
            ), reg_rows, "Individual employee roster assignments compared against actual biometric/web attendance.")

            all_shifts = Shift.query.order_by(Shift.id.asc()).all()
            shift_legend_rows = [{
                "code": s.code or "—",
                "name": s.name,
                "hours": f"{s.start_time} – {s.end_time}",
                "grace": f"{s.grace_minutes or 0} mins",
                "overtime_multiplier": f"{float(s.overtime_multiplier or 1.5):.2f}x",
                "status": "active"
            } for s in all_shifts]

            add("Active shift catalogue & working hours standard", _columns(
                ("code", "Code", "text"),
                ("name", "Shift Name", "text"),
                ("hours", "Standard Hours", "text"),
                ("grace", "Grace Period", "text"),
                ("overtime_multiplier", "OT Rate", "text"),
            ), shift_legend_rows, "Standard operating shift codes and working hour boundaries.")

            total_shifts = sum(1 for r in reg_rows if not r.get("_is_off"))
            total_off = sum(1 for r in reg_rows if r.get("_is_off"))
            total_night = sum(1 for r in reg_rows if r.get("_is_night"))
            total_attended = sum(1 for r in reg_rows if r.get("_has_att"))

            summary = [
                {"label": "Total assignments", "value": str(len(reg_rows))},
                {"label": "Shifts on duty", "value": str(total_shifts)},
                {"label": "Night / 24-7 coverage", "value": str(total_night)},
                {"label": "Scheduled rest days", "value": str(total_off)},
                {"label": "Actual clock-ins", "value": str(total_attended)},
            ]
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
        elif report_type == "loans":
            query = date_window(Loan.query.filter(Loan.employee_id.in_(ids)), Loan.start_date, filters)
            loans = query.order_by(Loan.start_date.desc(), Loan.id.desc()).all()

            loan_rows = []
            for r in loans:
                total_repaid = sum(float(rep.amount or 0) for rep in r.repayments) if r.repayments else max(0.0, float(r.principal or 0) - float(r.balance or 0))
                loan_rows.append({
                    **person(r.employee),
                    "reference_no": r.reference_no or f"LN-{r.id:04d}",
                    "loan_type": _display(r.loan_type),
                    "principal": _display(r.principal, "money").replace("GHS", currency),
                    "instalment": _display(r.instalment, "money").replace("GHS", currency),
                    "repayments_total": _display(total_repaid, "money").replace("GHS", currency),
                    "balance": _display(r.balance, "money").replace("GHS", currency),
                    "repayment_months": f"{r.repayment_months or 1} mo",
                    "start_date": _display(r.start_date, "date"),
                    "end_date": _display(r.end_date, "date"),
                    "status": r.status,
                    "_principal": float(r.principal or 0),
                    "_balance": float(r.balance or 0),
                    "_repaid": float(total_repaid),
                })

            loan_rows = add("Staff loan register", _columns(
                ("reference_no", "Loan ref", "text"),
            ) + _employee_columns() + _columns(
                ("department_name", "Department", "text"),
                ("loan_type", "Loan type", "text"),
                ("principal", "Principal", "text"),
                ("instalment", "Monthly deduction", "text"),
                ("repayments_total", "Repaid to date", "text"),
                ("balance", "Balance remaining", "text"),
                ("repayment_months", "Tenure", "text"),
                ("start_date", "Start date", "text"),
                ("end_date", "End date", "text"),
                ("status", "Status", "status"),
            ), loan_rows, "Staff loan portfolio, monthly amortization deductions, and real-time remaining balances.")

            # Repayment history ledger
            repayments_q = LoanRepayment.query.join(Loan).filter(Loan.employee_id.in_(ids))
            if filters["date_from"]:
                repayments_q = repayments_q.filter(LoanRepayment.repayment_date >= filters["date_from"])
            if filters["date_to"]:
                repayments_q = repayments_q.filter(LoanRepayment.repayment_date <= filters["date_to"])
            repayment_records = repayments_q.order_by(LoanRepayment.repayment_date.desc(), LoanRepayment.id.desc()).all()

            repayment_rows = [{
                "repayment_date": _display(rep.repayment_date, "date"),
                "reference_no": rep.loan.reference_no if rep.loan else "—",
                **person(rep.loan.employee if rep.loan and rep.loan.employee else by_id.get(rep.loan.employee_id)),
                "amount": _display(rep.amount, "money").replace("GHS", currency),
                "source": _display(rep.source),
                "balance_before": _display(rep.balance_before, "money").replace("GHS", currency),
                "balance_after": _display(rep.balance_after, "money").replace("GHS", currency),
                "notes": rep.notes or "—",
                "status": "completed",
            } for rep in repayment_records if rep.loan]

            repayment_rows = add("Repayment history & deduction ledger", _columns(
                ("repayment_date", "Payment date", "text"),
                ("reference_no", "Loan ref", "text"),
            ) + _employee_columns() + _columns(
                ("department_name", "Department", "text"),
                ("amount", "Amount paid", "text"),
                ("source", "Deduction source", "text"),
                ("balance_before", "Balance before", "text"),
                ("balance_after", "Balance after", "text"),
                ("notes", "Remarks", "text"),
            ), repayment_rows, "Chronological audit trail of loan repayments, payroll deductions, and balance reductions.")

            total_principal = sum(r["_principal"] for r in loan_rows)
            total_balance = sum(r["_balance"] for r in loan_rows)
            total_repaid = sum(r["_repaid"] for r in loan_rows)
            summary = [
                {"label": "Total loans", "value": str(len(loan_rows))},
                {"label": "Active loans", "value": str(sum(r["status"] == "active" for r in loan_rows))},
                {"label": "Total disbursed", "value": f"{currency} {total_principal:,.2f}"},
                {"label": "Total repaid", "value": f"{currency} {total_repaid:,.2f}"},
                {"label": "Outstanding balance", "value": f"{currency} {total_balance:,.2f}"},
            ]
        elif report_type == "leave-encashment":
            query = LeaveEncashment.query.filter(LeaveEncashment.employee_id.in_(ids))
            if filters["year"]:
                query = query.filter(LeaveEncashment.year == filters["year"])
            if filters["date_from"]:
                query = query.filter(LeaveEncashment.created_at >= datetime.combine(filters["date_from"], datetime.min.time()))
            if filters["date_to"]:
                query = query.filter(LeaveEncashment.created_at <= datetime.combine(filters["date_to"], datetime.max.time()))

            encashments = query.order_by(LeaveEncashment.created_at.desc(), LeaveEncashment.id.desc()).all()

            def approval_summary(enc):
                if enc.status == "paid":
                    return "Paid & settled"
                if enc.status == "rejected":
                    return "Rejected"
                steps = []
                steps.append("HOD: " + ("✓" if enc.hod_approved_at else "⏳"))
                steps.append("Acct: " + ("✓" if enc.accountant_approved_at else "⏳"))
                steps.append("MD: " + ("✓" if enc.md_approved_at else "⏳"))
                return " ".join(steps)

            enc_rows = [{
                **person(r.employee),
                "reference_no": r.reference_no or f"ENC-{r.id:04d}",
                "leave_type": r.leave_type.name if r.leave_type else "Annual Leave",
                "year": str(r.year),
                "days_sold": _display(r.days_sold, "number") + " d",
                "daily_rate": _display(r.daily_rate, "money").replace("GHS", currency),
                "total_amount": _display(r.total_amount, "money").replace("GHS", currency),
                "accumulated_before": _display(r.accumulated_before, "number") + " d",
                "accumulated_after": _display(r.accumulated_after, "number") + " d",
                "approvals": approval_summary(r),
                "created_at": _display(r.created_at, "date"),
                "status": r.status,
                "reason": r.reason or "—",
                "_days_sold": float(r.days_sold or 0),
                "_total_amount": float(r.total_amount or 0),
            } for r in encashments]

            enc_rows = add("Leave encashment register", _columns(
                ("reference_no", "Reference", "text"),
            ) + _employee_columns() + _columns(
                ("department_name", "Department", "text"),
                ("leave_type", "Leave type", "text"),
                ("year", "Year", "text"),
                ("days_sold", "Days sold", "text"),
                ("daily_rate", "Daily rate", "text"),
                ("total_amount", "Payout amount", "text"),
                ("accumulated_before", "Accrued before", "text"),
                ("accumulated_after", "Balance after", "text"),
                ("approvals", "Approval steps", "text"),
                ("status", "Status", "status"),
                ("created_at", "Applied on", "text"),
            ), enc_rows, "Audited record of employee leaves sold, daily cash compensation, and deducted leave balances.")

            total_days = sum(r["_days_sold"] for r in enc_rows)
            total_payout = sum(r["_total_amount"] for r in enc_rows)
            summary = [
                {"label": "Encashment requests", "value": str(len(enc_rows))},
                {"label": "Total days sold", "value": f"{total_days:g} days"},
                {"label": "Total compensation paid", "value": f"{currency} {total_payout:,.2f}"},
                {"label": "Paid / Approved", "value": str(sum(r["status"] in ("paid", "approved") for r in enc_rows))},
                {"label": "Pending review", "value": str(sum(r["status"] == "pending" for r in enc_rows))},
            ]
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
        elif report_type == "hotel-workorders":
            wo_query = HotelWorkOrder.query
            if filters["employee_id"]:
                wo_query = wo_query.filter(HotelWorkOrder.assigned_to_id == filters["employee_id"])
            elif filters["department_id"] is not None:
                wo_query = wo_query.filter(HotelWorkOrder.assigned_to_id.in_(ids))
            else:
                wo_query = wo_query.filter(or_(HotelWorkOrder.assigned_to_id.in_(ids), HotelWorkOrder.assigned_to_id.is_(None)))

            if filters["date_from"]:
                wo_query = wo_query.filter(HotelWorkOrder.created_at >= datetime.combine(filters["date_from"], datetime.min.time()))
            if filters["date_to"]:
                wo_query = wo_query.filter(HotelWorkOrder.created_at <= datetime.combine(filters["date_to"], datetime.max.time()))

            orders = wo_query.order_by(HotelWorkOrder.created_at.desc(), HotelWorkOrder.id.desc()).all()
            now_dt = datetime.utcnow()

            def _fmt_hours(hrs):
                if hrs < 1:
                    return f"{max(1, int(hrs * 60))} mins"
                if hrs < 24:
                    return f"{hrs:.1f} hrs"
                return f"{(hrs / 24):.1f} days"

            sla_map = {"emergency": 2, "high": 12, "medium": 24, "low": 48}
            sla_met_count = 0
            completed_count = 0
            wing_stats = {}

            wo_rows = []
            for o in orders:
                emp = o.assigned_to or by_id.get(o.assigned_to_id)
                emp_name = emp.full_name if emp else "Unassigned"
                emp_no = emp.employee_no if emp else "—"

                created_dt = o.created_at or now_dt
                if o.completed_at:
                    elapsed = (o.completed_at - created_dt).total_seconds() / 3600
                    is_done = True
                else:
                    elapsed = (now_dt - created_dt).total_seconds() / 3600
                    is_done = False

                limit_hrs = sla_map.get((o.priority or "medium").lower(), 24)

                if is_done:
                    completed_count += 1
                    if elapsed <= limit_hrs:
                        sla_str = f"✓ Within SLA ({_fmt_hours(elapsed)})"
                        sla_met_count += 1
                        sla_tag = "completed"
                    else:
                        over = elapsed - limit_hrs
                        sla_str = f"⚠ Breached (+{_fmt_hours(over)})"
                        sla_tag = "late"
                else:
                    if elapsed > limit_hrs:
                        over = elapsed - limit_hrs
                        sla_str = f"⚠ Overdue (+{_fmt_hours(over)})"
                        sla_tag = "absent"
                    else:
                        left = limit_hrs - elapsed
                        sla_str = f"In SLA ({_fmt_hours(left)} left)"
                        sla_tag = "scheduled"

                wing_key = o.wing or "Central Facility"
                if wing_key not in wing_stats:
                    wing_stats[wing_key] = {"total": 0, "completed": 0, "open": 0, "sla_met": 0, "total_hrs": 0}
                wing_stats[wing_key]["total"] += 1
                if is_done:
                    wing_stats[wing_key]["completed"] += 1
                    wing_stats[wing_key]["total_hrs"] += elapsed
                    if elapsed <= limit_hrs:
                        wing_stats[wing_key]["sla_met"] += 1
                else:
                    wing_stats[wing_key]["open"] += 1

                wo_rows.append({
                    "order_no": o.order_no,
                    "wing": o.wing or "Central Facility",
                    "floor": o.floor or "—",
                    "location": o.location,
                    "title": o.title,
                    "category": o.category,
                    "priority": (o.priority or "medium").title(),
                    "employee_name": emp_name,
                    "employee_no": emp_no,
                    "reported_at": _display(o.created_at, "datetime"),
                    "turnaround": _fmt_hours(elapsed) if is_done else f"Open ({_fmt_hours(elapsed)})",
                    "sla_status": sla_str,
                    "status": o.status or "open",
                    "_sla_tag": sla_tag,
                })

            wo_rows = add("Hotel work orders & turnaround SLA register", _columns(
                ("order_no", "Order no.", "text"),
                ("wing", "Wing", "text"),
                ("floor", "Floor", "text"),
                ("location", "Room / Area", "text"),
                ("title", "Work Order Title", "text"),
                ("category", "Category", "text"),
                ("priority", "Priority", "text"),
                ("employee_name", "Technician", "text"),
                ("reported_at", "Reported", "text"),
                ("turnaround", "Turnaround", "text"),
                ("sla_status", "SLA Performance", "text"),
                ("status", "Status", "status"),
            ), wo_rows, "Audited record of guest and facility work orders, room repairs, and SLA response times.")

            # Section 2: Wing & Floor Backlog Summary
            wing_rows = []
            for w, ws in sorted(wing_stats.items(), key=lambda x: x[0]):
                comp_pct = round((ws["completed"] / ws["total"]) * 100) if ws["total"] > 0 else 0
                sla_pct = round((ws["sla_met"] / ws["completed"]) * 100) if ws["completed"] > 0 else 0
                avg_hrs = (ws["total_hrs"] / ws["completed"]) if ws["completed"] > 0 else 0
                wing_rows.append({
                    "wing": w,
                    "total_orders": str(ws["total"]),
                    "open_orders": str(ws["open"]),
                    "completed_orders": str(ws["completed"]),
                    "completion_rate": f"{comp_pct}%",
                    "avg_turnaround": _fmt_hours(avg_hrs) if ws["completed"] > 0 else "—",
                    "sla_compliance": f"{sla_pct}% within SLA" if ws["completed"] > 0 else "Pending",
                    "status": "completed" if comp_pct >= 90 else ("active" if comp_pct >= 50 else "probation"),
                })

            wing_rows = add("Hotel wing & area maintenance backlog summary", _columns(
                ("wing", "Hotel Wing / Zone", "text"),
                ("total_orders", "Total Orders", "text"),
                ("open_orders", "Backlog (Open)", "text"),
                ("completed_orders", "Completed", "text"),
                ("completion_rate", "Resolution Rate", "text"),
                ("avg_turnaround", "Avg Turnaround", "text"),
                ("sla_compliance", "SLA Compliance", "text"),
                ("status", "Status", "status"),
            ), wing_rows, "Consolidated resolution and backlog health across hotel wings.")

            # Section 3: Scheduled Maintenance & Contractor Cost Ledger
            mw_query = MaintenanceWork.query
            if filters["employee_id"]:
                mw_query = mw_query.filter(MaintenanceWork.worker_id == filters["employee_id"])
            if filters["date_from"]:
                mw_query = mw_query.filter(MaintenanceWork.scheduled_at >= datetime.combine(filters["date_from"], datetime.min.time()))
            if filters["date_to"]:
                mw_query = mw_query.filter(MaintenanceWork.scheduled_at <= datetime.combine(filters["date_to"], datetime.max.time()))

            mw_records = mw_query.order_by(MaintenanceWork.scheduled_at.desc(), MaintenanceWork.id.desc()).all()
            mw_rows = [{
                "reference_no": m.reference_no,
                "title": m.title,
                "category": m.category,
                "location": m.location,
                "scheduled_at": _display(m.scheduled_at, "date"),
                "worker_name": m.worker_name or (m.worker.full_name if m.worker else "In-house team"),
                "amount": _display(m.amount, "money").replace("GHS", currency),
                "status": m.status,
                "remarks": m.remarks or m.description or "—",
                "_amount": float(m.amount or 0),
            } for m in mw_records]

            mw_rows = add("Scheduled maintenance & contractor repair cost ledger", _columns(
                ("reference_no", "Reference", "text"),
                ("title", "Maintenance Job", "text"),
                ("category", "Trade / System", "text"),
                ("location", "Plant / Location", "text"),
                ("scheduled_at", "Date", "text"),
                ("worker_name", "Service Provider / Tech", "text"),
                ("amount", "Cost / Amount", "text"),
                ("status", "Status", "status"),
                ("remarks", "Scope & Remarks", "text"),
            ), mw_rows, "Audited expenditure for scheduled preventive maintenance, plant servicing, and contractor repairs.")

            total_maint_cost = sum(r["_amount"] for r in mw_rows)
            overall_sla_pct = round((sla_met_count / completed_count) * 100) if completed_count > 0 else 0

            summary = [
                {"label": "Total work orders", "value": str(len(wo_rows))},
                {"label": "Completed repairs", "value": str(completed_count)},
                {"label": "Active backlog", "value": str(sum(r["status"] in ("open", "in_progress") for r in wo_rows))},
                {"label": "SLA compliance rate", "value": f"{overall_sla_pct}%" if completed_count > 0 else "—"},
                {"label": "Maintenance cost", "value": f"{currency} {total_maint_cost:,.2f}"},
            ]
        elif report_type == "hotel-inventory":
            # 1. Query items
            item_query = HotelInventoryItem.query
            if filters["department_id"] is not None:
                item_query = item_query.join(HotelInventoryItem.storeroom).filter(HotelStoreroom.department_id == filters["department_id"])

            items = item_query.order_by(HotelInventoryItem.category.asc(), HotelInventoryItem.name.asc()).all()

            # Section 1: Storeroom Inventory Register & Asset Valuation
            inv_rows = []
            low_stock_rows = []
            total_val = 0.0
            reorder_budget = 0.0
            low_stock_count = 0
            out_of_stock_count = 0

            for itm in items:
                stock_qty = itm.current_stock or 0
                reorder_qty = itm.reorder_level or 0
                par_qty = itm.ideal_par_level or 0
                cost = float(itm.unit_cost or 0)
                item_val = stock_qty * cost
                total_val += item_val

                store_name = itm.storeroom.name if itm.storeroom else "General Store"
                store_code = itm.storeroom.code if itm.storeroom else "STORE"

                is_out = stock_qty <= 0
                is_low = stock_qty <= reorder_qty and not is_out

                if is_out:
                    out_of_stock_count += 1
                    health_str = "🚨 Out of Stock (0)"
                    health_status = "absent"
                elif is_low:
                    low_stock_count += 1
                    health_str = f"⚠ Low Stock ({stock_qty} / {reorder_qty})"
                    health_status = "late"
                else:
                    par_pct = round((stock_qty / par_qty) * 100) if par_qty > 0 else 100
                    health_str = f"✓ Healthy ({par_pct}% of Par)"
                    health_status = "completed"

                row_dict = {
                    "sku": itm.sku,
                    "name": itm.name,
                    "category": itm.category,
                    "storeroom": f"{store_name} ({store_code})",
                    "current_stock": f"{stock_qty} {itm.unit or 'units'}",
                    "par_level": f"{par_qty} {itm.unit or 'units'}",
                    "reorder_level": f"{reorder_qty} {itm.unit or 'units'}",
                    "unit_cost": _display(cost, "money").replace("GHS", currency),
                    "valuation": _display(item_val, "money").replace("GHS", currency),
                    "health": health_str,
                    "status": itm.status or ("out_of_stock" if is_out else ("low_stock" if is_low else "in_stock")),
                    "_valuation": item_val,
                }
                inv_rows.append(row_dict)

                # Low stock & urgent reorder table
                if is_out or is_low:
                    shortage = max(0, par_qty - stock_qty)
                    needed_cost = shortage * cost
                    reorder_budget += needed_cost
                    low_stock_rows.append({
                        "sku": itm.sku,
                        "name": itm.name,
                        "storeroom": store_name,
                        "current_stock": f"{stock_qty} {itm.unit or 'units'}",
                        "reorder_level": f"{reorder_qty} {itm.unit or 'units'}",
                        "shortage": f"{shortage} {itm.unit or 'units'}",
                        "reorder_cost": _display(needed_cost, "money").replace("GHS", currency),
                        "supplier": itm.supplier or "Preferred Vendor",
                        "status": "out_of_stock" if is_out else "low_stock",
                        "_needed_cost": needed_cost,
                    })

            inv_rows = add("Storeroom inventory register & asset valuation", _columns(
                ("sku", "SKU", "text"),
                ("name", "Item Description", "text"),
                ("category", "Category", "text"),
                ("storeroom", "Storeroom / Hub", "text"),
                ("current_stock", "On Hand", "text"),
                ("par_level", "Par Level", "text"),
                ("reorder_level", "Reorder Level", "text"),
                ("unit_cost", "Unit Cost", "text"),
                ("valuation", "Asset Value", "text"),
                ("health", "Stock Health", "text"),
                ("status", "Status", "status"),
            ), inv_rows, "Audited valuation and current stock positions across all hotel departments and guest hubs.")

            low_stock_rows = add("Low stock & urgent replenishment alert schedule", _columns(
                ("sku", "SKU", "text"),
                ("name", "Item Description", "text"),
                ("storeroom", "Storeroom", "text"),
                ("current_stock", "Stock Level", "text"),
                ("reorder_level", "Threshold", "text"),
                ("shortage", "Replenish Qty", "text"),
                ("reorder_cost", "Restock Budget", "text"),
                ("supplier", "Supplier / Source", "text"),
                ("status", "Urgency", "status"),
            ), low_stock_rows, "Critical items depleted below minimum reorder thresholds requiring urgent purchase requisitions.")

            # Section 3: Stock Movement & Issuance Audit Trail
            mov_query = HotelStockMovement.query
            if filters["date_from"]:
                mov_query = mov_query.filter(HotelStockMovement.movement_date >= filters["date_from"])
            if filters["date_to"]:
                mov_query = mov_query.filter(HotelStockMovement.movement_date <= filters["date_to"])

            movements = mov_query.order_by(HotelStockMovement.movement_date.desc(), HotelStockMovement.id.desc()).all()
            mov_rows = []
            for m in movements:
                itm = m.item
                m_type = m.movement_type.lower() if m.movement_type else "transfer"
                type_label = {
                    "in": "Received (IN)",
                    "out": "Issued to Rooms (OUT)",
                    "transfer": "Stock Transfer",
                    "damage": "Damaged / Discarded",
                    "return": "Vendor Return",
                    "adjustment": "Physical Count Audit",
                }.get(m_type, m.movement_type.title() if m.movement_type else "Movement")

                mov_rows.append({
                    "movement_date": _display(m.movement_date, "date"),
                    "reference_no": m.reference_no or f"MOV-{m.id:04d}",
                    "item_name": itm.name if itm else f"Item #{m.item_id}",
                    "sku": itm.sku if itm else "—",
                    "movement_type": type_label,
                    "quantity": f"{m.quantity} {itm.unit if itm and itm.unit else 'units'}",
                    "source_dest": m.source_dest or "Internal Transfer",
                    "status": "completed",
                })

            mov_rows = add("Stock movement & issuance audit trail", _columns(
                ("movement_date", "Date", "text"),
                ("reference_no", "Reference / PO", "text"),
                ("sku", "SKU", "text"),
                ("item_name", "Item Description", "text"),
                ("movement_type", "Movement Type", "text"),
                ("quantity", "Quantity", "text"),
                ("source_dest", "Source / Destination", "text"),
                ("status", "Status", "status"),
            ), mov_rows, "Chronological movement register of deliveries, room replenishments, and linen disbursements.")

            # Section 4: Storeroom Capacity & Hub Utilization Breakdown
            storerooms = HotelStoreroom.query.order_by(HotelStoreroom.name.asc()).all()
            store_rows = []
            for s in storerooms:
                s_items = [i for i in items if i.storeroom_id == s.id]
                s_val = sum(float(i.current_stock or 0) * float(i.unit_cost or 0) for i in s_items)
                store_rows.append({
                    "code": s.code,
                    "name": s.name,
                    "category": s.category,
                    "location": f"{s.location} ({s.wing or 'Main'})",
                    "items_count": str(len(s_items)),
                    "total_valuation": _display(s_val, "money").replace("GHS", currency),
                    "capacity": f"{s.capacity_utilization or 0}% utilized",
                    "manager_name": s.manager_name or (s.manager.full_name if s.manager else "Storekeeper"),
                    "status": s.status or "active",
                })

            store_rows = add("Storeroom facility & service hub overview", _columns(
                ("code", "Hub Code", "text"),
                ("name", "Storeroom Name", "text"),
                ("category", "Category", "text"),
                ("location", "Location / Wing", "text"),
                ("items_count", "SKU Count", "text"),
                ("total_valuation", "Inventory Value", "text"),
                ("capacity", "Space Capacity", "text"),
                ("manager_name", "Custodian", "text"),
                ("status", "Status", "status"),
            ), store_rows, "Overview of central linen storage, housekeeping pantries, and guest room hubs.")

            summary = [
                {"label": "Total inventory value", "value": f"{currency} {total_val:,.2f}"},
                {"label": "Tracked SKUs", "value": str(len(inv_rows))},
                {"label": "Low stock alerts", "value": str(low_stock_count)},
                {"label": "Out of stock items", "value": str(out_of_stock_count)},
                {"label": "Restock budget required", "value": f"{currency} {reorder_budget:,.2f}"},
            ]

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
                "organisation_types": [t["key"] for t in accessible_types() if can_access_org_type(t["key"])],
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
                "report_types": [t["key"] for t in accessible_types() if can_access_org_type(t["key"])]})
        organisation_types = [t["key"] for t in accessible_types() if can_access_org_type(t["key"])]
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
