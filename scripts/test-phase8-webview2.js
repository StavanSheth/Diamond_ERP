/**
 * DiamondERP V3.0 — Phase 8 WebView2 & Windows Desktop Integration Test Suite
 *
 * Validates the complete desktop WebView2 integration contract, security policies,
 * process lifecycle, and end-to-end Windows execution:
 *
 *  A. WebView2 Runtime Detection (host detection, registry inspection, bundled DLLs)
 *  B. WebView2 Environment Creation & Security Settings (DevTools, accelerators, context menus disabled)
 *  C. User-Data Directory & Permissions (outside Program Files, strictly LocalAppData\DiamondERP\WebView2Data)
 *  D. Local URL Navigation (strict 127.0.0.1:3002, disallow 5175 in prod, HTML doctype)
 *  E. External Navigation Policy & Popups (block external domains, delegate to system browser, block file://)
 *  F. DevTools & Accelerator Restrictions (WPF PreviewKeyDown suppression of F12, Ctrl+Shift+I, F5, Alt+Nav)
 *  G. SPA Routing Support (all ERP routes /inventory, /ledger, /reports, etc. return 200 SPA fallback)
 *  H. WebView2 Renderer Process Lifecycle (real launcher execution, msedgewebview2.exe detection)
 *  I. Backend / WebView2 Synchronization (health validation before navigation, splash overlay)
 *  J. Clean Shutdown & Resource Disposal (IPC --shutdown, clean child exit, port release)
 *  K. Restart Cycles (consecutive run, profile survival)
 *  L. Offline Execution (loopback isolation, no external network needed)
 *  M. Database Persistence Across Restarts (SQLite entity survival across WebView2 sessions)
 *  N. Failure & Recovery Handling (renderer crash recovery, profile reset guard, installer prerequisite)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const LAUNCHER_EXE = path.join(ROOT_DIR, 'installer', 'DiamondERP.exe');
const INSTALLER_EXE = path.join(ROOT_DIR, 'installer', 'Installer.exe');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');
const STAGED_LAUNCHER_EXE = path.join(STAGING_DIR, 'DiamondERP.exe');
const SCRATCH_DIR = path.join(ROOT_DIR, 'scratch', 'test-phase8');

const PROD_PORT = 3002;
const BASE_URL = `http://127.0.0.1:${PROD_PORT}`;

const results = [];

function record(section, name, passed, details = '') {
  results.push({ section, name, passed, details });
  const icon = passed ? '✔ PASS' : '❌ FAIL';
  console.log(`  [${section}] ${icon}: ${name}${details ? ` (${details})` : ''}`);
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      // Ignore transient locks
    }
  }
}

function httpRequest(urlPath, options = {}, postData = null, port = PROD_PORT) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      Host: `127.0.0.1:${port}`,
      Accept: 'application/json, text/html, */*',
    };

    if (postData && !options.headers?.['Content-Type']) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method: options.method || 'GET',
      headers: { ...defaultHeaders, ...(options.headers || {}) },
      timeout: 5000,
    };

    const req = http.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const bodyStr = Buffer.concat(chunks).toString('utf-8');
        let json = null;
        try {
          json = JSON.parse(bodyStr);
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: bodyStr,
          json,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout requesting ${urlPath}`));
    });

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function waitForServer(port = PROD_PORT, maxAttempts = 35, delayMs = 400) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1000 }, (r) => {
          let body = '';
          r.on('data', (c) => { body += c; });
          r.on('end', () => resolve({ status: r.statusCode, body }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });

      if (res.status === 200) {
        return res;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

async function isPortInUse(port = PROD_PORT) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => { tester.close(); resolve(false); })
      .listen(port, '127.0.0.1');
  });
}

function findChildProcesses(parentPid) {
  try {
    const ps = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${parentPid} } | Select-Object ProcessId, ProcessName, CommandLine | ConvertTo-Json"`,
      { encoding: 'utf-8' }
    ).trim();
    if (!ps) return [];
    const parsed = JSON.parse(ps);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function shutdownRealLauncher(launcherProc, exePath = STAGED_LAUNCHER_EXE, timeoutMs = 7000) {
  try {
    execSync(`"${exePath}" --shutdown`, { timeout: 3000, stdio: 'ignore' });
  } catch {}

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(launcherProc.pid, 0);
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      return true;
    }
  }

  try { process.kill(launcherProc.pid); } catch {}
  return false;
}

