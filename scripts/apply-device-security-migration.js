const path = require('path');
const fs = require('fs');
const { PrismaClient } = require(path.resolve('apps/api/node_modules/@prisma/client'));

const localAppData = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
const localAppDir = path.join(localAppData, 'DiamondERP');

const targetDbs = [
  path.resolve('apps/api/Stavan.db'),
  path.resolve('apps/api/system.db'),
  path.resolve('apps/api/prisma/template.db'),
  path.join(localAppDir, 'system.db'),
];

if (fs.existsSync(path.join(localAppDir, 'databases'))) {
  const files = fs.readdirSync(path.join(localAppDir, 'databases'));
  for (const f of files) {
    if (f.endsWith('.db')) {
      targetDbs.push(path.join(localAppDir, 'databases', f));
    }
  }
}

async function applyToDb(dbFilePath) {
  if (!fs.existsSync(dbFilePath)) {
    console.log(`Skipping non-existent DB: ${dbFilePath}`);
    return;
  }

  const normalized = dbFilePath.replace(/\\/g, '/');
  console.log(`Applying DeviceSecurity migration to: ${normalized}`);

  const prisma = new PrismaClient({
    datasources: {
      db: { url: 'file:' + normalized },
    },
  });

  try {
    // 1. Create DeviceSecurity table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DeviceSecurity" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "deviceId" TEXT NOT NULL,
        "pinHash" TEXT,
        "pinConfiguredAt" DATETIME,
        "failedAttempts" INTEGER NOT NULL DEFAULT 0,
        "lockedUntil" DATETIME,
        "screenLockTimeoutMinutes" INTEGER NOT NULL DEFAULT 15,
        "lastUnlockedAt" DATETIME,
        "lastPinChangeAt" DATETIME,
        "isLocked" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DeviceSecurity_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("deviceId") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DeviceSecurity_deviceId_key" ON "DeviceSecurity"("deviceId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DeviceSecurity_deviceId_idx" ON "DeviceSecurity"("deviceId");`);

    // 2. Add lastAuthenticatedAt column to DeviceSecurity table if missing
    const secCols = await prisma.$queryRawUnsafe('PRAGMA table_info("DeviceSecurity")');
    if (secCols.length > 0 && !secCols.some((c) => c.name === 'lastAuthenticatedAt')) {
      await prisma.$executeRawUnsafe('ALTER TABLE "DeviceSecurity" ADD COLUMN "lastAuthenticatedAt" DATETIME;');
      console.log(`✔ Added lastAuthenticatedAt column to DeviceSecurity on ${path.basename(dbFilePath)}`);
    }

    // 3. Add deviceId column to Session table if missing
    const sessionCols = await prisma.$queryRawUnsafe('PRAGMA table_info("Session")');
    if (sessionCols.length > 0 && !sessionCols.some((c) => c.name === 'deviceId')) {
      await prisma.$executeRawUnsafe('ALTER TABLE "Session" ADD COLUMN "deviceId" TEXT;');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Session_deviceId_idx" ON "Session"("deviceId");');
      console.log(`✔ Added deviceId column to Session table on ${path.basename(dbFilePath)}`);
    }

    await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
    console.log(`✔ DeviceSecurity migration applied to ${path.basename(dbFilePath)}`);
  } catch (err) {
    console.error(`Migration error on ${dbFilePath}:`, err);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  for (const db of targetDbs) {
    await applyToDb(db);
  }
}

main().catch(console.error);
