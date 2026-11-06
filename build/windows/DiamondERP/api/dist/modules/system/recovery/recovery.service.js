"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoveryService = exports.RecoveryService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../infrastructure/database/prisma");
const paths_1 = require("../../../infrastructure/paths");
const database_path_util_1 = require("../database/database-path.util");
const database_validation_service_1 = require("../database/database-validation.service");
const schema_compatibility_service_1 = require("../database/schema-compatibility.service");
const installation_service_1 = require("../installation.service");
const backup_service_1 = require("../backup/backup.service");
const errors_1 = require("../../../errors");
const logging_1 = require("../../../infrastructure/logging");
class RecoveryService {
    constructor() {
        this.activeRestoreLocks = new Set();
    }
    /**
     * Resolves ownership status and previous owner metadata for recovery candidates.
     */
    async resolveOwnership(canonical, manifest, currentInstall) {
        let ownershipStatus = 'UNKNOWN_SOURCE';
        let previousOwnerUsername = null;
        let previousOwnerDisplayName = null;
        // 1. Check database registry and profiles directly or via backup record / manifest
        let resolvedProfileId = null;
        let sourceDbPath = null;
        if (manifest?.databases && Array.isArray(manifest.databases)) {
            const matched = manifest.databases.find((d) => (d.backupPath && path_1.default.resolve(d.backupPath) === canonical) ||
                (d.canonicalPath && path_1.default.resolve(d.canonicalPath) === canonical));
            if (matched) {
                if (matched.profileId)
                    resolvedProfileId = matched.profileId;
                if (matched.canonicalPath)
                    sourceDbPath = path_1.default.resolve(matched.canonicalPath);
                if (matched.username)
                    previousOwnerUsername = matched.username;
            }
        }
        else if (manifest?.database) {
            if (manifest.database.profileId)
                resolvedProfileId = manifest.database.profileId;
            if (manifest.database.sourcePath)
                sourceDbPath = path_1.default.resolve(manifest.database.sourcePath);
        }
        // Check if canonical candidate is a recorded backup
        const backupRecord = await prisma_1.systemPrisma.backupRecord.findFirst({
            where: { backupPath: canonical },
        });
        if (backupRecord) {
            if (!resolvedProfileId && backupRecord.profileId)
                resolvedProfileId = backupRecord.profileId;
            if (!sourceDbPath && backupRecord.sourcePath)
                sourceDbPath = path_1.default.resolve(backupRecord.sourcePath);
        }
        const reg = await prisma_1.systemPrisma.databaseRegistry.findFirst({
            where: {
                OR: [
                    { canonicalPath: canonical },
                    ...(sourceDbPath ? [{ canonicalPath: sourceDbPath }] : []),
                    ...(resolvedProfileId ? [{ profileId: resolvedProfileId }] : []),
                ],
            },
            include: {
                profile: {
                    include: {
                        userProfiles: {
                            include: { user: true },
                        },
                    },
                },
            },
        });
        const profile = reg?.profile ||
            (resolvedProfileId || sourceDbPath
                ? await prisma_1.systemPrisma.profile.findFirst({
                    where: {
                        OR: [
                            ...(resolvedProfileId ? [{ id: resolvedProfileId }] : []),
                            ...(sourceDbPath ? [{ dbPath: sourceDbPath }] : []),
                            { dbPath: canonical },
                        ],
                    },
                    include: {
                        userProfiles: {
                            include: { user: true },
                        },
                    },
                })
                : null);
        if (profile) {
            const activeUsers = profile.userProfiles.filter((up) => up.isActive && up.user.isActive && !up.user.deletedAt);
            const deletedUsers = profile.userProfiles.filter((up) => !up.isActive || !up.user.isActive || up.user.deletedAt);
            if (activeUsers.length === 0 && deletedUsers.length > 0) {
                ownershipStatus = 'DELETED_USER';
                previousOwnerUsername = deletedUsers[0].user.username;
                previousOwnerDisplayName = deletedUsers[0].user.displayName;
                return { ownershipStatus, previousOwnerUsername, previousOwnerDisplayName };
            }
        }
        // 3. Installation match
        if (manifest?.installationId) {
            if (manifest.installationId === currentInstall.installationId) {
                ownershipStatus = 'CURRENT_INSTALLATION';
            }
            else {
                ownershipStatus = 'PREVIOUS_INSTALLATION';
            }
        }
        else if (reg) {
            if (reg.installationId === currentInstall.id) {
                ownershipStatus = 'CURRENT_INSTALLATION';
            }
            else {
                ownershipStatus = 'PREVIOUS_INSTALLATION';
            }
        }
        else {
            const databasesDir = (0, paths_1.getDatabasesDir)().toLowerCase();
            const backupsDir = (0, paths_1.getBackupsDir)().toLowerCase();
            const candidateDir = path_1.default.dirname(canonical).toLowerCase();
            if (candidateDir === databasesDir || candidateDir === backupsDir) {
                ownershipStatus = 'UNKNOWN_SOURCE';
            }
            else {
                ownershipStatus = 'EXTERNAL_SOURCE';
            }
        }
        return { ownershipStatus, previousOwnerUsername, previousOwnerDisplayName };
    }
    /**
     * Bounded discovery of recovery candidates from backups, databases, and registry.
     * NEVER walks whole drives recursively.
     */
    async discoverCandidates(additionalDirectory) {
        (0, paths_1.ensureAllDataDirs)();
        const candidates = [];
        const seenPaths = new Set();
        const controlDb = (0, paths_1.getControlDbPath)().toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)()?.toLowerCase() || '';
        // Search roots:
        const roots = [
            { dir: (0, paths_1.getBackupsDir)(), source: 'BACKUPS_DIR' },
            { dir: (0, paths_1.getDatabasesDir)(), source: 'DATABASES_DIR' },
            { dir: (0, paths_1.getExportDir)(), source: 'BACKUPS_DIR' },
        ];
        if (additionalDirectory && fs_1.default.existsSync(additionalDirectory)) {
            const canonicalAdditional = path_1.default.resolve(additionalDirectory);
            if (fs_1.default.statSync(canonicalAdditional).isDirectory()) {
                roots.push({ dir: canonicalAdditional, source: 'EXTERNAL' });
            }
        }
        const currentInstall = await installation_service_1.installationService.getOrCreateInstallation();
        // 1. Scan bounded directories (top-level only, no recursive drive walking)
        for (const root of roots) {
            if (!fs_1.default.existsSync(root.dir))
                continue;
            try {
                const files = fs_1.default.readdirSync(root.dir);
                for (const file of files) {
                    const fullPath = path_1.default.join(root.dir, file);
                    let targetPath = fullPath;
                    // Check if directory is a preservation bundle
                    try {
                        if (fs_1.default.statSync(fullPath).isDirectory()) {
                            const nestedDb = path_1.default.join(fullPath, 'database_backup.db');
                            if (fs_1.default.existsSync(nestedDb)) {
                                targetPath = nestedDb;
                            }
                            else {
                                continue;
                            }
                        }
                        else {
                            if (file.endsWith('.partial'))
                                continue;
                            if (!file.endsWith('.db') && !file.endsWith('.sqlite'))
                                continue;
                        }
                    }
                    catch {
                        continue;
                    }
                    let canonical;
                    try {
                        const pathRes = (0, database_path_util_1.canonicalizeDatabasePath)(targetPath);
                        if (!pathRes.valid)
                            continue;
                        canonical = pathRes.canonicalPath;
                    }
                    catch {
                        continue;
                    }
                    if (seenPaths.has(canonical.toLowerCase()))
                        continue;
                    if (canonical.toLowerCase() === controlDb || canonical.toLowerCase() === templateDb)
                        continue;
                    seenPaths.add(canonical.toLowerCase());
                    const stat = fs_1.default.statSync(canonical);
                    const manifestPath = `${canonical}.manifest.json`;
                    const hasManifest = fs_1.default.existsSync(manifestPath);
                    let manifest = null;
                    if (hasManifest) {
                        try {
                            manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
                        }
                        catch { }
                    }
                    let status = 'ACTIVE';
                    let suitability = 'VALID';
                    let schemaVersion = 1;
                    let details = null;
                    if (manifest && manifest.verification?.sqliteIntegrity === 'ok') {
                        status = 'ACTIVE';
                        suitability = 'VALID';
                        schemaVersion = manifest.database?.schemaVersion || 1;
                        details = 'Verified backup with valid manifest';
                    }
                    else {
                        const validation = await database_validation_service_1.databaseValidationService.validateDatabase(canonical);
                        suitability = this.computeSuitability(validation);
                        status = validation.status;
                        schemaVersion = validation.schemaVersion || 1;
                        details = validation.details || null;
                    }
                    const ownershipInfo = await this.resolveOwnership(canonical, manifest, currentInstall);
                    if (ownershipInfo.ownershipStatus === 'DELETED_USER' && suitability === 'VALID') {
                        suitability = 'REQUIRES_CONFIRMATION';
                        details = `Belonged to deactivated/deleted user "${ownershipInfo.previousOwnerUsername}". Explicit reconnection required.`;
                    }
                    candidates.push({
                        candidateId: manifest?.backupId || `cand_${crypto_1.default.randomUUID()}`,
                        displayName: manifest?.database?.displayName || path_1.default.basename(canonical),
                        canonicalPath: canonical,
                        source: root.source,
                        status,
                        suitability,
                        sizeBytes: stat.size,
                        lastModifiedAt: stat.mtime.toISOString(),
                        hasManifest,
                        sha256: manifest?.artifact?.sha256 || null,
                        schemaVersion,
                        profileCode: manifest?.database?.profileCode || null,
                        details,
                        ownershipStatus: ownershipInfo.ownershipStatus,
                        previousOwnerUsername: ownershipInfo.previousOwnerUsername,
                        previousOwnerDisplayName: ownershipInfo.previousOwnerDisplayName,
                    });
                }
            }
            catch (dirErr) {
                logging_1.logger.warn(`[RecoveryService] Directory scan error on ${root.dir}: ${String(dirErr)}`);
            }
        }
        return {
            candidates,
            totalCount: candidates.length,
        };
    }
    /**
     * Detailed inspection of a recovery candidate.
     */
    async inspectCandidate(candidatePath) {
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(candidatePath);
        if (!pathResult.valid) {
            throw new errors_1.ValidationError(pathResult.error || 'Invalid candidate path');
        }
        const canonical = pathResult.canonicalPath;
        if (!fs_1.default.existsSync(canonical)) {
            throw new errors_1.NotFoundError(`Candidate database file does not exist: ${canonical}`);
        }
        const controlDb = (0, paths_1.getControlDbPath)().toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)()?.toLowerCase() || '';
        if (canonical.toLowerCase() === controlDb) {
            throw new errors_1.ValidationError('The system control database cannot be used as a recovery candidate.');
        }
        if (canonical.toLowerCase() === templateDb) {
            throw new errors_1.ValidationError('The template database cannot be used as a recovery candidate.');
        }
        const stat = fs_1.default.statSync(canonical);
        const manifestPath = `${canonical}.manifest.json`;
        const hasManifest = fs_1.default.existsSync(manifestPath);
        let manifest = null;
        if (hasManifest) {
            try {
                manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
            }
            catch { }
        }
        const validation = await database_validation_service_1.databaseValidationService.validateDatabase(canonical);
        let suitability = this.computeSuitability(validation);
        const candidateSchemaVersion = manifest?.database?.schemaVersion ?? validation.schemaVersion ?? 1;
        const compatResult = schema_compatibility_service_1.schemaCompatibilityService.check(candidateSchemaVersion);
        let conflictReason = compatResult.conflictReason;
        if (!compatResult.isCompatible) {
            suitability = 'UNSUPPORTED';
        }
        else if (compatResult.canMigrate) {
            conflictReason = 'MIGRATABLE_SCHEMA_VERSION_OLDER';
        }
        // Ownership classification
        const currentInstall = await installation_service_1.installationService.getOrCreateInstallation();
        const ownershipInfo = await this.resolveOwnership(canonical, manifest, currentInstall);
        let ownershipStatus = ownershipInfo.ownershipStatus;
        if ((ownershipStatus === 'PREVIOUS_INSTALLATION' ||
            ownershipStatus === 'DELETED_USER' ||
            ownershipStatus === 'EXTERNAL_SOURCE' ||
            ownershipStatus === 'UNKNOWN_SOURCE') &&
            suitability === 'VALID') {
            suitability = 'REQUIRES_CONFIRMATION';
        }
        return {
            canonicalPath: canonical,
            displayName: manifest?.database?.displayName || path_1.default.basename(canonical),
            sizeBytes: stat.size,
            tableCount: validation.tableCount,
            schemaVersion: candidateSchemaVersion,
            supportedSchemaVersion: compatResult.currentVersion,
            profileCode: manifest?.database?.profileCode || null,
            profileName: manifest?.database?.displayName || null,
            status: validation.status,
            suitability,
            ownershipStatus,
            previousOwnerUsername: ownershipInfo.previousOwnerUsername,
            previousOwnerDisplayName: ownershipInfo.previousOwnerDisplayName,
            hasManifest,
            manifest,
            sqliteIntegrity: validation.integrityCheck,
            details: validation.details,
            conflictReason,
        };
    }
    /**
     * Prepares a staged restore:
     * Copies candidate to staging directory, leaving original backup 100% immutable!
     */
    async prepareRestore(req) {
        (0, paths_1.ensureAllDataDirs)();
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const pathResult = (0, database_path_util_1.canonicalizeDatabasePath)(req.candidatePath);
        if (!pathResult.valid) {
            throw new errors_1.ValidationError(pathResult.error || 'Invalid candidate database path');
        }
        const canonicalCandidate = pathResult.canonicalPath;
        if (!fs_1.default.existsSync(canonicalCandidate)) {
            throw new errors_1.NotFoundError(`Candidate database not found: ${canonicalCandidate}`);
        }
        // Prohibit restoring system DB or template DB
        const controlDb = (0, paths_1.getControlDbPath)().toLowerCase();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)()?.toLowerCase() || '';
        if (canonicalCandidate.toLowerCase() === controlDb || canonicalCandidate.toLowerCase() === templateDb) {
            throw new errors_1.ValidationError('Cannot restore system or template database.');
        }
        // Validate candidate integrity and schema compatibility before staging
        const manifestPath = `${canonicalCandidate}.manifest.json`;
        let manifestSchemaVersion = null;
        if (fs_1.default.existsSync(manifestPath)) {
            try {
                const m = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
                manifestSchemaVersion = m.database?.schemaVersion;
            }
            catch { }
        }
        const validation = await database_validation_service_1.databaseValidationService.validateDatabase(canonicalCandidate);
        if (!validation.isValid && validation.status === 'CORRUPTED') {
            throw new errors_1.ValidationError(`Candidate database is corrupted and cannot be restored: ${validation.integrityCheck}`);
        }
        const candidateSchemaVersion = manifestSchemaVersion ?? validation.schemaVersion ?? 1;
        const compatResult = schema_compatibility_service_1.schemaCompatibilityService.check(candidateSchemaVersion);
        if (!compatResult.isCompatible) {
            throw new errors_1.ValidationError(`Candidate schema version (${candidateSchemaVersion}) is not compatible: ${compatResult.details}`);
        }
        // Resolve target profile and target DB path
        const targetProfileCode = req.targetProfileCode || 'Stavan';
        const databasesDir = (0, paths_1.getDatabasesDir)();
        const targetDatabasePath = path_1.default.join(databasesDir, `${targetProfileCode}.db`);
        // Invariant: Source cannot equal Target
        if (path_1.default.resolve(canonicalCandidate).toLowerCase() === path_1.default.resolve(targetDatabasePath).toLowerCase()) {
            throw new errors_1.ValidationError('Source candidate database cannot be identical to the active target database.');
        }
        const restoreId = `rst_${crypto_1.default.randomUUID()}`;
        const stagingDir = path_1.default.join((0, paths_1.getRestoreStagingDir)(), restoreId);
        fs_1.default.mkdirSync(stagingDir, { recursive: true });
        const stagedPath = path_1.default.join(stagingDir, 'candidate.db');
        // 1. Copy candidate to staging (Original backup remains untouched!)
        fs_1.default.copyFileSync(canonicalCandidate, stagedPath);
        // 2. Validate staged database integrity
        const client = new client_1.PrismaClient({
            datasources: { db: { url: `file:${stagedPath.replace(/\\/g, '/')}` } },
        });
        let tableCount = 0;
        try {
            const integrityRows = await client.$queryRawUnsafe('PRAGMA integrity_check;');
            const integrityResult = integrityRows?.[0]?.integrity_check || 'ok';
            if (integrityResult !== 'ok') {
                throw new errors_1.ValidationError(`Staged database failed integrity check: ${integrityResult}`);
            }
            const tables = await client.$queryRawUnsafe("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
            tableCount = Number(tables?.[0]?.count || 0);
        }
        finally {
            await client.$disconnect();
        }
        // 3. Create RestoreRecord with status VALIDATED
        const targetDbExists = fs_1.default.existsSync(targetDatabasePath);
        let targetSize = 0;
        if (targetDbExists) {
            targetSize = fs_1.default.statSync(targetDatabasePath).size;
        }
        await prisma_1.systemPrisma.restoreRecord.create({
            data: {
                restoreId,
                installationId: install.id,
                targetDatabaseId: `db_${targetProfileCode}`,
                targetProfileId: null,
                candidatePath: canonicalCandidate,
                status: 'VALIDATED',
                schemaVersion: candidateSchemaVersion,
                sha256: null,
            },
        });
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'RESTORE',
                entityId: restoreId,
                eventType: 'RECOVERY_STARTED',
                description: `Recovery preparation started for candidate: ${canonicalCandidate}`,
                metadata: JSON.stringify({ restoreId, candidatePath: canonicalCandidate, targetProfileCode }),
                performedBy: 'system',
            },
        }).catch(() => { });
        return {
            restoreId,
            candidatePath: canonicalCandidate,
            stagedPath,
            targetProfileCode,
            targetDatabasePath,
            targetDatabaseExists: targetDbExists,
            targetDatabaseSize: targetSize,
            schemaVersion: candidateSchemaVersion,
            tableCount,
            status: 'VALIDATED',
            requiresRollbackBackup: targetDbExists,
        };
    }
    /**
     * Confirms and executes a staged restore with mandatory rollback backup and atomic activation.
     */
    async confirmRestore(req, performedBy = 'system') {
        if (!req.confirmDestructiveOverwrite) {
            throw new errors_1.ValidationError('Explicit confirmation is required to overwrite the active database.');
        }
        const restoreRecord = await prisma_1.systemPrisma.restoreRecord.findUnique({
            where: { restoreId: req.restoreId },
        });
        if (!restoreRecord || (restoreRecord.status !== 'VALIDATED' && restoreRecord.status !== 'STAGING')) {
            throw new errors_1.NotFoundError(`Staged restore operation ${req.restoreId} not found or not in ready state.`);
        }
        const stagingDir = path_1.default.join((0, paths_1.getRestoreStagingDir)(), req.restoreId);
        const stagedDbPath = path_1.default.join(stagingDir, 'candidate.db');
        if (!fs_1.default.existsSync(stagedDbPath)) {
            throw new errors_1.NotFoundError(`Staged candidate database is missing: ${stagedDbPath}`);
        }
        const targetProfileCode = req.targetProfileCode || 'Stavan';
        const targetDbPath = path_1.default.join((0, paths_1.getDatabasesDir)(), `${targetProfileCode}.db`);
        const targetResult = (0, database_path_util_1.canonicalizeDatabasePath)(targetDbPath);
        if (!targetResult.valid) {
            throw new errors_1.ValidationError(targetResult.error || 'Invalid target database path');
        }
        const canonicalTarget = targetResult.canonicalPath;
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        // Authoritative ownership resolution for candidate database
        const candidateManifestPath = `${restoreRecord.candidatePath}.manifest.json`;
        let candidateManifest = null;
        if (fs_1.default.existsSync(candidateManifestPath)) {
            try {
                candidateManifest = JSON.parse(fs_1.default.readFileSync(candidateManifestPath, 'utf-8'));
            }
            catch { }
        }
        const ownershipInfo = await this.resolveOwnership(restoreRecord.candidatePath, candidateManifest, install);
        // Explicit user binding validation:
        // If candidate database belongs to a DELETED_USER, explicit targetUserId is mandatory.
        if (ownershipInfo.ownershipStatus === 'DELETED_USER' && !req.targetUserId) {
            throw new errors_1.ValidationError('Target user ID is mandatory to recover a database belonging to a deleted user. Explicit user selection required.');
        }
        let targetUser = null;
        if (req.targetUserId) {
            targetUser = await prisma_1.systemPrisma.user.findUnique({
                where: { id: req.targetUserId },
            });
            if (!targetUser) {
                throw new errors_1.NotFoundError(`Selected target user "${req.targetUserId}" does not exist.`);
            }
            // If candidate had a known previous owner, verify match or require explicit confirmation
            if (ownershipInfo.previousOwnerUsername &&
                ownershipInfo.previousOwnerUsername !== targetUser.username &&
                !req.confirmForeignInstallation &&
                !req.confirmDestructiveOverwrite) {
                throw new errors_1.ValidationError(`Candidate database belonged to user "${ownershipInfo.previousOwnerUsername}", which differs from selected target user "${targetUser.username}". Explicit confirmation required.`);
            }
        }
        // Concurrency Lock
        if (this.activeRestoreLocks.has(canonicalTarget)) {
            throw new errors_1.ConflictError('A restore operation is already in progress for this target database.');
        }
        this.activeRestoreLocks.add(canonicalTarget);
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'RESTORE',
                entityId: req.restoreId,
                eventType: 'RECOVERY_CONFIRMED',
                description: `Recovery confirmed for restore operation ${req.restoreId}`,
                metadata: JSON.stringify({ restoreId: req.restoreId, targetUserId: req.targetUserId, targetProfileCode: req.targetProfileCode }),
                performedBy,
            },
        }).catch(() => { });
        let rollbackBackupPath = null;
        let rollbackBackupCreated = false;
        let swapOldPath = null;
        try {
            // 1. Mandatory Rollback Backup of current active database
            if (fs_1.default.existsSync(canonicalTarget)) {
                logging_1.logger.info(`[RecoveryService] Creating mandatory rollback backup of ${canonicalTarget}...`);
                try {
                    const rollbackRecord = await backup_service_1.backupService.createBackup({
                        databasePath: canonicalTarget,
                        backupType: 'PRE_RESTORE',
                        note: `Automatic rollback backup prior to restore ${req.restoreId}`,
                    }, performedBy);
                    rollbackBackupPath = rollbackRecord.backupPath;
                    rollbackBackupCreated = true;
                }
                catch (bkpErr) {
                    logging_1.logger.error(`[RecoveryService] Pre-restore rollback backup creation failed!`, bkpErr);
                    throw new errors_1.ConflictError(`Cannot proceed with restore: Mandatory rollback backup failed: ${bkpErr?.message}`);
                }
                await prisma_1.systemPrisma.restoreRecord.update({
                    where: { id: restoreRecord.id },
                    data: { rollbackBackupPath, status: 'ROLLBACK_READY' },
                });
            }
            // 2. Mark RestoreRecord ACTIVATING
            await prisma_1.systemPrisma.restoreRecord.update({
                where: { id: restoreRecord.id },
                data: { status: 'ACTIVATING' },
            });
            // 3. Windows-safe atomic replacement strategy
            if (fs_1.default.existsSync(canonicalTarget)) {
                swapOldPath = `${canonicalTarget}.swap_old_${Date.now()}`;
                fs_1.default.renameSync(canonicalTarget, swapOldPath);
            }
            // Copy staged candidate to live target DB
            fs_1.default.copyFileSync(stagedDbPath, canonicalTarget);
            // 4. Post-Restore Verification: verify new active database opens cleanly
            const verifyClient = new client_1.PrismaClient({
                datasources: { db: { url: `file:${canonicalTarget.replace(/\\/g, '/')}` } },
            });
            let integrityCheck = 'unknown';
            try {
                const checkRows = await verifyClient.$queryRawUnsafe('PRAGMA integrity_check;');
                integrityCheck = checkRows?.[0]?.integrity_check || 'ok';
                if (integrityCheck !== 'ok') {
                    throw new Error(`Post-restore integrity check failed: ${integrityCheck}`);
                }
            }
            catch (verifyErr) {
                // Post-restore check failed! AUTOMATIC ROLLBACK
                logging_1.logger.error(`[RecoveryService] Post-restore check failed! Rolling back...`, verifyErr);
                if (swapOldPath && fs_1.default.existsSync(swapOldPath)) {
                    if (fs_1.default.existsSync(canonicalTarget)) {
                        try {
                            fs_1.default.unlinkSync(canonicalTarget);
                        }
                        catch { }
                    }
                    fs_1.default.renameSync(swapOldPath, canonicalTarget);
                    swapOldPath = null;
                }
                else if (rollbackBackupPath && fs_1.default.existsSync(rollbackBackupPath)) {
                    fs_1.default.copyFileSync(rollbackBackupPath, canonicalTarget);
                }
                await prisma_1.systemPrisma.restoreRecord.update({
                    where: { id: restoreRecord.id },
                    data: {
                        status: 'ROLLED_BACK',
                        errorMessage: verifyErr?.message || 'Post-restore verification failed; rolled back.',
                    },
                });
                await prisma_1.systemPrisma.auditEvent.create({
                    data: {
                        entityType: 'RESTORE',
                        entityId: req.restoreId,
                        eventType: 'RECOVERY_ROLLED_BACK',
                        description: `Recovery rolled back due to post-activation verification failure: ${verifyErr?.message}`,
                        metadata: JSON.stringify({ restoreId: req.restoreId, error: verifyErr?.message }),
                        performedBy,
                    },
                }).catch(() => { });
                throw new errors_1.ConflictError(`Restoration failed post-activation checks. Current database was safely rolled back from backup.`);
            }
            finally {
                await verifyClient.$disconnect();
            }
            // Unlink swapOldPath upon verified activation
            if (swapOldPath && fs_1.default.existsSync(swapOldPath)) {
                try {
                    fs_1.default.unlinkSync(swapOldPath);
                }
                catch { }
                swapOldPath = null;
            }
            // 5. Update or Register active database in DatabaseRegistry and Profile
            let targetProfile = await prisma_1.systemPrisma.profile.findFirst({
                where: { code: targetProfileCode },
            });
            if (!targetProfile) {
                targetProfile = await prisma_1.systemPrisma.profile.create({
                    data: {
                        code: targetProfileCode,
                        name: `${targetProfileCode} Profile`,
                        dbPath: canonicalTarget,
                        isActive: true,
                        status: 'ACTIVE',
                    },
                });
            }
            else {
                targetProfile = await prisma_1.systemPrisma.profile.update({
                    where: { id: targetProfile.id },
                    data: {
                        dbPath: canonicalTarget,
                        isActive: true,
                        status: 'ACTIVE',
                        lastValidatedAt: new Date(),
                    },
                });
            }
            await prisma_1.systemPrisma.databaseRegistry.upsert({
                where: { canonicalPath: canonicalTarget },
                update: {
                    status: 'ACTIVE',
                    profileId: targetProfile.id,
                    lastValidatedAt: new Date(),
                    schemaVersion: restoreRecord.schemaVersion,
                },
                create: {
                    databaseId: `db_${targetProfileCode}`,
                    displayName: `${targetProfileCode} Database`,
                    canonicalPath: canonicalTarget,
                    schemaVersion: restoreRecord.schemaVersion,
                    status: 'ACTIVE',
                    databaseType: 'LOCAL_PROFILE',
                    profileId: targetProfile.id,
                    installationId: install.id,
                    lastValidatedAt: new Date(),
                },
            });
            // Explicit user ↔ database recovery binding
            if (targetUser) {
                if (req.reactivateUser || !targetUser.isActive || targetUser.deletedAt) {
                    await prisma_1.systemPrisma.user.update({
                        where: { id: targetUser.id },
                        data: { isActive: true, deletedAt: null },
                    });
                }
                await prisma_1.systemPrisma.userProfile.upsert({
                    where: {
                        userId_profileId: {
                            userId: targetUser.id,
                            profileId: targetProfile.id,
                        },
                    },
                    update: { isActive: true, role: 'ADMIN' },
                    create: {
                        userId: targetUser.id,
                        profileId: targetProfile.id,
                        role: 'ADMIN',
                        isActive: true,
                    },
                });
                await prisma_1.systemPrisma.installationUser.upsert({
                    where: {
                        installationId_userId: {
                            installationId: install.id,
                            userId: targetUser.id,
                        },
                    },
                    update: {},
                    create: {
                        installationId: install.id,
                        userId: targetUser.id,
                    },
                });
                await prisma_1.systemPrisma.auditEvent.create({
                    data: {
                        entityType: 'USER',
                        entityId: targetUser.id,
                        eventType: 'DATABASE_RECOVERED',
                        description: `Database ${canonicalTarget} explicitly bound to recovered user ${targetUser.username} (${targetUser.id})`,
                        performedBy,
                    },
                });
            }
            // 6. Clean up staging folder
            try {
                if (fs_1.default.existsSync(stagedDbPath))
                    fs_1.default.unlinkSync(stagedDbPath);
                if (fs_1.default.existsSync(stagingDir))
                    fs_1.default.rmdirSync(stagingDir);
            }
            catch { }
            // 7. Mark VERIFIED
            await prisma_1.systemPrisma.restoreRecord.update({
                where: { id: restoreRecord.id },
                data: {
                    status: 'VERIFIED',
                    completedAt: new Date(),
                },
            });
            // 8. Log audit events
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'RESTORE',
                    entityId: req.restoreId,
                    eventType: 'RECOVERY_COMPLETED',
                    description: `Recovery completed successfully to ${canonicalTarget}`,
                    metadata: JSON.stringify({ restoreId: req.restoreId, targetPath: canonicalTarget }),
                    performedBy,
                },
            }).catch(() => { });
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'RESTORE',
                    entityId: req.restoreId,
                    eventType: 'RESTORE_COMPLETED',
                    description: `Successfully restored database to ${canonicalTarget}`,
                    metadata: JSON.stringify({
                        restoreId: req.restoreId,
                        targetPath: canonicalTarget,
                        rollbackBackupPath,
                    }),
                    performedBy,
                },
            });
            return {
                success: true,
                restoreId: req.restoreId,
                status: 'VERIFIED',
                message: 'Database restored and verified successfully.',
                rollbackBackupCreated,
                rollbackBackupPath,
            };
        }
        catch (err) {
            await prisma_1.systemPrisma.auditEvent.create({
                data: {
                    entityType: 'RESTORE',
                    entityId: req.restoreId,
                    eventType: 'RECOVERY_FAILED',
                    description: `Recovery failed for operation ${req.restoreId}: ${err?.message}`,
                    metadata: JSON.stringify({ restoreId: req.restoreId, error: err?.message }),
                    performedBy,
                },
            }).catch(() => { });
            throw err;
        }
        finally {
            // Clean up swap file if somehow still existing on error
            if (swapOldPath && fs_1.default.existsSync(swapOldPath)) {
                try {
                    if (!fs_1.default.existsSync(canonicalTarget)) {
                        fs_1.default.renameSync(swapOldPath, canonicalTarget);
                    }
                }
                catch { }
            }
            this.activeRestoreLocks.delete(canonicalTarget);
        }
    }
    /**
     * Startup reconciliation of interrupted restores or crashed replacement operations.
     */
    async reconcileInterruptedRestores() {
        (0, paths_1.ensureAllDataDirs)();
        let reconciledCount = 0;
        let cleanedStagingCount = 0;
        const databasesDir = (0, paths_1.getDatabasesDir)();
        if (fs_1.default.existsSync(databasesDir)) {
            try {
                const files = fs_1.default.readdirSync(databasesDir);
                for (const file of files) {
                    if (file.includes('.swap_old_')) {
                        const swapFullPath = path_1.default.join(databasesDir, file);
                        const activeDbPath = swapFullPath.replace(/\.swap_old_\d+$/, '');
                        if (fs_1.default.existsSync(activeDbPath)) {
                            const validation = await database_validation_service_1.databaseValidationService.validateDatabase(activeDbPath);
                            if (validation.isValid) {
                                fs_1.default.unlinkSync(swapFullPath);
                                logging_1.logger.info(`[RecoveryService] Interrupted swap cleaned up for: ${activeDbPath}`);
                            }
                            else {
                                fs_1.default.unlinkSync(activeDbPath);
                                fs_1.default.renameSync(swapFullPath, activeDbPath);
                                logging_1.logger.warn(`[RecoveryService] Interrupted swap recovered to: ${activeDbPath}`);
                                reconciledCount++;
                            }
                        }
                        else {
                            fs_1.default.renameSync(swapFullPath, activeDbPath);
                            logging_1.logger.warn(`[RecoveryService] Interrupted swap restored missing DB: ${activeDbPath}`);
                            reconciledCount++;
                        }
                    }
                }
            }
            catch (err) {
                logging_1.logger.error(`[RecoveryService] Error scanning for swap files: ${String(err)}`);
            }
        }
        try {
            const interruptedRecords = await prisma_1.systemPrisma.restoreRecord.findMany({
                where: {
                    status: { in: ['PENDING', 'STAGING', 'ROLLBACK_READY', 'ACTIVATING'] },
                },
            });
            for (const rec of interruptedRecords) {
                const stagingDir = path_1.default.join((0, paths_1.getRestoreStagingDir)(), rec.restoreId);
                if (rec.status === 'ACTIVATING') {
                    if (rec.rollbackBackupPath && fs_1.default.existsSync(rec.rollbackBackupPath)) {
                        await prisma_1.systemPrisma.restoreRecord.update({
                            where: { id: rec.id },
                            data: {
                                status: 'ROLLED_BACK',
                                errorMessage: 'Interrupted during activation; reconciled on startup.',
                            },
                        });
                    }
                    else {
                        await prisma_1.systemPrisma.restoreRecord.update({
                            where: { id: rec.id },
                            data: {
                                status: 'FAILED',
                                errorMessage: 'Interrupted during activation; candidate discarded.',
                            },
                        });
                    }
                }
                else {
                    await prisma_1.systemPrisma.restoreRecord.update({
                        where: { id: rec.id },
                        data: {
                            status: 'FAILED',
                            errorMessage: 'Interrupted prior to activation; staging discarded.',
                        },
                    });
                }
                if (fs_1.default.existsSync(stagingDir)) {
                    try {
                        fs_1.default.rmSync(stagingDir, { recursive: true, force: true });
                        cleanedStagingCount++;
                    }
                    catch { }
                }
                reconciledCount++;
            }
        }
        catch (err) {
            logging_1.logger.error(`[RecoveryService] Error reconciling interrupted restore records: ${String(err)}`);
        }
        backup_service_1.backupService.cleanupPartialBackups();
        return { reconciledCount, cleanedStagingCount };
    }
    /**
     * Reinstall & previous installation data detection.
     */
    async detectReinstallState() {
        (0, paths_1.ensureAllDataDirs)();
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const databasesDir = (0, paths_1.getDatabasesDir)();
        const backupsDir = (0, paths_1.getBackupsDir)();
        let previousDatabasesCount = 0;
        if (fs_1.default.existsSync(databasesDir)) {
            try {
                const dbFiles = fs_1.default
                    .readdirSync(databasesDir)
                    .filter((f) => (f.endsWith('.db') || f.endsWith('.sqlite')) && !f.endsWith('.partial') && !f.includes('.swap_old_'));
                previousDatabasesCount = dbFiles.length;
            }
            catch { }
        }
        let previousBackupsCount = 0;
        if (fs_1.default.existsSync(backupsDir)) {
            try {
                const bkpFiles = fs_1.default
                    .readdirSync(backupsDir)
                    .filter((f) => (f.endsWith('.db') || f.endsWith('.sqlite')) && !f.endsWith('.partial'));
                previousBackupsCount = bkpFiles.length;
            }
            catch { }
        }
        // Check existing users and database registries in Control DB
        const existingUsersCount = await prisma_1.systemPrisma.user.count({ where: { deletedAt: null } });
        const existingRegistriesCount = await prisma_1.systemPrisma.databaseRegistry.count();
        const totalInstallationsCount = await prisma_1.systemPrisma.installation.count();
        const hasPreviousData = previousDatabasesCount > 0 ||
            previousBackupsCount > 0 ||
            existingUsersCount > 0 ||
            existingRegistriesCount > 0;
        let classification = 'FIRST_INSTALL';
        if (!hasPreviousData) {
            classification = 'FIRST_INSTALL';
        }
        else if (install.lifecycleState === 'READY') {
            classification = 'CURRENT_INSTALLATION';
        }
        else if (totalInstallationsCount > 1 || (existingUsersCount > 0 && previousDatabasesCount > 0)) {
            classification = 'PREVIOUS_INSTALLATION_DATA';
        }
        else if (previousDatabasesCount > 0 && existingRegistriesCount === 0) {
            classification = 'ORPHANED_DATA';
        }
        else if (previousBackupsCount > 0) {
            classification = 'RECOVERY_CANDIDATE';
        }
        else {
            classification = 'NO_RECOVERABLE_DATA';
        }
        return {
            hasPreviousData,
            previousInstallationId: install.installationId,
            previousAppVersion: install.appVersion,
            previousDatabasesCount,
            previousBackupsCount,
            canContinue: hasPreviousData && (existingUsersCount > 0 || existingRegistriesCount > 0 || previousDatabasesCount > 0),
            canRestore: previousBackupsCount > 0 || previousDatabasesCount > 0,
            canStartFresh: true,
            classification,
            details: hasPreviousData
                ? `Detected ${previousDatabasesCount} existing database(s), ${previousBackupsCount} backup(s), and ${existingUsersCount} registered user(s). Classification: ${classification}.`
                : 'Clean first-time installation.',
        };
    }
    /**
     * Start fresh installation:
     * Retires previous active installation(s); old database files, backups, and historical records remain 100% untouched on disk!
     */
    async startFreshInstallation() {
        (0, paths_1.ensureAllDataDirs)();
        // 1. Mark existing active installations as ARCHIVED
        await prisma_1.systemPrisma.installation.updateMany({
            where: { status: 'ACTIVE' },
            data: { status: 'ARCHIVED' },
        });
        // 2. Generate brand new installation ID and persist to config
        const newInstallId = crypto_1.default.randomUUID();
        const installFilePath = path_1.default.join((0, paths_1.getConfigDir)(), '.installation-id');
        try {
            fs_1.default.writeFileSync(installFilePath, newInstallId, { encoding: 'utf-8', mode: 0o600 });
        }
        catch (e) {
            logging_1.logger.warn(`Could not update .installation-id file: ${String(e)}`);
        }
        // 3. Create fresh active installation
        const install = await prisma_1.systemPrisma.installation.create({
            data: {
                installationId: newInstallId,
                appVersion: '3.0.0',
                status: 'ACTIVE',
                lifecycleState: 'APP_SETUP',
            },
        });
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'INSTALLATION',
                entityId: install.id,
                eventType: 'NEW_INSTALLATION_SELECTED',
                description: `Created fresh installation ${newInstallId}; prior databases preserved on disk.`,
                performedBy: 'user',
            },
        });
        return install;
    }
    /**
     * Continue existing installation:
     * Reconnects and verifies an existing installation state.
     */
    async continueExistingInstallation(targetInstallationId) {
        (0, paths_1.ensureAllDataDirs)();
        let targetInstall = null;
        if (targetInstallationId) {
            targetInstall = await prisma_1.systemPrisma.installation.findUnique({
                where: { installationId: targetInstallationId },
            });
        }
        else {
            // Find most recent installation with users or registries
            targetInstall = await prisma_1.systemPrisma.installation.findFirst({
                where: {
                    OR: [
                        { databaseRegistries: { some: {} } },
                        { installationUsers: { some: {} } },
                        { status: 'ACTIVE' },
                    ],
                },
                orderBy: { createdAt: 'desc' },
            });
        }
        if (!targetInstall) {
            throw new errors_1.NotFoundError('No existing installation found to continue.');
        }
        // Archive any other active installations
        await prisma_1.systemPrisma.installation.updateMany({
            where: {
                id: { not: targetInstall.id },
                status: 'ACTIVE',
            },
            data: { status: 'ARCHIVED' },
        });
        // Reactivate target installation
        const updated = await prisma_1.systemPrisma.installation.update({
            where: { id: targetInstall.id },
            data: { status: 'ACTIVE' },
        });
        // Persist to .installation-id file
        const installFilePath = path_1.default.join((0, paths_1.getConfigDir)(), '.installation-id');
        try {
            fs_1.default.writeFileSync(installFilePath, updated.installationId, { encoding: 'utf-8', mode: 0o600 });
        }
        catch { }
        await prisma_1.systemPrisma.auditEvent.create({
            data: {
                entityType: 'INSTALLATION',
                entityId: updated.id,
                eventType: 'REINSTALL_CONTINUED',
                description: `Continued existing installation ${updated.installationId}.`,
                performedBy: 'user',
            },
        });
        return {
            success: true,
            installation: updated,
            message: 'Existing installation continued successfully.',
        };
    }
    computeSuitability(val) {
        if (!val.isValid) {
            if (val.status === 'CORRUPTED')
                return 'CORRUPTED';
            if (val.status === 'UNSUPPORTED')
                return 'UNSUPPORTED';
            return 'INVALID';
        }
        return 'VALID';
    }
}
exports.RecoveryService = RecoveryService;
exports.recoveryService = new RecoveryService();
//# sourceMappingURL=recovery.service.js.map