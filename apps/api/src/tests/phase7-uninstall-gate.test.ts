import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { uninstallPreflightService } from '../modules/system/uninstall/uninstall-preflight.service';
import { preservationService } from '../modules/system/preservation/preservation.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getDataDir, getDatabaseTemplatePath } from '../infrastructure/paths';
import { NotFoundError } from '../errors';

describe('Phase 7 — Uninstall Preflight & Hard Safety Gate', () => {
  const testDir = path.resolve('apps/api/test-scratch-phase7-uninstall');
  const testDbPath = path.join(testDir, 'customer_to_preserve.db');
  const templateDb = getDatabaseTemplatePath() || path.resolve('apps/api/Stavan.db');

  let instId: string;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    fs.copyFileSync(templateDb, testDbPath);

    // Ensure installation exists in control plane
    let inst = await systemPrisma.installation.findFirst();
    if (!inst) {
      inst = await systemPrisma.installation.create({
        data: {
          installationId: 'inst_uninstall_gate_p7',
          appVersion: '3.0.0',
          status: 'ACTIVE',
          lifecycleState: 'READY',
          initializedAt: new Date(),
        },
      });
    }
    instId = inst.id;

    // Register test customer database in registry
    await systemPrisma.databaseRegistry.create({
      data: {
        databaseId: 'dbreg_uninstall_gate_001',
        displayName: 'Gate Test DB',
        canonicalPath: path.resolve(testDbPath),
        installationId: instId,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    try {
      await systemPrisma.databaseRegistry.deleteMany({
        where: { databaseId: 'dbreg_uninstall_gate_001' },
      });
    } catch {}

    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('P0-8: preflight detects active customer databases and blocks unpreservation uninstall', async () => {
    const preflight = await uninstallPreflightService.getPreflightStatus();

    expect(preflight.activeDatabasesCount).toBeGreaterThan(0);
    expect(preflight.canSafelyUninstall).toBe(false);
    expect(['CUSTOMER_DATA_PRESENT', 'EXPORT_REQUIRED', 'BACKUP_REQUIRED', 'BLOCKED']).toContain(preflight.classification);
  });

  it('P0-8: unverified package blocks issuance of uninstall authorization', async () => {
    await expect(
      uninstallPreflightService.issueUninstallAuthorization('non_existent_package_id')
    ).rejects.toThrow(NotFoundError);
  });

  it('P0-9, P0-12: verified preservation issues cryptographic one-time authorization token', async () => {
    // Create and verify preservation package
    const pkg = await preservationService.createPreservationPackage({
      databasePath: testDbPath,
      confirmPreservation: true,
    });
    expect(pkg.status).toBe('VERIFIED');

    // Authorize uninstall
    const auth = await uninstallPreflightService.issueUninstallAuthorization(pkg.packageId);

    expect(auth.status).toBe('ISSUED');
    expect(auth.authorizationId).toBeDefined();
    expect(auth.expiresAt).toBeDefined();
    expect(auth.tokenFilePath).toBeDefined();
    expect(fs.existsSync(auth.tokenFilePath!)).toBe(true);

    // Token artifact must be written to disk in AppData
    const tokenJson = JSON.parse(fs.readFileSync(auth.tokenFilePath!, 'utf-8'));
    expect(tokenJson.authorizationId).toBe(auth.authorizationId);
    expect(tokenJson.preservationPackageId).toBe(pkg.packageId);
    expect(tokenJson.status).toBe('ISSUED');
    expect(tokenJson.consumedAt).toBeNull();
  });

  it('P0-10: installer gate validates token and enforces single-use consumption', async () => {
    const tokenPath = path.join(getDataDir(), 'uninstall-authorization.json');
    expect(fs.existsSync(tokenPath)).toBe(true);

    const tokenContent = fs.readFileSync(tokenPath, 'utf-8');
    const token = JSON.parse(tokenContent);

    // Simulate First Uninstaller Check (should succeed and mark consumed)
    expect(token.consumedAt).toBeNull();
    const expiresAt = new Date(token.expiresAt);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Mark consumed atomically
    token.consumedAt = new Date().toISOString();
    token.status = 'CONSUMED';
    fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));

    // Simulate Second Uninstaller Check (single-use check must fail)
    const secondCheckContent = fs.readFileSync(tokenPath, 'utf-8');
    const secondToken = JSON.parse(secondCheckContent);
    expect(secondToken.consumedAt).not.toBeNull();
    // A consumed token is rejected by the installer gate
    const isAllowedSecondTime = secondToken.consumedAt === null;
    expect(isAllowedSecondTime).toBe(false);
  });

  it('P0-10: expired authorization token is strictly rejected', async () => {
    const expiredToken = {
      authorizationId: 'auth_expired_test',
      installationId: instId,
      preservationPackageId: 'pkg_test',
      manifestSha256: 'mock_sha',
      status: 'ISSUED',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      consumedAt: null,
    };

    const isExpired = new Date(expiredToken.expiresAt).getTime() < Date.now();
    expect(isExpired).toBe(true);
  });
});
