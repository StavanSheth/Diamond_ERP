"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_registry_service_1 = require("../modules/system/database/database-registry.service");
const installation_service_1 = require("../modules/system/installation.service");
const auth_service_1 = require("../modules/auth/auth.service");
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 5 — Database Registration & User Association Security', () => {
    const scratchDir = path_1.default.resolve('apps/api/test-scratch-phase5-reg');
    let validDbPath;
    let testUserId;
    let inactiveUserId;
    (0, vitest_1.beforeAll)(async () => {
        if (!fs_1.default.existsSync(scratchDir)) {
            fs_1.default.mkdirSync(scratchDir, { recursive: true });
        }
        const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve((0, paths_1.getDatabasesDir)(), 'template.db');
        validDbPath = path_1.default.join(scratchDir, `phase5_valid_${Date.now()}.db`);
        fs_1.default.copyFileSync(templateDb, validDbPath);
        await installation_service_1.installationService.getOrCreateInstallation();
        // Create an active test user
        const user = await auth_service_1.authService.createUser(`p5_reg_user_${Date.now()}`, 'Password123456!', 'Phase5 Reg User', 'ADMIN');
        testUserId = user.id;
        // Create an inactive test user
        const inact = await auth_service_1.authService.createUser(`p5_inact_user_${Date.now()}`, 'Password123456!', 'Phase5 Inact User', 'VIEWER');
        await prisma_1.systemPrisma.user.update({
            where: { id: inact.id },
            data: { isActive: false },
        });
        inactiveUserId = inact.id;
    });
    (0, vitest_1.afterAll)(() => {
        if (fs_1.default.existsSync(scratchDir)) {
            try {
                fs_1.default.rmSync(scratchDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.describe)('Database Registration Hardening', () => {
        (0, vitest_1.it)('blocks registering control database (system.db) as a customer database', async () => {
            const controlDb = (0, paths_1.getControlDbPath)();
            await (0, vitest_1.expect)(database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: controlDb,
                displayName: 'Hacked System DB',
            })).rejects.toThrow(/Cannot register internal control or template database/i);
        });
        (0, vitest_1.it)('blocks registering template database (template.db) as a customer database', async () => {
            const templateDb = (0, paths_1.getDatabaseTemplatePath)() || path_1.default.resolve((0, paths_1.getDatabasesDir)(), 'template.db');
            await (0, vitest_1.expect)(database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: templateDb,
                displayName: 'Hacked Template DB',
            })).rejects.toThrow(/Cannot register internal control or template database/i);
        });
        (0, vitest_1.it)('blocks registration when foreign installationId is provided', async () => {
            await (0, vitest_1.expect)(database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: validDbPath,
                installationId: 'foreign-install-id-999',
            })).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('registers valid database and produces DATABASE_REGISTERED audit event', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const reg = await database_registry_service_1.databaseRegistryService.registerDatabase({
                rawPath: validDbPath,
                displayName: 'Verified Business DB',
                installationId: install.id,
            });
            (0, vitest_1.expect)(reg.databaseId).toBeDefined();
            (0, vitest_1.expect)(reg.status).toBe('ACTIVE');
            const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
                where: {
                    entityType: 'DatabaseRegistry',
                    entityId: reg.databaseId,
                    eventType: 'DATABASE_REGISTERED',
                },
            });
            (0, vitest_1.expect)(audit).not.toBeNull();
        });
    });
    (0, vitest_1.describe)('User Association & Disassociation Hardening', () => {
        (0, vitest_1.it)('blocks user association with a foreign installation ID', async () => {
            await (0, vitest_1.expect)(installation_service_1.installationService.associateUser('foreign-install-uuid', testUserId)).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('blocks associating inactive or deleted users', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await (0, vitest_1.expect)(installation_service_1.installationService.associateUser(install.id, inactiveUserId)).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('associates active user and produces USER_ASSOCIATED audit event', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            const result = await installation_service_1.installationService.associateUser(install.id, testUserId);
            (0, vitest_1.expect)(result.userId).toBe(testUserId);
            (0, vitest_1.expect)(result.installationId).toBe(install.id);
            const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
                where: {
                    entityType: 'InstallationUser',
                    eventType: 'USER_ASSOCIATED',
                },
                orderBy: { performedAt: 'desc' },
            });
            (0, vitest_1.expect)(audit).not.toBeNull();
            (0, vitest_1.expect)(audit?.description).toContain(testUserId);
        });
        (0, vitest_1.it)('blocks user disassociation with a foreign installation ID', async () => {
            await (0, vitest_1.expect)(installation_service_1.installationService.disassociateUser('foreign-install-uuid', testUserId)).rejects.toThrow(errors_1.ConflictError);
        });
        (0, vitest_1.it)('disassociates user safely without deleting user or database and produces USER_DISASSOCIATED audit event', async () => {
            const install = await installation_service_1.installationService.getOrCreateInstallation();
            await installation_service_1.installationService.disassociateUser(install.id, testUserId);
            // Verify user still exists in DB
            const userAfter = await prisma_1.systemPrisma.user.findUnique({ where: { id: testUserId } });
            (0, vitest_1.expect)(userAfter).not.toBeNull();
            const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
                where: {
                    entityType: 'InstallationUser',
                    eventType: 'USER_DISASSOCIATED',
                },
                orderBy: { performedAt: 'desc' },
            });
            (0, vitest_1.expect)(audit).not.toBeNull();
        });
    });
});
//# sourceMappingURL=phase5-registration-security.test.js.map