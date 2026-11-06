"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseContextService = exports.DatabaseContextService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("./prisma");
const database_path_util_1 = require("../../modules/system/database/database-path.util");
const database_validation_service_1 = require("../../modules/system/database/database-validation.service");
const errors_1 = require("../../errors");
const logging_1 = require("../logging");
const paths_1 = require("../paths");
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
class DatabaseContextService {
    /**
     * Sync in-memory prisma configured profiles strictly with system.db (authoritative SSOT).
     * Invariant C: Never search for <profileCode>.db when DatabaseRegistry is missing.
     */
    async syncProfilesFromSystemDb() {
        try {
            const activeProfiles = await prisma_1.systemPrisma.profile.findMany({
                where: { isActive: true },
                include: {
                    databaseRegistries: {
                        where: { status: 'ACTIVE' },
                    },
                },
            });
            for (const prof of activeProfiles) {
                if (!prof.databaseRegistries || prof.databaseRegistries.length === 0) {
                    logging_1.logger.warn(`[DatabaseContextService] Lifecycle notice: Profile "${prof.code}" has no active registered DatabaseRegistry. Guessing DB path is forbidden.`);
                    continue;
                }
                if (prof.databaseRegistries.length > 1) {
                    logging_1.logger.warn(`[DatabaseContextService] Lifecycle error: Profile "${prof.code}" is mapped to ${prof.databaseRegistries.length} active databases. Expected exactly one.`);
                    continue;
                }
                const canonicalDbPath = prof.databaseRegistries[0].canonicalPath;
                if (canonicalDbPath && fs_1.default.existsSync(canonicalDbPath)) {
                    try {
                        (0, prisma_1.registerProfile)({
                            code: prof.code,
                            name: prof.name,
                            dbPath: canonicalDbPath,
                        });
                    }
                    catch {
                        // Profile may already be registered
                    }
                }
                else {
                    logging_1.logger.warn(`[DatabaseContextService] Physical DB file missing on disk for active profile "${prof.code}": "${canonicalDbPath}"`);
                }
            }
        }
        catch (err) {
            logging_1.logger.warn(`[DatabaseContextService] Error syncing profiles from system.db: ${err.message}`);
        }
    }
    /**
     * Authoritative validation of business database context (Section 1.E).
     * Rejects: system.db, template.db, missing file, non-canonical path, duplicate ownership,
     * multiple active DBs, profile without active registry.
     */
    async assertValidBusinessDatabaseContext(profileIdOrCode) {
        if (!profileIdOrCode || !profileIdOrCode.trim()) {
            throw new errors_1.ValidationError('Profile identifier is required to validate database context.');
        }
        const clean = profileIdOrCode.trim();
        const profile = await prisma_1.systemPrisma.profile.findFirst({
            where: {
                OR: [
                    { id: clean },
                    { code: { equals: clean } },
                ],
            },
            include: {
                databaseRegistries: true,
            },
        });
        if (!profile) {
            throw new errors_1.NotFoundError(`Profile not found for identifier: "${clean}"`);
        }
        if (!profile.isActive) {
            throw new errors_1.ConflictError(`Profile "${profile.code}" is not active.`);
        }
        const activeRegistries = (profile.databaseRegistries || []).filter((r) => r.status === 'ACTIVE');
        // Invariant D: Exactly one active registry per profile
        if (activeRegistries.length === 0) {
            throw new errors_1.NotFoundError(`Database lifecycle error: Profile "${profile.code}" (${profile.id}) exists but has no active registered DatabaseRegistry entry. Silent database path inference is forbidden.`);
        }
        if (activeRegistries.length > 1) {
            throw new errors_1.ConflictError(`Database ownership conflict: Profile "${profile.code}" (${profile.id}) is mapped to ${activeRegistries.length} active databases. Expected exactly one.`);
        }
        const targetRegistry = activeRegistries[0];
        // Invariant: Registry must belong to this profile
        if (!targetRegistry.profileId || targetRegistry.profileId !== profile.id) {
            throw new errors_1.ConflictError(`Database ownership conflict: Registry entry "${targetRegistry.databaseId}" is not attached to profile "${profile.id}".`);
        }
        if (!targetRegistry.databaseId) {
            throw new errors_1.ConflictError(`Database registry record is missing a stable databaseId.`);
        }
        // Canonical path validation
        const pathRes = (0, database_path_util_1.canonicalizeDatabasePath)(targetRegistry.canonicalPath);
        if (!pathRes.valid) {
            throw new errors_1.ValidationError(`Non-canonical database path in registry: ${pathRes.error}`);
        }
        const canonicalPath = pathRes.canonicalPath;
        // Physical file must exist
        if (!fs_1.default.existsSync(canonicalPath)) {
            throw new errors_1.NotFoundError(`Database file is missing on disk for profile "${profile.code}": "${canonicalPath}".`);
        }
        // Invariant: Reject internal control & template databases as business databases
        const controlDb = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)() ? path_1.default.resolve((0, paths_1.getDatabaseTemplatePath)()).toLowerCase() : '';
        const lowerPath = canonicalPath.toLowerCase();
        if (lowerPath === controlDb) {
            throw new errors_1.ConflictError('Cannot use system control database (system.db) as a profile business database.');
        }
        if (templateDb && lowerPath === templateDb) {
            throw new errors_1.ConflictError('Cannot use template database (template.db) as a profile business database.');
        }
        // Invariant E: A physical database path can belong to ONLY ONE Profile
        const conflictingRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({
            where: {
                canonicalPath,
                NOT: { profileId: profile.id },
            },
            include: { profile: true },
        });
        if (conflictingRegistries.length > 0) {
            const conflict = conflictingRegistries[0];
            throw new errors_1.ConflictError(`Database ownership conflict: Path "${canonicalPath}" is already attached to profile "${conflict.profile?.code || conflict.profileId}". Two profiles cannot share the same database file.`);
        }
        return {
            profileId: profile.id,
            profileCode: profile.code,
            profileName: profile.name,
            databaseId: targetRegistry.databaseId,
            canonicalPath,
            status: targetRegistry.status || 'ACTIVE',
            schemaVersion: targetRegistry.schemaVersion || profile.schemaVersion || 1,
        };
    }
    /**
     * Resolve authoritative database context for a profile by profile ID.
     */
    async getDatabaseForProfile(profileId) {
        return this.assertValidBusinessDatabaseContext(profileId);
    }
    /**
     * Resolve authoritative database context for a profile by profile code.
     */
    async getDatabaseForProfileCode(profileCode) {
        return this.assertValidBusinessDatabaseContext(profileCode);
    }
    /**
     * Resolve authoritative database context for the active request's profile.
     * Fails closed if no profile context is established.
     */
    async getActiveProfileDatabase() {
        let activeProfileCode;
        try {
            activeProfileCode = (0, prisma_1.getActiveProfile)();
        }
        catch {
            activeProfileCode = (0, prisma_1.getActiveProfileOrDefault)();
        }
        if (!activeProfileCode) {
            throw new errors_1.ConflictError('No active profile context could be established. Business database resolution requires an active profile.');
        }
        return this.getDatabaseForProfileCode(activeProfileCode);
    }
    /**
     * Resolve authoritative database context for a profile by profile ID or profile code.
     */
    async resolveDatabaseContext(profileIdOrCode) {
        return this.assertValidBusinessDatabaseContext(profileIdOrCode);
    }
    /**
     * Validate that a database belongs strictly to the specified profile.
     * Supports databaseId or canonicalPath.
     */
    async assertDatabaseOwnership(profileId, databaseIdOrPath) {
        const isPath = databaseIdOrPath.includes(path_1.default.sep) || databaseIdOrPath.endsWith('.db');
        let registry = null;
        if (isPath) {
            const canonical = path_1.default.resolve(databaseIdOrPath).toLowerCase();
            const allRegs = await prisma_1.systemPrisma.databaseRegistry.findMany();
            registry = allRegs.find((r) => r.canonicalPath && path_1.default.resolve(r.canonicalPath).toLowerCase() === canonical);
        }
        else {
            registry = await prisma_1.systemPrisma.databaseRegistry.findUnique({
                where: { databaseId: databaseIdOrPath },
            });
        }
        if (!registry) {
            throw new errors_1.NotFoundError(`Database not found for identifier: "${databaseIdOrPath}"`);
        }
        if (!registry.profileId || registry.profileId !== profileId) {
            throw new errors_1.ConflictError(`Database ownership conflict: Database "${databaseIdOrPath}" is not owned by profile "${profileId}".`);
        }
    }
    /**
     * Validate that a physical database path is available for registration/use by a given profile.
     * Rejects system.db, template.db, and paths attached to other profiles.
     */
    async assertDatabasePathAvailable(rawPath, excludeDatabaseId) {
        const pathRes = (0, database_path_util_1.canonicalizeDatabasePath)(rawPath);
        if (!pathRes.valid) {
            throw new errors_1.ValidationError(pathRes.error || 'Invalid database path');
        }
        const { canonicalPath } = pathRes;
        const controlDb = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)() ? path_1.default.resolve((0, paths_1.getDatabaseTemplatePath)()).toLowerCase() : '';
        const lowerPath = canonicalPath.toLowerCase();
        if (lowerPath === controlDb) {
            throw new errors_1.ConflictError('Cannot use system control database (system.db) as a profile business database.');
        }
        if (templateDb && lowerPath === templateDb) {
            throw new errors_1.ConflictError('Cannot use template database (template.db) as a profile business database.');
        }
        const allRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({
            include: { profile: true },
        });
        const conflict = allRegistries.find((r) => r.databaseId !== excludeDatabaseId && r.canonicalPath && path_1.default.resolve(r.canonicalPath).toLowerCase() === lowerPath);
        if (conflict && conflict.profileId) {
            throw new errors_1.ConflictError(`Database path "${canonicalPath}" is already attached to profile "${conflict.profile?.code || conflict.profileId}".`);
        }
        return canonicalPath;
    }
    /**
     * Run full health validation on a profile's database.
     */
    async validateProfileDatabase(profileId) {
        const ctx = await this.getDatabaseForProfile(profileId);
        return database_validation_service_1.databaseValidationService.validateDatabase(ctx.canonicalPath);
    }
    /**
     * Get Prisma client for a profile.
     */
    getClientForProfile(profileCodeOrId) {
        return (0, prisma_1.getClientForProfile)(profileCodeOrId);
    }
    /**
     * Get Prisma client for the active profile in request context.
     */
    getClientForActiveProfile() {
        const activeProfile = (0, prisma_1.getActiveProfile)();
        return (0, prisma_1.getClientForProfile)(activeProfile);
    }
    /**
     * Disconnect all active profile clients and control client.
     */
    async disconnectAll() {
        await (0, prisma_1.disconnectAllClients)();
    }
}
exports.DatabaseContextService = DatabaseContextService;
exports.databaseContextService = new DatabaseContextService();
//# sourceMappingURL=database-context.service.js.map