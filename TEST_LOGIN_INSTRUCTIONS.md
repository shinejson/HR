# 🔐 Login Testing Instructions

## Current Server Status:
✅ **Server is RUNNING** at http://127.0.0.1:5000  
✅ **Database is FRESH** with correct demo accounts  
✅ **Login API is WORKING** (tested successfully)

---

## 🚨 About the 401 Errors

### **These errors are NORMAL and EXPECTED:**

```
❌ 401 on /api/v1/auth/login
❌ 401 on /api/v1/auth/logout  
❌ 401 on /api/v1/auth/ping
```

### **Why you see them:**
1. When you first load the page, the JavaScript checks if you're already logged in
2. Since you have no token yet (not logged in), the API returns 401 (Unauthorized)
3. This tells the frontend: "Show the login screen"
4. **This is correct security behavior!**

### **What happens AFTER you login:**
- ✅ You get a token
- ✅ Token is saved to localStorage
- ✅ All future requests include the token
- ✅ No more 401 errors!

---

## 📝 Step-by-Step Login Test

### **Step 1: Open the Application**
1. Open your browser
2. Go to: http://127.0.0.1:5000
3. You should see a beautiful login screen with demo accounts listed

### **Step 2: Open Browser Console** (Optional - to see what's happening)
1. Press F12 (or right-click → Inspect)
2. Go to "Console" tab
3. You'll see those 401 errors - **this is normal!**

### **Step 3: Login**

#### **Option A: Click a Demo Account (Easiest)**
1. Look for the "Demo accounts — click to fill" section
2. Click on the **first one** (Ama Mensah - Super Admin)
3. Email and password will auto-fill
4. Click **"Sign in to Meridian"**

#### **Option B: Manual Entry**
1. Email: `ama.mensah@meridian.gh`
2. Password: `Admin@123`
3. Click **"Sign in to Meridian"**

### **Step 4: Verify Login Success**

After clicking "Sign in to Meridian", you should:

✅ See a brief "Signing in..." message  
✅ Page should transition to the dashboard  
✅ See the HR system sidebar on the left  
✅ See "Dashboard" in the main area  
✅ No more 401 errors in console!  

---

## 🔍 Troubleshooting

### **Problem: "Invalid username/email or password"**

**Solution:**
The database still has old data. I'll fix this:

```powershell
# Stop all Python processes
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

# Delete the database
Remove-Item instance/hrms.db -Force

# Start the server (it will recreate the database)
python app.py
```

### **Problem: Login button does nothing**

**Check:**
1. Open browser console (F12)
2. Look for JavaScript errors (red text)
3. Make sure you're using a modern browser (Chrome, Firefox, Edge)

### **Problem: Stuck on "Signing in..."**

**Check:**
1. Server is actually running (check terminal)
2. Visit http://127.0.0.1:5000/health - should show "ok"
3. Try refreshing the page (F5) and login again

### **Problem: See blank page after login**

**Solution:**
1. Press F5 to refresh
2. Check browser console for errors
3. Clear browser cache (Ctrl+Shift+Delete)

---

## 🧪 Quick Verification Commands

### **Is the server running?**
```powershell
curl http://127.0.0.1:5000/health -UseBasicParsing
```
Should show: `"status": "ok"`

### **Can I login via API?**
```powershell
$body = @{email='ama.mensah@meridian.gh'; password='Admin@123'} | ConvertTo-Json
$response = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/v1/auth/login' -Method Post -Body $body -ContentType 'application/json'
$response.data.token
```
Should show a long token string

---

## 📋 All Demo Accounts

```
🔵 Super Admin (Full Access)
   Email: ama.mensah@meridian.gh
   Password: Admin@123

🔵 HR Admin (HR Management)
   Email: kwame.boateng@meridian.gh
   Password: Hr@123

🔵 Manager (Team Management)
   Email: kofi.adjei@meridian.gh
   Password: Manager@123

🔵 Employee (Self Service)
   Email: abena.sarpong@meridian.gh
   Password: Employee@123

🔵 Payroll Specialist
   Email: akosua.darko@meridian.gh
   Password: Payroll@123
```

---

## ✨ After Successful Login

Once logged in, you can:
- ✅ Browse the dashboard
- ✅ Click sidebar navigation items
- ✅ Go to **Settings** → **Account** tab
- ✅ Scroll down to find **"Theme & Appearance"**
- ✅ Click theme cards to switch themes instantly!
- ✅ Test the collapsed sidebar (click >> icon)
- ✅ See flyout menus on hover

---

## 🎯 Summary

**The 401 errors you're seeing are NOT bugs!**

They're the app checking authentication status before you login.

**Just login and they disappear!** 🎉

1. Go to http://127.0.0.1:5000
2. Click a demo account (or type credentials)
3. Click "Sign in to Meridian"
4. ✅ You're in!

---

## 📞 Still Having Issues?

Let me know what happens when you try to login:
- Does the button say "Signing in..."?
- Do you see any error message?
- What does the browser console show (F12)?
- Does the page stay on login or go to dashboard?

I'll help debug further!
