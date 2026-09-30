import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import path from 'path';
import fs from 'fs';
import { systemPrisma, registerProfile } from '../infrastructure/database/prisma';
import { getDatabaseRoot, ensureAllDataDirs } from '../infrastructure/paths';

// Override the environment variable for tests
process.env.DATABASE_URL = 'file:./test.db';

export const prisma = new PrismaClient();

beforeAll(async () => {
  // Global setup handles pushing the schema.
  try {
    ensureAllDataDirs();
    const dbDir = getDatabaseRoot();
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const stavanDbPath = path.resolve(dbDir, 'Stavan.db');
    const templatePath = path.resolve(__dirname, '../../prisma/test.db');
    if (!fs.existsSync(stavanDbPath) && fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, stavanDbPath);
    } else if (!fs.existsSync(stavanDbPath)) {
      fs.writeFileSync(stavanDbPath, '');
    }

    // Clean up stale test database registries pointing to non-existent files
    const staleRegistries = await systemPrisma.databaseRegistry.findMany({});
    for (const reg of staleRegistries) {
      if (!fs.existsSync(reg.canonicalPath)) {
        await systemPrisma.databaseRegistry.delete({ where: { id: reg.id } }).catch(() => {});
      }
    }

    const install = await systemPrisma.installation.findFirst();
    const installId = install ? install.id : 'default-test-install';

    const prof = await systemPrisma.profile.upsert({
      where: { code: 'Stavan' },
      update: { isActive: true },
      create: {
        code: 'Stavan',
        name: 'Stavan',
        isActive: true,
      },
    });

    const existingReg = await systemPrisma.databaseRegistry.findFirst({
      where: { profileId: prof.id, status: 'ACTIVE' },
    });

    if (!existingReg) {
      // Ensure installation exists if we need to create one
      let effectiveInstallId = installId;
      if (!install) {
        const newInstall = await systemPrisma.installation.create({
          data: {
            installationId: 'test-install-id',
            appVersion: '3.0.0',
            status: 'ACTIVE',
            lifecycleState: 'READY',
          },
        });
        effectiveInstallId = newInstall.id;
      }

      await systemPrisma.databaseRegistry.create({
        data: {
          databaseId: 'test-stavan-db',
          displayName: 'Stavan Test Database',
          profileId: prof.id,
          installationId: effectiveInstallId,
          canonicalPath: stavanDbPath,
          status: 'ACTIVE',
          schemaVersion: 1,
        },
      });
    }

    registerProfile({
      code: 'Stavan',
      name: 'Stavan',
      dbPath: stavanDbPath,
    });
  } catch (err) {
    console.error('[setup.ts ERROR]', err);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
