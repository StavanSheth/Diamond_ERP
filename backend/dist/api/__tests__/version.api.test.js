"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const version_controller_1 = require("../controllers/version.controller");
// Mock the response object
const mockResponse = () => {
    const res = {};
    res.status = vitest_1.vi.fn().mockReturnValue(res);
    res.json = vitest_1.vi.fn().mockReturnValue(res);
    return res;
};
// Mock next
const mockNext = vitest_1.vi.fn();
(0, vitest_1.describe)('VersionController', () => {
    const versionController = new version_controller_1.VersionController();
    (0, vitest_1.it)('should return 404 if version is not found', async () => {
        const req = { params: { id: 'non-existent' } };
        const res = mockResponse();
        await versionController.getOne(req, res, mockNext);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(404);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: false, error: 'Version not found' });
    });
    (0, vitest_1.it)('should call getHistory with correct params', async () => {
        const req = { params: { entityType: 'TRANSACTION', entityId: 'txn-1' } };
        const res = mockResponse();
        await versionController.getHistory(req, res, mockNext);
        (0, vitest_1.expect)(res.json).toHaveBeenCalled();
        const callArgs = res.json.mock.calls[0][0];
        (0, vitest_1.expect)(callArgs.success).toBe(true);
        // data might be empty array because DB is empty
        (0, vitest_1.expect)(Array.isArray(callArgs.data)).toBe(true);
    });
});
//# sourceMappingURL=version.api.test.js.map