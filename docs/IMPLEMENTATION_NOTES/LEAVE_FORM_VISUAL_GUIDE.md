# Leave Request Form - Visual Layout Guide

## Form Preview

```
╔═══════════════════════════════════════════════════════════════╗
║          EMPLOYEES' LEAVE REQUEST FORM                        ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ EMPLOYEE INFORMATION                                    │ ║
║  ├─────────────────────────────────────────────────────────┤ ║
║  │  Employee Name: [Auto-filled]      Date: [Today]       │ ║
║  │  Department:    [Auto-filled]      Position: [Auto]    │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ REASON FOR LEAVE                                        │ ║
║  ├─────────────────────────────────────────────────────────┤ ║
║  │  ○ Annual Leave              ○ Maternity Leave         │ ║
║  │  ○ Sick-Self Leave           ○ Funeral-Relationship    │ ║
║  │  ○ Sick-Family Leave         ○ Paternity Leave        │ ║
║  │                                                         │ ║
║  │  If others, state briefly:                             │ ║
║  │  [_________________________________________________]    │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ LEAVE REQUESTED                                         │ ║
║  ├─────────────────────────────────────────────────────────┤ ║
║  │  From: [Date Picker]    To: [Date Picker]             │ ║
║  │  No. of Days Requested: [Auto-calc]                    │ ║
║  │  No. of leave already taken: [Enter number]            │ ║
║  │  Date Employed: [From employee record]                 │ ║
║  │  Resumption Date: [Auto-calculated]                    │ ║
║  │                                                         │ ║
║  │  Employee Signature: [Type full name]                  │ ║
║  │  Date: [Auto - today's date]                           │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ ▓▓▓ MANAGEMENT USE ONLY ▓▓▓                           │ ║
║  ├─────────────────────────────────────────────────────────┤ ║
║  │  This section will be completed after submission       │ ║
║  │                                                         │ ║
║  │  Head of Department:  [Pending approval]               │ ║
║  │  Accountant:          [Pending approval]               │ ║
║  │  Managing Director:   [Pending approval]               │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║                                                               ║
║         [Cancel]              [Submit Leave Request]          ║
╚═══════════════════════════════════════════════════════════════╝
```

## After Submission - Leave Requests Table

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║  LEAVE REQUESTS REGISTER                                                          ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ Employee        │ Type          │ From       │ To         │ Days │ Approval Status│
║─────────────────┼───────────────┼────────────┼────────────┼──────┼────────────────║
║ John Doe        │ Annual Leave  │ 2026-11-01 │ 2026-11-05 │  5   │ ✓ HOD         │
║ EMP-001         │ Vacation      │            │            │      │ ○ Accountant  │
║ IT Dept         │               │            │            │      │ ○ MD          │
║                 │               │            │            │      │ [Approve (Acc)]│
║─────────────────┼───────────────┼────────────┼────────────┼──────┼────────────────║
║ Jane Smith      │ Sick-Self     │ 2026-10-30 │ 2026-10-30 │  1   │ ✓ HOD         │
║ EMP-002         │ Medical       │            │            │      │ ✓ Accountant  │
║ HR Dept         │               │            │            │      │ ○ MD          │
║                 │               │            │            │      │ [Approve (MD)] │
║─────────────────┼───────────────┼────────────┼────────────┼──────┼────────────────║
║ Mike Johnson    │ Paternity     │ 2026-11-10 │ 2026-11-24 │ 10   │ ✓ HOD         │
║ EMP-003         │ Family        │            │            │      │ ✓ Accountant  │
║ Sales Dept      │               │            │            │      │ ✓ MD          │
║                 │               │            │            │      │ ✅ APPROVED    │
╚════════════════════════════════════════════════════════════════════════════════════╝
```

## Approval Workflow Visualization

```
┌─────────────────┐
│ EMPLOYEE        │
│ Submits Leave   │
│ Request         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LEVEL 1: HOD    │◄──── Can Approve: Super Admin, HR Admin,
│ Pending         │      Manager, or employee with "Head" in title
└────────┬────────┘
         │ Approved
         ▼
┌─────────────────┐
│ LEVEL 2:        │◄──── Can Approve: Super Admin, HR Admin,
│ ACCOUNTANT      │      or employee with "Accountant" in title
│ Pending         │
└────────┬────────┘
         │ Approved
         ▼
┌─────────────────┐
│ LEVEL 3:        │◄──── Can Approve: Super Admin or
│ MANAGING        │      employee with "Managing Director" in title
│ DIRECTOR        │
│ Pending         │
└────────┬────────┘
         │ Approved
         ▼
