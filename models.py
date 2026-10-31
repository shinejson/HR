from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def now():
    return datetime.utcnow()


class TimestampMixin:
    created_at = db.Column(db.DateTime, default=now, nullable=False)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now, nullable=False)
    created_by = db.Column(db.Integer, nullable=True)
    updated_by = db.Column(db.Integer, nullable=True)


class SoftDeleteMixin:
    deleted_at = db.Column(db.DateTime, nullable=True)


class Role(db.Model, TimestampMixin):
    __tablename__ = "roles"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    slug = db.Column(db.String(80), unique=True, nullable=False)
    description = db.Column(db.String(255))
    is_system = db.Column(db.Boolean, default=False)
    permissions = db.Column(db.Text, default="")


class User(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, index=True)
    email = db.Column(db.String(180), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=True)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), nullable=False)
    status = db.Column(db.String(20), default="active")
    mfa_enabled = db.Column(db.Boolean, default=False)
    # TOTP enrolment. `mfa_secret` exists as soon as setup starts; `mfa_enabled`
    # only flips once the user proves they can generate a valid code.
    mfa_secret = db.Column(db.String(64))
    mfa_recovery_codes = db.Column(db.Text)
    mfa_confirmed_at = db.Column(db.DateTime)
    mfa_prompt_snoozed_at = db.Column(db.DateTime)
    last_login_at = db.Column(db.DateTime)
    last_login_ip = db.Column(db.String(64))
    failed_attempts = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime)
    token = db.Column(db.String(64), unique=True)
    token_expires_at = db.Column(db.DateTime)
    last_activity_at = db.Column(db.DateTime)
    must_change_password = db.Column(db.Boolean, default=False)
    role = db.relationship("Role")
    employee = db.relationship("Employee", foreign_keys=[employee_id], post_update=True)


class Company(db.Model, TimestampMixin):
    __tablename__ = "companies"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(180), nullable=False)
    legal_name = db.Column(db.String(180))
    city = db.Column(db.String(80), default="Accra")
    location_name = db.Column(db.String(120), default="Accra HQ")
    tagline = db.Column(db.String(180), default="People operations")
    country = db.Column(db.String(80), default="Ghana")
    currency = db.Column(db.String(8), default="GHS")
    timezone = db.Column(db.String(64), default="Africa/Accra")
    address = db.Column(db.String(255))
    phone = db.Column(db.String(40))
    email = db.Column(db.String(180))
    tax_id = db.Column(db.String(80))
    logo_url = db.Column(db.Text)
    favicon_url = db.Column(db.Text)
    theme = db.Column(db.String(60), default="meridian")
    website = db.Column(db.String(180))
    fax = db.Column(db.String(80))


class BrandingAsset(db.Model, TimestampMixin):
    __tablename__ = "branding_assets"
    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.String(32), nullable=False)
    stored_name = db.Column(db.String(180), unique=True, nullable=False, index=True)
    orig_filename = db.Column(db.String(255))
    mime_type = db.Column(db.String(80), nullable=False)
    content = db.Column(db.LargeBinary, nullable=False)


class Branch(db.Model, TimestampMixin):
    __tablename__ = "branches"
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey("companies.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    code = db.Column(db.String(20))
    city = db.Column(db.String(80))
    address = db.Column(db.String(255))
    phone = db.Column(db.String(40))
    is_head_office = db.Column(db.Boolean, default=False)
    company = db.relationship("Company")


class Department(db.Model, TimestampMixin):
    __tablename__ = "departments"
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, primary_key=False, default=1)
    parent_id = db.Column(db.Integer, db.ForeignKey("departments.id"))
    name = db.Column(db.String(120), nullable=False)
    code = db.Column(db.String(20))
    head_id = db.Column(db.Integer)
    cost_centre = db.Column(db.String(40))
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"))
    description = db.Column(db.Text)
    budget = db.Column(db.Numeric(15, 2), default=0)
    target_headcount = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default="active")
    email = db.Column(db.String(180))
    phone = db.Column(db.String(40))
    parent = db.relationship("Department", remote_side="Department.id")
    branch = db.relationship("Branch")


class Designation(db.Model, TimestampMixin):
    __tablename__ = "designations"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    level = db.Column(db.Integer, default=1)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"))
    description = db.Column(db.Text)


class Grade(db.Model, TimestampMixin):
    __tablename__ = "grades"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(40), nullable=False)
    level = db.Column(db.Integer, default=1)
    min_salary = db.Column(db.Numeric(15, 2), default=0)
    max_salary = db.Column(db.Numeric(15, 2), default=0)


