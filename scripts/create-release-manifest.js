/**
 * DiamondERP V3.0 — Release Manifest & Checksum Generator
 *
 * Generates release-manifest.json and SHA256SUMS.txt for:
 *   - Installer (Installer.exe / DiamondERP-3.0.0-Setup.exe)
 *   - Desktop Launcher (DiamondERP.exe)
 *   - Standalone Node Runtime (runtime/node.exe)
 *   - Complete Portable Zip Bundle (DiamondERP-3.0.0-Windows-x64.zip, if built)
 *
 * Captures:
 *   - Single-source-of-truth version (package.json)
 *   - Git commit SHA and branch (for traceability)
 *   - File sizes, SHA256 checksums, and Authenticode signature audit
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');
const RELEASES_DIR = path.join(ROOT_DIR, 'build', 'releases');

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function getGitMetadata() {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
    const shortCommit = execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
    return { commit, shortCommit, branch };
  } catch {
    return { commit: 'unknown', shortCommit: 'unknown', branch: 'v3' };
  }
}

function getAuthenticodeInfo(filePath) {
  try {
    const cmd = `powershell -NoProfile -Command "Get-AuthenticodeSignature '${filePath}' | Select-Object -Property Status, StatusMessage, @{Name='Signer';Expression={$_.SignerCertificate.Subject}}, @{Name='Issuer';Expression={$_.SignerCertificate.Issuer}}, @{Name='Thumbprint';Expression={$_.SignerCertificate.Thumbprint}}, @{Name='Timestamp';Expression={$_.TimeStamperCertificate.Subject}} | ConvertTo-Json"`;
    const output = execSync(cmd, { encoding: 'utf-8' }).trim();
    if (!output) return { signed: false, status: 'NotSigned' };
    const parsed = JSON.parse(output);
    const isSigned = parsed.Status === 0 || parsed.Status === 'Valid';
    return {
      signed: isSigned,
      status: String(parsed.Status),
      statusMessage: parsed.StatusMessage || (isSigned ? 'Signature verified' : 'Not digitally signed'),
      signer: parsed.Signer || null,
      issuer: parsed.Issuer || null,
      thumbprint: parsed.Thumbprint || null,
      timestamp: parsed.Timestamp || null,
    };
  } catch (e) {
    return { signed: false, status: 'Unknown', error: e.message };
  }
}

function main() {
  console.log('================================================================');
  console.log('📦 Generating Release Manifest & Checksums for Diamond ERP');
  console.log('================================================================\n');

  // Single Source of Truth for Version
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  const version = rootPkg.version || '3.0.0';
  const gitMeta = getGitMetadata();

  const targets = [
    { name: 'DiamondERP-Setup.exe', path: path.join(RELEASES_DIR, 'DiamondERP-Setup.exe') },
    { name: `DiamondERP-${version}-Setup.exe`, path: path.join(RELEASES_DIR, `DiamondERP-${version}-Setup.exe`) },
    { name: `DiamondERP-${version}-Windows-x64.zip`, path: path.join(RELEASES_DIR, `DiamondERP-${version}-Windows-x64.zip`) },
    { name: 'Installer.exe', path: path.join(STAGING_DIR, 'Installer.exe') },
    { name: 'DiamondERP.exe', path: path.join(STAGING_DIR, 'DiamondERP.exe') },
    { name: 'runtime/node.exe', path: path.join(STAGING_DIR, 'runtime', 'node.exe') },
  ];

  // Fallback to installer/ directory if staging hasn't copied them yet
  for (const t of targets) {
    if (!fs.existsSync(t.path)) {
      const fallback = path.join(ROOT_DIR, 'installer', t.name);
      if (fs.existsSync(fallback)) {
        t.path = fallback;
      }
    }
  }

  const manifest = {
    product: 'Diamond ERP',
    version: version,
    platform: 'win32',
    architecture: 'x64',
    buildDate: new Date().toISOString(),
    git: gitMeta,
    runtime: {
      engine: 'node.exe',
      version: 'v22.20.0',
      arch: 'x64',
      pinnedSha256: 'fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d',
    },
    artifacts: {},
  };

  const shaLines = [];

  for (const t of targets) {
    if (!fs.existsSync(t.path)) {
      continue;
    }

    const stat = fs.statSync(t.path);
    const sha256 = computeSha256(t.path);
    const isExe = t.path.endsWith('.exe') || t.path.endsWith('.dll');
    const auth = isExe ? getAuthenticodeInfo(t.path) : { signed: false, status: 'NotApplicable', statusMessage: 'Archive' };

    manifest.artifacts[t.name] = {
      relativePath: t.name,
      absolutePath: t.path,
      sizeBytes: stat.size,
      sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
      sha256,
      authenticode: auth,
    };

    shaLines.push(`${sha256}  ${t.name}`);
    console.log(`✔ ${t.name}:`);
    console.log(`   SHA256: ${sha256}`);
    console.log(`   Size:   ${stat.size} bytes (${manifest.artifacts[t.name].sizeMb} MB)`);
    console.log(`   Signed: ${auth.signed ? 'YES (' + auth.signer + ')' : (auth.status === 'NotApplicable' ? 'N/A' : 'NO (Unsigned)')}`);

    // Generate individual .sha256 file if in releases dir
    if (t.path.startsWith(RELEASES_DIR)) {
      const singleShaPath = `${t.path}.sha256`;
      fs.writeFileSync(singleShaPath, `${sha256} *${path.basename(t.path)}\n`, 'utf-8');
    }
  }

  // Write root release-manifest.json
  const manifestPath = path.join(ROOT_DIR, 'release-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n✔ Saved release manifest to: ${manifestPath}`);

  // Write root SHA256SUMS.txt
  const shaSumsPath = path.join(ROOT_DIR, 'SHA256SUMS.txt');
  fs.writeFileSync(shaSumsPath, shaLines.join('\n') + '\n', 'utf-8');
  console.log(`✔ Saved checksums to: ${shaSumsPath}`);

  // Mirror to staging directory
  if (fs.existsSync(STAGING_DIR)) {
    fs.writeFileSync(path.join(STAGING_DIR, 'release-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    fs.writeFileSync(path.join(STAGING_DIR, 'SHA256SUMS.txt'), shaLines.join('\n') + '\n', 'utf-8');
    console.log(`✔ Mirrored release manifest & sums to staging directory: ${STAGING_DIR}`);
  }

  // Mirror to releases directory
  if (fs.existsSync(RELEASES_DIR)) {
    fs.writeFileSync(path.join(RELEASES_DIR, 'release-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    fs.writeFileSync(path.join(RELEASES_DIR, 'SHA256SUMS.txt'), shaLines.join('\n') + '\n', 'utf-8');
    console.log(`✔ Mirrored release manifest & sums to releases directory: ${RELEASES_DIR}`);
  }

  console.log('\n✅ Release manifest and checksum generation complete!');
}

main();
