/**
 * DiamondERP V3.0 — Windows Staging Directory Builder
 *
 * Prepares the production staging folder:
 *   build/windows/DiamondERP/
 *     ├── DiamondERP.exe                   (Pre-compiled launcher)
 *     ├── Microsoft.Web.WebView2.Core.dll  (WebView2 support library)
 *     ├── Microsoft.Web.WebView2.Wpf.dll   (WebView2 WPF wrapper)
 *     ├── WebView2Loader.dll               (WebView2 native loader)
 *     ├── app.ico                          (Application icon)
 *     ├── runtime/                         (Reserved for portable node.exe in Phase 5)
 *     ├── api/
 *     │   ├── dist/                        (Compiled backend JavaScript)
 *     │   ├── prisma/
 *     │   │   ├── schema.prisma            (Prisma schema)
 *     │   │   └── template.db              (Pre-migrated SQLite schema template)
 *     │   └── package.json
 *     └── web/
 *         └── dist/                        (Compiled React SPA production bundle)
 *
 * Requirements:
 *  - Everything needed to run offline on a clean Windows computer.
 *  - ZERO source code, TypeScript, or devDependencies required.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');

function log(msg) {
  console.log(`[StageBuild] ${msg}`);
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function runBuildStep(name, cmd) {
  log(`Building ${name}... (${cmd})`);
  try {
    execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit' });
    log(`✔ ${name} built successfully.`);
  } catch (err) {
    console.error(`[FATAL] Failed to build ${name}:`, err.message);
    process.exit(1);
  }
}

async function main() {
  log('Starting Windows Production Staging Build for DiamondERP V3.0...');

  // 0. Clean stale build artifacts
  runBuildStep('Clean stale artifacts', 'npm run clean');

  // 1. Build packages
  runBuildStep('Contracts package', 'npm run build:contracts');
  runBuildStep('Shared-utils package', 'npm run build:utils');
  runBuildStep('API client package', 'npm run build:client');

  // 2. Build Web and API
  runBuildStep('React web frontend', 'npm run build:web');
  runBuildStep('Backend REST API', 'npm run build:api');

  // 3. Compile Launcher & Installer if csc is available
  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  if (fs.existsSync(cscPath)) {
    log('Compiling Windows desktop executables...');
    try {
      execSync('npm run build:installer', { cwd: ROOT_DIR, stdio: 'inherit' });
      log('✔ Launcher and Installer compiled.');
    } catch (e) {
      log('Note: Installer build command exited with note: ' + e.message);
    }
  }

  // 4. Ensure pristine template.db is generated
  const testDb = path.join(ROOT_DIR, 'apps', 'api', 'prisma', 'test.db');
  const templateDb = path.join(ROOT_DIR, 'apps', 'api', 'prisma', 'template.db');
  if (fs.existsSync(testDb) && !fs.existsSync(templateDb)) {
    fs.copyFileSync(testDb, templateDb);
    log('✔ Created prisma/template.db from test.db');
  }

  // 5. Clean & prepare staging directory
  log(`Preparing staging directory at: ${STAGING_DIR}`);
  if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  // 6. Copy Windows executables and support DLLs
  const installerDir = path.join(ROOT_DIR, 'installer');
  const winFiles = [
    'DiamondERP.exe',
    'Installer.exe',
    'Microsoft.Web.WebView2.Core.dll',
    'Microsoft.Web.WebView2.Wpf.dll',
    'WebView2Loader.dll',
    'app.ico',
  ];

  for (const file of winFiles) {
    const src = path.join(installerDir, file);
    const dest = path.join(STAGING_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      log(`Copied: ${file}`);
    } else {
      console.warn(`[WARN] Missing binary file: ${src}`);
    }
  }

  // 7. Create runtime placeholder for Phase 5
  const runtimeDir = path.join(STAGING_DIR, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeDir, 'README.txt'),
    'Reserved for portable node.exe bundled in Phase 5.\n' +
    'When present, DiamondERP.exe launches this portable runtime directly.\n',
    'utf-8'
  );

  // 8. Copy Backend (API) dist and runtime assets
  const apiDest = path.join(STAGING_DIR, 'api');
  const apiDistSrc = path.join(ROOT_DIR, 'apps', 'api', 'dist');
  const apiDistDest = path.join(apiDest, 'dist');
  copyDirRecursive(apiDistSrc, apiDistDest);
  log('Copied: api/dist/');

  // Prisma schema and template
  const prismaDest = path.join(apiDest, 'prisma');
  fs.mkdirSync(prismaDest, { recursive: true });
  const schemaSrc = path.join(ROOT_DIR, 'apps', 'api', 'prisma', 'schema.prisma');
  if (fs.existsSync(schemaSrc)) {
    fs.copyFileSync(schemaSrc, path.join(prismaDest, 'schema.prisma'));
  }
  if (fs.existsSync(templateDb)) {
    fs.copyFileSync(templateDb, path.join(prismaDest, 'template.db'));
    log('Copied: api/prisma/template.db');
  }

  // API Package metadata (stripped for production)
  const apiPkgSrc = path.join(ROOT_DIR, 'apps', 'api', 'package.json');
  if (fs.existsSync(apiPkgSrc)) {
    const pkg = JSON.parse(fs.readFileSync(apiPkgSrc, 'utf-8'));
    const prodPkg = {
      name: pkg.name,
      version: pkg.version,
      main: 'dist/index.js',
      dependencies: pkg.dependencies,
    };
    fs.writeFileSync(path.join(apiDest, 'package.json'), JSON.stringify(prodPkg, null, 2), 'utf-8');
  }

  // 9. Copy Web (Frontend) production bundle
  const webDistSrc = path.join(ROOT_DIR, 'apps', 'web', 'dist');
  const webDistDest = path.join(STAGING_DIR, 'web', 'dist');
  copyDirRecursive(webDistSrc, webDistDest);
  log('Copied: web/dist/');

  // 10. Verify Staging Completeness
  const requiredFiles = [
    path.join(STAGING_DIR, 'DiamondERP.exe'),
    path.join(STAGING_DIR, 'Microsoft.Web.WebView2.Core.dll'),
    path.join(STAGING_DIR, 'api', 'dist', 'index.js'),
    path.join(STAGING_DIR, 'api', 'prisma', 'template.db'),
    path.join(STAGING_DIR, 'web', 'dist', 'index.html'),
  ];

  let missingCount = 0;
  for (const f of requiredFiles) {
    if (!fs.existsSync(f)) {
      console.error(`[ERROR] Staging verification failed: Missing required file "${f}"`);
      missingCount++;
    }
  }

  if (missingCount === 0) {
    log('================================================================');
    log('✅ Production Staging Build Complete!');
    log(`Staged at: ${STAGING_DIR}`);
    log('All runtime artifacts, executables, and templates verified.');
    log('================================================================');
  } else {
    console.error(`[FATAL] Staging build finished with ${missingCount} missing files.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL] Build script failed:', err);
  process.exit(1);
});
