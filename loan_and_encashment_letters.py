"""
Standard Official Letters Generator for:
1. Staff Loan & Salary Advance Approval & Agreement Letters
2. Leave Encashment / Sale Approval & Deduction Letters

Supports:
- Interactive in-app HTML preview
- Standalone printable HTML page (matching company branding & header)
- Downloadable official single-page/multi-page PDF via ReportLab
"""

import os
import io
import html
from datetime import datetime, date, timedelta
from decimal import Decimal

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY

from models import db, Company, Employee, Department, DepartmentHead


def _esc(val):
    return html.escape(str(val)) if val is not None else ""


def _fmt_date(d):
    if not d:
        return "—"
    if isinstance(d, datetime):
        d = d.date()
    if isinstance(d, (str,)):
        try:
            d = date.fromisoformat(d[:10])
        except Exception:
            return d
    return d.strftime("%d %b %Y")


def _money(val):
    try:
        f = float(val or 0)
        return f"GHS {f:,.2f}"
    except Exception:
        return "GHS 0.00"


def get_company_branding():
    comp = Company.query.first()
    name = (comp.name if comp and comp.name else "AIRPORT WEST HOTEL").strip().upper()
    addr = (comp.address if comp and comp.address else "P.O. Box KIA 30675 Airport Accra, Ghana.").strip()
    email = (comp.email if comp and comp.email else "info@airportwesthotel.com").strip()
    web = (comp.website if comp and comp.website else "www.airportwesthotel.com").strip()
    phone = (comp.phone if comp and comp.phone else "+233 030 277 1388 / 024 435 8042").strip()
    fax = (getattr(comp, "fax", None) or "+233 030 276 5667").strip()

    logo_path = None
    if comp and comp.logo_url:
        cand = comp.logo_url.lstrip("/").replace("/", os.sep)
        if os.path.exists(cand):
            logo_path = cand
    if not logo_path:
        fallback = os.path.join("uploads", "branding", "airport_west_hotel_logo.png")
        if os.path.exists(fallback):
            logo_path = fallback

    return {
        "name": name,
        "address": addr,
        "email": email,
        "website": web,
        "phone": phone,
        "fax": fax,
        "logo_path": logo_path,
        "logo_url": "/" + logo_path.replace("\\", "/") if logo_path else "/static/img/logo.png",
    }


def resolve_approvers(emp):
    """Resolve MD, Accountant, and HoD for employee."""
    # MD
    md_emp = emp.md if emp and emp.md else None
    if not md_emp:
        dh_md = DepartmentHead.query.filter_by(role_type="md", status="active").first()
        if dh_md and dh_md.employee and not dh_md.employee.deleted_at:
            md_emp = dh_md.employee
        elif emp:
            md_emp = Employee.query.filter(Employee.deleted_at.is_(None)).order_by(Employee.id.asc()).first()

    # Accountant
    acc_emp = emp.accountant if emp and emp.accountant else None
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

    # HoD
    hod_emp = emp.hod if emp and emp.hod else None
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


# ============================================================================
# 1. STAFF LOAN & SALARY ADVANCE APPROVAL LETTER
# ============================================================================

