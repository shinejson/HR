"""
=============================================================================
ROSTER PDF & PRINT ENGINE
Generates official weekly shift roster documents in Landscape and Portrait:
1. High-resolution downloadable PDF via ReportLab
2. Interactive printable HTML view with real-time orientation switching & print bar
=============================================================================
"""

import os
import io
import html
from datetime import datetime, date, timedelta

from reportlab.lib.pagesizes import A4, landscape, portrait
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, KeepTogether, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from models import db, Company, Employee, Department, Shift, ShiftAssignment, BrandingAsset


def _esc(val):
    return html.escape(str(val)) if val is not None else ""


def _fmt_date(d):
    if not d:
        return ""
    if isinstance(d, (datetime, date)):
        return d.strftime("%d %b %Y")
    return str(d)


def get_roster_data_for_export(week_start_date, dept_param="all"):
    """Fetch structured roster data for PDF and Print generation"""
    if isinstance(week_start_date, str):
        week_start = datetime.strptime(week_start_date, "%Y-%m-%d").date()
    else:
        week_start = week_start_date

    if week_start.weekday() != 0:
        week_start = week_start - timedelta(days=week_start.weekday())

    week_end = week_start + timedelta(days=6)

    # Days list
    days = []
    day_abbrs = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    for i in range(7):
        d = week_start + timedelta(days=i)
        days.append({
            "date": d,
            "iso": d.isoformat(),
            "day_name": day_abbrs[i],
            "day_num": d.strftime("%d"),
            "month_abbr": d.strftime("%b"),
            "header": f"{day_abbrs[i]}\n{d.strftime('%d %b')}",
            "is_weekend": i >= 5,
        })

    is_all = str(dept_param).lower() in ["all", "", "none"]
    all_depts = Department.query.order_by(Department.name).all()

    if is_all:
        target_depts = all_depts
        dept_title = "All Departments (Grouped)"
    else:
        dept_obj = db.session.get(Department, int(dept_param))
        target_depts = [dept_obj] if dept_obj else all_depts
        dept_title = dept_obj.name if dept_obj else "Department"

    target_dept_ids = [d.id for d in target_depts if d]

    # Query employees
    employees = Employee.query.filter(
        Employee.department_id.in_(target_dept_ids),
        Employee.status == "active"
    ).order_by(Employee.department_id, Employee.first_name, Employee.last_name).all()

    # Query shifts
    shifts = Shift.query.order_by(Shift.is_default.desc(), Shift.name).all()
    shift_lookup = {s.id: s for s in shifts}

    # Query assignments
    assignments = ShiftAssignment.query.filter(
        ShiftAssignment.department_id.in_(target_dept_ids),
        ShiftAssignment.work_date >= week_start,
        ShiftAssignment.work_date <= week_end
    ).all()

    assign_map = {}
    for a in assignments:
        key = f"{a.employee_id}_{a.work_date.isoformat()}"
        assign_map[key] = a

    # Group employees by department
    dept_groups = []
    dept_map = {d.id: d.name for d in target_depts}

    current_dept_id = None
    current_group = None

    for emp in employees:
        d_id = emp.department_id or 0
        if d_id != current_dept_id:
            current_dept_id = d_id
            current_group = {
                "dept_id": d_id,
                "dept_name": dept_map.get(d_id, "General"),
                "employees": []
            }
            dept_groups.append(current_group)

        # Build 7 days
        emp_days = []
        for day in days:
            key = f"{emp.id}_{day['iso']}"
            assign = assign_map.get(key)
            if assign and assign.shift_id and assign.shift_id in shift_lookup:
                sh = shift_lookup[assign.shift_id]
                code = sh.code or sh.name[:2].upper()
                color = getattr(sh, "color", "#0f766e") or "#0f766e"
                name = sh.name
            elif assign and (assign.shift_id is None or (assign.shift and assign.shift.code == "OFF")):
                code = "OFF"
                color = "#94a3b8"
                name = "Day Off"
            else:
                code = "—"
                color = "#cbd5e1"
                name = "Unassigned"

            emp_days.append({
                "date": day["iso"],
                "code": code,
                "color": color,
                "name": name,
            })

        current_group["employees"].append({
            "id": emp.id,
            "name": emp.full_name,
            "employee_no": emp.employee_no or "",
            "days": emp_days,
        })

    return {
        "week_start": week_start,
        "week_end": week_end,
        "week_display": f"{week_start.strftime('%d %b %Y')} – {week_end.strftime('%d %b %Y')}",
        "days": days,
        "dept_title": dept_title,
        "dept_groups": dept_groups,
        "shifts": shifts,
        "total_employees": len(employees),
    }