class Employee(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "employees"
    id = db.Column(db.Integer, primary_key=True)
    employee_no = db.Column(db.String(40), unique=True, nullable=False)
    first_name = db.Column(db.String(80), nullable=False)
    last_name = db.Column(db.String(80), nullable=False)
    other_names = db.Column(db.String(80))
    email = db.Column(db.String(180), unique=True)
    phone = db.Column(db.String(40))
    gender = db.Column(db.String(20))
    dob = db.Column(db.Date)
    nationality = db.Column(db.String(80), default="Ghanaian")
    marital_status = db.Column(db.String(20))
    address = db.Column(db.String(255))
    city = db.Column(db.String(80))
    photo_url = db.Column(db.String(255))
    hire_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    confirmation_date = db.Column(db.Date)
    probation_end = db.Column(db.Date)
    contract_type = db.Column(db.String(40), default="permanent")
    staff_category = db.Column(db.String(60), default="General Staff")
    status = db.Column(db.String(20), default="active")
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"))
    designation_id = db.Column(db.Integer, db.ForeignKey("designations.id"))
    grade_id = db.Column(db.Integer, db.ForeignKey("grades.id"))
    manager_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"))
    company_id = db.Column(db.Integer, db.ForeignKey("companies.id"))
    work_schedule = db.Column(db.String(40), default="standard")
    national_id = db.Column(db.String(80))
    tax_number = db.Column(db.String(80))
    ssnit_number = db.Column(db.String(80))
    basic_salary = db.Column(db.Numeric(15, 2), default=0)
    bio = db.Column(db.Text)
    personal_email = db.Column(db.String(180))
    blood_group = db.Column(db.String(10))
    linkedin_url = db.Column(db.String(255))
    work_location = db.Column(db.String(80), default="Office")
    department = db.relationship("Department")
    designation = db.relationship("Designation")
    grade = db.relationship("Grade")
    branch = db.relationship("Branch")
    hod_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    accountant_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    md_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    signature_url = db.Column(db.String(255))
    manager = db.relationship("Employee", foreign_keys=[manager_id], remote_side="Employee.id")
    hod = db.relationship("Employee", foreign_keys=[hod_id], remote_side="Employee.id")
    accountant = db.relationship("Employee", foreign_keys=[accountant_id], remote_side="Employee.id")
    md = db.relationship("Employee", foreign_keys=[md_id], remote_side="Employee.id")

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()


class EmployeeContact(db.Model, TimestampMixin):
    __tablename__ = "employee_contacts"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    type = db.Column(db.String(40), default="emergency")
    name = db.Column(db.String(120), nullable=False)
    relationship = db.Column(db.String(80))
    phone = db.Column(db.String(40))
    email = db.Column(db.String(180))
    address = db.Column(db.String(255))


class Dependant(db.Model, TimestampMixin):
    __tablename__ = "dependants"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    relationship = db.Column(db.String(80))
    dob = db.Column(db.Date)
    gender = db.Column(db.String(20))
    is_beneficiary = db.Column(db.Boolean, default=False)


class BankAccount(db.Model, TimestampMixin):
    __tablename__ = "employee_bank_accounts"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    bank_name = db.Column(db.String(120))
    account_name = db.Column(db.String(120))
    account_no = db.Column(db.String(80))
    branch_name = db.Column(db.String(80))
    mobile_money = db.Column(db.String(40))
    is_primary = db.Column(db.Boolean, default=True)


class EmploymentHistory(db.Model, TimestampMixin):
    __tablename__ = "employment_history"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    event_type = db.Column(db.String(40), nullable=False)
    from_value = db.Column(db.String(255))
    to_value = db.Column(db.String(255))
    effective_date = db.Column(db.Date)
    notes = db.Column(db.Text)


class EmployeeSkill(db.Model, TimestampMixin):
    __tablename__ = "employee_skills"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(40), default="technical")
    proficiency = db.Column(db.String(40), default="intermediate")
    years_experience = db.Column(db.Integer, default=1)
    verified = db.Column(db.Boolean, default=False)


class EmployeeEducation(db.Model, TimestampMixin):
    __tablename__ = "employee_educations"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    kind = db.Column(db.String(40), default="degree")
    institution = db.Column(db.String(180), nullable=False)
    qualification = db.Column(db.String(180), nullable=False)
    field_of_study = db.Column(db.String(120))
    start_year = db.Column(db.Integer)
    end_year = db.Column(db.Integer)
    credential_id = db.Column(db.String(120))
    expires_at = db.Column(db.Date)


class Contract(db.Model, TimestampMixin):
    __tablename__ = "contracts"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    type = db.Column(db.String(40), default="permanent")
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    status = db.Column(db.String(20), default="active")
    notes = db.Column(db.Text)


class Document(db.Model, TimestampMixin):
    __tablename__ = "documents"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    category = db.Column(db.String(80), default="other")
    title = db.Column(db.String(180), nullable=False)
    file_name = db.Column(db.String(255))
    notes = db.Column(db.Text)
    expires_at = db.Column(db.Date)
    uploaded_by = db.Column(db.Integer)
    employee = db.relationship("Employee")


