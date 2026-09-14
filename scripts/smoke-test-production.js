/**
 * DiamondERP V3.0 — Production Smoke Test Suite
 *
 * Supports two operational modes:
 *   1. Repository Source Mode:  `npm run test:smoke`
 *      Runs against apps/api/dist and apps/web/dist.
 *   2. Staged Artifact Mode:    `npm run test:smoke:staged` (or node scripts/smoke-test-production.js --staged)
 *      Runs strictly against build/windows/DiamondERP/api using build/windows/DiamondERP/api/node_modules.
 *
 * Verifies:
 *  - Dependency isolation (Node module resolution strictly from staged api/node_modules)
 *  - Backend boot in production mode on 127.0.0.1 loopback
 *  - /health reports healthy backend and connected SQLite database
 *  - React root page (/) served from staged web/dist
 *  - Client-side SPA routing (/dashboard) falls back to React index.html
 *  - Static assets (/assets/...) served with correct headers
 *  - Strict API boundary (/api/* 404 returns JSON, NEVER HTML)
 *  - Admin authentication flow
 *  - Database write and read operations
 *  - Database persistence across server restart
 *  - Windows LocalAppData directory isolation
 *  - Clean server process termination
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const isStagedMode = process.argv.includes('--staged');

const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');
const PORT = process.env.SMOKE_PORT ? parseInt(process.env.SMOKE_PORT, 10) : 3099;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Isolated temporary data directory
const TEMP_DATA_DIR = path.join(ROOT_DIR, 'scratch', isStagedMode ? 'staged_smoke_test_data' : 'smoke_test_data');
if (fs.existsSync(TEMP_DATA_DIR)) {
  fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEMP_DATA_DIR, { recursive: true });

let serverProcess = null;
const results = [];

function recordResult(testName, passed, details = '') {
  results.push({ name: testName, passed, details });
  const icon = passed ? '✔' : '❌';
  console.log(`  ${icon} ${testName} ${details ? '(' + details + ')' : ''}`);
}

function httpRequest(urlPath, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: { ...(options.headers || {}) },
      timeout: 10000,
    };

    if (body) {
      if (typeof body === 'object') {
        body = JSON.stringify(body);
        reqOptions.headers['Content-Type'] = 'application/json';
      }
      reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function waitForServer(maxWaitMs = 35000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await httpRequest('/health');
      if (res.statusCode === 200) {
        return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function spawnServer(apiEntry, cwd) {
  const databasesDir = path.join(TEMP_DATA_DIR, 'databases');
  if (!fs.existsSync(databasesDir)) {
    fs.mkdirSync(databasesDir, { recursive: true });
  }

  const isolatedDbPath = path.join(databasesDir, 'Stavan.db');
  if (!fs.existsSync(isolatedDbPath)) {
    const templatePath = isStagedMode
      ? path.join(STAGING_DIR, 'api', 'prisma', 'template.db')
      : path.join(ROOT_DIR, 'apps', 'api', 'prisma', 'template.db');
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, isolatedDbPath);
    }
  }

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DIAMOND_DATA_DIR: TEMP_DATA_DIR,
    DATABASE_URL: `file:${isolatedDbPath}`,
    DEFAULT_ADMIN_PASSWORD: 'Stavan@123',
    AUTO_SEED_DEFAULT_ADMIN: 'true',
  };

  let nodeBin = 'node';
  if (isStagedMode) {
    const bundledNode = path.join(STAGING_DIR, 'runtime', 'node.exe');
    if (fs.existsSync(bundledNode)) {
      nodeBin = bundledNode;
    } else {
      throw new Error(`Bundled Node runtime missing in staged artifacts: ${bundledNode}`);
    }
  }

  const proc = spawn(nodeBin, [apiEntry], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (d) => {
    if (process.env.VERBOSE) {
      const text = d.toString().trim();
      if (text) console.log(`  [srv] ${text}`);
    }
  });

  proc.stderr.on('data', (d) => {
    const errText = d.toString();
    if (errText.includes('Error') || errText.includes('FATAL')) {
      console.error(`  [server stderr] ${errText.trim()}`);
    }
  });

  return proc;
}

async function stopServer(proc) {
  if (!proc) return;
  try {
    proc.kill('SIGTERM');
  } catch {}
  
  await new Promise((r) => setTimeout(r, 800));
  try {
    proc.kill('SIGKILL');
  } catch {}
}

async function runSmokeTests() {
  console.log('================================================================');
  console.log(`🚀 DiamondERP V3.0 Smoke Test Suite [Mode: ${isStagedMode ? 'STAGED ARTIFACT' : 'SOURCE BUILD'}]`);
  console.log(`Endpoint: ${BASE_URL}`);
  console.log(`Data Dir: ${TEMP_DATA_DIR}`);
  console.log('================================================================\n');

  let apiEntry;
  let apiCwd;
  let webDistDir;

  if (isStagedMode) {
    apiEntry = path.join(STAGING_DIR, 'api', 'dist', 'index.js');
    apiCwd = path.join(STAGING_DIR, 'api');
    webDistDir = path.join(STAGING_DIR, 'web', 'dist');

    if (!fs.existsSync(apiEntry)) {
      throw new Error(`Staged API entry not found: ${apiEntry}. Run "npm run stage:windows" first.`);
    }
    if (!fs.existsSync(path.join(apiCwd, 'node_modules'))) {
      throw new Error(`Staged api/node_modules not found in ${apiCwd}. Run "npm run stage:windows" first.`);
    }
    if (!fs.existsSync(webDistDir)) {
      throw new Error(`Staged web dist not found in ${webDistDir}. Run "npm run stage:windows" first.`);
    }

    const bundledNodeExe = path.join(STAGING_DIR, 'runtime', 'node.exe');
    if (!fs.existsSync(bundledNodeExe)) {
      throw new Error(`Staged bundled runtime not found: ${bundledNodeExe}. Run "npm run stage:windows" first.`);
    }

    // ── BUNDLED RUNTIME & DEPENDENCY ISOLATION TEST ────────────────────────
    console.log('[1/5] Testing Bundled Runtime & Dependency Isolation:');
    const nodeVer = execSync(`"${bundledNodeExe}" -v`, { encoding: 'utf-8' }).trim();
    recordResult('Bundled Node.js Runtime (Executed directly from staged runtime/node.exe)', Boolean(nodeVer), `Version: ${nodeVer}, Path: ${bundledNodeExe}`);

    const probeScript = `
      const path = require('path');
      const stagedNm = path.resolve('node_modules');
      const deps = [
        'express',
        'bcryptjs',
        'cors',
        'helmet',
        'jsonwebtoken',
        'exceljs',
        '@prisma/client',
        '@diamond-erp/contracts',
        '@diamond-erp/shared-utils'
      ];
      for (const d of deps) {
        const resolved = require.resolve(d);
        if (!resolved.startsWith(stagedNm)) {
          console.error('LEAK: ' + d + ' resolved from: ' + resolved);
          process.exit(1);
        }
      }
      process.stdout.write('ISOLATED');
    `;

    try {
      const probeResult = execSync(`"${bundledNodeExe}" -e "${probeScript.replace(/\n/g, ' ')}"`, {
        cwd: apiCwd,
        env: { ...process.env, NODE_PATH: '' },
        encoding: 'utf-8',
      });
      const isIsolated = probeResult.trim() === 'ISOLATED';
      recordResult('Dependency Isolation (Resolved strictly from staged api/node_modules)', isIsolated, `Staged NodeModules: ${path.join(apiCwd, 'node_modules')}`);
    } catch (err) {
      recordResult('Dependency Isolation', false, `Dependency leaked to parent: ${err.message}`);
      throw new Error('Dependency isolation check failed: Staged artifact resolves packages from repository root.');
    }
  } else {
    apiEntry = path.join(ROOT_DIR, 'apps', 'api', 'dist', 'index.js');
    apiCwd = path.join(ROOT_DIR, 'apps', 'api');
    webDistDir = path.join(ROOT_DIR, 'apps', 'web', 'dist');

    if (!fs.existsSync(apiEntry)) {
      throw new Error('API is not built. Run "npm run build:api" first.');
    }
    if (!fs.existsSync(path.join(webDistDir, 'index.html'))) {
      throw new Error('Web is not built. Run "npm run build:web" first.');
    }
  }

  console.log(`\n[2/5] Spawning Production Server Process (CWD: ${apiCwd})...`);
  serverProcess = spawnServer(apiEntry, apiCwd);

  console.log('Waiting for backend and SQLite database to initialize...');
  const healthy = await waitForServer();
  if (!healthy) {
    throw new Error('Server failed to start and respond on /health within timeout.');
  }
  console.log('✔ Server is online and responding!\n');

  console.log('[3/5] Testing Health, Serving & Routing Endpoints:');

  // Check 1: Health Check
  const healthRes = await httpRequest('/health');
  const isHealthy = healthRes.statusCode === 200 && healthRes.json?.backend === 'OK' && healthRes.json?.database === 'Connected';
  recordResult('Health endpoint (/health)', isHealthy, `Status: ${healthRes.statusCode}, Backend: ${healthRes.json?.backend}, DB: ${healthRes.json?.database}`);

  // Check 2: React Root Serving
  const rootRes = await httpRequest('/');
  const isRootValid = rootRes.statusCode === 200 && rootRes.body.includes('<div id="root">');
  recordResult('React SPA root page (/)', isRootValid, `Status: ${rootRes.statusCode}, ContentType: ${rootRes.headers['content-type']}`);

  // Check 3: Client-Side Route Fallback across all SPA routes
  const spaRoutes = ['/dashboard', '/inventory', '/ledger', '/certificates', '/parties', '/repairs', '/reports', '/settings'];
  for (const route of spaRoutes) {
    const routeRes = await httpRequest(route);
    const isRouteValid = routeRes.statusCode === 200 && routeRes.body.includes('<div id="root">');
    recordResult(`React SPA route fallback (${route})`, isRouteValid, `Status: ${routeRes.statusCode}`);
  }

  // Check 4: Static Asset Serving
  const assetsDir = path.join(webDistDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    const assetFiles = fs.readdirSync(assetsDir);
    const sampleJs = assetFiles.find((f) => f.endsWith('.js'));
    const sampleCss = assetFiles.find((f) => f.endsWith('.css'));
    if (sampleJs) {
      const assetRes = await httpRequest(`/assets/${sampleJs}`);
      const isAssetValid = assetRes.statusCode === 200 && assetRes.headers['content-type']?.includes('javascript');
      recordResult(`Static bundle serving (/assets/${sampleJs})`, isAssetValid, `Status: ${assetRes.statusCode}`);
    }
    if (sampleCss) {
      const cssRes = await httpRequest(`/assets/${sampleCss}`);
      const isCssValid = cssRes.statusCode === 200 && cssRes.headers['content-type']?.includes('css');
      recordResult(`Static stylesheet serving (/assets/${sampleCss})`, isCssValid, `Status: ${cssRes.statusCode}`);
    }
  }

  // Check 5: Strict API 404 Guard
  const apiNotFoundRes = await httpRequest('/api/unknown-boundary-probe');
  const isApi404Isolated = apiNotFoundRes.statusCode === 404 && apiNotFoundRes.json && !apiNotFoundRes.body.includes('<!DOCTYPE html>');
  recordResult('API 404 strict boundary (/api/* never returns HTML)', isApi404Isolated, `Status: ${apiNotFoundRes.statusCode}, Type: ${apiNotFoundRes.headers['content-type']}`);

  console.log('\n[4/5] Testing Production Authentication, Domain APIs & File Workflows:');

  // Check 6: Login with seeded admin
  const loginRes = await httpRequest('/api/auth/login', {
    method: 'POST',
  }, {
    username: 'stavan',
    password: 'Stavan@123',
  });

  const token = loginRes.json?.data?.token;
  const isLoginValid = loginRes.statusCode === 200 && Boolean(token);
  recordResult('Production admin login (/api/auth/login)', isLoginValid, `Status: ${loginRes.statusCode}, Token generated: ${Boolean(token)}`);

  let createdUserId = null;
  const uniqueSmokeUsername = 'smoke_persist_' + Date.now().toString().slice(-5);
  const uniqueSmokePassword = 'SmokePassword@4321';

  if (token) {
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'X-Profile-Id': 'Stavan',
    };

    // Check 7: Authenticated Database Read
    const meRes = await httpRequest('/api/auth/me', { headers: authHeaders });
    const isMeValid = meRes.statusCode === 200 && meRes.json?.data?.username === 'stavan';
    recordResult('Database read via authenticated API (/api/auth/me)', isMeValid, `User: ${meRes.json?.data?.username}, Role: ${meRes.json?.data?.role}`);

    // Check 8: Authenticated Database Write
    const createUserRes = await httpRequest('/api/auth/users', {
      method: 'POST',
      headers: authHeaders,
    }, {
      username: uniqueSmokeUsername,
      password: uniqueSmokePassword,
      displayName: 'Persistence Test Operator',
      role: 'MANAGER',
    });
    createdUserId = createUserRes.json?.data?.id;
    const isWriteValid = createUserRes.statusCode === 201 && Boolean(createdUserId);
    recordResult('Database write via authenticated API (/api/auth/users)', isWriteValid, `Created ID: ${createdUserId}, Username: ${uniqueSmokeUsername}`);

    // Domain API Endpoints
    const stocksRes = await httpRequest('/api/stocks', { headers: authHeaders });
    recordResult('Domain API: Stocks list (/api/stocks)', stocksRes.statusCode === 200 && Array.isArray(stocksRes.json?.data));

    const dashboardRes = await httpRequest('/api/dashboard', { headers: authHeaders });
    recordResult('Domain API: Dashboard KPIs (/api/dashboard)', dashboardRes.statusCode === 200 && Boolean(dashboardRes.json?.data));

    const ledgerRes = await httpRequest('/api/ledger', { headers: authHeaders });
    recordResult('Domain API: Ledger entries (/api/ledger)', ledgerRes.statusCode === 200 && Array.isArray(ledgerRes.json?.data));

    const partiesRes = await httpRequest('/api/parties', { headers: authHeaders });
    recordResult('Domain API: Parties list (/api/parties)', partiesRes.statusCode === 200 && Array.isArray(partiesRes.json?.data));

    const repairsRes = await httpRequest('/api/repairs', { headers: authHeaders });
    recordResult('Domain API: Workshop repairs (/api/repairs)', repairsRes.statusCode === 200 && Array.isArray(repairsRes.json?.data));

    const reportsRes = await httpRequest('/api/reports', { headers: authHeaders });
    recordResult('Domain API: Reports catalog (/api/reports)', reportsRes.statusCode === 200 && Boolean(reportsRes.json?.data));

    const reportPreviewRes = await httpRequest('/api/reports/preview?reportType=INVENTORY_VALUATION', { headers: authHeaders });
    recordResult('Domain API: Report preview (/api/reports/preview)', reportPreviewRes.statusCode === 200 && reportPreviewRes.json?.success === true);

    const reportExcelRes = await httpRequest('/api/reports/export/excel?reportType=INVENTORY_VALUATION', { headers: authHeaders });
    const isExcelValid = reportExcelRes.statusCode === 200 && (reportExcelRes.headers['content-type']?.includes('spreadsheet') || reportExcelRes.headers['content-type']?.includes('octet-stream'));
    recordResult('Domain API: Excel report export stream (/api/reports/export/excel)', isExcelValid, `Content-Type: ${reportExcelRes.headers['content-type']}`);

    const profilesRes = await httpRequest('/api/settings/profiles', { headers: authHeaders });
    recordResult('Domain API: Settings profiles (/api/settings/profiles)', profilesRes.statusCode === 200 && Boolean(profilesRes.json?.data?.active));

    const activationRes = await httpRequest('/api/system/activation-status');
    recordResult('System API: Activation status (/api/system/activation-status)', activationRes.statusCode === 200 && typeof activationRes.json?.isActivated === 'boolean');

    // File Upload Workflow Check
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test_certificate.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 sample certificate document\r\n--${boundary}--\r\n`)
    ]);

    const uploadRes = await new Promise((resolve, reject) => {
      const url = new URL('/api/certificates/upload', BASE_URL);
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': multipartBody.length,
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch {}
          resolve({ statusCode: res.statusCode, json });
        });
      });
      req.on('error', reject);
      req.write(multipartBody);
      req.end();
    });
    const isUploadValid = uploadRes.statusCode === 200 && uploadRes.json?.success === true && Boolean(uploadRes.json?.data?.path);
    recordResult('File upload workflow (/api/certificates/upload)', isUploadValid, `Staged path: ${uploadRes.json?.data?.path}`);

    // Logout Check
    const logoutRes = await httpRequest('/api/auth/logout', { method: 'POST', headers: authHeaders });
    recordResult('Authentication: Logout (/api/auth/logout)', logoutRes.statusCode === 200 && logoutRes.json?.success === true);
  }

  // ── RESTART & PERSISTENCE TEST ─────────────────────────────────────────────
  console.log('\n[5/5] Testing Backend Restart & Data Persistence:');
  console.log('  Stopping server process...');
  await stopServer(serverProcess);
  serverProcess = null;

  console.log('  Restarting server process against same isolated database...');
  serverProcess = spawnServer(apiEntry, apiCwd);

  const restartedHealthy = await waitForServer();
  recordResult('Server restart cleanly boots and initializes', restartedHealthy);

  if (restartedHealthy && createdUserId) {
    // Check 9: Authenticate with the newly created user across server restart
    const persistedLoginRes = await httpRequest('/api/auth/login', {
      method: 'POST',
    }, {
      username: uniqueSmokeUsername,
      password: uniqueSmokePassword,
    });

    const persistedToken = persistedLoginRes.json?.data?.token;
    const isPersistValid = persistedLoginRes.statusCode === 200 && Boolean(persistedToken);
    recordResult('Database persistence verified (Created user authenticates after full server restart)', isPersistValid, `User: ${uniqueSmokeUsername}`);
  }

  // Verify file paths in isolated data directory
  const databasesDir = path.join(TEMP_DATA_DIR, 'databases');
  const configDir = path.join(TEMP_DATA_DIR, 'config');
  const hasStavanDb = fs.existsSync(path.join(databasesDir, 'Stavan.db'));
  const hasJwtSecret = fs.existsSync(path.join(configDir, '.jwt_secret'));
  recordResult('Database file isolated in temporary test directory', hasStavanDb, `File: ${databasesDir}/Stavan.db`);
  recordResult('Cryptographic JWT secret persisted to test data directory', hasJwtSecret, `File: ${configDir}/.jwt_secret`);
}

async function cleanup() {
  if (serverProcess) {
    console.log('\nShutting down production server process...');
    await stopServer(serverProcess);
    serverProcess = null;
  }

  // Clean temp data
  if (fs.existsSync(TEMP_DATA_DIR)) {
    try {
      fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
    } catch {}
  }
}

async function main() {
  try {
    await runSmokeTests();
    const allPassed = results.every((r) => r.passed);
    console.log('\n================================================================');
    console.log(`Smoke Test Summary: ${results.filter((r) => r.passed).length}/${results.length} checks PASSED`);
    console.log('================================================================');

    if (allPassed) {
      console.log('🎉 Production smoke tests successfully validated all packaging requirements!');
      process.exit(0);
    } else {
      console.error('❌ Some production smoke tests failed.');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n[FATAL] Smoke test execution failed:', err);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();
