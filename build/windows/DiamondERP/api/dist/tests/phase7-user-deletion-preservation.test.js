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
const user_lifecycle_service_1 = require("../modules/system/user-lifecycle/user-lifecycle.service");
const recovery_service_1 = require("../modules/system/recovery/recovery.service");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 7 — User Deactivation / Deletion Data Preservation', () => {
    const testDir = path_1.default.resolve('apps/api/test-scratch-phase7-users');
    const userADbPath = path_1.default.join(testDir, 'user_a_business.db');
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
    let userAId;
    let profileAId;
    let registryAId;
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        // Prepare a pristine SQLite database for User A
        fs_1.default.copyFileSync(templateDb, userADbPath);
        // Seed test business data into User A's database using dynamic PrismaClient
        const userPrisma = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(userADbPath)}` });
        await userPrisma.$executeRawUnsafe(`
      INSERT OR REPLACE INTO Stock (id, stockCode, name, description, currency, isActive, createdAt, updatedAt)
      VALUES ('stock_101', 'LOT-A-99', 'High Quality Diamond A', 'Test Lot A', 'USD', 1, datetime('now'), datetime('now'));
    `);
        await userPrisma.$disconnect();
        // Ensure installation exists in system DB
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_test_p7_001',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
        // Create User A in control plane
        const userA = await prisma_1.systemPrisma.user.create({
            data: {
                username: 'usera_test',
                passwordHash: 'argon2id_mock_hash_usera',
                displayName: 'User A Diamond Corp',
                role: 'ADMIN',
                isActive: true,
            },
        });
        userAId = userA.id;
        // Create Profile A
        const profileA = await prisma_1.systemPrisma.profile.create({
            data: {
                code: 'USERA_PROF',
                name: 'User A Workspace',
                dbPath: userADbPath,
                isActive: true,
            },
        });
        profileAId = profileA.id;
        // Associate UserProfile
        await prisma_1.systemPrisma.userProfile.create({
            data: {
                userId: userAId,
                profileId: profileAId,
                role: 'ADMIN',
                isActive: true,
            },
        });
        // Create DatabaseRegistry entry
        const registryA = await prisma_1.systemPrisma.databaseRegistry.create({
            data: {
                databaseId: 'dbreg_usera_001',
                displayName: 'User A Workspace DB',
                canonicalPath: path_1.default.resolve(userADbPath),
                profileId: profileAId,
                installationId: inst.id,
                status: 'ACTIVE',
            },
        });
        registryAId = registryA.id;
    });
    (0, vitest_1.afterAll)(async () => {
        // Cleanup control plane records
        try {
            await prisma_1.systemPrisma.userProfile.deleteMany({ where: { userId: userAId } });
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({ where: { id: registryAId } });
            await prisma_1.systemPrisma.profile.deleteMany({ where: { id: profileAId } });
            await prisma_1.systemPrisma.user.deleteMany({ where: { id: userAId } });
        }
        catch { }
        if (fs_1.default.existsSync(testDir)) {
            try {
                fs_1.default.rmSync(testDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('P0-1: prevents deactivation or deletion of primary admin "stavan"', async () => {
        let stavan = await prisma_1.systemPrisma.user.findFirst({
            where: { username: { equals: 'stavan' } },
        });
        if (!stavan) {
            stavan = await prisma_1.systemPrisma.user.create({
                data: {
                    username: 'stavan',
                    passwordHash: 'mock_stavan_hash',
                    displayName: 'Stavan Admin',
                    role: 'ADMIN',
                    isActive: true,
                },
            });
        }
        await (0, vitest_1.expect)(user_lifecycle_service_1.userLifecycleService.deactivateUser(stavan.id)).rejects.toThrow(errors_1.ValidationError);
        await (0, vitest_1.expect)(user_lifecycle_service_1.userLifecycleService.deleteUser(stavan.id)).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('P0-1: deactivating a user preserves database file, registry, and customer data', async () => {
        const res = await user_lifecycle_service_1.userLifecycleService.deactivateUser(userAId, 'VACATION_INACTIVE');
        (0, vitest_1.expect)(res.success).toBe(true);
        // Verify User record is deactivated
        const updatedUser = await prisma_1.systemPrisma.user.findUnique({ where: { id: userAId } });
        (0, vitest_1.expect)(updatedUser?.isActive).toBe(false);
        // UserProfile is marked inactive
        const up = await prisma_1.systemPrisma.userProfile.findFirst({ where: { userId: userAId } });
        (0, vitest_1.expect)(up?.isActive).toBe(false);
        // Invariant: Database file MUST exist on disk
        (0, vitest_1.expect)(fs_1.default.existsSync(userADbPath)).toBe(true);
        // Invariant: DatabaseRegistry MUST remain preserved
        const reg = await prisma_1.systemPrisma.databaseRegistry.findUnique({ where: { id: registryAId } });
        (0, vitest_1.expect)(reg).not.toBeNull();
        (0, vitest_1.expect)(reg?.canonicalPath).toBe(path_1.default.resolve(userADbPath));
        // Invariant: Business data intact inside SQLite
        const userPrisma = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(userADbPath)}` });
        const rows = await userPrisma.$queryRawUnsafe("SELECT * FROM Stock WHERE id = 'stock_101'");
        await userPrisma.$disconnect();
        (0, vitest_1.expect)(rows).toHaveLength(1);
        (0, vitest_1.expect)(rows[0].stockCode).toBe('LOT-A-99');
        (0, vitest_1.expect)(rows[0].name).toBe('High Quality Diamond A');
    });
    (0, vitest_1.it)('P0-1: deleting a user soft-deletes the user and strictly preserves database and profile', async () => {
        const res = await user_lifecycle_service_1.userLifecycleService.deleteUser(userAId, 'ACCOUNT_TERMINATED');
        (0, vitest_1.expect)(res.success).toBe(true);
        (0, vitest_1.expect)(res.databasePreserved).toBe(true);
        // Verify User record is soft-deleted
        const deletedUser = await prisma_1.systemPrisma.user.findUnique({ where: { id: userAId } });
        (0, vitest_1.expect)(deletedUser?.isActive).toBe(false);
        (0, vitest_1.expect)(deletedUser?.deletedAt).not.toBeNull();
        // Database file MUST remain untouched on disk
        (0, vitest_1.expect)(fs_1.default.existsSync(userADbPath)).toBe(true);
        // DatabaseRegistry remains preserved
        const reg = await prisma_1.systemPrisma.databaseRegistry.findUnique({ where: { id: registryAId } });
        (0, vitest_1.expect)(reg).not.toBeNull();
        // AuditEvent must be recorded
        const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
            where: {
                eventType: 'USER_DELETED',
                description: { contains: 'usera_test' },
            },
        });
        (0, vitest_1.expect)(audit).not.toBeNull();
    });
    (0, vitest_1.it)('P0-2: deleted user database remains discoverable with DELETED_USER ownership status', async () => {
        const candidates = await recovery_service_1.recoveryService.discoverCandidates(testDir);
        const candidateA = candidates.candidates.find((c) => path_1.default.resolve(c.canonicalPath) === path_1.default.resolve(userADbPath));
        (0, vitest_1.expect)(candidateA).toBeDefined();
        (0, vitest_1.expect)(candidateA?.ownershipStatus).toBe('DELETED_USER');
        (0, vitest_1.expect)(candidateA?.previousOwnerUsername).toBe('usera_test');
        (0, vitest_1.expect)(candidateA?.source).toBeDefined();
    });
    (0, vitest_1.it)('P0-15: User B cannot automatically inherit or attach User A database', async () => {
        // Create User B
        const userB = await prisma_1.systemPrisma.user.create({
            data: {
                username: 'userb_test',
                passwordHash: 'mock_hash_b',
                displayName: 'User B Diamonds',
                role: 'ADMIN',
                isActive: true,
            },
        });
        try {
            // User B must not have any profile pointing to User A's database
            const userBProfiles = await prisma_1.systemPrisma.userProfile.findMany({
                where: { userId: userB.id },
                include: { profile: true },
            });
            const userBHasDbA = userBProfiles.some((up) => Boolean(up.profile?.dbPath && path_1.default.resolve(up.profile.dbPath) === path_1.default.resolve(userADbPath)));
            (0, vitest_1.expect)(userBHasDbA).toBe(false);
            // Discovery alone does NOT attach candidate to User B
            await recovery_service_1.recoveryService.discoverCandidates(testDir);
            const userBProfilesAfter = await prisma_1.systemPrisma.userProfile.findMany({
                where: { userId: userB.id },
            });
            (0, vitest_1.expect)(userBProfilesAfter).toHaveLength(0);
        }
        finally {
            await prisma_1.systemPrisma.user.delete({ where: { id: userB.id } });
        }
    });
    (0, vitest_1.it)('P0-14: Candidate database passes Phase 5 validation engine', async () => {
        const preview = await recovery_service_1.recoveryService.inspectCandidate(userADbPath);
        (0, vitest_1.expect)(preview.suitability).toBe('REQUIRES_CONFIRMATION');
        (0, vitest_1.expect)(preview.ownershipStatus).toBe('DELETED_USER');
        (0, vitest_1.expect)(preview.previousOwnerUsername).toBe('usera_test');
        (0, vitest_1.expect)(preview.tableCount).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=phase7-user-deletion-preservation.test.js.map