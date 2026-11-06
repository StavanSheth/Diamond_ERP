import { PrismaClient } from '@prisma/client';
export interface ProfileDatabaseContext {
    profileId: string;
    profileCode: string;
    profileName: string;
    databaseId: string;
    canonicalPath: string;
    status: string;
    schemaVersion: number;
}
/**
 * Authoritative Database Context Service (SSOT)
 *
 * Implements the mandatory architecture:
 *   ONE PROFILE <-> ONE PHYSICAL .DB FILE
 *
 * Enforces ownership invariants:
 *  - Profile.code is unique
 *  - Profile.id is unique
 *  - DatabaseRegistry.databaseId is unique
 *  - DatabaseRegistry.canonicalPath is unique
 *  - A physical database path can belong to ONLY ONE Profile
 *  - A Profile can point to ONLY ONE active physical database
 *  - A database cannot be simultaneously ACTIVE for two profiles
 *  - A database cannot be attached to a second profile
 *  - No arbitrary fallback to 'Stavan.db', 'first active database', or directory scans
 */
export declare class DatabaseContextService {
    /**
     * Sync in-memory prisma configured profiles strictly with system.db (authoritative SSOT).
     * Invariant C: Never search for <profileCode>.db when DatabaseRegistry is missing.
     */
    syncProfilesFromSystemDb(): Promise<void>;
    /**
     * Authoritative validation of business database context (Section 1.E).
     * Rejects: system.db, template.db, missing file, non-canonical path, duplicate ownership,
     * multiple active DBs, profile without active registry.
     */
    assertValidBusinessDatabaseContext(profileIdOrCode: string): Promise<ProfileDatabaseContext>;
    /**
     * Resolve authoritative database context for a profile by profile ID.
     */
    getDatabaseForProfile(profileId: string): Promise<ProfileDatabaseContext>;
    /**
     * Resolve authoritative database context for a profile by profile code.
     */
    getDatabaseForProfileCode(profileCode: string): Promise<ProfileDatabaseContext>;
    /**
     * Resolve authoritative database context for the active request's profile.
     * Fails closed if no profile context is established.
     */
    getActiveProfileDatabase(): Promise<ProfileDatabaseContext>;
    /**
     * Resolve authoritative database context for a profile by profile ID or profile code.
     */
    resolveDatabaseContext(profileIdOrCode: string): Promise<ProfileDatabaseContext>;
    /**
     * Validate that a database belongs strictly to the specified profile.
     * Supports databaseId or canonicalPath.
     */
    assertDatabaseOwnership(profileId: string, databaseIdOrPath: string): Promise<void>;
    /**
     * Validate that a physical database path is available for registration/use by a given profile.
     * Rejects system.db, template.db, and paths attached to other profiles.
     */
    assertDatabasePathAvailable(rawPath: string, excludeDatabaseId?: string): Promise<string>;
    /**
     * Run full health validation on a profile's database.
     */
    validateProfileDatabase(profileId: string): Promise<import("@diamond-erp/contracts").DatabaseValidationResultDto>;
    /**
     * Get Prisma client for a profile.
     */
    getClientForProfile(profileCodeOrId: string): PrismaClient;
    /**
     * Get Prisma client for the active profile in request context.
     */
    getClientForActiveProfile(): PrismaClient;
    /**
     * Disconnect all active profile clients and control client.
     */
    disconnectAll(): Promise<void>;
}
export declare const databaseContextService: DatabaseContextService;
//# sourceMappingURL=database-context.service.d.ts.map