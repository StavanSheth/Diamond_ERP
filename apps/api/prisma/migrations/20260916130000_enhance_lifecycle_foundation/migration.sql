-- Migration: 20260916130000_enhance_lifecycle_foundation
-- Enhances lifecycle foundation with stable deviceId, InstallationUser, and DatabaseRegistry

-- 1. AlterTable Device
ALTER TABLE "Device" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "Device" ADD COLUMN "revokedAt" DATETIME;

-- Backfill deviceId for any existing device records
UPDATE "Device" SET "deviceId" = "id" WHERE "deviceId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Device_deviceId_key" ON "Device"("deviceId");

-- 2. CreateTable InstallationUser
CREATE TABLE IF NOT EXISTS "InstallationUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "installationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstallationUser_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstallationUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "InstallationUser_installationId_userId_key" ON "InstallationUser"("installationId", "userId");
CREATE INDEX IF NOT EXISTS "InstallationUser_installationId_idx" ON "InstallationUser"("installationId");
CREATE INDEX IF NOT EXISTS "InstallationUser_userId_idx" ON "InstallationUser"("userId");

-- 3. CreateTable DatabaseRegistry
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

CREATE UNIQUE INDEX IF NOT EXISTS "DatabaseRegistry_databaseId_key" ON "DatabaseRegistry"("databaseId");
CREATE UNIQUE INDEX IF NOT EXISTS "DatabaseRegistry_canonicalPath_key" ON "DatabaseRegistry"("canonicalPath");
CREATE INDEX IF NOT EXISTS "DatabaseRegistry_installationId_idx" ON "DatabaseRegistry"("installationId");
CREATE INDEX IF NOT EXISTS "DatabaseRegistry_databaseId_idx" ON "DatabaseRegistry"("databaseId");
CREATE INDEX IF NOT EXISTS "DatabaseRegistry_status_idx" ON "DatabaseRegistry"("status");
