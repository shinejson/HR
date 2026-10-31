"""
Meridian Ghana Ltd / Airport West Hotel
Official Employees' Leave Request Form Generator (PDF & Interactive Preview)
Dynamically reads:
 - Company logo from uploaded company logo / branding
 - Company address, email, website, phone, and FAX from Superadmin Company Settings
 - Accurate calculation of leave days already taken by the employee
 - Resumption date (editable and set from the form)
 - Multi-level management signatures (HoD, Accountant, Managing Director)
"""

import os
import io
import html
from datetime import datetime, date, timedelta

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from models import db, LeaveRequest, Company, Employee, LeaveBalance, Department, DepartmentHead


def resolve_form_approvers(lr):
    """Resolve HoD (department-mapped), Accountant (fixed), and MD (fixed) for a leave request."""
    emp = lr.employee

    # MD (fixed organization-wide)
    md_emp = lr.md_approver or (emp.md if emp else None)
    if not md_emp:
        dh_md = DepartmentHead.query.filter_by(role_type="md", status="active").first()
        if dh_md and dh_md.employee and not dh_md.employee.deleted_at:
            md_emp = dh_md.employee
        elif emp:
            md_emp = Employee.query.filter(Employee.deleted_at.is_(None)).order_by(Employee.id.asc()).first()

    # Accountant (fixed organization-wide)
    acc_emp = lr.accountant_approver or (emp.accountant if emp else None)
    if not acc_emp:
        dh_acc = DepartmentHead.query.filter(DepartmentHead.role_type == "accountant", DepartmentHead.status == "active").first()
        if dh_acc and dh_acc.employee and not dh_acc.employee.deleted_at:
            acc_emp = dh_acc.employee
        else:
            acc_cand = (Employee.query.filter(Employee.deleted_at.is_(None), Employee.status.in_(["active", "probation"]))
                        .join(Department, Employee.department_id == Department.id)
                        .filter(Department.name.ilike("%finance%"))
                        .order_by(Employee.id.asc()).first())
            acc_emp = acc_cand or db.session.get(Employee, 4)

    # HoD (mapped dynamically to employee's department head)
    hod_emp = lr.hod_approver or (emp.hod if emp else None)
    if not hod_emp and emp:
        if emp.department_id:
            dh = DepartmentHead.query.filter_by(department_id=emp.department_id, role_type="head", status="active").first()
            if dh and dh.employee and not dh.employee.deleted_at:
                hod_emp = dh.employee if dh.employee_id != emp.id else md_emp
            else:
                dept = emp.department or db.session.get(Department, emp.department_id)
                if dept and dept.head_id:
                    head = db.session.get(Employee, dept.head_id)
                    if head and not head.deleted_at:
                        hod_emp = head if head.id != emp.id else md_emp
        if not hod_emp:
            hod_emp = emp.manager if emp.manager and not emp.manager.deleted_at and emp.manager_id != emp.id else md_emp

    return hod_emp, acc_emp, md_emp


def _esc(val):
    return html.escape(str(val)) if val is not None else ""


def _fmt_date(d):
    if not d:
        return "—"
    if isinstance(d, datetime):
        d = d.date()
    return d.strftime("%d/%m/%Y")


def categorize_leave_type(lr):
    name = (lr.leave_type.name if lr.leave_type else "").lower()
    code = (lr.leave_type.code if lr.leave_type else "").upper()
    return {
        "annual": "annual" in name or code == "ANL",
        "maternity": "maternity" in name or code == "MAT",
        "sick_self": ("sick" in name or code == "SCK") and ("family" not in name),
        "funeral": "funeral" in name or "bereav" in name or code == "BER",
        "sick_family": "family" in name or code == "SCK-FAM",
        "paternity": "paternity" in name or code == "PAT",
    }


