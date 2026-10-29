"""Category-specific Official Employment Letter Engine.

Generates printable, legally structured appointment/engagement letters tailored
to the employee's exact employment category (Permanent, Probationary, Fixed-Term,
Part-Time, Casual, Internship/Attachment, National Service, or Consultant) and
staff category/cadre, aligned with the Ghana Labour Act, 2003 (Act 651).
"""
import json
from datetime import date, timedelta
from decimal import Decimal

from models import (
    db, Company, Employee, EmploymentLetter, Contract, SalaryStructure,
    LeaveBalance, LeaveType, Setting,
)

STAFF_CATEGORIES = [
    {"value": "Executive / Leadership", "label": "Executive / Leadership"},
    {"value": "Management / Senior Staff", "label": "Management / Senior Staff"},
    {"value": "Supervisory / Mid-Level", "label": "Supervisory / Mid-Level"},
    {"value": "General / Junior Staff", "label": "General / Junior Staff"},
    {"value": "Operations / Frontline", "label": "Operations / Frontline"},
    {"value": "Technical / Specialist", "label": "Technical / Specialist"},
    {"value": "Trainee / Attachment", "label": "Trainee / Attachment"},
]

EMPLOYMENT_CATEGORIES = {
    "permanent": {
        "key": "permanent",
        "label": "Permanent / Full-Time",
        "badge": "PERMANENT APPOINTMENT",
        "tone": "teal",
        "letter_title": "LETTER OF PERMANENT APPOINTMENT",
        "subject_line": "OFFER OF PERMANENT FULL-TIME EMPLOYMENT — {{designation}} ({{department}})",
        "working_hours": "40 hours per week (Monday to Friday, 8:00 AM – 5:00 PM, or duty schedule assigned by department)",
        "notice_period": "One (1) calendar month written notice (or salary in lieu thereof)",
        "probation_months": 3,
        "duration_months": None,
        "opening": (
            "Following our recruitment process, Management of {{company_legal_name}} (\"the Company\") is pleased to "
            "offer you a **Permanent Full-Time Appointment** as **{{designation}}** under the **{{staff_category}}** category "
            "in the **{{department}}** Department, effective **{{hire_date}}**."
        ),
        "sections": [
            ("1. Position, Reporting & Place of Work",
             "You will serve in the capacity of {{designation}} ({{staff_category}}{{grade_clause}}) based at {{branch_location}}, "
             "reporting directly to {{manager_name}} or any other officer designated by Management. The Company reserves the right, "
             "upon reasonable notice, to assign or transfer you to related duties or branches within its operations."),
            ("2. Commencement & Probationary Review",
             "{{probation_clause}}"),
            ("3. Remuneration & Statutory Deductions",
             "Your starting basic salary shall be **{{basic_salary}}** per month ({{gross_clause}}), payable monthly in arrears "
             "via bank transfer or approved Mobile Money account. Your remuneration is subject to statutory income tax (PAYE) "
             "remitted to the Ghana Revenue Authority (GRA) and mandatory Tier 1 & Tier 2 SSNIT pension contributions in accordance "
             "with the National Pensions Act, 2008 (Act 766)."),
            ("4. Working Hours & Annual Leave Entitlement",
             "Your standard hours of work shall be {{working_hours}}. In line with the Ghana Labour Act, 2003 (Act 651) and Company "
             "policy, you are entitled to **{{leave_days}} working days of paid annual leave** per calendar year, scheduled with prior "
             "approval of your Head of Department, in addition to gazetted public holidays of the Republic of Ghana."),
            ("5. Confidentiality, Code of Conduct & Exclusivity",
             "As a full-time permanent member of staff, you are required to devote your full working time and attention to the business "
             "of {{company_name}}, abide by all Company policies and hospitality/operational standards, and maintain strict confidentiality "
             "regarding proprietary business, guest, client, financial, and personnel information both during and after your employment."),
            ("6. Termination & Notice Period",
             "Following confirmation, employment may be terminated by either party giving **{{notice_period}}**, except in cases of "
             "summary dismissal for gross misconduct as provided under Section 62 of the Ghana Labour Act, 2003 (Act 651)."),
        ],
        "closing": (
            "We warmly welcome you to {{company_legal_name}} and look forward to your dedication and contribution to our continued excellence. "
            "Please indicate your acceptance of the terms and conditions set out in this Letter of Permanent Appointment by signing below."
        ),
    },
    "probation": {
        "key": "probation",
        "label": "Probationary Staff",
        "badge": "PROBATIONARY APPOINTMENT",
        "tone": "amber",
        "letter_title": "OFFER OF PROBATIONARY APPOINTMENT",
        "subject_line": "PROBATIONARY EMPLOYMENT OFFER — {{designation}} ({{department}})",
        "working_hours": "40 hours per week (Monday to Friday, 8:00 AM – 5:00 PM, or rostered shift schedule)",
        "notice_period": "Fourteen (14) days written notice (or payment in lieu) during probation",
        "probation_months": 3,
        "duration_months": None,
        "opening": (
            "Management of {{company_legal_name}} is pleased to offer you a **Probationary Appointment** as **{{designation}}** "
            "under the **{{staff_category}}** category in our **{{department}}** Department, effective **{{hire_date}}**."
        ),
        "sections": [
            ("1. Probationary Period & Confirmation Criteria",
             "Your appointment is subject to a mandatory probationary period of **{{probation_months}} months**, concluding on or around "
             "**{{probation_end}}**. During this period, your job performance, attendance, teamwork, and adherence to Company standards "
             "will be formally assessed by {{manager_name}}. Subject to satisfactory appraisal, you will receive written confirmation "
             "into the permanent establishment of {{company_name}}."),
            ("2. Duties, Reporting & Work Location",
             "You will carry out duties assigned to the position of {{designation}} ({{staff_category}}{{grade_clause}}) at {{branch_location}}, "
             "reporting to {{manager_name}}. Your standard working schedule shall be {{working_hours}}."),
            ("3. Probationary Remuneration & Statutory Deductions",
             "During the probationary period, you will be paid a monthly basic salary of **{{basic_salary}}** ({{gross_clause}}), "
             "less statutory GRA PAYE income tax and SSNIT employee pension deductions."),
            ("4. Leave, Conduct & Company Policies",
             "Leave accrual applies from your date of assumption of duty in accordance with the Ghana Labour Act, 2003 (Act 651), "
             "with non-emergency annual leave ordinarily taken after completion of probation. You shall strictly observe the Company's "
             "Code of Conduct, health & safety rules, and confidentiality obligations."),
            ("5. Extension or Termination During Probation",
             "During probation, either party may terminate the appointment by giving **{{notice_period}}**. Where performance requires "
             "further observation, Management may extend the probationary period once in writing before confirmation."),
        ],
        "closing": (
            "Congratulations on your selection to join {{company_legal_name}}. Kindly sign below to confirm your acceptance of this "
            "Probationary Appointment and report to Human Resources on {{hire_date}}."
        ),
    },
    "fixed_term": {
        "key": "fixed_term",
        "label": "Fixed-Term Contract",
        "badge": "FIXED-TERM CONTRACT",
        "tone": "blue",
        "letter_title": "FIXED-TERM EMPLOYMENT CONTRACT LETTER",
        "subject_line": "APPOINTMENT ON FIXED-TERM CONTRACT — {{designation}} ({{department}})",
        "working_hours": "40 hours per week (Monday to Friday, or operational roster)",
        "notice_period": "Thirty (30) days written notice by either party",
        "probation_months": 0,
        "duration_months": 12,
        "opening": (
            "Management of {{company_legal_name}} is pleased to engage your services on a **Fixed-Term Contract** basis "
            "as **{{designation}}** (**{{staff_category}}**) in the **{{department}}** Department."
        ),
        "sections": [
            ("1. Contract Duration & Effective Dates",
             "This Fixed-Term Contract commences on **{{hire_date}}** and shall automatically expire on **{{end_date}}**, unless "
             "terminated earlier in accordance with Clause 5 or renewed in writing by mutual agreement of both parties. Nothing in "
             "this letter creates an expectation of automatic conversion to permanent employment."),
            ("2. Scope of Duties, Location & Reporting",
             "You are employed as {{designation}} ({{staff_category}}{{grade_clause}}) stationed at {{branch_location}}, reporting to "
             "{{manager_name}}. Your working hours shall be {{working_hours}}."),
            ("3. Contract Remuneration Package",
             "You will receive a consolidated monthly basic salary of **{{basic_salary}}** ({{gross_clause}}), payable in arrears "
             "by bank transfer, subject to statutory GRA PAYE tax and mandatory SSNIT contributions."),
            ("4. Leave & Statutory Benefits",
             "You are entitled to paid leave calculated pro-rata at the statutory rate (**{{leave_days}} working days per full year**) "
             "to be utilised within the contract term, together with statutory public holidays."),
            ("5. Early Termination, Confidentiality & Handover",
             "Either party may terminate this contract prior to {{end_date}} by giving **{{notice_period}}**. Upon expiry or termination, "
             "you shall hand over all Company assets, records, credentials, and property in good order and maintain full confidentiality."),
        ],
        "closing": (
            "We look forward to a productive contract engagement with {{company_legal_name}}. Please sign and return/accept a copy "
            "of this Fixed-Term Contract Letter to signify your agreement."
        ),
    },
    "part_time": {
        "key": "part_time",
        "label": "Part-Time Staff",
        "badge": "PART-TIME APPOINTMENT",
        "tone": "purple",
        "letter_title": "LETTER OF PART-TIME APPOINTMENT",
        "subject_line": "OFFER OF PART-TIME EMPLOYMENT — {{designation}} ({{department}})",
        "working_hours": "20 – 24 hours per week according to the agreed departmental schedule",
        "notice_period": "Fourteen (14) days written notice by either party",
        "probation_months": 2,
        "duration_months": None,
        "opening": (
            "Management of {{company_legal_name}} is pleased to offer you a **Part-Time Appointment** as **{{designation}}** "
            "under the **{{staff_category}}** category in our **{{department}}** Department, effective **{{hire_date}}**."
        ),
        "sections": [
            ("1. Duties & Reporting Line",
             "You will perform duties as {{designation}} ({{staff_category}}{{grade_clause}}) at {{branch_location}}, reporting "
             "directly to {{manager_name}}."),
            ("2. Part-Time Working Hours & Schedule",
             "Your contracted schedule shall be **{{working_hours}}**. Any additional hours worked beyond the agreed schedule must "
             "receive prior approval from your Department Head."),
            ("3. Pro-Rata Remuneration & Deductions",
             "Your part-time monthly basic remuneration shall be **{{basic_salary}}** ({{gross_clause}}), paid monthly in arrears "
             "and subject to applicable statutory tax (PAYE) and SSNIT deductions."),
            ("4. Pro-Rata Leave & Workplace Standards",
             "Paid leave entitlement applies on a pro-rata basis in accordance with the Ghana Labour Act, 2003 (Act 651). "
             "You remain bound by all Company policies on ethics, safety, data protection, and service quality."),
            ("5. Notice of Termination",
             "Either party may terminate this Part-Time Appointment upon **{{notice_period}}**."),
        ],
        "closing": (
            "Welcome to the {{company_legal_name}} team. Kindly acknowledge acceptance of these terms below."
        ),
    },
    "casual": {
        "key": "casual",
        "label": "Casual / Temporary Staff",
        "badge": "CASUAL ENGAGEMENT",
        "tone": "amber",
        "letter_title": "CASUAL EMPLOYMENT ENGAGEMENT LETTER",
        "subject_line": "ENGAGEMENT AS CASUAL / TEMPORARY WORKER — {{designation}} ({{department}})",
        "working_hours": "Shift / operational duty roster as scheduled by Department Supervisor (not exceeding statutory limits)",
        "notice_period": "Seven (7) days notice or in accordance with Section 74 of the Ghana Labour Act, 2003 (Act 651)",
        "probation_months": 0,
        "duration_months": 6,
        "opening": (
            "Pursuant to **Section 74 and Section 78 of the Ghana Labour Act, 2003 (Act 651)**, {{company_legal_name}} "
            "hereby engages you as a **Casual / Temporary Worker** in the role of **{{designation}}** (**{{staff_category}}**) "
            "within the **{{department}}** Department, effective **{{hire_date}}**{{end_date_inline}}."
        ),
        "sections": [
            ("1. Nature of Engagement & Duty Roster",
             "Your engagement is seasonal/intermittent operational support based at {{branch_location}}, reporting to {{manager_name}}. "
             "Your duty attendance shall follow: {{working_hours}}."),
            ("2. Agreed Casual Remuneration & Statutory Provisions",
             "You will receive remuneration equivalent to **{{basic_salary}}** per month (or pro-rated daily/shift equivalent for days worked), "
             "inclusive of statutory casual worker protections under Section 74 of Act 651, overtime compensation where applicable, "
             "and statutory tax deductions."),
            ("3. Workplace Safety, Uniform & Conduct",
             "You must comply with all operational, hygiene, hospitality, security, and occupational health & safety instructions "
             "issued by {{company_name}}, and take proper care of uniforms, badges, and equipment entrusted to you."),
            ("4. Duration & Cessation of Engagement",
             "This engagement is non-permanent and subject to operational demand. Either party may bring the engagement to an end "
             "in accordance with **{{notice_period}}**."),
        ],
        "closing": (
            "Please sign below to confirm that you have read, understood, and accepted the terms of this Casual Engagement Letter."
        ),
    },
    "intern": {
        "key": "intern",
        "label": "Internship / Attachment",
        "badge": "INTERNSHIP OFFER",
        "tone": "purple",
        "letter_title": "INTERNSHIP & INDUSTRIAL ATTACHMENT LETTER",
        "subject_line": "OFFER OF INTERNSHIP / INDUSTRIAL ATTACHMENT — {{designation}} ({{department}})",
        "working_hours": "Monday to Friday, 8:30 AM – 4:30 PM (supervised learning & practical placement)",
        "notice_period": "Seven (7) days written notice by either party",
        "probation_months": 0,
        "duration_months": 6,
        "opening": (
            "Management of {{company_legal_name}} is delighted to offer you an **Internship / Industrial Attachment** placement "
            "as **{{designation}}** (**{{staff_category}}**) in our **{{department}}** Department."
        ),
        "sections": [
            ("1. Placement Period & Mentorship Supervision",
             "Your internship placement begins on **{{hire_date}}** and concludes on **{{end_date}}** at {{branch_location}}. "
             "You will be mentored and supervised directly by **{{manager_name}}**, who will guide your learning plan and practical assignments."),
            ("2. Learning Schedule & Attendance",
             "Your attendance hours shall be {{working_hours}}. Should academic examinations or institutional requirements necessitate time "
             "away, kindly notify your supervisor and HR in advance."),
            ("3. Monthly Internship Allowance / Stipend",
             "To support your transportation and upkeep during the placement, the Company will pay a monthly internship stipend of "
             "**{{basic_salary}}**, subject to applicable statutory withholding/PAYE rules."),
            ("4. Confidentiality, Conduct & Intellectual Property",
             "You are required to uphold professional workplace conduct, safeguard Company equipment, and maintain strict confidentiality "
             "over all internal records, guest/client data, and systems accessed during your attachment. Completion of this internship "
             "does not guarantee subsequent permanent employment, though strong performers are encouraged to apply for open roles."),
            ("5. Early Cessation & Completion Certificate",
             "Either party may end the placement upon **{{notice_period}}**. Upon satisfactory completion, Human Resources will issue "
             "an official **Internship Completion & Evaluation Letter**."),
        ],
        "closing": (
            "We wish you an enriching learning experience at {{company_legal_name}}. Kindly sign below to accept this Internship Offer."
        ),
    },
    "national_service": {
        "key": "national_service",
        "label": "National Service (NSS)",
        "badge": "NATIONAL SERVICE",
        "tone": "teal",
        "letter_title": "NATIONAL SERVICE ENGAGEMENT & ACCEPTANCE LETTER",
        "subject_line": "NATIONAL SERVICE POSTING & DEPARTMENTAL ASSIGNMENT — {{designation}} ({{department}})",
        "working_hours": "40 hours per week (Monday to Friday, 8:00 AM – 5:00 PM)",
        "notice_period": "In accordance with Ghana National Service Scheme (NSS) regulations",
        "probation_months": 0,
        "duration_months": 12,
        "opening": (
            "Following your posting by the **Ghana National Service Scheme (NSS)**, Management of {{company_legal_name}} "
            "is pleased to accept and assign you as **{{designation}}** (**{{staff_category}}**) in our **{{department}}** Department."
        ),
        "sections": [
            ("1. Service Duration & Reporting Line",
             "Your National Service engagement runs from **{{hire_date}}** to **{{end_date}}** at {{branch_location}}. "
             "You will report directly to **{{manager_name}}** for day-to-day duties, monthly NSS duty forms, and performance evaluation."),
            ("2. Working Hours & NSS Obligations",
             "Your standard working hours are {{working_hours}}, with release granted for official National Service Secretariat "
             "registrations or regional activities upon presentation of notice."),
            ("3. Allowance & Welfare Support",
             "In addition to your statutory NSS allowance, {{company_name}} provides a monthly support package/allowance of "
             "**{{basic_salary}}** ({{gross_clause}}) in recognition of your contribution."),
            ("4. Ethics, Confidentiality & Property",
             "During your service year, you are expected to observe all Company policies, dress code, data protection standards, "
             "and NSS rules & regulations."),
        ],
        "closing": (
            "We welcome you to {{company_legal_name}} for a rewarding service year. Please sign below to confirm assumption of duty."
        ),
    },
    "consultant": {
        "key": "consultant",
        "label": "Consultant / Retainer",
        "badge": "CONSULTANCY AGREEMENT",
        "tone": "blue",
        "letter_title": "INDEPENDENT CONSULTANCY ENGAGEMENT LETTER",
        "subject_line": "ENGAGEMENT AS CONSULTANT — {{designation}} ({{department}})",
        "working_hours": "Flexible advisory schedule aligned with agreed milestones & deliverables",
        "notice_period": "Thirty (30) days written notice by either party",
        "probation_months": 0,
        "duration_months": 12,
        "opening": (
            "{{company_legal_name}} is pleased to engage you as an **Independent Consultant** in the capacity of "
            "**{{designation}}** advising our **{{department}}** function, effective **{{hire_date}}**."
        ),
        "sections": [
            ("1. Term & Deliverables",
             "This consultancy engagement runs from **{{hire_date}}** through **{{end_date}}**, coordinating closely with "
             "**{{manager_name}}** at {{branch_location}} (or remotely as agreed)."),
            ("2. Consultancy Fee & Withholding Tax",
             "In consideration of your professional services, {{company_name}} shall pay a monthly retainer fee of **{{basic_salary}}** "
             "upon submission of monthly statement/invoice, subject to statutory Ghana Revenue Authority (GRA) withholding tax on "
             "consultancy fees."),
            ("3. Independent Contractor Status",
             "You are engaged as an independent professional and not as an employee under a contract of service; accordingly, "
             "statutory employee pension/leave provisions do not apply except as expressly agreed in writing."),
            ("4. Confidentiality, Intellectual Property & Notice",
             "All deliverables, reports, software, and proprietary materials created under this engagement remain the exclusive property "
             "of {{company_legal_name}}. Either party may terminate this engagement upon **{{notice_period}}**."),
        ],
        "closing": (
            "Kindly countersign below to confirm acceptance of the terms of this Consultancy Engagement."
        ),
    },
}


