const path = require('path');
const fs = require('fs');
const { PrismaClient } = require(path.resolve('apps/api/node_modules/@prisma/client'));

const targetDbs = [
  path.resolve('apps/api/system.db'),
  path.resolve('apps/api/Stavan.db'),
  path.resolve('apps/api/prisma/template.db'),
  path.join(process.env.LOCALAPPDATA || '', 'DiamondERP', 'system.db'),
  path.join(process.env.LOCALAPPDATA || '', 'DiamondERP', 'databases', 'Stavan.db'),
];

async function applyToDb(dbFilePath) {
  if (!fs.existsSync(dbFilePath)) {
    console.log(`Skipping non-existent DB: ${dbFilePath}`);
    return;
  }

  const normalized = dbFilePath.replace(/\\/g, '/');
  console.log(`Applying Phase 7 migration to: ${normalized}`);

  const prisma = new PrismaClient({
    datasources: {
      db: { url: 'file:' + normalized },
    },
  });

  try {
    // 1. Create PreservationPackage table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PreservationPackage" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "packageId" TEXT NOT NULL,
        "installationId" TEXT NOT NULL,
        "databaseId" TEXT NOT NULL,
        "profileId" TEXT,
        "destinationPath" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "databaseBackupPath" TEXT,
        "csvExportPath" TEXT,
        "xlsxExportPath" TEXT,
        "manifestPath" TEXT,
        "manifestSha256" TEXT,
        "sizeBytes" INTEGER NOT NULL DEFAULT 0,
        "errorMessage" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "verifiedAt" DATETIME,
        "expiresAt" DATETIME,
        CONSTRAINT "PreservationPackage_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PreservationPackage_packageId_key" ON "PreservationPackage"("packageId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PreservationPackage_installationId_idx" ON "PreservationPackage"("installationId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PreservationPackage_packageId_idx" ON "PreservationPackage"("packageId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PreservationPackage_status_idx" ON "PreservationPackage"("status");`);
    console.log(`✔ PreservationPackage table & indexes verified on ${path.basename(dbFilePath)}`);

    // 2. Create UninstallAuthorization table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UninstallAuthorization" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "authorizationId" TEXT NOT NULL,
        "installationId" TEXT NOT NULL,
        "preservationPackageId" TEXT NOT NULL,
        "manifestSha256" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ISSUED',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" DATETIME NOT NULL,
        "consumedAt" DATETIME,
        CONSTRAINT "UninstallAuthorization_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "UninstallAuthorization_preservationPackageId_fkey" FOREIGN KEY ("preservationPackageId") REFERENCES "PreservationPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "UninstallAuthorization_authorizationId_key" ON "UninstallAuthorization"("authorizationId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UninstallAuthorization_installationId_idx" ON "UninstallAuthorization"("installationId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UninstallAuthorization_authorizationId_idx" ON "UninstallAuthorization"("authorizationId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UninstallAuthorization_status_idx" ON "UninstallAuthorization"("status");`);
    console.log(`✔ UninstallAuthorization table & indexes verified on ${path.basename(dbFilePath)}`);

    // 3. Create ExportRecord table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ExportRecord" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "exportId" TEXT NOT NULL,
        "installationId" TEXT NOT NULL,
        "databaseId" TEXT NOT NULL,
        "format" TEXT NOT NULL DEFAULT 'CSV',
        "destinationPath" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "sizeBytes" INTEGER NOT NULL DEFAULT 0,
        "sha256" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "verifiedAt" DATETIME
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ExportRecord_exportId_key" ON "ExportRecord"("exportId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExportRecord_installationId_idx" ON "ExportRecord"("installationId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExportRecord_exportId_idx" ON "ExportRecord"("exportId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ExportRecord_status_idx" ON "ExportRecord"("status");`);
    console.log(`✔ ExportRecord table & indexes verified on ${path.basename(dbFilePath)}`);

    // 4. Run WAL checkpoint
    await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  for (const db of targetDbs) {
    await applyToDb(db);
  }
  console.log('✔ Phase 7 migration complete');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
