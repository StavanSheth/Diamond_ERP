@echo off
setlocal EnableDelayedExpansion
title Diamond ERP - Uninstaller
chcp 65001 >nul

REM 1. Self-elevate to Administrator if not already elevated
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [Elevating] Requesting Administrator privileges to uninstall Diamond ERP...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs" 2>nul
    if %errorlevel% equ 0 exit /b 0
    echo Warning: Running without Administrator privileges. Some files or registry keys may require manual cleanup.
    echo.
)

REM 2. Locate Application Installation Directory
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

REM If run outside the app folder, locate from Windows Registry or default Program Files
if not exist "%APP_DIR%\DiamondERP.exe" (
    for /f "tokens=2* skip=2" %%a in ('reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /v InstallLocation 2^>nul') do (
        if exist "%%b\DiamondERP.exe" set "APP_DIR=%%b"
    )
)
if not exist "%APP_DIR%\DiamondERP.exe" (
    for /f "tokens=2* skip=2" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /v InstallLocation 2^>nul') do (
        if exist "%%b\DiamondERP.exe" set "APP_DIR=%%b"
    )
)
if not exist "%APP_DIR%\DiamondERP.exe" (
    if exist "C:\Program Files\DiamondERP\DiamondERP.exe" set "APP_DIR=C:\Program Files\DiamondERP"
)

REM Safety check: Never run against a source repository
set "IS_SOURCE=0"
if exist "%APP_DIR%\package.json" if exist "%APP_DIR%\apps" set "IS_SOURCE=1"
for %%I in ("%APP_DIR%\..") do (
    if exist "%%~fI\package.json" if exist "%%~fI\apps" set "IS_SOURCE=1"
)
if "%IS_SOURCE%"=="1" (
    echo.
    echo =====================================================================
    echo [SAFETY CHECK] Current folder is inside the source repository:
    echo %APP_DIR%
    echo Uninstallation cannot be executed against source code.
    echo =====================================================================
    pause
    exit /b 1
)

REM Support non-interactive / command-line flags
if /i "%~1"=="/y" goto UNINSTALL_SAFE_PROCEED
if /i "%~1"=="1" goto UNINSTALL_SAFE_PROCEED
if /i "%~1"=="/silent" goto UNINSTALL_SAFE_PROCEED
if /i "%~1"=="/force" goto UNINSTALL_SAFE_PROCEED
if /i "%~1"=="2" goto UNINSTALL_FULL

echo =====================================================================
echo                     DIAMOND ERP - UNINSTALLER
echo =====================================================================
echo Application Directory: %APP_DIR%
echo.
echo Please choose what you want to delete:
echo.
echo   [1] Uninstall Application Only (Preserve Database) [Recommended]
echo       - Deletes application files, Node.js runtime, and binaries
echo       - Removes Desktop and Start Menu shortcuts (including OneDrive Desktop)
echo       - Cleans Windows Add/Remove Programs registry entry
echo       - KEEPS your customer databases and ledger records safely in AppData
echo.
echo   [2] Complete Clean Wipe (Delete Application and All Databases)
echo       - Deletes all application files, shortcuts, and registry entries
echo       - PERMANENTLY ERASES all databases, ledgers, exports, and settings
echo.
echo   [3] Cancel
echo       - Exit without making any changes
echo =====================================================================
echo.

set "CHOICE="
set /p "CHOICE=Enter your choice (1, 2, or 3) [1]: "
if not defined CHOICE set "CHOICE=1"

if "%CHOICE%"=="1" goto UNINSTALL_SAFE_PROCEED
if "%CHOICE%"=="2" goto UNINSTALL_FULL
if "%CHOICE%"=="3" goto CANCEL
goto INVALID

:UNINSTALL_SAFE_PROCEED
echo.
echo [1/4] Closing any running Diamond ERP instances...
taskkill /f /im DiamondERP.exe >nul 2>&1
taskkill /f /im Installer.exe >nul 2>&1
taskkill /f /im Launcher.exe >nul 2>&1
taskkill /f /im msedgewebview2.exe >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -like '*%APP_DIR%*' -or $_.CommandLine -like '*%APP_DIR%*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping 127.0.0.1 -n 2 >nul