def category_options():
    return [
        {
            "key": k,
            "label": v["label"],
            "badge": v["badge"],
            "letter_title": v["letter_title"],
            "tone": v["tone"],
        }
        for k, v in EMPLOYMENT_CATEGORIES.items()
    ]


def infer_category_key(emp):
    ct = (getattr(emp, "contract_type", None) or "permanent").strip().lower()
    st = (getattr(emp, "status", None) or "active").strip().lower()
    if ct in EMPLOYMENT_CATEGORIES:
        if ct == "permanent" and st == "probation":
            return "probation"
        return ct
    return "permanent"


def infer_staff_category(emp):
    existing = (getattr(emp, "staff_category", None) or "").strip()
    if existing and existing != "General Staff":
        return existing
    ct = (getattr(emp, "contract_type", None) or "permanent").lower()
    if ct in ("intern", "national_service"):
        return "Trainee / Attachment"
    title = (emp.designation.title.lower() if emp and emp.designation and emp.designation.title else "")
    grade_lvl = (emp.grade.level if emp and emp.grade and emp.grade.level else 0)
    if any(w in title for w in ("chief", "director", "head of", "vp", "executive")) or grade_lvl >= 5:
        return "Executive / Leadership"
    if "manager" in title or grade_lvl == 4:
        return "Management / Senior Staff"
    if any(w in title for w in ("engineer", "specialist", "analyst", "accountant", "officer")) or grade_lvl == 3:
        return "Technical / Specialist"
    if any(w in title for w in ("coordinator", "supervisor", "operations", "front")):
        return "Operations / Frontline"
    return "General / Junior Staff"


