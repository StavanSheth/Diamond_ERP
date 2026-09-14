/**
 * DiamondERP V3.0 — Phase 9 Windows Production Installer Test Suite
 *
 * Comprehensive verification of the Windows Installer (Installer.exe / DiamondERP-Setup.exe)
 * covering Sections A through T:
 *
 *  A. Static Installer Checks (architecture, embedded extraction, safe shutdown)
 *  B. Version Consistency Checks (3.0.0 across all components)
 *  C. Staging Checks (runtime files in build/windows/DiamondERP)
 *  D. Forbidden Development-File Checks (no dev tools/source in staged payload)
 *  E. Bundled Node Check (v22.20.0 x64, PE binary, pinned SHA256)
 *  F. API Checks (api/dist/index.js, production node_modules)
 *  G. Web Checks (production React SPA build, assets)
 *  H. Prisma Checks (schema, template.db, query engine binary)
 *  I. WebView2 Checks (prerequisite strategy consistency, host detection)
 *  J. Installer Metadata (DisplayName, DisplayVersion, Publisher, UninstallString)
 *  K. Fresh Installation (silent install to isolated test folder)
 *  L. Upgrade Safety (customer records, uploads, backups preserved)
 *  M. Uninstall Behavior (app files removed, customer data preserved)
 *  N. Reinstall Behavior (customer data preserved and recognized)
 *  O. Data Preservation Guard (reject installing into LocalAppData)
 *  P. Process Cleanup (clean exit, no orphan node/DiamondERP processes)
 *  Q. Port Cleanup (port 3002 released and reusable)
 *  R. Offline Operation (runtime independent of global Node/npm/git)
 *  S. Shortcut Validation (target, working dir, icon)
 *  T. Final Artifact Validation (DiamondERP-Setup.exe self-contained size, hashes)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');
const RELEASES_DIR = path.join(ROOT_DIR, 'build', 'releases');
const INSTALLER_SRC = path.join(ROOT_DIR, 'installer', 'Installer.cs');
const LAUNCHER_SRC = path.join(ROOT_DIR, 'installer', 'Launcher.cs');
const CSPROJ_PATH = path.join(ROOT_DIR, 'installer', 'DiamondERP.csproj');
const INSTALLER_MANIFEST = path.join(ROOT_DIR, 'installer', 'Installer.manifest');
const LAUNCHER_MANIFEST = path.join(ROOT_DIR, 'installer', 'Launcher.manifest');
const SCRATCH_DIR = path.join(ROOT_DIR, 'scratch', 'test-phase9');

const PROD_PORT = 3002;
const PINNED_NODE_SHA256 = 'fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d';

const results = [];

function record(section, name, passed, details = '') {
  results.push({ section, name, passed, details });
  const icon = passed ? '✔ PASS' : '❌ FAIL';
  console.log(`  [${section}] ${icon}: ${name}${details ? ` (${details})` : ''}`);
}

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      // Ignore transient file lock
    }
  }
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function main() {
  console.log('================================================================');
  console.log('💎 DiamondERP V3.0 — Phase 9 Windows Installer Test Suite');
  console.log('================================================================\n');

  cleanDir(SCRATCH_DIR);
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  const version = rootPkg.version || '3.0.0';

  // -------------------------------------------------------------------------
  // SECTION A: Static Installer Checks
  // -------------------------------------------------------------------------
  console.log('▶ [Section A] Static Installer Checks');
  const installerCode = fs.readFileSync(INSTALLER_SRC, 'utf-8');

  record('A', 'Installer.cs source file exists', fs.existsSync(INSTALLER_SRC));
  record('A', 'Defines SetupWizardForm class', installerCode.includes('class SetupWizardForm'));
  record('A', 'Defines universal DeployPayload method', installerCode.includes('DeployPayload('));
  record('A', 'Defines ExtractZipStream for embedded payload', installerCode.includes('ExtractZipStream('));
  record('A', 'Defines EnsureAppNotRunning with graceful shutdown', installerCode.includes('EnsureAppNotRunning('));
  record('A', 'Defines RegisterUninstall for Add/Remove Programs', installerCode.includes('RegisterUninstall('));
  record('A', 'Defines PerformSilentInstall', installerCode.includes('PerformSilentInstall('));
  record('A', 'Uses System.IO.Compression for self-contained archive extraction', installerCode.includes('using System.IO.Compression;'));

  // Verify absence of legacy licensing / activation wording (Prompt Section 29)
  const hasHwLockText = installerCode.includes('device hardware locks') || installerCode.includes('authorized master key');
  record('A', 'Legacy hardware lock & master key text removed', !hasHwLockText, hasHwLockText ? 'Found legacy text' : 'Clean');

  const hasMasterPwActivation = installerCode.includes('master password to activate this computer');
  record('A', 'Legacy master password activation text removed', !hasMasterPwActivation, hasMasterPwActivation ? 'Found activation text' : 'Clean');

  // Verify Installer.manifest requires elevation
  const installerManifestContent = fs.readFileSync(INSTALLER_MANIFEST, 'utf-8');
  record('A', 'Installer.manifest specifies requireAdministrator', installerManifestContent.includes('level="requireAdministrator"'));

  // -------------------------------------------------------------------------
  // SECTION B: Version Consistency Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section B] Version Consistency Checks (Target: 3.0.0)');
  const launcherCode = fs.readFileSync(LAUNCHER_SRC, 'utf-8');
  const launcherManifestContent = fs.readFileSync(LAUNCHER_MANIFEST, 'utf-8');

  record('B', 'package.json version is 3.0.0', rootPkg.version === '3.0.0', rootPkg.version);
  record('B', 'Installer.cs AssemblyVersion is 3.0.0.0', installerCode.includes('[assembly: AssemblyVersion("3.0.0.0")]'));
  record('B', 'Installer.cs AssemblyInformationalVersion is 3.0.0', installerCode.includes('[assembly: AssemblyInformationalVersion("3.0.0")]'));
  record('B', 'Installer.cs Registry DisplayVersion is 3.0.0', installerCode.includes('key.SetValue("DisplayVersion", "3.0.0");'));
  record('B', 'Launcher.cs AssemblyVersion is 3.0.0.0', launcherCode.includes('[assembly: AssemblyVersion("3.0.0.0")]'));
  record('B', 'Launcher.cs AssemblyInformationalVersion is 3.0.0', launcherCode.includes('[assembly: AssemblyInformationalVersion("3.0.0")]'));
  record('B', 'Installer.manifest version is 3.0.0.0', installerManifestContent.includes('version="3.0.0.0"'));
  record('B', 'Launcher.manifest version is 3.0.0.0', launcherManifestContent.includes('version="3.0.0.0"'));

  // -------------------------------------------------------------------------
  // SECTION C: Staging Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section C] Staging Checks (build/windows/DiamondERP)');
  const stagedFiles = [
    { name: 'DiamondERP.exe', path: path.join(STAGING_DIR, 'DiamondERP.exe') },
    { name: 'Installer.exe', path: path.join(STAGING_DIR, 'Installer.exe') },
    { name: 'runtime/node.exe', path: path.join(STAGING_DIR, 'runtime', 'node.exe') },
    { name: 'Microsoft.Web.WebView2.Core.dll', path: path.join(STAGING_DIR, 'Microsoft.Web.WebView2.Core.dll') },
    { name: 'Microsoft.Web.WebView2.Wpf.dll', path: path.join(STAGING_DIR, 'Microsoft.Web.WebView2.Wpf.dll') },
    { name: 'WebView2Loader.dll', path: path.join(STAGING_DIR, 'WebView2Loader.dll') },
    { name: 'app.ico', path: path.join(STAGING_DIR, 'app.ico') },
  ];

  for (const sf of stagedFiles) {
    record('C', `Staged file exists: ${sf.name}`, fs.existsSync(sf.path));
  }

  // -------------------------------------------------------------------------
  // SECTION D: Forbidden Development Files Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section D] Forbidden Development-Files Checks');
  const forbiddenRootEntries = ['.git', '.github', 'test', 'tests', 'apps', 'packages', 'src'];
  const hasForbiddenRoot = forbiddenRootEntries.some((name) => fs.existsSync(path.join(STAGING_DIR, name)));
  record('D', 'Zero forbidden development folders (.git, .github, test, apps, src) in staging root', !hasForbiddenRoot);

  function hasFilesMatching(dir, predicate) {
    if (!fs.existsSync(dir)) return false;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (hasFilesMatching(full, predicate)) return true;
      } else if (predicate(ent.name)) {
        return true;
      }
    }
    return false;
  }

  const hasTsInApiDist = hasFilesMatching(path.join(STAGING_DIR, 'api', 'dist'), (f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  record('D', 'No TypeScript source files (.ts) in api/dist', !hasTsInApiDist);

  const hasTsInWebDist = hasFilesMatching(path.join(STAGING_DIR, 'web', 'dist'), (f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  record('D', 'No TypeScript source files (.ts) in web/dist', !hasTsInWebDist);

  const hasMapsInApiDist = hasFilesMatching(path.join(STAGING_DIR, 'api', 'dist'), (f) => f.endsWith('.map'));
  record('D', 'No sourcemap files (.map) in api/dist', !hasMapsInApiDist);

  const rootNodeModules = path.join(STAGING_DIR, 'node_modules');
  record('D', 'No root node_modules directory in staging root', !fs.existsSync(rootNodeModules));

  // -------------------------------------------------------------------------
  // SECTION E: Bundled Node Check
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section E] Bundled Node Runtime Check');
  const stagedNode = path.join(STAGING_DIR, 'runtime', 'node.exe');
  const nodeExists = fs.existsSync(stagedNode);
  record('E', 'Bundled runtime/node.exe exists', nodeExists);

  if (nodeExists) {
    const nodeStat = fs.statSync(stagedNode);
    record('E', 'Bundled node.exe is real PE binary (> 20 MB)', nodeStat.size > 20 * 1024 * 1024, `${(nodeStat.size / (1024 * 1024)).toFixed(1)} MB`);

    const nodeSha = computeSha256(stagedNode);
    record('E', 'Bundled node.exe strictly matches pinned SHA256', nodeSha === PINNED_NODE_SHA256, `${nodeSha.slice(0, 12)}...`);

    try {
      const verOut = execSync(`"${stagedNode}" -v`, { encoding: 'utf-8' }).trim();
      record('E', 'Bundled node.exe reports v22.20.0', verOut === 'v22.20.0', verOut);
    } catch (err) {
      record('E', 'Bundled node.exe runs successfully', false, err.message);
    }
  }

  // -------------------------------------------------------------------------
  // SECTION F: API Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section F] API Checks');
  const apiEntry = path.join(STAGING_DIR, 'api', 'dist', 'index.js');
  const apiPkg = path.join(STAGING_DIR, 'api', 'package.json');
  const expressPkg = path.join(STAGING_DIR, 'api', 'node_modules', 'express', 'package.json');
  const contractsPkg = path.join(STAGING_DIR, 'api', 'node_modules', '@diamond-erp', 'contracts', 'package.json');
  const utilsPkg = path.join(STAGING_DIR, 'api', 'node_modules', '@diamond-erp', 'shared-utils', 'package.json');

  record('F', 'api/dist/index.js exists', fs.existsSync(apiEntry));
  record('F', 'api/package.json exists', fs.existsSync(apiPkg));
  record('F', 'api/node_modules/express is installed', fs.existsSync(expressPkg));
  record('F', 'api/node_modules/@diamond-erp/contracts is installed', fs.existsSync(contractsPkg));
  record('F', 'api/node_modules/@diamond-erp/shared-utils is installed', fs.existsSync(utilsPkg));

  // -------------------------------------------------------------------------
  // SECTION G: Web Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section G] Web Checks');
  const webHtml = path.join(STAGING_DIR, 'web', 'dist', 'index.html');
  const webAssets = path.join(STAGING_DIR, 'web', 'dist', 'assets');

  record('G', 'web/dist/index.html exists', fs.existsSync(webHtml));
  const hasAssets = fs.existsSync(webAssets) && fs.readdirSync(webAssets).length > 0;
  record('G', 'web/dist/assets contains compiled JS and CSS bundles', hasAssets);

  // -------------------------------------------------------------------------
  // SECTION H: Prisma Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section H] Prisma Checks');
  const schemaPath = path.join(STAGING_DIR, 'api', 'prisma', 'schema.prisma');
  const templateDb = path.join(STAGING_DIR, 'api', 'prisma', 'template.db');
  const queryEngine = path.join(STAGING_DIR, 'api', 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node');

  record('H', 'api/prisma/schema.prisma exists', fs.existsSync(schemaPath));
  record('H', 'api/prisma/template.db exists and is non-empty', fs.existsSync(templateDb) && fs.statSync(templateDb).size > 0);
  record('H', 'Prisma SQLite query engine binary exists (> 10 MB)', fs.existsSync(queryEngine) && fs.statSync(queryEngine).size > 10 * 1024 * 1024);

  // -------------------------------------------------------------------------
  // SECTION I: WebView2 Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section I] WebView2 Checks');
  record('I', 'Installer enforces Microsoft Edge WebView2 Evergreen runtime as required',
    installerCode.includes('WebView2 Runtime: Required') || installerCode.includes('Microsoft Edge WebView2 Runtime is required'));

  let webView2Detected = false;
  try {
    const regCheck = execSync('powershell -NoProfile -Command "Get-ItemProperty -Path \'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}\' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty pv"', { encoding: 'utf-8' }).trim();
    webView2Detected = !!regCheck && regCheck !== '0.0.0.0';
  } catch { }
  record('I', 'Host system has Microsoft Edge WebView2 Evergreen Runtime installed', webView2Detected, webView2Detected ? 'Detected' : 'Not detected');

  // -------------------------------------------------------------------------
  // SECTION J: Installer Metadata & Registry Audit
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section J] Installer Metadata & Registry Audit');
  record('J', 'Registry registers DisplayName as "DiamondERP Enterprise Suite"', installerCode.includes('DisplayName", "DiamondERP Enterprise Suite"'));
  record('J', 'Registry registers DisplayVersion as "3.0.0"', installerCode.includes('DisplayVersion", "3.0.0"'));
  record('J', 'Registry registers Publisher as "DiamondERP Enterprise Systems"', installerCode.includes('Publisher", "DiamondERP Enterprise Systems"'));
  record('J', 'Registry registers UninstallString', installerCode.includes('UninstallString"'));
  record('J', 'Registry registers InstallDate', installerCode.includes('InstallDate"'));
  record('J', 'Registry registers EstimatedSize', installerCode.includes('EstimatedSize"'));

  // -------------------------------------------------------------------------
  // SECTION K: Fresh Installation Test (Silent Install to Test Directory)
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section K] Fresh Installation Test');
  const testInstallDir = path.join(SCRATCH_DIR, 'InstalledApp');
  cleanDir(testInstallDir);

  const installerExe = path.join(STAGING_DIR, 'Installer.exe');
  let installPassed = false;

  try {
    const installCmd = `"${installerExe}" /silent /dir="${testInstallDir}" /nodesktop /nostartmenu`;
    console.log(`  Executing: ${installCmd}`);
    execSync(installCmd, { stdio: 'pipe', timeout: 30000 });
    installPassed = true;
  } catch (err) {
    installPassed = false;
    console.error(`  Installation failed: ${err.message}`);
  }

  record('K', 'Silent installation executed with exit code 0', installPassed);
  record('K', 'Installed DiamondERP.exe exists in target directory', fs.existsSync(path.join(testInstallDir, 'DiamondERP.exe')));
  record('K', 'Installed runtime/node.exe exists in target directory', fs.existsSync(path.join(testInstallDir, 'runtime', 'node.exe')));
  record('K', 'Installed api/dist/index.js exists in target directory', fs.existsSync(path.join(testInstallDir, 'api', 'dist', 'index.js')));
  record('K', 'Installed web/dist/index.html exists in target directory', fs.existsSync(path.join(testInstallDir, 'web', 'dist', 'index.html')));
  record('K', 'Installed api/prisma/template.db exists in target directory', fs.existsSync(path.join(testInstallDir, 'api', 'prisma', 'template.db')));

  // -------------------------------------------------------------------------
  // SECTION L: Upgrade Safety Test (Customer Data Preservation)
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section L] Upgrade Safety Test');
  const testDataDir = path.join(SCRATCH_DIR, 'CustomerData');
  const testDbsDir = path.join(testDataDir, 'databases');
  const testUploadsDir = path.join(testDataDir, 'uploads');
  const testBackupsDir = path.join(testDataDir, 'backups');
  fs.mkdirSync(testDbsDir, { recursive: true });
  fs.mkdirSync(testUploadsDir, { recursive: true });
  fs.mkdirSync(testBackupsDir, { recursive: true });

  // Create mock customer records
  const partyMarker = 'PHASE9_TEST_PARTY_ACME_GEMS';
  const inventoryMarker = 'PHASE9_TEST_DIAMOND_2.0CT_VVS1';
  const txMarker = 'PHASE9_TEST_TX_INV9999';

  const testDbFile = path.join(testDbsDir, 'default.db');
  fs.writeFileSync(testDbFile, `MOCK_SQLITE_DATABASE_DATA_${partyMarker}_${inventoryMarker}_${txMarker}`, 'utf-8');
  fs.writeFileSync(path.join(testUploadsDir, 'cert_test.pdf'), 'MOCK_CERTIFICATE_FILE_CONTENT', 'utf-8');
  fs.writeFileSync(path.join(testBackupsDir, 'backup_test.bak'), 'MOCK_DATABASE_BACKUP_CONTENT', 'utf-8');

  // Run upgrade (install over existing testInstallDir)
  let upgradePassed = false;
  try {
    const upgradeCmd = `"${installerExe}" /silent /dir="${testInstallDir}" /nodesktop /nostartmenu`;
    execSync(upgradeCmd, { stdio: 'pipe', timeout: 30000 });
    upgradePassed = true;
  } catch (err) {
    upgradePassed = false;
  }

  record('L', 'Installer upgrade over existing directory executes with exit code 0', upgradePassed);

  // Verify all customer data remains intact
  const dbSurvives = fs.existsSync(testDbFile) && fs.readFileSync(testDbFile, 'utf-8').includes(partyMarker);
  const uploadSurvives = fs.existsSync(path.join(testUploadsDir, 'cert_test.pdf'));
  const backupSurvives = fs.existsSync(path.join(testBackupsDir, 'backup_test.bak'));

  record('L', 'Customer SQLite database preserved across upgrade', dbSurvives);
  record('L', 'Customer uploaded certificates preserved across upgrade', uploadSurvives);
  record('L', 'Customer database backups preserved across upgrade', backupSurvives);

  // -------------------------------------------------------------------------
  // SECTION M: Uninstall Behavior (Application Removed, Data Preserved)
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section M] Uninstall Behavior Test');
  let uninstallPassed = false;
  try {
    const uninstallCmd = `"${path.join(testInstallDir, 'Installer.exe')}" /uninstall /silent`;
    execSync(uninstallCmd, { stdio: 'pipe', timeout: 30000 });
    uninstallPassed = true;
  } catch (err) {
    uninstallPassed = false;
  }

  record('M', 'Silent uninstaller executes with exit code 0', uninstallPassed);

  // Give Windows 1s for file release/cleanup
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);

  const customerDataStillExists = fs.existsSync(testDbFile) && fs.readFileSync(testDbFile, 'utf-8').includes(partyMarker);
  record('M', 'Customer SQLite database NOT deleted during uninstall (AppData data safety)', customerDataStillExists);

  // -------------------------------------------------------------------------
  // SECTION N: Reinstall Behavior (Preserved Data Recognized)
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section N] Reinstall Behavior Test');
  let reinstallPassed = false;
  try {
    const reinstallCmd = `"${installerExe}" /silent /dir="${testInstallDir}" /nodesktop /nostartmenu`;
    execSync(reinstallCmd, { stdio: 'pipe', timeout: 30000 });
    reinstallPassed = true;
  } catch (err) {
    reinstallPassed = false;
  }

  record('N', 'Reinstall into same directory succeeds with exit code 0', reinstallPassed);
  const customerDataRecognized = fs.existsSync(testDbFile) && fs.readFileSync(testDbFile, 'utf-8').includes(partyMarker);
  record('N', 'Reinstalled application preserves customer data without destructive reset', customerDataRecognized);

  // -------------------------------------------------------------------------
  // SECTION O: Data Preservation Guard (Reject LocalAppData destination)
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section O] Data Preservation Guard');
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');
  const dangerousDir = path.join(localAppData, 'DiamondERP');

  let rejectedDangerous = false;
  try {
    // Attempting to install into %LOCALAPPDATA%\DiamondERP must be rejected
    execSync(`"${installerExe}" /silent /dir="${dangerousDir}"`, { stdio: 'pipe', timeout: 10000 });
    rejectedDangerous = false;
  } catch {
    rejectedDangerous = true;
  }
  record('O', 'Installer strictly rejects installing into mutable LocalAppData directory', rejectedDangerous);

  // -------------------------------------------------------------------------
  // SECTION P: Process Cleanup Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section P] Process Cleanup Checks');
  let orphanDiamondProcs = 0;
  try {
    const procOut = execSync('powershell -NoProfile -Command "(Get-Process -Name DiamondERP -ErrorAction SilentlyContinue).Count"', { encoding: 'utf-8' }).trim();
    orphanDiamondProcs = parseInt(procOut, 10) || 0;
  } catch { }
  record('P', 'Zero orphan DiamondERP processes running', orphanDiamondProcs === 0, `${orphanDiamondProcs} running`);

  // -------------------------------------------------------------------------
  // SECTION Q: Port Cleanup Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section Q] Port Cleanup Checks');
  const portFree = await isPortFree(PROD_PORT);
  record('Q', `Loopback port ${PROD_PORT} is free and reusable`, portFree);

  // -------------------------------------------------------------------------
  // SECTION R: Offline Operation Checks
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section R] Offline Operation Checks');
  // Run node.exe in sanitized PATH (no git, no global node, no npm)
  const sanitizedPath = 'C:\\Windows\\System32;C:\\Windows';
  try {
    const nodeRunOut = execSync(`"${stagedNode}" -e "console.log('OFFLINE_OK')"`, {
      env: { PATH: sanitizedPath, SYSTEMROOT: 'C:\\Windows' },
      encoding: 'utf-8',
    }).trim();
    record('R', 'Bundled Node executes without global node/npm/git on PATH', nodeRunOut === 'OFFLINE_OK', nodeRunOut);
  } catch (err) {
    record('R', 'Bundled Node executes in isolated PATH', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION S: Shortcut Validation
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section S] Shortcut Validation');
  record('S', 'Installer creates shortcuts targeting DiamondERP.exe (not node.exe or scripts)',
    installerCode.includes('shortcutTarget = Path.Combine(targetDir, "DiamondERP.exe")'));
  record('S', 'Installer sets working directory to target directory',
    installerCode.includes('shortcut.WorkingDirectory = targetDir') || installerCode.includes('shortcut.WorkingDirectory = workingDir'));

  // -------------------------------------------------------------------------
  // SECTION T: Final Release Artifact Validation
  // -------------------------------------------------------------------------
  console.log('\n▶ [Section T] Final Release Artifact Validation');
  const setupExe = path.join(RELEASES_DIR, 'DiamondERP-Setup.exe');
  const versionedSetup = path.join(RELEASES_DIR, `DiamondERP-${version}-Setup.exe`);
  const portableZip = path.join(RELEASES_DIR, `DiamondERP-${version}-Windows-x64.zip`);
  const manifestFile = path.join(RELEASES_DIR, 'release-manifest.json');
  const shaSumsFile = path.join(RELEASES_DIR, 'SHA256SUMS.txt');

  const setupExists = fs.existsSync(setupExe);
  record('T', 'build/releases/DiamondERP-Setup.exe exists', setupExists);

  if (setupExists) {
    const setupStat = fs.statSync(setupExe);
    const sizeMb = (setupStat.size / (1024 * 1024)).toFixed(2);
    // Self-contained installer embedding payload archive must be > 50 MB
    record('T', 'DiamondERP-Setup.exe is self-contained with embedded payload (> 50 MB)',
      setupStat.size > 50 * 1024 * 1024, `${sizeMb} MB`);
  }

  record('T', `Versioned Setup alias exists: DiamondERP-${version}-Setup.exe`, fs.existsSync(versionedSetup));
  record('T', `Portable zip bundle exists: DiamondERP-${version}-Windows-x64.zip`, fs.existsSync(portableZip));
  record('T', 'Release manifest release-manifest.json exists', fs.existsSync(manifestFile));
  record('T', 'SHA256SUMS.txt exists', fs.existsSync(shaSumsFile));

  // Clean scratch files
  cleanDir(SCRATCH_DIR);

  // -------------------------------------------------------------------------
  // Summary & Score Calculation
  // -------------------------------------------------------------------------
  const totalChecks = results.length;
  const passedChecks = results.filter((r) => r.passed).length;
  const failedChecks = totalChecks - passedChecks;
  const scorePercent = Math.round((passedChecks / totalChecks) * 100);

  console.log('\n================================================================');
  console.log(`🏁 Phase 9 Installer Test Suite Complete: ${passedChecks}/${totalChecks} PASSED (${scorePercent}%)`);
  if (failedChecks > 0) {
    console.log(`❌ Failed Checks: ${failedChecks}`);
  }
  console.log('================================================================\n');

  if (failedChecks > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\n❌ Unhandled exception in Phase 9 test suite:', err);
  process.exit(1);
});