┌─────────────────┐
│ ✅ FULLY        │
│ APPROVED        │
│                 │
│ • Balance       │
│   Updated       │
│ • Attendance    │
│   Marked        │
│ • Employee      │
│   Notified      │
└─────────────────┘

        ⚠️ REJECTION AT ANY LEVEL ⚠️
               ⬇
        ┌─────────────────┐
        │ ❌ REJECTED     │
        │                 │
        │ • Process Stops │
        │ • Days Released │
        │ • Employee      │
        │   Notified      │
        └─────────────────┘
```

## Status Chips Color Guide

| Chip | Color | Meaning |
|------|-------|---------|
| ○ HOD | Gray | Awaiting HOD approval |
| ✓ HOD | Green | HOD has approved |
| ○ Accountant | Gray | Awaiting Accountant approval |
| ✓ Accountant | Green | Accountant has approved |
| ○ MD | Gray | Awaiting MD approval |
| ✓ MD | Green | MD has approved (fully approved) |
| 🟢 Approved | Green | Fully approved |
| 🔴 Rejected | Red | Rejected at any level |
| ⚪ Cancelled | Gray | Cancelled by employee |
| 🟡 Pending | Yellow | Awaiting initial approval |

## Button Visibility Logic

### For Employees:
- **Submit Leave Request** - Always visible
- **Cancel** - Only for own pending requests

### For Head of Department:
- **Approve (HOD)** - Visible when no HOD approval yet
- **Reject** - Always visible for pending requests

### For Accountant:
- **Approve (Accountant)** - Visible when HOD approved, but no Accountant approval
- **Reject** - Always visible for pending requests

### For Managing Director:
- **Approve (MD)** - Visible when both HOD and Accountant approved
- **Reject** - Always visible for pending requests

### For Super Admin:
- Can approve at ANY level
- Can reject at ANY level
- Can bypass workflow if needed

## Auto-Calculations

### Working Days Calculator
```javascript
function calculateWorkingDays(startDate, endDate) {
  let days = 0;
  let current = new Date(startDate);
  
  while (current <= endDate) {
    // Exclude Saturday (6) and Sunday (0)
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}
```

### Resumption Date Calculator
```javascript
function calculateResumptionDate(endDate) {
  let resumption = new Date(endDate);
  resumption.setDate(resumption.getDate() + 1);
  
  // Skip weekends
  while (resumption.getDay() === 0 || resumption.getDay() === 6) {
    resumption.setDate(resumption.getDate() + 1);
  }
  
  return resumption;
}
```

## Comparison: Old vs New Form

### OLD FORM (Before)
```
┌────────────────────────┐
│ Apply for Leave        │
├────────────────────────┤
│ Leave Type: [dropdown] │
│ Employee: [dropdown]   │
│ Start: [date]          │
│ End: [date]            │
│ ☐ Half day            │
│ Reason: [textarea]     │
│                        │
│ [Cancel] [Submit]      │
└────────────────────────┘

• Single approval only
• No signature
• No resumption date
• No leave taken tracking
```

### NEW FORM (After - Airport West Hotel Format)
```
┌──────────────────────────────────┐
│ Employees' Leave Request Form    │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │ Employee Information         │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Reason for Leave (6 types)   │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Leave Requested              │ │
│ │ • Auto working days calc     │ │
│ │ • Leave taken tracking       │ │
│ │ • Resumption date            │ │
│ │ • Employee signature         │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Management Use Only          │ │
│ │ • HOD approval               │ │
│ │ • Accountant approval        │ │
│ │ • MD approval                │ │
│ └──────────────────────────────┘ │
│                                  │
│ [Cancel]  [Submit Leave Request] │
└──────────────────────────────────┘

• 3-level approval workflow
• Employee signature required
• Auto-calculated fields
• Matches physical form
```

## Key Features Summary

✅ **Form matches physical Airport West Hotel leave form**
✅ **6 standard leave types as radio buttons**
✅ **Auto-calculates working days (excludes weekends)**
✅ **Auto-calculates resumption date**
✅ **Tracks leave already taken**
✅ **Requires employee signature**
✅ **3-level approval workflow (HOD → Accountant → MD)**
✅ **Real-time approval status with visual chips**
✅ **Permission-based approval buttons**
✅ **Rejection with mandatory reason**
✅ **Automatic notifications**
✅ **Leave balance updates on final approval**

## Browser Compatibility

Tested and working on:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

## Accessibility

- ✅ Keyboard navigation supported
- ✅ Screen reader friendly labels
- ✅ Color contrast compliant
- ✅ Form validation with clear error messages
