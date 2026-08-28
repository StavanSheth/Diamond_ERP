"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const draft_service_1 = require("../draft.service");
const setup_1 = require("../../tests/setup");
(0, vitest_1.describe)('DraftService', () => {
    const draftService = new draft_service_1.DraftService();
    (0, vitest_1.beforeEach)(async () => {
        // Clear drafts before each test
        await setup_1.prisma.draftRevision.deleteMany();
        await setup_1.prisma.documentDraft.deleteMany();
    });
    (0, vitest_1.describe)('saveDraftRevision', () => {
        (0, vitest_1.it)('should create a new draft if it does not exist', async () => {
            const payload = { test: true };
            const createdDraft = await draftService.createDraft({
                entityType: 'TRANSACTION',
                payload,
                createdBy: 'tester',
                deviceId: 'device-1'
            });
            const revision = await draftService.saveDraftRevision(createdDraft.id, {
                payload: { test: false },
                updatedBy: 'tester',
                deviceId: 'device-1'
            });
            (0, vitest_1.expect)(revision.revisionNumber).toBe(2);
            const draft = await setup_1.prisma.documentDraft.findUnique({ where: { id: createdDraft.id } });
            (0, vitest_1.expect)(draft).toBeDefined();
            (0, vitest_1.expect)(draft?.status).toBe('SAVED');
            (0, vitest_1.expect)(draft?.entityType).toBe('TRANSACTION');
        });
        (0, vitest_1.it)('should increment revision number on subsequent saves', async () => {
            const createdDraft = await draftService.createDraft({
                entityType: 'TRANSACTION',
                payload: { step: 1 },
                createdBy: 'tester',
                deviceId: 'device-1'
            });
            const revision2 = await draftService.saveDraftRevision(createdDraft.id, {
                payload: { step: 2 },
                updatedBy: 'tester',
                deviceId: 'device-1'
            });
            (0, vitest_1.expect)(revision2.revisionNumber).toBe(2);
            (0, vitest_1.expect)(revision2.snapshot).toEqual(JSON.stringify({ step: 2 }));
        });
    });
    (0, vitest_1.describe)('commitDraft', () => {
        (0, vitest_1.it)('should change draft status to COMMITTED', async () => {
            const createdDraft = await draftService.createDraft({
                entityType: 'TRANSACTION',
                payload: { step: 1 },
                createdBy: 'tester'
            });
            const draft = await draftService.commitDraft(createdDraft.id, 'tester');
            (0, vitest_1.expect)(draft.status).toBe('COMMITTED');
            const dbDraft = await setup_1.prisma.documentDraft.findUnique({ where: { id: createdDraft.id } });
            (0, vitest_1.expect)(dbDraft?.status).toBe('COMMITTED');
        });
    });
});
//# sourceMappingURL=draft.service.test.js.map