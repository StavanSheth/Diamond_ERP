import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { uninstallPreflightService } from '../modules/system/uninstall/uninstall-preflight.service';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getDataDir, getDatabaseTemplatePath } from '../infrastructure/paths';

describe('Phase 7 — Uninstall Authorization Security & Atomic Consumption', () => {
  const testDir = path.resolve('apps/api/test-scratch-phase7-auth-security');
  const testDbPath = path.join(testDir, 'security_customer.db');
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  let instId: string;
  let validPackageId: string;
  let validManifestHash: string;
  let validPkgDestination: string;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    fs.copyFileSync(templateDb, testDbPath);

    // Setup installation in system DB
    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
        data: {
          installationId: 'inst_auth_security_test',
          appVersion: '3.0.0',
          status: 'ACTIVE',
          lifecycleState: 'READY',
          initializedAt: new Date(),
        },
      });
    }
    instId = inst.installationId;

    // Clean test state
    await systemPrisma.uninstallAuthorization.deleteMany({});
    await systemPrisma.preservationPackage.deleteMany({});

    // Create and verify a valid preservation package
    const customExportDir = path.join(testDir, 'export_dest');
    const pkg = await preservationService.createPreservationPackage({
      databasePath: testDbPath,
      destinationDir: customExportDir,
      confirmPreservation: true,
    });

    validPackageId = pkg.packageId;
    validPkgDestination = pkg.destinationPath;

    const manifestContent = fs.readFileSync(pkg.manifestPath!, 'utf-8');
    validManifestHash = crypto.createHash('sha256').update(manifestContent).digest('hex');
  });

  afterAll(async () => {
    try {
      await systemPrisma.uninstallAuthorization.deleteMany({});
      await systemPrisma.preservationPackage.deleteMany({});
    } catch {}

    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('Section 17 & 18: authorization is strictly bound to machine installationId', async () => {
    const auth = await uninstallPreflightService.issueUninstallAuthorization(validPackageId);
    expect(auth.status).toBe('ISSUED');
    expect(auth.authorizationId).toBeDefined();

    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    expect(fs.existsSync(tokenFilePath)).toBe(true);

    const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));
    expect(tokenData.installationId).toBe(instId);
    expect(tokenData.nonce).toBeDefined();
    expect(tokenData.nonce.length).toBeGreaterThanOrEqual(16);

    // Simulate wrong installation check
    tokenData.installationId = 'wrong_foreign_machine_installation_id';
    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');

    const checkResult = await uninstallPreflightService.checkAuthorizationToken();
    expect(checkResult.valid).toBe(false);
    expect(checkResult.reason || checkResult.error).toContain('installation');
  });

  it('Section 19 & 40: authorization is strictly package-bound', async () => {
    await uninstallPreflightService.issueUninstallAuthorization(validPackageId);
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));

    // Tamper with package ID
    tokenData.preservationPackageId = 'pkg_wrong_or_fabricated_package_id';
    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');

    const checkResult = await uninstallPreflightService.checkAuthorizationToken();
    expect(checkResult.valid).toBe(false);
    expect(checkResult.reason || checkResult.error).toContain('Preservation package ID does not match');
  });

  it('Section 20 & 39: authorization is strictly bound to preservation-manifest.json SHA-256 hash', async () => {
    await uninstallPreflightService.issueUninstallAuthorization(validPackageId);
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));

    // 1. Check with wrong manifest hash in token
    tokenData.preservationManifestHash = '0000000000000000000000000000000000000000000000000000000000000000';
    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');

    const checkWithWrongHash = await uninstallPreflightService.checkAuthorizationToken();
    expect(checkWithWrongHash.valid).toBe(false);
    expect(checkWithWrongHash.reason || checkWithWrongHash.error).toContain('SHA-256 mismatch');

    // 2. Restore hash, but tamper with the actual manifest file on disk
    tokenData.preservationManifestHash = validManifestHash;
    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');

    const manifestPath = path.join(validPkgDestination, 'preservation-manifest.json');
    const originalManifest = fs.readFileSync(manifestPath, 'utf-8');
    fs.appendFileSync(manifestPath, '\n/* tampered */');

    const checkWithTamperedManifest = await uninstallPreflightService.checkAuthorizationToken();
    expect(checkWithTamperedManifest.valid).toBe(false);
    expect(checkWithTamperedManifest.reason || checkWithTamperedManifest.error).toContain('SHA-256 mismatch');

    // Restore original manifest
    fs.writeFileSync(manifestPath, originalManifest, 'utf-8');
  });

  it('Section 21: authorization verifies destination directory and preservation-manifest.json existence', async () => {
    await uninstallPreflightService.issueUninstallAuthorization(validPackageId);
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));

    // Set non-existent destination
    tokenData.preservationDestinationPath = path.join(testDir, 'non_existent_folder');
    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');

    const checkMissingDest = await uninstallPreflightService.checkAuthorizationToken();
    expect(checkMissingDest.valid).toBe(false);
    expect(checkMissingDest.reason || checkMissingDest.error).toContain('destination directory does not exist');
  });

  it('Section 22 & 36: expired authorization token is strictly blocked', async () => {
    await uninstallPreflightService.issueUninstallAuthorization(validPackageId);
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));

    tokenData.expiresAt = new Date(Date.now() - 60000).toISOString(); // Expired 1 min ago
    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');

    const checkExpired = await uninstallPreflightService.checkAuthorizationToken();
    expect(checkExpired.valid).toBe(false);
    expect(checkExpired.reason || checkExpired.error).toContain('expired');
  });

  it('Section 24 & 25 & 37: atomic consumption marks token and DB as CONSUMED and enforces single-use', async () => {
    const auth = await uninstallPreflightService.issueUninstallAuthorization(validPackageId);
    expect(auth.status).toBe('ISSUED');

    const initialCheck = await uninstallPreflightService.checkAuthorizationToken();
    expect(initialCheck.valid).toBe(true);

    // Atomically consume token
    await uninstallPreflightService.consumeAuthorizationToken();

    // 1. File state must be CONSUMED
    const tokenFilePath = path.join(getDataDir(), 'uninstall-authorization.json');
    const consumedToken = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));
    expect(consumedToken.status).toBe('CONSUMED');
    expect(consumedToken.consumedAt).not.toBeNull();

    // 2. DB state must be CONSUMED
    const dbAuth = await systemPrisma.uninstallAuthorization.findUnique({
      where: { authorizationId: consumedToken.authorizationId },
    });
    expect(dbAuth?.status).toBe('CONSUMED');
    expect(dbAuth?.consumedAt).not.toBeNull();

    // 3. Second consumption / check attempt MUST be rejected
    const secondCheck = await uninstallPreflightService.checkAuthorizationToken();
    expect(secondCheck.valid).toBe(false);
    expect(secondCheck.reason || secondCheck.error).toMatch(/CONSUMED|consumed/i);

    // 4. Audit event recorded
    const audit = await systemPrisma.auditEvent.findFirst({
      where: {
        eventType: 'UNINSTALL_AUTHORIZATION_CONSUMED',
        description: { contains: consumedToken.authorizationId },
      },
    });
    expect(audit).not.toBeNull();
  });
});