def get_dynamic_leave_metrics(lr):
    """
    Computes leave already taken and resumption date if not stored on the request.
    """
    # 1. Leave already taken
    taken = float(lr.leave_already_taken or 0)
    if taken <= 0 and lr.start_date:
        yr = lr.start_date.year
        prior_approved = LeaveRequest.query.filter(
            LeaveRequest.employee_id == lr.employee_id,
            LeaveRequest.status == "approved",
            LeaveRequest.id != lr.id,
            db.func.extract("year", LeaveRequest.start_date) == yr
        ).all()
        calc_taken = sum(float(r.days or 0) for r in prior_approved)
        if calc_taken > 0:
            taken = calc_taken
        else:
            bal = LeaveBalance.query.filter_by(
                employee_id=lr.employee_id,
                leave_type_id=lr.leave_type_id,
                year=yr
            ).first()
            if bal and float(bal.taken or 0) > 0:
                taken = float(bal.taken)
    
    # 2. Resumption date
    resumption = lr.resumption_date
    if not resumption and lr.end_date:
        next_day = lr.end_date + timedelta(days=1)
        while next_day.weekday() >= 5: # Saturday or Sunday
            next_day += timedelta(days=1)
        resumption = next_day
    
    return taken, resumption


def get_company_contact_details():
    comp = Company.query.first()
    addr = (comp.address if comp and comp.address else "P.O. Box KIA 30675 Airport Accra, Ghana.").strip()
    email = (comp.email if comp and comp.email else "info@airportwesthotel.com").strip()
    web = (comp.website if comp and comp.website else "www.airportwesthotel.com").strip()
    phone = (comp.phone if comp and comp.phone else "+2330302771388/769104/767870/0244358042.").strip()
    fax = (getattr(comp, "fax", None) or "+2330302765667").strip()
    
    logo_file = None
    if comp and comp.logo_url:
        cand = comp.logo_url.lstrip("/")
        if os.path.exists(cand):
            logo_file = cand
    if not logo_file:
        fallback = r"uploads/branding/airport_west_hotel_logo.png"
        if os.path.exists(fallback):
            logo_file = fallback
            
    logo_web_url = comp.logo_url if comp and comp.logo_url else "/uploads/branding/airport_west_hotel_logo.png"
    
    return {
        "address": addr,
        "email": email,
        "website": web,
        "phone": phone,
        "fax": fax,
        "logo_file": logo_file,
        "logo_web_url": logo_web_url,
    }


