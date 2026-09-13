/**
 * DiamondERP V3.0 — Release Manifest & SHA256 Hash Generator
 *
 * Generates release-manifest.json and SHA256SUMS.txt for release artifacts:
 *   - Installer.exe
 *   - DiamondERP.exe
 *   - runtime/node.exe
 *
 * Records file size, SHA256, and Authenticode signature status.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build', 'windows', 'DiamondERP');

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
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
  console.log('📦 Generating Release Manifest & Checksums for DiamondERP V3.0');
  console.log('================================================================\n');

  const targets = [
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
    releaseVersion: '3.0.0',
    generatedAt: new Date().toISOString(),
    platform: 'win32-x64',
    artifacts: {},
  };

  const shaLines = [];

  for (const t of targets) {
    if (!fs.existsSync(t.path)) {
      console.warn(`⚠ Target file not found: ${t.path}`);
      continue;
    }

    const stat = fs.statSync(t.path);
    const sha256 = computeSha256(t.path);
    const auth = getAuthenticodeInfo(t.path);

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
    console.log(`   Signed: ${auth.signed ? 'YES (' + auth.signer + ')' : 'NO (Unsigned)'}`);
  }

  // Write release-manifest.json
  const manifestPath = path.join(ROOT_DIR, 'release-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n✔ Saved release manifest to: ${manifestPath}`);

  // Write SHA256SUMS.txt
  const shaSumsPath = path.join(ROOT_DIR, 'SHA256SUMS.txt');
  fs.writeFileSync(shaSumsPath, shaLines.join('\n') + '\n', 'utf-8');
  console.log(`✔ Saved checksums to: ${shaSumsPath}`);

  // Also copy to staging root if staging exists
  if (fs.existsSync(STAGING_DIR)) {
    fs.writeFileSync(path.join(STAGING_DIR, 'release-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    fs.writeFileSync(path.join(STAGING_DIR, 'SHA256SUMS.txt'), shaLines.join('\n') + '\n', 'utf-8');
    console.log(`✔ Mirrored release manifest & sums to staging directory: ${STAGING_DIR}`);
  }

  console.log('\n✅ Release manifest and checksum generation complete!');
}

main();
