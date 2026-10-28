#!/usr/bin/env python3
"""Test login with demo accounts"""
import requests

# Test credentials
accounts = [
    {"email": "ama.mensah@meridian.gh", "password": "Admin@123", "name": "Super Admin"},
    {"email": "kwame.boateng@meridian.gh", "password": "Hr@123", "name": "HR Admin"},
    {"email": "kofi.adjei@meridian.gh", "password": "Manager@123", "name": "Manager"},
    {"email": "abena.sarpong@meridian.gh", "password": "Employee@123", "name": "Employee"},
]

print("Testing login endpoints...")
print("=" * 60)

for account in accounts:
    try:
        response = requests.post(
            "http://127.0.0.1:5000/api/v1/auth/login",
            json={"email": account["email"], "password": account["password"]},
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("data", {}).get("token")
            print(f"✅ {account['name']}: SUCCESS")
            print(f"   Email: {account['email']}")
            print(f"   Token: {token[:20]}..." if token else "   Token: None")
        else:
            print(f"❌ {account['name']}: FAILED ({response.status_code})")
            print(f"   Email: {account['email']}")
            print(f"   Error: {response.text}")
        print()
    except Exception as e:
        print(f"❌ {account['name']}: ERROR")
        print(f"   {str(e)}")
        print()

print("=" * 60)
print("\nIf you see ✅ SUCCESS above, login is working!")
print("If you see ❌ FAILED, the database needs to be reseeded.")
