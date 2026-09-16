-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "installationId" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL DEFAULT '3.0.0',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lifecycleState" TEXT NOT NULL DEFAULT 'NOT_INITIALIZED',
    "initializedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Installation_installationId_key" ON "Installation"("installationId");

-- CreateIndex
CREATE INDEX "Installation_status_idx" ON "Installation"("status");

-- CreateIndex
CREATE INDEX "Installation_lifecycleState_idx" ON "Installation"("lifecycleState");

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "installationId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'WINDOWS',
    "osVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Device_installationId_idx" ON "Device"("installationId");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Profile" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Profile" ADD COLUMN "lastValidatedAt" DATETIME;
