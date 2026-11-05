# 🛠️ Black Screen Fix Guide

## Problem: Page Showing Black/Dark

The most likely cause is that your browser has the **Dark Theme** saved in localStorage from previous testing.

---

## ✅ QUICK FIX (30 seconds)

### Option 1: Use the Reset Tool
1. Go to: **http://127.0.0.1:5000/reset-theme.html**
2. Click **"Reset to Meridian (Default)"**
3. Click **"Go to Main App"**
4. ✅ Done!

### Option 2: Browser Console
1. Press **F12** to open Developer Tools
2. Go to **Console** tab
3. Type: `localStorage.setItem('hrms-theme', 'meridian')`
4. Press **Enter**
5. **Refresh page** (F5)
6. ✅ Done!

### Option 3: Hard Refresh
1. Press **Ctrl+Shift+R** (or **Cmd+Shift+R** on Mac)
2. If still dark, use Option 1 or 2

---

## 🔍 DETAILED DIAGNOSIS

### Test Pages Created:

#### 1. **Theme Reset Tool**
URL: http://127.0.0.1:5000/reset-theme.html

**What it does:**
- Shows current theme
- One-click reset to default
- Clear theme data
- Manual instructions

#### 2. **CSS Test Page**
URL: http://127.0.0.1:5000/test-page.html

**What it does:**
- Tests CSS loading
- Shows all color variables
- Displays current theme
- Console logging for debugging

---

## 🎨 Understanding the Issue

### What Happened:
1. You implemented 5 themes (including Dark Mode)
2. Theme choice is saved in browser localStorage
3. If Dark theme was selected, it persists across page loads
4. Dark theme has dark backgrounds, making everything appear black

### Why It Looks Black:
```css
/* Dark Theme */
[data-theme="dark"] {
  --paper: #0f1514;    /* Very dark background */
  --card: #1d2b29;      /* Dark cards */
  --text: #e8e6df;      /* Light text */
}
```

---

## 📊 Diagnostic Steps

### Step 1: Check Current Theme
Open browser console (F12) and type:
```javascript
localStorage.getItem('hrms-theme')
```

**Result meanings:**
- `"meridian"` = Default light theme ✅
- `"dark"` = Dark theme (explains black screen) 🌑
- `"blue"`, `"green"`, `"purple"` = Other themes
- `null` = No theme saved (will use default)

### Step 2: Check CSS Variables
In console, type:
```javascript
getComputedStyle(document.documentElement).getPropertyValue('--paper')
```

**Expected results:**
- Meridian: `#f5f3ee` (light beige) ✅
- Dark: `#0f1514` (very dark) 🌑

### Step 3: Check Theme Attribute
In console, type:
```javascript
document.documentElement.getAttribute('data-theme')
```

Should return: `"meridian"`, `"dark"`, etc.

---

## 🚨 Common Issues & Fixes

### Issue 1: Page is Black
**Cause:** Dark theme is active
**Fix:** Use Quick Fix Option 1 or 2 above

### Issue 2: CSS Not Loading
**Symptoms:** No styling at all, just plain HTML
**Causes:**
- Server not running
- CSS file path wrong
- Browser cache issue

**Fixes:**
1. Check server is running: http://127.0.0.1:5000/health
2. Hard refresh: Ctrl+Shift+R
3. Check console for 404 errors
4. Restart Flask server

### Issue 3: Theme Won't Change
**Cause:** JavaScript not running or error
**Fixes:**
1. Open console (F12)
2. Look for JavaScript errors (red text)
3. Check if theme.js loaded: type `ThemeManager` in console
4. Should show the ThemeManager object

### Issue 4: Styles Partially Working
**Cause:** CSS merge conflict or syntax error
**Fix:** Already fixed in previous step, but verify:
```bash
# In terminal
Select-String -Pattern "<<<<<<|======|>>>>>>" -Path "static/css/app.css"
```
Should return NO results (or only comment dividers)

---

## 🔧 Manual Theme Control

### Set Theme via Console:
```javascript
// Reset to default
ThemeManager.set('meridian');

// Try dark mode
ThemeManager.set('dark');

// Try blue theme
ThemeManager.set('blue');

// Check current theme
ThemeManager.getCurrent();
```

### Clear Theme Data:
```javascript
localStorage.removeItem('hrms-theme');
document.documentElement.removeAttribute('data-theme');
location.reload();
```

---

## ✅ Verification Checklist

After applying fixes:

- [ ] Open: http://127.0.0.1:5000
- [ ] Background should be light beige (#f5f3ee)
- [ ] Text should be dark and readable
- [ ] Sidebar should be dark green/teal
- [ ] No JavaScript errors in console (F12)
- [ ] Theme persists after refresh

---

## 🎯 Quick Test Commands

Open console (F12) and run:

```javascript
// Should return 'meridian' (not 'dark')
localStorage.getItem('hrms-theme')

// Should return light color #f5f3ee
getComputedStyle(document.documentElement).getPropertyValue('--paper')

// Should return 'meridian'
document.documentElement.getAttribute('data-theme')

// Should show ThemeManager object
ThemeManager

// Set to default if needed
ThemeManager.set('meridian')
```

---

## 📞 Still Having Issues?

### Check These:
1. **Server Running?** 
   - Visit: http://127.0.0.1:5000/health
   - Should see: `{"status": "ok", ...}`

2. **CSS Files Present?**
   - Visit: http://127.0.0.1:5000/static/css/app.css
   - Should download CSS file

3. **JavaScript Loading?**
   - Visit: http://127.0.0.1:5000/static/js/theme.js
   - Should download JS file

4. **Console Errors?**
   - Press F12
   - Check Console tab
   - Look for red errors
   - Share errors for help

---

## 🎉 Success Indicators

When everything works:
- ✅ Page loads with light beige background
- ✅ Dark teal sidebar on the left
- ✅ Clean, professional look
- ✅ No console errors
- ✅ Theme picker works in settings
- ✅ Theme persists after refresh

---

## 🌈 Available Themes

After fixing:
1. **Meridian (Default)** - Warm earth tones 🌙
2. **Dark Mode** - Easy on eyes 🌑
3. **Ocean Blue** - Professional blue 💙
4. **Forest Green** - Natural green 💚
5. **Purple Haze** - Modern purple 💜

Access theme picker:
- Settings → Account tab
- Or http://127.0.0.1:5000/theme-demo.html

---

## Summary

**Most Common Fix:**
1. Open: http://127.0.0.1:5000/reset-theme.html
2. Click "Reset to Meridian (Default)"
3. Refresh main app

**That's it!** Your page should now show the proper light theme. 🎉
