/**
 * DiamondERP V3.0 — Production Smoke Test
 *
 * Verifies production backend behavior:
 *  1. Backend boots in NODE_ENV=production without Vite dev server
 *  2. /health reports healthy backend and connected SQLite database
 *  3. React root page (/) is served from web/dist
 *  4. Client-side SPA routing (/dashboard) falls back to React index.html
 *  5. Static assets (/assets/...) are served with correct headers
 *  6. /api/* 404 does NOT fall through to React HTML (strict API boundary)
 *  7. Authentication flow works in production mode
 *  8. Database read/write works against the SQLite profile database
 *  9. Server binds to 127.0.0.1 loopback
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = process.env.SMOKE_PORT ? parseInt(process.env.SMOKE_PORT, 10) : 3099;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Create isolated temporary data directory for clean smoke testing
const TEMP_DATA_DIR = path.join(ROOT_DIR, 'scratch', 'smoke_test_data');
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
      headers: options.headers || {},
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

async function waitForServer(maxWaitMs = 15000) {
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

async function runSmokeTests() {
  console.log('================================================================');
  console.log('🚀 DiamondERP V3.0 Production Smoke Test Suite');
  console.log('================================================================\n');

  // Verify build prerequisites
  const apiEntry = path.join(ROOT_DIR, 'apps', 'api', 'dist', 'index.js');
  const webDist = path.join(ROOT_DIR, 'apps', 'web', 'dist', 'index.html');

  if (!fs.existsSync(apiEntry)) {
    throw new Error('API is not built. Run "npm run build --workspace=@diamond-erp/api" first.');
  }
  if (!fs.existsSync(webDist)) {
    throw new Error('Web is not built. Run "npm run build --workspace=@diamond-erp/web" first.');
  }

  console.log(`[1/4] Spawning Production Server Process on 127.0.0.1:${PORT}...`);
  
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DIAMOND_DATA_DIR: TEMP_DATA_DIR,
    DEFAULT_ADMIN_PASSWORD: 'Stavan@123',
    AUTO_SEED_DEFAULT_ADMIN: 'true',
  };

  serverProcess = spawn('node', [apiEntry], {
    cwd: path.join(ROOT_DIR, 'apps', 'api'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) => {
    // console.log(`[server stdout] ${d}`);
  });
  serverProcess.stderr.on('data', (d) => {
    console.error(`[server stderr] ${d}`);
  });

  console.log('Waiting for backend and SQLite database to initialize...');
  const healthy = await waitForServer();
  if (!healthy) {
    throw new Error('Server failed to start and respond on /health within timeout.');
  }
  console.log('✔ Server is online and responding!\n');

  console.log('[2/4] Testing Health & Routing Endpoints:');

  // Check 1: Health Check
  const healthRes = await httpRequest('/health');
  const isHealthy = healthRes.statusCode === 200 && healthRes.json?.backend === 'OK' && healthRes.json?.database === 'Connected';
  recordResult('Health endpoint (/health)', isHealthy, `Status: ${healthRes.statusCode}, Backend: ${healthRes.json?.backend}, DB: ${healthRes.json?.database}`);

  // Check 2: React Root Serving
  const rootRes = await httpRequest('/');
  const isRootValid = rootRes.statusCode === 200 && rootRes.body.includes('<div id="root">');
  recordResult('React SPA root page (/)', isRootValid, `Status: ${rootRes.statusCode}, ContentType: ${rootRes.headers['content-type']}`);

  // Check 3: Client-Side Route Fallback
  const spaRes = await httpRequest('/dashboard');
  const isSpaValid = spaRes.statusCode === 200 && spaRes.body.includes('<div id="root">');
  recordResult('React SPA fallback (/dashboard)', isSpaValid, `Status: ${spaRes.statusCode}`);

  // Check 4: Static Asset Serving
  const assetsDir = path.join(ROOT_DIR, 'apps', 'web', 'dist', 'assets');
  const assetFiles = fs.readdirSync(assetsDir);
  const sampleJs = assetFiles.find((f) => f.endsWith('.js'));
  if (sampleJs) {
    const assetRes = await httpRequest(`/assets/${sampleJs}`);
    const isAssetValid = assetRes.statusCode === 200 && assetRes.headers['content-type']?.includes('javascript');
    recordResult(`Static bundle serving (/assets/${sampleJs})`, isAssetValid, `Status: ${assetRes.statusCode}`);
  }

  // Check 5: Strict API 404 Guard
  const apiNotFoundRes = await httpRequest('/api/unknown-route-test');
  const isApi404Isolated = apiNotFoundRes.statusCode === 404 && apiNotFoundRes.json && !apiNotFoundRes.body.includes('<!DOCTYPE html>');
  recordResult('API 404 strict boundary (/api/* never returns HTML)', isApi404Isolated, `Status: ${apiNotFoundRes.statusCode}, Type: ${apiNotFoundRes.headers['content-type']}`);

  console.log('\n[3/4] Testing Production Authentication & Database Operations:');

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

  if (token) {
    const authHeaders = { Authorization: `Bearer ${token}` };

    // Check 7: Authenticated Database Read
    const meRes = await httpRequest('/api/auth/me', { headers: authHeaders });
    const isMeValid = meRes.statusCode === 200 && meRes.json?.data?.username === 'stavan';
    recordResult('Database read via authenticated API (/api/auth/me)', isMeValid, `User: ${meRes.json?.data?.username}, Role: ${meRes.json?.data?.role}`);

    // Check 8: Authenticated Database Write
    const createUserRes = await httpRequest('/api/auth/users', {
      method: 'POST',
      headers: authHeaders,
    }, {
      username: 'smoke_user_' + Date.now().toString().slice(-4),
      password: 'UserSecret@1234',
      displayName: 'Smoke Test Operator',
      role: 'MANAGER',
    });
    const isWriteValid = createUserRes.statusCode === 201 && Boolean(createUserRes.json?.data?.id);
    recordResult('Database write via authenticated API (/api/auth/users)', isWriteValid, `Created ID: ${createUserRes.json?.data?.id}`);
  }

  console.log('\n[4/4] Testing Windows Data Isolation & Template Initialization:');

  // Check 9: Data Directory populated
  const databasesDir = path.join(TEMP_DATA_DIR, 'databases');
  const configDir = path.join(TEMP_DATA_DIR, 'config');
  const hasStavanDb = fs.existsSync(path.join(databasesDir, 'Stavan.db'));
  const hasJwtSecret = fs.existsSync(path.join(configDir, '.jwt_secret'));
  recordResult('Database initialized from template in data dir', hasStavanDb, `Path: ${databasesDir}/Stavan.db`);
  recordResult('Cryptographic JWT secret persisted to data config', hasJwtSecret, `Path: ${configDir}/.jwt_secret`);
}

async function cleanup() {
  if (serverProcess) {
    console.log('\nShutting down production server process...');
    serverProcess.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1000));
    try {
      serverProcess.kill('SIGKILL');
    } catch {}
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
