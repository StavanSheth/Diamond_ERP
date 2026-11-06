"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/database/prisma");
const recovery_service_1 = require("../modules/system/recovery/recovery.service");
const backup_service_1 = require("../modules/system/backup/backup.service");
const installation_service_1 = require("../modules/system/installation.service");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 8 — Explicit User ↔ Database Recovery Binding (P0)', () => {
    const dbsDir = (0, paths_1.getDatabasesDir)();
    const deletedUsername = `deleted_user_${Date.now()}`;
    const deletedProfileCode = `DelProf_${Date.now()}`;
    const deletedDbPath = path_1.default.join(dbsDir, `${deletedProfileCode}.db`);
    const liveTargetDbPath = path_1.default.join(dbsDir, `Stavan.db`);
    let deletedUser;
    let deletedProfile;
    let backupRecord;
    (0, vitest_1.beforeAll)(async () => {
        await installation_service_1.installationService.getOrCreateInstallation();
        const templateDb = (0, paths_1.getDatabaseTemplatePath)();
        if (templateDb && fs_1.default.existsSync(templateDb)) {
            fs_1.default.copyFileSync(templateDb, deletedDbPath);
            if (!fs_1.default.existsSync(liveTargetDbPath)) {
                fs_1.default.copyFileSync(templateDb, liveTargetDbPath);
            }
        }
        else {
            const dummyClient = new client_1.PrismaClient({ datasources: { db: { url: `file:${deletedDbPath.replace(/\\/g, '/')}` } } });
            await dummyClient.$queryRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Profile" (id TEXT PRIMARY KEY, code TEXT, name TEXT, schemaVersion INTEGER);
        CREATE TABLE IF NOT EXISTS "Stock" (id TEXT PRIMARY KEY, stockCode TEXT, name TEXT);
      `);
            await dummyClient.$disconnect();
        }
        // Create deleted user in control DB
        deletedUser = await prisma_1.systemPrisma.user.create({
            data: {
                username: deletedUsername,
                displayName: 'Deleted Recovery Candidate',
                role: 'ADMIN',
                passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz01234567890123456789',
                isActive: false,
                deletedAt: new Date(),
            },
        });
        deletedProfile = await prisma_1.systemPrisma.profile.create({
            data: {
                code: deletedProfileCode,
                name: `${deletedProfileCode} Profile`,
                dbPath: deletedDbPath,
                isActive: false,
                status: 'INACTIVE',
            },
        });
        await prisma_1.systemPrisma.userProfile.create({
            data: {
                userId: deletedUser.id,
                profileId: deletedProfile.id,
                role: 'ADMIN',
                isActive: false,
            },
        });
        // Create verified backup for recovery candidate
        backupRecord = await backup_service_1.backupService.createBackup({
            databasePath: deletedDbPath,
            backupType: 'FULL',
            note: 'Backup of deleted user database',
        });
    });
    (0, vitest_1.afterAll)(async () => {
        if (fs_1.default.existsSync(deletedDbPath)) {
            try {
                fs_1.default.unlinkSync(deletedDbPath);
            }
            catch { }
        }
    });
    (0, vitest_1.it)('P0-1: rejects restore of deleted-user candidate if targetUserId is missing', async () => {
        const preview = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: backupRecord.backupPath,
            targetProfileCode: 'Stavan',
        });
        await (0, vitest_1.expect)(recovery_service_1.recoveryService.confirmRestore({
            restoreId: preview.restoreId,
            targetProfileCode: 'Stavan',
            confirmDestructiveOverwrite: true,
            // targetUserId omitted!
        })).rejects.toThrow(/Target user ID is mandatory/i);
    });
    (0, vitest_1.it)('P0-2: rejects restore if targetUserId does not exist in the database', async () => {
        const preview = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: backupRecord.backupPath,
            targetProfileCode: 'Stavan',
        });
        await (0, vitest_1.expect)(recovery_service_1.recoveryService.confirmRestore({
            restoreId: preview.restoreId,
            targetProfileCode: 'Stavan',
            confirmDestructiveOverwrite: true,
            targetUserId: `non_existent_usr_${Date.now()}`,
        })).rejects.toThrow(/not exist/i);
    });
    (0, vitest_1.it)('P0-3: successfully restores with explicit user binding, reactivates user, and links UserProfile + InstallationUser', async () => {
        const preview = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: backupRecord.backupPath,
            targetProfileCode: 'Stavan',
        });
        const result = await recovery_service_1.recoveryService.confirmRestore({
            restoreId: preview.restoreId,
            targetProfileCode: 'Stavan',
            confirmDestructiveOverwrite: true,
            targetUserId: deletedUser.id,
            reactivateUser: true,
        });
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.status).toBe('VERIFIED');
        // 1. Verify User reactivated
        const updatedUser = await prisma_1.systemPrisma.user.findUnique({
            where: { id: deletedUser.id },
        });
        (0, vitest_1.expect)(updatedUser?.isActive).toBe(true);
        (0, vitest_1.expect)(updatedUser?.deletedAt).toBeNull();
        // 2. Verify UserProfile association
        const userProfile = await prisma_1.systemPrisma.userProfile.findFirst({
            where: { userId: deletedUser.id, isActive: true },
            include: { profile: true },
        });
        (0, vitest_1.expect)(userProfile).toBeDefined();
        (0, vitest_1.expect)(userProfile?.profile.code).toBe('Stavan');
        // 3. Verify InstallationUser association
        const installUser = await prisma_1.systemPrisma.installationUser.findFirst({
            where: { userId: deletedUser.id },
        });
        (0, vitest_1.expect)(installUser).toBeDefined();
        // 4. Verify DatabaseRegistry
        const reg = await prisma_1.systemPrisma.databaseRegistry.findFirst({
            where: { canonicalPath: path_1.default.resolve(liveTargetDbPath), status: 'ACTIVE' },
        });
        (0, vitest_1.expect)(reg).toBeDefined();
        // 5. Verify audit event
        const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
            where: { entityType: 'USER', entityId: deletedUser.id, eventType: 'DATABASE_RECOVERED' },
        });
        (0, vitest_1.expect)(audit).toBeDefined();
    });
});
//# sourceMappingURL=phase8-explicit-recovery-binding.test.js.map