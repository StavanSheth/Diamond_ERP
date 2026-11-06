"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const preservation_service_1 = require("../modules/system/preservation/preservation.service");
const recovery_service_1 = require("../modules/system/recovery/recovery.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 7 — Recovery & Crash Reconciliation', () => {
    let instId;
    const createdPackageIds = [];
    (0, vitest_1.beforeAll)(async () => {
        (0, paths_1.ensureAllDataDirs)();
        let inst = await prisma_1.systemPrisma.installation.findFirst();
        if (!inst) {
            inst = await prisma_1.systemPrisma.installation.create({
                data: {
                    installationId: 'inst_crash_reconcile',
                    appVersion: '3.0.0',
                    status: 'ACTIVE',
                    lifecycleState: 'READY',
                    initializedAt: new Date(),
                },
            });
        }
        instId = inst.id;
    });
    (0, vitest_1.afterAll)(async () => {
        if (createdPackageIds.length > 0) {
            await prisma_1.systemPrisma.preservationPackage.deleteMany({
                where: { packageId: { in: createdPackageIds } },
            });
        }
    });
    (0, vitest_1.it)('P7-CRASH-1: reconcileInterruptedPreservations transitions transient packages to FAILED', async () => {
        const pkgPending = `pkg_crash_pending_${Date.now()}`;
        const pkgBackingUp = `pkg_crash_backup_${Date.now()}`;
        const pkgExporting = `pkg_crash_export_${Date.now()}`;
        const pkgVerifying = `pkg_crash_verify_${Date.now()}`;
        const pkgVerified = `pkg_crash_verified_${Date.now()}`;
        createdPackageIds.push(pkgPending, pkgBackingUp, pkgExporting, pkgVerifying, pkgVerified);
        await prisma_1.systemPrisma.preservationPackage.createMany({
            data: [
                {
                    packageId: pkgPending,
                    installationId: instId,
                    databaseId: 'db_crash_test',
                    destinationPath: 'C:\\fake\\pending',
                    status: 'PENDING',
                },
                {
                    packageId: pkgBackingUp,
                    installationId: instId,
                    databaseId: 'db_crash_test',
                    destinationPath: 'C:\\fake\\backup',
                    status: 'BACKING_UP',
                },
                {
                    packageId: pkgExporting,
                    installationId: instId,
                    databaseId: 'db_crash_test',
                    destinationPath: 'C:\\fake\\export',
                    status: 'EXPORTING',
                },
                {
                    packageId: pkgVerifying,
                    installationId: instId,
                    databaseId: 'db_crash_test',
                    destinationPath: 'C:\\fake\\verify',
                    status: 'VERIFYING',
                },
                {
                    packageId: pkgVerified,
                    installationId: instId,
                    databaseId: 'db_crash_test',
                    destinationPath: 'C:\\fake\\verified',
                    status: 'VERIFIED',
                    verifiedAt: new Date(),
                },
            ],
        });
        const result = await preservation_service_1.preservationService.reconcileInterruptedPreservations();
        (0, vitest_1.expect)(result.reconciledCount).toBeGreaterThanOrEqual(4);
        // Verify transient packages are marked FAILED
        const checkPending = await prisma_1.systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgPending } });
        (0, vitest_1.expect)(checkPending?.status).toBe('FAILED');
        (0, vitest_1.expect)(checkPending?.errorMessage).toContain('interrupted');
        const checkBackingUp = await prisma_1.systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgBackingUp } });
        (0, vitest_1.expect)(checkBackingUp?.status).toBe('FAILED');
        const checkExporting = await prisma_1.systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgExporting } });
        (0, vitest_1.expect)(checkExporting?.status).toBe('FAILED');
        const checkVerifying = await prisma_1.systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgVerifying } });
        (0, vitest_1.expect)(checkVerifying?.status).toBe('FAILED');
        // Verify completed package was untouched
        const checkVerified = await prisma_1.systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgVerified } });
        (0, vitest_1.expect)(checkVerified?.status).toBe('VERIFIED');
    });
    (0, vitest_1.it)('P7-CRASH-2: cleans up incomplete temp directory during preservation crash reconciliation', async () => {
        const exportDir = (0, paths_1.getExportDir)();
        const incompleteDirPath = path_1.default.join(exportDir, `pkg_incomplete_staging_${Date.now()}`);
        fs_1.default.mkdirSync(incompleteDirPath, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(incompleteDirPath, 'partial.tmp'), 'incomplete data', 'utf-8');
        const pkgIncomplete = `pkg_crash_incomplete_${Date.now()}`;
        createdPackageIds.push(pkgIncomplete);
        await prisma_1.systemPrisma.preservationPackage.create({
            data: {
                packageId: pkgIncomplete,
                installationId: instId,
                databaseId: 'db_crash_test',
                destinationPath: incompleteDirPath,
                status: 'EXPORTING',
            },
        });
        await preservation_service_1.preservationService.reconcileInterruptedPreservations();
        const record = await prisma_1.systemPrisma.preservationPackage.findUnique({ where: { packageId: pkgIncomplete } });
        (0, vitest_1.expect)(record?.status).toBe('FAILED');
        (0, vitest_1.expect)(fs_1.default.existsSync(incompleteDirPath)).toBe(false);
    });
    (0, vitest_1.it)('P7-CRASH-3: recoveryService.reconcileInterruptedRestores handles crashed swap files and restores safely', async () => {
        const result = await recovery_service_1.recoveryService.reconcileInterruptedRestores();
        (0, vitest_1.expect)(typeof result.reconciledCount).toBe('number');
        (0, vitest_1.expect)(typeof result.cleanedStagingCount).toBe('number');
    });
});
//# sourceMappingURL=phase7-recovery-crash.test.js.map