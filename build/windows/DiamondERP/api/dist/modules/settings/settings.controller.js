"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = __importStar(require("../../infrastructure/database/prisma"));
const errors_1 = require("../../errors");
const user_lifecycle_service_1 = require("../system/user-lifecycle/user-lifecycle.service");
const backup_service_1 = require("../system/backup/backup.service");
const database_provisioning_service_1 = require("../system/database/database-provisioning.service");
const database_context_service_1 = require("../../infrastructure/database/database-context.service");
const database_health_service_1 = require("../system/database/database-health.service");
const database_registry_service_1 = require("../system/database/database-registry.service");
const database_deletion_service_1 = require("../system/database/database-deletion.service");
const data_1 = require("../../infrastructure/data");
const auth_service_1 = require("../auth/auth.service");
const installation_service_1 = require("../system/installation.service");
class SettingsController {
    constructor() {
        this.getSettings = async (_req, res, next) => {
            try {
                let rows = [];
                try {
                    rows = await prisma_1.default.setting.findMany();
                }
                catch {
                    // Fallback gracefully if Setting table does not exist in current profile DB
                    rows = [];
                }
                const settings = {};
                rows.forEach(r => {
                    settings[r.key] = r.value;
                });
                res.json({ success: true, data: settings });
            }
            catch (error) {
                next(error);
            }
        };
        this.updateSettings = async (req, res, next) => {
            try {
                const settingsToUpdate = req.body;
                if (!settingsToUpdate || typeof settingsToUpdate !== 'object' || Array.isArray(settingsToUpdate)) {
                    throw new errors_1.ValidationError('Settings payload must be a valid key-value object');
                }
                // Task 17: Settings Allowlist
                const ALLOWED_SETTINGS = [
                    'COMPANY_NAME', 'COMPANY_ADDRESS', 'COMPANY_PHONE', 'COMPANY_EMAIL',
                    'DEFAULT_CURRENCY', 'TAX_PERCENTAGE', 'DEFAULT_BROKERAGE',
                    'FINANCIAL_YEAR_START', 'INVOICE_PREFIX', 'THEME_PREFERENCE',
                    'CUSTOM_LOCATIONS'
                ];
                // 1. Validate ALL settings before performing any DB operations
                for (const [key, value] of Object.entries(settingsToUpdate)) {
                    if (!ALLOWED_SETTINGS.includes(key)) {
                        throw new errors_1.ValidationError(`Setting key '${key}' is not allowed`);
                    }
                    if (typeof value !== 'string') {
                        throw new errors_1.ValidationError(`Setting value for '${key}' must be a string`);
                    }
                }
                // 2. Perform atomic database transaction - all or nothing
                await prisma_1.default.$transaction(async (tx) => {
                    for (const [key, value] of Object.entries(settingsToUpdate)) {
                        await tx.setting.upsert({
                            where: { key },
                            update: { value },
                            create: { key, value }
                        });
                    }
                });
                res.json({ success: true, message: 'Settings updated successfully' });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * Normal user-facing XLSX export.
         * Delegates to ExportService — the same engine used by preservation/uninstall.
         * Arrangement is retained for future presentation-layer grouping (does not change data).
         */
        this.exportExcel = async (req, res, next) => {
            try {
                const { exportService } = await Promise.resolve().then(() => __importStar(require('../system/export/export.service')));
                const profileCode = req.profileCode
                    || String(req.headers['x-profile-code'] || '');
                const exportResult = await exportService.exportBusinessData({
                    format: 'XLSX',
                    ...(profileCode ? { profileCode } : {}),
                }, req.user?.id || 'user');
                if (!exportResult.filePath) {
                    res.status(500).json({ success: false, message: 'Export generated no XLSX output.' });
                    return;
                }
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="diamond_inventory_export.xlsx"');
                const readStream = fs_1.default.createReadStream(exportResult.filePath);
                readStream.pipe(res);
                readStream.on('error', (err) => next(err));
            }
            catch (error) {
                next(error);
            }
        };
        this.exportCsv = async (req, res, next) => {
            try {
                const { exportService } = await Promise.resolve().then(() => __importStar(require('../system/export/export.service')));
                const profileCode = req.profileCode
                    || String(req.headers['x-profile-code'] || '');
                const exportResult = await exportService.exportBusinessData({
                    format: 'CSV',
                    ...(profileCode ? { profileCode } : {}),
                }, req.user?.id || 'user');
                res.json({ success: true, data: exportResult });
            }
            catch (error) {
                next(error);
            }
        };
        this.getProfiles = async (_req, res, next) => {
            try {
                const profiles = (0, prisma_1.getAllProfiles)();
                const active = (0, prisma_1.getActiveProfileOrDefault)();
                res.json({ success: true, data: { profiles, active } });
            }
            catch (error) {
                next(error);
            }
        };
        this.createProfile = async (req, res, next) => {
            try {
                const { profileName, displayName } = req.body;
                if (!profileName || typeof profileName !== 'string') {
                    res.status(400).json({ success: false, message: 'Profile name is required' });
                    return;
                }
                const cleanName = profileName.trim();
                if (!/^[a-zA-Z0-9_-]{1,50}$/.test(cleanName)) {
                    res.status(400).json({
                        success: false,
                        message: 'Profile name must be 1-50 alphanumeric characters (hyphens and underscores allowed)'
                    });
                    return;
                }
                if (prisma_1.FORBIDDEN_PROFILE_NAMES.has(cleanName.toLowerCase())) {
                    res.status(400).json({
                        success: false,
                        message: `Profile name "${cleanName}" is reserved for system use and cannot be registered as a business profile.`
                    });
                    return;
                }
                // Resolve requesting user
                let targetUser = req.user;
                if (!targetUser?.id || targetUser.id === 'default-admin') {
                    targetUser = await prisma_1.systemPrisma.user.findFirst({
                        where: { isActive: true, deletedAt: null },
                        orderBy: { createdAt: 'asc' },
                    });
                }
                if (!targetUser) {
                    throw new errors_1.ValidationError('Cannot provision profile without an active system user.');
                }
                // Check if profile code already exists
                const existingProf = await prisma_1.systemPrisma.profile.findUnique({ where: { code: cleanName } });
                if (existingProf) {
                    throw new errors_1.ValidationError(`Profile "${cleanName}" already exists.`);
                }
                const install = await installation_service_1.installationService.getOrCreateInstallation();
                await installation_service_1.installationService.associateUser(install.id, targetUser.id);
                // Authoritative database provisioning via DatabaseProvisioningService
                const provisionResult = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
                    profileCode: cleanName,
                    displayName: displayName || cleanName,
                    userId: targetUser.id,
                });
                // Synchronize in-memory Prisma client pool
                (0, prisma_1.registerProfile)({
                    code: cleanName,
                    name: displayName || cleanName,
                    dbPath: provisionResult.canonicalPath,
                });
                await (0, prisma_1.getClientForProfileAsync)(cleanName);
                // Create initial verified backup for the new database
                try {
                    await backup_service_1.backupService.createBackup({
                        databasePath: provisionResult.canonicalPath,
                        backupType: 'MANUAL',
                    });
                }
                catch (bkpErr) {
                    console.warn(`[SettingsController] Initial backup notice for ${cleanName}:`, bkpErr.message);
                }
                const allProfiles = (0, prisma_1.getAllProfiles)();
                res.json({
                    success: true,
                    message: `Profile "${cleanName}" created successfully`,
                    data: { active: cleanName, profiles: allProfiles },
                });
            }
            catch (error) {
                next(error);
            }
        };
        this.deleteProfile = async (req, res, next) => {
            try {
                const profileCode = String(req.params.profileCode);
                const deleteDatabase = req.query.deleteDatabase === 'true' || req.body?.deleteDatabase === true;
                const performedBy = req.user?.username || req.user?.displayName || 'admin';
                const result = await database_deletion_service_1.databaseDeletionService.deletePhysicalDatabaseSafely({
                    profileCode,
                    deleteDatabaseFile: deleteDatabase,
                    performedBy,
                });
                res.json({
                    success: true,
                    message: result.message,
                    deletedDatabases: result.deletedFiles,
                    backupId: result.backupId,
                });
            }
            catch (error) {
                next(error);
            }
        };
        this.switchProfile = async (req, res, next) => {
            try {
                const { profileName } = req.body;
                if (!profileName || typeof profileName !== 'string') {
                    res.status(400).json({ success: false, message: 'Profile name is required' });
                    return;
                }
                const cleanName = profileName.trim();
                if (!/^[a-zA-Z0-9_-]{1,50}$/.test(cleanName)) {
                    res.status(400).json({
                        success: false,
                        message: 'Profile name must be 1-50 alphanumeric characters (hyphens and underscores allowed)'
                    });
                    return;
                }
                if (prisma_1.FORBIDDEN_PROFILE_NAMES.has(cleanName.toLowerCase())) {
                    res.status(400).json({
                        success: false,
                        message: `Profile name "${cleanName}" is reserved for system use.`
                    });
                    return;
                }
                // Invariant: Profile must exist in system.db before switching
                const existingProfile = await prisma_1.systemPrisma.profile.findFirst({
                    where: {
                        OR: [
                            { code: cleanName },
                            { id: cleanName },
                        ],
                    },
                });
                if (!existingProfile) {
                    res.status(404).json({
                        success: false,
                        message: `PROFILE_NOT_FOUND: Profile "${cleanName}" does not exist. Switching cannot create profiles.`,
                    });
                    return;
                }
                // Assert valid business database context (rejects template.db, system.db, missing DB, etc.)
                await database_context_service_1.databaseContextService.assertValidBusinessDatabaseContext(cleanName);
                await (0, prisma_1.getClientForProfileAsync)(cleanName);
                const allProfiles = (0, prisma_1.getAllProfiles)();
                res.json({
                    success: true,
                    message: `Verified profile: ${cleanName}`,
                    data: { active: cleanName, profiles: allProfiles }
                });
            }
            catch (error) {
                next(error);
            }
        };
        this.factoryReset = async (req, res, next) => {
            try {
                const confirmation = req.body.confirmation || req.body.confirm || req.body.confirmPassword;
                if (!confirmation || (confirmation !== 'DELETE' && typeof confirmation !== 'string')) {
                    throw new errors_1.ValidationError('Confirmation required. Send { confirmation: "DELETE" } to confirm this destructive operation.');
                }
                // If user is authenticated, create an audit event
                const authenticatedUser = req.user;
                try {
                    await prisma_1.default.auditEvent.create({
                        data: {
                            entityType: 'SYSTEM',
                            entityId: 'factory-reset',
                            eventType: 'FACTORY_RESET',
                            description: `Factory reset initiated by ${authenticatedUser?.username || 'desktop-admin'}`,
                            performedBy: authenticatedUser?.id || 'admin',
                            ipAddress: req.ip || undefined,
                        },
                    });
                }
                catch { }
                // Wipe all database tables in proper dependency order
                await prisma_1.default.$transaction([
                    prisma_1.default.transformationProvenance.deleteMany({}),
                    prisma_1.default.itemTransformation.deleteMany({}),
                    prisma_1.default.itemEvent.deleteMany({}),
                    prisma_1.default.inventoryMovement.deleteMany({}),
                    prisma_1.default.financialEntry.deleteMany({}),
                    prisma_1.default.transactionItem.deleteMany({}),
                    prisma_1.default.certification.deleteMany({}),
                    prisma_1.default.repair.deleteMany({}),
                    prisma_1.default.transaction.deleteMany({}),
                    prisma_1.default.diamondItem.deleteMany({}),
                    prisma_1.default.ledger.deleteMany({}),
                    prisma_1.default.location.deleteMany({}),
                    prisma_1.default.stock.deleteMany({}),
                    prisma_1.default.party.deleteMany({}),
                    prisma_1.default.versionChange.deleteMany({}),
                    prisma_1.default.recordVersion.deleteMany({}),
                    prisma_1.default.draftRevision.deleteMany({}),
                    prisma_1.default.documentDraft.deleteMany({}),
                ]);
                try {
                    await prisma_1.default.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
                    await prisma_1.default.$queryRawUnsafe('VACUUM;');
                }
                catch { }
                res.json({ success: true, message: 'All database data wiped cleanly. Database is now empty.' });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/settings/backup
         * Creates an atomic, consistent database snapshot.
         * Delegates to authoritative BackupService (SSOT).
         */
        this.backupDatabase = async (req, res, next) => {
            try {
                const activeProfile = req.profileCode || (0, prisma_1.getActiveProfileOrDefault)();
                const dbContext = await database_context_service_1.databaseContextService.getDatabaseForProfileCode(activeProfile);
                const backupRecord = await backup_service_1.backupService.createBackup({
                    databasePath: dbContext.canonicalPath,
                    backupType: 'MANUAL',
                }, req.user?.username || 'user');
                res.json({
                    success: true,
                    message: 'Database backup created successfully',
                    data: {
                        filename: path_1.default.basename(backupRecord.backupPath),
                        backupId: backupRecord.backupId,
                        sizeBytes: backupRecord.sizeBytes,
                        timestamp: backupRecord.createdAt,
                        sha256: backupRecord.sha256,
                        status: backupRecord.status,
                        checkpoint: 'TRUNCATE'
                    }
                });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/settings/checkpoint
         * Flushes SQLite Write-Ahead Log on the active business database file.
         */
        this.checkpointWAL = async (req, res, next) => {
            try {
                const activeProfile = req.profileCode || (0, prisma_1.getActiveProfileOrDefault)();
                const client = await (0, prisma_1.getClientForProfileAsync)(activeProfile);
                const result = await client.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
                res.json({
                    success: true,
                    message: 'SQLite WAL checkpoint completed successfully',
                    data: result
                });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/settings/users
         * Lists all business users with their assigned profiles and database paths.
         */
        this.listUsers = async (_req, res, next) => {
            try {
                const users = await prisma_1.systemPrisma.user.findMany({
                    where: { deletedAt: null },
                    select: {
                        id: true,
                        username: true,
                        displayName: true,
                        role: true,
                        isActive: true,
                        createdAt: true,
                        userProfiles: {
                            where: { isActive: true },
                            include: {
                                profile: {
                                    include: {
                                        databaseRegistries: {
                                            where: { status: 'ACTIVE' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                });
                const formatted = users.map((u) => {
                    const profiles = u.userProfiles.map((up) => {
                        const registry = up.profile.databaseRegistries[0];
                        return {
                            profileId: up.profile.id,
                            code: up.profile.code,
                            name: up.profile.name,
                            dbPath: registry?.canonicalPath || up.profile.dbPath || null,
                            databaseId: registry?.databaseId || null,
                        };
                    });
                    return {
                        id: u.id,
                        username: u.username,
                        displayName: u.displayName,
                        role: u.role,
                        isActive: u.isActive,
                        createdAt: u.createdAt,
                        profiles,
                    };
                });
                res.json({ success: true, data: formatted });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/settings/users/:userId/deactivate
         * Deactivates a user, strictly preserving their database and registry.
         */
        this.deactivateUser = async (req, res, next) => {
            try {
                const userId = String(req.params.userId || req.params.id);
                const performedBy = req.user?.username || 'system';
                const result = await user_lifecycle_service_1.userLifecycleService.deactivateUser(userId, performedBy);
                res.json(result);
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * DELETE /api/settings/users/:userId
         * Soft-deletes a user, strictly preserving their database and registry.
         */
        this.deleteUser = async (req, res, next) => {
            try {
                const userId = String(req.params.userId || req.params.id);
                const performedBy = req.user?.username || 'system';
                const result = await user_lifecycle_service_1.userLifecycleService.deleteUser(userId, performedBy);
                res.json(result);
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * PUT /api/settings/users/:userId
         * Update user details (displayName, role).
         */
        this.updateUser = async (req, res, next) => {
            try {
                const userId = String(req.params.userId || req.params.id);
                const { displayName, role } = req.body;
                const user = await prisma_1.systemPrisma.user.findUnique({ where: { id: userId } });
                if (!user) {
                    throw new errors_1.NotFoundError(`User not found: ${userId}`);
                }
                const isPrimaryAdmin = user.username.toLowerCase() === 'stavan';
                const updatedData = {};
                if (displayName && typeof displayName === 'string') {
                    updatedData.displayName = displayName.trim();
                }
                if (role && typeof role === 'string') {
                    if (isPrimaryAdmin && role !== 'SUPER_ADMIN') {
                        throw new errors_1.ValidationError('Cannot downgrade primary administrator role.');
                    }
                    updatedData.role = role;
                }
                const updated = await prisma_1.systemPrisma.user.update({
                    where: { id: userId },
                    data: updatedData,
                });
                res.json({
                    success: true,
                    message: 'User updated successfully',
                    data: {
                        id: updated.id,
                        username: updated.username,
                        displayName: updated.displayName,
                        role: updated.role,
                    },
                });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/settings/users
         * Creates a new business user, assigns optional profile, and binds to installation.
         */
        this.createUser = async (req, res, next) => {
            try {
                const { username, password, displayName, role, profileCode } = req.body;
                if (!username || typeof username !== 'string' || !username.trim()) {
                    throw new errors_1.ValidationError('Username is required');
                }
                if (!password || typeof password !== 'string' || password.length < 8) {
                    throw new errors_1.ValidationError('Password must be at least 8 characters');
                }
                const install = await installation_service_1.installationService.getOrCreateInstallation();
                const targetProfiles = profileCode ? [String(profileCode).trim()] : [];
                const user = await auth_service_1.authService.createUser(username.trim(), password, (displayName || username).trim(), role || 'ADMIN', targetProfiles);
                await installation_service_1.installationService.associateUser(install.id, user.id);
                res.status(201).json({
                    success: true,
                    message: `User "${user.username}" created successfully`,
                    data: user,
                });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/settings/databases
         * Lists all registered SQLite databases and profile mappings.
         */
        this.listDatabases = async (_req, res, next) => {
            try {
                const profiles = await prisma_1.systemPrisma.profile.findMany({
                    where: { isActive: true },
                    include: {
                        databaseRegistries: {
                            where: { status: 'ACTIVE' },
                        },
                        userProfiles: {
                            where: { isActive: true },
                            include: { user: { select: { id: true, username: true, displayName: true } } },
                        },
                    },
                    orderBy: { name: 'asc' },
                });
                const activeProfile = (0, prisma_1.getActiveProfileOrDefault)();
                const formatted = profiles.map((p) => {
                    const canonicalPath = p.databaseRegistries[0]?.canonicalPath || null;
                    const filename = canonicalPath ? path_1.default.basename(canonicalPath) : `${p.code}.db`;
                    const exists = canonicalPath ? fs_1.default.existsSync(canonicalPath) : false;
                    const sizeBytes = exists && canonicalPath ? fs_1.default.statSync(canonicalPath).size : 0;
                    return {
                        id: p.id,
                        code: p.code,
                        name: p.name,
                        dbPath: canonicalPath || '',
                        canonicalPath: canonicalPath || '',
                        filename,
                        sizeBytes,
                        exists,
                        isActive: p.code.toLowerCase() === activeProfile.toLowerCase(),
                        assignedUsers: p.userProfiles.map((up) => ({
                            id: up.user.id,
                            username: up.user.username,
                            displayName: up.user.displayName,
                        })),
                    };
                });
                res.json({ success: true, data: formatted });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * PUT /api/settings/databases/:profileId
         * Edit database display name / details.
         */
        this.updateDatabase = async (req, res, next) => {
            try {
                const profileId = String(req.params.profileId || req.params.id);
                const { name, path: newPath, canonicalPath } = req.body;
                if (!name || typeof name !== 'string') {
                    throw new errors_1.ValidationError('Database name is required');
                }
                const prof = await prisma_1.systemPrisma.profile.findFirst({
                    where: {
                        OR: [{ id: profileId }, { code: profileId }],
                    },
                });
                if (!prof) {
                    throw new errors_1.NotFoundError(`Database / profile not found: ${profileId}`);
                }
                const updated = await prisma_1.systemPrisma.profile.update({
                    where: { id: prof.id },
                    data: { name: name.trim() },
                });
                await prisma_1.systemPrisma.databaseRegistry.updateMany({
                    where: { profileId: prof.id },
                    data: { displayName: name.trim() },
                });
                const targetPath = (newPath || canonicalPath)?.trim();
                if (targetPath) {
                    const reg = await prisma_1.systemPrisma.databaseRegistry.findFirst({
                        where: { profileId: prof.id },
                    });
                    if (reg) {
                        await database_registry_service_1.databaseRegistryService.updateDatabasePath(reg.databaseId, targetPath);
                        (0, prisma_1.updateProfileDbPath)(prof.code, targetPath);
                    }
                }
                res.json({
                    success: true,
                    message: 'Database details updated successfully',
                    data: updated,
                });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/settings/users/:userId/link-database
         * Links a database / profile to a user.
         */
        this.linkDatabaseToUser = async (req, res, next) => {
            try {
                const userId = String(req.params.userId || req.params.id);
                const { profileId } = req.body;
                if (!profileId) {
                    throw new errors_1.ValidationError('profileId is required');
                }
                const user = await prisma_1.systemPrisma.user.findUnique({ where: { id: userId } });
                if (!user)
                    throw new errors_1.NotFoundError('User not found');
                const profile = await prisma_1.systemPrisma.profile.findFirst({
                    where: { OR: [{ id: profileId }, { code: profileId }] },
                });
                if (!profile)
                    throw new errors_1.NotFoundError('Database / profile not found');
                const existingLink = await prisma_1.systemPrisma.userProfile.findFirst({
                    where: { userId: user.id, profileId: profile.id },
                });
                // Enforce: Each user is attached with only one DB and no other DB
                await prisma_1.systemPrisma.userProfile.deleteMany({
                    where: { userId: user.id, profileId: { not: profile.id } },
                });
                if (existingLink) {
                    if (!existingLink.isActive) {
                        await prisma_1.systemPrisma.userProfile.update({
                            where: { id: existingLink.id },
                            data: { isActive: true },
                        });
                    }
                }
                else {
                    await prisma_1.systemPrisma.userProfile.create({
                        data: {
                            userId: user.id,
                            profileId: profile.id,
                            role: user.role,
                            isActive: true,
                        },
                    });
                }
                res.json({ success: true, message: `Database "${profile.name}" linked to user @${user.username}` });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/settings/users/:userId/unlink-database
         * Unlinks a database / profile from a user.
         */
        this.unlinkDatabaseFromUser = async (req, res, next) => {
            try {
                const userId = String(req.params.userId || req.params.id);
                const { profileId } = req.body;
                if (!profileId)
                    throw new errors_1.ValidationError('profileId is required');
                const profile = await prisma_1.systemPrisma.profile.findFirst({
                    where: { OR: [{ id: profileId }, { code: profileId }] },
                });
                if (!profile)
                    throw new errors_1.NotFoundError('Database / profile not found');
                await prisma_1.systemPrisma.userProfile.deleteMany({
                    where: { userId, profileId: profile.id },
                });
                res.json({ success: true, message: 'Database unlinked from user successfully' });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/settings/backup/download-active
         * Flushes WAL and triggers browser file download for active SQLite DB.
         */
        this.downloadActiveDatabase = async (req, res, next) => {
            try {
                const activeProfile = req.profileCode || (0, prisma_1.getActiveProfileOrDefault)();
                const dbContext = await database_context_service_1.databaseContextService.getDatabaseForProfileCode(activeProfile);
                const resolvedDbPath = dbContext.canonicalPath;
                if (!fs_1.default.existsSync(resolvedDbPath)) {
                    res.status(404).json({ success: false, message: `Database file for "${activeProfile}" not found` });
                    return;
                }
                try {
                    const client = await (0, prisma_1.getClientForProfileAsync)(activeProfile);
                    await client.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
                }
                catch { }
                const dateStr = new Date().toISOString().slice(0, 10);
                const downloadName = `${activeProfile}_Database_${dateStr}.db`;
                res.download(resolvedDbPath, downloadName);
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/settings/backup/:backupId/download
         * Streams snapshot backup file.
         */
        this.downloadBackup = async (req, res, next) => {
            try {
                const backupId = String(req.params.backupId);
                const record = await prisma_1.systemPrisma.backupRecord.findUnique({ where: { backupId } });
                if (!record || !fs_1.default.existsSync(record.backupPath)) {
                    res.status(404).json({ success: false, message: 'Backup file not found on disk' });
                    return;
                }
                const filename = path_1.default.basename(record.backupPath);
                res.download(record.backupPath, filename);
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/settings/data-health
         * Runs central database health inspection across all profiles and databases.
         */
        this.getDataHealth = async (_req, res, next) => {
            try {
                const report = await database_health_service_1.databaseHealthService.checkHealth();
                res.json({ success: true, data: report });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/settings/open-folder
         * Opens data, backup, export, or log directory in Windows Explorer (Section 70).
         */
        this.openFolder = async (req, res, next) => {
            try {
                const { folder } = req.body;
                let success = false;
                if (folder === 'backups') {
                    success = await data_1.dataLocationService.openBackupFolder();
                }
                else if (folder === 'exports') {
                    success = await data_1.dataLocationService.openExportFolder();
                }
                else if (folder === 'logs') {
                    success = await data_1.dataLocationService.openLogsFolder();
                }
                else {
                    success = await data_1.dataLocationService.openDataFolder();
                }
                res.json({ success, message: success ? 'Folder opened in Explorer' : 'Could not open folder' });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * POST /api/settings/data-location/migrate
         * Executes safe data location migration workflow (Sections 7 & 8).
         */
        this.migrateDataLocation = async (req, res, next) => {
            try {
                const { targetDataDir } = req.body;
                if (!targetDataDir) {
                    res.status(400).json({ success: false, message: 'targetDataDir is required' });
                    return;
                }
                const result = await data_1.dataLocationService.migrateDataLocation(targetDataDir);
                res.json({ success: true, data: result });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/settings/disk-space
         * Returns current disk space assessment across data directory (Section 25).
         */
        this.getDiskSpace = async (_req, res, next) => {
            try {
                const space = data_1.dataLocationService.checkDiskSpace();
                res.json({ success: true, data: space });
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.SettingsController = SettingsController;
//# sourceMappingURL=settings.controller.js.map