"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const settings_controller_1 = require("../modules/settings/settings.controller");
const installation_service_1 = require("../modules/system/installation.service");
const prisma_1 = require("../infrastructure/database/prisma");
(0, vitest_1.describe)('Settings Controller — User & Profile Creation Tests', () => {
    let controller;
    (0, vitest_1.beforeEach)(async () => {
        controller = new settings_controller_1.SettingsController();
        await installation_service_1.installationService.getOrCreateInstallation();
    });
    (0, vitest_1.it)('successfully creates a new team user via SettingsController.createUser', async () => {
        const testUsername = `user_${Date.now()}`;
        const req = {
            body: {
                username: testUsername,
                password: 'ValidPassword123!',
                displayName: 'Test New User',
                role: 'MANAGER',
            },
        };
        let statusCode = 200;
        let jsonResult = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return res;
            },
            json: (data) => {
                jsonResult = data;
                return res;
            },
        };
        let capturedError = null;
        const next = (err) => {
            capturedError = err;
        };
        await controller.createUser(req, res, next);
        (0, vitest_1.expect)(capturedError).toBeNull();
        (0, vitest_1.expect)(statusCode).toBe(201);
        (0, vitest_1.expect)(jsonResult.success).toBe(true);
        (0, vitest_1.expect)(jsonResult.data.username).toBe(testUsername);
        // Verify user is in SQLite
        const userInDb = await prisma_1.systemPrisma.user.findUnique({
            where: { username: testUsername },
        });
        (0, vitest_1.expect)(userInDb).not.toBeNull();
        (0, vitest_1.expect)(userInDb?.role).toBe('MANAGER');
    });
    (0, vitest_1.it)('creates a profile without failing on unauthenticated default-admin caller', async () => {
        // Simulate desktop unauthenticated caller with default-admin
        const req = {
            user: { id: 'default-admin' },
            body: {
                profileName: `prof_${Date.now()}`,
                displayName: 'Test New Profile',
            },
        };
        let jsonResult = null;
        const res = {
            status: () => res,
            json: (data) => {
                jsonResult = data;
                return res;
            },
        };
        let capturedError = null;
        const next = (err) => {
            capturedError = err;
        };
        await controller.createProfile(req, res, next);
        (0, vitest_1.expect)(capturedError).toBeNull();
        (0, vitest_1.expect)(jsonResult?.success).toBe(true);
    });
});
//# sourceMappingURL=settings-user-profile.test.js.map