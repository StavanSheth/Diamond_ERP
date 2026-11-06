"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseRegistryService = exports.DatabaseRegistryService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../../../infrastructure/database/prisma");
const paths_1 = require("../../../infrastructure/paths");
const database_path_util_1 = require("./database-path.util");
const database_validation_service_1 = require("./database-validation.service");
const installation_service_1 = require("../installation.service");
const logging_1 = require("../../../infrastructure/logging");
const errors_1 = require("../../../errors");
class DatabaseRegistryService {
    /**
     * Register a database file in the control registry.
     *
     * Invariants:
     * - Deduplication: If the canonical path is already registered, returns the existing record
     *   with its stable logical databaseId (never creates duplicate logical IDs for same file).
     * - Never renames or moves external databases.
     */
    async registerDatabase(input) {
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(input.rawPath);
        if (!pathResult.valid) {
            throw new errors_1.ValidationError(pathResult.error || 'Invalid database path');
        }
        const { canonicalPath } = pathResult;
        // Guard: Prevent control or template database from being registered as customer database
        const baseName = path_1.default.basename(canonicalPath).toLowerCase();
        const controlDbCanonical = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
        const templateDbPath = (0, paths_1.getDatabaseTemplatePath)();
        const templateCanonical = templateDbPath ? path_1.default.resolve(templateDbPath).toLowerCase() : null;
        if (baseName === 'system.db' ||
            baseName === 'template.db' ||
            baseName === 'system.sqlite' ||
            canonicalPath.toLowerCase() === controlDbCanonical ||
            (templateCanonical && canonicalPath.toLowerCase() === templateCanonical)) {
            throw new errors_1.ValidationError(`Cannot register internal control or template database "${baseName}" as a customer database.`);
        }
        const currentInstall = await installation_service_1.installationService.getOrCreateInstallation();
        if (input.installationId && input.installationId !== currentInstall.id && input.installationId !== currentInstall.installationId) {
            throw new errors_1.ConflictError('Cannot register database: Installation ID does not match current local installation.');
        }
        const installId = currentInstall.id;
        // Check if canonical path already registered
        const existing = await prisma_1.systemPrisma.databaseRegistry.findUnique({
            where: { canonicalPath },
        });
        if (existing) {
            if (existing.installationId && existing.installationId !== currentInstall.id) {
                throw new errors_1.ConflictError('Cannot register database: Database is already registered under another installation.');
            }
            // Re-verify file existence on disk
            const fileExists = fs_1.default.existsSync(canonicalPath);
            const effectiveStatus = fileExists ? existing.status : 'MISSING';
            if (effectiveStatus !== existing.status) {
                await prisma_1.systemPrisma.databaseRegistry.update({
                    where: { id: existing.id },
                    data: { status: effectiveStatus },
                });
            }
            return this.mapToDto({ ...existing, status: effectiveStatus });
        }
        // Verify profile exists if profileId is provided
        if (input.profileId) {
            const profile = await prisma_1.systemPrisma.profile.findUnique({
                where: { id: input.profileId },
            });
            if (!profile) {
                throw new errors_1.NotFoundError(`Profile not found for ID: ${input.profileId}`);
            }
        }
        // New database registration: validate structure to set initial status
        const validation = await database_validation_service_1.databaseValidationService.validateDatabase(canonicalPath);
        const databaseId = crypto_1.default.randomUUID();
        const displayName = input.displayName || canonicalPath.split(/[\\/]/).pop()?.replace(/\.db$/, '') || 'Database';
        try {
            const created = await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId,
                    displayName,
                    canonicalPath,
                    schemaVersion: validation.schemaVersion || 1,
                    status: validation.isValid ? 'ACTIVE' : validation.status,
                    databaseType: input.databaseType || (pathResult.isExternal ? 'EXTERNAL' : 'LOCAL_PROFILE'),
                    profileId: input.profileId || null,
                    installationId: installId,
                    lastValidatedAt: new Date(),
                },
            });
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'DatabaseRegistry',
                    entityId: created.databaseId,
                    eventType: 'DATABASE_REGISTERED',
                    description: `Registered database ${created.displayName} at ${canonicalPath}`,
                    performedBy: 'SYSTEM',
                    metadata: JSON.stringify({ databaseId: created.databaseId, canonicalPath, profileId: created.profileId }),
                },
            }).catch(() => { });
            logging_1.logger.info(`Registered database in control registry: ${created.displayName} [${created.databaseId}] -> ${canonicalPath}`);
            return this.mapToDto(created);
        }
        catch (err) {
            if (err?.code === 'P2002') {
                const raceExisting = await prisma_1.systemPrisma.databaseRegistry.findUnique({
                    where: { canonicalPath },
                });
                if (raceExisting) {
                    return this.mapToDto(raceExisting);
                }
            }
            throw err;
        }
    }
    /**
     * Look up a database by its logical databaseId.
     */
    async getDatabase(databaseId) {
        const record = await prisma_1.systemPrisma.databaseRegistry.findUnique({
            where: { databaseId },
        });
        if (!record) {
            throw new errors_1.NotFoundError(`Database registry entry not found for ID: ${databaseId}`);
        }
        // Live existence check
        if (!fs_1.default.existsSync(record.canonicalPath) && record.status !== 'MISSING') {
            const updated = await prisma_1.systemPrisma.databaseRegistry.update({
                where: { id: record.id },
                data: { status: 'MISSING' },
            });
            return this.mapToDto(updated);
        }
        return this.mapToDto(record);
    }
    /**
     * Look up a database by its canonical filesystem path.
     */
    async getDatabaseByPath(rawPath) {
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(rawPath);
        if (!pathResult.valid)
            return null;
        const record = await prisma_1.systemPrisma.databaseRegistry.findUnique({
            where: { canonicalPath: pathResult.canonicalPath },
        });
        return record ? this.mapToDto(record) : null;
    }
    /**
     * List all registered databases for an installation.
     */
    async listDatabases(installationId) {
        const where = installationId ? { installationId } : {};
        const records = await prisma_1.systemPrisma.databaseRegistry.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
        return records.map((r) => this.mapToDto(r));
    }
    /**
     * Update status of a registered database.
     */
    async updateDatabaseStatus(databaseId, status) {
        const record = await prisma_1.systemPrisma.databaseRegistry.update({
            where: { databaseId },
            data: {
                status,
                lastValidatedAt: new Date(),
            },
        });
        return this.mapToDto(record);
    }
    /**
     * Associate a registered database with an ERP profile.
     * Maintains referential safety: validates profile existence or accepts null to disassociate.
     */
    async associateWithProfile(databaseId, profileId) {
        if (profileId) {
            const profile = await prisma_1.systemPrisma.profile.findUnique({ where: { id: profileId } });
            if (!profile) {
                throw new errors_1.NotFoundError(`Profile not found for ID: ${profileId}`);
            }
        }
        const record = await prisma_1.systemPrisma.databaseRegistry.update({
            where: { databaseId },
            data: { profileId },
        });
        return this.mapToDto(record);
    }
    /**
     * Update the canonical path of an existing registered database (e.g. after a file move/rename).
     * Invariant: Logical databaseId remains completely independent of filesystem path changes.
     */
    async updateDatabasePath(databaseId, newRawPath) {
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(newRawPath);
        if (!pathResult.valid) {
            throw new errors_1.ValidationError(pathResult.error || 'Invalid database path');
        }
        const { canonicalPath } = pathResult;
        const existing = await prisma_1.systemPrisma.databaseRegistry.findUnique({
            where: { databaseId },
        });
        if (!existing) {
            throw new errors_1.NotFoundError(`Database registry entry not found for ID: ${databaseId}`);
        }
        // Validate new path does not collide with another profile
        const duplicateOwner = await prisma_1.systemPrisma.databaseRegistry.findFirst({
            where: {
                canonicalPath,
                NOT: { databaseId },
            },
            include: { profile: true },
        });
        if (duplicateOwner) {
            throw new errors_1.ConflictError(`Database ownership conflict: Path "${canonicalPath}" is already attached to profile "${duplicateOwner.profile?.code || duplicateOwner.profileId}". Two profiles cannot share the same database file.`);
        }
        // Validate new path
        const validation = await database_validation_service_1.databaseValidationService.validateDatabase(canonicalPath);
        const updated = await prisma_1.systemPrisma.databaseRegistry.update({
            where: { databaseId },
            data: {
                canonicalPath,
                status: validation.isValid ? 'ACTIVE' : validation.status,
                lastValidatedAt: new Date(),
            },
        });
        return this.mapToDto(updated);
    }
    /**
     * Provision a new profile database with filesystem + Control DB compensation.
     * Workflow:
     * 1. Register with status PENDING in Control DB.
     * 2. Provision physical file on disk from template.db.
     * 3. Validate physical database structure.
     * 4. Update status to ACTIVE if valid, or compensate/mark INVALID.
     * 5. If DB registration fails, roll back newly created physical file.
     */
    async provisionDatabase(input) {
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(input.rawPath);
        if (!pathResult.valid) {
            throw new errors_1.ValidationError(pathResult.error || 'Invalid database path');
        }
        const { canonicalPath } = pathResult;
        const fileExistedBefore = fs_1.default.existsSync(canonicalPath);
        if (input.profileId) {
            const profile = await prisma_1.systemPrisma.profile.findUnique({ where: { id: input.profileId } });
            if (!profile) {
                throw new errors_1.NotFoundError(`Profile not found for ID: ${input.profileId}`);
            }
        }
        // 1. Pre-register in Control DB with PENDING status
        const databaseId = crypto_1.default.randomUUID();
        const displayName = input.displayName || canonicalPath.split(/[\\/]/).pop()?.replace(/\.db$/, '') || 'Database';
        let regRecord;
        try {
            regRecord = await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId,
                    displayName,
                    canonicalPath,
                    schemaVersion: 1,
                    status: 'PENDING',
                    databaseType: pathResult.isExternal ? 'EXTERNAL' : 'LOCAL_PROFILE',
                    profileId: input.profileId || null,
                    installationId: input.installationId,
                },
            });
        }
        catch (err) {
            if (err?.code === 'P2002') {
                const existing = await prisma_1.systemPrisma.databaseRegistry.findUnique({
                    where: { canonicalPath },
                    include: { profile: true },
                });
                if (existing && existing.profileId && existing.profileId !== input.profileId) {
                    throw new errors_1.ConflictError(`Database path "${canonicalPath}" is already attached to profile "${existing.profile?.code || existing.profileId}". Two profiles cannot share the same database file.`);
                }
                if (existing)
                    return this.mapToDto(existing);
            }
            throw err;
        }
        // 2. Filesystem operation: copy from template.db if file does not exist
        let createdFile = false;
        try {
            if (!fs_1.default.existsSync(canonicalPath)) {
                (0, prisma_1.ensureProfileDbFile)(canonicalPath);
                createdFile = true;
            }
            // 3. Structural validation: ACTIVE requires physical validation
            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(canonicalPath);
            const updated = await prisma_1.systemPrisma.databaseRegistry.update({
                where: { id: regRecord.id },
                data: {
                    status: validation.isValid ? 'ACTIVE' : validation.status,
                    schemaVersion: validation.schemaVersion || 1,
                    lastValidatedAt: new Date(),
                },
            });
            return this.mapToDto(updated);
        }
        catch (fsErr) {
            // 4. Compensation: if filesystem or validation failed, clean up newly created file and update status
            if (createdFile && !fileExistedBefore && fs_1.default.existsSync(canonicalPath)) {
                try {
                    fs_1.default.unlinkSync(canonicalPath);
                }
                catch { }
            }
            await prisma_1.systemPrisma.databaseRegistry.update({
                where: { id: regRecord.id },
                data: { status: 'INVALID' },
            }).catch(() => { });
            throw fsErr;
        }
    }
    mapToDto(record) {
        return {
            id: record.id,
            databaseId: record.databaseId,
            displayName: record.displayName,
            canonicalPath: record.canonicalPath,
            schemaVersion: record.schemaVersion,
            status: record.status,
            databaseType: record.databaseType,
            profileId: record.profileId,
            installationId: record.installationId,
            lastValidatedAt: record.lastValidatedAt?.toISOString() || null,
            createdAt: record.createdAt.toISOString(),
            updatedAt: record.updatedAt.toISOString(),
        };
    }
}
exports.DatabaseRegistryService = DatabaseRegistryService;
exports.databaseRegistryService = new DatabaseRegistryService();
//# sourceMappingURL=database-registry.service.js.map