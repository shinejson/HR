@echo off
setlocal enabledelayedexpansion
title Meridian HRMS - Database Backup
cd /d "%~dp0"

set BACKUP_DIR=%~dp0backups
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TIMESTAMP=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%_%dt:~8,2%%dt:~10,2%

echo [%date% %time%] Creating backup...
if exist "instance\hrms.db" (
    copy /y "instance\hrms.db" "%BACKUP_DIR%\hrms_%TIMESTAMP%.db" >nul
    echo Database backed up to: %BACKUP_DIR%\hrms_%TIMESTAMP%.db
) else (
    echo Warning: instance\hrms.db not found.
)

echo Backup complete.
