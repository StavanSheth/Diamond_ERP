"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const customer_data_detection_service_1 = require("../modules/system/uninstall/customer-data-detection.service");
const uninstall_preflight_service_1 = require("../modules/system/uninstall/uninstall-preflight.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 7 — Customer Data Detection & Offline Status Reporting', () => {
    const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
    let testCustomerDbPath;
    let testExportBundleDir;
    let instId;
    (0, vitest_1.beforeAll)(async () => {
        (0, paths_1.ensureAllDataDirs)();
        await prisma_1.systemPrisma.uninstallAuthorization.deleteMany({});
        await prisma_1.systemPrisma.preservationPackage.deleteMany({});
        const tokenFile = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        if (fs_1.default.existsSync(tokenFile)) {
            try {
                fs_1.default.unlinkSync(tokenFile);
            }
            catch { }
        }
        // Ensure installation exists in control plane
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_customer_data_detect',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
        instId = inst.id;
        // Create a physical test customer db in databases dir
        const databasesDir = (0, paths_1.getDatabasesDir)();
        testCustomerDbPath = path_1.default.join(databasesDir, 'customer_detect_test.db');
        fs_1.default.copyFileSync(templateDb, testCustomerDbPath);
        // Create a dummy export bundle in exports dir
        const exportDir = (0, paths_1.getExportDir)();
        testExportBundleDir = path_1.default.join(exportDir, 'export_bundle_detect_test');
        if (!fs_1.default.existsSync(testExportBundleDir)) {
            fs_1.default.mkdirSync(testExportBundleDir, { recursive: true });
        }
        fs_1.default.writeFileSync(path_1.default.join(testExportBundleDir, 'test.csv'), 'id,name\n1,Alpha', 'utf-8');
        // Register test database in DatabaseRegistry
        await prisma_1.systemPrisma.databaseRegistry.create({
            data: {
                databaseId: 'dbreg_detect_001',
                displayName: 'Registered Detect DB',
                canonicalPath: path_1.default.resolve(testCustomerDbPath),
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
                where: { databaseId: 'dbreg_detect_001' },
            });
            const tokenFile = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
            if (fs_1.default.existsSync(tokenFile)) {
                try {
                    fs_1.default.unlinkSync(tokenFile);
                }
                catch { }
            }
        }
        catch { }
        if (fs_1.default.existsSync(testCustomerDbPath)) {
            try {
                fs_1.default.unlinkSync(testCustomerDbPath);
            }
            catch { }
        }
        if (fs_1.default.existsSync(testExportBundleDir)) {
            try {
                fs_1.default.rmSync(testExportBundleDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('P7-DET-1: detectCustomerData identifies physical and registered customer databases', async () => {
        const result = await customer_data_detection_service_1.customerDataDetectionService.detectCustomerData();
        (0, vitest_1.expect)(result.hasCustomerData).toBe(true);
        (0, vitest_1.expect)(result.databases.length).toBeGreaterThanOrEqual(1);
        const match = result.databases.find((d) => d.canonicalPath.toLowerCase() === path_1.default.resolve(testCustomerDbPath).toLowerCase());
        (0, vitest_1.expect)(match).toBeDefined();
        (0, vitest_1.expect)(match.sizeBytes).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('P7-DET-2: detectCustomerData identifies export bundles in exports directory', async () => {
        const result = await customer_data_detection_service_1.customerDataDetectionService.detectCustomerData();
        (0, vitest_1.expect)(result.exportBundles.length).toBeGreaterThanOrEqual(1);
        const bundleMatch = result.exportBundles.find((b) => b.bundleDirName === 'export_bundle_detect_test');
        (0, vitest_1.expect)(bundleMatch).toBeDefined();
        (0, vitest_1.expect)(bundleMatch.fullPath).toBe(testExportBundleDir);
    });
    (0, vitest_1.it)('P7-DET-3: customer-data-status.json is atomically written to AppData data directory', async () => {
        const result = await customer_data_detection_service_1.customerDataDetectionService.detectCustomerData();
        const statusFile = path_1.default.join((0, paths_1.getDataDir)(), 'customer-data-status.json');
        (0, vitest_1.expect)(result.statusFilePath).toBe(statusFile);
        (0, vitest_1.expect)(fs_1.default.existsSync(statusFile)).toBe(true);
        const contents = JSON.parse(fs_1.default.readFileSync(statusFile, 'utf-8'));
        (0, vitest_1.expect)(contents.hasCustomerData).toBe(true);
        (0, vitest_1.expect)(contents.databases).toBeInstanceOf(Array);
        (0, vitest_1.expect)(contents.exportBundles).toBeInstanceOf(Array);
        (0, vitest_1.expect)(contents.preservationPackages).toBeInstanceOf(Array);
        (0, vitest_1.expect)(typeof contents.activeUserCount).toBe('number');
        (0, vitest_1.expect)(typeof contents.deletedUserCount).toBe('number');
        (0, vitest_1.expect)(contents.inspectedAt).toBeDefined();
    });
    (0, vitest_1.it)('P7-DET-4: uninstallPreflightService seamlessly consumes unified detection', async () => {
        const preflight = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
        (0, vitest_1.expect)(preflight.activeDatabasesCount).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(preflight.classification).not.toBe('NO_CUSTOMER_DATA');
        (0, vitest_1.expect)(preflight.canSafelyUninstall).toBe(false);
    });
});
//# sourceMappingURL=phase7-customer-data-detection.test.js.map