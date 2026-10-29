@echo off
title Meridian HRMS - Production Server
cd /d "%~dp0"

echo ==========================================================
echo Starting Meridian HRMS Production Server...
echo ==========================================================
python serve.py

if errorlevel 1 (
    echo.
    echo Server stopped with error.
    pause
)
