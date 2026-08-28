"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const version_service_1 = require("../version.service");
const setup_1 = require("../../tests/setup");
(0, vitest_1.describe)('VersionService', () => {
    const versionService = new version_service_1.VersionService();
    (0, vitest_1.beforeEach)(async () => {
        // Clear versions before each test
        await setup_1.prisma.recordVersion.deleteMany();
        await setup_1.prisma.versionChange.deleteMany();
    });
    (0, vitest_1.describe)('diff engine', () => {
        (0, vitest_1.it)('should detect added fields', () => {
            const oldObj = { name: 'Diamond 1' };
            const newObj = { name: 'Diamond 1', carat: 1.2 };
            const changes = versionService._deepDiff(oldObj, newObj);
            (0, vitest_1.expect)(changes).toHaveLength(1);
            (0, vitest_1.expect)(changes[0].path).toBe('carat');
            (0, vitest_1.expect)(changes[0].before).toBeUndefined();
            (0, vitest_1.expect)(changes[0].after).toBe(1.2);
        });
        (0, vitest_1.it)('should detect removed fields', () => {
            const oldObj = { name: 'Diamond 1', carat: 1.2 };
            const newObj = { name: 'Diamond 1' };
            const changes = versionService._deepDiff(oldObj, newObj);
            (0, vitest_1.expect)(changes).toHaveLength(1);
            (0, vitest_1.expect)(changes[0].path).toBe('carat');
            (0, vitest_1.expect)(changes[0].before).toBe(1.2);
            (0, vitest_1.expect)(changes[0].after).toBeUndefined();
        });
        (0, vitest_1.it)('should detect changed fields', () => {
            const oldObj = { name: 'Diamond 1', color: 'G' };
            const newObj = { name: 'Diamond 1', color: 'F' };
            const changes = versionService._deepDiff(oldObj, newObj);
            (0, vitest_1.expect)(changes).toHaveLength(1);
            (0, vitest_1.expect)(changes[0].path).toBe('color');
            (0, vitest_1.expect)(changes[0].before).toBe('G');
            (0, vitest_1.expect)(changes[0].after).toBe('F');
        });
    });
    (0, vitest_1.describe)('createVersion', () => {
        (0, vitest_1.it)('should create a new version with incremented version number', async () => {
            const entityId = 'txn-123';
            const entityType = 'TRANSACTION';
            const v1 = await versionService.createVersion({
                entityType,
                entityId,
                versionType: 'TRANSACTION_CREATED',
                snapshot: { status: 'DRAFT' },
                changeSummary: 'Initial creation',
                createdBy: 'tester'
            });
            (0, vitest_1.expect)(v1.versionNumber).toBe(1);
            (0, vitest_1.expect)(v1.entityId).toBe(entityId);
            const v2 = await versionService.createVersion({
                entityType,
                entityId,
                versionType: 'TRANSACTION_EDITED',
                snapshot: { status: 'AUTHORIZED' },
                changeSummary: 'Authorized transaction',
                createdBy: 'tester',
                changeSet: [{ path: 'status', before: 'DRAFT', after: 'AUTHORIZED' }]
            });
            (0, vitest_1.expect)(v2.versionNumber).toBe(2);
            (0, vitest_1.expect)(v2.changes).toBeDefined();
            (0, vitest_1.expect)(v2.changes.length).toBe(1);
            (0, vitest_1.expect)(v2.changes[0].fieldPath).toBe('status');
            (0, vitest_1.expect)(v2.changes[0].valueBefore).toBe(JSON.stringify('DRAFT'));
            (0, vitest_1.expect)(v2.changes[0].valueAfter).toBe(JSON.stringify('AUTHORIZED'));
        });
    });
});
//# sourceMappingURL=version.service.test.js.map