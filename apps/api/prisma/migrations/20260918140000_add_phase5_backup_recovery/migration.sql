-- Migration: 20260918140000_add_phase5_backup_recovery
-- Creates BackupRecord and RestoreRecord tables and indices

CREATE TABLE "BackupRecord" (
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

CREATE UNIQUE INDEX "BackupRecord_backupId_key" ON "BackupRecord"("backupId");
CREATE INDEX "BackupRecord_installationId_idx" ON "BackupRecord"("installationId");
CREATE INDEX "BackupRecord_databaseId_idx" ON "BackupRecord"("databaseId");
CREATE INDEX "BackupRecord_backupId_idx" ON "BackupRecord"("backupId");
CREATE INDEX "BackupRecord_status_idx" ON "BackupRecord"("status");

CREATE TABLE "RestoreRecord" (
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

CREATE UNIQUE INDEX "RestoreRecord_restoreId_key" ON "RestoreRecord"("restoreId");
CREATE INDEX "RestoreRecord_installationId_idx" ON "RestoreRecord"("installationId");
CREATE INDEX "RestoreRecord_restoreId_idx" ON "RestoreRecord"("restoreId");
CREATE INDEX "RestoreRecord_status_idx" ON "RestoreRecord"("status");
