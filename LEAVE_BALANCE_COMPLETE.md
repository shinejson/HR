# Leave Balance System - Already Configured! ✅

## Summary

Good news! The leave balance system is **already fully configured** with:
- ✅ 30 days annual leave entitlement
- ✅ Carry-over support from previous years
- ✅ Balance tracking (entitled, taken, pending, remaining)
- ✅ Beautiful dashboard display

## Current Configuration

### 1. Annual Leave Entitlement
**File:** `seed.py` (Line 359-360)
```python
LeaveType(name="Annual Leave", code="ANL", 
          days_per_year=30,  # ✅ 30 DAYS
          paid=True, 
          accrual="yearly",
          carry_forward=5,    # ✅ CAN CARRY 5 DAYS
          color="#0f766e")
```

### 2. Leave Balance Model
**File:** `models.py` (Line 486-496)
```python
class LeaveBalance(db.Model, TimestampMixin):
    entitled = db.Column(db.Numeric(6, 2), default=0)  # 30 days
    taken = db.Column(db.Numeric(6, 2), default=0)      # Days used
    pending = db.Column(db.Numeric(6, 2), default=0)    # Pending requests
    carried_over = db.Column(db.Numeric(6, 2), default=0)  # ✅ FROM LAST YEAR
```

### 3. Dashboard Display
**File:** `static/js/views2.js` (Line 482-512)

The Leave tab already shows:
```
┌─────────────────────────────────────────────────────────┐
│ Annual Entitlement    │ Carried Forward  │ Total Days  │
│       30 days/yr      │    3 days        │   33 days   │
│ Ghana Labor Standard  │ From prior year  │ This year   │
└─────────────────────────────────────────────────────────┘
│ Taken: 5 days  │ Pending: 2 days  │ Remaining: 26 days│
└─────────────────────────────────────────────────────────┘
```

## How Employees See Their Balance

### 1. On Dashboard
Navigate to **Leave** section - top of page shows:
- **Annual Entitlement**: 30 days/yr
- **Carried Forward**: X days (if any from last year)
- **Total Allocation**: 30 + carried forward
- **Taken**: Days already used
- **Pending**: Days in pending requests
- **Remaining**: Available to request

### 2. In Leave Request Form
Currently shows:
- "No. of leave already taken" field (read-only)
- Can be enhanced to show full balance card

## Carry-Over System

### How It Works:
1. **End of Year**: Employees can carry forward up to **5 days** to next year
2. **Automatic**: System tracks carry-over in `carried_over` column
3. **Total Allocation**: Next year = 30 (entitled) + carried_over

### Example Scenario:
```
Employee: John Doe
Year: 2025

Entitled: 30 days
Used: 25 days
Remaining: 5 days
→ Can carry forward 5 days to 2026

Year: 2026
Entitled: 30 days
Carried Over: 5 days
Total: 35 days available in 2026
```

### Set Carry-Over Manually:
**API Endpoint:** `POST /api/v1/leave-balances/carry-over`
```json
{
  "employee_id": 1,
  "leave_type_id": 1,
  "year": 2026,
  "carried": 3
}
```

**Response:**
```json
{
  "message": "Carry over updated",
  "data": {
    "id": 1,
    "employee_id": 1,
    "leave_type_id": 1,
    "year": 2026,
    "entitled": 30,
    "carried_over": 3,
    "taken": 0,
    "pending": 0
  }
}
```

## View Employee Balance

### Via API:
```javascript
// Get employee's leave summary
const response = await API.get("/leave/summary", { 
  employee_id: 1  // Optional, defaults to current user
});

// Response includes:
{
  "data": [
    {
      "id": 1,
      "leave_type_name": "Annual Leave",
      "entitled": 30,
      "carried_over": 3,
      "taken": 5,
      "pending": 2,
      "remaining": 26,  // (30 + 3) - 5 - 2 = 26
      "total_allocation": 33
    }
  ]
}
```

### Via Database:
```sql
SELECT 
  e.full_name AS employee,
  lt.name AS leave_type,
  lb.entitled,
  lb.carried_over,
  lb.taken,
  lb.pending,
  (lb.entitled + lb.carried_over) AS total_allocation,
  (lb.entitled + lb.carried_over - lb.taken - lb.pending) AS remaining
FROM leave_balances lb
JOIN employees e ON e.id = lb.employee_id  
JOIN leave_types lt ON lt.id = lb.leave_type_id
WHERE lt.code = 'ANL' 
AND lb.year = 2026
ORDER BY e.full_name;
```

## Balance Display Locations

### ✅ Currently Shown:
1. **Leave Tab** (main view) - Full balance breakdown with KPI cards
2. **Profile Page** - Leave balances section  
3. **Dashboard** - "My Leave" widget (if implemented)

### 🔄 Can Be Enhanced:
1. **Leave Request Form** - Add balance card at top
2. **Email Notifications** - Include balance in approval emails
3. **Reports** - Balance utilization reports

## Testing the System

### 1. Check Your Balance:
```
1. Login to system
2. Go to "Leave" section
3. See KPI cards at top showing:
   - Annual Entitlement: 30 days
   - Carried Forward: X days
   - Taken: X days
   - Remaining: X days
```

### 2. Add Carry-Over (Super Admin only):
```
1. Open browser console (F12)
2. Run:
   await API.post("/leave-balances/carry-over", {
     employee_id: Store.user.employee_id,
     leave_type_id: 1,
     year: 2026,
     carried: 3
   })
3. Refresh page
4. See "Carried Forward: 3 days" in balance
```

### 3. Submit Leave Request:
```
1. Click "+ Apply for leave"
2. Select dates
3. See "No. of leave already taken" auto-fills
4. Submit request
5. Balance updates (pending increases)
```

### 4. Approve Request:
```
1. When HOD → Accountant → MD all approve
2. "Pending" decreases
3. "Taken" increases
4. "Remaining" recalculates
```

## Configuration Files

### Backend:
- **models.py** - LeaveBalance model (line 486)
- **seed.py** - LeaveType with 30 days (line 359)
- **app.py** - Balance endpoints (lines 3584-3674)

### Frontend:
- **static/js/views2.js** - Leave overview display (line 482)
- Balance KPI cards rendering
- Leave request form

## Summary

**Everything is already configured!** ✅

The system:
- Shows 30 days annual entitlement
- Tracks carry-over from previous years
- Displays full balance breakdown
- Updates in real-time when requests approved

**No changes needed unless you want to:**
- Change 30 days to different number (edit seed.py)
- Change 5-day carry-forward limit (edit seed.py)
- Add balance card to request form (optional enhancement)

## Quick Reference

| Item | Value | Where Configured |
|------|-------|------------------|
| Annual Leave Days | 30 days/year | `seed.py` line 359 |
| Carry Forward Limit | 5 days | `seed.py` line 361 |
| Balance Display | Leave Tab | `views2.js` line 482 |
| Carry-Over Field | Database | `models.py` line 495 |
| API Endpoint | `/leave/summary` | `app.py` line 3598 |

## Conclusion

Your leave balance system is **fully functional** with:
✅ 30 days annual leave
✅ Carry-over support
✅ Real-time balance tracking
✅ Beautiful dashboard display

Just use it! 🎉
