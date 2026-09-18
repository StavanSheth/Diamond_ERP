const path = require('path');
const fs = require('fs');
const { PrismaClient } = require(path.resolve('apps/api/node_modules/@prisma/client'));

const targetDbs = [
  path.resolve('apps/api/Stavan.db'),
  path.resolve('apps/api/system.db'),
];

async function applyToDb(dbFilePath) {
  if (!fs.existsSync(dbFilePath)) {
    console.log(`Skipping non-existent DB: ${dbFilePath}`);
    return;
  }

  const normalized = dbFilePath.replace(/\\/g, '/');
  console.log(`Applying Phase 5 migration to: ${normalized}`);

  const prisma = new PrismaClient({
    datasources: {
      db: { url: 'file:' + normalized },
    },
  });

  try {
    // 1. Create BackupRecord table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BackupRecord" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "backupId" TEXT NOT NULL,
        "installationId" TEXT NOT NULL,
        "databaseId" TEXT NOT NULL,
        "profileId" TEXT,
        "sourcePath" TEXT NOT NULL,
        "backupPath" TEXT NOT NULL,
        "backupType" TEXT NOT NULL DEFAULT 'FULL',
        "schemaVersion" INTEGER NOT NULL DEFAULT 1,
        "applicationVersion" TEXT NOT NULL DEFAULT '3.0.0',
        "sizeBytes" INTEGER NOT NULL,
        "sha256" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "verifiedAt" DATETIME,
        "errorMessage" TEXT,
        CONSTRAINT "BackupRecord_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "BackupRecord_backupId_key" ON "BackupRecord"("backupId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BackupRecord_installationId_idx" ON "BackupRecord"("installationId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BackupRecord_databaseId_idx" ON "BackupRecord"("databaseId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BackupRecord_backupId_idx" ON "BackupRecord"("backupId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BackupRecord_status_idx" ON "BackupRecord"("status");`);
    console.log(`✔ BackupRecord table & indexes verified on ${path.basename(dbFilePath)}`);

    // 2. Create RestoreRecord table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RestoreRecord" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "restoreId" TEXT NOT NULL,
        "installationId" TEXT NOT NULL,
        "targetDatabaseId" TEXT NOT NULL,
        "targetProfileId" TEXT,
        "candidatePath" TEXT NOT NULL,
        "rollbackBackupPath" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "schemaVersion" INTEGER NOT NULL DEFAULT 1,
        "sha256" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" DATETIME,
        "errorMessage" TEXT,
        CONSTRAINT "RestoreRecord_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RestoreRecord_restoreId_key" ON "RestoreRecord"("restoreId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RestoreRecord_installationId_idx" ON "RestoreRecord"("installationId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RestoreRecord_restoreId_idx" ON "RestoreRecord"("restoreId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RestoreRecord_status_idx" ON "RestoreRecord"("status");`);
    console.log(`✔ RestoreRecord table & indexes verified on ${path.basename(dbFilePath)}`);

    // 3. Run WAL checkpoint
    await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  for (const db of targetDbs) {
    await applyToDb(db);
  }
  console.log('✔ Phase 5 migration script complete');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
