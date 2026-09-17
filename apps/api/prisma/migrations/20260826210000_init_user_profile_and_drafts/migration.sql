-- Migration: 20260826210000_init_user_profile_and_drafts
-- Base pre-Phase-2 models for User, Profile, UserProfile, Sessions, Sequences, Idempotency, Drafts and Audit

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dbPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "TransformationProvenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transformationId" TEXT NOT NULL,
    "diamondItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "TransformationProvenance_transformationId_fkey" FOREIGN KEY ("transformationId") REFERENCES "ItemTransformation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransformationProvenance_diamondItemId_fkey" FOREIGN KEY ("diamondItemId") REFERENCES "DiamondItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DocumentDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftNumber" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "latestRevisionId" TEXT,
    "ledgerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME
);

CREATE TABLE "DraftRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionNumber" INTEGER NOT NULL,
    "draftId" TEXT NOT NULL,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "snapshot" TEXT NOT NULL,
    "changeSet" TEXT,
    "changeSummary" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,
    "sessionId" TEXT,
    CONSTRAINT "DraftRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DocumentDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RecordVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "versionType" TEXT NOT NULL,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "snapshot" TEXT NOT NULL,
    "changeSet" TEXT,
    "changeSummary" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "deviceId" TEXT,
    "sessionId" TEXT,
    "parentVersionId" TEXT,
    "restoredFromVersionId" TEXT,
    CONSTRAINT "RecordVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "RecordVersion" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "RecordVersion_restoredFromVersionId_fkey" FOREIGN KEY ("restoredFromVersionId") REFERENCES "RecordVersion" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "VersionChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordVersionId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "valueBefore" TEXT,
    "valueAfter" TEXT,
    CONSTRAINT "VersionChange_recordVersionId_fkey" FOREIGN KEY ("recordVersionId") REFERENCES "RecordVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT,
    "metadata" TEXT,
    "performedBy" TEXT NOT NULL,
    "performedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "sessionId" TEXT
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_role_idx" ON "User"("role");

CREATE UNIQUE INDEX "Profile_code_key" ON "Profile"("code");

CREATE UNIQUE INDEX "UserProfile_userId_profileId_key" ON "UserProfile"("userId", "profileId");
CREATE INDEX "UserProfile_userId_idx" ON "UserProfile"("userId");
CREATE INDEX "UserProfile_profileId_idx" ON "UserProfile"("profileId");

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE UNIQUE INDEX "IdempotencyKey_userId_profileId_key_key" ON "IdempotencyKey"("userId", "profileId", "key");
CREATE INDEX "IdempotencyKey_userId_idx" ON "IdempotencyKey"("userId");
CREATE INDEX "IdempotencyKey_profileId_idx" ON "IdempotencyKey"("profileId");
CREATE INDEX "IdempotencyKey_profileId_key_idx" ON "IdempotencyKey"("profileId", "key");
CREATE INDEX "IdempotencyKey_key_idx" ON "IdempotencyKey"("key");
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

CREATE UNIQUE INDEX "TransformationProvenance_transformationId_diamondItemId_role_key" ON "TransformationProvenance"("transformationId", "diamondItemId", "role");

CREATE UNIQUE INDEX "DocumentDraft_draftNumber_key" ON "DocumentDraft"("draftNumber");
CREATE INDEX "DocumentDraft_entityType_idx" ON "DocumentDraft"("entityType");
CREATE INDEX "DocumentDraft_status_idx" ON "DocumentDraft"("status");
CREATE INDEX "DocumentDraft_createdBy_idx" ON "DocumentDraft"("createdBy");

CREATE UNIQUE INDEX "DraftRevision_draftId_revisionNumber_key" ON "DraftRevision"("draftId", "revisionNumber");
CREATE INDEX "DraftRevision_draftId_idx" ON "DraftRevision"("draftId");

CREATE UNIQUE INDEX "RecordVersion_entityType_entityId_versionNumber_key" ON "RecordVersion"("entityType", "entityId", "versionNumber");
CREATE INDEX "RecordVersion_entityType_entityId_idx" ON "RecordVersion"("entityType", "entityId");
CREATE INDEX "RecordVersion_versionType_idx" ON "RecordVersion"("versionType");
CREATE INDEX "RecordVersion_createdAt_idx" ON "RecordVersion"("createdAt");

CREATE INDEX "VersionChange_recordVersionId_idx" ON "VersionChange"("recordVersionId");

CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");
CREATE INDEX "AuditEvent_performedAt_idx" ON "AuditEvent"("performedAt");
