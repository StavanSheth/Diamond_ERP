-- Migration: 20260916140000_add_database_registry_profile_relation
-- Adds index on DatabaseRegistry.profileId and documents referential link to Profile.id with ON DELETE SET NULL

CREATE INDEX IF NOT EXISTS "DatabaseRegistry_profileId_idx" ON "DatabaseRegistry"("profileId");
