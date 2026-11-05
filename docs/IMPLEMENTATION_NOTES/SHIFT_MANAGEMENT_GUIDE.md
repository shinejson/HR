<<<<<<< HEAD
# Shift Management - Location Guide

## Current Status
The **Shift Management** feature exists in the database (backend) but **does not have a user interface (UI) yet**.

### What Exists:
- ✅ **Database Model**: `Shift` model in `models.py` (line 470)
- ✅ **Backend Data**: Shifts are loaded in the system at `/api/organisation/init` endpoint
- ✅ **Shift Fields**:
  - Name (e.g., "Morning Shift", "Evening Shift")
  - Start time & End time
  - Grace minutes (late tolerance)
  - Overtime multiplier
  - Is default flag

### What's Missing:
- ❌ **No navigation menu item** in the sidebar
- ❌ **No UI view/page** to display or manage shifts
- ❌ **No frontend JavaScript** component (no `shifts.js` file)
- ❌ **No API endpoints** for CRUD operations on shifts

## Where It Should Be Located

Based on your HRMS structure, Shift Management should logically be placed in one of these locations:

### Option 1: Under "Time & absence" (Recommended)
```
Time & absence
  ├── Attendance
  ├── Leave
  ├── Sell Leaves
  └── [NEW] Shift Management  ⭐
```

**Why**: Shifts directly relate to attendance tracking and clock-in/clock-out functionality.

### Option 2: Under "System → Administration"
```
System
  └── Administration
      ├── Roles & permissions
      ├── Leave types
      ├── Expense categories
      └── [NEW] Shift Management  ⭐
```

**Why**: Shifts are a system-wide configuration similar to leave types and categories.

## How to Implement the UI

To make Shift Management accessible, you need to:

### 1. Add Navigation Menu Item
**File**: `static/js/app.js` (around line 31)

Add to the "Time & absence" section:
```javascript
{
  label: "Time & absence", icon: "clock",
  items: [
    { id: "attendance", label: "Attendance", icon: "clock" },
    { id: "leave", label: "Leave", icon: "calendar" },
    { id: "leave", label: "Sell Leaves", icon: "dollar", subTab: "encashment" },
    { id: "shifts", label: "Shift Management", icon: "calendar", roles: ["super_admin", "hr_admin"] }, // NEW
  ],
},
```

### 2. Create API Endpoints
**File**: `app.py`

Add CRUD endpoints for shifts:
```python
@app.route("/api/shifts", methods=["GET"])
@auth_required
def get_shifts():
    shifts = Shift.query.all()
    return success([{
        "id": s.id,
        "name": s.name,
        "start_time": s.start_time,
        "end_time": s.end_time,
        "grace_minutes": s.grace_minutes,
        "overtime_multiplier": float(s.overtime_multiplier),
        "is_default": s.is_default,
    } for s in shifts])

@app.route("/api/shifts", methods=["POST"])
@auth_required
@admin_required
def create_shift():
    # Create new shift logic
    pass

@app.route("/api/shifts/<int:shift_id>", methods=["PUT"])
@auth_required
@admin_required
def update_shift(shift_id):
    # Update shift logic
    pass

@app.route("/api/shifts/<int:shift_id>", methods=["DELETE"])
@auth_required
@admin_required
def delete_shift(shift_id):
    # Delete shift logic
    pass
```

### 3. Create Frontend View
**File**: `static/js/shifts.js` (new file)

Create a view component to display and manage shifts:
```javascript
Views.shifts = async function (root) {
  root.innerHTML = pageHead("Shift Management", "Loading shifts...") + spinners(3);
  
  try {
    const res = await API.get("/shifts");
    const shifts = res.data || [];
    
    root.innerHTML = pageHead(
      "Shift Management",
      "Configure work shifts, schedules, and overtime policies.",
      '<button class="btn btn-accent" id="btn-new-shift">' + icon("plus", 15) + ' Add Shift</button>',
      "Time & Absence"
    )
    + renderTable({
      id: "shifts-table",
      title: "Configured Shifts",
      columns: [
        { label: "Shift Name", render: r => '<b>' + esc(r.name) + '</b>' },
        { label: "Start Time", render: r => esc(r.start_time) },
        { label: "End Time", render: r => esc(r.end_time) },
        { label: "Grace Period", render: r => esc(r.grace_minutes) + ' mins' },
        { label: "OT Multiplier", render: r => esc(r.overtime_multiplier) + 'x' },
        { label: "Default", render: r => r.is_default ? chip("green", "Yes") : chip("muted", "No") },
        { label: "", class: "right", render: r => Records.buttons(r.id, "shifts") },
      ],
      rows: shifts,
      emptyTitle: "No shifts configured",
    });
    
    // Bind events
    root.querySelector("#btn-new-shift")?.addEventListener("click", () => openShiftModal());
    
  } catch (err) {
    root.innerHTML = pageHead("Shift Management", "Failed to load shifts");
    showToast(err.message || "Failed to load shifts", "error");
  }
};
```

### 4. Update index.html
**File**: `templates/index.html`

Add the new shifts.js script:
```html
<script src="/static/js/shifts.js?v=1.0.30"></script>
```

### 5. Add to PAGES constant
**File**: `static/js/app.js` (around line 103)

```javascript
const PAGES = {
  // ... existing pages ...
  shifts: "Shift Management", // NEW
};
```

## Quick Access Steps (Once Implemented)

1. Login as **Super Admin** or **HR Admin**
2. Navigate to **Time & absence** in the sidebar
3. Click **Shift Management**
4. You'll see a table of all configured shifts
5. Use **+ Add Shift** button to create new shifts
6. Edit/Delete existing shifts using action buttons

## Current Workaround

Since there's no UI yet, shifts can only be managed directly in the database:

1. Open database: `instance/hrms.db`
2. Access table: `shifts`
3. Manually insert/update shift records

**Example SQL**:
```sql
INSERT INTO shifts (name, start_time, end_time, grace_minutes, overtime_multiplier, is_default)
VALUES ('Morning Shift', '08:00', '16:00', 15, 1.5, 1);

INSERT INTO shifts (name, start_time, end_time, grace_minutes, overtime_multiplier, is_default)
VALUES ('Evening Shift', '16:00', '00:00', 10, 2.0, 0);
```

## Summary

**Shift Management exists in the backend but needs a complete frontend implementation**. The data model is ready, but you'll need to:
1. Add navigation menu item
2. Create API endpoints
3. Build the frontend view component
4. Create modal forms for add/edit

Would you like me to implement the complete Shift Management UI for you?
=======
# Shift schedules

Under **Time & absence → Shift schedules**, employees can view and print their own assignments. A user linked to an active employee who is the department's configured head (either Department head or an active `head` leadership record) can select that department's **Manage** schedule. Other users, including administrators who are not the department head, cannot open or modify that department's planner.

1. Select the department in the Schedule list.
2. Check the shifts the department uses and adjust their names and times, or add a custom shift. Save the configuration before making assignments. The initial Morning 06:00–14:00, Mid 10:00–18:00 and Afternoon 14:00–22:00 times are examples and can be changed. End times earlier than start times mean an overnight shift.
3. Select an active employee, date and enabled shift. Add an optional observation/time note and save. Saving the same employee and date replaces the existing assignment; Remove deletes it.
4. Filter by date if needed and print the displayed schedule. Employees use the same page to see and print only their own sheet.

Assignments retain the shift name and times in effect when saved, even if the configuration is changed later. Employees who move departments no longer see the former department's assignments, and the former head cannot manage them.
>>>>>>> 0f1d0c01b226d81b7623e50ec97d443f7cee20f8
