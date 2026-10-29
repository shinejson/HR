# Leave Balance Display - Implementation Guide

## Summary
The leave form now needs to show:
1. **30 days annual leave entitlement** (already configured in seed.py)
2. **Carried over balance** from previous year
3. **Days already taken** this year
4. **Remaining balance**

## Current Status

✅ **Backend Already Supports:**
- LeaveBalance model has `carried_over` field
- Annual Leave (ANL) set to 30 days_per_year
- Carry forward limit of 5 days
- `/leave/summary` API endpoint returns balance data

## What Needs to Be Done

### Option 1: Simple Display (Recommended for Now)
Add balance information above the leave request form by fetching it when form opens.

**Steps:**
1. Wrap the `openModal()` call inside an API call to fetch balance
2. Display balance in a prominent card
3. Show warning if requested days exceed balance

### Option 2: Read from Dashboard
The dashboard already shows leave balance - we can reference it from `Store` if available.

## Quick Implementation

Since the function is complex and has many features already (digital signatures, approval chains), I recommend adding the balance display as follows:

**Location:** In `static/js/views2.js`, line ~765 in `openLeaveForm()`

**Add this code** before the `openModal()` call:

```javascript
// Fetch leave balance first
API.get("/leave/summary", { employee_id: user.employee_id }).then(balRes => {
  const balances = balRes.data || [];
  const annualLeave = balances.find(b => b.leave_type_name && b.leave_type_name.toLowerCase().includes('annual')) || {};
  
  const entitled = Number(annualLeave.entitled || 30);
  const carriedOver = Number(annualLeave.carried_over || 0);
  const taken = Number(annualLeave.taken || 0);
  const pending = Number(annualLeave.pending || 0);
  const totalAllocation = entitled + carriedOver;
  const remaining = Math.max(0, totalAllocation - taken - pending);
  
  // Now open modal with balance data...
  // (rest of openModal code)
}).catch(err => {
  console.error("Could not fetch balance", err);
  // Open modal anyway with default values
});
```

**Then add balance card HTML** after Employee Information card:

```javascript
+ '<div class="card" style="background:linear-gradient(135deg, var(--accent-bg) 0%, var(--paper) 100%);border:2px solid var(--accent-light)">'
+ '<div class="card-head"><h3 style="color:var(--accent)">📅 Your Annual Leave Balance ' + new Date().getFullYear() + '</h3></div>'
+ '<div class="card-body">'
+ '<div class="grid grid-4" style="gap:16px;text-align:center">'
+ '<div><div class="tiny muted">Entitled</div><div style="font-size:28px;font-weight:600">' + entitled + '</div><div class="tiny">days</div></div>'
+ '<div><div class="tiny muted">Carried Over</div><div style="font-size:28px;font-weight:600;color:var(--blue)">' + carriedOver + '</div><div class="tiny">days</div></div>'
+ '<div><div class="tiny muted">Taken</div><div style="font-size:28px;font-weight:600;color:var(--orange)">' + taken + '</div><div class="tiny">days</div></div>'
+ '<div style="background:var(--accent);color:white;border-radius:10px;padding:12px"><div class="tiny" style="opacity:0.9">Balance</div><div style="font-size:32px;font-weight:700">' + remaining + '</div><div class="tiny" style="opacity:0.9">days left</div></div>'
+ '</div>'
+ (carriedOver > 0 
    ? '<div style="background:var(--info-bg);color:var(--info);padding:10px;border-radius:8px;margin-top:12px;font-size:12px">'
      + '💡 Includes <b>' + carriedOver + ' days</b> carried over from last year</div>'
    : '')
+ '</div></div>'
```

## Testing the Balance

### 1. Check Current Balance:
```javascript
// In browser console:
await API.get("/leave/summary", { employee_id: Store.user.employee_id })
```

### 2. Add Carry Over (if needed):
```javascript
// Via API:
await API.post("/leave-balances/carry-over", {
  employee_id: 1,
  leave_type_id: 1, // Annual Leave type ID
  year: 2026,
  carried: 3 // 3 days from 2025
})
```

### 3. Verify in Form:
- Open leave request form
- Should show: Entitled: 30, Carried Over: 3, Total: 33 days

## Visual Layout

```
╔════════════════════════════════════╗
║  📅 Your Annual Leave Balance 2026║
╠════════════════════════════════════╣
║  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ║
║  │ 30 │  │  3 │  │  5 │  │ 28 │  ║
║  │Days│  │Days│  │Days│  │LEFT│  ║
║  │Ent.│  │C/O │  │Used│  │    │  ║
║  └────┘  └────┘  └────┘  └────┘  ║
║                                    ║
║  💡 Includes 3 days from last year ║
╚════════════════════════════════════╝
```

## Alternative: Simpler Approach

If the API call adds complexity, you can show the balance from the dashboard cache:

```javascript
// At start of function:
const dashBalance = (Store.dashboardData?.my_leave || [])
  .find(b => b.type.toLowerCase().includes('annual'));

if (dashBalance) {
  const remaining = dashBalance.remaining || 0;
  const entitled = dashBalance.entitled || 30;
  // Show in form...
}
```

## Files to Modify

1. **static/js/views2.js** - Line ~765, `openLeaveForm()` function
   - Add balance fetching before openModal()
   - Add balance card HTML after employee info card
   - Add warning if requested days > remaining

## Database Check

To verify data is correct:

```sql
SELECT 
  e.full_name,
  lt.name as leave_type,
  lb.year,
  lb.entitled,
  lb.carried_over,
  lb.taken,
  lb.pending,
  (lb.entitled + lb.carried_over - lb.taken - lb.pending) as remaining
FROM leave_balances lb
JOIN employees e ON e.id = lb.employee_id
JOIN leave_types lt ON lt.id = lb.leave_type_id
WHERE lt.code = 'ANL'
AND lb.year = 2026
ORDER BY e.full_name;
```

## Next Steps

1. Decide if we should modify the existing complex function
2. Or create a simpler balance-fetching wrapper
3. Test with employees who have carry-over balances
4. Add warning when request exceeds balance

## Notes

- The function already has digital signature support
- It already shows approval chains
- Adding balance requires careful integration
- Consider showing balance for ALL leave types, not just annual
