"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const activation_controller_1 = require("../modules/system/activation.controller");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("../infrastructure/database/prisma"));
const ACTIVATION_FILE = path_1.default.resolve(process.cwd(), '.app-activation.json');
(0, vitest_1.describe)('Master App Lock & Lifetime Activation Controller', () => {
    (0, vitest_1.beforeEach)(async () => {
        // Clean up activation state before each test
        const files = [
            (0, activation_controller_1.getActivationFilePath)(),
            ACTIVATION_FILE,
            path_1.default.resolve(__dirname, '../../../../.app-activation.json'),
        ];
        for (const f of files) {
            if (fs_1.default.existsSync(f)) {
                try {
                    fs_1.default.unlinkSync(f);
                }
                catch { }
            }
        }
        await prisma_1.default.setting.deleteMany({
            where: { key: 'app_activated' }
        }).catch(() => null);
    });
    (0, vitest_1.it)('reports isActivated: false on fresh install', async () => {
        let jsonResult = null;
        const mockRes = {
            json: (data) => { jsonResult = data; },
            status: () => mockRes,
        };
        await activation_controller_1.activationController.getActivationStatus({}, mockRes, () => { });
        (0, vitest_1.expect)(jsonResult).toBeDefined();
        (0, vitest_1.expect)(jsonResult.success).toBe(true);
        (0, vitest_1.expect)(jsonResult.isActivated).toBe(false);
    });
    (0, vitest_1.it)('rejects incorrect master activation password with 401', async () => {
        let statusCode = 200;
        let jsonResult = null;
        const mockRes = {
            status: (code) => {
                statusCode = code;
                return mockRes;
            },
            json: (data) => { jsonResult = data; }
        };
        await activation_controller_1.activationController.activate({
            body: { password: 'WRONG_PASSWORD_123' }
        }, mockRes, () => { });
        (0, vitest_1.expect)(statusCode).toBe(401);
        (0, vitest_1.expect)(jsonResult.success).toBe(false);
        (0, vitest_1.expect)(jsonResult.error).toContain('Invalid');
    });
    (0, vitest_1.it)('activates permanently with default master password XW2756WGH', async () => {
        let statusCode = 200;
        let jsonResult = null;
        const mockRes = {
            status: (code) => {
                statusCode = code;
                return mockRes;
            },
            json: (data) => { jsonResult = data; }
        };
        await activation_controller_1.activationController.activate({
            body: { password: 'XW2756WGH' }
        }, mockRes, () => { });
        (0, vitest_1.expect)(statusCode).toBe(200);
        (0, vitest_1.expect)(jsonResult.success).toBe(true);
        // Verify status now reports isActivated: true
        let statusResult = null;
        const mockStatusRes = {
            json: (data) => { statusResult = data; },
            status: () => mockStatusRes,
        };
        await activation_controller_1.activationController.getActivationStatus({}, mockStatusRes, () => { });
        (0, vitest_1.expect)(statusResult.isActivated).toBe(true);
    });
    (0, vitest_1.it)('activates permanently with complex phase-tweaked key Diamond@2026#SecureVault-APP', async () => {
        let statusCode = 200;
        let jsonResult = null;
        const mockRes = {
            status: (code) => {
                statusCode = code;
                return mockRes;
            },
            json: (data) => { jsonResult = data; }
        };
        await activation_controller_1.activationController.activate({
            body: { password: 'Diamond@2026#SecureVault-APP' }
        }, mockRes, () => { });
        (0, vitest_1.expect)(statusCode).toBe(200);
        (0, vitest_1.expect)(jsonResult.success).toBe(true);
        // Verify setting saved with timestamp
        const activatedSetting = await prisma_1.default.setting.findUnique({
            where: { key: 'app_activated' }
        });
        (0, vitest_1.expect)(activatedSetting?.value).toBe('true');
        const timestampSetting = await prisma_1.default.setting.findUnique({
            where: { key: 'app_activated_at' }
        });
        (0, vitest_1.expect)(timestampSetting?.value).toBeDefined();
    });
});
//# sourceMappingURL=activation.test.js.map