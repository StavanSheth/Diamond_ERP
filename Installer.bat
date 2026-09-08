@echo off
title DiamondERP Setup Wizard
cd /d "%~dp0"
echo Starting DiamondERP Setup Wizard...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\Install-Wizard.ps1"
exit /b