def build_leave_form_html(lr, standalone=False):
    emp = lr.employee
    cats = categorize_leave_type(lr)
    is_other = not any(cats.values())
    c_info = get_company_contact_details()
    taken_days, resumption_date = get_dynamic_leave_metrics(lr)

    # Format taken days cleanly (e.g. 5 instead of 5.0)
    taken_display = int(taken_days) if taken_days == int(taken_days) else taken_days

    # Approvers resolution (dynamically mapped HoD and fixed Accountant & MD)
    target_hod, target_acc, target_md = resolve_form_approvers(lr)

    # Signatures
    def sig_html(approver_emp, sig_str, date_val, target_emp=None):
        date_str = _fmt_date(date_val)
        sig_markup = ""
        if date_val:
            if approver_emp and approver_emp.signature_url:
                sig_markup = f'<img src="{_esc(approver_emp.signature_url)}" style="max-height:36px;max-width:160px;object-fit:contain;vertical-align:bottom">'
            elif sig_str:
                sig_markup = f'<span style="font-family:\'Brush Script MT\',cursive;font-size:20px;color:#14312e">{_esc(sig_str)}</span>'
            elif approver_emp:
                sig_markup = f'<span style="font-weight:600;font-size:12px">{_esc(approver_emp.full_name)}</span>'
            else:
                sig_markup = '<span style="color:#0f766e;font-weight:600;font-size:12px">Approved</span>'
        else:
            if target_emp:
                sig_markup = f'<span style="color:#475569;font-size:12px">Pending Approval &mdash; <strong>{_esc(target_emp.full_name)}</strong></span>'
            else:
                sig_markup = '<span style="color:#94a3b8;font-style:italic">Pending Approval</span>'
            date_str = '<span style="color:#94a3b8">&mdash;</span>'
        return sig_markup, date_str

    emp_sig_markup = ""
    if emp.signature_url:
        emp_sig_markup = f'<img src="{_esc(emp.signature_url)}" style="max-height:34px;max-width:160px;object-fit:contain;vertical-align:bottom">'
    elif lr.employee_signature:
        emp_sig_markup = f'<span style="font-family:\'Brush Script MT\',cursive;font-size:20px;color:#14312e">{_esc(lr.employee_signature)}</span>'
    else:
        emp_sig_markup = f'<span style="font-weight:600">{_esc(emp.full_name)}</span>'

    hod_sig, hod_date = sig_html(lr.hod_approver, lr.hod_signature, lr.hod_approved_at, target_hod)
    acc_sig, acc_date = sig_html(lr.accountant_approver, lr.accountant_signature, lr.accountant_approved_at, target_acc)
    md_sig, md_date = sig_html(lr.md_approver, lr.md_signature, lr.md_approved_at, target_md)

    def chk(flag):
        return '<span class="lf-chk lf-chk-on">☑</span>' if flag else '<span class="lf-chk">☐</span>'

    other_text = ""
    if is_other:
        other_text = f"{lr.leave_type.name or 'Other'} — {lr.reason or ''}".strip(" —")
    elif lr.reason:
        other_text = lr.reason

    sheet_css = """
    .lf-sheet {
      position: relative;
      background: #ffffff;
      color: #111111;
      width: 100%;
      max-width: 780px;
      min-height: 1040px;
      margin: 0 auto;
      padding: 34px 38px 26px;
      border: 1px solid #d5cec2;
      border-radius: 8px;
      box-shadow: 0 8px 26px rgba(16, 32, 31, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .lf-body-content {
      flex: 1 0 auto;
    }
    .lf-header {
      text-align: center;
      margin-bottom: 12px;
    }
    .lf-logo {
      max-height: 72px;
      max-width: 230px;
      object-fit: contain;
      margin: 0 auto 6px;
      display: block;
    }
    .lf-box {
      border: 1.6px solid #111111;
      text-align: center;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 5px 8px;
      margin: 12px 0 10px;
      font-size: 13.5px;
      background: #fafafa;
    }
    .lf-box.sub {
      font-size: 11.5px;
      padding: 4px 6px;
      margin: 14px 0 8px;
    }
    .lf-row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 7px;
    }
    .lf-field {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex: 1;
      min-width: 0;
    }
    .lf-field .k {
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      white-space: nowrap;
      color: #111;
    }
    .lf-field .v {
      flex: 1;
      border-bottom: 1px solid #111;
      padding: 0 4px 1px;
      min-height: 19px;
      font-size: 12.5px;
      color: #142321;
      word-break: break-word;
    }
    .lf-chk-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 28px;
      margin: 6px 0;
      padding: 0 6px;
    }
    .lf-chk-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
    }
    .lf-chk {
      font-size: 17px;
      line-height: 1;
      color: #333;
    }
    .lf-chk-on {
      color: #0c5f59;
      font-weight: bold;
    }
    .lf-approvals {
      margin-top: 4px;
    }
    .lf-approv-head {
      font-weight: 700;
      font-size: 11.5px;
      margin-bottom: 6px;
    }
    .lf-approv-row {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      margin-bottom: 6px;
      padding-left: 10px;
    }
    .lf-approv-role {
      width: 170px;
      font-weight: 600;
      font-size: 11.5px;
      color: #222;
    }
    .lf-approv-sig {
      flex: 1;
      border-bottom: 1px solid #111;
      min-height: 30px;
      padding-bottom: 2px;
      display: flex;
      align-items: flex-end;
    }
    .lf-approv-date-lbl {
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      margin-left: 8px;
    }
    .lf-approv-date-val {
      width: 110px;
      border-bottom: 1px solid #111;
      text-align: center;
      font-size: 12px;
      padding-bottom: 2px;
    }
    .lf-footer {
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px dashed #d5cec2;
      text-align: center;
      font-style: italic;
      font-size: 10.5px;
      line-height: 1.55;
      color: #222222;
    }
    @media (max-width: 680px) {
      .lf-sheet {
        padding: 18px 12px 18px !important;
        font-size: 12px !important;
        border-radius: 6px !important;
        min-height: auto !important;
      }
      .lf-footer {
        margin-top: 24px !important;
      }
      .lf-row {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 6px !important;
      }
      .lf-chk-grid {
        grid-template-columns: 1fr !important;
        gap: 4px !important;
      }
      .lf-approv-row {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 4px !important;
        padding-left: 0 !important;
      }
      .lf-approv-role { width: 100% !important; }
      .lf-approv-date-val { width: 100% !important; }
    }
    """

    body_html = f"""
    <div class="lf-sheet" id="leave-request-form-sheet">
      <div class="lf-body-content">
        <div class="lf-header">
        <img class="lf-logo" src="{_esc(c_info['logo_web_url'])}" alt="Airport West Hotel">
      </div>

      <div class="lf-box">EMPLOYEES' LEAVE REQUEST FORM</div>

      <div class="lf-row">
        <div class="lf-field" style="flex:1.6">
          <span class="k">EMPLOYEE'S NAME</span>
          <span class="v"><b>{_esc(emp.full_name)}</b> <span style="font-size:11px;color:#666">({_esc(emp.employee_no)})</span></span>
        </div>
        <div class="lf-field" style="flex:0.9">
          <span class="k">DATE</span>
          <span class="v">{_fmt_date(lr.created_at)}</span>
        </div>
      </div>

      <div class="lf-row">
        <div class="lf-field" style="flex:1.4">
          <span class="k">DEPARTMENT</span>
          <span class="v">{_esc(emp.department.name if emp.department else '—')}</span>
        </div>
        <div class="lf-field" style="flex:1.1">
          <span class="k">POSITION</span>
          <span class="v">{_esc(emp.designation.title if emp.designation else '—')}</span>
        </div>
      </div>

      <div class="lf-box sub">REASON FOR LEAVE</div>

      <div class="lf-chk-grid">
        <div class="lf-chk-item">{chk(cats["annual"])} <span>Annual Leave</span></div>
        <div class="lf-chk-item">{chk(cats["maternity"])} <span>Maternity Leave</span></div>
        <div class="lf-chk-item">{chk(cats["sick_self"])} <span>Sick-Self Leave</span></div>
        <div class="lf-chk-item">{chk(cats["funeral"])} <span>Funeral- Relationship Leave</span></div>
        <div class="lf-chk-item">{chk(cats["sick_family"])} <span>Sick-Family Leave</span></div>
        <div class="lf-chk-item">{chk(cats["paternity"])} <span>Paternity Leave</span></div>
      </div>

      <div class="lf-row" style="margin-top:6px">
        <div class="lf-field">
          <span class="k">If others, state briefly</span>
          <span class="v">{_esc(other_text)}</span>
        </div>
      </div>

      <div class="lf-box sub">LEAVE REQUESTED</div>

      <div class="lf-row">
        <div class="lf-field">
          <span class="k">From</span>
          <span class="v">{_fmt_date(lr.start_date)}</span>
        </div>
        <div class="lf-field">
          <span class="k">To</span>
          <span class="v">{_fmt_date(lr.end_date)}</span>
        </div>
        <div class="lf-field">
          <span class="k">No. of Days Requested</span>
          <span class="v"><b>{lr.days or 0}</b></span>
        </div>
      </div>

      <div class="lf-row">
        <div class="lf-field" style="flex:1.2">
          <span class="k">Date Employed</span>
          <span class="v">{_fmt_date(emp.hire_date)}</span>
        </div>
        <div class="lf-field" style="flex:1.8">
          <span class="k">No. of leave already taken</span>
          <span class="v"><b>{taken_display}</b> days</span>
        </div>
      </div>

      <div class="lf-row">
        <div class="lf-field">
          <span class="k">Resumption Date</span>
          <span class="v"><b>{_fmt_date(resumption_date)}</b></span>
        </div>
      </div>

      <div class="lf-row">
        <div class="lf-field" style="flex:1.7">
          <span class="k">Employee signature</span>
          <span class="v">{emp_sig_markup}</span>
        </div>
        <div class="lf-field" style="flex:0.8">
          <span class="k">Date</span>
          <span class="v">{_fmt_date(lr.created_at)}</span>
        </div>
      </div>

      <div class="lf-box sub">ORGANISATION USE ONLY</div>

      <div class="lf-approvals">
        <div class="lf-approv-head">Approved by :</div>

        <div class="lf-approv-row">
          <div class="lf-approv-role">Head of Department</div>
          <div class="lf-approv-sig">{hod_sig}</div>
          <div class="lf-approv-date-lbl">Date</div>
          <div class="lf-approv-date-val">{hod_date}</div>
        </div>

        <div class="lf-approv-row">
          <div class="lf-approv-role">Accountant</div>
          <div class="lf-approv-sig">{acc_sig}</div>
          <div class="lf-approv-date-lbl">Date</div>
          <div class="lf-approv-date-val">{acc_date}</div>
        </div>

        <div class="lf-approv-row">
          <div class="lf-approv-role">Managing Director</div>
          <div class="lf-approv-sig">{md_sig}</div>
          <div class="lf-approv-date-lbl">Date</div>
          <div class="lf-approv-date-val">{md_date}</div>
        </div>
      </div>
      </div>

      <div class="lf-footer">
        <div><strong>Address:</strong> {_esc(c_info['address'])}</div>
        <div><strong>E-mail:</strong> {_esc(c_info['email'])} &nbsp;&middot;&nbsp; <strong>website:</strong> {_esc(c_info['website'])}</div>
        <div><strong>Telephone:</strong> {_esc(c_info['phone'])} &nbsp;&middot;&nbsp; <strong>FAX:</strong> {_esc(c_info['fax'])}</div>
      </div>
    </div>
    """

    if standalone:
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Leave Request Form — {_esc(emp.full_name)}</title>
  <style>
    body {{ background: #f0ece3; margin: 0; padding: 24px 14px; font-family: sans-serif; }}
    .lf-print-bar {{
      max-width: 780px; margin: 0 auto 16px; background: #14312e; color: #fff;
      padding: 10px 18px; border-radius: 8px; display: flex; justify-content: space-between;
      align-items: center; font-size: 13px;
    }}
    .lf-print-bar button {{
      border: 0; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; margin-left: 8px;
    }}
    .btn-act {{ background: #c2703d; color: #fff; }}
    .btn-act:hover {{ background: #ad5f30; }}
    .btn-gho {{ background: rgba(255,255,255,.15); color: #fff; }}
    {sheet_css}
    @media print {{
      @page {{
        size: A4 portrait;
        margin: 10mm 12mm 10mm 12mm;
      }}
      html, body {{
        background: #fff !important;
        padding: 0 !important;
        margin: 0 !important;
        height: 100% !important;
      }}
      .lf-print-bar {{ display: none !important; }}
      .lf-sheet {{
        border: 0 !important;
        box-shadow: none !important;
        padding: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        min-height: calc(297mm - 20mm) !important;
        height: calc(297mm - 20mm) !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        page-break-inside: avoid !important;
        box-sizing: border-box !important;
      }}
      .lf-footer {{
        margin-top: auto !important;
        padding-top: 8px !important;
        padding-bottom: 2mm !important;
      }}
    }}
  </style>
</head>
<body>
  <div class="lf-print-bar">
    <div><strong>EMPLOYEES' LEAVE REQUEST FORM</strong> &middot; {_esc(emp.full_name)} ({_esc(lr.status.upper())})</div>
    <div>
      <button class="btn-gho" onclick="window.close()">Close Window</button>
      <button class="btn-act" onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>
  {body_html}
</body>
</html>"""

    return f"<style>{sheet_css}</style>{body_html}"


def build_leave_form_pdf(lr):
    """
    Generates single-page official ReportLab PDF matching the physical paper form.
    Uses dynamic company logo, dynamic address block, dynamic leave days taken and resumption date.
    """
    emp = lr.employee
    cats = categorize_leave_type(lr)
    is_other = not any(cats.values())
    c_info = get_company_contact_details()
    taken_days, resumption_date = get_dynamic_leave_metrics(lr)

    taken_display = int(taken_days) if taken_days == int(taken_days) else taken_days

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.35 * inch,
        bottomMargin=0.35 * inch,
    )

    elements = []
    styles = getSampleStyleSheet()

    # 1. Top Logo (Dynamic from Company Branding Upload)
    logo_file = c_info["logo_file"]
    if logo_file and os.path.exists(logo_file):
        try:
            img = Image(logo_file, width=2.35 * inch, height=0.96 * inch, kind="proportional")
            img.hAlign = "CENTER"
            elements.append(img)
            elements.append(Spacer(1, 0.1 * inch))
        except Exception:
            pass

    def make_box(text, font_size=11, height=21):
        p = Paragraph(
            f"<b>{text}</b>",
            ParagraphStyle(
                "BoxText",
                fontName="Helvetica-Bold",
                fontSize=font_size,
                alignment=TA_CENTER,
                textColor=colors.black,
            ),
        )
        t = Table([[p]], colWidths=[7.15 * inch], rowHeights=[height])
        t.setStyle(
            TableStyle([
                ("BOX", (0, 0), (-1, -1), 1.2, colors.black),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ])
        )
        return t

    lbl_style = ParagraphStyle("Lbl", fontName="Helvetica-Bold", fontSize=9, textColor=colors.black)
    val_style = ParagraphStyle("Val", fontName="Helvetica", fontSize=9.5, textColor=colors.black)
    chk_lbl = ParagraphStyle("ChkLbl", fontName="Helvetica", fontSize=9, textColor=colors.black)

    # 2. Main Title Box
    elements.append(make_box("EMPLOYEES' LEAVE REQUEST FORM", font_size=12, height=23))
    elements.append(Spacer(1, 0.1 * inch))

    # 3. Employee Information
    emp_info_data = [
        [
            Paragraph("<b>EMPLOYEE'S NAME</b>", lbl_style),
            Paragraph(f"{emp.full_name or '—'} ({emp.employee_no or ''})", val_style),
            Paragraph("<b>DATE</b>", lbl_style),
            Paragraph(_fmt_date(lr.created_at), val_style),
        ],
        [
            Paragraph("<b>DEPARTMENT</b>", lbl_style),
            Paragraph(emp.department.name if emp.department else "—", val_style),
            Paragraph("<b>POSITION</b>", lbl_style),
            Paragraph(emp.designation.title if emp.designation else "—", val_style),
        ],
    ]
    emp_table = Table(emp_info_data, colWidths=[1.5 * inch, 2.9 * inch, 0.85 * inch, 1.9 * inch])
    emp_table.setStyle(
        TableStyle([
            ("LINEBELOW", (1, 0), (1, 0), 0.8, colors.black),
            ("LINEBELOW", (3, 0), (3, 0), 0.8, colors.black),
            ("LINEBELOW", (1, 1), (1, 1), 0.8, colors.black),
            ("LINEBELOW", (3, 1), (3, 1), 0.8, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    elements.append(emp_table)
    elements.append(Spacer(1, 0.12 * inch))

    # 4. Reason For Leave Section
    elements.append(make_box("REASON FOR LEAVE", font_size=10.5, height=19))
    elements.append(Spacer(1, 0.08 * inch))

    def chk_box(checked):
        mark = "<b>[ ✓ ]</b>" if checked else "[   ]"
        return Paragraph(
            mark,
            ParagraphStyle(
                "Chk",
                fontName="Helvetica",
                fontSize=10,
                textColor=colors.HexColor("#0c4e40") if checked else colors.black,
            ),
        )

    chk_data = [
        [chk_box(cats["annual"]), Paragraph("Annual Leave", chk_lbl),
         chk_box(cats["maternity"]), Paragraph("Maternity Leave", chk_lbl)],
        [chk_box(cats["sick_self"]), Paragraph("Sick-Self Leave", chk_lbl),
         chk_box(cats["funeral"]), Paragraph("Funeral- Relationship Leave", chk_lbl)],
        [chk_box(cats["sick_family"]), Paragraph("Sick-Family Leave", chk_lbl),
         chk_box(cats["paternity"]), Paragraph("Paternity Leave", chk_lbl)],
    ]
    chk_table = Table(chk_data, colWidths=[0.35 * inch, 3.2 * inch, 0.35 * inch, 3.25 * inch])
    chk_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ])
    )
    elements.append(chk_table)

    other_text = lr.reason if (is_other or lr.reason) else ""
    if is_other and lr.leave_type:
        other_text = f"{lr.leave_type.name}: {other_text}" if other_text else lr.leave_type.name

    other_data = [
        [
            Paragraph("If others, state briefly", ParagraphStyle("Oth", fontName="Helvetica", fontSize=9)),
            Paragraph(other_text or "", val_style),
        ]
    ]
    other_table = Table(other_data, colWidths=[1.5 * inch, 5.65 * inch])
    other_table.setStyle(
        TableStyle([
            ("LINEBELOW", (1, 0), (1, 0), 0.8, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    elements.append(other_table)
    elements.append(Spacer(1, 0.12 * inch))

    # 5. Leave Requested Section
    elements.append(make_box("LEAVE REQUESTED", font_size=10.5, height=19))
    elements.append(Spacer(1, 0.08 * inch))

    emp_sig = None
    if emp.signature_url:
        sig_path = emp.signature_url.lstrip("/")
        if os.path.exists(sig_path):
            try:
                emp_sig = Image(sig_path, width=1.6 * inch, height=0.45 * inch, kind="proportional")
            except Exception:
                pass
    if not emp_sig:
        emp_sig = Paragraph(lr.employee_signature or emp.full_name or "—", val_style)

    lr_data = [
        [
            Paragraph("From", lbl_style), Paragraph(_fmt_date(lr.start_date), val_style),
            Paragraph("To", lbl_style), Paragraph(_fmt_date(lr.end_date), val_style),
            Paragraph("No. of Days Requested", lbl_style), Paragraph(str(lr.days or 0), val_style),
        ],
        [
            Paragraph("Date Employed", lbl_style), Paragraph(_fmt_date(emp.hire_date), val_style),
            Paragraph("", lbl_style), Paragraph("", val_style),
            Paragraph("No. of leave already taken", lbl_style), Paragraph(str(taken_display), val_style),
        ],
        [
            Paragraph("Resumption Date", lbl_style), Paragraph(_fmt_date(resumption_date), val_style),
            Paragraph("", lbl_style), Paragraph("", val_style),
            Paragraph("", lbl_style), Paragraph("", val_style),
        ],
        [
            Paragraph("Employee signature", lbl_style), emp_sig,
            Paragraph("Date", lbl_style), Paragraph(_fmt_date(lr.created_at), val_style),
            Paragraph("", lbl_style), Paragraph("", val_style),
        ],
    ]
    lr_table = Table(lr_data, colWidths=[1.4 * inch, 1.5 * inch, 0.4 * inch, 1.3 * inch, 1.7 * inch, 0.85 * inch])
    lr_table.setStyle(
        TableStyle([
            ("LINEBELOW", (1, 0), (1, 0), 0.8, colors.black),
            ("LINEBELOW", (3, 0), (3, 0), 0.8, colors.black),
            ("LINEBELOW", (5, 0), (5, 0), 0.8, colors.black),
            ("LINEBELOW", (1, 1), (1, 1), 0.8, colors.black),
            ("LINEBELOW", (5, 1), (5, 1), 0.8, colors.black),
            ("LINEBELOW", (1, 2), (1, 2), 0.8, colors.black),
            ("LINEBELOW", (1, 3), (1, 3), 0.8, colors.black),
            ("LINEBELOW", (3, 3), (3, 3), 0.8, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ])
    )
    elements.append(lr_table)
    elements.append(Spacer(1, 0.12 * inch))

    # 6. Management Use Only Section
    elements.append(make_box("ORGANISATION USE ONLY", font_size=10.5, height=19))
    elements.append(Spacer(1, 0.08 * inch))

    target_hod, target_acc, target_md = resolve_form_approvers(lr)

    def get_sig_flowable(approver_emp, sig_str, date_val, target_emp):
        if date_val:
            if approver_emp and approver_emp.signature_url:
                spath = approver_emp.signature_url.lstrip("/")
                if os.path.exists(spath):
                    try:
                        return Image(spath, width=1.6 * inch, height=0.4 * inch, kind="proportional")
                    except Exception:
                        pass
            if sig_str:
                return Paragraph(f"<i>{sig_str}</i>", val_style)
            if approver_emp:
                return Paragraph(approver_emp.full_name, val_style)
            return Paragraph("Approved", val_style)
        else:
            if target_emp:
                return Paragraph(f'<font color="#475569" size="8">Pending Approval &mdash; <b>{target_emp.full_name}</b></font>', val_style)
            return Paragraph('<font color="#94a3b8"><i>Pending Approval</i></font>', val_style)

    mgmt_data = [
        [Paragraph("<b>Approved by :</b>", lbl_style), Paragraph("", val_style), Paragraph("<b>Date</b>", lbl_style), Paragraph("", val_style)],
        [Paragraph("Head of Department", lbl_style), get_sig_flowable(lr.hod_approver, lr.hod_signature, lr.hod_approved_at, target_hod), Paragraph("", lbl_style), Paragraph(_fmt_date(lr.hod_approved_at), val_style)],
        [Paragraph("Accountant", lbl_style), get_sig_flowable(lr.accountant_approver, lr.accountant_signature, lr.accountant_approved_at, target_acc), Paragraph("", lbl_style), Paragraph(_fmt_date(lr.accountant_approved_at), val_style)],
        [Paragraph("Managing Director", lbl_style), get_sig_flowable(lr.md_approver, lr.md_signature, lr.md_approved_at, target_md), Paragraph("", lbl_style), Paragraph(_fmt_date(lr.md_approved_at), val_style)],
    ]
    mgmt_table = Table(mgmt_data, colWidths=[1.6 * inch, 3.1 * inch, 0.65 * inch, 1.8 * inch])
    mgmt_table.setStyle(
        TableStyle([
            ("LINEBELOW", (1, 1), (1, 1), 0.8, colors.black),
            ("LINEBELOW", (3, 1), (3, 1), 0.8, colors.black),
            ("LINEBELOW", (1, 2), (1, 2), 0.8, colors.black),
            ("LINEBELOW", (3, 2), (3, 2), 0.8, colors.black),
            ("LINEBELOW", (1, 3), (1, 3), 0.8, colors.black),
            ("LINEBELOW", (3, 3), (3, 3), 0.8, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ])
    )
    elements.append(mgmt_table)
    elements.append(Spacer(1, 0.18 * inch))

    # 7. Official Bottom Address Block pinned to bottom of A4 page via canvas callback
    def draw_footer(canvas, document):
        canvas.saveState()
        # Dashed separator line across the printable width
        canvas.setStrokeColor(colors.HexColor("#d5cec2"))
        canvas.setLineWidth(0.7)
        canvas.setDash(3, 3)
        canvas.line(document.leftMargin, 66, A4[0] - document.rightMargin, 66)

        # Centered 3-line official contact block pinned to page bottom
        canvas.setFillColor(colors.HexColor("#222222"))
        canvas.setFont("Helvetica-BoldOblique", 8.2)
        canvas.drawCentredString(A4[0] / 2.0, 52, f"Address: {c_info['address']}")

        canvas.setFont("Helvetica-Oblique", 8.0)
        canvas.drawCentredString(A4[0] / 2.0, 39, f"E-mail: {c_info['email']}   ·   website: {c_info['website']}")
        canvas.drawCentredString(A4[0] / 2.0, 26, f"Telephone: {c_info['phone']}   ·   FAX: {c_info['fax']}")
        canvas.restoreState()

    doc.bottomMargin = 0.95 * inch
    doc.build(elements, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return buffer.getvalue()
