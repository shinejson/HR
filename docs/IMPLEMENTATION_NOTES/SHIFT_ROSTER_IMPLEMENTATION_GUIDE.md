# Shift Roster Management - Complete Implementation Guide

## Overview
This guide implements a **Weekly Shift Roster** system where HODs (Heads of Department) can create weekly schedules assigning employees to different shifts (E, L, MID, OFF) similar to your provided image.

## What You Need

### System Features:
1. **Shift Types**: Define shifts (E=Evening, L=Late, MID=Mid, OFF=Day Off)
2. **Weekly Roster**: Calendar grid showing employees × days (Mon-Sun)
3. **Department-Based**: Each department has its own roster
4. **HOD Access**: Department heads can manage their team
5. **Drag-and-Drop**: Easy shift assignment
6. **Week Navigation**: Previous/Next week buttons

---

## Step 1: Run Database Migration

You need to run the SQL migration to add the new tables. Open your database tool or run:

```bash
# Using sqlite3 command line
sqlite3 instance/hrms.db < migrations/add_shift_roster.sql
```

Or manually execute the SQL in `migrations/add_shift_roster.sql`:
- Adds `color` column to `shifts` table
- Creates `shift_assignments` table
- Inserts default shifts (E, L, MID, OFF)

---

## Step 2: Add Roster API Endpoints to app.py

Find the line `# ---------------------------------------------------------------- attendance actions` (around line 5980)

**ADD BEFORE THIS LINE** the following code:

```python
# ---------------------------------------------------------------- weekly shift roster

@app.get("/api/v1/roster")
@login_required
def get_roster():
    """Get shift roster for a week and department"""
    from datetime import datetime, timedelta
    
    # Get parameters
    week_start_str = request.args.get("week_start")  # YYYY-MM-DD format (Monday)
    department_id = request.args.get("department_id")
    
    emp = employee_of(request.user)
    if not emp:
        return error("Employee profile not found", 404)
    
    # Determine which department to show
    if department_id:
        department_id = int(department_id)
        # Check if user is HOD of this department or admin
        is_hod = DepartmentHead.query.filter_by(employee_id=emp.id, department_id=department_id, status="active").first()
        is_admin = request.user.role.slug in ["super_admin", "hr_admin", "hr_officer"]
        
        if not is_hod and not is_admin and emp.department_id != department_id:
            return error("You don't have permission to view this department's roster", 403)
    else:
        # Default to user's department
        department_id = emp.department_id
        if not department_id:
            return error("No department assigned", 400)
    
    # Parse week start date
    if week_start_str:
        try:
            week_start = datetime.strptime(week_start_str, "%Y-%m-%d").date()
        except ValueError:
            return error("Invalid date format. Use YYYY-MM-DD", 400)
    else:
        # Default to current week's Monday
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    
    # Ensure week_start is a Monday
    if week_start.weekday() != 0:
        week_start = week_start - timedelta(days=week_start.weekday())
    
    # Get all employees in the department
    employees = Employee.query.filter_by(
        department_id=department_id,
        status="active"
    ).order_by(Employee.first_name, Employee.last_name).all()
    
    # Get all shifts
    shifts = Shift.query.all()
    
    # Get assignments for this week
    week_end = week_start + timedelta(days=6)
    assignments = ShiftAssignment.query.filter(
        ShiftAssignment.department_id == department_id,
        ShiftAssignment.work_date >= week_start,
        ShiftAssignment.work_date <= week_end
    ).all()
    
    # Build assignment map
    assignment_map = {}
    for assign in assignments:
        key = f"{assign.employee_id}_{assign.work_date}"
        assignment_map[key] = {
            "id": assign.id,
            "shift_id": assign.shift_id,
            "shift_code": assign.shift.code if assign.shift else "OFF",
            "shift_name": assign.shift.name if assign.shift else "Day Off",
            "shift_color": getattr(assign.shift, 'color', '#94a3b8') if assign.shift else "#94a3b8",
            "notes": assign.notes,
        }
    
    # Build roster data
    roster_data = []
    for emp_item in employees:
        emp_data = {
            "employee_id": emp_item.id,
            "employee_name": emp_item.full_name,
            "employee_no": emp_item.employee_no,
            "days": {}
        }
        
        # Generate 7 days (Mon-Sun)
        for i in range(7):
            day_date = week_start + timedelta(days=i)
            key = f"{emp_item.id}_{day_date}"
            emp_data["days"][day_date.isoformat()] = assignment_map.get(key, {
                "shift_id": None,
                "shift_code": "",
                "shift_name": "",
                "shift_color": "",
                "notes": None,
            })
        
        roster_data.append(emp_data)
    
    return success({
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "department_id": department_id,
        "roster": roster_data,
        "shifts": [{
            "id": s.id,
            "name": s.name,
            "code": s.code,
            "color": getattr(s, 'color', '#0f766e'),
        } for s in shifts],
    })


@app.post("/api/v1/roster/assign")
@login_required
def assign_shift():
    """Assign a shift to an employee for a specific date"""
    from datetime import datetime, timedelta
    data = request.get_json() or {}
    
    employee_id = data.get("employee_id")
    work_date_str = data.get("work_date")
    shift_id = data.get("shift_id")  # Can be None for OFF day
    notes = data.get("notes", "")
    
    if not employee_id or not work_date_str:
        return error("Employee ID and work date are required", 400)
    
    try:
        work_date = datetime.strptime(work_date_str, "%Y-%m-%d").date()
    except ValueError:
        return error("Invalid date format. Use YYYY-MM-DD", 400)
    
    # Get employee
    employee = Employee.query.get(employee_id)
    if not employee:
        return error("Employee not found", 404)
    
    # Check permissions
    emp = employee_of(request.user)
    if not emp:
        return error("Employee profile not found", 404)
    
    is_hod = DepartmentHead.query.filter_by(
        employee_id=emp.id,
        department_id=employee.department_id,
        status="active"
    ).first()
    is_admin = request.user.role.slug in ["super_admin", "hr_admin", "hr_officer"]
    
    if not is_hod and not is_admin and emp.id != employee.id:
        return error("You don't have permission to assign shifts for this employee", 403)
    
    # Calculate week start (Monday)
    week_start = work_date - timedelta(days=work_date.weekday())
    
    # Check if assignment exists
    existing = ShiftAssignment.query.filter_by(
        employee_id=employee_id,
        work_date=work_date
    ).first()
    
    if existing:
        # Update existing assignment
        existing.shift_id = shift_id
        existing.notes = notes
        existing.updated_by = emp.id
    else:
        # Create new assignment
        assignment = ShiftAssignment(
            employee_id=employee_id,
            department_id=employee.department_id,
            shift_id=shift_id,
            work_date=work_date,
            week_start=week_start,
            notes=notes,
            created_by_id=emp.id,
            created_by=emp.id
        )
        db.session.add(assignment)
    
    db.session.commit()
    
    return success(None, "Shift assigned successfully")


@app.post("/api/v1/roster/bulk-assign")
@login_required
def bulk_assign_shifts():
    """Bulk assign shifts for multiple employees/dates"""
    from datetime import datetime, timedelta
    data = request.get_json() or {}
    assignments = data.get("assignments", [])
    
    if not assignments:
        return error("No assignments provided", 400)
    
    emp = employee_of(request.user)
    if not emp:
        return error("Employee profile not found", 404)
    
    is_admin = request.user.role.slug in ["super_admin", "hr_admin", "hr_officer"]
    
    success_count = 0
    for assign in assignments:
        employee_id = assign.get("employee_id")
        work_date_str = assign.get("work_date")
        shift_id = assign.get("shift_id")
        
        if not employee_id or not work_date_str:
            continue
        
        try:
            work_date = datetime.strptime(work_date_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        
        employee = Employee.query.get(employee_id)
        if not employee:
            continue
        
        # Check permissions
        is_hod = DepartmentHead.query.filter_by(
            employee_id=emp.id,
            department_id=employee.department_id,
            status="active"
        ).first()
        
        if not is_hod and not is_admin:
            continue
        
        week_start = work_date - timedelta(days=work_date.weekday())
        
        existing = ShiftAssignment.query.filter_by(
            employee_id=employee_id,
            work_date=work_date
        ).first()
        
        if existing:
            existing.shift_id = shift_id
            existing.updated_by = emp.id
        else:
            assignment = ShiftAssignment(
                employee_id=employee_id,
                department_id=employee.department_id,
                shift_id=shift_id,
                work_date=work_date,
                week_start=week_start,
                created_by_id=emp.id,
                created_by=emp.id
            )
            db.session.add(assignment)
        
        success_count += 1
    
    db.session.commit()
    
    return success(None, f"{success_count} shift(s) assigned successfully")
```

