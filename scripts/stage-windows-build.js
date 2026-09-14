/**
 * DiamondERP V3.0 — Windows Staging Directory Builder
 *
 * Prepares the production staging folder:
 *   build/windows/DiamondERP/
 *     ├── DiamondERP.exe                   (Pre-compiled launcher)
 *     ├── Installer.exe                    (Desktop installer)
 *     ├── Microsoft.Web.WebView2.Core.dll  (WebView2 support library)
 *     ├── Microsoft.Web.WebView2.Wpf.dll   (WebView2 WPF wrapper)
 *     ├── WebView2Loader.dll               (WebView2 native loader)
 *     ├── app.ico                          (Application icon)
 *     ├── runtime/                         (Reserved for portable node.exe in Phase 5)
 *     ├── api/
 *     │   ├── dist/                        (Compiled backend JavaScript)
 *     │   ├── node_modules/                (Self-contained production runtime dependencies)
 *     │   ├── prisma/
 *     │   │   ├── schema.prisma            (Prisma schema)
 *     │   │   └── template.db              (Pre-migrated SQLite schema template)
 *     │   └── package.json                 (Production runtime package manifest)
 *     └── web/
 *         └── dist/                        (Compiled React SPA production bundle)
 *
 * Requirements:
 *  - Everything needed to run offline on a clean Windows computer.
 *  - ZERO source code, TypeScript, or devDependencies required.
 *  - Backend runs independently without relying on repository root node_modules.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');

const PINNED_NODE_VERSION = 'v22.20.0';
const PINNED_NODE_ARCH = 'x64';
const PINNED_NODE_SHA256 = 'fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d';

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function log(msg) {
  console.log(`[StageBuild] ${msg}`);
}

function copyDirRecursive(src, dest, filterFn = null) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (filterFn && !filterFn(entry.name, entry.isDirectory())) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, filterFn);
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
  const stavanDb = path.join(ROOT_DIR, 'apps', 'api', 'Stavan.db');
  const templateDb = path.join(ROOT_DIR, 'apps', 'api', 'prisma', 'template.db');
  const syncScript = path.join(ROOT_DIR, 'scripts', 'sync-template-db.js');
  if (fs.existsSync(stavanDb) && fs.existsSync(syncScript)) {
    try {
      execSync(`node "${syncScript}"`, { cwd: ROOT_DIR, stdio: 'pipe' });
      log('✔ Checkpointed and synchronized template.db from pristine Stavan.db');
    } catch (e) {
      log('Note: sync-template-db warning: ' + e.message);
    }
  } else if (!fs.existsSync(templateDb)) {
    const testDb = path.join(ROOT_DIR, 'apps', 'api', 'prisma', 'test.db');
    if (fs.existsSync(testDb)) {
      fs.copyFileSync(testDb, templateDb);
      log('✔ Created prisma/template.db from test.db');
    }
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

  // 7. Stage Bundled Node.js Runtime for Standalone Execution
  log('Staging bundled Node.js runtime for standalone desktop execution...');
  const runtimeDir = path.join(STAGING_DIR, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const targetNodeExe = path.join(runtimeDir, 'node.exe');
  const cacheDir = path.join(ROOT_DIR, 'build', 'cache');
  const cachedNodeExe = path.join(cacheDir, 'node.exe');

  // Source resolution priority:
  // 1. Explicit environment variable NODE_RUNTIME_PATH
  // 2. Pre-cached binary in build/cache/node.exe
  // 3. Current execution binary (process.execPath) on Windows x64
  let sourceNodeExe = null;
  if (process.env.NODE_RUNTIME_PATH && fs.existsSync(process.env.NODE_RUNTIME_PATH)) {
    sourceNodeExe = process.env.NODE_RUNTIME_PATH;
    log(`Using custom Node runtime from NODE_RUNTIME_PATH: ${sourceNodeExe}`);
  } else if (fs.existsSync(cachedNodeExe)) {
    sourceNodeExe = cachedNodeExe;
    log(`Using cached Node runtime: ${sourceNodeExe}`);
  } else if (process.platform === 'win32' && fs.existsSync(process.execPath)) {
    sourceNodeExe = process.execPath;
    log(`Staging system Node runtime: ${sourceNodeExe}`);
  }

  if (!sourceNodeExe || !fs.existsSync(sourceNodeExe)) {
    throw new Error('No valid Windows node.exe runtime could be found to bundle into staging directory.');
  }

  const sourceSha = computeSha256(sourceNodeExe);
  const isReleaseMode = process.env.RELEASE_MODE === 'true' || process.env.NODE_ENV === 'production';
  log(`Candidate Node runtime SHA256: ${sourceSha}`);

  if (sourceSha === PINNED_NODE_SHA256) {
    log(`✔ Candidate Node runtime strictly matches pinned release SHA256 (${PINNED_NODE_VERSION} ${PINNED_NODE_ARCH})`);
  } else if (isReleaseMode) {
    throw new Error(
      `Node runtime integrity mismatch for release! Expected pinned SHA256: ${PINNED_NODE_SHA256}, but got: ${sourceSha}`
    );
  } else {
    console.warn(`[WARN] Candidate Node runtime SHA256 does not match pinned release hash (${sourceSha} vs ${PINNED_NODE_SHA256}). Allowed in dev mode only.`);
  }

  fs.copyFileSync(sourceNodeExe, targetNodeExe);

  // Cache verified binary for clean builds if matching pinned checksum
  if (sourceSha === PINNED_NODE_SHA256 && !fs.existsSync(cachedNodeExe)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.copyFileSync(sourceNodeExe, cachedNodeExe);
    log(`✔ Cached verified pinned Node runtime to ${cachedNodeExe}`);
  }

  // Validate that bundled node.exe is a real PE executable, matches hash, and runs
  const nodeStats = fs.statSync(targetNodeExe);
  if (nodeStats.size < 20 * 1024 * 1024) {
    throw new Error(`Staged node.exe is unexpectedly small (${nodeStats.size} bytes). Expected > 20 MB.`);
  }

  const targetSha = computeSha256(targetNodeExe);
  if (targetSha !== sourceSha) {
    throw new Error(`Staged node.exe corrupted during copy! (Source: ${sourceSha}, Dest: ${targetSha})`);
  }

  try {
    const nodeVer = execSync(`"${targetNodeExe}" -v`, { encoding: 'utf-8' }).trim();
    log(`✔ Bundled Node.js runtime verified: ${targetNodeExe} (${nodeVer}, ${(nodeStats.size / (1024 * 1024)).toFixed(1)} MB, SHA256: ${targetSha.slice(0, 12)}...)`);
  } catch (err) {
    throw new Error(`Staged node.exe failed verification execution: ${err.message}`);
  }

  // 8. Copy Backend (API) dist and runtime assets (excluding sourcemaps)
  const apiDest = path.join(STAGING_DIR, 'api');
  const apiDistSrc = path.join(ROOT_DIR, 'apps', 'api', 'dist');
  const apiDistDest = path.join(apiDest, 'dist');
  copyDirRecursive(apiDistSrc, apiDistDest, (filename, isDir) => isDir || !filename.endsWith('.map'));
  log('Copied: api/dist/ (sourcemaps excluded)');

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

  // 9. Stage Production API Dependencies into api/node_modules/
  log('Staging production runtime dependencies for API...');
  const apiPkgSrc = path.join(ROOT_DIR, 'apps', 'api', 'package.json');
  const apiPkg = JSON.parse(fs.readFileSync(apiPkgSrc, 'utf-8'));

  // Pack local monorepo packages so npm can install them deterministically
  const localPkgsDir = path.join(apiDest, '_local_pkgs');
  fs.mkdirSync(localPkgsDir, { recursive: true });

  const contractsPkgDir = path.join(ROOT_DIR, 'packages', 'contracts');
  const utilsPkgDir = path.join(ROOT_DIR, 'packages', 'shared-utils');

  log('Packing local packages for self-contained installation...');
  execSync(`npm pack "${contractsPkgDir}"`, { cwd: localPkgsDir, stdio: 'pipe' });
  execSync(`npm pack "${utilsPkgDir}"`, { cwd: localPkgsDir, stdio: 'pipe' });

  const packedFiles = fs.readdirSync(localPkgsDir);
  const contractsTgz = packedFiles.find((f) => f.startsWith('diamond-erp-contracts'));
  const utilsTgz = packedFiles.find((f) => f.startsWith('diamond-erp-shared-utils'));

  if (!contractsTgz || !utilsTgz) {
    throw new Error('Failed to pack local dependencies (@diamond-erp/contracts or @diamond-erp/shared-utils)');
  }

  // Temporary manifest pointing to local tarballs
  const stagingDeps = { ...apiPkg.dependencies };
  stagingDeps['@diamond-erp/contracts'] = `file:./_local_pkgs/${contractsTgz}`;
  stagingDeps['@diamond-erp/shared-utils'] = `file:./_local_pkgs/${utilsTgz}`;

  const stagingPkg = {
    name: apiPkg.name,
    version: apiPkg.version,
    main: 'dist/index.js',
    dependencies: stagingDeps,
  };
  fs.writeFileSync(path.join(apiDest, 'package.json'), JSON.stringify(stagingPkg, null, 2), 'utf-8');

  // Deterministic production npm install inside staged api directory
  log('Running deterministic npm install (--omit=dev) for production backend...');
  execSync('npm install --omit=dev --no-audit --no-fund', {
    cwd: apiDest,
    stdio: 'inherit',
  });

  // Clean temporary local package tarballs and install lockfile
  fs.rmSync(localPkgsDir, { recursive: true, force: true });
  const tempLock = path.join(apiDest, 'package-lock.json');
  if (fs.existsSync(tempLock)) {
    fs.unlinkSync(tempLock);
  }

  // Restore final clean production package.json with clean version specs
  const finalProdPkg = {
    name: apiPkg.name,
    version: apiPkg.version,
    main: 'dist/index.js',
    dependencies: apiPkg.dependencies,
  };
  fs.writeFileSync(path.join(apiDest, 'package.json'), JSON.stringify(finalProdPkg, null, 2), 'utf-8');
  log('✔ Self-contained api/node_modules/ installed successfully.');

  // 10. Stage Prisma Generated Runtime Engine & Client
  log('Staging Prisma SQLite query engine binary and generated client...');
  const prismaClientSrc = path.join(ROOT_DIR, 'apps', 'api', 'node_modules', '.prisma', 'client');
  const prismaClientDest = path.join(apiDest, 'node_modules', '.prisma', 'client');

  if (!fs.existsSync(prismaClientSrc)) {
    throw new Error(`Prisma client source directory not found: ${prismaClientSrc}`);
  }

  // Copy .prisma/client while filtering out temporary files (*.tmp*)
  copyDirRecursive(prismaClientSrc, prismaClientDest, (filename) => !filename.includes('.tmp'));

  const enginePath = path.join(prismaClientDest, 'query_engine-windows.dll.node');
  if (!fs.existsSync(enginePath)) {
    throw new Error(`Prisma SQLite query engine binary missing in staged artifacts: ${enginePath}`);
  }
  const engineSizeMb = (fs.statSync(enginePath).size / (1024 * 1024)).toFixed(1);
  log(`✔ Staged Prisma query engine: ${enginePath} (${engineSizeMb} MB)`);

  // 11. Copy Web (Frontend) production bundle (excluding sourcemaps)
  const webDistSrc = path.join(ROOT_DIR, 'apps', 'web', 'dist');
  const webDistDest = path.join(STAGING_DIR, 'web', 'dist');
  copyDirRecursive(webDistSrc, webDistDest, (filename, isDir) => isDir || !filename.endsWith('.map'));
  log('Copied: web/dist/ (sourcemaps excluded)');

  // 12. Verify Staging Completeness
  const requiredFiles = [
    path.join(STAGING_DIR, 'DiamondERP.exe'),
    path.join(STAGING_DIR, 'Installer.exe'),
    path.join(STAGING_DIR, 'runtime', 'node.exe'),
    path.join(STAGING_DIR, 'Microsoft.Web.WebView2.Core.dll'),
    path.join(STAGING_DIR, 'api', 'dist', 'index.js'),
    path.join(STAGING_DIR, 'api', 'package.json'),
    path.join(STAGING_DIR, 'api', 'prisma', 'template.db'),
    path.join(STAGING_DIR, 'api', 'node_modules', 'express', 'package.json'),
    path.join(STAGING_DIR, 'api', 'node_modules', '@prisma', 'client', 'package.json'),
    path.join(STAGING_DIR, 'api', 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node'),
    path.join(STAGING_DIR, 'api', 'node_modules', '@diamond-erp', 'contracts', 'package.json'),
    path.join(STAGING_DIR, 'api', 'node_modules', '@diamond-erp', 'shared-utils', 'package.json'),
    path.join(STAGING_DIR, 'web', 'dist', 'index.html'),
  ];

  let missingCount = 0;
  for (const f of requiredFiles) {
    if (!fs.existsSync(f)) {
      console.error(`[ERROR] Staging verification failed: Missing required file "${f}"`);
      missingCount++;
    }
  }

  // Ensure NO root node_modules exists in staging directory
  const rootNodeModules = path.join(STAGING_DIR, 'node_modules');
  if (fs.existsSync(rootNodeModules)) {
    console.error(`[ERROR] Staging verification failed: Unexpected root node_modules in "${rootNodeModules}"`);
    missingCount++;
  }

  if (missingCount === 0) {
    log('================================================================');
    log('✅ Production Staging Build Complete!');
    log(`Staged at: ${STAGING_DIR}`);
    log('All runtime artifacts, executables, templates, and production node_modules verified.');
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
