from datetime import date, datetime, timedelta
from decimal import Decimal
from werkzeug.security import generate_password_hash
from models import (
    db, Role, User, Company, Branch, Department, Designation, Grade, Employee,
    EmployeeContact, Dependant, BankAccount, EmploymentHistory, Contract, Document,
    Policy, PolicyAck, JobRequisition, JobPosting, Candidate, Application, Interview,
    OnboardingTemplate, OnboardingTask, Offboarding, Shift, Attendance, AttendanceCorrection,
    LeaveType, LeaveBalance, LeaveRequest, Holiday, SalaryComponent, SalaryStructure,
    TaxBand, PayrollRun, Payslip, PayslipItem, Loan, Goal, AppraisalCycle, Appraisal,
    Training, TrainingEnrolment, ExpenseCategory, ExpenseClaim, Asset, AssetAssignment,
    Ticket, TicketComment, Announcement, Notification, Approval, AuditLog, Setting,
    LoginHistory,
)


def seed(app):
    with app.app_context():
        db.drop_all()
        db.create_all()
        _seed()
        db.session.commit()


def _seed():
    roles = [
        Role(name="Super Admin", slug="super_admin", is_system=True,
             description="Full platform control", permissions="*"),
        Role(name="HR Admin", slug="hr_admin", is_system=True,
             description="Head of HR", permissions="employees,org,leave,attendance,payroll.approve,recruitment,reports,settings.view"),
        Role(name="HR Officer", slug="hr_officer", is_system=True,
             description="Day-to-day HR operations", permissions="employees,leave,attendance,recruitment,documents"),
        Role(name="Payroll", slug="payroll", is_system=True,
             description="Payroll and expenses", permissions="payroll,expenses,loans,reports.payroll"),
        Role(name="Manager", slug="manager", is_system=True,
             description="Line manager", permissions="team,approvals,appraisals,leave.approve"),
        Role(name="Employee", slug="employee", is_system=True,
             description="Employee self-service", permissions="ess"),
        Role(name="Recruiter", slug="recruiter", is_system=True,
             description="Hiring team", permissions="recruitment"),
        Role(name="Auditor", slug="auditor", is_system=True,
             description="Read-only compliance", permissions="reports.view,audit.view"),
    ]
    db.session.add_all(roles)
    db.session.flush()
    role_map = {r.slug: r for r in roles}

    company = Company(
        name="Meridian Ghana Ltd",
        legal_name="Meridian Ghana Limited",
        country="Ghana",
        currency="GHS",
        timezone="Africa/Accra",
        address="15 Independence Avenue, Accra",
        phone="+233 30 266 4100",
        email="hr@meridian.gh",
        tax_id="C0001234567",
        website="https://meridian.gh",
    )
    db.session.add(company)
    db.session.flush()

    accra = Branch(company_id=company.id, name="Accra HQ", code="ACC", city="Accra",
                   address="15 Independence Avenue", is_head_office=True, phone="+233 30 266 4100")
    kumasi = Branch(company_id=company.id, name="Kumasi Hub", code="KSI", city="Kumasi",
                    address="Adum High Street", phone="+233 32 202 1180")
    db.session.add_all([accra, kumasi])
    db.session.flush()

    depts_spec = [
        ("Executive", "EXE", None),
        ("Human Resources", "HR", None),
        ("Finance", "FIN", None),
        ("Engineering", "ENG", None),
        ("Sales", "SAL", None),
        ("Operations", "OPS", None),
        ("Customer Success", "CS", None),
        ("Legal & Compliance", "LEG", None),
    ]
    depts = {}
    for name, code, parent in depts_spec:
        d = Department(company_id=company.id, name=name, code=code, branch_id=accra.id,
                       cost_centre=f"CC-{code}")
        db.session.add(d)
        db.session.flush()
        depts[code] = d

    grades = [
        Grade(name="G1", level=1, min_salary=1800, max_salary=3200),
        Grade(name="G2", level=2, min_salary=3000, max_salary=5200),
        Grade(name="G3", level=3, min_salary=5000, max_salary=8500),
        Grade(name="G4", level=4, min_salary=8000, max_salary=14000),
        Grade(name="G5", level=5, min_salary=13000, max_salary=22000),
        Grade(name="G6", level=6, min_salary=20000, max_salary=40000),
    ]
    db.session.add_all(grades)
    db.session.flush()

    desigs = {
        "CEO": Designation(title="Chief Executive Officer", level=6, department_id=depts["EXE"].id),
        "HRD": Designation(title="Head of Human Resources", level=5, department_id=depts["HR"].id),
        "HRO": Designation(title="HR Officer", level=3, department_id=depts["HR"].id),
        "CFO": Designation(title="Chief Financial Officer", level=5, department_id=depts["FIN"].id),
        "PAY": Designation(title="Payroll Specialist", level=3, department_id=depts["FIN"].id),
        "ENG": Designation(title="Software Engineer", level=3, department_id=depts["ENG"].id),
        "SEM": Designation(title="Engineering Manager", level=4, department_id=depts["ENG"].id),
        "SAL": Designation(title="Account Executive", level=3, department_id=depts["SAL"].id),
        "SM": Designation(title="Sales Manager", level=4, department_id=depts["SAL"].id),
        "OPS": Designation(title="Operations Coordinator", level=2, department_id=depts["OPS"].id),
        "CS": Designation(title="Customer Success Manager", level=3, department_id=depts["CS"].id),
        "INT": Designation(title="Software Intern", level=1, department_id=depts["ENG"].id),
    }
    db.session.add_all(desigs.values())
    db.session.flush()

    people = [
        dict(no="EMP-2020-0001", first="Ama", last="Mensah", email="ama.mensah@meridian.gh",
             gender="female", dob=date(1984, 3, 12), hire=date(2020, 1, 6), dept="EXE", des="CEO",
             grade=5, salary=28000, role="super_admin", phone="+233 24 111 0001", city="Accra",
             contract="permanent", mgr=None),
        dict(no="EMP-2020-0002", first="Kwame", last="Boateng", email="kwame.boateng@meridian.gh",
             gender="male", dob=date(1986, 7, 21), hire=date(2020, 3, 2), dept="HR", des="HRD",
             grade=4, salary=16000, role="hr_admin", phone="+233 24 111 0002", city="Accra",
             contract="permanent", mgr=1),
        dict(no="EMP-2021-0008", first="Efua", last="Owusu", email="efua.owusu@meridian.gh",
             gender="female", dob=date(1992, 11, 4), hire=date(2021, 6, 14), dept="HR", des="HRO",
             grade=2, salary=5200, role="hr_officer", phone="+233 24 111 0008", city="Accra",
             contract="permanent", mgr=2),
        dict(no="EMP-2020-0003", first="Yaw", last="Asante", email="yaw.asante@meridian.gh",
             gender="male", dob=date(1983, 1, 30), hire=date(2020, 4, 1), dept="FIN", des="CFO",
             grade=4, salary=18000, role="payroll", phone="+233 24 111 0003", city="Accra",
             contract="permanent", mgr=1),
        dict(no="EMP-2022-0014", first="Akosua", last="Darko", email="akosua.darko@meridian.gh",
             gender="female", dob=date(1994, 5, 18), hire=date(2022, 2, 7), dept="FIN", des="PAY",
             grade=2, salary=4800, role="payroll", phone="+233 24 111 0014", city="Accra",
             contract="permanent", mgr=4),
        dict(no="EMP-2021-0005", first="Kofi", last="Adjei", email="kofi.adjei@meridian.gh",
             gender="male", dob=date(1989, 9, 9), hire=date(2021, 1, 11), dept="ENG", des="SEM",
             grade=3, salary=12000, role="manager", phone="+233 24 111 0005", city="Accra",
             contract="permanent", mgr=1),
        dict(no="EMP-2022-0011", first="Abena", last="Sarpong", email="abena.sarpong@meridian.gh",
             gender="female", dob=date(1996, 2, 22), hire=date(2022, 8, 15), dept="ENG", des="ENG",
             grade=2, salary=6500, role="employee", phone="+233 24 111 0011", city="Accra",
             contract="permanent", mgr=6),
        dict(no="EMP-2023-0020", first="Kojo", last="Nkrumah", email="kojo.nkrumah@meridian.gh",
             gender="male", dob=date(1998, 12, 1), hire=date(2023, 4, 3), dept="ENG", des="ENG",
             grade=2, salary=5800, role="employee", phone="+233 24 111 0020", city="Accra",
             contract="permanent", mgr=6),
        dict(no="EMP-2024-0031", first="Nana", last="Agyeman", email="nana.agyeman@meridian.gh",
             gender="female", dob=date(2001, 8, 8), hire=date(2024, 9, 2), dept="ENG", des="INT",
             grade=0, salary=2200, role="employee", phone="+233 24 111 0031", city="Accra",
             contract="intern", mgr=6),
        dict(no="EMP-2021-0006", first="Prince", last="Amponsah", email="prince.amponsah@meridian.gh",
             gender="male", dob=date(1988, 4, 16), hire=date(2021, 3, 22), dept="SAL", des="SM",
             grade=3, salary=11000, role="manager", phone="+233 24 111 0006", city="Kumasi",
             contract="permanent", mgr=1, branch=2),
        dict(no="EMP-2022-0016", first="Serwaa", last="Appiah", email="serwaa.appiah@meridian.gh",
             gender="female", dob=date(1995, 6, 27), hire=date(2022, 5, 9), dept="SAL", des="SAL",
             grade=2, salary=5400, role="employee", phone="+233 24 111 0016", city="Kumasi",
             contract="permanent", mgr=10, branch=2),
        dict(no="EMP-2023-0024", first="Daniel", last="Osei", email="daniel.osei@meridian.gh",
             gender="male", dob=date(1993, 10, 5), hire=date(2023, 1, 16), dept="OPS", des="OPS",
             grade=1, salary=3600, role="employee", phone="+233 24 111 0024", city="Accra",
             contract="permanent", mgr=1),
        dict(no="EMP-2022-0018", first="Mavis", last="Tetteh", email="mavis.tetteh@meridian.gh",
             gender="female", dob=date(1991, 8, 19), hire=date(2022, 11, 1), dept="CS", des="CS",
             grade=2, salary=5000, role="employee", phone="+233 24 111 0018", city="Accra",
             contract="permanent", mgr=1),
        dict(no="EMP-2020-0004", first="Joseph", last="Ankrah", email="joseph.ankrah@meridian.gh",
             gender="male", dob=date(1980, 2, 14), hire=date(2020, 8, 10), dept="LEG", des="CEO",
             grade=4, salary=14000, role="auditor", phone="+233 24 111 0004", city="Accra",
             contract="permanent", mgr=1),
    ]

    employees = []
    for i, p in enumerate(people, start=1):
        emp = Employee(
            employee_no=p["no"], first_name=p["first"], last_name=p["last"], email=p["email"],
            phone=p["phone"], gender=p["gender"], dob=p["dob"], hire_date=p["hire"],
            contract_type=p["contract"], status="active",
            department_id=depts[p["dept"]].id, designation_id=desigs[p["des"]].id,
            grade_id=grades[p["grade"]].id, branch_id=p.get("branch", accra.id),
            company_id=company.id, city=p["city"], nationality="Ghanaian",
            marital_status="married" if i % 3 == 0 else "single",
            address=f"{10 + i} Ring Road, {p['city']}",
            basic_salary=p["salary"],
            confirmation_date=p["hire"] + timedelta(days=90),
            probation_end=p["hire"] + timedelta(days=90),
            national_id=f"GHA-{700000000 + i}",
            tax_number=f"P00{100000 + i}",
            ssnit_number=f"C{800000000 + i}",
        )
        db.session.add(emp)
        employees.append(emp)
    db.session.flush()

    for i, p in enumerate(people):
        if p.get("mgr"):
            employees[i].manager_id = employees[p["mgr"] - 1].id
    depts["EXE"].head_id = employees[0].id
    depts["HR"].head_id = employees[1].id
    depts["FIN"].head_id = employees[3].id
    depts["ENG"].head_id = employees[5].id
    depts["SAL"].head_id = employees[9].id

    passwords = {
        "super_admin": "Admin@123",
        "hr_admin": "Hr@123",
        "hr_officer": "Hr@123",
        "payroll": "Payroll@123",
        "manager": "Manager@123",
        "employee": "Employee@123",
        "auditor": "Audit@123",
    }
    users = []
    for i, p in enumerate(people):
        u = User(
            email=p["email"],
            password_hash=generate_password_hash(passwords[p["role"]]),
            employee_id=employees[i].id,
            role_id=role_map[p["role"]].id,
            status="active",
            last_login_at=datetime.utcnow() - timedelta(hours=i),
        )
        db.session.add(u)
        users.append(u)
    db.session.flush()

    for i, emp in enumerate(employees):
        db.session.add(EmployeeContact(
            employee_id=emp.id, type="emergency", name=f"Relative of {emp.first_name}",
            relationship="spouse" if i % 3 == 0 else "parent", phone=f"+233 20 555 {1000 + i}",
        ))
        db.session.add(BankAccount(
            employee_id=emp.id, bank_name="GCB Bank", account_name=emp.full_name,
            account_no=f"101{10000000 + i}", branch_name="Accra Main", is_primary=True,
            mobile_money=emp.phone,
        ))
        db.session.add(Contract(
            employee_id=emp.id, type=emp.contract_type, start_date=emp.hire_date,
            end_date=None if emp.contract_type == "permanent" else emp.hire_date + timedelta(days=365),
            status="active",
        ))
        db.session.add(EmploymentHistory(
            employee_id=emp.id, event_type="hire", to_value=emp.designation.title,
            effective_date=emp.hire_date, notes="Joined Meridian Ghana",
        ))
        if i % 4 == 0:
            db.session.add(Dependant(
                employee_id=emp.id, name=f"Child of {emp.first_name}", relationship="child",
                dob=date(2016, 5, 1), gender="female", is_beneficiary=True,
            ))

    db.session.add_all([
        Document(employee_id=employees[0].id, category="contract", title="CEO Employment Contract",
                 file_name="ama_contract.pdf", expires_at=date(2028, 1, 6)),
        Document(employee_id=employees[6].id, category="id", title="National ID Copy",
                 file_name="abena_id.pdf"),
        Document(employee_id=employees[8].id, category="certificate", title="Internship Agreement",
                 file_name="nana_intern.pdf", expires_at=date(2026, 9, 2)),
        Policy(title="Code of Conduct", category="ethics", version="3.1",
               content="All staff must act with integrity, respect colleagues and protect company data.",
               published_at=date(2025, 1, 10), requires_ack=True),
        Policy(title="Leave Policy", category="time-off", version="2.0",
               content="Annual leave entitlement is 30 working days. Requests require manager approval.",
               published_at=date(2025, 3, 1), requires_ack=True),
        Policy(title="Data Protection Policy", category="compliance", version="1.4",
               content="Personal data is processed in line with the Ghana Data Protection Act, 2012.",
               published_at=date(2025, 6, 12), requires_ack=True),
    ])
    db.session.add(PolicyAck(policy_id=1, employee_id=employees[6].id))

    req = JobRequisition(title="Senior Backend Engineer", department_id=depts["ENG"].id, vacancies=2,
                         employment_type="permanent", justification="Platform scale-up for 2026",
                         status="approved", requested_by=employees[5].id, approved_by=employees[0].id)
    db.session.add(req)
    db.session.flush()
    posting = JobPosting(requisition_id=req.id, title="Senior Backend Engineer",
                         department_id=depts["ENG"].id, location="Accra (hybrid)",
                         employment_type="permanent", vacancies=2, status="open",
                         posted_at=date(2026, 9, 1), closes_at=date(2026, 11, 15),
                         description="Build and operate the Meridian HR platform APIs.",
                         requirements="5+ years Python/PHP, REST, SQL, cloud.")
    db.session.add(JobPosting(title="HR Business Partner", department_id=depts["HR"].id,
                              location="Accra", employment_type="permanent", vacancies=1, status="open",
                              posted_at=date(2026, 9, 20), closes_at=date(2026, 11, 30),
                              description="Partner with business units on people programmes.",
                              requirements="CIPD or equivalent, 4 years HRBP experience."))
    db.session.add(posting)
    db.session.flush()

    cands = [
        Candidate(first_name="Linda", last_name="Quaye", email="linda.quaye@gmail.com",
                  phone="+233 24 900 1101", source="LinkedIn", skills="Python, Flask, Postgres"),
        Candidate(first_name="Isaac", last_name="Baah", email="isaac.baah@gmail.com",
                  phone="+233 24 900 1102", source="Careers page", skills="Laravel, MySQL, Redis"),
        Candidate(first_name="Grace", last_name="Amoako", email="grace.amoako@gmail.com",
                  phone="+233 24 900 1103", source="Referral", skills="HRBP, payroll, employee relations"),
        Candidate(first_name="Felix", last_name="Mensah", email="felix.m@gmail.com",
                  phone="+233 24 900 1104", source="Jobberman", skills="Python, Django, AWS"),
    ]
    db.session.add_all(cands)
    db.session.flush()
    apps = [
        Application(job_posting_id=posting.id, candidate_id=cands[0].id, stage="interview", score=82),
        Application(job_posting_id=posting.id, candidate_id=cands[1].id, stage="screening", score=74),
        Application(job_posting_id=posting.id, candidate_id=cands[3].id, stage="applied", score=61),
        Application(job_posting_id=2, candidate_id=cands[2].id, stage="offer", score=88),
    ]
    db.session.add_all(apps)
    db.session.flush()
    db.session.add(Interview(application_id=apps[0].id,
                             scheduled_at=datetime(2026, 10, 24, 10, 0),
                             interview_type="panel", location="Accra HQ / Meet",
                             panel="Kofi Adjei, Ama Mensah", status="scheduled"))

    db.session.add(OnboardingTemplate(name="Engineering New Hire", department_id=depts["ENG"].id,
                                      tasks_json='["Laptop & accounts","ID badge","Security training","Buddy intro","Repo access"]'))
    for title, owner, days, st in [
        ("Create email & Slack", "IT", 1, "completed"),
        ("Issue laptop", "IT", 2, "completed"),
        ("Payroll setup", "Finance", 3, "in_progress"),
        ("Welcome briefing", "HR", 5, "pending"),
        ("Buddy assignment", "Manager", 2, "completed"),
    ]:
        db.session.add(OnboardingTask(employee_id=employees[8].id, title=title, owner_role=owner,
                                      due_date=date(2024, 9, 2) + timedelta(days=days), status=st))

    day_shift = Shift(name="Standard Day", start_time="08:30", end_time="17:30",
                      grace_minutes=10, is_default=True)
    db.session.add(day_shift)
    db.session.add(Shift(name="Early", start_time="07:00", end_time="16:00", grace_minutes=5))
    db.session.flush()

    today = date.today()
    for emp in employees:
        for d in range(14):
            day = today - timedelta(days=d)
            if day.weekday() >= 5:
                continue
            cin = datetime(day.year, day.month, day.day, 8, 28 + (emp.id % 12))
            cout = datetime(day.year, day.month, day.day, 17, 32 + (emp.id % 8))
            status = "present"
            ot = 0
            if emp.id == 8 and d == 3:
                status = "late"
            if emp.id == 12 and d == 1:
                status = "absent"
                cin = None
                cout = None
            if emp.id % 5 == 0 and d == 2:
                ot = 90
            db.session.add(Attendance(
                employee_id=emp.id, work_date=day, clock_in=cin, clock_out=cout,
                source="web", status=status, overtime_minutes=ot,
            ))

    leave_types = [
        LeaveType(name="Annual Leave", code="ANL", days_per_year=30, paid=True, accrual="yearly",
                  carry_forward=5, color="#0f766e"),
        LeaveType(name="Sick Leave", code="SCK", days_per_year=10, paid=True, requires_attachment=True,
                  color="#b45309"),
        LeaveType(name="Maternity Leave", code="MAT", days_per_year=84, paid=True,
                  gender_restriction="female", color="#7c3aed"),
        LeaveType(name="Paternity Leave", code="PAT", days_per_year=5, paid=True,
                  gender_restriction="male", color="#2563eb"),
        LeaveType(name="Compassionate", code="CMP", days_per_year=5, paid=True, color="#be123c"),
        LeaveType(name="Unpaid Leave", code="UNP", days_per_year=10, paid=False, color="#57534e"),
        LeaveType(name="Study Leave", code="STD", days_per_year=5, paid=True, color="#0369a1"),
    ]
    db.session.add_all(leave_types)
    db.session.flush()

    year = today.year
    for emp in employees:
        for lt in leave_types:
            if lt.gender_restriction and lt.gender_restriction != emp.gender:
                continue
            entitled = float(lt.days_per_year)
            taken = 3 if lt.code == "ANL" else (1 if lt.code == "SCK" and emp.id % 4 == 0 else 0)
            db.session.add(LeaveBalance(employee_id=emp.id, leave_type_id=lt.id, year=year,
                                        entitled=entitled, taken=taken, pending=0))

    lr1 = LeaveRequest(employee_id=employees[6].id, leave_type_id=leave_types[0].id,
                       start_date=today + timedelta(days=5), end_date=today + timedelta(days=9),
                       days=5, reason="Family trip to Cape Coast", status="pending",
                       approver_id=employees[5].id)
    lr2 = LeaveRequest(employee_id=employees[7].id, leave_type_id=leave_types[1].id,
                       start_date=today - timedelta(days=2), end_date=today - timedelta(days=1),
                       days=2, reason="Malaria recovery", status="approved",
                       approver_id=employees[5].id, decided_at=datetime.utcnow())
    lr3 = LeaveRequest(employee_id=employees[10].id, leave_type_id=leave_types[0].id,
                       start_date=today + timedelta(days=12), end_date=today + timedelta(days=16),
                       days=5, reason="Wedding", status="pending", approver_id=employees[9].id)
    db.session.add_all([lr1, lr2, lr3])
    db.session.flush()
    db.session.add_all([
        Approval(request_type="leave", request_id=lr1.id, requester_id=employees[6].id,
                 approver_id=employees[5].id, status="pending"),
        Approval(request_type="leave", request_id=lr3.id, requester_id=employees[10].id,
                 approver_id=employees[9].id, status="pending"),
    ])
    LeaveBalance.query.filter_by(employee_id=employees[6].id, leave_type_id=leave_types[0].id).update(
        {"pending": 5}
    )

    holidays = [
        ("New Year's Day", date(year, 1, 1)),
        ("Independence Day", date(year, 3, 6)),
        ("Good Friday", date(year, 4, 3)),
        ("Easter Monday", date(year, 4, 6)),
        ("May Day", date(year, 5, 1)),
        ("Founders' Day", date(year, 8, 4)),
        ("Kwame Nkrumah Memorial", date(year, 9, 21)),
        ("Christmas Day", date(year, 12, 25)),
        ("Boxing Day", date(year, 12, 26)),
    ]
    for name, d in holidays:
        db.session.add(Holiday(name=name, holiday_date=d, country="Ghana", branch_id=accra.id))

    comps = [
        SalaryComponent(name="Basic Pay", code="BASIC", kind="earning", is_taxable=True, calculation="fixed"),
        SalaryComponent(name="Housing Allowance", code="HSE", kind="earning", is_taxable=True, calculation="fixed"),
        SalaryComponent(name="Transport Allowance", code="TRN", kind="earning", is_taxable=True, calculation="fixed"),
        SalaryComponent(name="SSNIT Employee", code="SSNIT", kind="deduction", is_statutory=True, calculation="percent"),
        SalaryComponent(name="PAYE Tax", code="PAYE", kind="deduction", is_statutory=True, calculation="band"),
    ]
    db.session.add_all(comps)
    db.session.flush()
    for emp in employees:
        db.session.add(SalaryStructure(employee_id=emp.id, component_id=comps[0].id,
                                       amount=emp.basic_salary, effective_date=emp.hire_date))
        db.session.add(SalaryStructure(employee_id=emp.id, component_id=comps[1].id,
                                       amount=round(float(emp.basic_salary) * 0.15, 2),
                                       effective_date=emp.hire_date))
        db.session.add(SalaryStructure(employee_id=emp.id, component_id=comps[2].id,
                                       amount=400, effective_date=emp.hire_date))

    bands = [
        (0, 490, 0, "First GHS 490"),
        (490, 110, 0.05, "Next GHS 110"),
        (600, 130, 0.10, "Next GHS 130"),
        (730, 3000, 0.175, "Next GHS 3,000"),
        (3730, 16395, 0.25, "Next GHS 16,395"),
        (20125, 30575, 0.30, "Next GHS 30,575"),
        (50700, None, 0.35, "Exceeding GHS 50,700"),
    ]
    running = 0
    for mn, width, rate, desc in bands:
        mx = None if width is None else running + width
        db.session.add(TaxBand(country="Ghana", min_amount=running, max_amount=mx, rate=rate, description=desc))
        if width is not None:
            running = mx

    run = PayrollRun(period_year=today.year, period_month=today.month - 1 if today.month > 1 else 12,
                     status="paid", prepared_by=users[4].id, approved_by=users[1].id,
                     locked_at=datetime.utcnow() - timedelta(days=12),
                     paid_at=datetime.utcnow() - timedelta(days=10),
                     employee_count=len(employees))
    db.session.add(run)
    db.session.flush()
    total_gross = total_tax = total_net = Decimal("0")
    for emp in employees:
        basic = Decimal(str(emp.basic_salary))
        housing = (basic * Decimal("0.15")).quantize(Decimal("0.01"))
        transport = Decimal("400.00")
        gross = basic + housing + transport
        ssnit = (basic * Decimal("0.055")).quantize(Decimal("0.01"))
        taxable = gross - ssnit
        tax = _paye(taxable)
        net = gross - ssnit - tax
        ps = Payslip(run_id=run.id, employee_id=emp.id, gross=gross, tax=tax, ssnit=ssnit,
                     other_deductions=0, net=net)
        db.session.add(ps)
        db.session.flush()
        db.session.add_all([
            PayslipItem(payslip_id=ps.id, name="Basic Pay", kind="earning", amount=basic),
            PayslipItem(payslip_id=ps.id, name="Housing Allowance", kind="earning", amount=housing),
            PayslipItem(payslip_id=ps.id, name="Transport Allowance", kind="earning", amount=transport),
            PayslipItem(payslip_id=ps.id, name="SSNIT Employee 5.5%", kind="deduction", amount=ssnit),
            PayslipItem(payslip_id=ps.id, name="PAYE", kind="deduction", amount=tax),
        ])
        total_gross += gross
        total_tax += tax
        total_net += net
    run.total_gross = total_gross
    run.total_tax = total_tax
    run.total_net = total_net

    db.session.add(Loan(employee_id=employees[7].id, loan_type="salary_advance", principal=3000,
                        instalment=500, balance=2000, start_date=date(year, 7, 1),
                        status="active", reason="School fees"))
    db.session.add(Loan(employee_id=employees[11].id, loan_type="staff_loan", principal=8000,
                        instalment=800, balance=6400, start_date=date(year, 4, 1),
                        status="pending", reason="Home renovation"))

    cycle = AppraisalCycle(name=f"{year} Mid-Year Review", start_date=date(year, 6, 1),
                           end_date=date(year, 7, 15), status="open")
    db.session.add(cycle)
    db.session.flush()
    db.session.add_all([
        Goal(employee_id=employees[6].id, title="Ship attendance geofencing", weight=40, progress=70,
             due_date=date(year, 12, 15), status="active", description="Web clock-in with IP + geo checks."),
        Goal(employee_id=employees[6].id, title="Reduce API p95 below 300ms", weight=30, progress=45,
             due_date=date(year, 11, 30), status="active"),
        Goal(employee_id=employees[7].id, title="Complete Laravel module coverage", weight=50, progress=60,
             due_date=date(year, 12, 1), status="active"),
        Appraisal(cycle_id=cycle.id, employee_id=employees[6].id, reviewer_id=employees[5].id,
                  self_score=4.2, manager_score=4.0, final_score=4.1, status="in_review",
                  self_comments="Delivered leave calendar and clock widget.",
                  manager_comments="Strong delivery; coach on estimation."),
        Appraisal(cycle_id=cycle.id, employee_id=employees[7].id, reviewer_id=employees[5].id,
                  self_score=3.8, status="self_review"),
    ])

    t1 = Training(title="GDPR & Ghana DPA Essentials", provider="Internal Legal", category="compliance",
                  mode="internal", cost=0, start_date=date(year, 10, 28), end_date=date(year, 10, 28),
                  capacity=40, status="scheduled", description="Mandatory data-protection refresher.")
    t2 = Training(title="Advanced Python for HR Platforms", provider="Andela Learning", category="technical",
                  mode="online", cost=2400, start_date=date(year, 11, 10), end_date=date(year, 11, 21),
                  capacity=12, status="scheduled")
    db.session.add_all([t1, t2])
    db.session.flush()
    db.session.add_all([
        TrainingEnrolment(training_id=t1.id, employee_id=employees[6].id, status="enrolled"),
        TrainingEnrolment(training_id=t1.id, employee_id=employees[2].id, status="enrolled"),
        TrainingEnrolment(training_id=t2.id, employee_id=employees[7].id, status="enrolled"),
    ])

    cats = [
        ExpenseCategory(name="Travel", limit_amount=2000, requires_receipt=True),
        ExpenseCategory(name="Meals", limit_amount=300, requires_receipt=True),
        ExpenseCategory(name="Internet", limit_amount=400, requires_receipt=True),
        ExpenseCategory(name="Office supplies", limit_amount=250, requires_receipt=True),
    ]
    db.session.add_all(cats)
    db.session.flush()
    cl1 = ExpenseClaim(employee_id=employees[6].id, category_id=cats[0].id, title="Client visit – Kumasi",
                       amount=850, claim_date=today - timedelta(days=4),
                       description="STC bus and hotel, 1 night", status="pending")
    cl2 = ExpenseClaim(employee_id=employees[10].id, category_id=cats[1].id, title="Customer lunch",
                       amount=180, claim_date=today - timedelta(days=8), status="approved")
    db.session.add_all([cl1, cl2])
    db.session.flush()
    db.session.add(Approval(request_type="expense", request_id=cl1.id, requester_id=employees[6].id,
                            approver_id=employees[5].id, status="pending"))

    assets = [
        Asset(tag="AST-LTP-0042", name="MacBook Pro 14", category="laptop", serial_no="C02X1234",
              purchase_date=date(2024, 3, 1), value=14500, status="assigned"),
        Asset(tag="AST-LTP-0058", name="Dell XPS 13", category="laptop", serial_no="DX13-8891",
              purchase_date=date(2025, 1, 12), value=9200, status="assigned"),
        Asset(tag="AST-PHN-0011", name="iPhone 15", category="phone", serial_no="IP15-2201",
              purchase_date=date(2024, 8, 20), value=6800, status="assigned"),
        Asset(tag="AST-MON-0077", name="LG UltraFine 27", category="monitor", serial_no="LG27-4410",
              purchase_date=date(2025, 6, 4), value=2100, status="available"),
        Asset(tag="AST-LTP-0090", name="ThinkPad T14", category="laptop", serial_no="TP-T14-1002",
              purchase_date=date(2026, 2, 18), value=7800, status="available"),
    ]
    db.session.add_all(assets)
    db.session.flush()
    db.session.add_all([
        AssetAssignment(asset_id=assets[0].id, employee_id=employees[6].id, assigned_at=date(2024, 3, 8),
                        condition_out="good"),
        AssetAssignment(asset_id=assets[1].id, employee_id=employees[7].id, assigned_at=date(2025, 1, 20),
                        condition_out="good"),
        AssetAssignment(asset_id=assets[2].id, employee_id=employees[9].id, assigned_at=date(2024, 8, 22),
                        condition_out="good"),
    ])

    tk = Ticket(employee_id=employees[7].id, category="payroll", subject="Missing overtime on September payslip",
                description="Worked 6 extra hours on 12 Sep; not reflected.", priority="high", status="open")
    tk2 = Ticket(employee_id=employees[12].id, category="leave", subject="Balance not updated after sick leave",
                 description="Took 2 sick days last week, balance still shows 10.", priority="medium", status="in_progress")
    db.session.add_all([tk, tk2])
    db.session.flush()
    db.session.add(TicketComment(ticket_id=tk2.id, author_id=users[2].id,
                                 body="Looking into the accrual job. Will update by EOD."))

    db.session.add_all([
        Announcement(title="Q4 town hall – 28 October", body="Join the CEO at 15:00 in the Accra HQ atrium or via Meet.",
                     audience="all", pinned=True, author_id=users[0].id),
        Announcement(title="Flu vaccination drive", body="Occupational health will be on-site 24–25 October.",
                     audience="all", author_id=users[1].id),
        Announcement(title="Engineering sprint freeze", body="Code freeze starts 1 November ahead of payroll cut-over.",
                     audience="department", department_id=depts["ENG"].id, author_id=users[5].id),
    ])
    for u in users:
        db.session.add(Notification(user_id=u.id, title="Welcome to Meridian HR",
                                    body="Your self-service portal is ready.", link="/dashboard"))
    db.session.add(Notification(user_id=users[5].id, title="Leave request awaiting you",
                                body="Abena Sarpong requested 5 days annual leave.", link="/approvals"))
    db.session.add(Notification(user_id=users[6].id, title="Leave submitted",
                                body="Your annual leave request is with Kofi Adjei.", link="/leave"))

    db.session.add_all([
        Setting(key="employee_no_format", value="EMP-{YYYY}-{SEQ:4}", group_name="hr"),
        Setting(key="work_week", value="Mon-Fri", group_name="attendance"),
        Setting(key="default_currency", value="GHS", group_name="payroll"),
        Setting(key="ssnit_employee_rate", value="0.055", group_name="payroll"),
        Setting(key="ssnit_employer_rate", value="0.13", group_name="payroll"),
        Setting(key="company_name", value="Meridian Ghana Ltd", group_name="branding"),
        Setting(key="brand_primary", value="#0f766e", group_name="branding"),
        Setting(key="grace_minutes", value="10", group_name="attendance"),
    ])
    db.session.add(AuditLog(user_id=users[0].id, event="seed", entity="system", entity_id=0,
                            new_values="Initial demo dataset loaded", ip="127.0.0.1"))
    db.session.add(LoginHistory(user_id=users[0].id, ip="127.0.0.1", user_agent="seed", success=True))


def _paye(taxable: Decimal) -> Decimal:
    remaining = taxable
    tax = Decimal("0")
    bands = [
        (Decimal("490"), Decimal("0")),
        (Decimal("110"), Decimal("0.05")),
        (Decimal("130"), Decimal("0.10")),
        (Decimal("3000"), Decimal("0.175")),
        (Decimal("16395"), Decimal("0.25")),
        (Decimal("30575"), Decimal("0.30")),
        (None, Decimal("0.35")),
    ]
    for width, rate in bands:
        if remaining <= 0:
            break
        slice_amt = remaining if width is None else min(remaining, width)
        tax += slice_amt * rate
        remaining -= slice_amt
    return tax.quantize(Decimal("0.01"))