class EmploymentLetter(db.Model, TimestampMixin):
    __tablename__ = "employment_letters"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)
    reference_no = db.Column(db.String(80), unique=True, nullable=False)
    category_key = db.Column(db.String(40), default="permanent", nullable=False)
    staff_category = db.Column(db.String(80))
    letter_title = db.Column(db.String(180))
    subject_line = db.Column(db.String(240))
    issue_date = db.Column(db.Date, default=date.today)
    effective_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    probation_months = db.Column(db.Integer)
    working_hours = db.Column(db.String(180))
    notice_period = db.Column(db.String(120))
    custom_clauses = db.Column(db.Text)
    signatory_name = db.Column(db.String(120))
    signatory_title = db.Column(db.String(120))
    status = db.Column(db.String(30), default="issued")
    accepted_at = db.Column(db.DateTime)
    accepted_signature = db.Column(db.String(180))
    accepted_ip = db.Column(db.String(64))
    emailed_at = db.Column(db.DateTime)
    employee = db.relationship("Employee")


class Policy(db.Model, TimestampMixin):
    __tablename__ = "policies"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False)
    category = db.Column(db.String(80))
    version = db.Column(db.String(20), default="1.0")
    content = db.Column(db.Text)
    published_at = db.Column(db.Date)
    requires_ack = db.Column(db.Boolean, default=True)


class PolicyAck(db.Model, TimestampMixin):
    __tablename__ = "policy_acks"
    id = db.Column(db.Integer, primary_key=True)
    policy_id = db.Column(db.Integer, db.ForeignKey("policies.id"), nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    acknowledged_at = db.Column(db.DateTime, default=now)


class JobRequisition(db.Model, TimestampMixin):
    __tablename__ = "job_requisitions"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"))
    vacancies = db.Column(db.Integer, default=1)
    employment_type = db.Column(db.String(40), default="permanent")
    justification = db.Column(db.Text)
    status = db.Column(db.String(20), default="pending")
    requested_by = db.Column(db.Integer)
    approved_by = db.Column(db.Integer)
    department = db.relationship("Department")


class JobPosting(db.Model, TimestampMixin):
    __tablename__ = "job_postings"
    id = db.Column(db.Integer, primary_key=True)
    requisition_id = db.Column(db.Integer, db.ForeignKey("job_requisitions.id"))
    title = db.Column(db.String(180), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"))
    location = db.Column(db.String(120))
    employment_type = db.Column(db.String(40))
    description = db.Column(db.Text)
    requirements = db.Column(db.Text)
    vacancies = db.Column(db.Integer, default=1)
    status = db.Column(db.String(20), default="open")
    posted_at = db.Column(db.Date)
    closes_at = db.Column(db.Date)
    department = db.relationship("Department")


class Candidate(db.Model, TimestampMixin):
    __tablename__ = "candidates"
    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(80), nullable=False)
    last_name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(180))
    phone = db.Column(db.String(40))
    source = db.Column(db.String(80))
    skills = db.Column(db.Text)
    notes = db.Column(db.Text)

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()


class Application(db.Model, TimestampMixin):
    __tablename__ = "applications"
    id = db.Column(db.Integer, primary_key=True)
    job_posting_id = db.Column(db.Integer, db.ForeignKey("job_postings.id"), nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    stage = db.Column(db.String(40), default="applied")
    score = db.Column(db.Integer)
    cover_letter = db.Column(db.Text)
    applied_at = db.Column(db.DateTime, default=now)
    job_posting = db.relationship("JobPosting")
    candidate = db.relationship("Candidate")


class Interview(db.Model, TimestampMixin):
    __tablename__ = "interviews"
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey("applications.id"), nullable=False)
    scheduled_at = db.Column(db.DateTime)
    interview_type = db.Column(db.String(40), default="panel")
    location = db.Column(db.String(120))
    panel = db.Column(db.String(255))
    feedback = db.Column(db.Text)
    score = db.Column(db.Integer)
    status = db.Column(db.String(20), default="scheduled")
    application = db.relationship("Application")


class OnboardingTemplate(db.Model, TimestampMixin):
    __tablename__ = "onboarding_templates"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"))
    tasks_json = db.Column(db.Text)


class OnboardingTask(db.Model, TimestampMixin):
    __tablename__ = "onboarding_tasks"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    title = db.Column(db.String(180), nullable=False)
    owner_role = db.Column(db.String(80))
    due_date = db.Column(db.Date)
    status = db.Column(db.String(20), default="pending")
    notes = db.Column(db.Text)
    employee = db.relationship("Employee")


class Offboarding(db.Model, TimestampMixin):
    __tablename__ = "offboardings"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    reason = db.Column(db.String(80))
    last_day = db.Column(db.Date)
    notice_period_days = db.Column(db.Integer, default=30)
    status = db.Column(db.String(20), default="pending")
    exit_interview = db.Column(db.Text)
    employee = db.relationship("Employee")


