const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const canonicalSetupExe = path.join(ROOT_DIR, 'build', 'releases', 'DiamondERP-Setup.exe');
const versionedSetupExe = path.join(ROOT_DIR, 'build', 'releases', 'DiamondERP-3.0.0-Setup.exe');
const zipPath = path.join(ROOT_DIR, 'build', 'releases', 'DiamondERP-3.0.0-Windows-x64.zip');
const installerCs = path.join(ROOT_DIR, 'installer', 'Installer.cs');
const iconPath = path.join(ROOT_DIR, 'installer', 'app.ico');
const manifestPath = path.join(ROOT_DIR, 'installer', 'Installer.manifest');

const cscCmd = `"${cscPath}" /nologo /out:"${canonicalSetupExe}" /target:winexe /win32icon:"${iconPath}" /win32manifest:"${manifestPath}" /resource:"${zipPath}",DiamondERP.Payload.zip /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll "${installerCs}"`;
console.log('Compiling DiamondERP-Setup.exe with embedded payload...');
execSync(cscCmd, { stdio: 'inherit', cwd: ROOT_DIR });
fs.copyFileSync(canonicalSetupExe, versionedSetupExe);
console.log('✔ DiamondERP-Setup.exe compiled successfully.');

// Also compile uninstaller / direct installer binary Installer.exe
const stagingInstallerExe = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP', 'Installer.exe');
const sourceInstallerExe = path.join(ROOT_DIR, 'installer', 'Installer.exe');
const cscInstallerCmd = `"${cscPath}" /nologo /out:"${stagingInstallerExe}" /target:winexe /win32icon:"${iconPath}" /win32manifest:"${manifestPath}" /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll "${installerCs}"`;
console.log('Compiling Installer.exe...');
execSync(cscInstallerCmd, { stdio: 'inherit', cwd: ROOT_DIR });
fs.copyFileSync(stagingInstallerExe, sourceInstallerExe);
console.log('✔ Installer.exe compiled successfully.');