def _get_logo_source():
    """
    Locates the official company logo uploaded in Settings / Branding.
    Returns:
      (reportlab_image_source, html_img_src)
      - reportlab_image_source: a BytesIO or file path usable by ReportLab Image(...)
      - html_img_src: relative URL for <img src="..."> in HTML print
    """
    try:
        comp = Company.query.first()
    except Exception:
        comp = None

    logo_url = (comp.logo_url if comp and comp.logo_url else "").strip()

    # 1. Look up BrandingAsset matching stored_name
    asset = None
    if logo_url and logo_url.startswith("/uploads/branding/"):
        stored_name = logo_url.replace("/uploads/branding/", "").strip()
        try:
            asset = BrandingAsset.query.filter_by(stored_name=stored_name).first()
        except Exception:
            asset = None

    # Fallback to latest uploaded logo asset
    if not asset:
        try:
            asset = BrandingAsset.query.filter_by(kind="logo").order_by(BrandingAsset.id.desc()).first()
        except Exception:
            asset = None

    if asset and asset.content:
        # Ensure cached to uploads/branding on disk
        try:
            os.makedirs("uploads/branding", exist_ok=True)
            cached_disk = os.path.join("uploads", "branding", asset.stored_name)
            if not os.path.exists(cached_disk):
                with open(cached_disk, "wb") as f:
                    f.write(asset.content)
        except Exception:
            pass
        return io.BytesIO(asset.content), f"/uploads/branding/{asset.stored_name}"

    # 2. Direct file on disk
    if logo_url:
        disk_path = logo_url.lstrip("/")
        if os.path.exists(disk_path):
            return disk_path, logo_url

    # 3. Fallback to any valid logo image in uploads/branding
    if os.path.exists("uploads/branding"):
        for fname in os.listdir("uploads/branding"):
            if "gold" in fname.lower() or "logo" in fname.lower():
                if fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    fpath = os.path.join("uploads", "branding", fname)
                    return fpath, f"/uploads/branding/{fname}"

    return None, None


# =============================================================================
# 1. REPORTLAB PDF BUILDER (Landscape & Portrait)
# =============================================================================

