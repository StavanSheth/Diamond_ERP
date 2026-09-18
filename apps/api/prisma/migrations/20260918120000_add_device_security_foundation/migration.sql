-- Migration: 20260918120000_add_device_security_foundation
-- Adds DeviceSecurity table and deviceId to Session

CREATE TABLE "DeviceSecurity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "pinHash" TEXT,
    "pinConfiguredAt" DATETIME,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastAuthenticatedAt" DATETIME,
    "lastPinChangeAt" DATETIME,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceSecurity_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("deviceId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeviceSecurity_deviceId_key" ON "DeviceSecurity"("deviceId");
CREATE INDEX "DeviceSecurity_deviceId_idx" ON "DeviceSecurity"("deviceId");

-- Add deviceId column to Session table
ALTER TABLE "Session" ADD COLUMN "deviceId" TEXT;
CREATE INDEX "Session_deviceId_idx" ON "Session"("deviceId");
