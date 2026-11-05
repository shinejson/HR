# Appointment Letter Templates Guide

## Overview
The HRMS system includes a comprehensive appointment letter template management system that allows you to customize employment letters for different categories and departments.

## How to Access Appointment Letter Templates

### Option 1: Via Navigation Menu (Sidebar)
1. Log in as **Super Admin** or **HR Admin**
2. Click on **"People & HR"** section in the left sidebar
3. Click on **"Employment Letters"**
4. You'll see the Employment Letters hub page

### Option 2: Via Documents Page
1. Go to **Documents** page (http://192.168.10.101:5000/#/documents)
2. Click the **"Employment Letters"** button at the top of the page

### Option 3: Direct URL
Navigate directly to: **http://192.168.10.101:5000/#/employment-letters**

---

## Features Available

### 1. Employee Letters Register
- View all employees' appointment letters
- See portal login status
- Filter by employment category (Permanent, Fixed Term, Casual, Intern, etc.)
- Send/resend credentials to employees
- View and print individual letters

### 2. Department Templates (NEW!)
- **Location**: Click the **"Department Templates"** tab
- **Features**:
  - Customize appointment letters per department
  - Each department can have its own unique letter template
  - Override company-wide settings for specific departments
  - Preview templates before saving
  - Upload Word documents to extract content
  - Reset to baseline default if needed

**How to customize a department template:**
1. Go to Employment Letters page
2. Click **"Department Templates"** tab
3. Select a department from the left sidebar
4. Edit the template fields:
   - Title (e.g., "Appointment Letter - Finance Department")
   - Subject line
   - Opening paragraph
   - Body content
   - Closing paragraph
   - Letter footer
5. Use placeholders like `{employee_name}`, `{position}`, `{start_date}`, etc.
6. Click **"Preview with Employee"** to see how it looks with real data
7. Click **"Save Template"** to apply changes
8. Click **"Reset to Default"** to restore baseline template

### 3. Category Templates
- **Location**: Click the **"Category Templates"** tab
- **Features**:
  - Customize templates for 8 employment categories:
    - Permanent
    - Fixed Term
    - Casual
    - Intern
    - Contractor
    - Probation
    - Part-time
    - Volunteer
  - Edit global templates that apply to all employees in that category
  - Upload Word documents to auto-populate template fields
  - Preview templates before saving

---

## Template Placeholders

Use these placeholders in your templates - they'll be automatically replaced with real data:

### Employee Information
- `{employee_name}` - Full name
- `{first_name}` - First name only
- `{last_name}` - Last name only
- `{employee_no}` - Employee number
- `{email}` - Work email
- `{phone}` - Phone number

### Employment Details
- `{position}` - Job title/designation
- `{department}` - Department name
- `{start_date}` - Employment start date
- `{contract_type}` - Type of contract
- `{work_location}` - Work location
- `{reporting_to}` - Manager/supervisor name

### Compensation
- `{basic_salary}` - Basic salary amount
- `{allowances}` - Total allowances
- `{gross_salary}` - Gross salary

### Company Information
- `{company_name}` - Company name
- `{company_address}` - Company address
- `{company_phone}` - Company phone
- `{company_email}` - Company email

### Approval Chain
- `{hod_name}` - Head of Department name
- `{accountant_name}` - Accountant name
- `{md_name}` - Managing Director name

### Dates & Misc
- `{today}` - Current date
- `{portal_url}` - Employee portal login URL
- `{username}` - Portal username (usually email)

---

## API Endpoints Available

### Get All Templates
```
GET /api/v1/employment-letters/templates
```

### Update Category Template
```
PUT /api/v1/employment-letters/templates/{category_key}
```

### Get All Department Templates
```
GET /api/v1/employment-letters/department-templates
```

### Get Single Department Template
```
GET /api/v1/employment-letters/department-templates/{dept_id}
```

### Update Department Template
```
PUT /api/v1/employment-letters/department-templates/{dept_id}
```

### Delete/Reset Department Template
```
DELETE /api/v1/employment-letters/department-templates/{dept_id}
```

### Preview Department Template
```
POST /api/v1/employment-letters/preview-department-template
Body: { "department_id": 1, "employee_id": 1, "template": {...} }
```

---

## Priority/Hierarchy

The system follows this priority when generating letters:

1. **Department-specific template** (if exists) - HIGHEST PRIORITY
2. **Category template** (customized if edited, or baseline default)
3. **System baseline template** - FALLBACK

---

## Tips & Best Practices

1. **Test with Preview**: Always preview templates with real employee data before saving
2. **Use Placeholders**: Don't hardcode names/dates - use placeholders so they auto-update
3. **Department Templates**: Use these for departments with unique requirements (e.g., different benefits, work schedules)
4. **Backup**: Before making major changes, note down current content or take screenshots
5. **Reset Option**: If something goes wrong, you can always reset to baseline default
6. **Consistent Formatting**: Maintain consistent tone and formatting across all templates

---

## Quick Start Checklist

- [ ] Access Employment Letters page via sidebar or URL
- [ ] Check existing employee letters in "Register" tab
- [ ] Review and customize "Category Templates" for your organization
- [ ] Set up "Department Templates" for departments with unique needs
- [ ] Preview templates with real employee data
- [ ] Save and test by generating a new employee letter
- [ ] Send credentials to employees to access their letters via portal

---

## Support

For questions or issues with appointment letter templates:
- Check the preview function to verify your changes
- Use the reset option if templates become corrupted
- Contact system administrator for permission issues
- Review audit logs in Administration section for template change history

