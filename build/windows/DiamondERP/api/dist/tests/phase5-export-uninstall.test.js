"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const export_service_1 = require("../modules/system/export/export.service");
const uninstall_preflight_service_1 = require("../modules/system/uninstall/uninstall-preflight.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
const installation_service_1 = require("../modules/system/installation.service");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 5 — Export & Uninstall Data Preservation Engine', () => {
    let createdExportPath = null;
    let createdUninstallPath = null;
    const testScratchDir = path_1.default.resolve('apps/api/test-scratch-export');
    const testDbPath = path_1.default.join(testScratchDir, 'export_test.db');
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(testScratchDir)) {
            fs_1.default.mkdirSync(testScratchDir, { recursive: true });
        }
        const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve('apps/api/Stavan.db');
        fs_1.default.copyFileSync(templateDb, testDbPath);
        await prisma_1.systemPrisma.uninstallAuthorization.deleteMany({});
        await prisma_1.systemPrisma.preservationPackage.deleteMany({});
        const tokenFile = path_1.default.join((0, paths_1.getDataDir)(), 'uninstall-authorization.json');
        if (fs_1.default.existsSync(tokenFile)) {
            try {
                fs_1.default.unlinkSync(tokenFile);
            }
            catch { }
        }
        // Clean up any stale active registry records whose files no longer exist on disk
        const staleRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({
            where: { status: 'ACTIVE' },
        });
        for (const r of staleRegistries) {
            if (!fs_1.default.existsSync(r.canonicalPath)) {
                await prisma_1.systemPrisma.databaseRegistry.delete({ where: { id: r.id } });
            }
        }
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        await prisma_1.systemPrisma.databaseRegistry.upsert({
            where: { databaseId: 'db_test_export' },
            create: {
                databaseId: 'db_test_export',
                installationId: install.id,
                displayName: 'Test Export Company',
                canonicalPath: path_1.default.resolve(testDbPath),
                status: 'ACTIVE',
                schemaVersion: 1,
            },
            update: {
                canonicalPath: path_1.default.resolve(testDbPath),
                status: 'ACTIVE',
            },
        });
    });
    (0, vitest_1.afterAll)(async () => {
        try {
            await prisma_1.systemPrisma.uninstallAuthorization.deleteMany({});
            await prisma_1.systemPrisma.preservationPackage.deleteMany({});
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({
                where: { databaseId: 'db_test_export' },
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
        if (fs_1.default.existsSync(testScratchDir)) {
            try {
                fs_1.default.rmSync(testScratchDir, { recursive: true, force: true });
            }
            catch { }
        }
        if (createdExportPath && fs_1.default.existsSync(createdExportPath)) {
            try {
                fs_1.default.rmSync(createdExportPath, { recursive: true, force: true });
            }
            catch { }
        }
        if (createdUninstallPath && fs_1.default.existsSync(createdUninstallPath)) {
            try {
                fs_1.default.rmSync(createdUninstallPath, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('exports business data with manifest, checksums, and zero secret leakage', async () => {
        const result = await export_service_1.exportService.exportBusinessData({ format: 'CSV' }, 'tester');
        createdExportPath = result.filePath;
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.exportId).toMatch(/^exp_/);
        (0, vitest_1.expect)(fs_1.default.existsSync(result.filePath)).toBe(true);
        // Verify manifest JSON exists and matches
        const manifestPath = path_1.default.join(result.filePath, 'export-manifest.json');
        (0, vitest_1.expect)(fs_1.default.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
        (0, vitest_1.expect)([1, 2]).toContain(manifest.formatVersion);
        (0, vitest_1.expect)(manifest.tables.length).toBeGreaterThan(0);
        // Assert zero secret leakage in all exported CSVs and manifest
        const manifestRaw = fs_1.default.readFileSync(manifestPath, 'utf-8');
        (0, vitest_1.expect)(manifestRaw).not.toContain('pinHash');
        (0, vitest_1.expect)(manifestRaw).not.toContain('passwordHash');
        (0, vitest_1.expect)(manifestRaw).not.toContain('token');
        for (const table of manifest.tables) {
            const csvPath = path_1.default.join(result.filePath, table.fileName);
            (0, vitest_1.expect)(fs_1.default.existsSync(csvPath)).toBe(true);
            const csvRaw = fs_1.default.readFileSync(csvPath, 'utf-8');
            (0, vitest_1.expect)(csvRaw).not.toContain('passwordHash');
            (0, vitest_1.expect)(csvRaw).not.toContain('pinHash');
        }
        // Verify export bundle verification check
        const verify = await export_service_1.exportService.verifyExport(result.filePath);
        (0, vitest_1.expect)(verify.isValid).toBe(true);
        (0, vitest_1.expect)(verify.manifestMatches).toBe(true);
        (0, vitest_1.expect)(verify.fileCount).toBe(manifest.tables.length);
    });
    (0, vitest_1.it)('returns uninstall preflight status confirming data preservation guarantee', async () => {
        const preflight = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
        (0, vitest_1.expect)(typeof preflight.canSafelyUninstall).toBe('boolean');
        (0, vitest_1.expect)(preflight.userAppDataPreservedByDefault).toBe(true);
        (0, vitest_1.expect)(preflight.userAppDataDir).toBeDefined();
        (0, vitest_1.expect)(preflight.warningMessage).toContain('preserves all customer databases');
    });
    (0, vitest_1.it)('requires explicit confirmation to trigger pre-uninstall backup', async () => {
        await (0, vitest_1.expect)(uninstall_preflight_service_1.uninstallPreflightService.createUninstallBackup({
            confirmPreUninstallBackup: false,
        })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('creates and verifies pre-uninstall backup bundle', async () => {
        const res = await uninstall_preflight_service_1.uninstallPreflightService.createUninstallBackup({
            confirmPreUninstallBackup: true,
        }, 'uninstall_tester');
        createdUninstallPath = res.exportBundlePath;
        (0, vitest_1.expect)(res.success).toBe(true);
        (0, vitest_1.expect)(res.databasesBackedUp).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(res.sizeBytes).toBeGreaterThan(0);
        (0, vitest_1.expect)(fs_1.default.existsSync(res.manifestPath)).toBe(true);
        const manifest = JSON.parse(fs_1.default.readFileSync(res.manifestPath, 'utf-8'));
        (0, vitest_1.expect)(manifest.status).toBe('VERIFIED');
        (0, vitest_1.expect)(manifest.dataDirectoryPreserved).toBeDefined();
    }, 30000);
    (0, vitest_1.it)('fails pre-uninstall backup if any registered database is missing on disk', async () => {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const bogusDbId = `db_missing_${Date.now()}`;
        await prisma_1.systemPrisma.databaseRegistry.create({
            data: {
                databaseId: bogusDbId,
                installationId: install.id,
                displayName: 'Missing Database',
                canonicalPath: path_1.default.resolve('apps/api/test-scratch-export/missing_ghost.db'),
                status: 'ACTIVE',
                schemaVersion: 1,
            },
        });
        try {
            await (0, vitest_1.expect)(uninstall_preflight_service_1.uninstallPreflightService.createUninstallBackup({
                confirmPreUninstallBackup: true,
            })).rejects.toThrow();
        }
        finally {
            await prisma_1.systemPrisma.databaseRegistry.deleteMany({
                where: { databaseId: bogusDbId },
            });
        }
    });
});
//# sourceMappingURL=phase5-export-uninstall.test.js.map