def build_loan_letter_html(loan, standalone=False, auto_print=False):
    emp = loan.employee
    c_info = get_company_branding()
    target_hod, target_acc, target_md = resolve_approvers(emp)

    emp_name = emp.full_name if emp else "Employee"
    emp_no = emp.employee_no if emp else "—"
    emp_dept = emp.department.name if emp and emp.department else "—"
    emp_title = emp.designation.title if emp and emp.designation else (emp.staff_category or "Staff Member")

    ref_no = loan.reference_no or f"LOAN-2026-{loan.id:04d}"
    issue_date = _fmt_date(loan.approved_at or loan.created_at or date.today())
    loan_type_display = (loan.loan_type or "salary_advance").replace("_", " ").title()

    principal = float(loan.principal or 0)
    instalment = float(loan.instalment or 0)
    balance = float(loan.balance if loan.balance is not None else loan.principal or 0)
    repaid = max(0.0, principal - balance)
    months = int(loan.repayment_months or (round(principal / instalment) if instalment > 0 else 1))
    months = max(1, months)
    start_date = _fmt_date(loan.start_date or date.today())
    end_date = _fmt_date(loan.end_date) if loan.end_date else "Upon full liquidation"

    # Signatures
    approver = loan.approver or target_md or target_acc
    approver_sig = ""
    if loan.status in ("active", "completed") or loan.approved_at:
        if loan.approver_signature:
            approver_sig = f'<span style="font-family:\'Brush Script MT\',cursive;font-size:22px;color:#0f4c3a">{_esc(loan.approver_signature)}</span>'
        elif approver and approver.signature_url:
            approver_sig = f'<img src="{_esc(approver.signature_url)}" style="max-height:42px;max-width:160px;object-fit:contain">'
        else:
            approver_sig = f'<span style="font-weight:700;color:#0f4c3a">{_esc(approver.full_name if approver else "Approved")}</span>'
    else:
        approver_sig = '<span style="color:#94a3b8;font-style:italic">Pending Approval</span>'

    emp_sig = ""
    if loan.employee_signature:
        emp_sig = f'<span style="font-family:\'Brush Script MT\',cursive;font-size:22px;color:#0f4c3a">{_esc(loan.employee_signature)}</span>'
    elif emp and emp.signature_url:
        emp_sig = f'<img src="{_esc(emp.signature_url)}" style="max-height:42px;max-width:160px;object-fit:contain">'
    else:
        emp_sig = f'<span style="font-family:monospace;font-size:12px;color:#475569">{_esc(emp_name)}</span>'

    html_content = f"""
    <div class="official-letter-wrapper" style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;line-height:1.5;max-width:760px;margin:0 auto;padding:32px 36px;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
      
      <!-- Company Letterhead Header -->
      <div style="border-bottom:2px solid #0f766e;padding-bottom:16px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="flex:1;">
          <h1 style="font-size:20px;letter-spacing:1px;font-weight:800;color:#0f766e;margin:0 0 4px 0;text-transform:uppercase;">{_esc(c_info["name"])}</h1>
          <div style="font-size:11px;color:#64748b;line-height:1.4;">
            <div>{_esc(c_info["address"])}</div>
            <div>Tel: {_esc(c_info["phone"])} &nbsp;|&nbsp; Fax: {_esc(c_info["fax"])}</div>
            <div>Email: {_esc(c_info["email"])} &nbsp;|&nbsp; Web: {_esc(c_info["website"])}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <img src="{_esc(c_info["logo_url"])}" alt="Logo" style="max-height:64px;max-width:180px;object-fit:contain;" onerror="this.style.display='none'">
        </div>
      </div>

      <!-- Letter Meta -->
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;font-size:12px;color:#475569;background:#f8fafc;padding:10px 14px;border-radius:6px;border:1px solid #e2e8f0;">
        <div><strong>Ref No:</strong> <span style="font-family:monospace;font-weight:700;color:#0f766e;">{_esc(ref_no)}</span></div>
        <div><strong>Date of Approval:</strong> {_esc(issue_date)}</div>
        <div><strong>Status:</strong> <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;text-transform:uppercase;background:{'#dcfce7;color:#15803d' if loan.status in ('active','completed') else '#fef3c7;color:#b45309'};">{_esc(loan.status)}</span></div>
      </div>

      <!-- Recipient Block -->
      <div style="margin-bottom:20px;font-size:13px;line-height:1.6;">
        <div><strong>TO:</strong> {_esc(emp_name)} (Staff ID: <strong>{_esc(emp_no)}</strong>)</div>
        <div><strong>Designation:</strong> {_esc(emp_title)} &nbsp;|&nbsp; <strong>Department:</strong> {_esc(emp_dept)}</div>
      </div>

      <!-- Letter Title -->
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="font-size:16px;text-transform:uppercase;letter-spacing:0.5px;color:#0f172a;margin:0 0 4px 0;font-weight:800;border-bottom:1px solid #cbd5e1;padding-bottom:8px;display:inline-block;">
          STAFF LOAN &amp; SALARY ADVANCE APPROVAL AGREEMENT
        </h2>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Official Form &amp; Authorization for Monthly Payroll Deductions</div>
      </div>

      <!-- Preamble -->
      <p style="font-size:13px;color:#334155;text-align:justify;margin-bottom:18px;">
        Management has reviewed and approved your application for a staff loan / salary advance in accordance with the corporate financial policy and the Ghana Labour Act, 2003 (Act 651). The approved terms, disbursement conditions, and monthly amortization schedule are detailed hereunder:
      </p>

      <!-- Terms Table -->
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;border:1px solid #cbd5e1;">
        <thead>
          <tr style="background:#0f766e;color:#ffffff;text-align:left;">
            <th style="padding:8px 12px;font-weight:600;" colspan="2">Approved Terms &amp; Repayment Schedule</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;width:40%;color:#475569;"><strong>Loan Category / Type</strong></td>
            <td style="padding:8px 12px;font-weight:600;color:#0f172a;">{_esc(loan_type_display)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Approved Principal Amount</strong></td>
            <td style="padding:8px 12px;font-weight:700;color:#0f766e;font-size:14px;">{_money(principal)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Repayment Duration</strong></td>
            <td style="padding:8px 12px;font-weight:600;color:#0f172a;">{months} Month(s)</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Monthly Payroll Deduction</strong></td>
            <td style="padding:8px 12px;font-weight:700;color:#b91c1c;">{_money(instalment)} / month</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Repayment Start Date</strong></td>
            <td style="padding:8px 12px;color:#0f172a;">{_esc(start_date)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Projected Maturity Date</strong></td>
            <td style="padding:8px 12px;color:#0f172a;">{_esc(end_date)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Real-Time Outstanding Balance</strong></td>
            <td style="padding:8px 12px;font-weight:700;color:{'#15803d' if balance <= 0 else '#b45309'};">{_money(balance)} &nbsp;<span style="font-weight:normal;font-size:11px;color:#64748b;">(Recovered to date: {_money(repaid)})</span></td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Purpose / Stated Reason</strong></td>
            <td style="padding:8px 12px;color:#334155;">{_esc(loan.reason or "Staff welfare / financial assistance")}</td>
          </tr>
        </tbody>
      </table>

      <!-- Legal Covenants & Authorisation Clause -->
      <div style="background:#f8fafc;border-left:3px solid #0f766e;padding:12px 16px;margin-bottom:24px;font-size:11px;color:#334155;line-height:1.6;">
        <strong>PAYROLL DEDUCTION AUTHORISATION &amp; UNDERTAKING:</strong><br>
        1. The employee irrevocably authorizes {_esc(c_info["name"])} to deduct the stipulated monthly installment of <strong>{_money(instalment)}</strong> directly from their salary during each scheduled payroll run until the outstanding balance of {_money(principal)} is fully amortized.<br>
        2. In the event of resignation, retirement, termination of appointment, or exit from the service of the company prior to full repayment, the entire outstanding balance shall become immediately payable and deductible from the employee's final salary, accrued leave commutation, gratuity, or any other terminal benefits.
      </div>

      <!-- Signatures Block -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
        <!-- Approving Authority -->
        <div style="border:1px solid #cbd5e1;padding:12px 14px;border-radius:6px;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:700;color:#64748b;margin-bottom:8px;">Authorized Management Signatory</div>
          <div style="min-height:48px;display:flex;align-items:center;">
            {approver_sig}
          </div>
          <div style="border-top:1px dashed #cbd5e1;padding-top:6px;font-size:11px;color:#334155;">
            <strong>{_esc(approver.full_name if approver else "Managing Director / Financial Controller")}</strong><br>
            <span style="color:#64748b;">Title: {_esc(approver.designation.title if approver and approver.designation else "Authorized Executive Officer")}</span><br>
            <span style="color:#64748b;">Date: {_esc(issue_date)}</span>
          </div>
        </div>

        <!-- Employee Acceptance -->
        <div style="border:1px solid #cbd5e1;padding:12px 14px;border-radius:6px;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:700;color:#64748b;margin-bottom:8px;">Employee Acceptance &amp; Acknowledgment</div>
          <div style="min-height:48px;display:flex;align-items:center;">
            {emp_sig}
          </div>
          <div style="border-top:1px dashed #cbd5e1;padding-top:6px;font-size:11px;color:#334155;">
            <strong>{_esc(emp_name)}</strong> (Staff ID: {_esc(emp_no)})<br>
            <span style="color:#64748b;">Signature verified &amp; accepted terms</span><br>
            <span style="color:#64748b;">Date: {_esc(issue_date)}</span>
          </div>
        </div>
      </div>

      <!-- Footer Note -->
      <div style="margin-top:20px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px;">
        Official HR &amp; Finance Copy &bull; Generated by {_esc(c_info["name"])} HRM System &bull; Reference: {_esc(ref_no)}
      </div>

    </div>
    """

    if standalone:
        script = "<script>window.onload = function() { window.print(); };</script>" if auto_print else ""
        return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Staff Loan Approval — {ref_no}</title>
  <style>
    @media print {{
      body {{ margin: 0; background: #fff !important; }}
      .official-letter-wrapper {{ border: none !important; box-shadow: none !important; max-width: 100% !important; padding: 10mm 15mm !important; }}
      .no-print {{ display: none !important; }}
    }}
    body {{ background: #f1f5f9; padding: 24px 12px; margin: 0; font-family: sans-serif; }}
    .no-print-bar {{ max-width: 760px; margin: 0 auto 16px auto; display: flex; justify-content: flex-end; gap: 8px; }}
    .btn {{ background: #0f766e; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; font-size: 13px; }}
    .btn:hover {{ background: #0d9488; }}
  </style>
</head>
<body>
  <div class="no-print-bar no-print">
    <button class="btn" onclick="window.print()">Print Agreement Letter</button>
  </div>
  {html_content}
  {script}
</body>
</html>"""

    return html_content


def build_loan_letter_pdf(loan):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.65 * inch,
    )

    c_info = get_company_branding()
    emp = loan.employee
    target_hod, target_acc, target_md = resolve_approvers(emp)

    emp_name = emp.full_name if emp else "Employee"
    emp_no = emp.employee_no if emp else "—"
    emp_dept = emp.department.name if emp and emp.department else "—"
    emp_title = emp.designation.title if emp and emp.designation else (emp.staff_category or "Staff Member")

    ref_no = loan.reference_no or f"LOAN-2026-{loan.id:04d}"
    issue_date = _fmt_date(loan.approved_at or loan.created_at or date.today())
    loan_type_display = (loan.loan_type or "salary_advance").replace("_", " ").title()

    principal = float(loan.principal or 0)
    instalment = float(loan.instalment or 0)
    balance = float(loan.balance if loan.balance is not None else loan.principal or 0)
    repaid = max(0.0, principal - balance)
    months = int(loan.repayment_months or (round(principal / instalment) if instalment > 0 else 1))
    months = max(1, months)
    start_date = _fmt_date(loan.start_date or date.today())
    end_date = _fmt_date(loan.end_date) if loan.end_date else "Upon full liquidation"

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("LetterTitle", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, alignment=TA_CENTER, textColor=colors.HexColor("#0f172a"))
    sub_style = ParagraphStyle("LetterSub", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, alignment=TA_CENTER, textColor=colors.HexColor("#64748b"))
    body_style = ParagraphStyle("LetterBody", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=12.5, alignment=TA_JUSTIFY, textColor=colors.HexColor("#334155"))
    meta_style = ParagraphStyle("LetterMeta", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=colors.HexColor("#475569"))
    tbl_hdr = ParagraphStyle("TblHdr", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.white)
    tbl_lbl = ParagraphStyle("TblLbl", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8.5, leading=11.5, textColor=colors.HexColor("#475569"))
    tbl_val = ParagraphStyle("TblVal", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=colors.HexColor("#0f172a"))
    legal_style = ParagraphStyle("LegalText", parent=styles["Normal"], fontName="Helvetica", fontSize=7.8, leading=10.5, textColor=colors.HexColor("#334155"))

    elements = []

    # 1. Header with Logo
    header_data = [
        [
            Paragraph(f"<b><font size=13 color='#0f766e'>{c_info['name']}</font></b><br/><font size=7.5 color='#64748b'>{c_info['address']}<br/>Tel: {c_info['phone']} | Fax: {c_info['fax']}<br/>Email: {c_info['email']} | Web: {c_info['website']}</font>", styles["Normal"]),
            Image(c_info["logo_path"], width=1.7 * inch, height=0.55 * inch, kind="proportional") if c_info["logo_path"] else Paragraph("", styles["Normal"])
        ]
    ]
    hdr_table = Table(header_data, colWidths=[5.3 * inch, 1.8 * inch])
    hdr_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, colors.HexColor("#0f766e")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(hdr_table)
    elements.append(Spacer(1, 0.12 * inch))

    # 2. Ref & Meta Bar
    meta_data = [
        [
            Paragraph(f"<b>Ref No:</b> <font color='#0f766e'><b>{ref_no}</b></font>", meta_style),
            Paragraph(f"<b>Date:</b> {issue_date}", meta_style),
            Paragraph(f"<b>Status:</b> <b>{loan.status.upper()}</b>", meta_style),
        ]
    ]
    meta_table = Table(meta_data, colWidths=[2.6 * inch, 2.3 * inch, 2.2 * inch])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 0.1 * inch))

    # 3. Employee Recipient Block
    recip_text = f"<b>TO:</b> {emp_name} &nbsp;(Staff ID: <b>{emp_no}</b>)<br/><b>Designation:</b> {emp_title} &nbsp;|&nbsp; <b>Department:</b> {emp_dept}"
    elements.append(Paragraph(recip_text, meta_style))
    elements.append(Spacer(1, 0.12 * inch))

    # 4. Title
    elements.append(Paragraph("STAFF LOAN &amp; SALARY ADVANCE APPROVAL AGREEMENT", title_style))
    elements.append(Paragraph("Official Authorization Form for Monthly Payroll Deductions", sub_style))
    elements.append(Spacer(1, 0.12 * inch))

    # 5. Preamble
    elements.append(Paragraph(
        "Management has reviewed and approved your application for a staff loan / salary advance in accordance with corporate policy and the Ghana Labour Act, 2003 (Act 651). The approved terms and monthly amortization schedule are set forth below:",
        body_style
    ))
    elements.append(Spacer(1, 0.1 * inch))

    # 6. Terms Table
    terms_data = [
        [Paragraph("<b>Approved Terms &amp; Repayment Schedule</b>", tbl_hdr), Paragraph("", tbl_hdr)],
        [Paragraph("Loan Category / Type", tbl_lbl), Paragraph(loan_type_display, tbl_val)],
        [Paragraph("Approved Principal Amount", tbl_lbl), Paragraph(f"<b><font color='#0f766e' size=9.5>{_money(principal)}</font></b>", tbl_val)],
        [Paragraph("Repayment Duration", tbl_lbl), Paragraph(f"{months} Month(s)", tbl_val)],
        [Paragraph("Monthly Payroll Deduction", tbl_lbl), Paragraph(f"<b><font color='#b91c1c'>{_money(instalment)} / month</font></b>", tbl_val)],
        [Paragraph("Repayment Start Date", tbl_lbl), Paragraph(start_date, tbl_val)],
        [Paragraph("Projected Maturity Date", tbl_lbl), Paragraph(end_date, tbl_val)],
        [Paragraph("Real-Time Outstanding Balance", tbl_lbl), Paragraph(f"<b>{_money(balance)}</b> &nbsp;(Paid to date: {_money(repaid)})", tbl_val)],
        [Paragraph("Purpose / Stated Reason", tbl_lbl), Paragraph(_esc(loan.reason or "Staff welfare / financial assistance"), tbl_val)],
    ]
    terms_table = Table(terms_data, colWidths=[2.5 * inch, 4.6 * inch])
    terms_table.setStyle(TableStyle([
        ("SPAN", (0, 0), (1, 0)),
        ("BACKGROUND", (0, 0), (1, 0), colors.HexColor("#0f766e")),
        ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#f8fafc")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(terms_table)
    elements.append(Spacer(1, 0.1 * inch))

    # 7. Authorisation Clause
    legal_text = (
        "<b>PAYROLL DEDUCTION AUTHORISATION &amp; UNDERTAKING:</b><br/>"
        f"1. The employee irrevocably authorizes {c_info['name']} to deduct {_money(instalment)} monthly from their salary until the total principal of {_money(principal)} is fully satisfied.<br/>"
        "2. Upon resignation, termination, or separation from the company prior to full liquidation, the outstanding balance shall be immediately deducted from the employee's final salary, accrued leave pay, gratuity, or any terminal benefits."
    )
    legal_box = Table([[Paragraph(legal_text, legal_style)]], colWidths=[7.1 * inch])
    legal_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("LINELEFT", (0, 0), (0, -1), 2.5, colors.HexColor("#0f766e")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(legal_box)
    elements.append(Spacer(1, 0.15 * inch))

    # 8. Signatures Block
    approver = loan.approver or target_md or target_acc
    appr_name = approver.full_name if approver else "Authorized Executive Officer"
    appr_title = approver.designation.title if approver and approver.designation else "Managing Director / Financial Controller"

    sig_data = [
        [
            Paragraph("<b>AUTHORIZED MANAGEMENT SIGNATORY</b>", tbl_lbl),
            Paragraph("<b>EMPLOYEE ACCEPTANCE &amp; ACKNOWLEDGMENT</b>", tbl_lbl)
        ],
        [
            Paragraph(f"<br/><br/><b>{appr_name}</b><br/><font color='#64748b' size=7.5>{appr_title}<br/>Date: {issue_date}</font>", tbl_val),
            Paragraph(f"<br/><br/><b>{emp_name}</b> &nbsp;(Staff ID: {emp_no})<br/><font color='#64748b' size=7.5>Signature verified &amp; terms accepted<br/>Date: {issue_date}</font>", tbl_val)
        ]
    ]
    sig_table = Table(sig_data, colWidths=[3.5 * inch, 3.6 * inch])
    sig_table.setStyle(TableStyle([
        ("BOX", (0, 0), (0, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("BOX", (1, 0), (1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f8fafc")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#f8fafc")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(KeepTogether(sig_table))

    doc.build(elements)
    return buffer.getvalue()


# ============================================================================
# 2. LEAVE ENCASHMENT / SALE APPROVAL LETTER
# ============================================================================

def build_encashment_letter_html(enc, standalone=False, auto_print=False):
    emp = enc.employee
    c_info = get_company_branding()
    target_hod, target_acc, target_md = resolve_approvers(emp)

    emp_name = emp.full_name if emp else "Employee"
    emp_no = emp.employee_no if emp else "—"
    emp_dept = emp.department.name if emp and emp.department else "—"
    emp_title = emp.designation.title if emp and emp.designation else (emp.staff_category or "Staff Member")

    ref_no = enc.reference_no or f"LENC-2026-{enc.id:04d}"
    issue_date = _fmt_date(enc.decided_at or enc.created_at or date.today())
    leave_type_name = enc.leave_type.name if enc.leave_type else "Annual Leave"

    days_sold = float(enc.days_sold or 0)
    daily_rate = float(enc.daily_rate or 0)
    total_amount = float(enc.total_amount or 0)
    acc_before = float(enc.accumulated_before or 0)
    acc_after = float(enc.accumulated_after or 0)

    # Signatures
    def sig_block(approver_emp, sig_str, date_val, target_emp, label):
        date_str = _fmt_date(date_val)
        active_emp = approver_emp or target_emp
        sig_markup = ""
        if date_val or enc.status == "approved":
            if sig_str:
                sig_markup = f'<span style="font-family:\'Brush Script MT\',cursive;font-size:20px;color:#0f766e">{_esc(sig_str)}</span>'
            elif active_emp and active_emp.signature_url:
                sig_markup = f'<img src="{_esc(active_emp.signature_url)}" style="max-height:36px;max-width:140px;object-fit:contain">'
            else:
                sig_markup = f'<span style="font-weight:700;color:#0f766e;font-size:12px">{_esc(active_emp.full_name if active_emp else "Authorized")}</span>'
        else:
            sig_markup = '<span style="color:#94a3b8;font-style:italic;font-size:11px">Pending Approval</span>'

        return f"""
        <div style="border:1px solid #cbd5e1;padding:8px 10px;border-radius:6px;background:#ffffff;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px;">{label}</div>
          <div style="min-height:38px;display:flex;align-items:center;">{sig_markup}</div>
          <div style="border-top:1px dashed #cbd5e1;padding-top:4px;font-size:10px;color:#334155;">
            <strong>{_esc(active_emp.full_name if active_emp else "—")}</strong><br>
            <span style="color:#64748b;">Date: {_esc(date_str if date_val else "Pending")}</span>
          </div>
        </div>
        """

    hod_box = sig_block(enc.hod_approver, enc.hod_signature, enc.hod_approved_at, target_hod, "1. Head of Department")
    acc_box = sig_block(enc.accountant_approver, enc.accountant_signature, enc.accountant_approved_at, target_acc, "2. Financial Controller")
    md_box = sig_block(enc.md_approver, enc.md_signature, enc.md_approved_at, target_md, "3. Managing Director")

    emp_sig = ""
    if enc.employee_signature:
        emp_sig = f'<span style="font-family:\'Brush Script MT\',cursive;font-size:20px;color:#0f766e">{_esc(enc.employee_signature)}</span>'
    elif emp and emp.signature_url:
        emp_sig = f'<img src="{_esc(emp.signature_url)}" style="max-height:36px;max-width:140px;object-fit:contain">'
    else:
        emp_sig = f'<span style="font-family:monospace;font-size:11px;color:#475569">{_esc(emp_name)}</span>'

    emp_box = f"""
    <div style="border:1px solid #cbd5e1;padding:8px 10px;border-radius:6px;background:#ffffff;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:4px;">4. Employee Acknowledgment</div>
      <div style="min-height:38px;display:flex;align-items:center;">{emp_sig}</div>
      <div style="border-top:1px dashed #cbd5e1;padding-top:4px;font-size:10px;color:#334155;">
        <strong>{_esc(emp_name)}</strong><br>
        <span style="color:#64748b;">Date: {_esc(issue_date)}</span>
      </div>
    </div>
    """

    html_content = f"""
    <div class="official-letter-wrapper" style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;line-height:1.5;max-width:760px;margin:0 auto;padding:32px 36px;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
      
      <!-- Company Letterhead Header -->
      <div style="border-bottom:2px solid #0f766e;padding-bottom:16px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="flex:1;">
          <h1 style="font-size:20px;letter-spacing:1px;font-weight:800;color:#0f766e;margin:0 0 4px 0;text-transform:uppercase;">{_esc(c_info["name"])}</h1>
          <div style="font-size:11px;color:#64748b;line-height:1.4;">
            <div>{_esc(c_info["address"])}</div>
            <div>Tel: {_esc(c_info["phone"])} &nbsp;|&nbsp; Fax: {_esc(c_info["fax"])}</div>
            <div>Email: {_esc(c_info["email"])} &nbsp;|&nbsp; Web: {_esc(c_info["website"])}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <img src="{_esc(c_info["logo_url"])}" alt="Logo" style="max-height:64px;max-width:180px;object-fit:contain;" onerror="this.style.display='none'">
        </div>
      </div>

      <!-- Letter Meta -->
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;font-size:12px;color:#475569;background:#f8fafc;padding:10px 14px;border-radius:6px;border:1px solid #e2e8f0;">
        <div><strong>Ref No:</strong> <span style="font-family:monospace;font-weight:700;color:#0f766e;">{_esc(ref_no)}</span></div>
        <div><strong>Date of Authorization:</strong> {_esc(issue_date)}</div>
        <div><strong>Status:</strong> <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;text-transform:uppercase;background:{'#dcfce7;color:#15803d' if enc.status in ('approved','paid') else '#fef3c7;color:#b45309'};">{_esc(enc.status)}</span></div>
      </div>

      <!-- Recipient Block -->
      <div style="margin-bottom:20px;font-size:13px;line-height:1.6;">
        <div><strong>TO:</strong> {_esc(emp_name)} (Staff ID: <strong>{_esc(emp_no)}</strong>)</div>
        <div><strong>Designation:</strong> {_esc(emp_title)} &nbsp;|&nbsp; <strong>Department:</strong> {_esc(emp_dept)}</div>
      </div>

      <!-- Letter Title -->
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="font-size:16px;text-transform:uppercase;letter-spacing:0.5px;color:#0f172a;margin:0 0 4px 0;font-weight:800;border-bottom:1px solid #cbd5e1;padding-bottom:8px;display:inline-block;">
          APPROVAL OF ANNUAL LEAVE ENCASHMENT &amp; BALANCE DEDUCTION
        </h2>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">Official Leave Buyout Certificate &amp; Accumulated Balance Ledger Adjustment</div>
      </div>

      <!-- Preamble -->
      <p style="font-size:13px;color:#334155;text-align:justify;margin-bottom:18px;">
        This document serves as formal confirmation that your application to sell / encash accrued leave has been approved by executive management. In accordance with corporate policy, the encashed days have been permanently deducted from your accumulated leave ledger and scheduled for financial disbursement:
      </p>

      <!-- Terms Table -->
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;border:1px solid #cbd5e1;">
        <thead>
          <tr style="background:#0f766e;color:#ffffff;text-align:left;">
            <th style="padding:8px 12px;font-weight:600;" colspan="2">Encashment Calculations &amp; Leave Ledger Impact</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;width:45%;color:#475569;"><strong>Leave Category</strong></td>
            <td style="padding:8px 12px;font-weight:600;color:#0f172a;">{_esc(leave_type_name)} (Year {enc.year})</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Accumulated Leave Days Before Sale</strong></td>
            <td style="padding:8px 12px;font-weight:600;color:#0f172a;">{acc_before:.1f} Day(s)</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#fef2f2;color:#991b1b;"><strong>Leave Days Encashed / Sold (Deducted)</strong></td>
            <td style="padding:8px 12px;font-weight:700;color:#b91c1c;font-size:13px;">- {days_sold:.1f} Day(s)</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f0fdf4;color:#166534;"><strong>Remaining Accumulated Leave Balance</strong></td>
            <td style="padding:8px 12px;font-weight:700;color:#15803d;font-size:14px;">= {acc_after:.1f} Day(s) remaining</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Daily Encashment Computation Rate</strong></td>
            <td style="padding:8px 12px;color:#0f172a;">{_money(daily_rate)} / working day</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Total Gross Cash Payout Value</strong></td>
            <td style="padding:8px 12px;font-weight:700;color:#0f766e;font-size:14px;">{_money(total_amount)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Disbursement Channel / Schedule</strong></td>
            <td style="padding:8px 12px;color:#0f172a;">Direct credit via next scheduled monthly payroll run</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f8fafc;color:#475569;"><strong>Justification / Stated Reason</strong></td>
            <td style="padding:8px 12px;color:#334155;">{_esc(enc.reason or "Staff leave buy-back application")}</td>
          </tr>
        </tbody>
      </table>

      <!-- Audit Notice -->
      <div style="background:#f8fafc;border-left:3px solid #0f766e;padding:12px 16px;margin-bottom:24px;font-size:11px;color:#334155;line-height:1.6;">
        <strong>OFFICIAL LEAVE RECORD DEDUCTION CERTIFICATION:</strong><br>
        This certifies that <strong>{days_sold:.1f} working day(s)</strong> have been officially debited from the employee's accumulated leave balance. The employee's adjusted remaining leave balance stands at <strong>{acc_after:.1f} day(s)</strong> for the {enc.year} leave year. The Finance &amp; Payroll department is authorized to remit <strong>{_money(total_amount)}</strong> subject to statutory deductions.
      </div>

      <!-- 4-Box Signatures Block -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;">
        {hod_box}
        {acc_box}
        {md_box}
        {emp_box}
      </div>

      <!-- Footer Note -->
      <div style="margin-top:24px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px;">
        Official HR &amp; Finance Copy &bull; Generated by {_esc(c_info["name"])} HRM System &bull; Reference: {_esc(ref_no)}
      </div>

    </div>
    """

    if standalone:
        script = "<script>window.onload = function() { window.print(); };</script>" if auto_print else ""
        return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Leave Encashment Approval — {ref_no}</title>
  <style>
    @media print {{
      body {{ margin: 0; background: #fff !important; }}
      .official-letter-wrapper {{ border: none !important; box-shadow: none !important; max-width: 100% !important; padding: 10mm 15mm !important; }}
      .no-print {{ display: none !important; }}
    }}
    body {{ background: #f1f5f9; padding: 24px 12px; margin: 0; font-family: sans-serif; }}
    .no-print-bar {{ max-width: 760px; margin: 0 auto 16px auto; display: flex; justify-content: flex-end; gap: 8px; }}
    .btn {{ background: #0f766e; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; font-size: 13px; }}
    .btn:hover {{ background: #0d9488; }}
  </style>
</head>
<body>
  <div class="no-print-bar no-print">
    <button class="btn" onclick="window.print()">Print Encashment Letter</button>
  </div>
  {html_content}
  {script}
</body>
</html>"""

    return html_content


def build_encashment_letter_pdf(enc):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.65 * inch,
    )

    c_info = get_company_branding()
    emp = enc.employee
    target_hod, target_acc, target_md = resolve_approvers(emp)

    emp_name = emp.full_name if emp else "Employee"
    emp_no = emp.employee_no if emp else "—"
    emp_dept = emp.department.name if emp and emp.department else "—"
    emp_title = emp.designation.title if emp and emp.designation else (emp.staff_category or "Staff Member")

    ref_no = enc.reference_no or f"LENC-2026-{enc.id:04d}"
    issue_date = _fmt_date(enc.decided_at or enc.created_at or date.today())
    leave_type_name = enc.leave_type.name if enc.leave_type else "Annual Leave"

    days_sold = float(enc.days_sold or 0)
    daily_rate = float(enc.daily_rate or 0)
    total_amount = float(enc.total_amount or 0)
    acc_before = float(enc.accumulated_before or 0)
    acc_after = float(enc.accumulated_after or 0)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("EncashTitle", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=15, alignment=TA_CENTER, textColor=colors.HexColor("#0f172a"))
    sub_style = ParagraphStyle("EncashSub", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, alignment=TA_CENTER, textColor=colors.HexColor("#64748b"))
    body_style = ParagraphStyle("EncashBody", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=12.5, alignment=TA_JUSTIFY, textColor=colors.HexColor("#334155"))
    meta_style = ParagraphStyle("EncashMeta", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=colors.HexColor("#475569"))
    tbl_hdr = ParagraphStyle("TblHdr", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.white)
    tbl_lbl = ParagraphStyle("TblLbl", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8.5, leading=11.5, textColor=colors.HexColor("#475569"))
    tbl_val = ParagraphStyle("TblVal", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=colors.HexColor("#0f172a"))
    legal_style = ParagraphStyle("LegalText", parent=styles["Normal"], fontName="Helvetica", fontSize=7.8, leading=10.5, textColor=colors.HexColor("#334155"))

    elements = []

    # 1. Header with Logo
    header_data = [
        [
            Paragraph(f"<b><font size=13 color='#0f766e'>{c_info['name']}</font></b><br/><font size=7.5 color='#64748b'>{c_info['address']}<br/>Tel: {c_info['phone']} | Fax: {c_info['fax']}<br/>Email: {c_info['email']} | Web: {c_info['website']}</font>", styles["Normal"]),
            Image(c_info["logo_path"], width=1.7 * inch, height=0.55 * inch, kind="proportional") if c_info["logo_path"] else Paragraph("", styles["Normal"])
        ]
    ]
    hdr_table = Table(header_data, colWidths=[5.3 * inch, 1.8 * inch])
    hdr_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, colors.HexColor("#0f766e")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(hdr_table)
    elements.append(Spacer(1, 0.12 * inch))

    # 2. Ref & Meta Bar
    meta_data = [
        [
            Paragraph(f"<b>Ref No:</b> <font color='#0f766e'><b>{ref_no}</b></font>", meta_style),
            Paragraph(f"<b>Date:</b> {issue_date}", meta_style),
            Paragraph(f"<b>Status:</b> <b>{enc.status.upper()}</b>", meta_style),
        ]
    ]
    meta_table = Table(meta_data, colWidths=[2.6 * inch, 2.3 * inch, 2.2 * inch])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 0.1 * inch))

    # 3. Employee Recipient Block
    recip_text = f"<b>TO:</b> {emp_name} &nbsp;(Staff ID: <b>{emp_no}</b>)<br/><b>Designation:</b> {emp_title} &nbsp;|&nbsp; <b>Department:</b> {emp_dept}"
    elements.append(Paragraph(recip_text, meta_style))
    elements.append(Spacer(1, 0.12 * inch))

    # 4. Title
    elements.append(Paragraph("APPROVAL OF ANNUAL LEAVE ENCASHMENT &amp; BALANCE DEDUCTION", title_style))
    elements.append(Paragraph("Official Leave Buyout Certificate &amp; Accumulated Balance Adjustment Form", sub_style))
    elements.append(Spacer(1, 0.12 * inch))

    # 5. Preamble
    elements.append(Paragraph(
        "Management has authorized the encashment of accrued leave in accordance with company policy. As confirmed below, the encashed days have been debited from your accumulated leave ledger and forwarded for payroll payment:",
        body_style
    ))
    elements.append(Spacer(1, 0.1 * inch))

    # 6. Terms Table
    terms_data = [
        [Paragraph("<b>Encashment Calculations &amp; Leave Ledger Impact</b>", tbl_hdr), Paragraph("", tbl_hdr)],
        [Paragraph("Leave Category", tbl_lbl), Paragraph(f"{leave_type_name} (Year {enc.year})", tbl_val)],
        [Paragraph("Accumulated Leave Days Prior to Sale", tbl_lbl), Paragraph(f"{acc_before:.1f} Day(s)", tbl_val)],
        [Paragraph("Leave Days Encashed / Sold (Deducted)", tbl_lbl), Paragraph(f"<b><font color='#b91c1c'>- {days_sold:.1f} Day(s)</font></b>", tbl_val)],
        [Paragraph("Remaining Accumulated Leave Balance", tbl_lbl), Paragraph(f"<b><font color='#15803d' size=9.5>= {acc_after:.1f} Day(s) remaining</font></b>", tbl_val)],
        [Paragraph("Daily Encashment Computation Rate", tbl_lbl), Paragraph(f"{_money(daily_rate)} / working day", tbl_val)],
        [Paragraph("Total Gross Cash Payout Value", tbl_lbl), Paragraph(f"<b><font color='#0f766e' size=9.5>{_money(total_amount)}</font></b>", tbl_val)],
        [Paragraph("Disbursement Channel", tbl_lbl), Paragraph("Direct credit via next scheduled monthly payroll run", tbl_val)],
        [Paragraph("Justification / Stated Reason", tbl_lbl), Paragraph(_esc(enc.reason or "Staff leave buy-back application"), tbl_val)],
    ]
    terms_table = Table(terms_data, colWidths=[2.6 * inch, 4.5 * inch])
    terms_table.setStyle(TableStyle([
        ("SPAN", (0, 0), (1, 0)),
        ("BACKGROUND", (0, 0), (1, 0), colors.HexColor("#0f766e")),
        ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#f8fafc")),
        ("BACKGROUND", (0, 3), (1, 3), colors.HexColor("#fef2f2")),
        ("BACKGROUND", (0, 4), (1, 4), colors.HexColor("#f0fdf4")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(terms_table)
    elements.append(Spacer(1, 0.1 * inch))

    # 7. Audit Notice Box
    cert_text = (
        "<b>OFFICIAL LEAVE RECORD DEDUCTION CERTIFICATION:</b><br/>"
        f"This certifies that <b>{days_sold:.1f} working day(s)</b> have been officially debited from the employee's accumulated leave balance. "
        f"The employee's remaining leave balance is <b>{acc_after:.1f} day(s)</b> for the {enc.year} leave period. "
        f"Finance &amp; Payroll is authorized to disburse <b>{_money(total_amount)}</b>."
    )
    cert_box = Table([[Paragraph(cert_text, legal_style)]], colWidths=[7.1 * inch])
    cert_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("LINELEFT", (0, 0), (0, -1), 2.5, colors.HexColor("#0f766e")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(cert_box)
    elements.append(Spacer(1, 0.15 * inch))

    # 8. 4-Signatures Block
    hod_name = (enc.hod_approver or target_hod).full_name if (enc.hod_approver or target_hod) else "Head of Department"
    acc_name = (enc.accountant_approver or target_acc).full_name if (enc.accountant_approver or target_acc) else "Financial Controller"
    md_name = (enc.md_approver or target_md).full_name if (enc.md_approver or target_md) else "Managing Director"

    sig_data = [
        [
            Paragraph("<b>1. Head of Department</b>", tbl_lbl),
            Paragraph("<b>2. Financial Controller</b>", tbl_lbl)
        ],
        [
            Paragraph(f"<br/><br/><b>{hod_name}</b><br/><font color='#64748b' size=7.5>Date: {_fmt_date(enc.hod_approved_at or issue_date)}</font>", tbl_val),
            Paragraph(f"<br/><br/><b>{acc_name}</b><br/><font color='#64748b' size=7.5>Date: {_fmt_date(enc.accountant_approved_at or issue_date)}</font>", tbl_val)
        ],
        [
            Paragraph("<b>3. Managing Director</b>", tbl_lbl),
            Paragraph("<b>4. Employee Acknowledgment</b>", tbl_lbl)
        ],
        [
            Paragraph(f"<br/><br/><b>{md_name}</b><br/><font color='#64748b' size=7.5>Date: {_fmt_date(enc.md_approved_at or issue_date)}</font>", tbl_val),
            Paragraph(f"<br/><br/><b>{emp_name}</b> &nbsp;(Staff ID: {emp_no})<br/><font color='#64748b' size=7.5>Date: {issue_date}</font>", tbl_val)
        ],
    ]
    sig_table = Table(sig_data, colWidths=[3.5 * inch, 3.6 * inch])
    sig_table.setStyle(TableStyle([
        ("BOX", (0, 0), (0, 1), 0.5, colors.HexColor("#cbd5e1")),
        ("BOX", (1, 0), (1, 1), 0.5, colors.HexColor("#cbd5e1")),
        ("BOX", (0, 2), (0, 3), 0.5, colors.HexColor("#cbd5e1")),
        ("BOX", (1, 2), (1, 3), 0.5, colors.HexColor("#cbd5e1")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f8fafc")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#f8fafc")),
        ("BACKGROUND", (0, 2), (0, 2), colors.HexColor("#f8fafc")),
        ("BACKGROUND", (1, 2), (1, 2), colors.HexColor("#f8fafc")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(KeepTogether(sig_table))

    doc.build(elements)
    return buffer.getvalue()
