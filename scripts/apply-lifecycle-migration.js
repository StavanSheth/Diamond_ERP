const path = require('path');
const { PrismaClient } = require(path.resolve('apps/api/node_modules/@prisma/client'));

const dbPath = path.resolve('apps/api/Stavan.db').replace(/\\/g, '/');
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'file:' + dbPath },
  },
});

async function main() {
  console.log('Applying lifecycle migration to:', dbPath);

  // 1. Create Installation table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Installation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "installationId" TEXT NOT NULL,
      "appVersion" TEXT NOT NULL DEFAULT '3.0.0',
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "lifecycleState" TEXT NOT NULL DEFAULT 'NOT_INITIALIZED',
      "initializedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Installation_installationId_key" ON "Installation"("installationId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Installation_status_idx" ON "Installation"("status");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Installation_lifecycleState_idx" ON "Installation"("lifecycleState");`);
  console.log('✔ Installation table & indexes verified');

  // 2. Create Device table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Device" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "installationId" TEXT NOT NULL,
      "deviceName" TEXT NOT NULL,
      "platform" TEXT NOT NULL DEFAULT 'WINDOWS',
      "osVersion" TEXT,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Device_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Device_installationId_idx" ON "Device"("installationId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Device_status_idx" ON "Device"("status");`);
  console.log('✔ Device table & indexes verified');

  // 3. User deletedAt column
  const userCols = await prisma.$queryRawUnsafe('PRAGMA table_info("User")');
  if (!userCols.some((c) => c.name === 'deletedAt')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "deletedAt" DATETIME;');
    console.log('✔ Added deletedAt column to User');
  }

  // 4. Profile schemaVersion, status, lastValidatedAt columns
  const profCols = await prisma.$queryRawUnsafe('PRAGMA table_info("Profile")');
  if (!profCols.some((c) => c.name === 'schemaVersion')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Profile" ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;');
    console.log('✔ Added schemaVersion column to Profile');
  }
  if (!profCols.some((c) => c.name === 'status')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Profile" ADD COLUMN "status" TEXT NOT NULL DEFAULT "ACTIVE";');
    console.log('✔ Added status column to Profile');
  }
  if (!profCols.some((c) => c.name === 'lastValidatedAt')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Profile" ADD COLUMN "lastValidatedAt" DATETIME;');
    console.log('✔ Added lastValidatedAt column to Profile');
  }

  // 5. Enhance Device with deviceId and revokedAt
  const devCols = await prisma.$queryRawUnsafe('PRAGMA table_info("Device")');
  if (!devCols.some((c) => c.name === 'deviceId')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Device" ADD COLUMN "deviceId" TEXT;');
    await prisma.$executeRawUnsafe('UPDATE "Device" SET "deviceId" = "id" WHERE "deviceId" IS NULL;');
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Device_deviceId_key" ON "Device"("deviceId");');
    console.log('✔ Added deviceId to Device');
  }
  if (!devCols.some((c) => c.name === 'revokedAt')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Device" ADD COLUMN "revokedAt" DATETIME;');
    console.log('✔ Added revokedAt to Device');
  }

  // 6. Create InstallationUser table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "InstallationUser" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "installationId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "InstallationUser_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "InstallationUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "InstallationUser_installationId_userId_key" ON "InstallationUser"("installationId", "userId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InstallationUser_installationId_idx" ON "InstallationUser"("installationId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InstallationUser_userId_idx" ON "InstallationUser"("userId");`);
  console.log('✔ InstallationUser table & indexes verified');

  // 7. Create DatabaseRegistry table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DatabaseRegistry" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "databaseId" TEXT NOT NULL,
      "displayName" TEXT NOT NULL,
      "canonicalPath" TEXT NOT NULL,
      "schemaVersion" INTEGER NOT NULL DEFAULT 1,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "databaseType" TEXT NOT NULL DEFAULT 'LOCAL_PROFILE',
      "profileId" TEXT,
      "installationId" TEXT NOT NULL,
      "lastValidatedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DatabaseRegistry_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DatabaseRegistry_databaseId_key" ON "DatabaseRegistry"("databaseId");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DatabaseRegistry_canonicalPath_key" ON "DatabaseRegistry"("canonicalPath");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DatabaseRegistry_installationId_idx" ON "DatabaseRegistry"("installationId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DatabaseRegistry_databaseId_idx" ON "DatabaseRegistry"("databaseId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DatabaseRegistry_status_idx" ON "DatabaseRegistry"("status");`);
  console.log('✔ DatabaseRegistry table & indexes verified');

  // 8. Run WAL checkpoint to ensure all changes are written into the main .db file
  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
  console.log('✔ WAL checkpoint complete on Stavan.db');

  await prisma.$disconnect();
  console.log('✔ Phase 2 migration successfully executed on Stavan.db');
}

main().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
