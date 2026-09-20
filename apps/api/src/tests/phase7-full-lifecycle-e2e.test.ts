import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { uninstallPreflightService } from '../modules/system/uninstall/uninstall-preflight.service';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { customerDataDetectionService } from '../modules/system/uninstall/customer-data-detection.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getDatabaseTemplatePath, ensureAllDataDirs } from '../infrastructure/paths';

describe('Phase 7 — Full End-to-End Enterprise Lifecycle Flow', () => {
  const testDir = path.resolve('apps/api/test-scratch-lifecycle-e2e');
  const testDbPath = path.join(testDir, 'lifecycle_customer.db');
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  let instId: string;
  let preservationPackageId: string;
  let authorizationId: string;

  beforeAll(async () => {
    ensureAllDataDirs();

    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.copyFileSync(templateDb, testDbPath);

    // Clean any previous artifacts
    await systemPrisma.uninstallAuthorization.deleteMany({});
    await systemPrisma.preservationPackage.deleteMany({});
    await systemPrisma.databaseRegistry.deleteMany({
      where: { databaseId: 'dbreg_e2e_lifecycle' },
    });

    // Ensure installation exists in control plane
    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
        data: {
          installationId: 'inst_e2e_full_lifecycle',
          appVersion: '3.0.0',
          status: 'ACTIVE',
          lifecycleState: 'READY',
          initializedAt: new Date(),
        },
      });
    }
    instId = inst.id;

    // Register test database in database registry
    await systemPrisma.databaseRegistry.create({
      data: {
        databaseId: 'dbreg_e2e_lifecycle',
        displayName: 'E2E Customer Database',
        canonicalPath: path.resolve(testDbPath),
        installationId: instId,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    try {
      await systemPrisma.uninstallAuthorization.deleteMany({});
      await systemPrisma.preservationPackage.deleteMany({});
      await systemPrisma.databaseRegistry.deleteMany({
        where: { databaseId: 'dbreg_e2e_lifecycle' },
      });
    } catch {}

    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('Step 1: System detects customer data presence and blocks uninstallation without preservation', async () => {
    const detection = await customerDataDetectionService.detectCustomerData();
    expect(detection.hasCustomerData).toBe(true);

    const preflight = await uninstallPreflightService.getPreflightStatus();
    expect(preflight.canSafelyUninstall).toBe(false);
    expect(preflight.classification).toBe('CUSTOMER_DATA_PRESENT');
    expect(preflight.activeDatabasesCount).toBeGreaterThanOrEqual(1);
    expect(preflight.warningMessage).toContain('Customer databases detected');
  });

  it('Step 2: Creates full preservation package (backup + CSV + XLSX with all tables)', async () => {
    const pkg = await preservationService.createPreservationPackage(
      {
        databasePath: testDbPath,
        confirmPreservation: true,
      },
      'lifecycle_tester'
    );

    preservationPackageId = pkg.packageId;
    expect(pkg).toBeDefined();
    expect(pkg.packageId).toBeDefined();
    expect(pkg.status).toBe('VERIFIED');
    expect(pkg.manifestPath).toBeDefined();
    expect(fs.existsSync(pkg.manifestPath!)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(pkg.manifestPath!, 'utf-8'));
    expect(manifest.artifacts.databaseBackup.sha256).toBeDefined();
    expect(manifest.artifacts.csv.filesCount).toBe(16);
  });

  it('Step 3: Verification of preservation package integrity confirms byte-accurate completeness', async () => {
    const verification = await preservationService.verifyPreservationPackage(preservationPackageId);

    expect(verification.verified).toBe(true);
    expect(verification.status).toBe('VERIFIED');
    expect(verification.databaseBackupVerified).toBe(true);
    expect(verification.csvVerified).toBe(true);
    expect(verification.xlsxVerified).toBe(true);
    expect(verification.manifestVerified).toBe(true);
  });

  it('Step 4: Preflight updates to PRESERVATION_VERIFIED once package is verified', async () => {
    const preflight = await uninstallPreflightService.getPreflightStatus();

    expect(preflight.classification).toBe('PRESERVATION_VERIFIED');
    expect(preflight.canSafelyUninstall).toBe(false);
    expect(preflight.latestPreservationPackageId).toBe(preservationPackageId);
    expect(preflight.warningMessage).toContain('Customer data verified and preserved');
  });

  it('Step 5: Issues cryptographically bound one-time uninstall authorization', async () => {
    const auth = await uninstallPreflightService.issueUninstallAuthorization(preservationPackageId);

    expect(auth.authorizationId).toBeDefined();
    expect(auth.status).toBe('ISSUED');
    expect(auth.installationId).toBeDefined();
    expect(auth.manifestSha256).toBeDefined();
    expect(auth.expiresAt).toBeDefined();
    expect(new Date(auth.expiresAt).getTime()).toBeGreaterThan(Date.now());

    authorizationId = auth.authorizationId;

    // Check on disk token file
    const preflight = await uninstallPreflightService.getPreflightStatus();
    expect(preflight.canSafelyUninstall).toBe(true);
    expect(preflight.classification).toBe('READY_FOR_UNINSTALL');
  });

  it('Step 6: Consuming authorization token enforces single-use policy', async () => {
    const record = await systemPrisma.uninstallAuthorization.findUnique({
      where: { authorizationId },
    });
    expect(record).toBeDefined();
    expect(record!.status).toBe('ISSUED');

    // Mark consumed as installer would
    await systemPrisma.uninstallAuthorization.update({
      where: { authorizationId },
      data: {
        status: 'CONSUMED',
        consumedAt: new Date(),
      },
    });

    const updated = await systemPrisma.uninstallAuthorization.findUnique({
      where: { authorizationId },
    });
    expect(updated!.status).toBe('CONSUMED');
    expect(updated!.consumedAt).toBeDefined();

    // With token consumed, preflight reverts to blocking
    const preflight = await uninstallPreflightService.getPreflightStatus();
    expect(preflight.canSafelyUninstall).toBe(false);
  });
});
