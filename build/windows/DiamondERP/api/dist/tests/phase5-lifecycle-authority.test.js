"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const installation_service_1 = require("../modules/system/installation.service");
const prisma_1 = require("../infrastructure/database/prisma");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 5 — Lifecycle Transition Authority & Controlled Reset', () => {
    (0, vitest_1.it)('rejects resetting to NOT_INITIALIZED without isReset flag', async () => {
        await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('NOT_INITIALIZED')).rejects.toThrow(errors_1.ConflictError);
    });
    (0, vitest_1.it)('rejects resetting to NOT_INITIALIZED without valid resetReason', async () => {
        await (0, vitest_1.expect)(installation_service_1.installationService.updateLifecycleState('NOT_INITIALIZED', {
            isReset: true,
            resetReason: 'arbitrary_invalid_reason',
        })).rejects.toThrow(/Controlled reset policy violation/i);
    });
    (0, vitest_1.it)('allows controlled reset with explicit valid resetReason and logs LIFECYCLE_RESET audit event', async () => {
        await installation_service_1.installationService.getOrCreateInstallation();
        const result = await installation_service_1.installationService.updateLifecycleState('NOT_INITIALIZED', {
            isReset: true,
            resetReason: 'DEVELOPMENT_TEST_RESET',
        });
        (0, vitest_1.expect)(result.lifecycleState).toBe('NOT_INITIALIZED');
        const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
            where: {
                entityType: 'Installation',
                eventType: 'LIFECYCLE_RESET',
            },
            orderBy: { performedAt: 'desc' },
        });
        (0, vitest_1.expect)(audit).not.toBeNull();
        (0, vitest_1.expect)(audit?.description).toContain('DEVELOPMENT_TEST_RESET');
    });
    (0, vitest_1.it)('records LIFECYCLE_STATE_TRANSITION audit event on forward step progression', async () => {
        const result = await installation_service_1.installationService.updateLifecycleState('APP_SETUP');
        (0, vitest_1.expect)(result.lifecycleState).toBe('APP_SETUP');
        const audit = await prisma_1.systemPrisma.auditEvent.findFirst({
            where: {
                entityType: 'Installation',
                eventType: 'LIFECYCLE_STATE_TRANSITION',
            },
            orderBy: { performedAt: 'desc' },
        });
        (0, vitest_1.expect)(audit).not.toBeNull();
        (0, vitest_1.expect)(audit?.description).toContain('APP_SETUP');
        // Clean up back to APP_SETUP / NOT_INITIALIZED
        await installation_service_1.installationService.updateLifecycleState('NOT_INITIALIZED', {
            isReset: true,
            resetReason: 'DEVELOPMENT_TEST_RESET',
        });
    });
});
//# sourceMappingURL=phase5-lifecycle-authority.test.js.map