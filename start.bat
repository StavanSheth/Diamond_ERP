@echo off
title DiamondERP V3.0
cd /d "%~dp0"
if exist "%~dp0DiamondERP.exe" (
    start "" "%~dp0DiamondERP.exe"
    exit /b
)
start /min cmd /c "npm run dev:api"
start /min cmd /c "npm run dev:web"
timeout /t 3 /nobreak >nul
start http://localhost:5175/
exit /b
