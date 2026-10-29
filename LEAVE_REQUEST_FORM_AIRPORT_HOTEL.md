# Leave Request Form - Airport West Hotel Format

## Overview
The leave request form has been completely redesigned to match the Airport West Hotel's physical form layout and includes a robust 3-level approval workflow.

## Features Implemented

### 1. Enhanced Leave Request Form
The form now mirrors the hotel's physical leave request form with the following sections:

#### **Employee Information Section**
- Employee Name (auto-filled, read-only)
- Date (current date, read-only)
- Department (auto-filled from employee record, read-only)
- Position (auto-filled from employee designation, read-only)

#### **Reason for Leave Section**
Multiple leave type options displayed as radio buttons:
- Annual Leave
- Sick-Self Leave
- Sick-Family Leave
- Maternity Leave
- Funeral-Relationship Leave
- Paternity Leave
- **"If others, state briefly"** - Free text field for custom reasons

#### **Leave Requested Section**
- **From Date** - Start date picker (required)
- **To Date** - End date picker (required)
- **No. of Days Requested** - Auto-calculated working days (excludes weekends)
- **No. of leave already taken** - Manual entry to track YTD leave usage
- **Date Employed** - Auto-filled from employee hire date (read-only)
- **Resumption Date** - Auto-calculated (next working day after end date)
- **Employee Signature** - Type full name to sign + auto-timestamp

#### **Management Use Only Section**
Displays approval status for three levels:
- Head of Department
- Accountant
- Managing Director

### 2. Three-Level Approval Workflow

The approval process follows a sequential chain:

**Level 1: Head of Department (HOD)**
- First approver in the chain
- Required before Accountant can approve
- Can be approved by: Super Admin, HR Admin, Manager, or employees with "Head" in their job title

**Level 2: Accountant**
- Second approver in the chain
- Can only approve after HOD approval
- Can be approved by: Super Admin, HR Admin, or employees with "Accountant" in their job title

**Level 3: Managing Director (MD)**
- Final approver in the chain
- Can only approve after both HOD and Accountant approval
- Can be approved by: Super Admin or employees with "Managing Director" or "MD" in their job title
- Upon MD approval, the leave is **fully approved** and:
  - Leave balance is updated
  - Attendance records are created for each leave day
  - Employee receives notification

### 3. Rejection at Any Level
Any approver in the chain can **reject** the request at any time:
- Rejection stops the entire approval process
- Approver must provide a rejection reason
- Employee is immediately notified
- Leave days are released back to pending balance

### 4. Visual Approval Status
The leave requests table shows real-time approval status with chips:
- ○ HOD (gray) = Pending HOD approval
- ✓ HOD (green) = HOD approved
- ○ Accountant (gray) = Pending Accountant approval
- ✓ Accountant (green) = Accountant approved
- ○ MD (gray) = Pending MD approval
- ✓ MD (green) = MD approved (fully approved)

### 5. Automatic Calculations
- **Working Days**: Automatically excludes weekends (Saturday/Sunday)
- **Resumption Date**: Automatically calculates the next working day after leave ends
- **Leave Balance**: Updates automatically when MD approves

## Database Schema Changes

New fields added to `leave_requests` table:
```sql
leave_already_taken NUMERIC(6,2) DEFAULT 0
resumption_date DATE
employee_signature VARCHAR(255)
hod_approved_at DATETIME
hod_approved_by INTEGER (FK to employees)
accountant_approved_at DATETIME
accountant_approved_by INTEGER (FK to employees)
md_approved_at DATETIME
md_approved_by INTEGER (FK to employees)
```

## API Endpoints

### New Endpoints:
- `POST /api/v1/leave-requests/:id/approve-level`
  - Body: `{ "level": "hod" | "accountant" | "md" }`
  - Approves at specified level
  
- `POST /api/v1/leave-requests/:id/reject-level`
  - Body: `{ "note": "rejection reason" }`
  - Rejects at any level

### Existing Endpoints (still supported):
- `POST /api/v1/leave-requests` - Create new leave request
- `GET /api/v1/leave-requests` - List all leave requests
- `POST /api/v1/leave-requests/:id/cancel` - Cancel own request

## How to Use

### For Employees:

1. **Apply for Leave**
   - Click "+ Apply for Leave" button
   - Select leave type (radio button)
   - Optional: Add reason if "others"
   - Select date range (from/to)
   - Review auto-calculated days and resumption date
   - Type your full name in signature field
   - Click "Submit Leave Request"

2. **Track Your Request**
   - View approval status in Leave tab
   - See which approval levels are pending/complete
   - Receive notifications when approved or rejected

### For Approvers:

1. **Head of Department**
   - Navigate to Leave tab
   - See pending requests (no HOD approval yet)
   - Click "Approve (HOD)" button next to request
   - Or click "Reject" to reject with reason

2. **Accountant**
   - See requests that HOD has approved
   - Click "Approve (Accountant)" button
   - Or click "Reject" to stop approval chain

3. **Managing Director**
   - See requests approved by both HOD and Accountant
   - Click "Approve (MD)" to give final approval
   - This completes the approval and updates leave balance
   - Or click "Reject" to stop approval chain

## Permission Matrix

| Role | Can Approve HOD | Can Approve Accountant | Can Approve MD | Can Reject |
|------|----------------|----------------------|---------------|------------|
| Super Admin | ✓ | ✓ | ✓ | ✓ |
| HR Admin | ✓ | ✓ | ✗ | ✓ |
| Manager | ✓ | ✗ | ✗ | ✓ |
| Employee with "Head" title | ✓ | ✗ | ✗ | ✗ |
| Employee with "Accountant" title | ✗ | ✓ | ✗ | ✗ |
| Employee with "Managing Director" title | ✗ | ✗ | ✓ | ✗ |

## Migration Instructions

The database migration has been completed. If you need to run it again:

```bash
python migrate_leave_approval.py
```

## Testing Checklist

✓ Form displays with all sections
✓ Employee information auto-fills correctly
✓ Leave types display as radio buttons
✓ Date range selection works
✓ Working days calculation excludes weekends
✓ Resumption date calculates correctly
✓ Signature field required
✓ Form submission creates request
✓ HOD can approve first level
✓ Accountant can approve after HOD
✓ MD can approve after Accountant
✓ MD approval updates leave balance
✓ Any level can reject
✓ Rejection requires reason
✓ Approval status chips display correctly
✓ Notifications sent on approval/rejection
✓ Employee can cancel own pending request

## Notes

- **Holidays**: The system should ideally exclude public holidays from working days calculation (currently only excludes weekends)
- **Half-day leave**: The original half-day checkbox was removed to match the physical form, but can be re-added if needed
- **Attachments**: The physical form mentions attachments for certain leave types - this can be implemented as a future enhancement
- **Bulk approval**: Super Admins can still use bulk approve actions to bypass the 3-level workflow if needed

## Files Modified

1. `models.py` - Added new fields to LeaveRequest model
2. `app.py` - Added multi-level approval endpoints
3. `static/js/views2.js` - Updated form and approval UI
4. `migrate_leave_approval.py` - Database migration script

## Next Steps (Optional Enhancements)

- Add attachment upload for leave types that require documentation
- Implement auto-routing based on employee's department hierarchy
- Add email notifications with approval links
- Create printable PDF version matching physical form layout
- Add approval delegation when approvers are on leave
- Include public holidays in working days calculation