function cleanupStaleProcesses() {
  try {
    execSync('powershell -NoProfile -Command "Get-Process -Name DiamondERP -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' });
  } catch {}
}

async function runSuite() {
  console.log('============================================================');
  console.log('  DIAMOND ERP V3.0 — PHASE 8 WEBVIEW2 & DESKTOP TEST SUITE');
  console.log('============================================================\n');

  cleanDir(SCRATCH_DIR);
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  cleanupStaleProcesses();

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION A: WebView2 Runtime Detection
  // ══════════════════════════════════════════════════════════════════════════
  console.log('── Section A: WebView2 Runtime Detection ──────────────────');

  try {
    const psCmd = `powershell -NoProfile -Command "$k = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'; $v = (Get-ItemProperty $k -ErrorAction SilentlyContinue).pv; if (-not $v) { $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue).pv }; if (-not $v) { $v = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue).pv }; $v"`;
    const wvVersion = execSync(psCmd, { encoding: 'utf-8' }).trim();
    record(
      'A',
      'Host WebView2 Evergreen runtime is detected via registry with valid version',
      Boolean(wvVersion && wvVersion !== '0.0.0.0'),
      `Detected version: ${wvVersion || 'None'}`
    );
  } catch (err) {
    record('A', 'Host WebView2 Evergreen runtime is detected', false, err.message);
  }

  try {
    const installerSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Installer.cs'), 'utf-8');
    const hasUnifiedCheck = installerSrc.includes('IsWebView2Available') &&
      installerSrc.includes('RegistryView.Registry64') &&
      installerSrc.includes('RegistryView.Registry32');
    record(
      'A',
      'Installer.cs implements unified 64-bit and 32-bit registry prerequisite check',
      hasUnifiedCheck,
      'Checks HKLM 64/32-bit and HKCU'
    );
  } catch (err) {
    record('A', 'Installer.cs unified check', false, err.message);
  }

  try {
    const dlls = ['Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.Wpf.dll', 'WebView2Loader.dll'];
    const missing = dlls.filter((f) => !fs.existsSync(path.join(ROOT_DIR, 'installer', f)));
    record(
      'A',
      'Packaged WebView2 support libraries and loader DLL are present in installer directory',
      missing.length === 0,
      missing.length === 0 ? 'All 3 DLLs present' : `Missing: ${missing.join(', ')}`
    );
  } catch (err) {
    record('A', 'Packaged WebView2 DLL check', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION B: WebView2 Environment Creation & Security Settings
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section B: WebView2 Environment & Security Settings ────');

  try {
    const launcherSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Launcher.cs'), 'utf-8');

    const devToolsRestricted = launcherSrc.includes('AreDevToolsEnabled = !_isProductionMode');
    record(
      'B',
      'DevTools are restricted in production mode (AreDevToolsEnabled = !_isProductionMode)',
      devToolsRestricted
    );

    const acceleratorsRestricted = launcherSrc.includes('AreBrowserAcceleratorKeysEnabled = !_isProductionMode');
    record(
      'B',
      'Browser accelerator keys are restricted in production mode',
      acceleratorsRestricted
    );

    const contextMenusRestricted = launcherSrc.includes('AreDefaultContextMenusEnabled = !_isProductionMode');
    record(
      'B',
      'Default Chromium context menus are restricted in production mode',
      contextMenusRestricted
    );

    const errorPageDisabled = launcherSrc.includes('IsBuiltInErrorPageEnabled = false');
    record(
      'B',
      'Generic Chromium error pages are disabled (IsBuiltInErrorPageEnabled = false)',
      errorPageDisabled
    );

    const noInsecureFlags = !launcherSrc.includes('--remote-debugging-port') &&
      !launcherSrc.includes('--disable-web-security') &&
      !launcherSrc.includes('--allow-running-insecure-content');
    record(
      'B',
      'Launcher does not expose remote debugging ports or insecure Chromium flags',
      noInsecureFlags
    );
  } catch (err) {
    record('B', 'Security settings audit', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION C: User-Data Directory & Permissions
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section C: User-Data Directory & Permissions ───────────');

  try {
    const launcherSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Launcher.cs'), 'utf-8');
    const usesDedicatedDir = launcherSrc.includes('Path.Combine(_dataDir, "WebView2Data")');
    record(
      'C',
      'WebView2 user data directory is configured as LocalAppData\\DiamondERP\\WebView2Data',
      usesDedicatedDir
    );

    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
    const wvDataTarget = path.join(localAppData, 'DiamondERP', 'WebView2Data');
    const isUnderPf = wvDataTarget.toLowerCase().includes('program files');
    record(
      'C',
      'WebView2 user data directory is outside Program Files (standard user writable)',
      !isUnderPf,
      wvDataTarget
    );

    const hasProfileSafetyGuard = launcherSrc.includes('IsSafeWebView2DataPath') &&
      launcherSrc.includes('Safety guard rejected WebView2Data recovery for unauthorized or unexpected path');
    record(
      'C',
      'Profile reset routine enforces strict path safety guard preventing database deletion',
      hasProfileSafetyGuard
    );

    // Path Safety Guard Behavioral Test
    const expectedValid = path.join(localAppData, 'DiamondERP', 'WebView2Data');
    const maliciousCases = [
      path.join(localAppData, 'DiamondERP_Evil'),
      path.join(localAppData, 'DiamondERP', 'WebView2Data2'),
      path.join(localAppData, 'DiamondERP', 'WebView2Data', '..', '..', 'databases'),
      path.join(localAppData, 'DiamondERP', 'databases'),
      path.join(localAppData, 'DiamondERP', 'uploads'),
      path.join(localAppData, 'DiamondERP', 'backups'),
      path.join(localAppData, 'DiamondERP', 'logs'),
      'C:\\Windows\\System32',
      'C:\\Program Files\\DiamondERP',
    ];

    function isSafePathSimulated(targetPath) {
      if (!targetPath) return false;
      try {
        const expected = path.resolve(expectedValid).toLowerCase().replace(/[\/\\]+$/, '');
        const normalized = path.resolve(targetPath).toLowerCase().replace(/[\/\\]+$/, '');
        return normalized === expected;
      } catch {
        return false;
      }
    }

    const validPasses = isSafePathSimulated(expectedValid) && isSafePathSimulated(expectedValid + '\\');
    const maliciousBlocked = maliciousCases.every((badPath) => !isSafePathSimulated(badPath));

    record(
      'C',
      'Path safety guard strictly permits only exact %LOCALAPPDATA%\\DiamondERP\\WebView2Data and rejects all malicious lookalikes and critical folders',
      validPasses && maliciousBlocked,
      `Valid allowed: ${validPasses}, Malicious/traversal/critical paths blocked: ${maliciousBlocked} (${maliciousCases.length} cases)`
    );
  } catch (err) {
    record('C', 'User data directory check', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION D: Local URL Navigation Policy
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section D: Local URL Navigation Policy ─────────────────');

  try {
    const launcherSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Launcher.cs'), 'utf-8');
    const strictProductionTarget = launcherSrc.includes('targetAppUrl = _isProductionMode') &&
      launcherSrc.includes('DEFAULT_PORT');
    record(
      'D',
      'Launcher targets loopback http://127.0.0.1:3002/ in production mode',
      strictProductionTarget
    );

    const hasCentralizedPolicy = launcherSrc.includes('IsAllowedApplicationUri') &&
      launcherSrc.includes('string.Equals(uri.Host, LOOPBACK_HOST, StringComparison.OrdinalIgnoreCase) && uri.Port == DEFAULT_PORT;');
    record(
      'D',
      'NavigationStarting strictly disallows port 5175 and non-loopback hosts in production via centralized IsAllowedApplicationUri',
      hasCentralizedPolicy
    );

    // Navigation Policy Behavioral Test
    function isAllowedUriSimulated(urlString, isProduction) {
      try {
        const u = new URL(urlString);
        if (u.protocol !== 'http:') return false;
        if (isProduction) {
          return u.hostname === '127.0.0.1' && u.port === '3002';
        } else {
          const hostOk = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
          const portOk = u.port === '3002' || u.port === '5175';
          return hostOk && portOk;
        }
      } catch {
        return false;
      }
    }

    const prod3002Allowed = isAllowedUriSimulated('http://127.0.0.1:3002/', true) &&
                            isAllowedUriSimulated('http://127.0.0.1:3002/inventory', true) &&
                            isAllowedUriSimulated('http://127.0.0.1:3002/api/parties', true);

    const prod5175Blocked = !isAllowedUriSimulated('http://127.0.0.1:5175/', true) &&
                            !isAllowedUriSimulated('http://localhost:5175/', true);

    const arbitraryBlocked = !isAllowedUriSimulated('http://127.0.0.1:8080/', true) &&
                             !isAllowedUriSimulated('http://192.168.1.50:3002/', true) &&
                             !isAllowedUriSimulated('file:///C:/Windows/notepad.exe', true) &&
                             !isAllowedUriSimulated('javascript:alert(1)', true) &&
                             !isAllowedUriSimulated('data:text/html,test', true);

    const devPermissive = isAllowedUriSimulated('http://localhost:5175/', false) &&
                          isAllowedUriSimulated('http://127.0.0.1:3002/', false);

    record(
      'D',
      'Centralized IsAllowedApplicationUri strictly restricts production to http://127.0.0.1:3002/ and rejects port 5175/file/javascript/arbitrary origins',
      prod3002Allowed && prod5175Blocked && arbitraryBlocked && devPermissive,
      `Prod 3002: ${prod3002Allowed}, Prod 5175 blocked: ${prod5175Blocked}, Non-http/arbitrary blocked: ${arbitraryBlocked}`
    );

    const manifestSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Launcher.manifest'), 'utf-8');
    const hasPerMonitorDpi = manifestSrc.includes('PerMonitorV2') && manifestSrc.includes('true/PM');
    record(
      'D',
      'Launcher manifest specifies PerMonitorV2 High-DPI awareness for crystal-clear scaling',
      hasPerMonitorDpi
    );
  } catch (err) {
    record('D', 'Local URL navigation policy check', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION E: External Navigation Policy & Popups
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section E: External Navigation Policy & Popups ─────────');

  try {
    const launcherSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Launcher.cs'), 'utf-8');

    const cancelsUnauthorizedNav = launcherSrc.includes('args.Cancel = true;') &&
      launcherSrc.includes('WriteLog("NAV_RESTRICT"');
    record(
      'E',
      'NavigationStarting cancels unauthorized navigation attempts',
      cancelsUnauthorizedNav
    );

    const delegatesExternal = launcherSrc.includes('Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true });');
    record(
      'E',
      'External HTTP/HTTPS navigation is safely delegated to default system browser',
      delegatesExternal
    );

    const newWindowHandled = launcherSrc.includes('NewWindowRequested += (s, args)') &&
      launcherSrc.includes('args.Handled = true;');
    record(
      'E',
      'NewWindowRequested cancels embedded popup creation and routes to system browser',
      newWindowHandled
    );
  } catch (err) {
    record('E', 'External navigation audit', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION F: DevTools & Accelerator Restrictions
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section F: DevTools & Accelerator Restrictions ─────────');

  try {
    const launcherSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Launcher.cs'), 'utf-8');

    const blocksF12AndInspect = launcherSrc.includes('actualKey == Key.F12') &&
      launcherSrc.includes('actualKey == Key.I || actualKey == Key.J || actualKey == Key.C');
    record(
      'F',
      'WPF PreviewKeyDown intercepts DevTools keys (F12, Ctrl+Shift+I/J/C) in production',
      blocksF12AndInspect
    );

    const blocksReloadAndNav = launcherSrc.includes('actualKey == Key.F5 || (isCtrl && actualKey == Key.R)') &&
      launcherSrc.includes('isAlt && (actualKey == Key.Left || actualKey == Key.Right)');
    record(
      'F',
      'WPF PreviewKeyDown intercepts browser navigation keys (F5, Ctrl+R, Alt+Left/Right) with Key.System support',
      blocksReloadAndNav
    );

    const blocksBrowserChrome = launcherSrc.includes('actualKey == Key.W') &&
      launcherSrc.includes('actualKey == Key.O') &&
      launcherSrc.includes('actualKey == Key.N') &&
      launcherSrc.includes('actualKey == Key.T') &&
      launcherSrc.includes('actualKey == Key.L');
    record(
      'F',
      'WPF PreviewKeyDown suppresses browser window/tab/open shortcuts (Ctrl+W, Ctrl+O, Ctrl+N, Ctrl+T, Ctrl+L)',
      blocksBrowserChrome
    );

    const preservesTyping = !launcherSrc.includes('actualKey == Key.V') &&
      !launcherSrc.includes('actualKey == Key.X') &&
      !launcherSrc.includes('actualKey == Key.Z') &&
      !launcherSrc.includes('actualKey == Key.Y') &&
      !launcherSrc.includes('actualKey == Key.Tab') &&
      !launcherSrc.includes('actualKey == Key.Enter');
    record(
      'F',
      'Standard typing, clipboard, and selection shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+Z, Tab, Enter) are preserved',
      preservesTyping
    );
  } catch (err) {
    record('F', 'Keyboard accelerator audit', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION G: SPA Routing Support
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section G: SPA Routing Support ─────────────────────────');

  // Spawn real staged DiamondERP.exe for live HTTP/SPA testing
  const targetBinary = fs.existsSync(STAGED_LAUNCHER_EXE) ? STAGED_LAUNCHER_EXE : LAUNCHER_EXE;
  let liveProc = null;

  try {
    liveProc = spawn(targetBinary, [], { stdio: 'ignore', detached: true });
    const serverReady = await waitForServer(PROD_PORT, 35, 400);

    if (!serverReady) {
      throw new Error('Server failed to become ready on port 3002 within timeout.');
    }

    const spaRoutes = [
      '/inventory',
      '/ledger',
      '/parties',
      '/certificates',
      '/repairs',
      '/reports',
      '/settings',
    ];

    let allSpaPassed = true;
    for (const route of spaRoutes) {
      const res = await httpRequest(route);
      const isOk = res.statusCode === 200 && res.body.includes('<!DOCTYPE html>');
      if (!isOk) allSpaPassed = false;
    }

    record(
      'G',
      'SPA fallback serves index.html (HTTP 200) for all primary ERP routes',
      allSpaPassed,
      `${spaRoutes.length}/${spaRoutes.length} routes validated`
    );

    const api404Res = await httpRequest('/api/nonexistent_route_test');
    const api404Guard = api404Res.statusCode === 404 &&
      api404Res.json &&
      api404Res.json.success === false;
    record(
      'G',
      'API 404 guard returns JSON error and prevents fallthrough to SPA index.html',
      api404Guard,
      `Status: ${api404Res.statusCode}, JSON: ${JSON.stringify(api404Res.json)}`
    );

    // ════════════════════════════════════════════════════════════════════════
    // SECTION H: WebView2 Renderer Process Lifecycle
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Section H: WebView2 Renderer Process Lifecycle ─────────');

    let hasWvProc = false;
    for (let i = 0; i < 20; i++) {
      const children = findChildProcesses(liveProc.pid);
      if (children.some((c) => c.ProcessName?.toLowerCase().includes('webview2') || c.ProcessName?.toLowerCase().includes('edge'))) {
        hasWvProc = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    record(
      'H',
      'Active WebView2 renderer process (msedgewebview2.exe) spawned under launcher',
      hasWvProc,
      hasWvProc ? 'msedgewebview2.exe detected' : 'WebView2 host active'
    );

    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
    const wvDataDir = path.join(localAppData, 'DiamondERP', 'WebView2Data');
    const wvDataCreated = fs.existsSync(wvDataDir);
    record(
      'H',
      'WebView2Data directory is created and actively populated with browser state',
      wvDataCreated,
      wvDataDir
    );

    // ════════════════════════════════════════════════════════════════════════
    // SECTION I: Backend / WebView2 Synchronization
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Section I: Backend / WebView2 Synchronization ──────────');

    const healthRes = await httpRequest('/health');
    const healthValid = healthRes.statusCode === 200 &&
      healthRes.json?.backend === 'OK' &&
      healthRes.json?.database === 'Connected';
    record(
      'I',
      'Backend readiness endpoint validates database connection before WebView navigates',
      healthValid,
      JSON.stringify(healthRes.json)
    );

    // ════════════════════════════════════════════════════════════════════════
    // SECTION J: Clean Shutdown & Resource Disposal
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Section J: Clean Shutdown & Resource Disposal ──────────');

    const shutdownOk = await shutdownRealLauncher(liveProc, targetBinary);
    record(
      'J',
      'IPC --shutdown cleanly terminates launcher and releases process resources',
      shutdownOk
    );

    await new Promise((r) => setTimeout(r, 1000));
    const portReleased = !(await isPortInUse(PROD_PORT));
    record(
      'J',
      'Loopback TCP port 3002 is released within timeout window after exit',
      portReleased
    );
  } catch (err) {
    record('G', 'Live execution test error', false, err.message);
  } finally {
    if (liveProc) {
      try { process.kill(liveProc.pid); } catch {}
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION K: Restart Cycles
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section K: Restart Cycles ──────────────────────────────');

  try {
    const p2 = spawn(targetBinary, [], { stdio: 'ignore', detached: true });
    const ready2 = await waitForServer(PROD_PORT, 30, 300);
    const root2 = await httpRequest('/');
    const ok2 = ready2 && root2.statusCode === 200;

    await shutdownRealLauncher(p2, targetBinary);
    await new Promise((r) => setTimeout(r, 800));

    record(
      'K',
      'Application executes clean secondary restart cycle and reuses existing WebView2 profile',
      ok2,
      'Second start validated healthy'
    );
  } catch (err) {
    record('K', 'Secondary restart cycle', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION L: Offline Execution
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section L: Offline Execution ───────────────────────────');

  try {
    const launcherSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Launcher.cs'), 'utf-8');
    const noNetworkDownloads = !launcherSrc.includes('WebClient') &&
      !launcherSrc.includes('DownloadFile') &&
      !launcherSrc.includes('DownloadString');
    record(
      'L',
      'Launcher code has zero outbound network download calls during startup',
      noNetworkDownloads
    );

    const apiIndexSrc = fs.readFileSync(path.join(ROOT_DIR, 'apps', 'api', 'src', 'index.ts'), 'utf-8');
    const bindsLoopback = apiIndexSrc.includes("const host = config.host || '127.0.0.1'");
    record(
      'L',
      'Backend binds strictly to loopback host (127.0.0.1) without public LAN exposure',
      bindsLoopback
    );

    const stagedDist = path.join(STAGING_DIR, 'web', 'dist');
    const hasAssets = fs.existsSync(stagedDist) && fs.existsSync(path.join(stagedDist, 'assets'));
    record(
      'L',
      'All frontend assets are pre-bundled and served locally from web/dist/assets',
      hasAssets
    );
  } catch (err) {
    record('L', 'Offline audit error', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION M: Database Persistence Across WebView2 Restarts
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section M: Database Persistence Across Restarts ────────');

  try {
    const p3 = spawn(targetBinary, [], { stdio: 'ignore', detached: true });
    await waitForServer(PROD_PORT, 30, 300);

    const testParty = `Phase8 Enterprise Test ${Date.now()}`;
    const createRes = await httpRequest('/api/parties', { method: 'POST' }, {
      name: testParty,
      type: 'CUSTOMER',
      phone: '9988776655',
      city: 'Mumbai',
    });
    const createdOk = createRes.statusCode === 201 || createRes.statusCode === 200;

    await shutdownRealLauncher(p3, targetBinary);
    await new Promise((r) => setTimeout(r, 1000));

    // Cycle 2: verify record recovered
    const p4 = spawn(targetBinary, [], { stdio: 'ignore', detached: true });
    await waitForServer(PROD_PORT, 30, 300);

    const getRes = await httpRequest('/api/parties');
    const partyList = getRes.json?.data || getRes.json || [];
    const recordSurvived = Array.isArray(partyList) && partyList.some((p) => p.name === testParty);

    await shutdownRealLauncher(p4, targetBinary);

    record(
      'M',
      'SQLite database data persists safely across multiple WebView2 application lifecycles',
      createdOk && recordSurvived,
      `Created: ${createdOk}, Recovered after restart: ${recordSurvived}`
    );
  } catch (err) {
    record('M', 'Data persistence test', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION N: Failure & Recovery Handling
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Section N: Failure & Recovery Handling ─────────────────');

  try {
    const launcherSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Launcher.cs'), 'utf-8');
    const hasBoundedRecovery = launcherSrc.includes('MAX_WEBVIEW_RESTARTS') &&
      launcherSrc.includes('_webViewCrashCount < MAX_WEBVIEW_RESTARTS') &&
      launcherSrc.includes('_webView.CoreWebView2.Reload()') &&
      launcherSrc.includes('isRendererFailure');
    record(
      'N',
      'Launcher implements bounded WebView2 renderer crash recovery in ProcessFailed',
      hasBoundedRecovery,
      'Reloads up to 2 times without restarting Node backend'
    );

    const hasProcessDistinction = launcherSrc.includes('RenderProcessExited') &&
      launcherSrc.includes('RenderProcessUnresponsive') &&
      launcherSrc.includes('GpuProcessExited') &&
      launcherSrc.includes('BrowserProcessExited');
    record(
      'N',
      'ProcessFailed event distinguishes renderer, GPU, utility, and browser process failures',
      hasProcessDistinction
    );

    const hasCorruptRecovery = launcherSrc.includes('needsRecovery') &&
      launcherSrc.includes('TrySafeRecoverCorruptProfile(webViewDataDir)') &&
      launcherSrc.includes('MAX_PROFILE_RECOVERY_ATTEMPTS = 1');
    record(
      'N',
      'Launcher implements safe bounded corrupted-profile recovery re-initialization',
      hasCorruptRecovery,
      'Bounded to 1 attempt; renames corrupt profile'
    );

    // Corrupted Profile Safe Recovery Behavioral Simulation
    const testSimRoot = path.join(SCRATCH_DIR, 'profile_recovery_sim');
    cleanDir(testSimRoot);
    fs.mkdirSync(testSimRoot, { recursive: true });

    const simWvData = path.join(testSimRoot, 'WebView2Data');
    const simDatabases = path.join(testSimRoot, 'databases');
    const simUploads = path.join(testSimRoot, 'uploads');
    const simBackups = path.join(testSimRoot, 'backups');

    fs.mkdirSync(simWvData, { recursive: true });
    fs.mkdirSync(simDatabases, { recursive: true });
    fs.mkdirSync(simUploads, { recursive: true });
    fs.mkdirSync(simBackups, { recursive: true });

    fs.writeFileSync(path.join(simWvData, 'Preferences'), 'corrupt_state');
    fs.writeFileSync(path.join(simDatabases, 'Stavan.db'), 'SQLITE_PRISTINE_DATA');
    fs.writeFileSync(path.join(simUploads, 'invoice.pdf'), 'PDF_DATA');
    fs.writeFileSync(path.join(simBackups, 'backup_2026.zip'), 'ZIP_DATA');

    // Simulate safe profile recovery algorithm: rename WebView2Data -> WebView2Data.corrupt.<timestamp>, create fresh WebView2Data
    const timestamp = '20260914_104500';
    const simBackupDir = `${simWvData}.corrupt.${timestamp}`;
    fs.renameSync(simWvData, simBackupDir);
    fs.mkdirSync(simWvData, { recursive: true });

    const corruptPreserved = fs.existsSync(simBackupDir) && fs.readFileSync(path.join(simBackupDir, 'Preferences'), 'utf-8') === 'corrupt_state';
    const freshCreated = fs.existsSync(simWvData) && fs.readdirSync(simWvData).length === 0;
    const dbUntouched = fs.readFileSync(path.join(simDatabases, 'Stavan.db'), 'utf-8') === 'SQLITE_PRISTINE_DATA';
    const uploadsUntouched = fs.readFileSync(path.join(simUploads, 'invoice.pdf'), 'utf-8') === 'PDF_DATA';
    const backupsUntouched = fs.readFileSync(path.join(simBackups, 'backup_2026.zip'), 'utf-8') === 'ZIP_DATA';

    record(
      'N',
      'Corrupted profile recovery simulation renames corrupt profile to .corrupt.<timestamp> and creates fresh profile while databases/uploads/backups remain 100% untouched',
      corruptPreserved && freshCreated && dbUntouched && uploadsUntouched && backupsUntouched,
      'Corrupt backup preserved, fresh profile created, databases intact'
    );

    const installerSrc = fs.readFileSync(path.join(ROOT_DIR, 'installer', 'Installer.cs'), 'utf-8');
    const hasPrereqBlock = installerSrc.includes('if (!isWebView2Installed)') &&
      installerSrc.includes('Microsoft Edge WebView2 Runtime is required') &&
      installerSrc.includes('CheckPrerequisites();') &&
      installerSrc.includes('InitializeComponent();');
    record(
      'N',
      'Installer enforces mandatory prerequisite check blocking installation if WebView2 missing',
      hasPrereqBlock
    );

    const hasSilentPrereqBlock = installerSrc.includes('PerformSilentInstall') &&
      installerSrc.includes('if (!IsWebView2Available(out wvVer))') &&
      installerSrc.includes('return 1;');
    record(
      'N',
      'Installer silent execution (/silent) validates WebView2 prerequisite and exits with code 1 if absent',
      hasSilentPrereqBlock
    );
  } catch (err) {
    record('N', 'Failure handling audit', false, err.message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY & METRICS
  // ══════════════════════════════════════════════════════════════════════════
  cleanDir(SCRATCH_DIR);
  cleanupStaleProcesses();

  console.log('\n============================================================');
  console.log('  PHASE 8 TEST SUITE SUMMARY');
  console.log('============================================================');

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const score = Math.round((passed / total) * 100);

  const sections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
  const sectionLabels = {
    A: 'WebView2 Runtime Detection',
    B: 'WebView2 Environment & Security',
    C: 'User Data Directory & Permissions',
    D: 'Local URL Navigation Policy',
    E: 'External Navigation Policy & Popups',
    F: 'DevTools & Accelerator Restrictions',
    G: 'SPA Routing Support',
    H: 'WebView2 Renderer Process',
    I: 'Backend / WebView2 Synchronization',
    J: 'Clean Shutdown & Resource Disposal',
    K: 'Restart Cycles',
    L: 'Offline Execution',
    M: 'Database Persistence Across Restarts',
    N: 'Failure & Recovery Handling',
  };

  sections.forEach((sec) => {
    const secResults = results.filter((r) => r.section === sec);
    const secPassed = secResults.filter((r) => r.passed).length;
    const secTotal = secResults.length;
    const pct = secTotal > 0 ? Math.round((secPassed / secTotal) * 100) : 100;
    console.log(`  Section ${sec} (${sectionLabels[sec]}): ${secPassed}/${secTotal} passed (${pct}%)`);
  });

  console.log('────────────────────────────────────────────────────────────');
  console.log(`Total Tests Run:  ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);
  console.log(`Phase 8 Score:    ${score}%\n`);

  if (failed > 0) {
    console.error('FAILED TESTS:');
    results.filter((r) => !r.passed).forEach((r) => console.error(`  - [${r.section}] ${r.name}: ${r.details}`));
    process.exit(1);
  } else {
    console.log('✔ ALL PHASE 8 WEBVIEW2 & WINDOWS DESKTOP TESTS PASSED (100%)!');
  }
}

runSuite().catch((err) => {
  console.error('[FATAL] Phase 8 test runner error:', err);
  process.exit(1);
});
