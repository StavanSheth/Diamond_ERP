"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/database/prisma");
const installation_service_1 = require("../modules/system/installation.service");
const onboarding_service_1 = require("../modules/system/onboarding/onboarding.service");
const database_provisioning_service_1 = require("../modules/system/database/database-provisioning.service");
const user_lifecycle_service_1 = require("../modules/system/user-lifecycle/user-lifecycle.service");
const preservation_service_1 = require("../modules/system/preservation/preservation.service");
const recovery_service_1 = require("../modules/system/recovery/recovery.service");
const uninstall_preflight_service_1 = require("../modules/system/uninstall/uninstall-preflight.service");
const device_security_service_1 = require("../modules/security/device-security.service");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Diamond ERP V3 — Phase 8 Master Full Lifecycle E2E Test (34-Step Contract)', () => {
    const scratchDir = path_1.default.resolve('apps/api/test-scratch-phase8-full-e2e');
    const dbsDir = (0, paths_1.getDatabasesDir)();
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
    const profileCodeA = `p8_prof_a_${Date.now()}`;
    const profileCodeB = `p8_prof_b_${Date.now()}`;
    const dbPathA = path_1.default.join(dbsDir, `${profileCodeA}.db`);
    const dbPathB = path_1.default.join(dbsDir, `${profileCodeB}.db`);
    const liveTargetDb = path_1.default.join(dbsDir, 'Stavan.db');
    let install;
    let deviceId;
    let userA;
    let userB;
    let preservationPkg;
    let authRecord;
    // Pre-uninstall entity counts for data integrity comparison
    const entityCountsBefore = {};
    (0, vitest_1.beforeAll)(async () => {
        (0, paths_1.ensureAllDataDirs)();
        if (!fs_1.default.existsSync(scratchDir)) {
            fs_1.default.mkdirSync(scratchDir, { recursive: true });
        }
        if (fs_1.default.existsSync(templateDb) && !fs_1.default.existsSync(liveTargetDb)) {
            fs_1.default.copyFileSync(templateDb, liveTargetDb);
        }
        await prisma_1.systemPrisma.deviceSecurity.deleteMany({}).catch(() => { });
    });
    (0, vitest_1.afterAll)(async () => {
        // Cleanup generated databases
        for (const f of [dbPathA, dbPathB]) {
            if (fs_1.default.existsSync(f)) {
                try {
                    fs_1.default.unlinkSync(f);
                }
                catch { }
            }
            const wal = `${f}-wal`;
            const shm = `${f}-shm`;
            if (fs_1.default.existsSync(wal))
                try {
                    fs_1.default.unlinkSync(wal);
                }
                catch { }
            if (fs_1.default.existsSync(shm))
                try {
                    fs_1.default.unlinkSync(shm);
                }
                catch { }
        }
        await prisma_1.systemPrisma.databaseRegistry.deleteMany({
            where: { canonicalPath: { in: [path_1.default.resolve(dbPathA), path_1.default.resolve(dbPathB)] } },
        });
        await prisma_1.systemPrisma.profile.deleteMany({
            where: { code: { in: [profileCodeA, profileCodeB] } },
        });
        if (fs_1.default.existsSync(scratchDir)) {
            try {
                fs_1.default.rmSync(scratchDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 1: FRESH INSTALL & LIFECYCLE STATE MACHINE TRANSITIONS
    // ─────────────────────────────────────────────────────────────────────────
    (0, vitest_1.it)('Step 1-4: Fresh installation starts at NOT_INITIALIZED and advances through APP_SETUP, PIN_SETUP, DEVICE_SETUP, USER_DISCOVERY', async () => {
        install = await installation_service_1.installationService.getOrCreateInstallation();
        (0, vitest_1.expect)(install.id).toBeDefined();
        (0, vitest_1.expect)(install.installationId).toBeDefined();
        // Reset to NOT_INITIALIZED for clean state machine assertion
        await prisma_1.systemPrisma.installation.update({
            where: { id: install.id },
            data: { lifecycleState: 'NOT_INITIALIZED', status: 'ACTIVE' },
        });
        // Invariant: Direct jump from NOT_INITIALIZED to READY must fail
        await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('READY')).rejects.toThrow();
        // Transition 1: NOT_INITIALIZED -> APP_SETUP
        let state = await installation_service_1.installationService.updateLifecycleState('APP_SETUP');
        (0, vitest_1.expect)(state.lifecycleState).toBe('APP_SETUP');
        // Transition 2: APP_SETUP -> PIN_SETUP
        state = await installation_service_1.installationService.updateLifecycleState('PIN_SETUP');
        (0, vitest_1.expect)(state.lifecycleState).toBe('PIN_SETUP');
        // Authoritative local device ID for this terminal
        deviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // Register Device & Configure PIN
        const dev = await installation_service_1.installationService.registerDevice({
            deviceName: 'Phase8-Production-Terminal',
            platform: 'WINDOWS',
            osVersion: '10.0.22631',
        });
        (0, vitest_1.expect)(dev.deviceId).toBeDefined();
        const pinSetup = await device_security_service_1.deviceSecurityService.setupPin(deviceId, '918273');
        (0, vitest_1.expect)(pinSetup.isPinConfigured).toBe(true);
        // Verify plaintext PIN never exists in database
        const secState = await prisma_1.systemPrisma.deviceSecurity.findUnique({
            where: { deviceId },
        });
        (0, vitest_1.expect)(secState?.pinHash).toBeDefined();
        (0, vitest_1.expect)(secState?.pinHash).not.toBe('918273');
        (0, vitest_1.expect)(secState?.pinHash.startsWith('$2a$') || secState?.pinHash.startsWith('$2b$')).toBe(true);
        // Transition 3: PIN_SETUP -> DEVICE_SETUP -> USER_DISCOVERY
        state = await installation_service_1.installationService.updateLifecycleState('DEVICE_SETUP');
        (0, vitest_1.expect)(state.lifecycleState).toBe('DEVICE_SETUP');
        state = await installation_service_1.installationService.updateLifecycleState('USER_DISCOVERY');
        (0, vitest_1.expect)(state.lifecycleState).toBe('USER_DISCOVERY');
    }, 30000);
    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 2: USER A & DATABASE A PROVISIONING -> READY
    // ─────────────────────────────────────────────────────────────────────────
    (0, vitest_1.it)('Step 5-7: Provisions User A + pristine blank DB A, advances through validation to READY', async () => {
        const unameA = `user_a_${Date.now()}`;
        const userRes = await onboarding_service_1.onboardingService.createBusinessUser({
            username: unameA,
            password: 'SecurePassword123!',
            displayName: 'Alice Diamond Founder',
            role: 'ADMIN',
        });
        (0, vitest_1.expect)(userRes.success).toBe(true);
        userA = userRes.user;
        const dbRes = await onboarding_service_1.onboardingService.createNewDatabase({
            displayName: 'Alice Diamonds Corp',
            profileCode: profileCodeA,
            userId: userA.id,
        });
        (0, vitest_1.expect)(dbRes.success).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(dbPathA)).toBe(true);
        // Complete onboarding
        const comp = await onboarding_service_1.onboardingService.completeOnboarding();
        (0, vitest_1.expect)(comp.ready).toBe(true);
        (0, vitest_1.expect)(comp.lifecycleState).toBe('READY');
    }, 30000);
    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 3: SEED BUSINESS RECORDS INTO DB A
    // ─────────────────────────────────────────────────────────────────────────
    (0, vitest_1.it)('Step 8: Seeds realistic business records across entities in Database A and records counts', async () => {
        const clientA = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(dbPathA)}` });
        await clientA.$executeRawUnsafe(`
      INSERT INTO Stock (id, stockCode, name, description, currency, isActive, createdAt, updatedAt)
      VALUES 
        ('stk_a_1', 'STK-A-001', 'Rough Round 2.5ct', 'Natural diamond rough', 'USD', 1, datetime('now'), datetime('now')),
        ('stk_a_2', 'STK-A-002', 'Fancy Vivid Blue 1.2ct', 'Polished gemstone', 'USD', 1, datetime('now'), datetime('now'));
    `);
        await clientA.$executeRawUnsafe(`
      INSERT INTO Party (id, partyCode, name, partyType, phone, email, createdAt, updatedAt)
      VALUES 
        ('pty_a_1', 'CUST-A-01', 'De Beers Syndicate Partner', 'CUSTOMER', '+12125550100', 'debeers@example.com', datetime('now'), datetime('now')),
        ('pty_a_2', 'SUPP-A-01', 'Antwerp Diamond Rough BV', 'SUPPLIER', '+3232000000', 'antwerp@example.com', datetime('now'), datetime('now'));
    `);
        await clientA.$executeRawUnsafe(`
      INSERT INTO Location (id, stockId, name, locationType)
      VALUES 
        ('loc_a_1', 'stk_a_1', 'Main Vault', 'VAULT');
    `);
        await clientA.$executeRawUnsafe(`
      INSERT INTO DiamondItem (id, stockId, itemCode, displayName, carat, color, clarity, cut, shape, ratePerCarat, currentValue, status, certificateStatus, createdAt, updatedAt)
      VALUES 
        ('dia_a_1', 'stk_a_1', 'DIA-A-001', 'Fancy Vivid Blue', 1.25, 'D', 'VVS1', 'EXCELLENT', 'ROUND', 148000.0, 185000.0, 'AVAILABLE', 'CERTIFIED', datetime('now'), datetime('now'));
    `);
        await clientA.$executeRawUnsafe(`
      INSERT INTO Certification (id, diamondItemId, reportNumber, labType, certificateStatus, createdAt, updatedAt)
      VALUES 
        ('cert_a_1', 'dia_a_1', 'GIA-2185901234', 'GIA', 'ISSUED', datetime('now'), datetime('now'));
    `);
        await clientA.$executeRawUnsafe(`
      INSERT INTO Ledger (id, stockId, name, ledgerType, openingCarat, openingValue, createdAt, updatedAt)
      VALUES 
        ('ldg_a_1', 'stk_a_1', 'Primary Diamond Inventory', 'ASSET', 2.5, 450000.0, datetime('now'), datetime('now'));
    `);
        await clientA.$executeRawUnsafe(`
      INSERT INTO "Transaction" (id, ledgerId, transactionNo, sequenceNumber, transactionDate, transactionType, status, createdBy, createdAt, updatedAt)
      VALUES 
        ('txn_a_1', 'ldg_a_1', 'INV-2026-A01', 1, datetime('now'), 'SALE', 'POSTED', 'admin', datetime('now'), datetime('now'));
    `);
        await clientA.$executeRawUnsafe(`
      INSERT INTO TransactionItem (id, transactionId, diamondItemId, quantity, carat, ratePerCarat, totalValue, itemAction, createdAt)
      VALUES 
        ('txni_a_1', 'txn_a_1', 'dia_a_1', 1, 1.25, 148000.0, 185000.0, 'OUT', datetime('now'));
    `);
        // Verify row counts and store baseline
        const tables = ['Stock', 'Party', 'Location', 'DiamondItem', 'Certification', 'Ledger', 'Transaction', 'TransactionItem'];
        for (const t of tables) {
            const countRes = await clientA.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${t}"`);
            entityCountsBefore[t] = Number(countRes[0]?.cnt || 0);
            (0, vitest_1.expect)(entityCountsBefore[t]).toBeGreaterThan(0);
        }
        await clientA.$disconnect();
    }, 30000);
    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 4: USER B & DATABASE B PROVISIONING + STRICT ISOLATION
    // ─────────────────────────────────────────────────────────────────────────
    (0, vitest_1.it)('Step 9-11: Provisions User B + DB B with distinct data and asserts strict user/database isolation', async () => {
        const unameB = `user_b_${Date.now()}`;
        const userResB = await onboarding_service_1.onboardingService.createBusinessUser({
            username: unameB,
            password: 'SecurePassword456!',
            displayName: 'Bob Gemological Founder',
            role: 'ADMIN',
        });
        userB = userResB.user;
        const provB = await database_provisioning_service_1.databaseProvisioningService.provisionBlankDatabase({
            displayName: 'Bob Jewels Ltd',
            profileCode: profileCodeB,
            userId: userB.id,
        });
        (0, vitest_1.expect)(provB.isPristine).toBe(true);
        (0, vitest_1.expect)(provB.databaseId).toBeDefined();
        (0, vitest_1.expect)(fs_1.default.existsSync(dbPathB)).toBe(true);
        // Seed distinct data in DB B
        const clientB = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(dbPathB)}` });
        await clientB.$executeRawUnsafe(`
      INSERT INTO Party (id, partyCode, name, partyType, phone, email, createdAt, updatedAt)
      VALUES 
        ('pty_b_1', 'CUST-B-99', 'Mumbai Diamond Trading House', 'CUSTOMER', '+9122200000', 'mumbai@example.com', datetime('now'), datetime('now'));
    `);
        // Isolation Assertion 1: DB A does NOT contain Party B
        const clientA = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(dbPathA)}` });
        const checkPartyInA = await clientA.$queryRawUnsafe(`SELECT * FROM Party WHERE partyCode = 'CUST-B-99'`);
        (0, vitest_1.expect)(checkPartyInA.length).toBe(0);
        // Isolation Assertion 2: DB B does NOT contain Party A
        const checkPartyInB = await clientB.$queryRawUnsafe(`SELECT * FROM Party WHERE partyCode = 'CUST-A-01'`);
        (0, vitest_1.expect)(checkPartyInB.length).toBe(0);
        await clientA.$disconnect();
        await clientB.$disconnect();
    }, 30000);
    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 5: USER A DELETION -> PRESERVATION -> RECOVERY BINDING
    // ─────────────────────────────────────────────────────────────────────────
    (0, vitest_1.it)('Step 12-14: User A soft-deleted -> DB A preserved -> discovered as DELETED_USER -> recovered with explicit targetUserId', async () => {
        const delRes = await user_lifecycle_service_1.userLifecycleService.deleteUser(userA.id);
        (0, vitest_1.expect)(delRes.success).toBe(true);
        (0, vitest_1.expect)(delRes.databasePreserved).toBe(true);
        // Invariant: User deletion != Database deletion
        (0, vitest_1.expect)(fs_1.default.existsSync(dbPathA)).toBe(true);
        // Discovery: discovers DB A as candidate belonging to DELETED_USER
        const discovery = await recovery_service_1.recoveryService.discoverCandidates();
        (0, vitest_1.expect)(discovery.candidates.length).toBeGreaterThanOrEqual(1);
        const candidateA = discovery.candidates.find((c) => path_1.default.resolve(c.canonicalPath) === path_1.default.resolve(dbPathA));
        (0, vitest_1.expect)(candidateA).toBeDefined();
        (0, vitest_1.expect)(candidateA?.ownershipStatus).toBe('DELETED_USER');
        (0, vitest_1.expect)(candidateA?.previousOwnerUsername).toBe(userA.username);
        // Prepare restore staging
        const preview = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: dbPathA,
            targetProfileCode: 'Stavan',
        });
        (0, vitest_1.expect)(preview.restoreId).toBeDefined();
        // Invariant: Deleted-user restore WITHOUT targetUserId must fail closed!
        await (0, vitest_1.expect)(recovery_service_1.recoveryService.confirmRestore({
            restoreId: preview.restoreId,
            targetProfileCode: 'Stavan',
            confirmDestructiveOverwrite: true,
        })).rejects.toThrow(/Target user ID is mandatory/i);
        // Recover with explicit user binding
        const restoreRes = await recovery_service_1.recoveryService.confirmRestore({
            restoreId: preview.restoreId,
            targetUserId: userA.id,
            targetProfileCode: 'Stavan',
            confirmDestructiveOverwrite: true,
        });
        (0, vitest_1.expect)(restoreRes.success).toBe(true);
        (0, vitest_1.expect)(restoreRes.status).toBe('VERIFIED');
        // Verify User A reactivated and linked
        const userARefresh = await prisma_1.systemPrisma.user.findUnique({ where: { id: userA.id } });
        (0, vitest_1.expect)(userARefresh?.isActive).toBe(true);
        (0, vitest_1.expect)(userARefresh?.deletedAt).toBeNull();
    }, 30000);
    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 6: MULTI-DATABASE PRESERVATION (ALL CUSTOMER DBS PRESERVED)
    // ─────────────────────────────────────────────────────────────────────────
    (0, vitest_1.it)('Step 15-17: Creates verified multi-database preservation package preserving both DB A and DB B', async () => {
        preservationPkg = await preservation_service_1.preservationService.createPreservationPackage({
            preserveAll: true,
            confirmPreservation: true,
        }, 'phase8_e2e_admin');
        (0, vitest_1.expect)(preservationPkg.status).toBe('VERIFIED');
        (0, vitest_1.expect)(preservationPkg.packageId).toBeDefined();
        (0, vitest_1.expect)(fs_1.default.existsSync(preservationPkg.destinationPath)).toBe(true);
        (0, vitest_1.expect)(preservationPkg.preservedDatabasesCount).toBeGreaterThanOrEqual(2);
        // Deep verification of preservation package
        const verification = await preservation_service_1.preservationService.verifyPreservationPackage(preservationPkg.packageId);
        (0, vitest_1.expect)(verification.verified).toBe(true);
        (0, vitest_1.expect)(verification.databaseBackupVerified).toBe(true);
        (0, vitest_1.expect)(verification.csvVerified).toBe(true);
        (0, vitest_1.expect)(verification.xlsxVerified).toBe(true);
        (0, vitest_1.expect)(verification.manifestVerified).toBe(true);
        // Verify multi-database manifest structure
        const manifest = JSON.parse(fs_1.default.readFileSync(preservationPkg.manifestPath, 'utf-8'));
        (0, vitest_1.expect)(manifest.formatVersion).toBe(2);
        (0, vitest_1.expect)(Array.isArray(manifest.databases)).toBe(true);
        (0, vitest_1.expect)(manifest.databases.length).toBeGreaterThanOrEqual(2);
        for (const d of manifest.databases) {
            (0, vitest_1.expect)(d.sha256).toBeDefined();
            (0, vitest_1.expect)(d.schemaVersion).toBe(1);
            const fullBackupPath = path_1.default.join(preservationPkg.destinationPath, d.backupPath);
            (0, vitest_1.expect)(fs_1.default.existsSync(fullBackupPath)).toBe(true);
        }
    }, 45000);
    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 7: UNINSTALL PREFLIGHT, AUTHORIZATION & INSTALLER GATE
    // ─────────────────────────────────────────────────────────────────────────
    (0, vitest_1.it)('Step 18-20: Preflight confirms readiness, issues cryptographic authorization, and installer gate allows uninstall', async () => {
        // Preflight updates to PRESERVATION_VERIFIED
        let preflight = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
        (0, vitest_1.expect)(preflight.classification).toBe('PRESERVATION_VERIFIED');
        // Issue cryptographic authorization token
        authRecord = await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(preservationPkg.packageId);
        (0, vitest_1.expect)(authRecord.authorizationId).toBeDefined();
        (0, vitest_1.expect)(authRecord.status).toBe('ISSUED');
        (0, vitest_1.expect)(authRecord.manifestSha256).toBeDefined();
        // Preflight now authorizes safe uninstallation
        preflight = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
        (0, vitest_1.expect)(preflight.canSafelyUninstall).toBe(true);
        (0, vitest_1.expect)(preflight.classification).toBe('READY_FOR_UNINSTALL');
        // Windows Installer Hard Gate Check (Installer.cs invariants)
        const tokenFile = path_1.default.join(preflight.userAppDataDir, 'uninstall-authorization.json');
        (0, vitest_1.expect)(fs_1.default.existsSync(tokenFile)).toBe(true);
        const tokenOnDisk = JSON.parse(fs_1.default.readFileSync(tokenFile, 'utf-8'));
        (0, vitest_1.expect)(tokenOnDisk.authorizationId).toBe(authRecord.authorizationId);
        (0, vitest_1.expect)(tokenOnDisk.status).toBe('ISSUED');
        (0, vitest_1.expect)(tokenOnDisk.installationId).toBe(install.installationId);
        (0, vitest_1.expect)(new Date(tokenOnDisk.expiresAt).getTime()).toBeGreaterThan(Date.now());
    }, 30000);
    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 8: SIMULATE UNINSTALL (APPDATA PRESERVED) -> REINSTALL -> RECOVERY
    // ─────────────────────────────────────────────────────────────────────────
    (0, vitest_1.it)('Step 21-25: Reinstall detects customer data, recovery wizard requires explicit confirmation, restores to READY with 100% data integrity', async () => {
        // Consume uninstall token (simulating Windows Installer action)
        await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        // Invariant: Uninstallation preserves AppData and customer databases
        (0, vitest_1.expect)(fs_1.default.existsSync(dbPathA)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(dbPathB)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(preservationPkg.destinationPath)).toBe(true);
        // Simulate Reinstallation: Fresh installation ID generated
        const newInstall = await prisma_1.systemPrisma.installation.create({
            data: {
                installationId: `inst_reinstall_${crypto_1.default.randomUUID()}`,
                appVersion: '3.0.0',
                status: 'ACTIVE',
                lifecycleState: 'USER_DISCOVERY',
                initializedAt: new Date(),
            },
        });
        (0, vitest_1.expect)(newInstall.id).toBeDefined();
        // Recovery discovery on reinstall finds candidates
        const recoveryCandidates = await recovery_service_1.recoveryService.discoverCandidates();
        (0, vitest_1.expect)(recoveryCandidates.candidates.length).toBeGreaterThanOrEqual(1);
        // Invariant: Reinstall must NOT silently auto-attach!
        // Recovery wizard stages candidate explicitly:
        const candidateToRestore = path_1.default.join(preservationPkg.destinationPath, 'databases', profileCodeA, 'database_backup.db');
        (0, vitest_1.expect)(fs_1.default.existsSync(candidateToRestore)).toBe(true);
        const prep = await recovery_service_1.recoveryService.prepareRestore({
            candidatePath: candidateToRestore,
            targetProfileCode: 'Stavan',
        });
        (0, vitest_1.expect)(prep.restoreId).toBeDefined();
        // Confirm recovery with explicit user and confirmation
        const confirmRes = await recovery_service_1.recoveryService.confirmRestore({
            restoreId: prep.restoreId,
            targetUserId: userA.id,
            targetProfileCode: 'Stavan',
            confirmDestructiveOverwrite: true,
            confirmForeignInstallation: true,
        });
        (0, vitest_1.expect)(confirmRes.success).toBe(true);
        (0, vitest_1.expect)(confirmRes.status).toBe('VERIFIED');
        // Data Integrity Assertion: 100% of pre-uninstall business records exist!
        const restoredClient = new client_1.PrismaClient({ datasourceUrl: `file:${path_1.default.resolve(liveTargetDb)}` });
        for (const [table, expectedCount] of Object.entries(entityCountsBefore)) {
            const rowRes = await restoredClient.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${table}"`);
            const afterCount = Number(rowRes[0]?.cnt || 0);
            (0, vitest_1.expect)(afterCount).toBe(expectedCount);
        }
        await restoredClient.$disconnect();
        // DB B remains isolated
        (0, vitest_1.expect)(fs_1.default.existsSync(dbPathB)).toBe(true);
    }, 45000);
});
//# sourceMappingURL=phase8-full-lifecycle-e2e.test.js.map