class Shift(db.Model, TimestampMixin):
    __tablename__ = "shifts"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    start_time = db.Column(db.String(8), nullable=False)
    end_time = db.Column(db.String(8), nullable=False)
    grace_minutes = db.Column(db.Integer, default=10)
    overtime_multiplier = db.Column(db.Numeric(4, 2), default=1.5)
    is_default = db.Column(db.Boolean, default=False)


class Attendance(db.Model, TimestampMixin):
    __tablename__ = "attendances"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    work_date = db.Column(db.Date, nullable=False)
    clock_in = db.Column(db.DateTime)
    clock_out = db.Column(db.DateTime)
    source = db.Column(db.String(40), default="web")
    status = db.Column(db.String(20), default="present")
    overtime_minutes = db.Column(db.Integer, default=0)
    notes = db.Column(db.Text)
    employee = db.relationship("Employee")
    __table_args__ = (db.UniqueConstraint("employee_id", "work_date", name="uq_att_emp_date"),)


class AttendanceCorrection(db.Model, TimestampMixin):
    __tablename__ = "attendance_corrections"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    work_date = db.Column(db.Date, nullable=False)
    requested_clock_in = db.Column(db.String(8))
    requested_clock_out = db.Column(db.String(8))
    reason = db.Column(db.Text)
    status = db.Column(db.String(20), default="pending")
    employee = db.relationship("Employee")


class LeaveType(db.Model, TimestampMixin):
    __tablename__ = "leave_types"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    code = db.Column(db.String(20), unique=True)
    days_per_year = db.Column(db.Numeric(6, 2), default=0)
    paid = db.Column(db.Boolean, default=True)
    accrual = db.Column(db.String(20), default="yearly")
    carry_forward = db.Column(db.Numeric(6, 2), default=0)
    gender_restriction = db.Column(db.String(20))
    requires_attachment = db.Column(db.Boolean, default=False)
    color = db.Column(db.String(16), default="#0f766e")


class LeaveBalance(db.Model, TimestampMixin):
    __tablename__ = "leave_balances"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    leave_type_id = db.Column(db.Integer, db.ForeignKey("leave_types.id"), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    entitled = db.Column(db.Numeric(6, 2), default=0)
    taken = db.Column(db.Numeric(6, 2), default=0)
    pending = db.Column(db.Numeric(6, 2), default=0)
    carried_over = db.Column(db.Numeric(6, 2), default=0)
    leave_type = db.relationship("LeaveType")
    employee = db.relationship("Employee")


class LeaveRequest(db.Model, TimestampMixin):
    __tablename__ = "leave_requests"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    leave_type_id = db.Column(db.Integer, db.ForeignKey("leave_types.id"), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    days = db.Column(db.Numeric(6, 2), default=1)
    half_day = db.Column(db.Boolean, default=False)
    reason = db.Column(db.Text)
    status = db.Column(db.String(20), default="pending")
    approver_id = db.Column(db.Integer)
    decided_at = db.Column(db.DateTime)
    decision_note = db.Column(db.Text)
    # Extended fields for Airport West Hotel format
    leave_already_taken = db.Column(db.Numeric(6, 2), default=0)
    resumption_date = db.Column(db.Date)
    employee_signature = db.Column(db.String(255))
    hod_approved_at = db.Column(db.DateTime)
    hod_approved_by = db.Column(db.Integer, db.ForeignKey("employees.id"))
    accountant_approved_at = db.Column(db.DateTime)
    accountant_approved_by = db.Column(db.Integer, db.ForeignKey("employees.id"))
    md_approved_at = db.Column(db.DateTime)
    md_approved_by = db.Column(db.Integer, db.ForeignKey("employees.id"))
    hod_signature = db.Column(db.String(255))
    accountant_signature = db.Column(db.String(255))
    md_signature = db.Column(db.String(255))
    employee = db.relationship("Employee", foreign_keys=[employee_id])
    leave_type = db.relationship("LeaveType")
    hod_approver = db.relationship("Employee", foreign_keys=[hod_approved_by])
    accountant_approver = db.relationship("Employee", foreign_keys=[accountant_approved_by])
    md_approver = db.relationship("Employee", foreign_keys=[md_approved_by])


class Holiday(db.Model, TimestampMixin):
    __tablename__ = "holidays"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    holiday_date = db.Column(db.Date, nullable=False)
    country = db.Column(db.String(80), default="Ghana")
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"))
    recurring = db.Column(db.Boolean, default=True)


class SalaryComponent(db.Model, TimestampMixin):
    __tablename__ = "salary_components"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    code = db.Column(db.String(20), unique=True)
    kind = db.Column(db.String(20), default="earning")
    is_taxable = db.Column(db.Boolean, default=True)
    is_statutory = db.Column(db.Boolean, default=False)
    calculation = db.Column(db.String(40), default="fixed")


class SalaryStructure(db.Model, TimestampMixin):
    __tablename__ = "salary_structures"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    component_id = db.Column(db.Integer, db.ForeignKey("salary_components.id"), nullable=False)
    amount = db.Column(db.Numeric(15, 2), default=0)
    effective_date = db.Column(db.Date)
    component = db.relationship("SalaryComponent")
    employee = db.relationship("Employee")


class TaxBand(db.Model, TimestampMixin):
    __tablename__ = "tax_bands"
    id = db.Column(db.Integer, primary_key=True)
    country = db.Column(db.String(80), default="Ghana")
    min_amount = db.Column(db.Numeric(15, 2), default=0)
    max_amount = db.Column(db.Numeric(15, 2))
    rate = db.Column(db.Numeric(6, 4), default=0)
    description = db.Column(db.String(120))


class PayrollRun(db.Model, TimestampMixin):
    __tablename__ = "payroll_runs"
    id = db.Column(db.Integer, primary_key=True)
    period_year = db.Column(db.Integer, nullable=False)
    period_month = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), default="draft")
    prepared_by = db.Column(db.Integer)
    approved_by = db.Column(db.Integer)
    locked_at = db.Column(db.DateTime)
    paid_at = db.Column(db.DateTime)
    notes = db.Column(db.Text)
    employee_count = db.Column(db.Integer, default=0)
    total_gross = db.Column(db.Numeric(15, 2), default=0)
    total_tax = db.Column(db.Numeric(15, 2), default=0)
    total_net = db.Column(db.Numeric(15, 2), default=0)


