"""
Airport West Hotel Ltd - HRMS & Operations
Granular Permissions & Privileges System
Defines system modules, granular privileges, and access check helpers.
"""

PERMISSION_MODULES = [
    {
        "id": "employees",
        "name": "Employees & Directory",
        "icon": "users",
        "description": "Employee records, profiles, onboarding and personal information",
        "privileges": [
            {"id": "view", "name": "View Directory & Profiles", "desc": "Browse employee directory, org chart, contact cards"},
            {"id": "create", "name": "Create / Onboard Employees", "desc": "Add new employees, hire details, probation terms"},
            {"id": "edit", "name": "Edit Employee Details", "desc": "Update personal, employment, and job details"},
            {"id": "delete", "name": "Delete / Terminate Employees", "desc": "Terminate, delete, and archive employee records"},
            {"id": "sensitive", "name": "View Sensitive Compensation & IDs", "desc": "Access basic salary, bank accounts, SSNIT/TIN & personal IDs"},
            {"id": "export", "name": "Export Employee Data", "desc": "Download employee records to Excel and CSV"},
        ],
    },
    {
        "id": "org",
        "name": "Organisation Structure & Leadership",
        "icon": "layers",
        "description": "Departments, designations, salary grades, branches, and leadership",
        "privileges": [
            {"id": "view", "name": "View Structure", "desc": "View departments, designations, branches, and grades"},
            {"id": "create", "name": "Create Structure Elements", "desc": "Add new departments, branches, designations"},
            {"id": "edit", "name": "Edit Structure & Bands", "desc": "Modify department settings, salary bands, locations"},
            {"id": "delete", "name": "Delete Structure Elements", "desc": "Delete departments, branches, designations, grades"},
            {"id": "manage_heads", "name": "Manage Department Heads & Leadership", "desc": "Appoint and configure departmental heads and assistants"},
        ],
    },
    {
        "id": "leave",
        "name": "Leave & Absences",
        "icon": "calendar",
        "description": "Leave applications, 3-tier approvals, holiday policies, and carry-over",
        "privileges": [
            {"id": "view", "name": "View Leave Records & Calendar", "desc": "View department leave calendar and staff absence requests"},
            {"id": "apply", "name": "Apply on Behalf of Staff", "desc": "Submit leave applications for other team members"},
            {"id": "approve_hod", "name": "Approve as Department Head (HoD)", "desc": "Level 1 departmental leave authorization"},
            {"id": "approve_acc", "name": "Approve as Accountant / Finance", "desc": "Level 2 financial leave authorization"},
            {"id": "approve_md", "name": "Approve as Managing Director (MD)", "desc": "Level 3 executive final leave authorization"},
            {"id": "manage_types", "name": "Manage Leave Policies & Types", "desc": "Configure paid leave types, statutory accruals, carry-forward"},
            {"id": "carry_over", "name": "Execute Annual Carry-Over", "desc": "Run year-end carry-over and balance adjustments"},
        ],
    },
    {
        "id": "attendance",
        "name": "Attendance & Shift Rosters",
        "icon": "clock",
        "description": "Time clocking, timesheets, shift scheduling, and overtime",
        "privileges": [
            {"id": "view", "name": "View Attendance Logs & Timesheets", "desc": "View daily check-ins, punch logs, and timesheet reports"},
            {"id": "clock", "name": "Manual Punch & Overtime Logging", "desc": "Log manual attendance, overtime hours, and adjust punches"},
            {"id": "approve", "name": "Approve Timesheets & Overtime", "desc": "Sign off on department weekly/monthly timesheets"},
            {"id": "shifts", "name": "Manage Shifts & Rosters", "desc": "Configure shift timings, schedules, and staff rosters"},
        ],
    },
    {
        "id": "payroll",
        "name": "Payroll & Compensation",
        "icon": "dollarSign",
        "description": "Monthly payroll processing, allowances, taxes, SSNIT, and payslips",
        "privileges": [
            {"id": "view", "name": "View Payroll Dashboard & Summaries", "desc": "View previous payroll periods and summaries"},
            {"id": "calculate", "name": "Process & Calculate Payroll Runs", "desc": "Initiate monthly payroll, tax, SSNIT calculations"},
            {"id": "approve", "name": "Approve & Finalize Payroll", "desc": "Finalize and lock payroll runs for disbursement"},
            {"id": "export", "name": "Export Bank Schedules & GRA Reports", "desc": "Generate bank payment advice, GRA tax schedules"},
            {"id": "structures", "name": "Manage Salary Components & Structures", "desc": "Configure basic salaries, allowances, and deductions"},
        ],
    },
    {
        "id": "recruitment",
        "name": "Recruitment & Applicant Tracking",
        "icon": "briefcase",
        "description": "Job vacancies, candidate pipeline, interviews, and offer letters",
        "privileges": [
            {"id": "view", "name": "View Jobs & Applications", "desc": "Review open positions and incoming applications"},
            {"id": "create", "name": "Post Job Openings", "desc": "Create and publish new job vacancies and requisitions"},
            {"id": "pipeline", "name": "Manage Candidate Stages", "desc": "Screen candidates, advance through hiring stages, change status"},
            {"id": "interviews", "name": "Schedule & Score Interviews", "desc": "Assign interview panels, log feedback and ratings"},
            {"id": "offers", "name": "Issue Offers & Appointment Letters", "desc": "Generate offer packages and official letters"},
        ],
    },
    {
        "id": "documents",
        "name": "Employment Letters & Official Documents",
        "icon": "fileText",
        "description": "Word/PDF document templates, tag extraction, and letter generation",
        "privileges": [
            {"id": "view", "name": "View Generated Documents & Letters", "desc": "Access official letters and staff document repository"},
            {"id": "generate", "name": "Generate Official Letters", "desc": "Create appointment, promotion, confirmation letters"},
            {"id": "templates", "name": "Manage Templates & Word/PDF Uploads", "desc": "Upload Word/PDF templates and configure dynamic tags"},
            {"id": "delete", "name": "Delete Letters & Templates", "desc": "Remove templates and archived documents"},
        ],
    },
    {
        "id": "operations",
        "name": "Hotel Operations & Assets",
        "icon": "box",
        "description": "Fixed assets, storeroom inventory, and maintenance work orders",
        "privileges": [
            {"id": "view", "name": "View Operations & Asset Register", "desc": "Inspect asset register, stock items, and work orders"},
            {"id": "assets", "name": "Create & Edit Assets", "desc": "Add, update, revalue, and retire hotel assets"},
            {"id": "inventory", "name": "Manage Storeroom & Stock Items", "desc": "Maintain storeroom items, minimum thresholds, categories"},
            {"id": "stock_adjust", "name": "Approve Stock Movements & Adjustments", "desc": "Record receiving, issues, write-offs, transfers"},
            {"id": "work_orders", "name": "Create & Assign Maintenance Orders", "desc": "Raise maintenance requests, assign technicians"},
            {"id": "delete", "name": "Delete Operations Records", "desc": "Delete asset, inventory, and work order records"},
        ],
    },
    {
        "id": "reports",
        "name": "Reports & Analytics",
        "icon": "barChart",
        "description": "Executive dashboards, operational analytics, and data exports",
        "privileges": [
            {"id": "view", "name": "View Standard Reports", "desc": "Headcount, turnover, leave, operations summaries"},
            {"id": "payroll", "name": "Access Sensitive Payroll Analytics", "desc": "Gross wage analysis, tax deductions, cost breakdown"},
            {"id": "export", "name": "Export Reports (Excel / PDF / CSV)", "desc": "Download formatted tabular and graphical reports"},
        ],
    },
    {
        "id": "settings",
        "name": "System Administration & Settings",
        "icon": "settings",
        "description": "Company profile, user accounts, roles, backups, and security",
        "privileges": [
            {"id": "view", "name": "View System Configuration", "desc": "View company profile, currency, timezone, settings"},
            {"id": "company", "name": "Update Company & Branding", "desc": "Update company details, logo, colors, location"},
            {"id": "users", "name": "Manage User Accounts & Access", "desc": "Create, invite, lock, and reset user credentials"},
            {"id": "roles", "name": "Manage Roles & Granular Privileges", "desc": "Create roles and customize granular permissions"},
            {"id": "backups", "name": "Manage Database Backups & Recovery", "desc": "Take manual snapshots, download, and restore database"},
            {"id": "notifications", "name": "Configure Notification Channels", "desc": "Set up email alerts, delivery settings, and templates"},
        ],
    },
    {
        "id": "audit",
        "name": "Security & Audit Trail",
        "icon": "shield",
        "description": "Security logging, system audit trails, and compliance history",
        "privileges": [
            {"id": "view", "name": "View Audit Log Events", "desc": "Inspect who performed which action and timestamp"},
            {"id": "export", "name": "Export Audit Trail", "desc": "Export tamper-evident audit records"},
        ],
    },
    {
        "id": "ess",
        "name": "Employee Self-Service (ESS)",
        "icon": "user",
        "description": "Individual employee personal portal capabilities",
        "privileges": [
            {"id": "profile", "name": "Personal Profile & Signature", "desc": "View & edit personal info, upload digital signature"},
            {"id": "leave", "name": "Apply for Personal Leave", "desc": "Submit own leave requests and view balances"},
            {"id": "payslips", "name": "View Personal Payslips", "desc": "Access and download personal payslips"},
            {"id": "tickets", "name": "Submit Internal Requests", "desc": "Raise service tickets and maintenance requests"},
        ],
    },
]


def user_permissions(user):
    """Return set of normalized permission tokens for user."""
    if not user or not getattr(user, "role", None):
        return set()
    raw = str(user.role.permissions or "").strip()
    if not raw:
        return set()
    if raw == "*":
        return {"*"}
    return {p.strip() for p in raw.split(",") if p.strip()}


def has_permission(user, module, privilege=None):
    """Check if a user has access to a module and optional sub-privilege."""
    if not user:
        return False
    role_slug = getattr(user.role, "slug", "") if getattr(user, "role", None) else ""
    if role_slug == "super_admin":
        return True
    perms = user_permissions(user)
    if "*" in perms:
        return True
    if not privilege:
        # Module level check: user has module, module.* or any module.<privilege>
        return (module in perms) or (f"{module}.*" in perms) or any(p.startswith(f"{module}.") for p in perms)
    # Granular privilege check
    return (module in perms) or (f"{module}.*" in perms) or (f"{module}.{privilege}" in perms)


def all_permission_keys():
    """Return list of all module.privilege keys."""
    keys = []
    for mod in PERMISSION_MODULES:
        for p in mod["privileges"]:
            keys.append(f"{mod['id']}.{p['id']}")
    return keys
