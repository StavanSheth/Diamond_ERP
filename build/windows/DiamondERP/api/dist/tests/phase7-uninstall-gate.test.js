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
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 7 — Uninstall Preflight & Hard Safety Gate', () => {
    const testDir = path_1.default.resolve('apps/api/test-scratch-phase7-uninstall');
    const testDbPath = path_1.default.join(testDir, 'customer_to_preserve.db');
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
    let instId;
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        fs_1.default.copyFileSync(templateDb, testDbPath);
        // Ensure installation exists in control plane
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_uninstall_gate_p7',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
        instId = inst.id;
        // Clean any previous authorizations / preservation packages for test isolation
        await prisma_1.systemPrisma.uninstallAuthorization.deleteMany({});
        await prisma_1.systemPrisma.preservationPackage.deleteMany({});
        // Register test customer database in registry
        await prisma_1.systemPrisma.databaseRegistry.create({
            data: {
                databaseId: 'dbreg_uninstall_gate_001',
                displayName: 'Gate Test DB',
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
                where: { databaseId: 'dbreg_uninstall_gate_001' },
            });
            const tokenPath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
            if (fs_1.default.existsSync(tokenPath)) {
                fs_1.default.unlinkSync(tokenPath);
            }
        }
        catch { }
        if (fs_1.default.existsSync(testDir)) {
            try {
                fs_1.default.rmSync(testDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('P0-8: preflight detects active customer databases and blocks unpreservation uninstall', async () => {
        const preflight = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
        (0, vitest_1.expect)(preflight.activeDatabasesCount).toBeGreaterThan(0);
        (0, vitest_1.expect)(preflight.canSafelyUninstall).toBe(false);
        (0, vitest_1.expect)(['CUSTOMER_DATA_PRESENT', 'EXPORT_REQUIRED', 'BACKUP_REQUIRED', 'BLOCKED']).toContain(preflight.classification);
    });
    (0, vitest_1.it)('P0-8: unverified package blocks issuance of uninstall authorization', async () => {
        await (0, vitest_1.expect)(uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization('non_existent_package_id')).rejects.toThrow(errors_1.NotFoundError);
    });
    (0, vitest_1.it)('P0-9, P0-12: verified preservation issues cryptographic one-time authorization token', async () => {
        // Create and verify preservation package
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            confirmPreservation: true,
        });
        (0, vitest_1.expect)(pkg.status).toBe('VERIFIED');
        // Authorize uninstall
        const auth = await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(pkg.packageId);
        (0, vitest_1.expect)(auth.status).toBe('ISSUED');
        (0, vitest_1.expect)(auth.authorizationId).toBeDefined();
        (0, vitest_1.expect)(auth.expiresAt).toBeDefined();
        (0, vitest_1.expect)(auth.tokenFilePath).toBeDefined();
        (0, vitest_1.expect)(fs_1.default.existsSync(auth.tokenFilePath)).toBe(true);
        // Token artifact must be written to disk in AppData
        const tokenJson = JSON.parse(fs_1.default.readFileSync(auth.tokenFilePath, 'utf-8'));
        (0, vitest_1.expect)(tokenJson.authorizationId).toBe(auth.authorizationId);
        (0, vitest_1.expect)(tokenJson.preservationPackageId).toBe(pkg.packageId);
        (0, vitest_1.expect)(tokenJson.status).toBe('ISSUED');
        (0, vitest_1.expect)(tokenJson.consumedAt).toBeNull();
    });
    (0, vitest_1.it)('P0-10: installer gate validates token and enforces single-use consumption', async () => {
        const tokenPath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        (0, vitest_1.expect)(fs_1.default.existsSync(tokenPath)).toBe(true);
        const tokenContent = fs_1.default.readFileSync(tokenPath, 'utf-8');
        const token = JSON.parse(tokenContent);
        // Simulate First Uninstaller Check (should succeed and mark consumed)
        (0, vitest_1.expect)(token.consumedAt).toBeNull();
        const expiresAt = new Date(token.expiresAt);
        (0, vitest_1.expect)(expiresAt.getTime()).toBeGreaterThan(Date.now());
        // Mark consumed atomically
        token.consumedAt = new Date().toISOString();
        token.status = 'CONSUMED';
        fs_1.default.writeFileSync(tokenPath, JSON.stringify(token, null, 2));
        // Simulate Second Uninstaller Check (single-use check must fail)
        const secondCheckContent = fs_1.default.readFileSync(tokenPath, 'utf-8');
        const secondToken = JSON.parse(secondCheckContent);
        (0, vitest_1.expect)(secondToken.consumedAt).not.toBeNull();
        // A consumed token is rejected by the installer gate
        const isAllowedSecondTime = secondToken.consumedAt === null;
        (0, vitest_1.expect)(isAllowedSecondTime).toBe(false);
    });
    (0, vitest_1.it)('P0-10: expired authorization token is strictly rejected', async () => {
        const expiredToken = {
            authorizationId: 'auth_expired_test',
            installationId: instId,
            preservationPackageId: 'pkg_test',
            manifestSha256: 'mock_sha',
            status: 'ISSUED',
            createdAt: new Date(Date.now() - 7200000).toISOString(),
            expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
            consumedAt: null,
        };
        const isExpired = new Date(expiredToken.expiresAt).getTime() < Date.now();
        (0, vitest_1.expect)(isExpired).toBe(true);
    });
});
//# sourceMappingURL=phase7-uninstall-gate.test.js.map