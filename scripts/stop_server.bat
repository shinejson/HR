@echo off
title Stop Meridian HRMS Server
echo Stopping Meridian HRMS processes on port 5000...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    echo Terminating PID: %%a
    taskkill /f /pid %%a >nul 2>&1
)

echo Done. Port 5000 is now free.
pause