def build_roster_pdf(week_start_date, dept_param="all", orientation="landscape"):
    """
    Builds a high-resolution, executive PDF document of the Shift Roster.
    Supports 'landscape' (recommended for 7-day grid) and 'portrait'.
    """
    is_landscape = orientation.lower() == "landscape"
    pagesize = landscape(A4) if is_landscape else portrait(A4)

    margin = 0.35 * 72  # 0.35 inch
    page_w, page_h = pagesize
    usable_w = page_w - (2 * margin)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )

    data = get_roster_data_for_export(week_start_date, dept_param)
    styles = getSampleStyleSheet()

    elements = []

    # Title & Branding Header
    comp = Company.query.first()
    company_name = comp.name if comp else "Airport West Hotel"

    logo_source, _ = _get_logo_source()
    header_rows = []

    title_p = Paragraph(
        f"<font size='16' color='#0f766e'><b>{company_name.upper()}</b></font><br/>"
        f"<font size='12' color='#1e293b'><b>WEEKLY SHIFT ROSTER</b></font><br/>"
        f"<font size='9' color='#64748b'>Week Period: <b>{data['week_display']}</b> &nbsp;|&nbsp; Scope: <b>{data['dept_title']}</b></font>",
        ParagraphStyle("HeaderTitle", parent=styles["Normal"], leading=16)
    )

    meta_p = Paragraph(
        f"<font size='8' color='#64748b'>Generated on: {datetime.now().strftime('%d %b %Y, %H:%M')}<br/>"
        f"Active Staff: <b>{data['total_employees']}</b><br/>"
        f"Format: <b>{orientation.capitalize()} A4</b></font>",
        ParagraphStyle("HeaderMeta", parent=styles["Normal"], alignment=TA_RIGHT, leading=11)
    )

    if logo_source:
        try:
            logo_img = Image(logo_source, width=1.4 * 72, height=0.55 * 72, kind="proportional")
            logo_img.hAlign = "LEFT"
            header_table = Table([[logo_img, title_p, meta_p]], colWidths=[1.5 * 72, usable_w - 3.2 * 72, 1.7 * 72])
        except Exception:
            header_table = Table([[title_p, meta_p]], colWidths=[usable_w - 1.8 * 72, 1.8 * 72])
    else:
        header_table = Table([[title_p, meta_p]], colWidths=[usable_w - 1.8 * 72, 1.8 * 72])

    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 10))

    # Grid Dimensions Calculation
    if is_landscape:
        name_col_w = 161.49
        day_col_w = 90.0
    else:
        name_col_w = 124.87
        day_col_w = 60.0

    col_widths = [name_col_w] + [day_col_w] * 7

    # Build Table Rows
    table_data = []
    table_styles = [
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]

    # Column Headers Row
    header_cells = [
        Paragraph("<font size='8' color='#475569'><b>STAFF MEMBER</b></font>", ParagraphStyle("ThName", alignment=TA_LEFT))
    ]
    for d in data["days"]:
        th_text = f"<font size='8' color='#475569'><b>{d['day_name']}</b></font><br/><font size='7.5' color='{ '#0f766e' if d['date'] == date.today() else '#64748b' }'>{d['day_num']} {d['month_abbr']}</font>"
        header_cells.append(Paragraph(th_text, ParagraphStyle("ThDay", alignment=TA_CENTER, leading=9)))

    table_data.append(header_cells)
    current_row = 0

    table_styles.extend([
        ("BACKGROUND", (0, current_row), (-1, current_row), colors.HexColor("#f8fafc")),
        ("BOTTOMPADDING", (0, current_row), (-1, current_row), 6),
        ("TOPPADDING", (0, current_row), (-1, current_row), 6),
    ])

    # Weekend highlight on header
    table_styles.append(("BACKGROUND", (6, current_row), (7, current_row), colors.HexColor("#f1f5f9")))

    # Populate Department Groups
    for group in data["dept_groups"]:
        current_row += 1
        dept_cell = Paragraph(
            f"<font size='8.5' color='#0f766e'><b>🏢 DEPARTMENT: {group['dept_name'].upper()} &nbsp;&middot;&nbsp; ({len(group['employees'])} Members)</b></font>",
            ParagraphStyle("DeptRow", leading=11)
        )
        # Span across all 8 columns
        dept_row = [dept_cell] + [""] * 7
        table_data.append(dept_row)

        table_styles.extend([
            ("SPAN", (0, current_row), (7, current_row)),
            ("BACKGROUND", (0, current_row), (7, current_row), colors.HexColor("#e6f4f2")),
            ("TOPPADDING", (0, current_row), (7, current_row), 5),
            ("BOTTOMPADDING", (0, current_row), (7, current_row), 5),
        ])

        for emp in group["employees"]:
            current_row += 1
            name_p = Paragraph(
                f"<font size='8' color='#0f172a'><b>{_esc(emp['name'])}</b></font><br/>"
                f"<font size='7' color='#64748b'>{_esc(emp['employee_no'])}</font>",
                ParagraphStyle("EmpName", leading=9)
            )
            row_cells = [name_p]

            for day_idx, day_info in enumerate(emp["days"]):
                code = day_info["code"]
                bg_hex = day_info["color"]

                if code and code != "—":
                    badge_p = Paragraph(
                        f"<font size='8' color='#ffffff'><b>{code}</b></font>",
                        ParagraphStyle("ShiftBadge", alignment=TA_CENTER)
                    )
                else:
                    badge_p = Paragraph(
                        "<font size='8' color='#94a3b8'>—</font>",
                        ParagraphStyle("EmptyBadge", alignment=TA_CENTER)
                    )

                row_cells.append(badge_p)

                col_idx = day_idx + 1
                if code and code != "—":
                    try:
                        table_styles.append(("BACKGROUND", (col_idx, current_row), (col_idx, current_row), colors.HexColor(bg_hex)))
                    except Exception:
                        table_styles.append(("BACKGROUND", (col_idx, current_row), (col_idx, current_row), colors.HexColor("#0f766e")))
                elif day_idx >= 5:
                    table_styles.append(("BACKGROUND", (col_idx, current_row), (col_idx, current_row), colors.HexColor("#f8fafc")))

            table_data.append(row_cells)

    roster_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    roster_table.setStyle(TableStyle(table_styles))
    elements.append(roster_table)
    elements.append(Spacer(1, 10))

    # Shift Legend Block
    legend_cells = [Paragraph("<b>SHIFT LEGEND:</b>", ParagraphStyle("LegTitle", fontSize=7.5, color=colors.HexColor("#475569")))]
    for s in data["shifts"]:
        c = s.code or s.name[:2].upper()
        col = getattr(s, "color", "#0f766e") or "#0f766e"
        hours = f"{s.start_time}–{s.end_time}" if (s.start_time and s.end_time and s.start_time != "00:00") else "Off"
        item_p = Paragraph(
            f"<font color='{col}'>■</font> <b>{c}</b>: {s.name} ({hours})",
            ParagraphStyle("LegItem", fontSize=7, leading=8)
        )
        legend_cells.append(item_p)

    # Wrap legend in horizontal table
    legend_cols = len(legend_cells)
    legend_table = Table([legend_cells], colWidths=[usable_w / legend_cols] * legend_cols)
    legend_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(legend_table)
    elements.append(Spacer(1, 14))

    # Signatures Block
    sig_table = Table([
        [
            Paragraph("<b>PREPARED BY (ROSTER IN-CHARGE)</b><br/><br/>________________________________________<br/>Signature &amp; Date", ParagraphStyle("SigL", fontSize=7.5, leading=10)),
            Paragraph("<b>DEPARTMENT HEAD / MANAGER</b><br/><br/>________________________________________<br/>Signature &amp; Date", ParagraphStyle("SigM", fontSize=7.5, leading=10)),
            Paragraph("<b>HR &amp; GENERAL MANAGER APPROVAL</b><br/><br/>________________________________________<br/>Signature &amp; Date", ParagraphStyle("SigR", fontSize=7.5, leading=10, alignment=TA_RIGHT)),
        ]
    ], colWidths=[usable_w / 3] * 3)

    sig_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(sig_table)

    # Build PDF
    doc.build(elements)
    return buffer.getvalue()