def get_stored_template_overrides():
    row = Setting.query.filter_by(key="letters.templates").first()
    if not row or not row.value:
        return {}
    try:
        data = json.loads(row.value)
        return data if isinstance(data, dict) else {}
    except ValueError:
        return {}


def get_merged_templates():
    overrides = get_stored_template_overrides()
    out = {}
    for key, base in EMPLOYMENT_CATEGORIES.items():
        merged = dict(base)
        merged["sections"] = list(base["sections"])
        ov = overrides.get(key)
        if isinstance(ov, dict):
            for fld in ("label", "badge", "letter_title", "subject_line", "working_hours",
                        "notice_period", "probation_months", "opening", "closing", "extra_clause"):
                if fld in ov and ov[fld] is not None and ov[fld] != "":
                    merged[fld] = ov[fld]
        out[key] = merged
    return out


def save_template_override(category_key, data):
    if category_key not in EMPLOYMENT_CATEGORIES:
        raise ValueError("Unknown employment category")
    overrides = get_stored_template_overrides()
    cur = dict(overrides.get(category_key) or {})
    allowed = ("label", "badge", "letter_title", "subject_line", "working_hours",
               "notice_period", "probation_months", "opening", "closing", "extra_clause")
    for k in allowed:
        if k in data:
            cur[k] = data[k]
    overrides[category_key] = cur
    row = Setting.query.filter_by(key="letters.templates").first()
    if not row:
        row = Setting(key="letters.templates", group_name="hr")
        db.session.add(row)
    row.value = json.dumps(overrides)
    return get_merged_templates()[category_key]