class Payslip(db.Model, TimestampMixin):
    __tablename__ = "payslips"
    id = db.Column(db.Integer, primary_key=True)
    run_id = db.Column(db.Integer, db.ForeignKey("payroll_runs.id"), nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    gross = db.Column(db.Numeric(15, 2), default=0)
    tax = db.Column(db.Numeric(15, 2), default=0)
    ssnit = db.Column(db.Numeric(15, 2), default=0)
    other_deductions = db.Column(db.Numeric(15, 2), default=0)
    net = db.Column(db.Numeric(15, 2), default=0)
    run = db.relationship("PayrollRun")
    employee = db.relationship("Employee")


class PayslipItem(db.Model, TimestampMixin):
    __tablename__ = "payslip_items"
    id = db.Column(db.Integer, primary_key=True)
    payslip_id = db.Column(db.Integer, db.ForeignKey("payslips.id"), nullable=False)
    name = db.Column(db.String(80), nullable=False)
    kind = db.Column(db.String(20), default="earning")
    amount = db.Column(db.Numeric(15, 2), default=0)


class Loan(db.Model, TimestampMixin):
    __tablename__ = "loans"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    loan_type = db.Column(db.String(40), default="salary_advance")
    principal = db.Column(db.Numeric(15, 2), nullable=False)
    instalment = db.Column(db.Numeric(15, 2), default=0)
    balance = db.Column(db.Numeric(15, 2), default=0)
    start_date = db.Column(db.Date)
    status = db.Column(db.String(20), default="pending")
    reason = db.Column(db.Text)
    employee = db.relationship("Employee")


class Goal(db.Model, TimestampMixin):
    __tablename__ = "goals"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text)
    weight = db.Column(db.Integer, default=25)
    progress = db.Column(db.Integer, default=0)
    due_date = db.Column(db.Date)
    status = db.Column(db.String(20), default="active")
    employee = db.relationship("Employee")


class AppraisalCycle(db.Model, TimestampMixin):
    __tablename__ = "appraisal_cycles"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    status = db.Column(db.String(20), default="open")


class Appraisal(db.Model, TimestampMixin):
    __tablename__ = "appraisals"
    id = db.Column(db.Integer, primary_key=True)
    cycle_id = db.Column(db.Integer, db.ForeignKey("appraisal_cycles.id"), nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    reviewer_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    self_score = db.Column(db.Numeric(4, 2))
    manager_score = db.Column(db.Numeric(4, 2))
    final_score = db.Column(db.Numeric(4, 2))
    self_comments = db.Column(db.Text)
    manager_comments = db.Column(db.Text)
    status = db.Column(db.String(20), default="draft")
    cycle = db.relationship("AppraisalCycle")
    employee = db.relationship("Employee", foreign_keys=[employee_id])


class Training(db.Model, TimestampMixin):
    __tablename__ = "trainings"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False)
    provider = db.Column(db.String(120))
    category = db.Column(db.String(80))
    mode = db.Column(db.String(40), default="internal")
    cost = db.Column(db.Numeric(15, 2), default=0)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    capacity = db.Column(db.Integer, default=20)
    status = db.Column(db.String(20), default="scheduled")
    description = db.Column(db.Text)


