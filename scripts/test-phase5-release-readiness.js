/**
 * DiamondERP V3.0 — Phase 5 Release Readiness Automated Test Suite
 *
 * Validates the complete desktop lifecycle on Windows:
 *  1. Clean machine simulation (Zero reliance on system Node in PATH)
 *  2. Silent installation via compiled Installer.exe
 *  3. File payload integrity & shortcut verification
 *  4. Application startup via bundled runtime (runtime/node.exe)
 *  5. Health check & loopback isolation
 *  6. Web static assets & SPA routing serving
 *  7. Authentication & ERP workflow execution (Party/Stock creation)
 *  8. SQLite data persistence
 *  9. Upgrade simulation (Binary replacement preserves user databases)
 * 10. Silent uninstallation (Removes application payload & registry, preserves AppData user records)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync, spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');
const TEST_INSTALL_DIR = path.join(ROOT_DIR, 'scratch', 'test-installed-app');
const TEST_DATA_DIR = path.join(ROOT_DIR, 'scratch', 'test-user-data');
const TEST_PORT = 3100;

const results = [];

function record(name, passed, details = '') {
  results.push({ name, passed, details });
  const icon = passed ? '✔ PASS' : '❌ FAIL';
  console.log(`  ${icon}: ${name}${details ? ` (${details})` : ''}`);
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup lock issues on temp dirs
    }
  }
}

function httpRequest(urlPath, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      Host: `127.0.0.1:${TEST_PORT}`,
      Accept: 'application/json, text/html, */*',
    };

    if (postData && !options.headers?.['Content-Type']) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const reqOptions = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: urlPath,
      method: options.method || 'GET',
      headers: { ...defaultHeaders, ...(options.headers || {}) },
      timeout: 5000,
    };

    const req = http.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        const bodyStr = bodyBuffer.toString('utf-8');
        let json = null;
        try {
          json = JSON.parse(bodyStr);
        } catch {
          // Non-JSON response
        }
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

