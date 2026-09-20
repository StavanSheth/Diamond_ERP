import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { databaseRegistryService } from '../modules/system/database/database-registry.service';
import { installationService } from '../modules/system/installation.service';
import { authService } from '../modules/auth/auth.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { getControlDbPath, getDatabaseTemplatePath, getDatabasesDir } from '../infrastructure/paths';
import { ConflictError } from '../errors';

describe('Phase 5 — Database Registration & User Association Security', () => {
  const scratchDir = path.resolve('apps/api/test-scratch-phase5-reg');
  let validDbPath: string;
  let testUserId: string;
  let inactiveUserId: string;

  beforeAll(async () => {
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    const templateDb = getDatabaseTemplatePath() || path.resolve(getDatabasesDir(), 'template.db');
    validDbPath = path.join(scratchDir, `phase5_valid_${Date.now()}.db`);
    fs.copyFileSync(templateDb, validDbPath);

    await installationService.getOrCreateInstallation();

    // Create an active test user
    const user = await authService.createUser(
      `p5_reg_user_${Date.now()}`,
      'Password123456!',
      'Phase5 Reg User',
      'ADMIN'
    );
    testUserId = user.id;

    // Create an inactive test user
    const inact = await authService.createUser(
      `p5_inact_user_${Date.now()}`,
      'Password123456!',
      'Phase5 Inact User',
      'VIEWER'
    );
    await systemPrisma.user.update({
      where: { id: inact.id },
      data: { isActive: false },
    });
    inactiveUserId = inact.id;
  });

  afterAll(() => {
    if (fs.existsSync(scratchDir)) {
      try {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('Database Registration Hardening', () => {
    it('blocks registering control database (system.db) as a customer database', async () => {
      const controlDb = getControlDbPath();
      await expect(
        databaseRegistryService.registerDatabase({
          rawPath: controlDb,
          displayName: 'Hacked System DB',
        })
      ).rejects.toThrow(/Cannot register internal control or template database/i);
    });

    it('blocks registering template database (template.db) as a customer database', async () => {
      const templateDb = getDatabaseTemplatePath() || path.resolve(getDatabasesDir(), 'template.db');
      await expect(
        databaseRegistryService.registerDatabase({
          rawPath: templateDb,
          displayName: 'Hacked Template DB',
        })
      ).rejects.toThrow(/Cannot register internal control or template database/i);
    });

    it('blocks registration when foreign installationId is provided', async () => {
      await expect(
        databaseRegistryService.registerDatabase({
          rawPath: validDbPath,
          installationId: 'foreign-install-id-999',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('registers valid database and produces DATABASE_REGISTERED audit event', async () => {
      const install = await installationService.getOrCreateInstallation();
      const reg = await databaseRegistryService.registerDatabase({
        rawPath: validDbPath,
        displayName: 'Verified Business DB',
        installationId: install.id,
      });

      expect(reg.databaseId).toBeDefined();
      expect(reg.status).toBe('ACTIVE');

      const audit = await systemPrisma.auditEvent.findFirst({
        where: {
          entityType: 'DatabaseRegistry',
          entityId: reg.databaseId,
          eventType: 'DATABASE_REGISTERED',
        },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('User Association & Disassociation Hardening', () => {
    it('blocks user association with a foreign installation ID', async () => {
      await expect(
        installationService.associateUser('foreign-install-uuid', testUserId)
      ).rejects.toThrow(ConflictError);
    });

    it('blocks associating inactive or deleted users', async () => {
      const install = await installationService.getOrCreateInstallation();
      await expect(
        installationService.associateUser(install.id, inactiveUserId)
      ).rejects.toThrow(ConflictError);
    });

    it('associates active user and produces USER_ASSOCIATED audit event', async () => {
      const install = await installationService.getOrCreateInstallation();
      const result = await installationService.associateUser(install.id, testUserId);

      expect(result.userId).toBe(testUserId);
      expect(result.installationId).toBe(install.id);

      const audit = await systemPrisma.auditEvent.findFirst({
        where: {
          entityType: 'InstallationUser',
          eventType: 'USER_ASSOCIATED',
        },
        orderBy: { performedAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.description).toContain(testUserId);
    });

    it('blocks user disassociation with a foreign installation ID', async () => {
      await expect(
        installationService.disassociateUser('foreign-install-uuid', testUserId)
      ).rejects.toThrow(ConflictError);
    });

    it('disassociates user safely without deleting user or database and produces USER_DISASSOCIATED audit event', async () => {
      const install = await installationService.getOrCreateInstallation();
      await installationService.disassociateUser(install.id, testUserId);

      // Verify user still exists in DB
      const userAfter = await systemPrisma.user.findUnique({ where: { id: testUserId } });
      expect(userAfter).not.toBeNull();

      const audit = await systemPrisma.auditEvent.findFirst({
        where: {
          entityType: 'InstallationUser',
          eventType: 'USER_DISASSOCIATED',
        },
        orderBy: { performedAt: 'desc' },
      });
      expect(audit).not.toBeNull();
    });
  });
});
