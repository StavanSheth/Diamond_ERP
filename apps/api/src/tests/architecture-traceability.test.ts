import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { installationService } from '../modules/system/installation.service';
import { deviceSecurityService } from '../modules/security/device-security.service';
import { onboardingService } from '../modules/system/onboarding/onboarding.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { ensureAllDataDirs, getControlDbPath } from '../infrastructure/paths';
import { createRoutes } from '../routes';

describe('Phase 1.9 — Architecture-to-Runtime Traceability Verification', () => {
  let app: express.Application;

  beforeAll(async () => {
    ensureAllDataDirs();
    app = express();
    app.use(express.json());

    const noop = (_req: any, res: any) => res.json({ success: true, data: [] });
    const noopCreated = (_req: any, res: any) => res.status(201).json({ success: true });

    const mockStockController: any = {
      getStocks: noop,
      createStock: noopCreated,
      updateStock: noop,
      deleteStock: noop,
    };
    const mockHealthController: any = {
      getHealth: (_req: any, res: any) => res.json({ status: 'ok', database: 'Connected' }),
      getLiveness: (_req: any, res: any) => res.json({ status: 'ok' }),
      getReadiness: (_req: any, res: any) => res.json({ status: 'ok' }),
    };
    const mockDashboardController: any = {
      getDashboard: noop,
    };
    const mockLedgerController: any = {
      getAll: noop,
      getStockNames: noop,
      getParties: noop,
      getPaymentSummary: noop,
      create: noopCreated,
      update: noop,
      delete: noop,
    };
    const mockCertificateController: any = {
      getCertificates: noop,
      getUnlinkedCertificates: noop,
      createCertificate: noopCreated,
      uploadPdf: noopCreated,
      linkCertificate: noop,
      updateCertificate: noop,
      delete: noop,
      downloadPdf: noop,
    };
    const mockPartyController: any = {
      getParties: noop,
      createParty: noopCreated,
      updateParty: noop,
      deleteParty: noop,
    };
    const mockRepairController: any = {
      getRepairs: noop,
      createRepair: noopCreated,
      updateRepair: noop,
      deleteRepair: noop,
    };
    const mockSettingsController: any = {
      getSettings: noop,
      updateSettings: noop,
      exportExcel: noop,
      downloadTemplate: noop,
      importExcel: noop,
      getProfiles: noop,
      createProfile: noopCreated,
      switchProfile: noop,
      backupDatabase: noop,
      checkpointWAL: noop,
      factoryReset: noop,
    };

    const routes = createRoutes(
      mockStockController,
      mockHealthController,
      mockDashboardController,
      mockLedgerController,
      mockCertificateController,
      mockPartyController,
      mockRepairController,
      mockSettingsController
    );
    app.use(routes);
  });

  it('Trace 1: APPLICATION START -> Verifies directory layout and storage boundaries', () => {
    ensureAllDataDirs();
    const controlDb = getControlDbPath();
    expect(controlDb).toBeDefined();
    expect(controlDb.endsWith('.db')).toBe(true);
  });

  it('Trace 2: BACKEND START -> Public probes are accessible without authentication', async () => {
    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');

    const lifecycleProbe = await request(app).get('/api/system/lifecycle');
    expect(lifecycleProbe.status).toBe(200);
    expect(lifecycleProbe.body.success).toBe(true);
    expect(lifecycleProbe.body.data.lifecycleState).toBeDefined();
  });

  it('Trace 3: INSTALLATION & DEVICE DETECTION -> Stable persistent identities backed by control DB', async () => {
    const installId = installationService.getOrGenerateInstallationId();
    const deviceId = installationService.getOrGenerateDeviceId();

    expect(installId).toBeDefined();
    expect(installId.length).toBeGreaterThanOrEqual(16);

    expect(deviceId).toBeDefined();
    expect(deviceId.length).toBeGreaterThanOrEqual(16);

    const install = await installationService.getOrCreateInstallation();
    expect(install.installationId).toBe(installId);
  });

  it('Trace 4: LIFECYCLE REJECTION -> Business endpoints reject access if lifecycle is not READY', async () => {
    // Temporarily reset state to APP_SETUP to verify gate
    const install = await installationService.getOrCreateInstallation();
    await systemPrisma.installation.update({
      where: { id: install.id },
      data: { lifecycleState: 'APP_SETUP' },
    });

    const res = await request(app)
      .get('/api/stocks')
      .set('X-Profile-Id', 'Stavan');

    expect(res.status).toBe(428);
    expect(res.body.code).toBe('LIFECYCLE_NOT_READY');
    expect(res.body.currentLifecycleState).toBe('APP_SETUP');
  });

  it('Trace 5: SECURITY STATE -> Authoritative PIN hashing and lockout state in DeviceSecurity', async () => {
    const deviceId = installationService.getOrGenerateDeviceId();
    const pin = '849201';

    // Ensure PIN is configured
    await deviceSecurityService.setupPin(deviceId, pin).catch(() => {});
    const sec = await systemPrisma.deviceSecurity.findUnique({
      where: { deviceId },
    });

    expect(sec).toBeDefined();
    expect(sec?.pinHash).toBeDefined();
    expect(sec?.pinHash).not.toBe(pin); // Plaintext never stored
    expect(sec?.pinHash?.startsWith('$2')).toBe(true); // Bcrypt hash
  });

  it('Trace 6: USER STATE -> Business user association in InstallationUser relation', async () => {
    const install = await installationService.getOrCreateInstallation();
    const created = await onboardingService.createBusinessUser({
      username: 'trace_admin',
      password: 'Password123!',
      displayName: 'Trace Administrator',
      role: 'ADMIN',
    });
    expect(created.user.id).toBeDefined();

    const users = await onboardingService.discoverUsers();
    expect(users.candidates.length).toBeGreaterThanOrEqual(1);

    const firstUser = users.candidates.find((u) => u.username === 'trace_admin');
    expect(firstUser).toBeDefined();

    const relation = await systemPrisma.installationUser.findFirst({
      where: { installationId: install.id, userId: firstUser!.id },
    });
    expect(relation).toBeDefined();
  });

  it('Trace 7: READY & ERP LOAD -> Business endpoints execute once lifecycle reaches READY', async () => {
    const install = await installationService.getOrCreateInstallation();
    await systemPrisma.installation.update({
      where: { id: install.id },
      data: { lifecycleState: 'READY' },
    });

    const res = await request(app)
      .get('/api/stocks')
      .set('X-Profile-Id', 'Stavan');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
