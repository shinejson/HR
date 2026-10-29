# Leave Balance Calculation Fix

## Issue
The "My balance" card was showing **149 days** instead of the correct annual leave balance (around 25-30 days).

### Root Cause
The calculation was summing up balances from **ALL leave types** instead of just Annual Leave:

```javascript
// BEFORE (Wrong):
balances.reduce((a, b) => a + (Number(b.entitled) - Number(b.taken) - Number(b.pending)), 0)

// This added up:
// - Annual Leave: 30 days
// - Sick Leave: 10 days  
// - Maternity: 84 days
// - Paternity: 5 days
// - Compassionate: 5 days
// - Unpaid: 10 days
// - Study Leave: 5 days
// TOTAL = 149 days! ❌
```

## Solution
Updated the calculation to show **only Annual Leave balance** and properly include carried-over days:

```javascript
// AFTER (Correct):
const annualLeave = balances.find(b => 
  b.leave_type_name && 
  b.leave_type_name.toLowerCase().includes('annual')
);

if (annualLeave) {
  const entitled = Number(annualLeave.entitled || 0);        // 30 days
  const carriedOver = Number(annualLeave.carried_over || 0); // e.g., 3 days
  const taken = Number(annualLeave.taken || 0);              // e.g., 5 days
  const pending = Number(annualLeave.pending || 0);          // e.g., 2 days
  const total = entitled + carriedOver;                       // 30 + 3 = 33
  const remaining = Math.max(0, total - taken - pending);    // 33 - 5 - 2 = 26 ✓
}
```

## What Changed

### Before:
```
┌──────────────────────────┐
│ My balance               │
│      149 days            │ ← Wrong! (All leave types)
└──────────────────────────┘
```

### After:
```
┌──────────────────────────┐
│ My Annual Leave Balance  │
│    26 / 33 days          │ ← Correct! (remaining / total)
│ Includes 3 days c/o      │ ← Shows carry-over if any
└──────────────────────────┘
```

## Display Logic

**If has carried over balance:**
```
┌───────────────────────────────┐
│ My Annual Leave Balance       │
│    26 / 33 days               │
│ Includes 3 days carried over  │
└───────────────────────────────┘
```

**If no carried over:**
```
┌───────────────────────────────┐
│ My Annual Leave Balance       │
│    25 / 30 days               │
│ 30 days entitled              │
└───────────────────────────────┘
```

## Calculation Formula

```
Entitled:        30 days/year (fixed)
Carried Over:    X days (from previous year)
─────────────────────────────────────────
Total Allocation: 30 + X days

Taken:           Y days (approved requests)
Pending:         Z days (awaiting approval)
─────────────────────────────────────────
Remaining:       (30 + X) - Y - Z days
```

## Example Scenarios

### Scenario 1: New Employee (No History)
```
Entitled: 30
Carried Over: 0
Taken: 0
Pending: 0
─────────────────
Remaining: 30 / 30 days
Display: "30 days entitled"
```

### Scenario 2: Employee with Carry-Over
```
Entitled: 30
Carried Over: 3
Taken: 5
Pending: 2
─────────────────
Remaining: 26 / 33 days
Display: "Includes 3 days carried over"
```

### Scenario 3: Most Leave Used
```
Entitled: 30
Carried Over: 5
Taken: 28
Pending: 3
─────────────────
Remaining: 4 / 35 days
Display: "Includes 5 days carried over"
```

## Files Modified

**static/js/views2.js** - Line 700-722
- Changed from summing all leave types to showing only Annual Leave
- Added carried_over to calculation
- Shows "remaining / total" format
- Displays carry-over message when applicable

## Testing

### To Verify Fix:
1. **Refresh browser** (Ctrl+F5 to clear cache)
2. Go to **Leave** section
3. Check "My Annual Leave Balance" card
4. Should show realistic number (20-35 days range)

### Expected Values:
- **Without carry-over**: 25-30 days (depending on usage)
- **With carry-over**: 28-35 days (includes previous year's balance)

### To Test Carry-Over Display:
1. Add some carry-over via API:
```javascript
await API.post("/leave-balances/carry-over", {
  employee_id: Store.user.employee_id,
  leave_type_id: 1,
  year: 2026,
  carried: 3
});
```
2. Refresh page
3. Should see "Includes 3 days carried over"

## Why This Matters

**Wrong calculation (149 days):**
- Confusing for employees
- Not realistic
- Includes all leave types (sick, maternity, etc.)

**Correct calculation (26 days):**
- ✅ Shows only Annual Leave
- ✅ Includes carried over days
- ✅ Clear "remaining / total" format
- ✅ Accurate and actionable

## Database Query to Verify

To check your actual balance:

```sql
SELECT 
  e.full_name,
  lt.name AS leave_type,
  lb.entitled,
  lb.carried_over,
  (lb.entitled + lb.carried_over) AS total_allocation,
  lb.taken,
  lb.pending,
  (lb.entitled + lb.carried_over - lb.taken - lb.pending) AS remaining
FROM leave_balances lb
JOIN employees e ON e.id = lb.employee_id
JOIN leave_types lt ON lt.id = lb.leave_type_id
WHERE e.id = YOUR_EMPLOYEE_ID
AND lt.code = 'ANL'
AND lb.year = 2026;
```

## Summary

**Fixed:** Leave balance now correctly shows Annual Leave only (not all leave types)
**Added:** Carries over days are included in total
**Display:** Shows "remaining / total" format with helpful context
**Result:** Realistic, accurate balance (25-35 days instead of 149 days)

Just refresh your browser to see the fix! 🎉
