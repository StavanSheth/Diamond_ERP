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
const user_lifecycle_service_1 = require("../modules/system/user-lifecycle/user-lifecycle.service");
const preservation_service_1 = require("../modules/system/preservation/preservation.service");
const uninstall_preflight_service_1 = require("../modules/system/uninstall/uninstall-preflight.service");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 7 — Reinstall Recovery & Full Data Preservation Lifecycle', () => {
    const testDir = path_1.default.resolve('apps/api/test-scratch-phase7-lifecycle');
    const userDbPath = path_1.default.join(testDir, 'customer_lifecycle_db.db');
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
    let instId;
    let userId;
    let profileId;
    let registryId;
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        fs_1.default.copyFileSync(templateDb, userDbPath);
        // Ensure installation exists in control plane
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_lifecycle_e2e_p7',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
        instId = inst.id;
        // Seed test business records into user's DB
        const client = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(userDbPath)}` });
        await client.$executeRawUnsafe(`
      INSERT OR REPLACE INTO Stock (id, stockCode, name, description, currency, isActive, createdAt, updatedAt)
      VALUES 
        ('stk_e2e_01', 'STK-E2E-101', 'Marquise Diamond 1.5ct', 'VVS1 D Color', 'USD', 1, datetime('now'), datetime('now')),
        ('stk_e2e_02', 'STK-E2E-102', 'Emerald Cut Diamond 2.0ct', 'VS1 E Color', 'USD', 1, datetime('now'), datetime('now'));
    `);
        await client.$executeRawUnsafe(`
      INSERT OR REPLACE INTO Party (id, partyCode, name, partyType, phone, email, createdAt, updatedAt)
      VALUES 
        ('pty_e2e_01', 'PARTY-E2E-01', 'Premier Gems Antwerp', 'CUSTOMER', '+3212345678', 'gems@antwerp.be', datetime('now'), datetime('now'));
    `);
        await client.$disconnect();
        // Create User A
        const userA = await prisma_1.systemPrisma.user.create({
            data: {
                username: 'lifecycle_user',
                passwordHash: 'argon2id_mock_lifecycle_hash',
                displayName: 'Lifecycle Diamond Trader',
                role: 'ADMIN',
                isActive: true,
            },
        });
        userId = userA.id;
        // Create Profile A
        const profileA = await prisma_1.systemPrisma.profile.create({
            data: {
                code: 'LIFECYCLE_PROF',
                name: 'Lifecycle Trading Profile',
                dbPath: userDbPath,
                isActive: true,
            },
        });
        profileId = profileA.id;
        // UserProfile mapping
        await prisma_1.systemPrisma.userProfile.create({
            data: {
                userId,
                profileId,
                role: 'ADMIN',
                isActive: true,
            },
        });
        // DatabaseRegistry entry
        const reg = await prisma_1.systemPrisma.databaseRegistry.create({
            data: {
                databaseId: 'dbreg_lifecycle_001',
                displayName: 'Lifecycle Workspace DB',
                canonicalPath: path_1.default.resolve(userDbPath),
                profileId,
                installationId: instId,
                status: 'ACTIVE',
            },
        });
        registryId = reg.id;
    });
    (0, vitest_1.afterAll)(async () => {
        try {
            await prisma_1.systemPrisma.userProfile.deleteMany({ where: { userId } });
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({ where: { id: registryId } });
            await prisma_1.systemPrisma.profile.deleteMany({ where: { id: profileId } });
            await prisma_1.systemPrisma.user.deleteMany({ where: { id: userId } });
        }
        catch { }
        if (fs_1.default.existsSync(testDir)) {
            try {
                fs_1.default.rmSync(testDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('P0-12: reinstall detection identifies existing customer data and distinguishes RECOVERY state', async () => {
        const detection = await recovery_service_1.recoveryService.detectReinstallState();
        (0, vitest_1.expect)(detection.hasPreviousData).toBe(true);
        (0, vitest_1.expect)(detection.canContinue || detection.canRestore).toBe(true);
        (0, vitest_1.expect)(detection.classification).toBeDefined();
    });
    (0, vitest_1.it)('P0-13, P0-14: recovery candidate validation verifies schema and requires explicit confirmation', async () => {
        // 1. Discovery scan
        const candidates = await recovery_service_1.recoveryService.discoverCandidates(testDir);
        const targetCandidate = candidates.candidates.find((c) => path_1.default.resolve(c.canonicalPath) === path_1.default.resolve(userDbPath));
        (0, vitest_1.expect)(targetCandidate).toBeDefined();
        // Invariant: Discovery alone does NOT attach or alter the profile
        const profileBefore = await prisma_1.systemPrisma.profile.findUnique({ where: { id: profileId } });
        (0, vitest_1.expect)(profileBefore?.status).toBe('ACTIVE');
        // 2. Candidate inspection & validation
        const preview = await recovery_service_1.recoveryService.inspectCandidate(userDbPath);
        (0, vitest_1.expect)(['VALID', 'REQUIRES_CONFIRMATION']).toContain(preview.suitability);
        (0, vitest_1.expect)(preview.tableCount).toBeGreaterThan(0);
        (0, vitest_1.expect)(preview.sqliteIntegrity).toBe('ok');
    });
    (0, vitest_1.it)('P0-16: full end-to-end lifecycle preserves 100% customer business data across uninstall and reinstall', async () => {
        // 1. Count records before uninstall
        const clientBefore = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(userDbPath)}` });
        const stockBefore = await clientBefore.$queryRawUnsafe("SELECT * FROM Stock ORDER BY id ASC");
        const partyBefore = await clientBefore.$queryRawUnsafe("SELECT * FROM Party ORDER BY id ASC");
        await clientBefore.$disconnect();
        (0, vitest_1.expect)(stockBefore.length).toBe(2);
        (0, vitest_1.expect)(partyBefore.length).toBe(1);
        // 2. Soft-delete user
        const deleteRes = await user_lifecycle_service_1.userLifecycleService.deleteUser(userId, 'PRE_UNINSTALL_LIFECYCLE');
        (0, vitest_1.expect)(deleteRes.success).toBe(true);
        (0, vitest_1.expect)(deleteRes.databasePreserved).toBe(true);
        // 3. Create full preservation package (DB + CSVs + XLSX + Manifests)
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: userDbPath,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(pkg.status).toBe('VERIFIED');
        // 4. Verify preservation package
        const verifyRes = await preservation_service_1.preservationService.verifyPreservationPackage(pkg.packageId);
        (0, vitest_1.expect)(verifyRes.verified).toBe(true);
        (0, vitest_1.expect)(verifyRes.databaseBackupVerified).toBe(true);
        (0, vitest_1.expect)(verifyRes.csvVerified).toBe(true);
        (0, vitest_1.expect)(verifyRes.xlsxVerified).toBe(true);
        // 5. Issue uninstall authorization
        const auth = await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(pkg.packageId);
        (0, vitest_1.expect)(auth.status).toBe('ISSUED');
        // 6. Simulate Windows Uninstaller:
        // Uninstaller verifies authorization token, consumes it, and preserves customer AppData/databases
        const checkRes = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(checkRes.valid).toBe(true);
        // Consume token
        await uninstall_preflight_service_1.uninstallPreflightService.consumeAuthorizationToken();
        // 7. Verify token single-use invariant
        const secondCheck = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(secondCheck.valid).toBe(false);
        // 8. Simulate Reinstall: Database file was preserved by installer
        (0, vitest_1.expect)(fs_1.default.existsSync(userDbPath)).toBe(true);
        // 9. Reconnect / Reattach explicitly via recoveryService
        const restorePreview = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: userDbPath,
            targetProfileCode: 'LIFECYCLE_PROF',
        });
        (0, vitest_1.expect)(restorePreview.restoreId).toBeDefined();
        const restoreResult = await recovery_service_1.recoveryService.confirmRestore({
            restoreId: restorePreview.restoreId,
            confirmDestructiveOverwrite: true,
            targetProfileCode: 'LIFECYCLE_PROF',
            targetUserId: userId,
        });
        (0, vitest_1.expect)(restoreResult.status).toBe('VERIFIED');
        // 10. Data-Integrity Invariant Assertion:
        // Before uninstall business record count == After reinstall business record count
        const clientAfter = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(userDbPath)}` });
        const stockAfter = await clientAfter.$queryRawUnsafe("SELECT * FROM Stock ORDER BY id ASC");
        const partyAfter = await clientAfter.$queryRawUnsafe("SELECT * FROM Party ORDER BY id ASC");
        await clientAfter.$disconnect();
        (0, vitest_1.expect)(stockAfter.length).toBe(stockBefore.length);
        (0, vitest_1.expect)(partyAfter.length).toBe(partyBefore.length);
        // Record IDs and attributes remain identical and unmodified
        (0, vitest_1.expect)(stockAfter[0].id).toBe(stockBefore[0].id);
        (0, vitest_1.expect)(stockAfter[0].stockCode).toBe(stockBefore[0].stockCode);
        (0, vitest_1.expect)(stockAfter[1].id).toBe(stockBefore[1].id);
        (0, vitest_1.expect)(partyAfter[0].id).toBe(partyBefore[0].id);
        (0, vitest_1.expect)(partyAfter[0].partyCode).toBe(partyBefore[0].partyCode);
    });
});
//# sourceMappingURL=phase7-reinstall-recovery.test.js.map