# =============================================================================
# 2. STANDALONE PRINTABLE HTML BUILDER (Landscape & Portrait Switching)
# =============================================================================

def build_roster_html(week_start_date, dept_param="all", orientation="landscape", auto_print=False, current_user=None):
    """
    Renders a standalone, executive printable HTML page for the Shift Roster.
    Includes top bar with Landscape/Portrait toggles, Print Now, and PDF download links.
    """
    is_landscape = orientation.lower() == "landscape"
    data = get_roster_data_for_export(week_start_date, dept_param)

    comp = Company.query.first()
    company_name = comp.name if comp else "Airport West Hotel"

    _, logo_html_src = _get_logo_source()
    logo_img_tag = ""
    if logo_html_src:
        logo_img_tag = f'<img src="{logo_html_src}" alt="{html.escape(company_name)} Logo" style="height:52px;max-width:180px;object-fit:contain">'

    week_start_str = data["week_start"].isoformat()
    dept_val = str(dept_param)

    # Generate Days Header HTML
    day_headers_html = ""
    for d in data["days"]:
        is_today = d["date"] == date.today()
        weekend_cls = "weekend" if d["is_weekend"] else ""
        today_cls = "today" if is_today else ""
        day_headers_html += f"""
        <th class="th-day {weekend_cls} {today_cls}">
          <div class="day-name">{d['day_name']}</div>
          <div class="day-date">{d['day_num']} {d['month_abbr']}</div>
        </th>
        """

    # Generate Grouped Rows HTML
    rows_html = ""
    for group in data["dept_groups"]:
        rows_html += f"""
        <tr class="dept-header-row">
          <td colspan="8" class="dept-header-cell">
            <div class="dept-title-flex">
              <span class="dept-icon">🏢</span>
              <span class="dept-name">DEPARTMENT: {html.escape(group['dept_name'].upper())}</span>
              <span class="dept-count">({len(group['employees'])} Members)</span>
            </div>
          </td>
        </tr>
        """
        for emp in group["employees"]:
            cells_html = ""
            for day in emp["days"]:
                code = day["code"]
                color = day["color"]
                if code and code != "—":
                    cell_content = f'<div class="shift-badge" style="background:{color}">{html.escape(code)}</div>'
                else:
                    cell_content = '<span class="empty-badge">—</span>'

                cells_html += f'<td class="td-cell">{cell_content}</td>'

            rows_html += f"""
            <tr class="emp-row">
              <td class="td-name">
                <div class="emp-name">{html.escape(emp['name'])}</div>
                <div class="emp-no">{html.escape(emp['employee_no'])}</div>
              </td>
              {cells_html}
            </tr>
            """

    # Shifts Legend HTML
    legend_items_html = ""
    for s in data["shifts"]:
        c = s.code or s.name[:2].upper()
        col = getattr(s, "color", "#0f766e") or "#0f766e"
        hours = f"{s.start_time} – {s.end_time}" if (s.start_time and s.end_time and s.start_time != "00:00") else "Rest Day"
        legend_items_html += f"""
        <div class="legend-item">
          <span class="legend-badge" style="background:{col}">{html.escape(c)}</span>
          <span class="legend-label"><b>{html.escape(s.name)}</b> ({hours})</span>
        </div>
        """

    auto_print_script = "<script>window.addEventListener('load', function() { setTimeout(function(){ window.print(); }, 400); });</script>" if auto_print else ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Shift Roster - {html.escape(data['week_display'])} - {html.escape(company_name)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* CSS Orientation @page */
    @page {{
      size: { 'landscape' if is_landscape else 'portrait' };
      margin: 10mm;
    }}

    * {{ box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }}
    body {{
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      font-size: 12px;
      line-height: 1.4;
    }}

    /* Control Bar (Hidden on print) */
    .no-print-bar {{
      position: sticky;
      top: 0;
      z-index: 1000;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 13px;
    }}
    .no-print-bar .btn-group {{ display: flex; align-items: center; gap: 8px; }}
    .no-print-bar .btn {{
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.1);
      color: #ffffff;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }}
    .no-print-bar .btn:hover {{ background: rgba(255,255,255,0.25); }}
    .no-print-bar .btn.active {{
      background: #0f766e;
      border-color: #0f766e;
      color: #ffffff;
    }}
    .no-print-bar .btn-primary {{
      background: #0f766e;
      border-color: #0f766e;
    }}
    .no-print-bar .btn-primary:hover {{ background: #0d9488; }}

    /* Document Canvas */
    .print-canvas {{
      max-width: { '1120px' if is_landscape else '820px' };
      margin: 24px auto;
      background: #ffffff;
      padding: 24px 28px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.06);
      border-radius: 8px;
    }}

    /* Document Header */
    .doc-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 2px solid #e2e8f0;
      margin-bottom: 16px;
    }}
    .doc-brand {{ display: flex; align-items: center; gap: 16px; }}
    .doc-title-box h1 {{ margin: 0 0 2px 0; font-size: 18px; color: #0f766e; letter-spacing: .02em; font-weight: 800; }}
    .doc-title-box h2 {{ margin: 0 0 4px 0; font-size: 14px; color: #0f172a; font-weight: 700; }}
    .doc-title-box .doc-meta {{ font-size: 11px; color: #64748b; }}
    .doc-meta b {{ color: #0f172a; }}

    .doc-right-meta {{ text-align: right; font-size: 11px; color: #64748b; line-height: 1.5; }}
    .doc-right-meta b {{ color: #0f172a; }}

    /* Roster Table */
    .roster-table {{
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 11px;
    }}
    .roster-table th, .roster-table td {{
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      vertical-align: middle;
      text-align: center;
    }}

    .th-name {{
      width: { '22%' if is_landscape else '26%' };
      text-align: left;
      background: #f8fafc;
      font-size: 10px;
      font-weight: 700;
      color: #475569;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 8px 10px;
    }}
    .th-day {{
      background: #f8fafc;
      font-size: 10px;
      color: #475569;
      padding: 6px 4px;
    }}
    .th-day .day-name {{ font-weight: 700; font-size: 10px; }}
    .th-day .day-date {{ font-size: 9.5px; font-weight: 500; color: #64748b; margin-top: 1px; }}
    .th-day.weekend {{ background: #f1f5f9; }}
    .th-day.today {{ background: #e6f4f2; color: #0f766e; }}

    .dept-header-row {{ background: #e6f4f2; page-break-after: avoid; }}
    .dept-header-cell {{
      text-align: left !important;
      padding: 8px 12px !important;
      border: 1px solid #99f6e4 !important;
      background: #e6f4f2;
    }}
    .dept-title-flex {{
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      font-size: 11.5px;
      color: #0f766e;
      letter-spacing: .04em;
    }}
    .dept-count {{ font-size: 10px; font-weight: 600; color: #0d9488; }}

    .emp-row:hover {{ background: #f8fafc; }}
    .td-name {{ text-align: left !important; padding: 6px 10px !important; }}
    .emp-name {{ font-weight: 700; font-size: 11px; color: #0f172a; }}
    .emp-no {{ font-size: 9.5px; color: #64748b; margin-top: 1px; }}

    .td-cell {{ padding: 4px !important; }}
    .shift-badge {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 26px;
      border-radius: 4px;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .03em;
    }}
    .empty-badge {{ color: #cbd5e1; font-size: 12px; }}

    /* Legend Box */
    .legend-box {{
      margin-top: 16px;
      padding: 10px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      font-size: 10.5px;
    }}
    .legend-title {{ font-weight: 700; color: #475569; font-size: 10px; text-transform: uppercase; }}
    .legend-item {{ display: inline-flex; align-items: center; gap: 6px; }}
    .legend-badge {{
      display: inline-block;
      width: 22px;
      height: 18px;
      line-height: 18px;
      text-align: center;
      border-radius: 3px;
      color: #ffffff;
      font-weight: 700;
      font-size: 9.5px;
    }}

    /* Sign-off Section */
    .sign-section {{
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding-top: 14px;
      border-top: 1px dashed #cbd5e1;
      font-size: 10.5px;
    }}
    .sign-box {{ flex: 1; }}
    .sign-title {{ font-weight: 700; color: #475569; margin-bottom: 28px; text-transform: uppercase; font-size: 9.5px; }}
    .sign-line {{ border-bottom: 1px solid #94a3b8; margin-bottom: 4px; }}
    .sign-sub {{ font-size: 9px; color: #64748b; }}

    /* Print Specific Media Query */
    @media print {{
      .no-print {{ display: none !important; }}
      body {{ background: #ffffff !important; padding: 0 !important; }}
      .print-canvas {{
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
      }}
      .roster-table {{ font-size: { '9.5pt' if is_landscape else '8pt' } !important; }}
      .shift-badge {{ height: { '22px' if is_landscape else '19px' } !important; font-size: 9pt !important; }}
      tr {{ page-break-inside: avoid; }}
      .dept-header-row {{ page-break-after: avoid; }}
    }}
  </style>
</head>
<body class="orientation-{'landscape' if is_landscape else 'portrait'}">

  <!-- No-Print Top Navigation Controls -->
  <div class="no-print-bar no-print">
    <div class="btn-group">
      <span style="font-weight:700;letter-spacing:.02em;margin-right:8px">🖨️ ROSTER PRINT &amp; PDF EXPORT</span>
      <span style="font-size:11px;color:#94a3b8">Orientation:</span>
      <a href="/api/v1/roster/print?week_start={week_start_str}&department_id={dept_val}&orientation=landscape&auto_print=0"
         class="btn {'active' if is_landscape else ''}">📐 Landscape (Wide)</a>
      <a href="/api/v1/roster/print?week_start={week_start_str}&department_id={dept_val}&orientation=portrait&auto_print=0"
         class="btn {'active' if not is_landscape else ''}">📐 Portrait (Tall)</a>
    </div>

    <div class="btn-group">
      <button type="button" class="btn btn-primary" onclick="window.print()">🖨️ Print Now</button>
      <a href="/api/v1/roster/pdf?week_start={week_start_str}&department_id={dept_val}&orientation={'landscape' if is_landscape else 'portrait'}"
         class="btn" download>⬇️ Download PDF ({ 'Landscape' if is_landscape else 'Portrait' })</a>
      <button type="button" class="btn" onclick="window.close(); if(history.length>1) history.back();">✖️ Close</button>
    </div>
  </div>

  <!-- Document Canvas -->
  <div class="print-canvas">

    <!-- Document Header -->
    <div class="doc-header">
      <div class="doc-brand">
        {logo_img_tag}
        <div class="doc-title-box">
          <h1>{html.escape(company_name.upper())}</h1>
          <h2>WEEKLY SHIFT ROSTER</h2>
          <div class="doc-meta">
            Schedule Week: <b>{html.escape(data['week_display'])}</b> &nbsp;|&nbsp;
            Scope: <b>{html.escape(data['dept_title'])}</b>
          </div>
        </div>
      </div>
      <div class="doc-right-meta">
        <div>Date Printed: <b>{datetime.now().strftime('%d %b %Y, %H:%M')}</b></div>
        <div>Total Employees: <b>{data['total_employees']} Staff</b></div>
        <div>Layout: <b>{ 'Landscape (Recommended)' if is_landscape else 'Portrait' }</b></div>
      </div>
    </div>

    <!-- Calendar Table -->
    <table class="roster-table">
      <thead>
        <tr>
          <th class="th-name">TEAM MEMBER</th>
          {day_headers_html}
        </tr>
      </thead>
      <tbody>
        {rows_html}
      </tbody>
    </table>

    <!-- Legend -->
    <div class="legend-box">
      <span class="legend-title">Shift Legend:</span>
      {legend_items_html}
    </div>

    <!-- Signatures -->
    <div class="sign-section">
      <div class="sign-box">
        <div class="sign-title">Prepared By (Roster Officer)</div>
        <div class="sign-line"></div>
        <div class="sign-sub">Signature &amp; Date</div>
      </div>
      <div class="sign-box">
        <div class="sign-title">Department Head / Manager</div>
        <div class="sign-line"></div>
        <div class="sign-sub">Signature &amp; Date</div>
      </div>
      <div class="sign-box">
        <div class="sign-title">HR &amp; General Manager Approval</div>
        <div class="sign-line"></div>
        <div class="sign-sub">Signature &amp; Date</div>
      </div>
    </div>

  </div>

  {auto_print_script}
</body>
</html>
"""