class TrainingEnrolment(db.Model, TimestampMixin):
    __tablename__ = "training_enrolments"
    id = db.Column(db.Integer, primary_key=True)
    training_id = db.Column(db.Integer, db.ForeignKey("trainings.id"), nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    status = db.Column(db.String(20), default="enrolled")
    score = db.Column(db.Integer)
    completed_at = db.Column(db.Date)
    training = db.relationship("Training")
    employee = db.relationship("Employee")


class ExpenseCategory(db.Model, TimestampMixin):
    __tablename__ = "expense_categories"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    limit_amount = db.Column(db.Numeric(15, 2))
    requires_receipt = db.Column(db.Boolean, default=True)


class ExpenseClaim(db.Model, TimestampMixin):
    __tablename__ = "expense_claims"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("expense_categories.id"))
    title = db.Column(db.String(180), nullable=False)
    amount = db.Column(db.Numeric(15, 2), nullable=False)
    claim_date = db.Column(db.Date)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default="pending")
    employee = db.relationship("Employee")
    category = db.relationship("ExpenseCategory")


class Asset(db.Model, TimestampMixin):
    __tablename__ = "assets"
    id = db.Column(db.Integer, primary_key=True)
    tag = db.Column(db.String(40), unique=True, nullable=False)
    name = db.Column(db.String(180), nullable=False)
    category = db.Column(db.String(80))
    serial_no = db.Column(db.String(80))
    purchase_date = db.Column(db.Date)
    value = db.Column(db.Numeric(15, 2), default=0)
    status = db.Column(db.String(20), default="available")
    storeroom_id = db.Column(db.Integer, db.ForeignKey("hotel_storerooms.id"), nullable=True)
    section_id = db.Column(db.Integer, db.ForeignKey("hotel_storeroom_sections.id"), nullable=True)
    room_number = db.Column(db.String(20), nullable=True)
    condition = db.Column(db.String(30), default="operational")
    notes = db.Column(db.Text)
    storeroom = db.relationship("HotelStoreroom", foreign_keys=[storeroom_id], backref="assets")
    section = db.relationship("HotelStoreroomSection", foreign_keys=[section_id], backref="assets")


class AssetAssignment(db.Model, TimestampMixin):
    __tablename__ = "asset_assignments"
    id = db.Column(db.Integer, primary_key=True)
    asset_id = db.Column(db.Integer, db.ForeignKey("assets.id"), nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    assigned_at = db.Column(db.Date, default=date.today)
    returned_at = db.Column(db.Date)
    condition_out = db.Column(db.String(40), default="good")
    condition_in = db.Column(db.String(40))
    asset = db.relationship("Asset")
    employee = db.relationship("Employee")


class Ticket(db.Model, TimestampMixin):
    __tablename__ = "tickets"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    category = db.Column(db.String(40), default="general")
    subject = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text)
    priority = db.Column(db.String(20), default="medium")
    status = db.Column(db.String(20), default="open")
    assignee_id = db.Column(db.Integer)
    confidential = db.Column(db.Boolean, default=False)
    employee = db.relationship("Employee")


class TicketComment(db.Model, TimestampMixin):
    __tablename__ = "ticket_comments"
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey("tickets.id"), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    body = db.Column(db.Text, nullable=False)


class Announcement(db.Model, TimestampMixin):
    __tablename__ = "announcements"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False)
    body = db.Column(db.Text)
    audience = db.Column(db.String(40), default="all")
    department_id = db.Column(db.Integer)
    branch_id = db.Column(db.Integer)
    role_slug = db.Column(db.String(80))
    publish_at = db.Column(db.DateTime, default=now)
    pinned = db.Column(db.Boolean, default=False)
    author_id = db.Column(db.Integer)
    send_in_app = db.Column(db.Boolean, default=True)
    send_email = db.Column(db.Boolean, default=False)
    send_sms = db.Column(db.Boolean, default=False)
    email_subject = db.Column(db.String(255))
    sms_message = db.Column(db.String(320))


class CompanyEvent(db.Model, TimestampMixin):
    __tablename__ = "company_events"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text)
    category = db.Column(db.String(40), default="general")
    location = db.Column(db.String(180))
    meeting_url = db.Column(db.String(255))
    start_at = db.Column(db.DateTime, nullable=False)
    end_at = db.Column(db.DateTime)
    all_day = db.Column(db.Boolean, default=False)
    audience = db.Column(db.String(40), default="all")
    department_id = db.Column(db.Integer)
    branch_id = db.Column(db.Integer)
    role_slug = db.Column(db.String(80))
    organizer_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    send_in_app = db.Column(db.Boolean, default=True)
    send_email = db.Column(db.Boolean, default=True)
    send_sms = db.Column(db.Boolean, default=False)
    reminder_hours = db.Column(db.Integer, default=24)
    email_subject = db.Column(db.String(255))
    sms_message = db.Column(db.String(320))
    last_reminded_at = db.Column(db.DateTime)
    status = db.Column(db.String(20), default="scheduled")


