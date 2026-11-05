# HRMS Setup Guide

## Installation Steps

### 1. System Requirements

**Minimum Requirements:**
- Windows 10/11 or Linux
- Python 3.8 or higher
- 2GB RAM
- 500MB free disk space

**Recommended:**
- Python 3.10+
- 4GB RAM
- 2GB free disk space

### 2. Install Python

Download from https://www.python.org/downloads/

**Windows:**
- Check "Add Python to PATH" during installation
- Verify: `python --version`

### 3. Install Dependencies

```bash
cd C:\xampp\htdocs\HR
pip install -r requirements.txt
```

### 4. Database Setup

**Initialize Database:**
```bash
python seed.py
```

This creates:
- Database schema
- Default admin user
- Sample departments
- Leave types
- Default shifts

### 5. Configuration

**Option A: Environment Variables**
```bash
set FLASK_ENV=development
set SECRET_KEY=your-secret-key
```

**Option B: Create .env file**
```env
FLASK_ENV=development
DATABASE_URL=sqlite:///instance/hrms.db
SECRET_KEY=generate-strong-secret-key
```

### 6. Start the Server

**Development:**
```bash
python app.py
```

**Or use batch script:**
```bash
scripts\start_server.bat
```

**Production:**
```bash
python serve.py
```

### 7. Access Application

- **Local**: http://127.0.0.1:5000
- **Network**: http://192.168.10.101:5000

### 8. Default Login

- **Email**: ama.mensah@meridian.gh
- **Password**: Admin@123
- **Role**: Super Admin

**⚠️ Change the default password immediately!**

---

## Configuration Options

### Email Setup (SMTP)

Add to `.env` or environment variables:

```env
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_USE_TLS=True
```

**Gmail Setup:**
1. Enable 2-factor authentication
2. Generate app password
3. Use app password in SMTP_PASSWORD

### SMS Setup (Arkesel)

```env
SMS_API_KEY=your-arkesel-api-key
SMS_SENDER_ID=HRMS
```

Get API key from https://arkesel.com

### Database Backup

**Automatic backups:**
- Configured in application settings
- Default: Daily at 2:00 AM
- Stored in `backups/` folder

**Manual backup:**
```bash
scripts\backup_database.bat
```

---

## Troubleshooting

### Issue: "Module not found"

**Solution:**
```bash
pip install -r requirements.txt --upgrade
```

### Issue: "Database is locked"

**Solution:**
1. Stop all running instances
2. Close any database tools
3. Restart the server

### Issue: "Permission denied"

**Solution:**
Run terminal as Administrator

### Issue: "Port 5000 already in use"

**Solution:**
```bash
# Change port in app.py
app.run(host='0.0.0.0', port=5001)
```

### Issue: "CSS not loading"

**Solution:**
Hard refresh: `Ctrl + Shift + R`

---

## Network Access

### Allow Network Connections

**Windows Firewall:**
1. Open Windows Defender Firewall
2. Advanced Settings
3. Inbound Rules → New Rule
4. Port → TCP → 5000
5. Allow the connection

**Or disable firewall (development only):**
```powershell
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False
```

### Find Your IP Address

```bash
ipconfig
```

Look for "IPv4 Address" under your network adapter.

---

## Production Deployment

### 1. Use Production Server

```bash
pip install waitress
python serve.py
```

### 2. Set Environment

```bash
set FLASK_ENV=production
```

### 3. Generate Strong Secret Key

```python
import secrets
print(secrets.token_hex(32))
```

### 4. Configure HTTPS (Optional)

Use reverse proxy (nginx, Apache, IIS)

### 5. Set Up Monitoring

- Application logs
- Error tracking
- Performance monitoring

---

## Maintenance

### Daily Tasks
- ✅ Check application logs
- ✅ Verify backups created

### Weekly Tasks
- ✅ Review system performance
- ✅ Check disk space
- ✅ Update employee data

### Monthly Tasks
- ✅ Database optimization
- ✅ Archive old backups
- ✅ Security audit
- ✅ Update dependencies

---

## Updating the Application

### Pull Latest Changes

```bash
git pull origin main
```

### Run Migrations

```bash
python migrations/run_migration.py
```

### Restart Server

```bash
scripts\stop_server.bat
scripts\start_server.bat
```

---

## Support

For technical support:
1. Check documentation in `docs/`
2. Review error logs
3. Contact system administrator

---

## Security Best Practices

1. ✅ Change default admin password
2. ✅ Use strong passwords (12+ characters)
3. ✅ Enable two-factor authentication
4. ✅ Regular database backups
5. ✅ Keep Python dependencies updated
6. ✅ Use HTTPS in production
7. ✅ Restrict network access
8. ✅ Regular security audits
9. ✅ Monitor login attempts
10. ✅ Keep audit logs

---

## Next Steps

After setup:
1. ✅ Login with default credentials
2. ✅ Change admin password
3. ✅ Configure company details
4. ✅ Add departments
5. ✅ Create employee accounts
6. ✅ Configure email/SMS
7. ✅ Set up leave types
8. ✅ Configure payroll
9. ✅ Enable 2FA for admins
10. ✅ Train users

Refer to `docs/USER_GUIDES/` for feature-specific documentation.
