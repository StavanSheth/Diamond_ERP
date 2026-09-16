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

  // 5. Run WAL checkpoint to ensure all changes are written into the main .db file
  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
  console.log('✔ WAL checkpoint complete on Stavan.db');

  await prisma.$disconnect();
  console.log('✔ Phase 2 migration successfully executed on Stavan.db');
}

main().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
