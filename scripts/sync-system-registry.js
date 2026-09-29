const crypto = require('crypto');
const path = require('path');
const { PrismaClient } = require(path.resolve('apps/api/node_modules/@prisma/client'));

const p1 = new PrismaClient({ datasources: { db: { url: 'file:' + path.resolve('apps/api/system.db').replace(/\\/g, '/') } } });
const localAppSysDb = path.join(process.env.LOCALAPPDATA || '', 'DiamondERP', 'system.db').replace(/\\/g, '/');
const p2 = new PrismaClient({ datasources: { db: { url: 'file:' + localAppSysDb } } });

async function sync(p, name) {
  let install = await p.installation.findFirst();
  if (!install) {
    install = await p.installation.create({
      data: {
        id: crypto.randomUUID(),
        installationId: crypto.randomUUID(),
        appVersion: '3.0.0',
        status: 'ACTIVE',
        lifecycleState: 'READY',
      }
    });
  }

  let prof = await p.profile.findFirst({ where: { code: 'Stavan' } });
  const canonicalDbPath = path.resolve(process.env.LOCALAPPDATA || '', 'DiamondERP', 'databases', 'Stavan.db');
  if (!prof) {
    prof = await p.profile.create({
      data: {
        id: crypto.randomUUID(),
        code: 'Stavan',
        name: 'Stavan',
        dbPath: canonicalDbPath,
        schemaVersion: 1,
        status: 'ACTIVE',
        isActive: true,
      }
    });
  }

  let user = await p.user.findFirst({ where: { username: 'stavan' } });
  if (!user) {
    user = await p.user.create({
      data: {
        id: crypto.randomUUID(),
        username: 'stavan',
        passwordHash: '$2b$12$fnFTe2mXQmnCgVtHiJ5gbuSFohATphx8QlCoJYiNqUaRVFauZGfFS',
        displayName: 'Stavan',
        role: 'SUPER_ADMIN',
        isActive: true,
      }
    });
  }

  let reg = await p.databaseRegistry.findFirst({ where: { profileId: prof.id } });
  if (!reg) {
    reg = await p.databaseRegistry.create({
      data: {
        id: crypto.randomUUID(),
        databaseId: crypto.randomUUID(),
        displayName: 'Stavan',
        canonicalPath: canonicalDbPath,
        schemaVersion: 1,
        status: 'ACTIVE',
        databaseType: 'LOCAL_PROFILE',
        profileId: prof.id,
        installationId: install.id,
      }
    });
  }
  console.log(name, 'synced. Reg:', reg.databaseId, 'Profile:', prof.code);
  await p.$disconnect();
}

async function main() {
  await sync(p1, 'apps/api/system.db');
  await sync(p2, 'LocalAppData/DiamondERP/system.db');
}

main().catch(console.error);
