"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uninstall_preflight_service_1 = require("../modules/system/uninstall/uninstall-preflight.service");
const preservation_service_1 = require("../modules/system/preservation/preservation.service");
const customer_data_detection_service_1 = require("../modules/system/uninstall/customer-data-detection.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 7 — Full End-to-End Enterprise Lifecycle Flow', () => {
    const testDir = path_1.default.resolve('apps/api/test-scratch-lifecycle-e2e');
    const testDbPath = path_1.default.join(testDir, 'lifecycle_customer.db');
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
    let instId;
    let preservationPackageId;
    let authorizationId;
    (0, vitest_1.beforeAll)(async () => {
        (0, paths_1.ensureAllDataDirs)();
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        fs_1.default.copyFileSync(templateDb, testDbPath);
        // Clean any previous artifacts
        await prisma_1.systemPrisma.uninstallAuthorization.deleteMany({});
        await prisma_1.systemPrisma.preservationPackage.deleteMany({});
        await prisma_1.systemPrisma.databaseRegistry.deleteMany({
            where: { databaseId: 'dbreg_e2e_lifecycle' },
        });
        // Ensure installation exists in control plane
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_e2e_full_lifecycle',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
        instId = inst.id;
        // Register test database in database registry
        await prisma_1.systemPrisma.databaseRegistry.create({
            data: {
                databaseId: 'dbreg_e2e_lifecycle',
                displayName: 'E2E Customer Database',
                canonicalPath: path_1.default.resolve(testDbPath),
                installationId: instId,
                status: 'ACTIVE',
            },
        });
    });
    (0, vitest_1.afterAll)(async () => {
        try {
            await prisma_1.systemPrisma.uninstallAuthorization.deleteMany({});
            await prisma_1.systemPrisma.preservationPackage.deleteMany({});
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({
                where: { databaseId: 'dbreg_e2e_lifecycle' },
            });
        }
        catch { }
        if (fs_1.default.existsSync(testDir)) {
            try {
                fs_1.default.rmSync(testDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('Step 1: System detects customer data presence and blocks uninstallation without preservation', async () => {
        const detection = await customer_data_detection_service_1.customerDataDetectionService.detectCustomerData();
        (0, vitest_1.expect)(detection.hasCustomerData).toBe(true);
        const preflight = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
        (0, vitest_1.expect)(preflight.canSafelyUninstall).toBe(false);
        (0, vitest_1.expect)(preflight.classification).toBe('CUSTOMER_DATA_PRESENT');
        (0, vitest_1.expect)(preflight.activeDatabasesCount).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(preflight.warningMessage).toContain('Customer databases detected');
    });
    (0, vitest_1.it)('Step 2: Creates full preservation package (backup + CSV + XLSX with all tables)', async () => {
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            confirmPreservation: true,
        }, 'lifecycle_tester');
        preservationPackageId = pkg.packageId;
        (0, vitest_1.expect)(pkg).toBeDefined();
        (0, vitest_1.expect)(pkg.packageId).toBeDefined();
        (0, vitest_1.expect)(pkg.status).toBe('VERIFIED');
        (0, vitest_1.expect)(pkg.manifestPath).toBeDefined();
        (0, vitest_1.expect)(fs_1.default.existsSync(pkg.manifestPath)).toBe(true);
        const manifest = JSON.parse(fs_1.default.readFileSync(pkg.manifestPath, 'utf-8'));
        (0, vitest_1.expect)(manifest.artifacts.databaseBackup.sha256).toBeDefined();
        (0, vitest_1.expect)(manifest.artifacts.csv.filesCount).toBe(16);
    });
    (0, vitest_1.it)('Step 3: Verification of preservation package integrity confirms byte-accurate completeness', async () => {
        const verification = await preservation_service_1.preservationService.verifyPreservationPackage(preservationPackageId);
        (0, vitest_1.expect)(verification.verified).toBe(true);
        (0, vitest_1.expect)(verification.status).toBe('VERIFIED');
        (0, vitest_1.expect)(verification.databaseBackupVerified).toBe(true);
        (0, vitest_1.expect)(verification.csvVerified).toBe(true);
        (0, vitest_1.expect)(verification.xlsxVerified).toBe(true);
        (0, vitest_1.expect)(verification.manifestVerified).toBe(true);
    });
    (0, vitest_1.it)('Step 4: Preflight updates to PRESERVATION_VERIFIED once package is verified', async () => {
        const preflight = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
        (0, vitest_1.expect)(preflight.classification).toBe('PRESERVATION_VERIFIED');
        (0, vitest_1.expect)(preflight.canSafelyUninstall).toBe(false);
        (0, vitest_1.expect)(preflight.latestPreservationPackageId).toBe(preservationPackageId);
        (0, vitest_1.expect)(preflight.warningMessage).toContain('Customer data verified and preserved');
    });
    (0, vitest_1.it)('Step 5: Issues cryptographically bound one-time uninstall authorization', async () => {
        const auth = await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(preservationPackageId);
        (0, vitest_1.expect)(auth.authorizationId).toBeDefined();
        (0, vitest_1.expect)(auth.status).toBe('ISSUED');
        (0, vitest_1.expect)(auth.installationId).toBeDefined();
        (0, vitest_1.expect)(auth.manifestSha256).toBeDefined();
        (0, vitest_1.expect)(auth.expiresAt).toBeDefined();
        (0, vitest_1.expect)(new Date(auth.expiresAt).getTime()).toBeGreaterThan(Date.now());
        authorizationId = auth.authorizationId;
        // Check on disk token file
        const preflight = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
        (0, vitest_1.expect)(preflight.canSafelyUninstall).toBe(true);
        (0, vitest_1.expect)(preflight.classification).toBe('READY_FOR_UNINSTALL');
    });
    (0, vitest_1.it)('Step 6: Consuming authorization token enforces single-use policy', async () => {
        const record = await prisma_1.systemPrisma.uninstallAuthorization.findUnique({
            where: { authorizationId },
        });
        (0, vitest_1.expect)(record).toBeDefined();
        (0, vitest_1.expect)(record.status).toBe('ISSUED');
        // Mark consumed as installer would
        await prisma_1.systemPrisma.uninstallAuthorization.update({
            where: { authorizationId },
            data: {
                status: 'CONSUMED',
                consumedAt: new Date(),
            },
        });
        const updated = await prisma_1.systemPrisma.uninstallAuthorization.findUnique({
            where: { authorizationId },
        });
        (0, vitest_1.expect)(updated.status).toBe('CONSUMED');
        (0, vitest_1.expect)(updated.consumedAt).toBeDefined();
        // With token consumed, preflight reverts to blocking
        const preflight = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
        (0, vitest_1.expect)(preflight.canSafelyUninstall).toBe(false);
    });
});
//# sourceMappingURL=phase7-full-lifecycle-e2e.test.js.map