echo [2/4] Removing Desktop and Start Menu shortcuts...
del /f /q "%USERPROFILE%\Desktop\DiamondERP*.lnk" 2>nul
del /f /q "%USERPROFILE%\Desktop\Diamond ERP*.lnk" 2>nul
del /f /q "%USERPROFILE%\OneDrive\Desktop\DiamondERP*.lnk" 2>nul
del /f /q "%USERPROFILE%\OneDrive\Desktop\Diamond ERP*.lnk" 2>nul
del /f /q "C:\Users\Public\Desktop\DiamondERP*.lnk" 2>nul
del /f /q "C:\Users\Public\Desktop\Diamond ERP*.lnk" 2>nul
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\DiamondERP*.lnk" 2>nul
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Diamond ERP*.lnk" 2>nul
del /f /q "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\DiamondERP*.lnk" 2>nul
del /f /q "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Diamond ERP*.lnk" 2>nul
powershell -NoProfile -Command "$d = [Environment]::GetFolderPath('DesktopDirectory'); if (Test-Path $d) { Remove-Item -Path \"$d\DiamondERP*.lnk\", \"$d\Diamond ERP*.lnk\" -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "$p = [Environment]::GetFolderPath('Programs'); if (Test-Path $p) { Remove-Item -Path \"$p\DiamondERP*.lnk\", \"$p\Diamond ERP*.lnk\" -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "$cp = [Environment]::GetFolderPath('CommonPrograms'); if (Test-Path $cp) { Remove-Item -Path \"$cp\DiamondERP*.lnk\", \"$cp\Diamond ERP*.lnk\" -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [3/4] Cleaning Windows Registry entries...
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /f >nul 2>&1
reg delete "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /f >nul 2>&1
reg delete "HKCU\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /f >nul 2>&1

echo [4/4] Removing application directory: %APP_DIR%...
echo.
echo =====================================================================
echo [OK] Diamond ERP has been uninstalled successfully!
echo   Your business databases remain safely preserved in:
echo   %LOCALAPPDATA%\DiamondERP
echo =====================================================================
echo.
echo Cleaning up files and exiting...
ping 127.0.0.1 -n 2 >nul

cd /d "%TEMP%"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; for ($i = 0; $i -lt 15; $i++) { if (Test-Path '%APP_DIR%') { Remove-Item -Path '%APP_DIR%' -Recurse -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 } else { break } }"
exit

:UNINSTALL_FULL
echo.
echo ---------------------------------------------------------------------
echo WARNING: Complete Clean Wipe selected!
echo This will PERMANENTLY ERASE all business databases, parcels, and records!
echo This action CANNOT be undone.
echo ---------------------------------------------------------------------
set /p "WIPECONFIRM=To permanently delete ALL local data, type DELETE: "
if not "%WIPECONFIRM%"=="DELETE" (
    echo.
    echo Confirmation phrase did not match. Aborting.
    pause
    exit /b 1
)

echo.
echo [1/5] Closing any running Diamond ERP instances...
taskkill /f /im DiamondERP.exe >nul 2>&1
taskkill /f /im Installer.exe >nul 2>&1
taskkill /f /im Launcher.exe >nul 2>&1
taskkill /f /im msedgewebview2.exe >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -like '*%APP_DIR%*' -or $_.CommandLine -like '*%APP_DIR%*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping 127.0.0.1 -n 2 >nul

echo [2/5] Removing Desktop and Start Menu shortcuts...
del /f /q "%USERPROFILE%\Desktop\DiamondERP*.lnk" 2>nul
del /f /q "%USERPROFILE%\Desktop\Diamond ERP*.lnk" 2>nul
del /f /q "%USERPROFILE%\OneDrive\Desktop\DiamondERP*.lnk" 2>nul
del /f /q "%USERPROFILE%\OneDrive\Desktop\Diamond ERP*.lnk" 2>nul
del /f /q "C:\Users\Public\Desktop\DiamondERP*.lnk" 2>nul
del /f /q "C:\Users\Public\Desktop\Diamond ERP*.lnk" 2>nul
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\DiamondERP*.lnk" 2>nul
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Diamond ERP*.lnk" 2>nul
del /f /q "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\DiamondERP*.lnk" 2>nul
del /f /q "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Diamond ERP*.lnk" 2>nul
powershell -NoProfile -Command "$d = [Environment]::GetFolderPath('DesktopDirectory'); if (Test-Path $d) { Remove-Item -Path \"$d\DiamondERP*.lnk\", \"$d\Diamond ERP*.lnk\" -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "$p = [Environment]::GetFolderPath('Programs'); if (Test-Path $p) { Remove-Item -Path \"$p\DiamondERP*.lnk\", \"$p\Diamond ERP*.lnk\" -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "$cp = [Environment]::GetFolderPath('CommonPrograms'); if (Test-Path $cp) { Remove-Item -Path \"$cp\DiamondERP*.lnk\", \"$cp\Diamond ERP*.lnk\" -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [3/5] Cleaning Windows Registry entries...
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /f >nul 2>&1
reg delete "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /f >nul 2>&1
reg delete "HKCU\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP" /f >nul 2>&1

echo [4/5] Purging all AppData databases, records, and settings...
rmdir /s /q "%LOCALAPPDATA%\DiamondERP" 2>nul

echo [5/5] Removing application directory: %APP_DIR%...
echo.
echo =====================================================================
echo [OK] Diamond ERP and all associated databases have been completely wiped.
echo =====================================================================
echo.
echo Cleaning up files and exiting...
ping 127.0.0.1 -n 2 >nul

cd /d "%TEMP%"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; for ($i = 0; $i -lt 15; $i++) { if (Test-Path '%APP_DIR%') { Remove-Item -Path '%APP_DIR%' -Recurse -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 } else { break } }"
exit

:CANCEL
echo.
echo Uninstallation cancelled. No files or databases were modified.
pause
exit /b 0

:INVALID
echo.
echo Invalid selection. Please enter 1, 2, or 3.
pause
exit /b 1