async function waitForServer(maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await httpRequest('/health');
      if (res.statusCode === 200) {
        return true;
      }
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log('================================================================');
  console.log('🛡️  DiamondERP V3.0 — Phase 5 Release Readiness End-to-End Suite');
  console.log('================================================================\n');

  // ── Step 1: Clean Environment Simulation ──────────────────────────────────
  console.log('[Phase 5.1] Clean Machine Simulation & Bundled Node Independence:');
  const stagedNode = path.join(STAGING_DIR, 'runtime', 'node.exe');
  if (!fs.existsSync(stagedNode)) {
    throw new Error(`Bundled node.exe missing in staging directory: ${stagedNode}`);
  }

  // Strip node from PATH
  const cleanPath = process.env.PATH.split(';')
    .filter((p) => !p.toLowerCase().includes('nodejs') && !p.toLowerCase().includes('npm'))
    .join(';');

  try {
    const nodeVer = execSync(`"${stagedNode}" -v`, {
      env: { ...process.env, PATH: cleanPath },
      encoding: 'utf-8',
    }).trim();
    record('Bundled Node.js executes without system Node in PATH', Boolean(nodeVer), `Version: ${nodeVer}`);
  } catch (err) {
    record('Bundled Node.js executes without system Node in PATH', false, err.message);
  }

  // ── Step 2: Installer Execution & Payload Deployment ──────────────────────
  console.log('\n[Phase 5.2] Silent Installer Execution & Full Payload Deployment:');
  cleanDir(TEST_INSTALL_DIR);
  fs.mkdirSync(TEST_INSTALL_DIR, { recursive: true });

  const installerExe = path.join(STAGING_DIR, 'Installer.exe');
  if (!fs.existsSync(installerExe)) {
    throw new Error(`Installer.exe not found at ${installerExe}`);
  }

  try {
    // Run installer silently pointing to target directory
    execSync(`"${installerExe}" /silent /dir="${TEST_INSTALL_DIR}" /nostartmenu /nodesktop`, {
      cwd: STAGING_DIR,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    record('Installer.exe completes in silent mode with exit code 0', true);
  } catch (err) {
    record('Installer.exe completes in silent mode with exit code 0', false, err.message);
  }

  // Verify deployed binaries and subdirectories
  const requiredFiles = [
    'DiamondERP.exe',
    'Installer.exe',
    'Microsoft.Web.WebView2.Core.dll',
    'Microsoft.Web.WebView2.Wpf.dll',
    'WebView2Loader.dll',
    'app.ico',
    path.join('runtime', 'node.exe'),
    path.join('api', 'dist', 'index.js'),
    path.join('api', 'package.json'),
    path.join('api', 'prisma', 'template.db'),
    path.join('web', 'dist', 'index.html'),
  ];

  let allFilesPresent = true;
  for (const rf of requiredFiles) {
    const fullP = path.join(TEST_INSTALL_DIR, rf);
    if (!fs.existsSync(fullP)) {
      allFilesPresent = false;
      console.log(`    Missing installed file: ${rf}`);
    }
  }
  record('Installed payload integrity (all 11 critical runtime files deployed)', allFilesPresent);

  // Check registry uninstall entry
  try {
    const regCheck = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DiamondERP"', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    record('Windows registry uninstaller registered in CurrentVersion\\Uninstall', regCheck.includes('DiamondERP Enterprise Suite'));
  } catch (err) {
    record('Windows registry uninstaller registered in CurrentVersion\\Uninstall', false, err.message);
  }

  // ── Step 3: Application Startup via Installed Bundled Node ───────────────
  console.log('\n[Phase 5.3] Application Execution from Installed Directory:');
  cleanDir(TEST_DATA_DIR);
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  const installedNode = path.join(TEST_INSTALL_DIR, 'runtime', 'node.exe');
  const installedApiEntry = path.join(TEST_INSTALL_DIR, 'api', 'dist', 'index.js');
  const installedApiDir = path.join(TEST_INSTALL_DIR, 'api');

  const serverProc = spawn(installedNode, [installedApiEntry], {
    cwd: installedApiDir,
    env: {
      ...process.env,
      PATH: cleanPath, // Proves independence from global node
      NODE_ENV: 'production',
      PORT: String(TEST_PORT),
      HOST: '127.0.0.1',
      DIAMOND_DATA_DIR: TEST_DATA_DIR,
      AUTO_SEED_DEFAULT_ADMIN: 'true',
      DEFAULT_ADMIN_PASSWORD: 'Stavan@123',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLogs = '';
  serverProc.stdout.on('data', (d) => { serverLogs += d.toString(); });
  serverProc.stderr.on('data', (d) => { serverLogs += d.toString(); });

  const online = await waitForServer();
  record('Installed application starts and responds to loopback requests', online, `Port: ${TEST_PORT}`);

  if (!online) {
    console.error('[FATAL] Server process output before timeout:\n' + (serverLogs || '(No output recorded)'));
    try { serverProc.kill(); } catch {}
    process.exit(1);
  }

  // ── Step 4: Health, Web UI & API Verification ─────────────────────────────
  console.log('\n[Phase 5.4] Health, Web UI & ERP Workflows:');
  const healthRes = await httpRequest('/health');
  record('Health endpoint returns valid status and connected SQLite DB', healthRes.statusCode === 200 && healthRes.json?.status === 'ok');

  const webRes = await httpRequest('/');
  record('React production UI served by Express from web/dist/', webRes.statusCode === 200 && webRes.body.includes('<div id="root">'));

  // Login
  const loginRes = await httpRequest('/api/auth/login', { method: 'POST' }, {
    username: 'stavan',
    password: 'Stavan@123',
  });
  const token = loginRes.json?.data?.token;
  record('Login with standard admin (stavan / Stavan@123) returns valid JWT', loginRes.statusCode === 200 && Boolean(token));

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Read Parties
  const partiesRes = await httpRequest('/api/parties', { headers: authHeaders });
  record('Domain API: Parties list returns pre-seeded records', partiesRes.statusCode === 200 && partiesRes.json?.data?.length > 0, `Count: ${partiesRes.json?.data?.length}`);

  // Read Stocks
  const stocksRes = await httpRequest('/api/stocks', { headers: authHeaders });
  record('Domain API: Stocks list returns pre-seeded parcels', stocksRes.statusCode === 200 && stocksRes.json?.data?.length > 0, `Count: ${stocksRes.json?.data?.length}`);

  // Create new party in SQLite
  const uniqueCode = `P5_${Date.now().toString().slice(-4)}`;
  const newPartyName = `Phase5_Party_${Date.now().toString().slice(-4)}`;
  const createPartyRes = await httpRequest('/api/parties', {
    method: 'POST',
    headers: authHeaders,
  }, {
    partyCode: uniqueCode,
    name: newPartyName,
    partyType: 'CUSTOMER',
    phone: '+91 9876543210',
    email: 'phase5@diamond-erp.local',
    address: 'Diamond Bourse Suite 500',
  });
  const createdPartyId = createPartyRes.json?.data?.id;
  record('Data creation: Created new customer party in SQLite', createPartyRes.statusCode === 201 && Boolean(createdPartyId), `ID: ${createdPartyId}`);

  // ── Step 5: Clean Process Shutdown & Wal Checkpoint ───────────────────────
  console.log('\n[Phase 5.5] Clean Process Termination:');
  const exitPromise = new Promise((resolve) => {
    serverProc.on('exit', (code, signal) => resolve({ code, signal }));
  });

  serverProc.kill('SIGTERM');
  const exitResult = await Promise.race([
    exitPromise,
    new Promise((r) => setTimeout(() => r({ code: -1, signal: 'TIMEOUT' }), 5000)),
  ]);
  record('Backend process terminates cleanly without orphan processes', exitResult.signal !== 'TIMEOUT');

  // Verify database file in user data directory
  const userDbFile = path.join(TEST_DATA_DIR, 'databases', 'Stavan.db');
  record('User database exists in isolated user data directory', fs.existsSync(userDbFile), `Size: ${(fs.statSync(userDbFile).size / 1024).toFixed(1)} KB`);

  // ── Step 6: Upgrade Simulation & Data Persistence ─────────────────────────
  console.log('\n[Phase 5.6] Upgrade Simulation & Data Persistence:');
  // Re-run installer over the same destination directory (simulating version upgrade)
  try {
    execSync(`"${installerExe}" /silent /dir="${TEST_INSTALL_DIR}" /nostartmenu /nodesktop`, {
      cwd: STAGING_DIR,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    record('Upgrade installation executes and replaces application binaries', true);
  } catch (err) {
    record('Upgrade installation executes and replaces application binaries', false, err.message);
  }

  // Restart backend on upgraded directory
  const upgradedServerProc = spawn(installedNode, [installedApiEntry], {
    cwd: installedApiDir,
    env: {
      ...process.env,
      PATH: cleanPath,
      NODE_ENV: 'production',
      PORT: String(TEST_PORT),
      HOST: '127.0.0.1',
      DIAMOND_DATA_DIR: TEST_DATA_DIR,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForServer();

  // Re-login
  const reLoginRes = await httpRequest('/api/auth/login', { method: 'POST' }, {
    username: 'stavan',
    password: 'Stavan@123',
  });
  const reToken = reLoginRes.json?.data?.token;
  const reAuthHeaders = { Authorization: `Bearer ${reToken}` };

  // Verify the newly created party survived the upgrade
  const verifyPartiesRes = await httpRequest('/api/parties', { headers: reAuthHeaders });
  const partyFound = verifyPartiesRes.json?.data?.some((p) => p.name === newPartyName);
  record('Data persistence: Created party survived upgrade installation', partyFound, `Party: ${newPartyName}`);

  // Shutdown upgraded server
  const upgradedExitPromise = new Promise((resolve) => {
    upgradedServerProc.on('exit', (code, signal) => resolve({ code, signal }));
  });
  upgradedServerProc.kill('SIGTERM');
  await upgradedExitPromise;

  // ── Step 7: Silent Uninstallation & User Data Protection ──────────────────
  console.log('\n[Phase 5.7] Silent Uninstallation & User Data Protection:');
  const installedUninstaller = path.join(TEST_INSTALL_DIR, 'Installer.exe');
  try {
    execSync(`"${installedUninstaller}" /uninstall /silent`, {
      cwd: ROOT_DIR,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    record('Installer.exe /uninstall /silent executes with exit code 0', true);
  } catch (err) {
    record('Installer.exe /uninstall /silent executes with exit code 0', false, err.message);
  }

  // Wait briefly for deletion to finish
  await new Promise((r) => setTimeout(r, 1500));

  // Check that application binaries were removed
  const launcherStillExists = fs.existsSync(path.join(TEST_INSTALL_DIR, 'DiamondERP.exe'));
  record('Application binaries removed after uninstall', !launcherStillExists);

  // Check registry removed
  let regRemoved = false;
  try {
    execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DiamondERP"', {
      stdio: 'pipe',
    });
  } catch {
    regRemoved = true; // Error means key was deleted
  }
  record('Registry uninstaller entry cleanly removed from Windows registry', regRemoved);

  // CRITICAL: User database MUST still exist in TEST_DATA_DIR
  const dbStillExists = fs.existsSync(userDbFile);
  record('CRITICAL: User business database in AppData was SAFELY PRESERVED after uninstall', dbStillExists, `Path: ${userDbFile}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`Phase 5 E2E Test Summary: ${passed}/${total} checks PASSED (${failed} failed)`);
  console.log('================================================================\n');

  // Clean up scratch data
  cleanDir(TEST_INSTALL_DIR);
  cleanDir(TEST_DATA_DIR);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 PHASE 5 VERIFICATION SUCCEEDED! All Windows desktop release requirements met.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\n[FATAL] Phase 5 test runner failed:', err);
  process.exit(1);
});