def _default_signatory():
    hr_head = (
        Employee.query.join(Employee.designation)
        .filter(Employee.deleted_at.is_(None), Employee.status == "active")
        .all()
    )
    for e in hr_head:
        t = (e.designation.title or "").lower()
        if "human resources" in t or "head of hr" in t or "hr director" in t:
            return e.full_name, e.designation.title
    for e in hr_head:
        t = (e.designation.title or "").lower()
        if "chief executive" in t or "managing director" in t:
            return e.full_name, e.designation.title
    return "Human Resources Directorate", "Head of Human Resources"


def default_reference_no(emp, company=None):
    comp = company or Company.query.first()
    raw_code = "".join(ch for ch in (comp.name if comp and comp.name else "HR") if ch.isalnum()).upper()[:6] or "HR"
    yr = (emp.hire_date.year if emp.hire_date else date.today().year)
    return f"{raw_code}/HR/{emp.employee_no}/{yr}"


def ensure_letter_for_employee(emp, overrides=None, sync_category=False):
    overrides = overrides or {}
    comp = Company.query.first()
    letter = (
        EmploymentLetter.query.filter_by(employee_id=emp.id)
        .order_by(EmploymentLetter.id.desc())
        .first()
    )
    templates = get_merged_templates()
    cat_key = overrides.get("category_key") or (
        infer_category_key(emp) if (not letter or sync_category) else (letter.category_key or infer_category_key(emp))
    )
    if cat_key not in templates:
        cat_key = "permanent"
    tpl = templates[cat_key]
    sig_name, sig_title = _default_signatory()

    hire_dt = emp.hire_date or date.today()
    end_dt = overrides.get("end_date") or emp.end_date
    if not end_dt:
        active_contract = Contract.query.filter_by(employee_id=emp.id).order_by(Contract.id.desc()).first()
        if active_contract and active_contract.end_date:
            end_dt = active_contract.end_date
        elif tpl.get("duration_months"):
            end_dt = hire_dt + timedelta(days=30 * int(tpl["duration_months"]))

    if not letter:
        ref_base = overrides.get("reference_no") or default_reference_no(emp, comp)
        ref = ref_base
        suffix = 2
        while EmploymentLetter.query.filter_by(reference_no=ref).first():
            ref = f"{ref_base}-{suffix}"
            suffix += 1
        letter = EmploymentLetter(
            employee_id=emp.id,
            reference_no=ref,
            category_key=cat_key,
            staff_category=overrides.get("staff_category") or infer_staff_category(emp),
            issue_date=overrides.get("issue_date") or hire_dt,
            effective_date=overrides.get("effective_date") or hire_dt,
            end_date=end_dt,
            probation_months=overrides.get("probation_months") if overrides.get("probation_months") is not None else tpl.get("probation_months", 0),
            working_hours=overrides.get("working_hours") or tpl.get("working_hours"),
            notice_period=overrides.get("notice_period") or tpl.get("notice_period"),
            custom_clauses=overrides.get("custom_clauses") or tpl.get("extra_clause") or "",
            signatory_name=overrides.get("signatory_name") or sig_name,
            signatory_title=overrides.get("signatory_title") or sig_title,
            status="issued",
        )
        db.session.add(letter)
        db.session.flush()
    elif sync_category:
        if letter.category_key != cat_key:
            letter.category_key = cat_key
            letter.working_hours = tpl.get("working_hours")
            letter.notice_period = tpl.get("notice_period")
            letter.probation_months = tpl.get("probation_months", 0)
        letter.staff_category = infer_staff_category(emp)
        if emp.end_date:
            letter.end_date = emp.end_date
        elif tpl.get("duration_months") and not letter.end_date:
            letter.end_date = hire_dt + timedelta(days=30 * int(tpl["duration_months"]))
    return letter


