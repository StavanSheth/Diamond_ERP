"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseDeletionService = exports.DatabaseDeletionService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../../../infrastructure/database/prisma");
const database_context_service_1 = require("../../../infrastructure/database/database-context.service");
const backup_service_1 = require("../backup/backup.service");
const logging_1 = require("../../../infrastructure/logging");
const paths_1 = require("../../../infrastructure/paths");
const errors_1 = require("../../../errors");
class DatabaseDeletionService {
    constructor() {
        this.deletionLocks = new Set();
    }
    /**
     * Authoritative, unified physical database deletion safety gate (Phase 4 / Section 3).
     *
     * Enforces:
     * 1. Resolution of exact DB from DatabaseRegistry (no guessing or bypassing)
     * 2. Validation of ownership & guards against system.db, template.db, and stavan.db
     * 3. Verified PROFILE_DELETE backup BEFORE any destructive action
     * 4. Complete backup verification required — aborts on any failure
     * 5. Closing active database handles
     * 6. Physical deletion of .db, -wal, -shm files
     * 7. Verification that files no longer exist on disk
     * 8. DatabaseRegistry removal or update to ORPHANED
     */
    async deletePhysicalDatabaseSafely(options) {
        const rawCode = options.profileCode || options.profileIdOrCode || '';
        if (!rawCode) {
            throw new errors_1.ValidationError('profileCode or profileIdOrCode is required for physical database deletion.');
        }
        const cleanCode = rawCode.trim();
        const deleteDatabaseFile = options.deleteDatabaseFile ?? (options.deleteMode === 'DELETE_DATABASE');
        const performedBy = options.performedBy || 'system';
        if (cleanCode.toLowerCase() === 'stavan') {
            throw new errors_1.ValidationError('The primary profile "Stavan" cannot be deleted.');
        }
        const forbiddenProfiles = new Set(['system', 'template', 'test']);
        if (forbiddenProfiles.has(cleanCode.toLowerCase())) {
            throw new errors_1.ValidationError(`Cannot delete reserved profile "${cleanCode}".`);
        }
        if (this.deletionLocks.has(cleanCode.toLowerCase())) {
            throw new errors_1.ConflictError(`A deletion operation is already in progress for profile "${cleanCode}".`);
        }
        this.deletionLocks.add(cleanCode.toLowerCase());
        try {
            // 1. Resolve Profile record in system.db
            const profile = await prisma_1.systemPrisma.profile.findFirst({
                where: { code: { equals: cleanCode } },
                include: { databaseRegistries: true, userProfiles: true },
            });
            if (!profile) {
                throw new errors_1.NotFoundError(`Profile "${cleanCode}" not found.`);
            }
            // 2. Resolve database context strictly via DatabaseContextService
            let canonicalDbFile = null;
            let registryRecord = null;
            try {
                const dbContext = await database_context_service_1.databaseContextService.getDatabaseForProfile(profile.id);
                canonicalDbFile = dbContext.canonicalPath;
                registryRecord = profile.databaseRegistries.find((r) => r.id === dbContext.databaseId || r.canonicalPath === dbContext.canonicalPath);
            }
            catch (ctxErr) {
                if (deleteDatabaseFile) {
                    throw new errors_1.ConflictError(`Cannot physically delete database for profile "${cleanCode}": Authoritative database context could not be verified (${ctxErr.message}). Physical deletion aborted.`);
                }
            }
            if (deleteDatabaseFile && (!canonicalDbFile || !registryRecord)) {
                throw new errors_1.ConflictError(`Cannot physically delete database for profile "${cleanCode}": Active authoritative registry was not found. Physical deletion aborted.`);
            }
            const deletedFiles = [];
            let backupId;
            let backupPath;
            if (deleteDatabaseFile && canonicalDbFile && fs_1.default.existsSync(canonicalDbFile)) {
                const lowerPath = canonicalDbFile.toLowerCase();
                const controlDb = path_1.default.resolve((0, paths_1.getControlDbPath)()).toLowerCase();
                const templateDb = (0, paths_1.getDatabaseTemplatePath)() ? path_1.default.resolve((0, paths_1.getDatabaseTemplatePath)()).toLowerCase() : '';
                const baseName = path_1.default.basename(canonicalDbFile).toLowerCase();
                // Safety guards
                if (lowerPath === controlDb || baseName === 'system.db') {
                    throw new errors_1.ConflictError('Cannot delete system control database (system.db).');
                }
                if (templateDb && (lowerPath === templateDb || baseName === 'template.db')) {
                    throw new errors_1.ConflictError('Cannot delete database template (template.db).');
                }
                if (baseName === 'stavan.db') {
                    throw new errors_1.ConflictError('Cannot physically delete the primary Stavan.db database file.');
                }
                // STEP 1: SAFETY GATE — Verified PROFILE_DELETE backup
                logging_1.logger.info(`[DatabaseDeletionService] Creating mandatory PROFILE_DELETE backup for "${canonicalDbFile}"`);
                const backupRecord = await backup_service_1.backupService.createBackup({
                    databasePath: canonicalDbFile,
                    backupType: 'PROFILE_DELETE',
                }, performedBy);
                if (!backupRecord || backupRecord.status !== 'VERIFIED') {
                    throw new Error(`Safety Gate Failure: PROFILE_DELETE backup was not verified for ${canonicalDbFile}. Deletion ABORTED.`);
                }
                backupId = backupRecord.backupId;
                backupPath = backupRecord.backupPath;
                logging_1.logger.info(`[DatabaseDeletionService] Safety backup verified: ${backupId}`);
                // STEP 2: Evict in-memory Prisma client
                (0, prisma_1.removeConfiguredProfile)(cleanCode);
                // STEP 3: Delete physical files (.db, -wal, -shm)
                try {
                    fs_1.default.unlinkSync(canonicalDbFile);
                    deletedFiles.push(canonicalDbFile);
                    const walPath = `${canonicalDbFile}-wal`;
                    if (fs_1.default.existsSync(walPath)) {
                        fs_1.default.unlinkSync(walPath);
                        deletedFiles.push(walPath);
                    }
                    const shmPath = `${canonicalDbFile}-shm`;
                    if (fs_1.default.existsSync(shmPath)) {
                        fs_1.default.unlinkSync(shmPath);
                        deletedFiles.push(shmPath);
                    }
                }
                catch (delErr) {
                    throw new Error(`Safety backup succeeded (${backupId}), but physical file deletion failed: ${delErr.message}`);
                }
                // STEP 4: Verify deletion
                if (fs_1.default.existsSync(canonicalDbFile)) {
                    throw new Error(`Physical deletion verification failed: ${canonicalDbFile} still exists on disk.`);
                }
                // STEP 5: Delete DatabaseRegistry entry
                if (registryRecord) {
                    await prisma_1.systemPrisma.databaseRegistry.delete({
                        where: { id: registryRecord.id },
                    }).catch(() => { });
                }
            }
            else if (!deleteDatabaseFile && registryRecord) {
                // Case A: Retain DB — explicitly mark ORPHANED / RECOVERABLE
                logging_1.logger.info(`[DatabaseDeletionService] Profile "${cleanCode}" deleted, physical DB retained as ORPHANED: ${registryRecord.canonicalPath}`);
                await prisma_1.systemPrisma.databaseRegistry.update({
                    where: { id: registryRecord.id },
                    data: {
                        status: 'ORPHANED',
                        profileId: null,
                    },
                }).catch(() => { });
                (0, prisma_1.removeConfiguredProfile)(cleanCode);
            }
            else {
                (0, prisma_1.removeConfiguredProfile)(cleanCode);
            }
            // Cleanup user profile associations and profile record
            await prisma_1.systemPrisma.userProfile.deleteMany({
                where: { profileId: profile.id },
            }).catch(() => { });
            await prisma_1.systemPrisma.profile.delete({
                where: { id: profile.id },
            }).catch(() => { });
            // Record audit event
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'PROFILE',
                    entityId: profile.id,
                    eventType: 'PROFILE_DELETED',
                    description: `Profile "${cleanCode}" deleted. Physical database ${deleteDatabaseFile ? 'deleted with verified backup' : 'retained as orphaned'}.`,
                    performedBy,
                    metadata: JSON.stringify({
                        profileCode: cleanCode,
                        databaseDeleted: deleteDatabaseFile,
                        backupId,
                        deletedFiles,
                    }),
                },
            }).catch(() => { });
            return {
                success: true,
                profileCode: cleanCode,
                databaseDeleted: deleteDatabaseFile,
                backupId,
                backupPath,
                deletedFiles,
                message: deleteDatabaseFile
                    ? `Profile "${cleanCode}" and physical database safely deleted with verified backup.`
                    : `Profile "${cleanCode}" removed, physical database preserved.`,
            };
        }
        finally {
            this.deletionLocks.delete(cleanCode.toLowerCase());
        }
    }
}
exports.DatabaseDeletionService = DatabaseDeletionService;
exports.databaseDeletionService = new DatabaseDeletionService();
//# sourceMappingURL=database-deletion.service.js.map