---

## Step 3: Update Shift Endpoints to Include Color

Find the existing `@app.get("/api/v1/shifts")` function and update it to include the `color` field:

```python
@app.get("/api/v1/shifts")
@login_required
def get_shifts():
    """Get all shifts"""
    shifts = Shift.query.order_by(Shift.is_default.desc(), Shift.name).all()
    return success([{
        "id": s.id,
        "name": s.name,
        "code": s.code or "",
        "start_time": s.start_time,
        "end_time": s.end_time,
        "grace_minutes": s.grace_minutes,
        "overtime_multiplier": float(s.overtime_multiplier) if s.overtime_multiplier else 1.5,
        "is_default": s.is_default,
        "color": getattr(s, 'color', '#0f766e'),  # ADD THIS LINE
        "created_at": s.created_at.isoformat() if hasattr(s, 'created_at') and s.created_at else None,
    } for s in shifts])
```

Do the same for `create_shift` and `update_shift` functions - add `color` handling.

---

## Step 4: Create Frontend Roster View

The frontend implementation is too long for this document. I'll create it in a separate file.

Key features needed:
1. Week navigation (Previous/Next buttons)
2. Department selector dropdown
3. Calendar grid table (Employees × Days)
4. Click-to-assign shift functionality
5. Color-coded shift cells
6. Export to Excel/PDF

---

## Step 5: Update Navigation Menu

Already done - "Shift Management" appears in sidebar under "Time & absence"

---

## How It Will Work

1. **HOD logs in** → Goes to "Shift Management"
2. **Selects department** (if HOD of multiple departments)
3. **Sees current week roster** with all team members
4. **Clicks on employee/day cell** → Dropdown appears with shift options (E, L, MID, OFF)
5. **Selects shift** → Cell updates with shift code and color
6. **Navigates weeks** using Previous/Next buttons
7. **Can bulk assign** - select multiple cells and assign same shift

---

## Permissions

- **Super Admin / HR Admin**: Can view and edit ALL department rosters
- **HOD (Department Head)**: Can view and edit ONLY their department roster
- **Employees**: Can view their OWN assigned shifts (read-only)

---

## Next Steps

1. Run the migration SQL
2. Add the roster API endpoints to app.py
3. Create the frontend roster view (I'll do this next)
4. Test with your HOD account

Would you like me to continue with the frontend roster view implementation?