class EventRsvp(db.Model, TimestampMixin):
    __tablename__ = "event_rsvps"
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("company_events.id"), nullable=False)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    status = db.Column(db.String(20), default="going")
    __table_args__ = (db.UniqueConstraint("event_id", "employee_id", name="uq_event_rsvp"),)


class Notification(db.Model, TimestampMixin):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(180), nullable=False)
    body = db.Column(db.String(255))
    link = db.Column(db.String(120))
    category = db.Column(db.String(40), default="general")
    event_key = db.Column(db.String(60))
    read_at = db.Column(db.DateTime)


class NotificationPreference(db.Model, TimestampMixin):
    __tablename__ = "notification_preferences"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    event_key = db.Column(db.String(60), nullable=False)
    in_app = db.Column(db.Boolean, default=True)
    email = db.Column(db.Boolean, default=True)
    sms = db.Column(db.Boolean, default=False)

    __table_args__ = (db.UniqueConstraint("user_id", "event_key", name="uq_notification_pref"),)


class NotificationDelivery(db.Model, TimestampMixin):
    __tablename__ = "notification_deliveries"
    id = db.Column(db.Integer, primary_key=True)
    notification_id = db.Column(db.Integer)
    announcement_id = db.Column(db.Integer)
    event_id = db.Column(db.Integer)
    user_id = db.Column(db.Integer)
    event_key = db.Column(db.String(60))
    channel = db.Column(db.String(20), nullable=False)
    recipient = db.Column(db.String(180))
    subject = db.Column(db.String(255))
    body = db.Column(db.Text)
    html_body = db.Column(db.Text)
    status = db.Column(db.String(20), default="pending")
    error = db.Column(db.Text)
    provider_ref = db.Column(db.String(180))
    sent_at = db.Column(db.DateTime)


class Approval(db.Model, TimestampMixin):
    __tablename__ = "approvals"
    id = db.Column(db.Integer, primary_key=True)
    request_type = db.Column(db.String(40), nullable=False)
    request_id = db.Column(db.Integer, nullable=False)
    requester_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    approver_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    status = db.Column(db.String(20), default="pending")
    comments = db.Column(db.Text)
    decided_at = db.Column(db.DateTime)
    requester = db.relationship("Employee", foreign_keys=[requester_id])
    approver = db.relationship("Employee", foreign_keys=[approver_id])


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer)
    event = db.Column(db.String(80), nullable=False)
    entity = db.Column(db.String(80))
    entity_id = db.Column(db.Integer)
    old_values = db.Column(db.Text)
    new_values = db.Column(db.Text)
    ip = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=now, nullable=False)

    @property
    def user_name(self):
        user = db.session.get(User, self.user_id) if self.user_id else None
        if not user:
            return "System"
        return user.employee.full_name if user.employee else user.email


class Setting(db.Model, TimestampMixin):
    __tablename__ = "settings"
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(80), unique=True, nullable=False)
    value = db.Column(db.Text)
    group_name = db.Column(db.String(40), default="general")


class DatabaseBackup(db.Model):
    """Register of database snapshots stored in the server-side backups folder."""
    __tablename__ = "database_backups"
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(200), nullable=False)
    label = db.Column(db.String(180))
    trigger = db.Column(db.String(30), default="manual", nullable=False)  # manual | scheduled | pre_restore
    status = db.Column(db.String(20), default="completed", nullable=False)
    size_bytes = db.Column(db.Integer, default=0)
    checksum_sha256 = db.Column(db.String(64))
    duration_ms = db.Column(db.Integer)
    notes = db.Column(db.String(500))
    created_by = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=now, nullable=False)


class LoginHistory(db.Model):
    __tablename__ = "login_history"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    ip = db.Column(db.String(64))
    user_agent = db.Column(db.String(255))
    success = db.Column(db.Boolean, default=True)
    mfa_used = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=now, nullable=False)


class MfaTrustedDevice(db.Model):
    """A browser that may skip the TOTP prompt until `expires_at` (1 month)."""
    __tablename__ = "mfa_trusted_devices"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    token_hash = db.Column(db.String(128), unique=True, nullable=False, index=True)
    label = db.Column(db.String(180))
    ip = db.Column(db.String(64))
    user_agent = db.Column(db.String(255))
    last_used_at = db.Column(db.DateTime)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=now, nullable=False)


