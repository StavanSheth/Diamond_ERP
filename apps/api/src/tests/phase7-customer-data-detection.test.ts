import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  customerDataDetectionService,
  CustomerDataDetectionResult,
} from '../modules/system/uninstall/customer-data-detection.service';
import { uninstallPreflightService } from '../modules/system/uninstall/uninstall-preflight.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import {
  getDataDir,
  getDatabasesDir,
  getExportDir,
  getDatabaseTemplatePath,
  ensureAllDataDirs,
} from '../infrastructure/paths';

describe('Phase 7 — Customer Data Detection & Offline Status Reporting', () => {
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');
  let testCustomerDbPath: string;
  let testExportBundleDir: string;
  let instId: string;

  beforeAll(async () => {
    ensureAllDataDirs();

    await systemPrisma.uninstallAuthorization.deleteMany({});
    await systemPrisma.preservationPackage.deleteMany({});
    const tokenFile = path.join(getDataDir(), 'uninstall-authorization.json');
    if (fs.existsSync(tokenFile)) {
      try { fs.unlinkSync(tokenFile); } catch {}
    }

    // Ensure installation exists in control plane
    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
        data: {
          installationId: 'inst_customer_data_detect',
          appVersion: '3.0.0',
          status: 'ACTIVE',
          lifecycleState: 'READY',
          initializedAt: new Date(),
        },
      });
    }
    instId = inst.id;

    // Create a physical test customer db in databases dir
    const databasesDir = getDatabasesDir();
    testCustomerDbPath = path.join(databasesDir, 'customer_detect_test.db');
    fs.copyFileSync(templateDb, testCustomerDbPath);

    // Create a dummy export bundle in exports dir
    const exportDir = getExportDir();
    testExportBundleDir = path.join(exportDir, 'export_bundle_detect_test');
    if (!fs.existsSync(testExportBundleDir)) {
      fs.mkdirSync(testExportBundleDir, { recursive: true });
    }
    fs.writeFileSync(path.join(testExportBundleDir, 'test.csv'), 'id,name\n1,Alpha', 'utf-8');

    // Register test database in DatabaseRegistry
    await systemPrisma.databaseRegistry.create({
      data: {
        databaseId: 'dbreg_detect_001',
        displayName: 'Registered Detect DB',
        canonicalPath: path.resolve(testCustomerDbPath),
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
        where: { databaseId: 'dbreg_detect_001' },
      });
      const tokenFile = path.join(getDataDir(), 'uninstall-authorization.json');
      if (fs.existsSync(tokenFile)) {
        try { fs.unlinkSync(tokenFile); } catch {}
      }
    } catch {}

    if (fs.existsSync(testCustomerDbPath)) {
      try {
        fs.unlinkSync(testCustomerDbPath);
      } catch {}
    }

    if (fs.existsSync(testExportBundleDir)) {
      try {
        fs.rmSync(testExportBundleDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('P7-DET-1: detectCustomerData identifies physical and registered customer databases', async () => {
    const result: CustomerDataDetectionResult = await customerDataDetectionService.detectCustomerData();

    expect(result.hasCustomerData).toBe(true);
    expect(result.databases.length).toBeGreaterThanOrEqual(1);

    const match = result.databases.find(
      (d) => d.canonicalPath.toLowerCase() === path.resolve(testCustomerDbPath).toLowerCase()
    );
    expect(match).toBeDefined();
    expect(match!.sizeBytes).toBeGreaterThan(0);
  });

  it('P7-DET-2: detectCustomerData identifies export bundles in exports directory', async () => {
    const result = await customerDataDetectionService.detectCustomerData();

    expect(result.exportBundles.length).toBeGreaterThanOrEqual(1);
    const bundleMatch = result.exportBundles.find((b) => b.bundleDirName === 'export_bundle_detect_test');
    expect(bundleMatch).toBeDefined();
    expect(bundleMatch!.fullPath).toBe(testExportBundleDir);
  });

  it('P7-DET-3: customer-data-status.json is atomically written to AppData data directory', async () => {
    const result = await customerDataDetectionService.detectCustomerData();
    const statusFile = path.join(getDataDir(), 'customer-data-status.json');
    expect(result.statusFilePath).toBe(statusFile);
    expect(fs.existsSync(statusFile)).toBe(true);
    const contents = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));

    expect(contents.hasCustomerData).toBe(true);
    expect(contents.databases).toBeInstanceOf(Array);
    expect(contents.exportBundles).toBeInstanceOf(Array);
    expect(contents.preservationPackages).toBeInstanceOf(Array);
    expect(typeof contents.activeUserCount).toBe('number');
    expect(typeof contents.deletedUserCount).toBe('number');
    expect(contents.inspectedAt).toBeDefined();
  });

  it('P7-DET-4: uninstallPreflightService seamlessly consumes unified detection', async () => {
    const preflight = await uninstallPreflightService.getPreflightStatus();

    expect(preflight.activeDatabasesCount).toBeGreaterThanOrEqual(1);
    expect(preflight.classification).not.toBe('NO_CUSTOMER_DATA');
    expect(preflight.canSafelyUninstall).toBe(false);
  });
});
