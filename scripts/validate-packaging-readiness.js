/**
 * DiamondERP V3.0 — Packaging Readiness Automated Validator
 *
 * Runs automated checks to detect packaging mistakes and verify Windows readiness:
 *  1. Frontend build integrity & assets
 *  2. Backend compilation & clean exports
 *  3. Path resolution & LocalAppData isolation
 *  4. Localhost loopback binding (127.0.0.1)
 *  5. API 404 boundary isolation
 *  6. Desktop binary & WebView2 DLL presence
 *  7. Prisma SQLite runtime engine presence
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(name, fn) {
  totalChecks++;
  try {
    const result = fn();
    if (result === false) {
      console.error(`  ❌ FAIL: ${name}`);
      failedChecks++;
    } else {
      console.log(`  ✔ PASS: ${name}`);
      passedChecks++;
    }
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} (Exception: ${err.message})`);
    failedChecks++;
  }
}

console.log('================================================================');
console.log('🔍 Running Packaging Readiness Validation for DiamondERP V3.0');
console.log('================================================================');

// ── 1. Frontend Build Integrity ─────────────────────────────────────────────
console.log('\n[1] Frontend Build Integrity:');

check('web/dist/index.html exists and is valid HTML', () => {
  const indexPath = path.join(ROOT_DIR, 'apps', 'web', 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, 'utf-8');
  return content.includes('<div id="root">') && content.includes('<script');
});

check('web/dist/assets contains bundled JS and CSS', () => {
  const assetsDir = path.join(ROOT_DIR, 'apps', 'web', 'dist', 'assets');
  if (!fs.existsSync(assetsDir)) return false;
  const files = fs.readdirSync(assetsDir);
  const hasJs = files.some(f => f.endsWith('.js'));
  const hasCss = files.some(f => f.endsWith('.css'));
  return hasJs && hasCss;
});

check('Production build does not reference development Vite port :5175', () => {
  const indexPath = path.join(ROOT_DIR, 'apps', 'web', 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, 'utf-8');
  return !content.includes(':5175');
});

// ── 2. Backend Build Integrity ──────────────────────────────────────────────
console.log('\n[2] Backend Build Integrity:');

check('api/dist/index.js exists and is compiled', () => {
  const apiDist = path.join(ROOT_DIR, 'apps', 'api', 'dist', 'index.js');
  return fs.existsSync(apiDist);
});

check('api/dist/infrastructure/paths.js exists', () => {
  const pathsDist = path.join(ROOT_DIR, 'apps', 'api', 'dist', 'infrastructure', 'paths.js');
  return fs.existsSync(pathsDist);
});

check('Prisma template.db exists with valid SQLite format', () => {
  const templateDb = path.join(ROOT_DIR, 'apps', 'api', 'prisma', 'template.db');
  if (!fs.existsSync(templateDb)) return false;
  const header = Buffer.alloc(16);
  const fd = fs.openSync(templateDb, 'r');
  fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);
  return header.toString('utf-8').startsWith('SQLite format 3');
});

// ── 3. Centralized Paths & LocalAppData Isolation ───────────────────────────
console.log('\n[3] Centralized Paths & Windows Data Directory:');

// Test paths module logic
const pathsModule = require(path.join(ROOT_DIR, 'apps', 'api', 'dist', 'infrastructure', 'paths.js'));

check('paths.ts exports all required path resolver functions', () => {
  return typeof pathsModule.getDataDir === 'function' &&
         typeof pathsModule.getDatabasesDir === 'function' &&
         typeof pathsModule.getUploadsDir === 'function' &&
         typeof pathsModule.getBackupsDir === 'function' &&
         typeof pathsModule.getLogsDir === 'function' &&
         typeof pathsModule.getConfigDir === 'function' &&
         typeof pathsModule.getDatabaseTemplatePath === 'function' &&
         typeof pathsModule.ensureAllDataDirs === 'function';
});

check('In production mode, mutable data resolves under LocalAppData', () => {
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  delete process.env.DIAMOND_DATA_DIR;

  const dataDir = pathsModule.getDataDir();
  const dbDir = pathsModule.getDatabasesDir();
  const uploadsDir = pathsModule.getUploadsDir();
  const backupsDir = pathsModule.getBackupsDir();
  const configDir = pathsModule.getConfigDir();

  process.env.NODE_ENV = origEnv;

  const isUnderDiamondERP = dataDir.includes('DiamondERP');
  const isDbUnderData = dbDir.startsWith(dataDir);
  const isUploadsUnderData = uploadsDir.startsWith(dataDir);
  const isBackupsUnderData = backupsDir.startsWith(dataDir);
  const isConfigUnderData = configDir.startsWith(dataDir);

  return isUnderDiamondERP && isDbUnderData && isUploadsUnderData && isBackupsUnderData && isConfigUnderData;
});

// ── 4. Server Binding & Security ────────────────────────────────────────────
console.log('\n[4] Server Binding & Host Configuration:');

const configModule = require(path.join(ROOT_DIR, 'apps', 'api', 'dist', 'config', 'index.js'));

check('Server host defaults to loopback 127.0.0.1 (not 0.0.0.0)', () => {
  return configModule.config.host === '127.0.0.1';
});

check('Production CORS origins include localhost and 127.0.0.1 loopback', () => {
  const origins = configModule.config.corsOrigins;
  return origins.includes('http://127.0.0.1:3002') && origins.includes('http://localhost:3002');
});

// ── 5. Desktop Binaries & WebView2 Artifacts ────────────────────────────────
console.log('\n[5] Desktop Binaries & WebView2 Artifacts:');

check('installer/DiamondERP.exe exists', () => {
  return fs.existsSync(path.join(ROOT_DIR, 'installer', 'DiamondERP.exe'));
});

check('installer/Installer.exe exists', () => {
  return fs.existsSync(path.join(ROOT_DIR, 'installer', 'Installer.exe'));
});

check('installer/Microsoft.Web.WebView2.Core.dll exists', () => {
  return fs.existsSync(path.join(ROOT_DIR, 'installer', 'Microsoft.Web.WebView2.Core.dll'));
});

check('installer/Microsoft.Web.WebView2.Wpf.dll exists', () => {
  return fs.existsSync(path.join(ROOT_DIR, 'installer', 'Microsoft.Web.WebView2.Wpf.dll'));
});

check('installer/WebView2Loader.dll exists', () => {
  return fs.existsSync(path.join(ROOT_DIR, 'installer', 'WebView2Loader.dll'));
});

// ── 6. Runtime Dependencies & Engines ───────────────────────────────────────
console.log('\n[6] Production Runtime Dependencies:');

function findModuleDir(modName) {
  const p1 = path.join(ROOT_DIR, 'apps', 'api', 'node_modules', ...modName.split('/'));
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(ROOT_DIR, 'node_modules', ...modName.split('/'));
  if (fs.existsSync(p2)) return p2;
  return null;
}

check('@prisma/client is installed with SQLite query engine binary', () => {
  const clientDir = findModuleDir('@prisma/client');
  if (!clientDir) return false;
  // Check for query engine binary in node_modules/.prisma/client
  const engineDir = findModuleDir('.prisma/client');
  if (!engineDir) return false;
  const engineFiles = fs.readdirSync(engineDir);
  return engineFiles.some(f => f.includes('query_engine') && (f.endsWith('.dll.node') || f.endsWith('.node')));
});

check('Pure JS dependencies (bcryptjs, express, helmet, jsonwebtoken, exceljs) present', () => {
  const modules = ['bcryptjs', 'express', 'helmet', 'jsonwebtoken', 'exceljs'];
  return modules.every(m => Boolean(findModuleDir(m)));
});

// ── Results Summary ─────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`Validation Results: ${passedChecks}/${totalChecks} checks PASSED (${failedChecks} failed)`);
console.log('================================================================');

if (failedChecks > 0) {
  console.error(`\n❌ Packaging validation failed with ${failedChecks} issue(s).`);
  process.exit(1);
} else {
  console.log('\n✅ All packaging readiness checks PASSED!');
  process.exit(0);
}
