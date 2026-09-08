@echo off
title DiamondERP Setup Wizard
cd /d "%~dp0"
if exist "%~dp0DiamondERP-Setup.exe" (
    start "" "%~dp0DiamondERP-Setup.exe"
    exit /b
)
if exist "%~dp0Installer.exe" (
    start "" "%~dp0Installer.exe"
    exit /b
)
echo Starting DiamondERP Setup Wizard...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\Install-Wizard.ps1"
exit /b
