# HRMS - Human Resource Management System

## Overview
A comprehensive web-based Human Resource Management System built with Flask and SQLAlchemy, featuring employee management, attendance tracking, payroll, leave management, performance appraisals, and hotel operations.

---

## Project Structure

```
HR/
├── app.py                          # Main Flask application
├── models.py                       # SQLAlchemy database models
├── requirements.txt                # Python dependencies
├── seed.py                         # Database seeding script
├── serve.py                        # Production server
│
├── modules/                        # Business logic modules
│   ├── __init__.py
│   ├── employee_reports.py         # Employee reporting functionality
│   ├── hotel_ops.py                # Hotel operations management
│   ├── hr_crud.py                  # HR CRUD operations
│   ├── letters.py                  # Employment letter generation
│   ├── loan_and_encashment_letters.py  # Loan & leave encashment
│   ├── messaging.py                # Email/SMS messaging
│   ├── mfa.py                      # Multi-factor authentication
│   ├── permissions.py              # Role-based access control
│   ├── roster_pdf.py               # Shift roster PDF generation
│   └── migrate_leave_approval.py   # Leave approval migration
│
├── migrations/                     # Database migrations
│   ├── add_shift_roster.sql
│   └── run_migration.py
│
├── scripts/                        # Utility scripts
│   ├── backup_database.bat         # Database backup script
│   ├── start_server.bat            # Start development server
│   ├── stop_server.bat             # Stop server
│   └── start_hidden.vbs            # Start server hidden
│
├── docs/                          # Documentation
│   ├── README.md                  # This file
│   ├── SETUP.md                   # Installation & setup guide
│   ├── HRMS_Project_Documentation.docx
│   ├── USER_GUIDES/               # User documentation
│   └── IMPLEMENTATION_NOTES/      # Development notes
│
├── static/                        # Frontend assets
│   ├── css/                       # Stylesheets
│   ├── js/                        # JavaScript files
│   └── images/                    # Images & icons
│
├── templates/                     # HTML templates
│   └── index.html                 # Main SPA template
│
├── tests/                         # Test files
├── instance/                      # Database & secrets (not in git)
├── backups/                       # Database backups
└── uploads/                       # User-uploaded files
```

---

## Features

### Core HR
- **Employee Management**: Complete employee lifecycle management
- **Organization Structure**: Departments, designations, reporting hierarchy
- **Employment Letters**: Automated letter generation
- **Document Management**: Secure document storage
- **Policy Management**: Company policies with acknowledgement tracking

### Time & Absence
- **Attendance Tracking**: Clock in/out with biometric support
- **Leave Management**: Leave requests, approvals, balance tracking
- **Shift Roster**: Weekly shift scheduling per department
- **Holiday Calendar**: Company-wide holiday management

### Compensation & Benefits
- **Payroll Processing**: Automated payroll runs with tax calculations
- **Salary Structures**: Flexible compensation components
- **Loans & Advances**: Employee loan management
- **Leave Encashment**: Monetize unused leave days

### Talent Management
- **Performance Appraisals**: 360-degree feedback system
- **Goal Management**: OKRs and performance goals
- **Training**: Training programs and enrolments
- **Recruitment**: Applicant tracking system

### Hotel Operations
- **Inventory Management**: Hotel supplies tracking
- **Work Orders**: Maintenance and housekeeping requests
- **Asset Management**: Equipment tracking
- **Storeroom Management**: Multiple storage locations

### System Features
- **Multi-Factor Authentication**: Enhanced security with 2FA
- **Role-Based Access Control**: Granular permissions
- **Audit Logging**: Complete activity tracking
- **Email/SMS Notifications**: Automated communications
- **Reports & Analytics**: Comprehensive reporting
- **Database Backups**: Automated backup system

---

## Technology Stack

### Backend
- **Framework**: Flask 3.0+
- **Database**: SQLAlchemy with SQLite
- **Authentication**: Session-based with MFA support
- **PDF Generation**: ReportLab
- **Email**: SMTP integration
- **SMS**: Arkesel API integration

### Frontend
- **Architecture**: Single Page Application (SPA)
- **JavaScript**: Vanilla ES6+ (no frameworks)
- **CSS**: Custom CSS with CSS variables
- **Icons**: Lucide icons
- **Fonts**: Inter (sans-serif), Fraunces (serif)

---

## Quick Start

### Prerequisites
- Python 3.8+
- pip

### Installation

1. **Clone the repository**
   ```bash
   cd C:\xampp\htdocs\HR
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Initialize database**
   ```bash
   python seed.py
   ```

4. **Start the server**
   ```bash
   # Development
   python app.py

   # Or use the script
   scripts\start_server.bat

   # Production
   python serve.py
   ```

5. **Access the application**
   - Local: http://127.0.0.1:5000
   - Network: http://192.168.10.101:5000

### Default Login
- **Email**: ama.mensah@meridian.gh
- **Password**: Admin@123
- **Role**: Super Admin

---

## Configuration

### Environment Variables
Create a `.env` file or set environment variables:

```env
FLASK_ENV=production
DATABASE_URL=sqlite:///instance/hrms.db
SECRET_KEY=your-secret-key-here
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMS_API_KEY=your-arkesel-api-key
```

### Database Location
- Development: `instance/hrms.db`
- Backups: `backups/hrms_YYYY-MM-DD_HHMM.db`

---

## Development

### Project Organization
- **Business Logic**: All modules in `modules/` folder
- **Routes**: Defined in `app.py`
- **Models**: Database models in `models.py`
- **Frontend**: SPA architecture in `static/js/`

### Adding New Features
1. Create module in `modules/` folder
2. Import in `app.py`
3. Add routes in `app.py`
4. Add frontend view in `static/js/views*.js`
5. Update navigation in `static/js/app.js`

### Running Tests
```bash
# Run all tests
pytest tests/

# Run specific test
pytest tests/test_employee_reports_api.py
```

---

## User Guides

Detailed user guides are available in `docs/USER_GUIDES/`:
- Appointment Letters
- Leave Management
- Loan Requests
- Shift Roster Management
- Two-Factor Authentication

---

## Deployment

### Production Checklist
- [ ] Set `FLASK_ENV=production`
- [ ] Use strong secret key
- [ ] Configure SMTP/SMS gateways
- [ ] Set up automated backups
- [ ] Enable HTTPS
- [ ] Configure firewall rules
- [ ] Set up monitoring

### Backup & Recovery
```bash
# Manual backup
scripts\backup_database.bat

# Restore from backup
copy backups\hrms_YYYY-MM-DD_HHMM.db instance\hrms.db
```

---

## Support & Documentation

- **Setup Guide**: `docs/SETUP.md`
- **User Guides**: `docs/USER_GUIDES/`
- **Implementation Notes**: `docs/IMPLEMENTATION_NOTES/`
- **Full Documentation**: `docs/HRMS_Project_Documentation.docx`

---

## License

Proprietary - All rights reserved

---

## Version History

- **v1.0.0** - Initial release with core HR features
- **v1.1.0** - Added shift roster management
- **v1.2.0** - Added hotel operations module
- **v1.3.0** - Enhanced reporting and analytics

---

## Contributors

- Development Team
- Project Manager
- System Administrator

For questions or support, contact your system administrator.
