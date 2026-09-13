/**
 * DiamondERP V3.0 — Staged Packaging Readiness Automated Validator
 *
 * Validates the actual Windows production artifact inside:
 *   build/windows/DiamondERP/
 *
 * Success Criteria:
 *  1. Staging directory exists and contains required Windows executables
 *  2. API production package manifest exists and declares valid entry point
 *  3. Backend dist is compiled and self-contained
 *  4. Production node_modules exists ONLY in api/node_modules/ (no root node_modules)
 *  5. Every runtime dependency in api/package.json is installed and verified
 *  6. Prisma SQLite native query engine and client are staged without tmp files
 *  7. SQLite schema template exists with valid SQLite format header
 *  8. Web production bundle is present with index.html and compiled assets
 *  9. Staging folder is free of development artifacts (.git, devDependencies, etc.)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');

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
console.log('🔍 Running Staged Packaging Readiness Validator for DiamondERP V3.0');
console.log(`Target: ${STAGING_DIR}`);
console.log('================================================================');

// ── 1. Staging Root & Windows Binaries ───────────────────────────────────────
console.log('\n[1] Windows Desktop Binaries & Runtime Staging:');

check('Staging directory (build/windows/DiamondERP) exists', () => {
  return fs.existsSync(STAGING_DIR);
});

check('DiamondERP.exe launcher exists with valid size', () => {
  const p = path.join(STAGING_DIR, 'DiamondERP.exe');
  return fs.existsSync(p) && fs.statSync(p).size > 1024;
});

check('Installer.exe exists with valid size', () => {
  const p = path.join(STAGING_DIR, 'Installer.exe');
  return fs.existsSync(p) && fs.statSync(p).size > 1024;
});

check('Microsoft.Web.WebView2 support DLLs exist', () => {
  const core = path.join(STAGING_DIR, 'Microsoft.Web.WebView2.Core.dll');
  const wpf = path.join(STAGING_DIR, 'Microsoft.Web.WebView2.Wpf.dll');
  const loader = path.join(STAGING_DIR, 'WebView2Loader.dll');
  return fs.existsSync(core) && fs.existsSync(wpf) && fs.existsSync(loader);
});

check('Application icon (app.ico) exists', () => {
  return fs.existsSync(path.join(STAGING_DIR, 'app.ico'));
});

check('Bundled Node.js runtime (runtime/node.exe) exists and is a valid binary (> 20MB)', () => {
  const p = path.join(STAGING_DIR, 'runtime', 'node.exe');
  return fs.existsSync(p) && fs.statSync(p).size > 20 * 1024 * 1024;
});

check('Bundled Node.js runtime (runtime/node.exe) is executable and reports supported LTS version (v22.x or v20.x)', () => {
  const p = path.join(STAGING_DIR, 'runtime', 'node.exe');
  if (!fs.existsSync(p)) return false;
  const ver = execSync(`"${p}" -v`, { encoding: 'utf-8' }).trim();
  return ver.startsWith('v22.') || ver.startsWith('v20.');
});

check('Installer.exe UAC manifest is configured for requireAdministrator', () => {
  const manifestPath = path.join(ROOT_DIR, 'installer', 'Installer.manifest');
  if (!fs.existsSync(manifestPath)) return false;
  const content = fs.readFileSync(manifestPath, 'utf-8');
  return content.includes('level="requireAdministrator"');
});

check('DiamondERP.exe UAC manifest is configured for asInvoker (standard user privileges)', () => {
  const manifestPath = path.join(ROOT_DIR, 'installer', 'Launcher.manifest');
  if (!fs.existsSync(manifestPath)) return false;
  const content = fs.readFileSync(manifestPath, 'utf-8');
  return content.includes('level="asInvoker"');
});

check('NO placeholder README.txt exists in runtime/', () => {
  const readme = path.join(STAGING_DIR, 'runtime', 'README.txt');
  return !fs.existsSync(readme);
});

// ── 2. Backend Manifest & Entry Point ───────────────────────────────────────
console.log('\n[2] Backend Production Manifest & Entry Point:');

let stagedPkg = null;
check('api/package.json exists and is valid JSON', () => {
  const pkgPath = path.join(STAGING_DIR, 'api', 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  stagedPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return Boolean(stagedPkg && stagedPkg.name && stagedPkg.version);
});

check('api/package.json specifies valid main entry point', () => {
  if (!stagedPkg || !stagedPkg.main) return false;
  const entryPath = path.join(STAGING_DIR, 'api', stagedPkg.main);
  return fs.existsSync(entryPath);
});

check('api/package.json does NOT contain devDependencies (pure production)', () => {
  return !stagedPkg || !stagedPkg.devDependencies;
});

check('api/dist/infrastructure/paths.js exists in staged artifact', () => {
  return fs.existsSync(path.join(STAGING_DIR, 'api', 'dist', 'infrastructure', 'paths.js'));
});

// ── 3. Production node_modules Strategy & Dependency Tree ────────────────────
console.log('\n[3] Production node_modules Strategy & Isolation:');

check('api/node_modules/ exists in staging directory', () => {
  return fs.existsSync(path.join(STAGING_DIR, 'api', 'node_modules'));
});

check('NO root node_modules exists in build/windows/DiamondERP/node_modules', () => {
  return !fs.existsSync(path.join(STAGING_DIR, 'node_modules'));
});

check('NO web node_modules exists in build/windows/DiamondERP/web/node_modules', () => {
  return !fs.existsSync(path.join(STAGING_DIR, 'web', 'node_modules'));
});

check('ALL declared runtime dependencies exist in api/node_modules/', () => {
  if (!stagedPkg || !stagedPkg.dependencies) return false;
  const missingDeps = [];
  for (const depName of Object.keys(stagedPkg.dependencies)) {
    const depPkg = path.join(STAGING_DIR, 'api', 'node_modules', ...depName.split('/'), 'package.json');
    if (!fs.existsSync(depPkg)) {
      missingDeps.push(depName);
    }
  }
  if (missingDeps.length > 0) {
    console.error(`    Missing runtime dependencies: ${missingDeps.join(', ')}`);
    return false;
  }
  return true;
});

check('Local monorepo packages (@diamond-erp/contracts, shared-utils) staged as modules', () => {
  const contractsPkg = path.join(STAGING_DIR, 'api', 'node_modules', '@diamond-erp', 'contracts', 'package.json');
  const utilsPkg = path.join(STAGING_DIR, 'api', 'node_modules', '@diamond-erp', 'shared-utils', 'package.json');
  return fs.existsSync(contractsPkg) && fs.existsSync(utilsPkg);
});

check('Core backend frameworks (express, bcryptjs, cors, helmet, jsonwebtoken, exceljs) exist', () => {
  const corePkgs = ['express', 'bcryptjs', 'cors', 'helmet', 'jsonwebtoken', 'exceljs', 'zod', 'uuid'];
  return corePkgs.every((pkg) => {
    return fs.existsSync(path.join(STAGING_DIR, 'api', 'node_modules', pkg, 'package.json'));
  });
});

check('Transitive dependencies resolve inside api/node_modules (e.g. accepts, bytes, statuses)', () => {
  const transitives = ['accepts', 'bytes', 'statuses'];
  return transitives.every((pkg) => {
    return fs.existsSync(path.join(STAGING_DIR, 'api', 'node_modules', pkg, 'package.json'));
  });
});

// ── 4. Prisma Runtime & Pre-migrated SQLite Template ────────────────────────
console.log('\n[4] Prisma Engine & SQLite Database Staging:');

check('api/prisma/schema.prisma exists', () => {
  return fs.existsSync(path.join(STAGING_DIR, 'api', 'prisma', 'schema.prisma'));
});

check('api/prisma/template.db exists with valid SQLite 3 header', () => {
  const templateDb = path.join(STAGING_DIR, 'api', 'prisma', 'template.db');
  if (!fs.existsSync(templateDb)) return false;
  const header = Buffer.alloc(16);
  const fd = fs.openSync(templateDb, 'r');
  fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);
  return header.toString('utf-8').startsWith('SQLite format 3');
});

check('@prisma/client package is staged in api/node_modules/@prisma/client', () => {
  return fs.existsSync(path.join(STAGING_DIR, 'api', 'node_modules', '@prisma', 'client', 'package.json'));
});

check('.prisma/client query engine binary (query_engine-windows.dll.node) exists (>10MB)', () => {
  const enginePath = path.join(STAGING_DIR, 'api', 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node');
  if (!fs.existsSync(enginePath)) return false;
  const sizeBytes = fs.statSync(enginePath).size;
  return sizeBytes > 10 * 1024 * 1024;
});

check('.prisma/client does not contain stale *.tmp* files', () => {
  const clientDir = path.join(STAGING_DIR, 'api', 'node_modules', '.prisma', 'client');
  if (!fs.existsSync(clientDir)) return false;
  const files = fs.readdirSync(clientDir);
  return !files.some((f) => f.includes('.tmp'));
});

// ── 5. Frontend Bundle & Static Assets ──────────────────────────────────────
console.log('\n[5] Frontend Production Bundle & Static Assets:');

check('web/dist/index.html exists and is valid HTML', () => {
  const indexPath = path.join(STAGING_DIR, 'web', 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, 'utf-8');
  return content.includes('<div id="root">') && content.includes('<script');
});

check('web/dist/assets contains bundled JS and CSS', () => {
  const assetsDir = path.join(STAGING_DIR, 'web', 'dist', 'assets');
  if (!fs.existsSync(assetsDir)) return false;
  const files = fs.readdirSync(assetsDir);
  const hasJs = files.some((f) => f.endsWith('.js'));
  const hasCss = files.some((f) => f.endsWith('.css'));
  return hasJs && hasCss;
});

check('Production web bundle does not reference Vite dev port :5175', () => {
  const indexPath = path.join(STAGING_DIR, 'web', 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, 'utf-8');
  return !content.includes(':5175');
});

check('web/dist/index.html contains no developer machine filesystem paths', () => {
  const indexPath = path.join(STAGING_DIR, 'web', 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, 'utf-8');
  return !content.includes('C:\\') && !content.includes('/Users/') && !content.includes('TestV3.0');
});

check('Production JavaScript bundle contains no development server references (:5175)', () => {
  const assetsDir = path.join(STAGING_DIR, 'web', 'dist', 'assets');
  if (!fs.existsSync(assetsDir)) return false;
  const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
  return jsFiles.every(f => {
    const jsContent = fs.readFileSync(path.join(assetsDir, f), 'utf-8');
    return !jsContent.includes(':5175');
  });
});

check('Static asset references in index.html use root-relative paths (/assets/)', () => {
  const indexPath = path.join(STAGING_DIR, 'web', 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, 'utf-8');
  return content.includes('src="/assets/') && content.includes('href="/assets/');
});

check('Production index.html has NO external font CDN references (100% offline self-contained)', () => {
  const indexPath = path.join(STAGING_DIR, 'web', 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) return false;
  const content = fs.readFileSync(indexPath, 'utf-8');
  return !content.includes('fonts.googleapis.com') && !content.includes('fonts.gstatic.com');
});

check('Self-contained local offline fonts are staged (MaterialSymbolsOutlined.ttf & Inter.woff2)', () => {
  const ttf = path.join(STAGING_DIR, 'web', 'dist', 'fonts', 'MaterialSymbolsOutlined.ttf');
  const woff2 = path.join(STAGING_DIR, 'web', 'dist', 'fonts', 'Inter.woff2');
  return fs.existsSync(ttf) && fs.statSync(ttf).size > 100000 &&
         fs.existsSync(woff2) && fs.statSync(woff2).size > 1000;
});

// ── 6. Cleanliness & Absence of Development Artifacts ───────────────────────
console.log('\n[6] Staged Artifact Cleanliness:');

check('No .git or source control metadata inside staging directory', () => {
  return !fs.existsSync(path.join(STAGING_DIR, '.git'));
});

check('No TypeScript source files (.ts) in api/dist', () => {
  const distDir = path.join(STAGING_DIR, 'api', 'dist');
  if (!fs.existsSync(distDir)) return false;
  function hasTs(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && hasTs(path.join(dir, e.name))) return true;
      if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) return true;
    }
    return false;
  }
  return !hasTs(distDir);
});

// ── Results Summary ─────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`Validation Results: ${passedChecks}/${totalChecks} checks PASSED (${failedChecks} failed)`);
console.log('================================================================');

if (failedChecks > 0) {
  console.error(`\n❌ Staged packaging validation failed with ${failedChecks} issue(s).`);
  process.exit(1);
} else {
  console.log('\n✅ All staged packaging readiness checks PASSED!');
  process.exit(0);
}
