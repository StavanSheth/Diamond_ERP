"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const uninstall_preflight_service_1 = require("../modules/system/uninstall/uninstall-preflight.service");
const preservation_service_1 = require("../modules/system/preservation/preservation.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 7 — Uninstall Authorization Security & Atomic Consumption', () => {
    const testDir = path_1.default.resolve('apps/api/test-scratch-phase7-auth-security');
    const testDbPath = path_1.default.join(testDir, 'security_customer.db');
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
    let instId;
    let validPackageId;
    let validManifestHash;
    let validPkgDestination;
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        fs_1.default.copyFileSync(templateDb, testDbPath);
        // Setup installation in system DB
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_auth_security_test',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
        instId = inst.installationId;
        // Clean test state
        await prisma_1.systemPrisma.uninstallAuthorization.deleteMany({});
        await prisma_1.systemPrisma.preservationPackage.deleteMany({});
        // Create and verify a valid preservation package
        const customExportDir = path_1.default.join(testDir, 'export_dest');
        const pkg = await preservation_service_1.preservationService.createPreservationPackage({
            databasePath: testDbPath,
            destinationDir: customExportDir,
            confirmPreservation: true,
        });
        validPackageId = pkg.packageId;
        validPkgDestination = pkg.destinationPath;
        const manifestContent = fs_1.default.readFileSync(pkg.manifestPath, 'utf-8');
        validManifestHash = crypto_1.default.createHash('sha256').update(manifestContent).digest('hex');
    });
    (0, vitest_1.afterAll)(async () => {
        try {
            await prisma_1.systemPrisma.uninstallAuthorization.deleteMany({});
            await prisma_1.systemPrisma.preservationPackage.deleteMany({});
        }
        catch { }
        if (fs_1.default.existsSync(testDir)) {
            try {
                fs_1.default.rmSync(testDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('Section 17 & 18: authorization is strictly bound to machine installationId', async () => {
        const auth = await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(validPackageId);
        (0, vitest_1.expect)(auth.status).toBe('ISSUED');
        (0, vitest_1.expect)(auth.authorizationId).toBeDefined();
        const tokenFilePath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        (0, vitest_1.expect)(fs_1.default.existsSync(tokenFilePath)).toBe(true);
        const tokenData = JSON.parse(fs_1.default.readFileSync(tokenFilePath, 'utf-8'));
        (0, vitest_1.expect)(tokenData.installationId).toBe(instId);
        (0, vitest_1.expect)(tokenData.nonce).toBeDefined();
        (0, vitest_1.expect)(tokenData.nonce.length).toBeGreaterThanOrEqual(16);
        // Simulate wrong installation check
        tokenData.installationId = 'wrong_foreign_machine_installation_id';
        fs_1.default.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');
        const checkResult = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(checkResult.valid).toBe(false);
        (0, vitest_1.expect)(checkResult.reason || checkResult.error).toContain('installation');
    });
    (0, vitest_1.it)('Section 19 & 40: authorization is strictly package-bound', async () => {
        await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(validPackageId);
        const tokenFilePath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        const tokenData = JSON.parse(fs_1.default.readFileSync(tokenFilePath, 'utf-8'));
        // Tamper with package ID
        tokenData.preservationPackageId = 'pkg_wrong_or_fabricated_package_id';
        fs_1.default.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');
        const checkResult = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(checkResult.valid).toBe(false);
        (0, vitest_1.expect)(checkResult.reason || checkResult.error).toContain('Preservation package ID does not match');
    });
    (0, vitest_1.it)('Section 20 & 39: authorization is strictly bound to preservation-manifest.json SHA-256 hash', async () => {
        await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(validPackageId);
        const tokenFilePath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        const tokenData = JSON.parse(fs_1.default.readFileSync(tokenFilePath, 'utf-8'));
        // 1. Check with wrong manifest hash in token
        tokenData.preservationManifestHash = '0000000000000000000000000000000000000000000000000000000000000000';
        fs_1.default.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');
        const checkWithWrongHash = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(checkWithWrongHash.valid).toBe(false);
        (0, vitest_1.expect)(checkWithWrongHash.reason || checkWithWrongHash.error).toContain('SHA-256 mismatch');
        // 2. Restore hash, but tamper with the actual manifest file on disk
        tokenData.preservationManifestHash = validManifestHash;
        fs_1.default.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');
        const manifestPath = path_1.default.join(validPkgDestination, 'preservation-manifest.json');
        const originalManifest = fs_1.default.readFileSync(manifestPath, 'utf-8');
        fs_1.default.appendFileSync(manifestPath, '\n/* tampered */');
        const checkWithTamperedManifest = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(checkWithTamperedManifest.valid).toBe(false);
        (0, vitest_1.expect)(checkWithTamperedManifest.reason || checkWithTamperedManifest.error).toContain('SHA-256 mismatch');
        // Restore original manifest
        fs_1.default.writeFileSync(manifestPath, originalManifest, 'utf-8');
    });
    (0, vitest_1.it)('Section 21: authorization verifies destination directory and preservation-manifest.json existence', async () => {
        await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(validPackageId);
        const tokenFilePath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        const tokenData = JSON.parse(fs_1.default.readFileSync(tokenFilePath, 'utf-8'));
        // Set non-existent destination
        tokenData.preservationDestinationPath = path_1.default.join(testDir, 'non_existent_folder');
        fs_1.default.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');
        const checkMissingDest = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(checkMissingDest.valid).toBe(false);
        (0, vitest_1.expect)(checkMissingDest.reason || checkMissingDest.error).toContain('destination directory does not exist');
    });
    (0, vitest_1.it)('Section 22 & 36: expired authorization token is strictly blocked', async () => {
        await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(validPackageId);
        const tokenFilePath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        const tokenData = JSON.parse(fs_1.default.readFileSync(tokenFilePath, 'utf-8'));
        tokenData.expiresAt = new Date(Date.now() - 60000).toISOString(); // Expired 1 min ago
        fs_1.default.writeFileSync(tokenFilePath, JSON.stringify(tokenData, null, 2), 'utf-8');
        const checkExpired = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(checkExpired.valid).toBe(false);
        (0, vitest_1.expect)(checkExpired.reason || checkExpired.error).toContain('expired');
    });
    (0, vitest_1.it)('Section 24 & 25 & 37: atomic consumption marks token and DB as CONSUMED and enforces single-use', async () => {
        const auth = await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(validPackageId);
        (0, vitest_1.expect)(auth.status).toBe('ISSUED');
        const initialCheck = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(initialCheck.valid).toBe(true);
        // Atomically consume token
        await uninstall_preflight_service_1.uninstallPreflightService.consumeAuthorizationToken();
        // 1. File state must be CONSUMED
        const tokenFilePath = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        const consumedToken = JSON.parse(fs_1.default.readFileSync(tokenFilePath, 'utf-8'));
        (0, vitest_1.expect)(consumedToken.status).toBe('CONSUMED');
        (0, vitest_1.expect)(consumedToken.consumedAt).not.toBeNull();
        // 2. DB state must be CONSUMED
        const dbAuth = await prisma_1.systemPrisma.uninstallAuthorization.findUnique({
            where: { authorizationId: consumedToken.authorizationId },
        });
        (0, vitest_1.expect)(dbAuth?.status).toBe('CONSUMED');
        (0, vitest_1.expect)(dbAuth?.consumedAt).not.toBeNull();
        // 3. Second consumption / check attempt MUST be rejected
        const secondCheck = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
        (0, vitest_1.expect)(secondCheck.valid).toBe(false);
        (0, vitest_1.expect)(secondCheck.reason || secondCheck.error).toMatch(/CONSUMED|consumed/i);
        // 4. Audit event recorded
        const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
            where: {
                eventType: 'UNINSTALL_AUTHORIZATION_CONSUMED',
                description: { contains: consumedToken.authorizationId },
            },
        });
        (0, vitest_1.expect)(audit).not.toBeNull();
    });
});
//# sourceMappingURL=phase7-uninstall-authorization-security.test.js.map