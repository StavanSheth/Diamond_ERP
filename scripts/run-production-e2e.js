/**
 * DiamondERP V3.0 — Production E2E Automated Test Runner
 *
 * Spawns production Express server serving React static dist, runs Playwright
 * production lifecycle tests against http://127.0.0.1:3002, and cleanly tears down.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const isStaged = process.argv.includes('--staged');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const TEMP_DATA_DIR = path.join(ROOT_DIR, 'scratch', 'e2e_prod_data');
if (fs.existsSync(TEMP_DATA_DIR)) {
  fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEMP_DATA_DIR, { recursive: true });

function httpRequest(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timed out'));
    });
    req.end();
  });
}

async function waitForServer(maxWaitMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await httpRequest('/health');
      if (res.statusCode === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function prepareDatabase() {
  const databasesDir = path.join(TEMP_DATA_DIR, 'databases');
  fs.mkdirSync(databasesDir, { recursive: true });

  const isolatedDb = path.join(databasesDir, 'Stavan.db');
  const templateDb = isStaged
    ? path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP', 'api', 'prisma', 'template.db')
    : path.join(ROOT_DIR, 'apps', 'api', 'prisma', 'template.db');

  if (fs.existsSync(templateDb)) {
    fs.copyFileSync(templateDb, isolatedDb);
  }
  return isolatedDb;
}

async function main() {
  console.log('================================================================');
  console.log('🚀 Starting DiamondERP V3.0 Production E2E Test Suite');
  console.log(`Mode: ${isStaged ? 'Staged Artifact' : 'Source Dist'} | Port: ${PORT}`);
  console.log('================================================================\n');

  const isolatedDb = prepareDatabase();

  const apiEntry = isStaged
    ? path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP', 'api', 'dist', 'index.js')
    : path.join(ROOT_DIR, 'apps', 'api', 'dist', 'index.js');

  const nodeBin = isStaged
    ? path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP', 'runtime', 'node.exe')
    : 'node';

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DIAMOND_DATA_DIR: TEMP_DATA_DIR,
    DATABASE_URL: `file:${isolatedDb}`,
    DEFAULT_ADMIN_PASSWORD: 'Stavan@123',
    AUTO_SEED_DEFAULT_ADMIN: 'true',
    DIAMOND_ACTIVATION_KEY: 'XW2756WGH',
  };

  console.log('Starting Production Express Server on 127.0.0.1:%s...', PORT);
  const server = spawn(nodeBin, [apiEntry], {
    cwd: isStaged ? path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP', 'api') : path.join(ROOT_DIR, 'apps', 'api'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (d) => {
    if (process.env.VERBOSE) console.log(`[srv] ${d.toString().trim()}`);
  });

  server.stderr.on('data', (d) => {
    const s = d.toString().trim();
    if (s.includes('Error') || s.includes('FATAL')) console.error(`[srv-err] ${s}`);
  });

  const isReady = await waitForServer();
  if (!isReady) {
    console.error('❌ FATAL: Production Express server failed to become ready within timeout.');
    server.kill('SIGTERM');
    process.exit(1);
  }

  console.log('✔ Production Express server is healthy and responding on http://127.0.0.1:%s', PORT);
  console.log('Running Playwright Production E2E Suite...\n');

  let testExitCode = 0;
  try {
    execSync('npx playwright test --config=playwright.prod.config.ts', {
      cwd: path.join(ROOT_DIR, 'apps', 'web'),
      env: {
        ...process.env,
        PROD_URL: BASE_URL,
        PORT: String(PORT),
      },
      stdio: 'inherit',
    });
    console.log('\n✅ Playwright Production E2E Tests PASSED successfully!');
  } catch (err) {
    console.error('\n❌ Playwright Production E2E Tests FAILED.');
    testExitCode = 1;
  } finally {
    console.log('\nStopping Production Express Server...');
    server.kill('SIGKILL');
    try {
      execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
    } catch {}

    // Cleanup temp data
    try {
      fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
    } catch {}
  }

  process.exit(testExitCode);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
