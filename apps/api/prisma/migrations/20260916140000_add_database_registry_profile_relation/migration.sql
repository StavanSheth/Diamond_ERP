-- Migration: 20260916140000_add_database_registry_profile_relation
-- Safely recreates DatabaseRegistry to add foreign key constraint to Profile.id with ON DELETE SET NULL

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DatabaseRegistry" (
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
    CONSTRAINT "DatabaseRegistry_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DatabaseRegistry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_DatabaseRegistry" ("id", "databaseId", "displayName", "canonicalPath", "schemaVersion", "status", "databaseType", "profileId", "installationId", "lastValidatedAt", "createdAt", "updatedAt")
SELECT "id", "databaseId", "displayName", "canonicalPath", "schemaVersion", "status", "databaseType", "profileId", "installationId", "lastValidatedAt", "createdAt", "updatedAt" FROM "DatabaseRegistry";

DROP TABLE "DatabaseRegistry";

ALTER TABLE "new_DatabaseRegistry" RENAME TO "DatabaseRegistry";

CREATE UNIQUE INDEX "DatabaseRegistry_databaseId_key" ON "DatabaseRegistry"("databaseId");
CREATE UNIQUE INDEX "DatabaseRegistry_canonicalPath_key" ON "DatabaseRegistry"("canonicalPath");
CREATE INDEX "DatabaseRegistry_installationId_idx" ON "DatabaseRegistry"("installationId");
CREATE INDEX "DatabaseRegistry_profileId_idx" ON "DatabaseRegistry"("profileId");
CREATE INDEX "DatabaseRegistry_databaseId_idx" ON "DatabaseRegistry"("databaseId");
CREATE INDEX "DatabaseRegistry_status_idx" ON "DatabaseRegistry"("status");

PRAGMA foreign_keys=ON;
