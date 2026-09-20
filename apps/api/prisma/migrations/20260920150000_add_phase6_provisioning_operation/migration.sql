-- Migration: 20260920150000_add_phase6_provisioning_operation
-- Creates ProvisioningOperation table and indices for durable Phase 6 idempotency and crash recovery

CREATE TABLE IF NOT EXISTS "ProvisioningOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileCode" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestHash" TEXT NOT NULL,
    "databaseId" TEXT,
    "profileId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "ProvisioningOperation_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProvisioningOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProvisioningOperation_operationId_key" ON "ProvisioningOperation"("operationId");
CREATE INDEX IF NOT EXISTS "ProvisioningOperation_installationId_idx" ON "ProvisioningOperation"("installationId");
CREATE INDEX IF NOT EXISTS "ProvisioningOperation_userId_idx" ON "ProvisioningOperation"("userId");
CREATE INDEX IF NOT EXISTS "ProvisioningOperation_profileCode_idx" ON "ProvisioningOperation"("profileCode");
CREATE INDEX IF NOT EXISTS "ProvisioningOperation_status_idx" ON "ProvisioningOperation"("status");
