@echo off
title DiamondERP V3.0
cd /d "%~dp0"
start /min cmd /c "npm run dev:api"
start /min cmd /c "npm run dev:web"
timeout /t 3 /nobreak >nul
start http://localhost:5175/
exit /b
