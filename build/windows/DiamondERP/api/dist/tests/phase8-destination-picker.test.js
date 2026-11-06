"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uninstall_preflight_service_1 = require("../modules/system/uninstall/uninstall-preflight.service");
const paths_1 = require("../infrastructure/paths");
(0, vitest_1.describe)('Phase 8 — Dedicated Preservation Destination Picker (P1)', () => {
    const scratchDir = path_1.default.resolve('apps/api/test-scratch-dest-picker');
    const validDestDir = path_1.default.join(scratchDir, 'custom_preservation_dir');
    (0, vitest_1.beforeAll)(() => {
        if (!fs_1.default.existsSync(scratchDir)) {
            fs_1.default.mkdirSync(scratchDir, { recursive: true });
        }
    });
    (0, vitest_1.afterAll)(() => {
        if (fs_1.default.existsSync(scratchDir)) {
            try {
                fs_1.default.rmSync(scratchDir, { recursive: true, force: true });
            }
            catch { }
        }
    });
    (0, vitest_1.it)('rejects empty or whitespace-only destination paths', async () => {
        const res = await uninstall_preflight_service_1.uninstallPreflightService.validateDestination('');
        (0, vitest_1.expect)(res.valid).toBe(false);
        (0, vitest_1.expect)(res.error).toMatch(/cannot be blank/i);
        const res2 = await uninstall_preflight_service_1.uninstallPreflightService.validateDestination('   ');
        (0, vitest_1.expect)(res2.valid).toBe(false);
    });
    (0, vitest_1.it)('rejects destination paths pointing to active databases directory or database file', async () => {
        const dbsDir = (0, paths_1.getDatabasesDir)();
        const res = await uninstall_preflight_service_1.uninstallPreflightService.validateDestination(dbsDir);
        (0, vitest_1.expect)(res.valid).toBe(false);
        (0, vitest_1.expect)(res.error).toMatch(/active databases directory/i);
        const resDbFile = await uninstall_preflight_service_1.uninstallPreflightService.validateDestination(path_1.default.join(dbsDir, 'any_database.db'));
        (0, vitest_1.expect)(resDbFile.valid).toBe(false);
        (0, vitest_1.expect)(resDbFile.error).toMatch(/must be a folder/i);
    });
    (0, vitest_1.it)('rejects destination pointing to the system control database', async () => {
        const controlDb = (0, paths_1.getControlDbPath)();
        const res = await uninstall_preflight_service_1.uninstallPreflightService.validateDestination(controlDb);
        (0, vitest_1.expect)(res.valid).toBe(false);
        (0, vitest_1.expect)(res.error).toMatch(/control database/i);
    });
    (0, vitest_1.it)('successfully validates and tests write capability on a valid destination directory', async () => {
        const res = await uninstall_preflight_service_1.uninstallPreflightService.validateDestination(validDestDir);
        (0, vitest_1.expect)(res.valid).toBe(true);
        (0, vitest_1.expect)(res.exists).toBe(true);
        (0, vitest_1.expect)(res.writable).toBe(true);
        (0, vitest_1.expect)(res.canonicalPath).toBe(path_1.default.resolve(validDestDir));
        (0, vitest_1.expect)(fs_1.default.existsSync(validDestDir)).toBe(true);
    });
    (0, vitest_1.it)('browseDestination returns suggested destination directories and structured result', async () => {
        const res = await uninstall_preflight_service_1.uninstallPreflightService.browseDestination();
        (0, vitest_1.expect)(res).toBeDefined();
        (0, vitest_1.expect)(typeof res.canceled).toBe('boolean');
        (0, vitest_1.expect)(Array.isArray(res.suggestedPaths)).toBe(true);
        (0, vitest_1.expect)(res.suggestedPaths.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=phase8-destination-picker.test.js.map