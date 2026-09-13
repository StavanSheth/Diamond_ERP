/**
 * DiamondERP V3.0 — Automated Windows Release Packager & Distribution Gate
 *
 * Sequence:
 *   1. Clean stale distribution artifacts
 *   2. Run Windows production staging build (npm run stage:windows)
 *   3. Execute packaging readiness validation gate (npm run verify:packaging)
 *   4. Execute staged backend smoke test gate (npm run test:smoke:staged)
 *   5. Assemble release artifacts in build/releases/:
 *      - DiamondERP-3.0.0-Setup.exe
 *      - DiamondERP-3.0.0-Windows-x64.zip
 *   6. Generate release manifest & SHA256 hashes (node scripts/create-release-manifest.js)
 *   7. Verify final release distribution artifacts (node scripts/verify-windows-release.js)
 *
 * Requirements:
 *   - Fails immediately on any gate failure; never produces broken release artifacts.
 *   - Never touches user production data (%LOCALAPPDATA%\DiamondERP\databases).
 *   - Generates traceable, reproducible, and verifiable release distribution packages.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');
const RELEASES_DIR = path.join(ROOT_DIR, 'build', 'releases');

function logStep(stepNum, title) {
  console.log('\n================================================================');
  console.log(`🚀 [Step ${stepNum}] ${title}`);
  console.log('================================================================');
}

function runCommand(desc, cmd, opts = {}) {
  console.log(`\n▶ ${desc} (${cmd})`);
  try {
    execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit', ...opts });
    console.log(`✔ Completed: ${desc}`);
  } catch (err) {
    console.error(`\n❌ [RELEASE GATE FAILURE] ${desc} failed!`);
    console.error(`Command: ${cmd}`);
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const startTime = Date.now();
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  const version = rootPkg.version || '3.0.0';

  console.log('################################################################');
  console.log(`💎 Diamond ERP Windows Release Packager — Version ${version}`);
  console.log('################################################################');

  // Step 1: Clean and prepare release directory
  logStep(1, 'Prepare Clean Releases Output Directory');
  if (fs.existsSync(RELEASES_DIR)) {
    console.log(`Cleaning existing releases directory: ${RELEASES_DIR}`);
    fs.rmSync(RELEASES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  console.log(`✔ Created fresh releases directory: ${RELEASES_DIR}`);

  // Step 2: Build and Stage Windows Production Payload
  logStep(2, 'Stage Windows Production Payload (Pinned Node runtime + Built assets)');
  process.env.RELEASE_MODE = 'true';
  runCommand('Staging Windows Build', 'npm run stage:windows');

  // Step 3: Packaging Readiness Validation Gate
  logStep(3, 'Verify Staged Packaging Readiness (41 checks)');
  runCommand('Packaging Readiness Validation Gate', 'npm run verify:packaging');

  // Step 4: Staged Production Smoke Test Gate
  logStep(4, 'Execute Staged Production Smoke Tests (Bundled Node + Isolated SQLite)');
  runCommand('Staged Production Smoke Test Gate', 'npm run test:smoke:staged');

  // Step 5: Assemble Distribution Artifacts
  logStep(5, 'Assemble Distribution Artifacts in build/releases/');
  const installerSrc = path.join(STAGING_DIR, 'Installer.exe');
  const releaseSetupExe = path.join(RELEASES_DIR, `DiamondERP-${version}-Setup.exe`);

  if (!fs.existsSync(installerSrc)) {
    console.error(`❌ Source installer binary not found at: ${installerSrc}`);
    process.exit(1);
  }

  // 5a. Copy and name setup installer
  fs.copyFileSync(installerSrc, releaseSetupExe);
  const setupStat = fs.statSync(releaseSetupExe);
  console.log(`✔ Created Setup Installer: ${releaseSetupExe} (${(setupStat.size / (1024 * 1024)).toFixed(2)} MB)`);

  // 5b. Create Portable Zip Distribution Package
  const zipPath = path.join(RELEASES_DIR, `DiamondERP-${version}-Windows-x64.zip`);
  console.log(`Compressing staged payload to portable zip: ${zipPath}...`);
  const psZipCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${STAGING_DIR}\\*' -DestinationPath '${zipPath}' -Force"`;
  runCommand('Portable Zip Archive Compression', psZipCmd);
  const zipStat = fs.statSync(zipPath);
  console.log(`✔ Created Portable Zip Package: ${zipPath} (${(zipStat.size / (1024 * 1024)).toFixed(2)} MB)`);

  // Step 6: Generate Release Manifest & SHA256 Checksums
  logStep(6, 'Generate Release Manifest & Cryptographic Hashes');
  runCommand('Generate Release Manifest & Checksums', 'node scripts/create-release-manifest.js');

  // Step 7: Verify Final Release Distribution Artifacts
  logStep(7, 'Verify Release Artifacts & Checksums');
  runCommand('Verify Windows Release Gate', 'node scripts/verify-windows-release.js');

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n################################################################');
  console.log(`🎉 RELEASE SUCCESS! Diamond ERP V${version} is fully packaged & release-ready.`);
  console.log(`⏱ Total elapsed time: ${elapsedSec}s`);
  console.log(`📂 Output Directory:  ${RELEASES_DIR}`);
  console.log('################################################################\n');
}

main().catch((err) => {
  console.error('\n❌ Unhandled fatal error during release packaging:', err);
  process.exit(1);
});