class HotelStoreroom(db.Model, TimestampMixin):
    __tablename__ = "hotel_storerooms"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(140), nullable=False)
    code = db.Column(db.String(40), unique=True, nullable=False)
    hub_type = db.Column(db.String(40), default="storeroom")  # storeroom, rooms_hub, pantry, engineering, fnb
    category = db.Column(db.String(80), nullable=False)
    location = db.Column(db.String(140), nullable=False)
    floor = db.Column(db.String(40), default="Ground Floor")
    wing = db.Column(db.String(60), default="Central Facility")
    manager_name = db.Column(db.String(120))
    manager_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=True)
    capacity_utilization = db.Column(db.Integer, default=0)
    max_capacity = db.Column(db.Integer, default=100)
    icon = db.Column(db.String(40), default="layers")
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default="active")

    manager = db.relationship("Employee", foreign_keys=[manager_id])
    sections = db.relationship("HotelStoreroomSection", backref="storeroom", cascade="all, delete-orphan", lazy="select")


class HotelStoreroomSection(db.Model, TimestampMixin):
    __tablename__ = "hotel_storeroom_sections"
    id = db.Column(db.Integer, primary_key=True)
    storeroom_id = db.Column(db.Integer, db.ForeignKey("hotel_storerooms.id"), nullable=False)
    name = db.Column(db.String(140), nullable=False)
    code = db.Column(db.String(40), nullable=True)
    section_type = db.Column(db.String(40), default="sub_section")  # room, space, sub_section, bay, cart_station, shelf
    room_number = db.Column(db.String(20), nullable=True)
    room_type = db.Column(db.String(60), nullable=True)  # Executive Suite, Deluxe King, Presidential, etc.
    room_status = db.Column(db.String(30), default="clean")  # clean, occupied, turnover_in_progress, inspected, maintenance
    capacity = db.Column(db.Integer, default=1)
    supervisor_name = db.Column(db.String(120))
    notes = db.Column(db.Text)


class HotelInventoryItem(db.Model, TimestampMixin):
    __tablename__ = "hotel_inventory_items"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(180), nullable=False)
    sku = db.Column(db.String(40), unique=True, nullable=False)
    category = db.Column(db.String(80), nullable=False)
    location = db.Column(db.String(120), nullable=False)
    storeroom_id = db.Column(db.Integer, db.ForeignKey("hotel_storerooms.id"), nullable=True)
    section_id = db.Column(db.Integer, db.ForeignKey("hotel_storeroom_sections.id"), nullable=True)
    current_stock = db.Column(db.Integer, default=0)
    reorder_level = db.Column(db.Integer, default=20)
    ideal_par_level = db.Column(db.Integer, default=100)
    unit = db.Column(db.String(40), default="units")
    unit_cost = db.Column(db.Numeric(10, 2), default=0)
    supplier = db.Column(db.String(180))
    status = db.Column(db.String(20), default="in_stock")
    icon = db.Column(db.String(40), default="box")
    notes = db.Column(db.Text)
    storeroom = db.relationship("HotelStoreroom", foreign_keys=[storeroom_id], backref="inventory_items")
    section = db.relationship("HotelStoreroomSection", foreign_keys=[section_id], backref="inventory_items")


class HotelStockMovement(db.Model, TimestampMixin):
    __tablename__ = "hotel_stock_movements"
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey("hotel_inventory_items.id"), nullable=False)
    movement_type = db.Column(db.String(20), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    source_dest = db.Column(db.String(180))
    reference_no = db.Column(db.String(80))
    performed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    movement_date = db.Column(db.Date, default=date.today)
    item = db.relationship("HotelInventoryItem")


class HotelWorkOrder(db.Model, TimestampMixin):
    __tablename__ = "hotel_work_orders"
    id = db.Column(db.Integer, primary_key=True)
    order_no = db.Column(db.String(40), unique=True, nullable=False)
    category = db.Column(db.String(60), nullable=False)
    location = db.Column(db.String(120), nullable=False)
    wing = db.Column(db.String(60), default="West Wing")
    floor = db.Column(db.String(20), default="Floor 4")
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text)
    priority = db.Column(db.String(20), default="medium")
    status = db.Column(db.String(30), default="open")
    reported_by = db.Column(db.String(120))
    assigned_to_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    assigned_to = db.relationship("Employee")


class MaintenanceWork(db.Model, TimestampMixin):
    """Scheduled maintenance jobs, including staff and external contractor costs."""
    __tablename__ = "maintenance_works"
    id = db.Column(db.Integer, primary_key=True)
    reference_no = db.Column(db.String(40), unique=True, nullable=False, index=True)
    title = db.Column(db.String(180), nullable=False)
    category = db.Column(db.String(60), nullable=False, default="Repair")
    location = db.Column(db.String(180), nullable=False)
    scheduled_at = db.Column(db.DateTime, nullable=False, index=True)
    description = db.Column(db.Text)
    worker_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=True)
    # Keep a name snapshot for external contractors and historical reporting.
    worker_name = db.Column(db.String(120))
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    status = db.Column(db.String(24), nullable=False, default="scheduled", index=True)
    remarks = db.Column(db.Text)
    completed_at = db.Column(db.DateTime)
    worker = db.relationship("Employee")
