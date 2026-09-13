/**
 * DiamondERP V3.0 — Windows Release Artifact & Signing Verifier
 *
 * Verifies that:
 *  1. Release manifest (release-manifest.json) exists
 *  2. All staged release binaries exist on disk
 *  3. SHA256 checksums match the manifest
 *  4. Authenticode signatures are inspected and reported
 *  5. If --strict-signing is passed, enforces valid signatures (for official releases)
 *     Otherwise reports unsigned status without failing development verification.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');
const isStrictSigning = process.argv.includes('--strict-signing');

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function checkAuthenticode(filePath) {
  try {
    const cmd = `powershell -NoProfile -Command "(Get-AuthenticodeSignature '${filePath}').Status"`;
    const status = execSync(cmd, { encoding: 'utf-8' }).trim();
    return status === 'Valid' || status === '0';
  } catch {
    return false;
  }
}

function main() {
  console.log('================================================================');
  console.log('🛡️ Verifying Windows Release Artifacts & Signatures');
  console.log(`Strict Signing Enforced: ${isStrictSigning ? 'YES (Official Release Mode)' : 'NO (Dev / Pre-Release Mode)'}`);
  console.log('================================================================\n');

  const manifestPath = fs.existsSync(path.join(STAGING_DIR, 'release-manifest.json'))
    ? path.join(STAGING_DIR, 'release-manifest.json')
    : path.join(ROOT_DIR, 'release-manifest.json');

  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest not found: ${manifestPath}. Run 'npm run manifest:release' first.`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;

  for (const [name, meta] of Object.entries(manifest.artifacts)) {
    totalChecks += 2; // existence + hash
    const filePath = meta.absolutePath && fs.existsSync(meta.absolutePath)
      ? meta.absolutePath
      : path.join(STAGING_DIR, name);

    console.log(`Checking [${name}]...`);
    if (!fs.existsSync(filePath)) {
      console.error(`  ❌ Missing binary: ${filePath}`);
      failedChecks += 2;
      continue;
    }
    passedChecks++;
    console.log(`  ✔ File exists: ${filePath} (${meta.sizeMb} MB)`);

    const actualSha = computeSha256(filePath);
    if (actualSha !== meta.sha256) {
      console.error(`  ❌ Hash mismatch! Expected: ${meta.sha256}, Got: ${actualSha}`);
      failedChecks++;
    } else {
      passedChecks++;
      console.log(`  ✔ SHA256 matches: ${actualSha}`);
    }

    // Authenticode check
    const isValidSignature = checkAuthenticode(filePath);
    if (isValidSignature) {
      console.log(`  ✔ Authenticode Signature: VALID`);
    } else {
      console.log(`  ℹ Authenticode Signature: UNSIGNED / NOT VERIFIED (Status: ${meta.authenticode?.statusMessage || 'NotSigned'})`);
      if (isStrictSigning) {
        console.error(`  ❌ Strict signing required but file is unsigned!`);
        failedChecks++;
      }
    }
    console.log('');
  }

  console.log('================================================================');
  console.log(`Release Verification: ${passedChecks}/${totalChecks} checks PASSED (${failedChecks} failed)`);
  console.log('================================================================\n');

  if (failedChecks > 0) {
    console.error('❌ Release verification FAILED.');
    process.exit(1);
  } else {
    console.log('✅ Release artifact verification PASSED!');
    process.exit(0);
  }
}

main();
