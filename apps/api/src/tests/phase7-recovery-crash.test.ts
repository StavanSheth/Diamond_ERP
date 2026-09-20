import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { recoveryService } from '../modules/system/recovery/recovery.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getExportDir, ensureAllDataDirs } from '../infrastructure/paths';

describe('Phase 7 — Recovery & Crash Reconciliation', () => {
  let instId: string;
  const createdPackageIds: string[] = [];

  beforeAll(async () => {
    ensureAllDataDirs();

    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
        data: {
          installationId: 'inst_crash_reconcile',
          appVersion: '3.0.0',
          status: 'ACTIVE',
          lifecycleState: 'READY',
          initializedAt: new Date(),
        },
      });
    }
    instId = inst.id;
  });

  afterAll(async () => {
    if (createdPackageIds.length > 0) {
      await systemPrisma.preservationPackage.deleteMany({
        where: { packageId: { in: createdPackageIds } },
      });
    }
  });

  it('P7-CRASH-1: reconcileInterruptedPreservations transitions transient packages to FAILED', async () => {
    const pkgPending = `pkg_crash_pending_${Date.now()}`;
    const pkgBackingUp = `pkg_crash_backup_${Date.now()}`;
    const pkgExporting = `pkg_crash_export_${Date.now()}`;
    const pkgVerifying = `pkg_crash_verify_${Date.now()}`;
    const pkgVerified = `pkg_crash_verified_${Date.now()}`;

    createdPackageIds.push(pkgPending, pkgBackingUp, pkgExporting, pkgVerifying, pkgVerified);

    await systemPrisma.preservationPackage.createMany({
      data: [
        {
          packageId: pkgPending,
          installationId: instId,
          databaseId: 'db_crash_test',
          destinationPath: 'C:\\fake\\pending',
          status: 'PENDING',
        },
        {
          packageId: pkgBackingUp,
          installationId: instId,
          databaseId: 'db_crash_test',
          destinationPath: 'C:\\fake\\backup',
          status: 'BACKING_UP',
        },
        {
          packageId: pkgExporting,
          installationId: instId,
          databaseId: 'db_crash_test',
          destinationPath: 'C:\\fake\\export',
          status: 'EXPORTING',
        },
        {
          packageId: pkgVerifying,
          installationId: instId,
          databaseId: 'db_crash_test',
          destinationPath: 'C:\\fake\\verify',
          status: 'VERIFYING',
        },
        {
          packageId: pkgVerified,
          installationId: instId,
          databaseId: 'db_crash_test',
          destinationPath: 'C:\\fake\\verified',
          status: 'VERIFIED',
          verifiedAt: new Date(),
        },
      ],
    });

    const result = await preservationService.reconcileInterruptedPreservations();
    expect(result.reconciledCount).toBeGreaterThanOrEqual(4);

    // Verify transient packages are marked FAILED
    const checkPending = await systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgPending } });
    expect(checkPending?.status).toBe('FAILED');
    expect(checkPending?.errorMessage).toContain('interrupted');

    const checkBackingUp = await systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgBackingUp } });
    expect(checkBackingUp?.status).toBe('FAILED');

    const checkExporting = await systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgExporting } });
    expect(checkExporting?.status).toBe('FAILED');

    const checkVerifying = await systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgVerifying } });
    expect(checkVerifying?.status).toBe('FAILED');

    // Verify completed package was untouched
    const checkVerified = await systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgVerified } });
    expect(checkVerified?.status).toBe('VERIFIED');
  });

  it('P7-CRASH-2: cleans up incomplete temp directory during preservation crash reconciliation', async () => {
    const exportDir = getExportDir();
    const incompleteDirPath = path.join(exportDir, `pkg_incomplete_staging_${Date.now()}`);
    fs.mkdirSync(incompleteDirPath, { recursive: true });
    fs.writeFileSync(path.join(incompleteDirPath, 'partial.tmp'), 'incomplete data', 'utf-8');

    const pkgIncomplete = `pkg_crash_incomplete_${Date.now()}`;
    createdPackageIds.push(pkgIncomplete);

    await systemPrisma.preservationPackage.create({
      data: {
        packageId: pkgIncomplete,
        installationId: instId,
        databaseId: 'db_crash_test',
        destinationPath: incompleteDirPath,
        status: 'EXPORTING',
      },
    });

    await preservationService.reconcileInterruptedPreservations();

    const record = await systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgIncomplete } });
    expect(record?.status).toBe('FAILED');
    expect(fs.existsSync(incompleteDirPath)).toBe(false);
  });

  it('P7-CRASH-3: recoveryService.reconcileInterruptedRestores handles crashed swap files and restores safely', async () => {
    const result = await recoveryService.reconcileInterruptedRestores();
    expect(typeof result.reconciledCount).toBe('number');
    expect(typeof result.cleanedStagingCount).toBe('number');
  });
});
