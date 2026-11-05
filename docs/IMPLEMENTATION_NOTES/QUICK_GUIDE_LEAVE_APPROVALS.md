# Quick Reference: Leave Approval System

## For Employees

### Submit Leave Request
1. Click **"+ Apply for leave"**
2. Select leave type (radio button)
3. Choose dates
4. Type your name to sign
5. Click **"Submit"**

### Check Status
Look for these chips in your request:
- `○ HOD` `○ Accountant` `○ MD` = Just submitted
- `✓ HOD` `○ Accountant` `○ MD` = HOD approved
- `✓ HOD` `✓ Accountant` `○ MD` = Accountant approved
- `✓ HOD` `✓ Accountant` `✓ MD` = **FULLY APPROVED!**

---

## For Approvers

### Head of Department
**You see:** `○ HOD` `○ Accountant` `○ MD`
**Click:** `[Approve (HOD)]`
**Result:** `✓ HOD` `○ Accountant` `○ MD`

### Accountant
**You see:** `✓ HOD` `○ Accountant` `○ MD`
**Click:** `[Approve (Accountant)]`
**Result:** `✓ HOD` `✓ Accountant` `○ MD`

### Managing Director
**You see:** `✓ HOD` `✓ Accountant` `○ MD`
**Click:** `[Approve (MD)]`
**Result:** `✓ HOD` `✓ Accountant` `✓ MD` = **APPROVED**

### To Reject
**Click:** `[Reject]`
**Enter reason** (required)
**Result:** Request rejected, employee notified

---

## Leave Types

- ○ Annual Leave
- ○ Sick-Self Leave
- ○ Sick-Family Leave
- ○ Maternity Leave
- ○ Funeral-Relationship Leave
- ○ Paternity Leave
- ○ Others (specify reason)

---

## Auto-Calculated Fields

| Field | How It's Calculated |
|-------|---------------------|
| **Days Requested** | Working days between start and end (excludes weekends) |
| **Resumption Date** | Next working day after leave ends |

---

## Who Can Approve What?

| Role/Title | HOD | Accountant | MD |
|------------|-----|------------|-----|
| Super Admin | ✅ | ✅ | ✅ |
| HR Admin | ✅ | ✅ | ❌ |
| Manager | ✅ | ❌ | ❌ |
| "Head" in job title | ✅ | ❌ | ❌ |
| "Accountant" in job title | ❌ | ✅ | ❌ |
| "Managing Director" in job title | ❌ | ❌ | ✅ |

---

## Important Notes

⚠️ **Sequential Approval**: Each level must approve in order (HOD → Accountant → MD)

⚠️ **Rejection**: Any approver can reject at any time (stops the chain)

⚠️ **Final Approval**: Only MD approval updates leave balance and attendance

✅ **Signature Required**: Employee must type full name to sign

✅ **Working Days**: Weekends automatically excluded from calculations

---

## Quick Test (Super Admin)

```
1. Login: ama.mensah@meridian.gh / Admin@123
2. Go to: Leave section
3. Click: + Apply for leave
4. Select: Annual Leave
5. Dates: Pick any range
6. Sign: Type "Ama Mensah"
7. Submit
8. Approve as HOD: Click [Approve (HOD)]
9. Approve as Accountant: Click [Approve (Accountant)]
10. Final Approval: Click [Approve (MD)]
11. ✅ Done! Check leave balance updated
```

---

## Troubleshooting

**Can't see approval button?**
→ Check if previous level approved first

**Button says wrong level?**
→ Ensure your job title matches approval permissions

**Leave not appearing?**
→ Refresh page or check date filters

**Balance not updating?**
→ Wait for MD (final) approval
