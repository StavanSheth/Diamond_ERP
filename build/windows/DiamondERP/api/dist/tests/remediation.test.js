"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const filter_utils_1 = require("../utils/filter.utils");
const reports_service_1 = require("../modules/reports/reports.service");
const shared_utils_1 = require("@diamond-erp/shared-utils");
(0, vitest_1.describe)('Production Remediation Verification Suite', () => {
    (0, vitest_1.describe)('Diamond Multi-Filter Parsing (buildDiamondWhereClause)', () => {
        (0, vitest_1.it)('generates multi-shape case-expanded IN filter', () => {
            const where = (0, filter_utils_1.buildDiamondWhereClause)({ shape: 'Round, Princess' });
            (0, vitest_1.expect)(where.shape).toBeDefined();
            (0, vitest_1.expect)(typeof where.shape).toBe('object');
            const inShapes = where.shape.in;
            (0, vitest_1.expect)(inShapes).toContain('ROUND');
            (0, vitest_1.expect)(inShapes).toContain('Princess');
            (0, vitest_1.expect)(inShapes).toContain('round');
        });
        (0, vitest_1.it)('handles numeric carat ranges', () => {
            const where = (0, filter_utils_1.buildDiamondWhereClause)({ minCarat: '1.0', maxCarat: '2.5' });
            (0, vitest_1.expect)(where.carat).toBeDefined();
            (0, vitest_1.expect)(where.carat.gte).toBe(1.0);
            (0, vitest_1.expect)(where.carat.lte).toBe(2.5);
        });
        (0, vitest_1.it)('maps EX grade variants for cut / polish / symmetry', () => {
            const where = (0, filter_utils_1.buildDiamondWhereClause)({ cut: 'EX' });
            const inCuts = where.cut.in;
            (0, vitest_1.expect)(inCuts).toContain('EX');
            (0, vitest_1.expect)(inCuts).toContain('Excellent');
            (0, vitest_1.expect)(inCuts).toContain('EXCELLENT');
        });
    });
    (0, vitest_1.describe)('Inventory Valuation & Running Balances', () => {
        (0, vitest_1.it)('correctly calculates total value with rate per carat', () => {
            (0, vitest_1.expect)((0, shared_utils_1.calculateTotalValue)(2.5, 4000)).toBe(10000);
            (0, vitest_1.expect)((0, shared_utils_1.calculateTotalValue)(0, 5000)).toBe(0);
        });
        (0, vitest_1.it)('computes running inventory balances for IN vs OUT transactions', () => {
            const movements = [
                { carat: 5.0, totalValue: 50000, itemAction: 'IN' },
                { carat: 2.0, totalValue: 20000, itemAction: 'OUT' },
                { carat: 1.0, totalValue: 10000, itemAction: 'IN' }
            ];
            const balance = (0, shared_utils_1.computeRunningBalances)(movements);
            (0, vitest_1.expect)(balance.caratIn).toBe(6.0);
            (0, vitest_1.expect)(balance.caratOut).toBe(2.0);
            (0, vitest_1.expect)(balance.balanceCarat).toBe(4.0);
            (0, vitest_1.expect)(balance.balanceValue).toBe(40000);
        });
        (0, vitest_1.it)('simulates stock filtering excluding SOLD or WRITTEN_OFF diamonds', () => {
            const diamondItems = [
                { id: 'd1', carat: 1.5, currentValue: 15000, status: 'AVAILABLE' },
                { id: 'd2', carat: 2.0, currentValue: 20000, status: 'SOLD' },
                { id: 'd3', carat: 0.5, currentValue: 5000, status: 'WRITTEN_OFF' },
                { id: 'd4', carat: 1.0, currentValue: 10000, status: 'MEMO' },
            ];
            // Replicating stock.controller.ts and dashboard.controller.ts active filter
            const activeItems = diamondItems.filter(d => d.status !== 'SOLD' && d.status !== 'WRITTEN_OFF');
            const totalCarat = activeItems.reduce((acc, d) => acc + d.carat, 0);
            const totalValue = activeItems.reduce((acc, d) => acc + d.currentValue, 0);
            (0, vitest_1.expect)(totalCarat).toBe(2.5); // 1.5 + 1.0
            (0, vitest_1.expect)(totalValue).toBe(25000); // 15000 + 10000
        });
    });
    (0, vitest_1.describe)('Excel Export Streaming & Formatting', () => {
        (0, vitest_1.it)('successfully streams formatted Excel report without header column collision', async () => {
            const { PassThrough } = await Promise.resolve().then(() => __importStar(require('stream')));
            const stream = new PassThrough();
            const chunks = [];
            const headers = {};
            stream.on('data', (chunk) => chunks.push(chunk));
            const mockResponse = stream;
            mockResponse.setHeader = (key, value) => {
                headers[key] = value;
            };
            // Export an inventory report
            await reports_service_1.reportsService.exportExcel({ reportType: 'INVENTORY' }, mockResponse);
            const totalBuffer = Buffer.concat(chunks);
            (0, vitest_1.expect)(totalBuffer.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(headers['Content-Type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            (0, vitest_1.expect)(headers['Content-Disposition']).toContain('attachment; filename=');
        }, 15000);
    });
    (0, vitest_1.describe)('Disaster Recovery & SQLite Operations (Phase 8)', () => {
        (0, vitest_1.it)('successfully executes PRAGMA wal_checkpoint(TRUNCATE) on SQLite', async () => {
            const { systemPrisma } = await Promise.resolve().then(() => __importStar(require('../infrastructure/database/prisma')));
            const result = await systemPrisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
            (0, vitest_1.expect)(Array.isArray(result)).toBe(true);
            (0, vitest_1.expect)(result.length).toBeGreaterThan(0);
        });
        (0, vitest_1.it)('creates an online atomic backup via SettingsController.backupDatabase', async () => {
            const { SettingsController } = await Promise.resolve().then(() => __importStar(require('../modules/settings/settings.controller')));
            const controller = new SettingsController();
            let responseData = null;
            const mockRes = {
                json: (data) => {
                    responseData = data;
                },
                status: () => mockRes,
            };
            await controller.backupDatabase({}, mockRes, (err) => {
                if (err)
                    throw err;
            });
            (0, vitest_1.expect)(responseData).toBeDefined();
            (0, vitest_1.expect)(responseData.success).toBe(true);
            (0, vitest_1.expect)(responseData.data.filename).toContain('_backup_');
            (0, vitest_1.expect)(responseData.data.sizeBytes).toBeGreaterThan(0);
            (0, vitest_1.expect)(responseData.data.checkpoint).toBe('TRUNCATE');
        });
        (0, vitest_1.it)('successfully runs checkpointWAL via SettingsController', async () => {
            const { SettingsController } = await Promise.resolve().then(() => __importStar(require('../modules/settings/settings.controller')));
            const controller = new SettingsController();
            let responseData = null;
            const mockRes = {
                json: (data) => {
                    responseData = data;
                },
                status: () => mockRes,
            };
            await controller.checkpointWAL({}, mockRes, (err) => {
                if (err)
                    throw err;
            });
            (0, vitest_1.expect)(responseData).toBeDefined();
            (0, vitest_1.expect)(responseData.success).toBe(true);
            (0, vitest_1.expect)(responseData.message).toContain('SQLite WAL checkpoint completed');
        });
        (0, vitest_1.it)('successfully lists users and their assigned databases via SettingsController', async () => {
            const { SettingsController } = await Promise.resolve().then(() => __importStar(require('../modules/settings/settings.controller')));
            const controller = new SettingsController();
            let responseData = null;
            const mockRes = {
                json: (data) => {
                    responseData = data;
                },
                status: () => mockRes,
            };
            await controller.listUsers({}, mockRes, (err) => {
                if (err)
                    throw err;
            });
            (0, vitest_1.expect)(responseData).toBeDefined();
            (0, vitest_1.expect)(responseData.success).toBe(true);
            (0, vitest_1.expect)(Array.isArray(responseData.data)).toBe(true);
        });
        (0, vitest_1.it)('strictly prevents deleting primary user "stavan" via SettingsController', async () => {
            const { SettingsController } = await Promise.resolve().then(() => __importStar(require('../modules/settings/settings.controller')));
            const { systemPrisma } = await Promise.resolve().then(() => __importStar(require('../infrastructure/database/prisma')));
            const controller = new SettingsController();
            let stavan = await systemPrisma.user.findFirst({ where: { username: 'stavan' } });
            if (!stavan) {
                stavan = await systemPrisma.user.create({
                    data: {
                        username: 'stavan',
                        displayName: 'Stavan',
                        passwordHash: 'dummy',
                        role: 'SUPER_ADMIN',
                    },
                });
            }
            let errorCaught = null;
            await controller.deleteUser({ params: { userId: stavan.id }, query: { deleteDatabase: 'true' } }, {}, (err) => {
                errorCaught = err;
            });
            (0, vitest_1.expect)(errorCaught).toBeDefined();
            (0, vitest_1.expect)(errorCaught.message).toContain('cannot be deleted');
        });
        (0, vitest_1.it)('gracefully returns empty settings if table is missing or fails', async () => {
            const { SettingsController } = await Promise.resolve().then(() => __importStar(require('../modules/settings/settings.controller')));
            const controller = new SettingsController();
            let responseData = null;
            const mockRes = {
                json: (data) => {
                    responseData = data;
                },
                status: () => mockRes,
            };
            await controller.getSettings({}, mockRes, (err) => {
                if (err)
                    throw err;
            });
            (0, vitest_1.expect)(responseData).toBeDefined();
            (0, vitest_1.expect)(responseData.success).toBe(true);
            (0, vitest_1.expect)(typeof responseData.data).toBe('object');
        });
    });
});
//# sourceMappingURL=remediation.test.js.map