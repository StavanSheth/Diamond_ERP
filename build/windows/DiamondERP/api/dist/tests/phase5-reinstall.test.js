"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const recovery_service_1 = require("../modules/system/recovery/recovery.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 5 — Reinstall Detection & Multi-Choice Preservation Engine', () => {
    (0, vitest_1.it)('detects existing installation data and presents explicit non-forced recovery options', async () => {
        const detection = await recovery_service_1.recoveryService.detectReinstallState();
        (0, vitest_1.expect)(detection).toBeDefined();
        (0, vitest_1.expect)(detection.canStartFresh).toBe(true);
        (0, vitest_1.expect)(detection.hasPreviousData).toBe(true);
        (0, vitest_1.expect)(detection.previousDatabasesCount).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(detection.canContinue).toBe(true);
        (0, vitest_1.expect)(detection.details).toContain('existing database(s)');
    });
    (0, vitest_1.it)('preserves existing physical database files when starting a fresh installation', async () => {
        const databasesDir = (0, paths_1.getDatabasesDir)();
        const testDbPath = path_1.default.join(databasesDir, 'Stavan.db');
        const dbExistsInitially = fs_1.default.existsSync(testDbPath);
        const initialStat = dbExistsInitially ? fs_1.default.statSync(testDbPath) : null;
        // Trigger fresh installation
        const newInstall = await recovery_service_1.recoveryService.startFreshInstallation();
        (0, vitest_1.expect)(newInstall).toBeDefined();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        (0, vitest_1.expect)(uuidRegex.test(newInstall.installationId)).toBe(true);
        (0, vitest_1.expect)(newInstall.lifecycleState).toBe('APP_SETUP');
        // Invariant: Previous physical database file must remain 100% untouched on disk!
        if (dbExistsInitially) {
            (0, vitest_1.expect)(fs_1.default.existsSync(testDbPath)).toBe(true);
            const postStat = fs_1.default.statSync(testDbPath);
            (0, vitest_1.expect)(postStat.size).toBe(initialStat?.size);
        }
        // Verify audit trail logged
        const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
            where: {
                entityType: 'INSTALLATION',
                eventType: 'NEW_INSTALLATION_SELECTED',
            },
            orderBy: { performedAt: 'desc' },
        });
        (0, vitest_1.expect)(audit).toBeDefined();
        (0, vitest_1.expect)(audit?.description).toContain('prior databases preserved on disk');
    });
    (0, vitest_1.it)('continues existing installation preserving database and installation state', async () => {
        const install = await prisma_1.systemPrisma.installation.findFirst({ where: { status: 'ACTIVE' } });
        (0, vitest_1.expect)(install).toBeDefined();
        const continued = await recovery_service_1.recoveryService.continueExistingInstallation(install.installationId);
        (0, vitest_1.expect)(continued.success).toBe(true);
        (0, vitest_1.expect)(continued.installation.status).toBe('ACTIVE');
        const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
            where: {
                entityType: 'INSTALLATION',
                eventType: 'REINSTALL_CONTINUED',
            },
            orderBy: { performedAt: 'desc' },
        });
        (0, vitest_1.expect)(audit).toBeDefined();
    });
    (0, vitest_1.it)('classifies reinstall state correctly', async () => {
        const state = await recovery_service_1.recoveryService.detectReinstallState();
        (0, vitest_1.expect)(state.classification).toBeDefined();
        (0, vitest_1.expect)([
            'FIRST_INSTALL',
            'CURRENT_INSTALLATION',
            'PREVIOUS_INSTALLATION_DATA',
            'ORPHANED_DATA',
            'RECOVERY_CANDIDATE',
            'NO_RECOVERABLE_DATA',
        ]).toContain(state.classification);
    });
});
//# sourceMappingURL=phase5-reinstall.test.js.map