def _fmt_date(d):
    if not d:
        return "—"
    if isinstance(d, str):
        try:
            d = date.fromisoformat(d[:10])
        except ValueError:
            return d
    return d.strftime("%d %B %Y")


def _fmt_money(amount, currency="GHS"):
    val = Decimal(str(amount or 0))
    return f"{currency} {val:,.2f}"


def _esc(s):
    return (
        str(s if s is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _format_rich_text(text, ctx):
    rendered = str(text or "")
    for k, v in ctx.items():
        rendered = rendered.replace("{{" + k + "}}", str(v if v is not None else ""))
    escaped = _esc(rendered)
    # Render **bold** markers cleanly
    parts = escaped.split("**")
    if len(parts) > 1:
        rebuilt = []
        for idx, part in enumerate(parts):
            rebuilt.append(f"<strong>{part}</strong>" if idx % 2 == 1 else part)
        escaped = "".join(rebuilt)
    return escaped.replace("\n", "<br>")


def build_letter_payload(emp, letter=None, standalone=False, auto_print=False):
    comp = Company.query.first()
    letter = letter or ensure_letter_for_employee(emp)
    templates = get_merged_templates()
    cat_key = letter.category_key if letter.category_key in templates else infer_category_key(emp)
    tpl = templates[cat_key]

    currency = (comp.currency if comp and comp.currency else "GHS") or "GHS"
    company_name = (comp.name if comp and comp.name else "Meridian HR").strip()
    company_legal = (comp.legal_name if comp and comp.legal_name else company_name).strip()
    company_tagline = (comp.tagline if comp and comp.tagline else "Human Resource Directorate").strip()
    company_address = (comp.address if comp and comp.address else f"{comp.city or 'Accra'}, {comp.country or 'Ghana'}").strip()
    company_phone = (comp.phone if comp and comp.phone else "").strip()
    company_email = (comp.email if comp and comp.email else "").strip()
    company_website = (comp.website if comp and comp.website else "").strip()
    logo_url = (comp.logo_url if comp and comp.logo_url else "").strip()

    designation = emp.designation.title if emp.designation else "Staff Member"
    department = emp.department.name if emp.department else "General Operations"
    grade_name = emp.grade.name if emp.grade else ""
    branch_name = emp.branch.name if emp.branch else (comp.location_name if comp and comp.location_name else "Head Office")
    work_loc = emp.work_location or "On-site"
    manager_name = (
        f"{emp.manager.full_name} ({emp.manager.designation.title})"
        if emp.manager and emp.manager.designation
        else (emp.manager.full_name if emp.manager else "the Managing Director / Head of Department")
    )
    staff_cat = letter.staff_category or infer_staff_category(emp)

    eff_date = letter.effective_date or emp.hire_date or date.today()
    issue_date = letter.issue_date or eff_date
    prob_months = letter.probation_months if letter.probation_months is not None else tpl.get("probation_months", 0)
    prob_end = emp.probation_end or (eff_date + timedelta(days=30 * int(prob_months)) if prob_months else None)
    end_dt = letter.end_date or emp.end_date or (
        eff_date + timedelta(days=30 * int(tpl["duration_months"])) if tpl.get("duration_months") else None
    )

    basic_dec = Decimal(str(emp.basic_salary or 0))
    struct_rows = SalaryStructure.query.filter_by(employee_id=emp.id).all()
    earnings = []
    for s in struct_rows:
        if s.component and s.component.kind == "earning":
            earnings.append((s.component.name, Decimal(str(s.amount or 0))))
    if not earnings:
        earnings = [("Basic Monthly Salary", basic_dec)]
    gross_dec = sum((amt for _, amt in earnings), Decimal("0"))
    if gross_dec <= 0:
        gross_dec = basic_dec

    annual_bal = (
        LeaveBalance.query.join(LeaveType, LeaveBalance.leave_type_id == LeaveType.id)
        .filter(LeaveBalance.employee_id == emp.id, LeaveType.code == "ANL")
        .first()
    )
    default_anl = LeaveType.query.filter_by(code="ANL").first()
    leave_days = int(Decimal(str(
        annual_bal.entitled if annual_bal else (default_anl.days_per_year if default_anl else 30)
    )))

    if emp.confirmation_date:
        probation_clause = (
            f"Your permanent appointment took effect on **{_fmt_date(eff_date)}**, and your probationary review "
            f"was satisfactorily confirmed on **{_fmt_date(emp.confirmation_date)}**."
        )
    elif prob_months and int(prob_months) > 0:
        probation_clause = (
            f"Your appointment takes effect on **{_fmt_date(eff_date)}** and is subject to an initial probationary "
            f"period of **{prob_months} month(s)** (review due on or around **{_fmt_date(prob_end)}**), during which "
            f"performance and suitability will be evaluated prior to written confirmation."
        )
    else:
        probation_clause = (
            f"Your appointment takes immediate effect from **{_fmt_date(eff_date)}** without an additional probationary period."
        )

    gross_clause = (
        f"total gross monthly package of **{_fmt_money(gross_dec, currency)}** inclusive of structured allowances"
        if gross_dec > basic_dec
        else f"equivalent to **{_fmt_money(basic_dec * 12, currency)}** per annum"
    )

    ctx = {
        "employee_name": emp.full_name,
        "first_name": emp.first_name,
        "last_name": emp.last_name,
        "employee_no": emp.employee_no,
        "designation": designation,
        "department": department,
        "staff_category": staff_cat,
        "category_label": tpl["label"],
        "grade": grade_name or "Standard",
        "grade_clause": f", Pay Grade {grade_name}" if grade_name else "",
        "branch": branch_name,
        "branch_location": f"{branch_name} ({work_loc})",
        "work_location": work_loc,
        "hire_date": _fmt_date(eff_date),
        "issue_date": _fmt_date(issue_date),
        "end_date": _fmt_date(end_dt) if end_dt else "Open-ended",
        "end_date_inline": f" through **{_fmt_date(end_dt)}**" if end_dt else "",
        "probation_months": str(prob_months or 0),
        "probation_end": _fmt_date(prob_end) if prob_end else "—",
        "probation_clause": probation_clause,
        "basic_salary": _fmt_money(basic_dec, currency),
        "gross_salary": _fmt_money(gross_dec, currency),
        "gross_clause": gross_clause,
        "currency": currency,
        "manager_name": manager_name,
        "company_name": company_name,
        "company_legal_name": company_legal,
        "company_address": company_address,
        "working_hours": letter.working_hours or tpl["working_hours"],
        "notice_period": letter.notice_period or tpl["notice_period"],
        "leave_days": str(leave_days),
        "reference_no": letter.reference_no,
    }

    title_text = _format_rich_text(letter.letter_title or tpl["letter_title"], ctx)
    subject_text = _format_rich_text(letter.subject_line or tpl["subject_line"], ctx)
    opening_html = _format_rich_text(tpl["opening"], ctx)
    closing_html = _format_rich_text(tpl["closing"], ctx)

    sections_html = []
    for idx, (heading, body_tpl) in enumerate(tpl["sections"]):
        sections_html.append(
            f'<div class="el-clause"><h4>{_esc(heading)}</h4><p>{_format_rich_text(body_tpl, ctx)}</p></div>'
        )
    custom_text = (letter.custom_clauses or "").strip()
    if custom_text:
        next_num = len(tpl["sections"]) + 1
        sections_html.append(
            f'<div class="el-clause"><h4>{next_num}. Special Terms &amp; Conditions</h4>'
            f'<p>{_format_rich_text(custom_text, ctx)}</p></div>'
        )

    comp_rows_html = "".join(
        f'<tr><td>{_esc(name)}</td><td style="text-align:right;font-family:ui-monospace,Menlo,monospace">{_esc(_fmt_money(amt, currency))}</td></tr>'
        for name, amt in earnings
    )
    if len(earnings) > 1:
        comp_rows_html += (
            f'<tr class="el-total-row"><td><strong>Total Monthly Gross Package</strong></td>'
            f'<td style="text-align:right;font-family:ui-monospace,Menlo,monospace"><strong>{_esc(_fmt_money(gross_dec, currency))}</strong></td></tr>'
        )

    summary_pairs = [
        ("Employee Name", f"{emp.full_name} ({emp.employee_no})"),
        ("Employment Category", tpl["label"]),
        ("Staff Category / Cadre", staff_cat),
        ("Job Title / Designation", designation),
        ("Department & Location", f"{department} · {branch_name}"),
        ("Pay Grade & Work Mode", f"{grade_name or 'Standard Band'} · {work_loc}"),
        ("Effective Start Date", _fmt_date(eff_date)),
        ("Contract End Date" if end_dt else "Reporting To", _fmt_date(end_dt) if end_dt else manager_name),
    ]
    summary_grid_html = "".join(
        f'<div class="el-meta-cell"><span class="k">{_esc(k)}</span><span class="v">{_esc(v)}</span></div>'
        for k, v in summary_pairs
    )

    initial = (company_name[:1] or "H").upper()
    if logo_url:
        crest_html = (
            f'<div class="el-crest"><img src="{_esc(logo_url)}" alt="{_esc(company_name)}" '
            f'onerror="this.remove();this.parentElement.textContent=\'{_esc(initial)}\'"></div>'
        )
    else:
        crest_html = f'<div class="el-crest">{_esc(initial)}</div>'

    contact_bits = [x for x in (company_address, company_phone, company_email, company_website) if x]

    sig_name = letter.signatory_name or _default_signatory()[0]
    sig_title = letter.signatory_title or _default_signatory()[1]
    emp_address_lines = "<br>".join(
        _esc(x) for x in [
            emp.full_name,
            emp.address or "",
            f"{emp.city}, {emp.nationality or 'Ghana'}" if emp.city else (emp.nationality or "Ghana"),
            emp.email or "",
            emp.phone or "",
        ] if x
    )

    if letter.status == "accepted" and letter.accepted_signature:
        emp_sig_inner = (
            f'<div class="el-signed-script">{_esc(letter.accepted_signature)}</div>'
            f'<div class="el-sig-line"></div>'
            f'<div><strong>{_esc(emp.full_name)}</strong></div>'
            f'<div class="el-muted">Accepted &amp; Digitally Signed on {_esc(_fmt_date(letter.accepted_at.date()) if letter.accepted_at else _fmt_date(date.today()))}</div>'
        )
    else:
        emp_sig_inner = (
            f'<div style="height:38px"></div>'
            f'<div class="el-sig-line"></div>'
            f'<div><strong>{_esc(emp.full_name)}</strong> ({_esc(emp.employee_no)})</div>'
            f'<div class="el-muted">Employee Signature &amp; Date: _______________________</div>'
        )

    sheet_css = """
    .el-sheet {
      background: #ffffff;
      color: #162321;
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      padding: 46px 52px;
      border: 1px solid #dfd9cd;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(16, 32, 31, 0.06);
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 13.5px;
      line-height: 1.65;
      position: relative;
      box-sizing: border-box;
    }
    .el-accent-bar {
      height: 5px;
      background: linear-gradient(90deg, #14312e 0%, #14312e 68%, #c2703d 68%, #c2703d 100%);
      border-radius: 4px;
      margin-bottom: 24px;
    }
    .el-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding-bottom: 18px;
      border-bottom: 2px solid #14312e;
    }
    .el-brand {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .el-crest {
      width: 54px;
      height: 54px;
      border-radius: 12px;
      background: #14312e;
      color: #f6efe4;
      font-family: 'Georgia', serif;
      font-size: 25px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
    }
    .el-crest img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .el-comp-name {
      font-size: 20px;
      font-weight: 700;
      color: #14312e;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .el-comp-sub {
      font-family: Inter, -apple-system, sans-serif;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #c2703d;
      font-weight: 600;
      margin-top: 3px;
    }
    .el-comp-contact {
      font-family: Inter, -apple-system, sans-serif;
      font-size: 11px;
      color: #5b6763;
      text-align: right;
      max-width: 270px;
      line-height: 1.45;
    }
    .el-ref-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin: 16px 0 20px;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 12px;
      color: #42504c;
    }
    .el-cat-badge {
      display: inline-block;
      background: #f5ece3;
      color: #9e5225;
      border: 1px solid #e6cdb7;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .el-recipient {
      margin-bottom: 18px;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 12.5px;
      line-height: 1.5;
      color: #1f2d2a;
    }
    .el-doc-title {
      text-align: center;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #14312e;
      background: #f7f5ef;
      border-top: 1px solid #ded8ca;
      border-bottom: 1px solid #ded8ca;
      padding: 9px 14px;
      margin: 16px 0 6px;
      text-transform: uppercase;
    }
    .el-subject {
      text-align: center;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: #4f5c58;
      margin-bottom: 18px;
    }
    .el-meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 18px;
      background: #faf9f5;
      border: 1px solid #e4dfd3;
      border-radius: 8px;
      padding: 13px 16px;
      margin: 16px 0 18px;
      font-family: Inter, -apple-system, sans-serif;
      box-sizing: border-box;
      width: 100%;
    }
    .el-meta-cell {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px dashed #e6e1d6;
      padding-bottom: 5px;
      font-size: 12px;
      min-width: 0;
    }
    .el-meta-cell .k { color: #687470; flex-shrink: 0; }
    .el-meta-cell .v { color: #142321; font-weight: 600; text-align: right; word-break: break-word; }
    .el-clause { margin: 14px 0; }
    .el-clause h4 {
      font-family: Inter, -apple-system, sans-serif;
      font-size: 12.5px;
      font-weight: 700;
      color: #14312e;
      margin: 0 0 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .el-clause p { margin: 0; text-align: justify; color: #24312e; }
    .el-comp-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 18px;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 12.5px;
    }
    .el-comp-table th {
      background: #14312e;
      color: #ffffff;
      text-align: left;
      padding: 7px 12px;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .el-comp-table td {
      padding: 7px 12px;
      border-bottom: 1px solid #e7e2d7;
    }
    .el-comp-table .el-total-row td {
      background: #faf8f2;
      border-top: 1.5px solid #14312e;
    }
    .el-sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid #ded8ca;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 12px;
      page-break-inside: avoid;
    }
    .el-sig-line {
      border-bottom: 1px solid #2b3936;
      margin-bottom: 7px;
    }
    .el-signed-script {
      font-family: 'Georgia', serif;
      font-style: italic;
      font-size: 19px;
      color: #14312e;
      height: 38px;
      display: flex;
      align-items: flex-end;
      padding-bottom: 3px;
    }
    .el-muted { color: #66736f; font-size: 11px; margin-top: 2px; }
    .el-footer-note {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #ece7dc;
      display: flex;
      justify-content: space-between;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 10.5px;
      color: #7c8783;
    }
    @media (max-width: 768px) {
      .el-sheet {
        padding: 22px 14px !important;
        font-size: 13px !important;
        line-height: 1.6 !important;
        border-radius: 8px !important;
        box-shadow: none !important;
        border: 1px solid #e6e0d4 !important;
      }
      .el-header {
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 12px !important;
        padding-bottom: 14px !important;
      }
      .el-brand {
        gap: 10px !important;
      }
      .el-crest {
        width: 44px !important;
        height: 44px !important;
        font-size: 20px !important;
      }
      .el-comp-name {
        font-size: 16px !important;
      }
      .el-comp-sub {
        font-size: 10px !important;
      }
      .el-comp-contact {
        text-align: left !important;
        font-size: 11px !important;
        max-width: 100% !important;
        line-height: 1.4 !important;
      }
      .el-ref-bar {
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 6px !important;
        font-size: 11.5px !important;
      }
      .el-cat-badge {
        font-size: 9.5px !important;
        padding: 2px 8px !important;
      }
      .el-doc-title {
        font-size: 13px !important;
        padding: 8px 10px !important;
        letter-spacing: 0.04em !important;
        line-height: 1.35 !important;
      }
      .el-subject {
        font-size: 11.5px !important;
        margin-bottom: 14px !important;
      }
      .el-meta-grid {
        grid-template-columns: 1fr !important;
        gap: 8px !important;
        padding: 12px 14px !important;
        margin: 14px 0 !important;
      }
      .el-meta-cell {
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 2px !important;
        padding-bottom: 6px !important;
      }
      .el-meta-cell .k {
        color: #687470 !important;
        font-size: 10.5px !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        font-weight: 500 !important;
      }
      .el-meta-cell .v {
        color: #142321 !important;
        font-weight: 600 !important;
        text-align: left !important;
        font-size: 12.5px !important;
        line-height: 1.35 !important;
      }
      .el-clause h4 {
        font-size: 11.5px !important;
      }
      .el-clause p {
        font-size: 12.5px !important;
        text-align: left !important;
        line-height: 1.55 !important;
      }
      .el-comp-table {
        display: table !important;
        width: 100% !important;
        font-size: 11.5px !important;
      }
      .el-comp-table th, .el-comp-table td {
        padding: 6px 8px !important;
      }
      .el-sig-grid {
        grid-template-columns: 1fr !important;
        gap: 24px !important;
        margin-top: 20px !important;
        padding-top: 14px !important;
      }
      .el-footer-note {
        flex-direction: column !important;
        gap: 4px !important;
        text-align: left !important;
        font-size: 9.5px !important;
      }
    }
    """

    sheet_html = f"""
    <div class="el-sheet letter-print-target" id="employment-letter-sheet">
      <div class="el-accent-bar"></div>
      <div class="el-header">
        <div class="el-brand">
          {crest_html}
          <div>
            <div class="el-comp-name">{_esc(company_legal)}</div>
            <div class="el-comp-sub">{_esc(company_name)} &middot; {_esc(company_tagline)}</div>
          </div>
        </div>
        <div class="el-comp-contact">
          {"<br>".join(_esc(x) for x in contact_bits)}
        </div>
      </div>

      <div class="el-ref-bar">
        <div><strong>Our Ref:</strong> <span style="font-family:ui-monospace,Menlo,monospace">{_esc(letter.reference_no)}</span> &nbsp;&middot;&nbsp; <strong>Date:</strong> {_esc(_fmt_date(issue_date))}</div>
        <span class="el-cat-badge">{_esc(tpl["badge"])} &middot; {_esc(staff_cat)}</span>
      </div>

      <div class="el-recipient">
        <div style="text-transform:uppercase;font-size:10px;letter-spacing:.1em;color:#7a8581;font-weight:700;margin-bottom:3px">Private &amp; Confidential — Addressed To</div>
        {emp_address_lines}
      </div>

      <div class="el-doc-title">{title_text}</div>
      <div class="el-subject">RE: {subject_text}</div>

      <p style="margin:0 0 12px">Dear <strong>{_esc(emp.first_name)}</strong>,</p>
      <p style="margin:0 0 14px;text-align:justify">{opening_html}</p>

      <div class="el-meta-grid">{summary_grid_html}</div>

      {"".join(sections_html)}

      <table class="el-comp-table">
        <thead>
          <tr><th>Remuneration Schedule ({_esc(tpl["label"])})</th><th style="text-align:right">Monthly Amount ({_esc(currency)})</th></tr>
        </thead>
        <tbody>
          {comp_rows_html}
        </tbody>
      </table>

      <p style="margin:12px 0 0;text-align:justify">{closing_html}</p>

      <div class="el-sig-grid">
        <div>
          <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:#687470;font-weight:700;margin-bottom:6px">For &amp; On Behalf Of {_esc(company_legal)}</div>
          <div class="el-signed-script">{_esc(sig_name)}</div>
          <div class="el-sig-line"></div>
          <div><strong>{_esc(sig_name)}</strong></div>
          <div class="el-muted">{_esc(sig_title)} &middot; {_esc(_fmt_date(issue_date))}</div>
        </div>
        <div>
          <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:#687470;font-weight:700;margin-bottom:6px">Employee Declaration &amp; Acceptance</div>
          {emp_sig_inner}
        </div>
      </div>

      <div class="el-footer-note">
        <span>Official HR Appointment Record &middot; Ref: {_esc(letter.reference_no)}</span>
        <span>{_esc(company_legal)} &middot; Confidential</span>
      </div>
    </div>
    """

    embedded_html = f"<style>{sheet_css}</style>{sheet_html}"

    if standalone:
        auto_script = "<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>" if auto_print else ""
        standalone_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{_esc(tpl["letter_title"])} — {_esc(emp.full_name)} ({_esc(emp.employee_no)})</title>
  <style>
    body {{ background: #f2efe8; margin: 0; padding: 28px 16px; }}
    .print-bar {{
      max-width: 820px; margin: 0 auto 16px; background: #14312e; color: #fff;
      padding: 12px 20px; border-radius: 10px; display: flex; justify-content: space-between;
      align-items: center; font-family: Inter, system-ui, sans-serif; font-size: 13px;
    }}
    .print-bar button {{
      background: #c2703d; color: #fff; border: 0; padding: 8px 16px; border-radius: 7px;
      font-weight: 600; cursor: pointer; font-size: 13px;
    }}
    {sheet_css}
    @media print {{
      @page {{ size: A4; margin: 12mm; }}
      body {{ background: #fff !important; padding: 0 !important; }}
      .print-bar {{ display: none !important; }}
      .el-sheet {{ border: 0 !important; box-shadow: none !important; padding: 8px 12px !important; max-width: 100% !important; }}
    }}
  </style>
</head>
<body>
  <div class="print-bar">
    <div><strong>{_esc(emp.full_name)}</strong> &middot; {_esc(tpl["label"])} ({_esc(letter.reference_no)})</div>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  {sheet_html}
  {auto_script}
</body>
</html>"""
    else:
        standalone_html = None

    return {
        "id": letter.id,
        "employee_id": emp.id,
        "employee_no": emp.employee_no,
        "employee_name": emp.full_name,
        "employee_email": emp.email,
        "department_name": department,
        "designation_title": designation,
        "grade_name": grade_name,
        "branch_name": branch_name,
        "reference_no": letter.reference_no,
        "category_key": cat_key,
        "category_label": tpl["label"],
        "category_badge": tpl["badge"],
        "category_tone": tpl["tone"],
        "staff_category": staff_cat,
        "letter_title": letter.letter_title or tpl["letter_title"],
        "subject_line": letter.subject_line or tpl["subject_line"],
        "issue_date": issue_date.isoformat() if issue_date else None,
        "effective_date": eff_date.isoformat() if eff_date else None,
        "end_date": end_dt.isoformat() if end_dt else None,
        "probation_months": prob_months,
        "working_hours": letter.working_hours or tpl["working_hours"],
        "notice_period": letter.notice_period or tpl["notice_period"],
        "custom_clauses": letter.custom_clauses or "",
        "signatory_name": sig_name,
        "signatory_title": sig_title,
        "basic_salary": float(basic_dec),
        "gross_salary": float(gross_dec),
        "currency": currency,
        "status": letter.status or "issued",
        "accepted_at": letter.accepted_at.isoformat(timespec="seconds") if letter.accepted_at else None,
        "accepted_signature": letter.accepted_signature,
        "emailed_at": letter.emailed_at.isoformat(timespec="seconds") if letter.emailed_at else None,
        "html": embedded_html,
        "standalone_html": standalone_html,
    }
