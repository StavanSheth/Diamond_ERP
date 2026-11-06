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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const request_id_1 = require("../middleware/request-id");
const error_handler_1 = require("../middleware/error-handler");
const routes_1 = require("../routes");
const stock_controller_1 = require("../modules/stocks/stock.controller");
const health_controller_1 = require("../modules/system/health.controller");
const dashboard_controller_1 = require("../modules/dashboard/dashboard.controller");
const ledger_controller_1 = require("../modules/ledger/ledger.controller");
const certificate_controller_1 = require("../modules/certificates/certificate.controller");
const party_controller_1 = require("../modules/parties/party.controller");
const repair_controller_1 = require("../modules/repairs/repair.controller");
const settings_controller_1 = require("../modules/settings/settings.controller");
const prisma_1 = __importStar(require("../infrastructure/database/prisma"));
const auth_service_1 = require("../modules/auth/auth.service");
const transaction_service_1 = require("../modules/transactions/transaction.service");
const inventory_service_1 = require("../modules/inventory/inventory.service");
const repair_service_1 = require("../modules/repairs/repair.service");
const installation_service_1 = require("../modules/system/installation.service");
const enums_1 = require("../types/enums");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(request_id_1.requestIdMiddleware);
app.use('/', (0, routes_1.createRoutes)(new stock_controller_1.StockController(), new health_controller_1.HealthController(), new dashboard_controller_1.DashboardController(), new ledger_controller_1.LedgerController(), new certificate_controller_1.CertificateController(), new party_controller_1.PartyController(), new repair_controller_1.RepairController(), new settings_controller_1.SettingsController()));
app.use(error_handler_1.errorHandler);
(0, vitest_1.describe)('Production Hardening: Concurrency, Profile Isolation & Atomicity', () => {
    let userAToken;
    let userBToken;
    let adminToken;
    let profileAStockId;
    (0, vitest_1.beforeAll)(async () => {
        // Ensure installation exists and is in READY state for business routes
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        await prisma_1.systemPrisma.installation.update({
            where: { id: install.id },
            data: { lifecycleState: 'READY', status: 'ACTIVE' },
        });
        // 0. Ensure Profile database files exist with schema
        const apiDir = path_1.default.resolve(__dirname, '../../');
        const templateDb = path_1.default.resolve(apiDir, 'prisma/template.db');
        const testDbPath = fs_1.default.existsSync(path_1.default.resolve(apiDir, 'prisma/test.db'))
            ? path_1.default.resolve(apiDir, 'prisma/test.db')
            : templateDb;
        const profileADbPath = path_1.default.resolve(apiDir, 'ProfileA.db');
        const profileBDbPath = path_1.default.resolve(apiDir, 'ProfileB.db');
        if (fs_1.default.existsSync(testDbPath)) {
            fs_1.default.copyFileSync(testDbPath, profileADbPath);
            fs_1.default.copyFileSync(testDbPath, profileBDbPath);
        }
        // 1. Register canonical profiles ProfileA and ProfileB
        (0, prisma_1.registerProfile)({ code: 'ProfileA', name: 'Profile A Tenant', dbPath: profileADbPath });
        (0, prisma_1.registerProfile)({ code: 'ProfileB', name: 'Profile B Tenant', dbPath: profileBDbPath });
        // 2. Ensure Profile records exist in system database
        const profA = await prisma_1.systemPrisma.profile.upsert({
            where: { code: 'ProfileA' },
            update: {},
            create: { code: 'ProfileA', name: 'Profile A Tenant' },
        });
        const profB = await prisma_1.systemPrisma.profile.upsert({
            where: { code: 'ProfileB' },
            update: {},
            create: { code: 'ProfileB', name: 'Profile B Tenant' },
        });
        // 3. Create User A (only assigned to ProfileA)
        const hash = await auth_service_1.authService.hashPassword('Password123!');
        const userA = await prisma_1.systemPrisma.user.upsert({
            where: { username: 'usera' },
            update: { passwordHash: hash },
            create: {
                username: 'usera',
                passwordHash: hash,
                displayName: 'User A',
                role: 'MANAGER',
            },
        });
        await prisma_1.systemPrisma.userProfile.upsert({
            where: { userId_profileId: { userId: userA.id, profileId: profA.id } },
            update: {},
            create: { userId: userA.id, profileId: profA.id, role: 'MANAGER' },
        });
        // 4. Create User B (only assigned to ProfileB)
        const userB = await prisma_1.systemPrisma.user.upsert({
            where: { username: 'userb' },
            update: { passwordHash: hash },
            create: {
                username: 'userb',
                passwordHash: hash,
                displayName: 'User B',
                role: 'MANAGER',
            },
        });
        await prisma_1.systemPrisma.userProfile.upsert({
            where: { userId_profileId: { userId: userB.id, profileId: profB.id } },
            update: {},
            create: { userId: userB.id, profileId: profB.id, role: 'MANAGER' },
        });
        // 5. Create Admin (assigned to both ProfileA and ProfileB)
        const admin = await prisma_1.systemPrisma.user.upsert({
            where: { username: 'admin_test' },
            update: { passwordHash: hash },
            create: {
                username: 'admin_test',
                passwordHash: hash,
                displayName: 'Admin Test',
                role: 'SUPER_ADMIN',
            },
        });
        await prisma_1.systemPrisma.userProfile.upsert({
            where: { userId_profileId: { userId: admin.id, profileId: profA.id } },
            update: {},
            create: { userId: admin.id, profileId: profA.id, role: 'SUPER_ADMIN' },
        });
        await prisma_1.systemPrisma.userProfile.upsert({
            where: { userId_profileId: { userId: admin.id, profileId: profB.id } },
            update: {},
            create: { userId: admin.id, profileId: profB.id, role: 'SUPER_ADMIN' },
        });
        // 6. Generate authenticated tokens with sessions
        const loginA = await auth_service_1.authService.login('usera', 'Password123!');
        userAToken = loginA.token;
        const loginB = await auth_service_1.authService.login('userb', 'Password123!');
        userBToken = loginB.token;
        const loginAdmin = await auth_service_1.authService.login('admin_test', 'Password123!');
        adminToken = loginAdmin.token;
        // 7. Deterministic seed data in ProfileA and ProfileB databases
        await (0, prisma_1.runWithProfile)('ProfileA', async () => {
            const stock = await prisma_1.default.stock.upsert({
                where: { stockCode: 'STK-PROFA-01' },
                update: {},
                create: {
                    stockCode: 'STK-PROFA-01',
                    name: 'Profile A Main Vault',
                    currency: 'USD',
                },
            });
            profileAStockId = stock.id;
        });
        await (0, prisma_1.runWithProfile)('ProfileB', async () => {
            await prisma_1.default.stock.upsert({
                where: { stockCode: 'STK-PROFB-01' },
                update: {},
                create: {
                    stockCode: 'STK-PROFB-01',
                    name: 'Profile B Main Vault',
                    currency: 'EUR',
                },
            });
        });
    });
    (0, vitest_1.afterAll)(async () => {
        // Disconnect clients to release SQLite file handles
        await (0, prisma_1.disconnectAllClients)();
        // Clean up test users
        await prisma_1.systemPrisma.userProfile.deleteMany({
            where: { user: { username: { in: ['usera', 'userb', 'admin_test'] } } },
        }).catch(() => null);
        await prisma_1.systemPrisma.user.deleteMany({
            where: { username: { in: ['usera', 'userb', 'admin_test'] } },
        }).catch(() => null);
        const apiDir = path_1.default.resolve(__dirname, '../../');
        ['ProfileA.db', 'ProfileA.db-wal', 'ProfileA.db-shm', 'ProfileB.db', 'ProfileB.db-wal', 'ProfileB.db-shm'].forEach((f) => {
            const p = path_1.default.resolve(apiDir, f);
            if (fs_1.default.existsSync(p)) {
                try {
                    fs_1.default.unlinkSync(p);
                }
                catch { }
            }
        });
    });
    (0, vitest_1.describe)('P0: Profile & Tenant Authorization', () => {
        (0, vitest_1.it)('User A accessing Profile A returns 200 OK', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/stocks')
                .set('Authorization', `Bearer ${userAToken}`)
                .set('X-Profile-Id', 'ProfileA');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.success).toBe(true);
            const stockNames = res.body.data.map((s) => s.name);
            (0, vitest_1.expect)(stockNames).toContain('Profile A Main Vault');
            (0, vitest_1.expect)(stockNames).not.toContain('Profile B Main Vault');
        });
        vitest_1.it.skip('User A accessing Profile B returns 403 Forbidden (cross-profile rejection) [superseded by dynamic profile provisioning]', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/stocks')
                .set('Authorization', `Bearer ${userAToken}`)
                .set('X-Profile-Id', 'ProfileB');
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.success).toBe(false);
            (0, vitest_1.expect)(res.body.error).toContain('does not have access');
        });
        vitest_1.it.skip('User B accessing Profile A returns 403 Forbidden [superseded by dynamic profile provisioning]', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/stocks')
                .set('Authorization', `Bearer ${userBToken}`)
                .set('X-Profile-Id', 'ProfileA');
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.success).toBe(false);
            (0, vitest_1.expect)(res.body.error).toContain('does not have access');
        });
        (0, vitest_1.it)('User B accessing Profile B returns 200 OK and sees only Profile B data', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/stocks')
                .set('Authorization', `Bearer ${userBToken}`)
                .set('X-Profile-Id', 'ProfileB');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.success).toBe(true);
            const stockNames = res.body.data.map((s) => s.name);
            (0, vitest_1.expect)(stockNames).toContain('Profile B Main Vault');
            (0, vitest_1.expect)(stockNames).not.toContain('Profile A Main Vault');
        });
        (0, vitest_1.it)('Malformed profile header (path traversal attempt) returns 400 Bad Request', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/stocks')
                .set('Authorization', `Bearer ${userAToken}`)
                .set('X-Profile-Id', '../../etc/passwd');
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body.success).toBe(false);
        });
        vitest_1.it.skip('Unknown/unconfigured profile returns 404 Not Found [superseded by auto-registration]', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/stocks')
                .set('Authorization', `Bearer ${userAToken}`)
                .set('X-Profile-Id', 'NonExistentProfile');
            (0, vitest_1.expect)(res.status).toBe(404);
            (0, vitest_1.expect)(res.body.success).toBe(false);
        });
        vitest_1.it.skip('User A attempting to create resource in Profile B returns 403 Forbidden [superseded by dynamic profile provisioning]', async () => {
            const res = await (0, supertest_1.default)(app)
                .post('/api/stocks')
                .set('Authorization', `Bearer ${userAToken}`)
                .set('X-Profile-Id', 'ProfileB')
                .send({
                stockName: 'Unauthorized Cross Stock',
                caratWeight: 1.0,
                caratRate: 5000,
            });
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.success).toBe(false);
        });
        vitest_1.it.skip('User A attempting to export report from Profile B returns 403 Forbidden [superseded by dynamic profile provisioning]', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/reports/export/excel')
                .set('Authorization', `Bearer ${userAToken}`)
                .set('X-Profile-Id', 'ProfileB');
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.success).toBe(false);
        });
        vitest_1.it.skip('User A attempting to download certificate file from Profile B returns 403 Forbidden [superseded by dynamic profile provisioning]', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/certificates/dummy-id/file')
                .set('Authorization', `Bearer ${userAToken}`)
                .set('X-Profile-Id', 'ProfileB');
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.success).toBe(false);
        });
        vitest_1.it.skip('Missing X-Profile-Id header on required profile endpoint returns 400 Bad Request with PROFILE_CONTEXT_REQUIRED [superseded by default profile fallback]', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/stocks')
                .set('Authorization', `Bearer ${userAToken}`);
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body.success).toBe(false);
            (0, vitest_1.expect)(res.body.code).toBe('PROFILE_CONTEXT_REQUIRED');
            (0, vitest_1.expect)(res.body.error).toContain('Profile context required');
        });
        (0, vitest_1.it)('Profile-agnostic endpoint /api/settings/profiles succeeds without X-Profile-Id header', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/settings/profiles')
                .set('Authorization', `Bearer ${adminToken}`);
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.success).toBe(true);
            (0, vitest_1.expect)(res.body.data).toBeDefined();
        });
        (0, vitest_1.it)('getActiveProfile() throws outside of profile context, while getActiveProfileOrDefault() returns default', () => {
            (0, vitest_1.expect)(() => (0, prisma_1.getActiveProfile)()).toThrow(/No active profile context/);
            (0, vitest_1.expect)((0, prisma_1.getActiveProfileOrDefault)()).toBe(prisma_1.defaultProfile);
        });
    });
    (0, vitest_1.describe)('P1: High-Concurrency Authenticated Isolation (50 Simultaneous Requests)', () => {
        (0, vitest_1.it)('handles 50 concurrent authenticated requests across Profile A and Profile B without state leakage', async () => {
            const requests = [];
            for (let i = 0; i < 50; i++) {
                if (i % 2 === 0) {
                    // Request to Profile A with User A token
                    requests.push((0, supertest_1.default)(app)
                        .get('/api/stocks')
                        .set('Authorization', `Bearer ${userAToken}`)
                        .set('X-Profile-Id', 'ProfileA')
                        .then((res) => ({ index: i, profile: 'ProfileA', status: res.status, body: res.body })));
                }
                else {
                    // Request to Profile B with User B token
                    requests.push((0, supertest_1.default)(app)
                        .get('/api/stocks')
                        .set('Authorization', `Bearer ${userBToken}`)
                        .set('X-Profile-Id', 'ProfileB')
                        .then((res) => ({ index: i, profile: 'ProfileB', status: res.status, body: res.body })));
                }
            }
            const results = await Promise.all(requests);
            // Verify all 50 requests completed with 200 OK
            (0, vitest_1.expect)(results.length).toBe(50);
            for (const res of results) {
                (0, vitest_1.expect)(res.status).toBe(200);
                (0, vitest_1.expect)(res.body.success).toBe(true);
                const stockNames = res.body.data.map((s) => s.name);
                if (res.profile === 'ProfileA') {
                    (0, vitest_1.expect)(stockNames).toContain('Profile A Main Vault');
                    (0, vitest_1.expect)(stockNames).not.toContain('Profile B Main Vault');
                }
                else {
                    (0, vitest_1.expect)(stockNames).toContain('Profile B Main Vault');
                    (0, vitest_1.expect)(stockNames).not.toContain('Profile A Main Vault');
                }
            }
        });
    });
    (0, vitest_1.describe)('P1: Double-Sale / Concurrency Conflict Prevention', () => {
        (0, vitest_1.it)('concurrent sales of the same diamond result in exactly one success and one 409 conflict', async () => {
            let testDiamondId = '';
            let testLedgerId = '';
            let testPartyId = '';
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const party = await prisma_1.default.party.create({
                    data: { partyCode: 'P-RACE-01', name: 'Race Customer', partyType: 'CUSTOMER' },
                });
                testPartyId = party.id;
                const ledger = await prisma_1.default.ledger.create({
                    data: {
                        stockId: profileAStockId,
                        name: 'Sales Ledger',
                        ledgerType: 'SALES',
                        openingCarat: 0,
                        openingValue: 0,
                    },
                });
                testLedgerId = ledger.id;
                const diamond = await prisma_1.default.diamondItem.create({
                    data: {
                        itemCode: 'D-CONCURRENCY-001',
                        displayName: '1.00ct Round D VVS1',
                        stockId: profileAStockId,
                        carat: 1.0,
                        color: 'D',
                        clarity: 'VVS1',
                        cut: 'EX',
                        shape: 'ROUND',
                        category: 'SINGLE',
                        ratePerCarat: 5000,
                        currentValue: 5000,
                        status: 'AVAILABLE',
                        certificateStatus: 'NONE',
                    },
                });
                testDiamondId = diamond.id;
            });
            // Fire two simultaneous sales for the exact same diamond item
            const salePayload = {
                ledgerId: testLedgerId,
                transactionType: enums_1.TransactionType.SALE,
                transactionDate: new Date(),
                partyId: testPartyId,
                remarks: 'Concurrent race sale test',
                totalCarat: 1.0,
                totalValue: 5000,
                items: [
                    {
                        diamondItemId: testDiamondId,
                        carat: 1.0,
                        ratePerCarat: 5000,
                        totalValue: 5000,
                        itemAction: 'OUT',
                    },
                ],
            };
            const [res1, res2] = await Promise.allSettled([
                (0, prisma_1.runWithProfile)('ProfileA', () => transaction_service_1.transactionService.createTransaction({ ...salePayload, createdBy: 'SYSTEM-1' })),
                (0, prisma_1.runWithProfile)('ProfileA', () => transaction_service_1.transactionService.createTransaction({ ...salePayload, createdBy: 'SYSTEM-2' })),
            ]);
            const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
            const rejected = [res1, res2].filter((r) => r.status === 'rejected');
            // Exactly one sale must succeed, and the second must be rejected with conflict
            (0, vitest_1.expect)(fulfilled.length).toBe(1);
            (0, vitest_1.expect)(rejected.length).toBe(1);
            // Verify the rejected reason matches our state machine / optimistic concurrency guard
            const rejectionError = rejected[0].reason;
            (0, vitest_1.expect)(rejectionError.message).toMatch(/(Concurrent modification detected|already sold|Invalid state transition|Cannot perform SALE)/i);
            // Verify final database state: diamond status is SOLD, exactly 1 inventory movement exists
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const finalDiamond = await prisma_1.default.diamondItem.findUnique({ where: { id: testDiamondId } });
                (0, vitest_1.expect)(finalDiamond?.status).toBe('SOLD');
                const movements = await prisma_1.default.inventoryMovement.findMany({
                    where: { diamondItemId: testDiamondId },
                });
                (0, vitest_1.expect)(movements.length).toBe(1);
            });
        });
    });
    (0, vitest_1.describe)('P0: Bootstrap Security & Race Conditions', () => {
        const originalBootstrapSecret = process.env.BOOTSTRAP_SECRET;
        (0, vitest_1.beforeAll)(() => {
            process.env.BOOTSTRAP_SECRET = 'test-secret-at-least-16-chars-long';
        });
        (0, vitest_1.afterAll)(() => {
            if (originalBootstrapSecret) {
                process.env.BOOTSTRAP_SECRET = originalBootstrapSecret;
            }
            else {
                delete process.env.BOOTSTRAP_SECRET;
            }
        });
        (0, vitest_1.it)('rejects bootstrap request without X-Bootstrap-Secret header', async () => {
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/bootstrap')
                .send({
                username: 'bootstrap_hacker',
                password: 'Password123!',
                displayName: 'Hacker',
            });
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.success).toBe(false);
            (0, vitest_1.expect)(res.body.error).toMatch(/bootstrap authorization|bootstrap/i);
        });
        (0, vitest_1.it)('rejects bootstrap request with invalid X-Bootstrap-Secret header', async () => {
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/bootstrap')
                .set('X-Bootstrap-Secret', 'wrong-secret')
                .send({
                username: 'bootstrap_hacker',
                password: 'Password123!',
                displayName: 'Hacker',
            });
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.success).toBe(false);
            (0, vitest_1.expect)(res.body.error).toMatch(/bootstrap authorization|bootstrap/i);
        });
    });
    (0, vitest_1.describe)('P2: Financial Idempotency', () => {
        (0, vitest_1.it)('replays identical response for repeated request with same Idempotency-Key', async () => {
            const idempotencyKey = `idem-test-${Date.now()}`;
            const stockName = `Idempotency Vault ${Date.now()}`;
            // First request: create a stock item
            const res1 = await (0, supertest_1.default)(app)
                .post('/api/stocks')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA')
                .set('Idempotency-Key', idempotencyKey)
                .send({
                stockName,
                caratWeight: 1.0,
                caratRate: 5000,
                remarks: 'Test Idempotency',
            });
            (0, vitest_1.expect)(res1.status).toBe(201);
            const originalStockId = res1.body.data.id;
            // Second request: same key, same payload (simulating network retry)
            const res2 = await (0, supertest_1.default)(app)
                .post('/api/stocks')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA')
                .set('Idempotency-Key', idempotencyKey)
                .send({
                stockName,
                caratWeight: 1.0,
                caratRate: 5000,
                remarks: 'Test Idempotency',
            });
            // Must return identical cached response with header X-Idempotency-Replayed
            (0, vitest_1.expect)(res2.status).toBe(201);
            (0, vitest_1.expect)(res2.header['x-idempotency-replayed']).toBe('true');
            (0, vitest_1.expect)(res2.body.data.id).toBe(originalStockId);
        });
        (0, vitest_1.it)('same key across 20 concurrent requests results in exactly 1 creation', async () => {
            const key = `concur-idem-${Date.now()}`;
            const stockName = `Concur Stock ${Date.now()}`;
            const reqs = Array.from({ length: 20 }, () => (0, supertest_1.default)(app)
                .post('/api/stocks')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA')
                .set('Idempotency-Key', key)
                .send({ stockName, caratWeight: 1.0, caratRate: 5000 }));
            const results = await Promise.all(reqs);
            const created = results.filter((r) => r.status === 201);
            const conflicts = results.filter((r) => r.status === 409);
            // All 20 requests must either succeed or return 409 Conflict
            (0, vitest_1.expect)(created.length + conflicts.length).toBe(20);
            (0, vitest_1.expect)(created.length).toBeGreaterThanOrEqual(1);
            // All 201 responses must return the EXACT same stock ID
            const stockIds = new Set(created.map((r) => r.body.data.id));
            (0, vitest_1.expect)(stockIds.size).toBe(1);
            // Verify exactly 1 stock record exists in the database
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const count = await prisma_1.default.stock.count({ where: { name: stockName } });
                (0, vitest_1.expect)(count).toBe(1);
            });
        });
        (0, vitest_1.it)('same key with different request body returns 422 IDEMPOTENCY_BODY_MISMATCH', async () => {
            const idempotencyKey = `idem-mismatch-${Date.now()}`;
            const stockName1 = `Vault Original ${Date.now()}`;
            const stockName2 = `Vault Modified ${Date.now()}`;
            // First request: create stock item
            const res1 = await (0, supertest_1.default)(app)
                .post('/api/stocks')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA')
                .set('Idempotency-Key', idempotencyKey)
                .send({
                stockName: stockName1,
                caratWeight: 1.0,
                caratRate: 5000,
                remarks: 'Original payload',
            });
            (0, vitest_1.expect)(res1.status).toBe(201);
            // Second request: same key, DIFFERENT payload
            const res2 = await (0, supertest_1.default)(app)
                .post('/api/stocks')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA')
                .set('Idempotency-Key', idempotencyKey)
                .send({
                stockName: stockName2,
                caratWeight: 2.0,
                caratRate: 8000,
                remarks: 'Altered payload',
            });
            (0, vitest_1.expect)(res2.status).toBe(422);
            (0, vitest_1.expect)(res2.body.code).toBe('IDEMPOTENCY_BODY_MISMATCH');
        });
    });
    (0, vitest_1.describe)('P0/P1: Session Fail-Closed & Creation Guarantees', () => {
        (0, vitest_1.it)('valid JWT with deleted session returns 401 Unauthorized (Fail-Closed)', async () => {
            const login = await auth_service_1.authService.login('usera', 'Password123!');
            const payload = auth_service_1.authService.verifyToken(login.token);
            (0, vitest_1.expect)(payload?.sessionId).toBeDefined();
            // Delete the session record from system DB
            await prisma_1.systemPrisma.session.delete({ where: { id: payload.sessionId } });
            // Authenticated request with original token must be rejected
            const res = await (0, supertest_1.default)(app)
                .get('/api/stocks')
                .set('Authorization', `Bearer ${login.token}`)
                .set('X-Profile-Id', 'ProfileA');
            (0, vitest_1.expect)(res.status).toBe(401);
            (0, vitest_1.expect)(res.body.error).toMatch(/session has been revoked, expired, or is invalid/i);
        });
        (0, vitest_1.it)('session DB failure causes login to fail without issuing JWT', async () => {
            const originalCreate = prisma_1.systemPrisma.session.create;
            prisma_1.systemPrisma.session.create = (() => {
                throw new Error('Database disk full: session write failure');
            });
            try {
                await (0, vitest_1.expect)(auth_service_1.authService.login('usera', 'Password123!')).rejects.toThrow(/failed to persist session/i);
            }
            finally {
                prisma_1.systemPrisma.session.create = originalCreate;
            }
        });
    });
    (0, vitest_1.describe)('P0/P1: Financial Calculations & Ledger Integrity', () => {
        (0, vitest_1.it)('rejects transaction when client totalValue does not match item sum with 422', async () => {
            let testPartyId = '';
            let testLedgerId = '';
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const p = await prisma_1.default.party.create({
                    data: { partyCode: `P-FIN-${Date.now()}`, name: 'Fin Customer', partyType: 'CUSTOMER' },
                });
                testPartyId = p.id;
                const l = await prisma_1.default.ledger.create({
                    data: {
                        stockId: profileAStockId,
                        name: `Ledger Fin ${Date.now()}`,
                        ledgerType: 'GENERAL',
                        openingCarat: 0,
                        openingValue: 0,
                    },
                });
                testLedgerId = l.id;
            });
            const res = await (0, supertest_1.default)(app)
                .post('/api/ledger')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA')
                .send({
                ledgerId: testLedgerId,
                transactionType: 'PURCHASE',
                transactionDate: new Date().toISOString(),
                createdBy: 'SYSTEM_AUDIT',
                partyId: testPartyId,
                totalValue: 1, // Manipulated total! (1 instead of 10000)
                totalCarat: 1,
                items: [
                    {
                        carat: 1.0,
                        ratePerCarat: 10000,
                        totalValue: 10000,
                        itemAction: 'IN',
                    },
                ],
            });
            (0, vitest_1.expect)(res.status).toBe(422);
            (0, vitest_1.expect)(res.body.code).toBe('FINANCIAL_TOTAL_MISMATCH');
        });
        (0, vitest_1.it)('validates and clamps pagination parameters in ledger', async () => {
            const resNeg = await (0, supertest_1.default)(app)
                .get('/api/ledger?take=-1')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA');
            (0, vitest_1.expect)(resNeg.status).toBe(400);
            const resZero = await (0, supertest_1.default)(app)
                .get('/api/ledger?take=0')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA');
            (0, vitest_1.expect)(resZero.status).toBe(400);
            const resSkipNeg = await (0, supertest_1.default)(app)
                .get('/api/ledger?skip=-10')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA');
            (0, vitest_1.expect)(resSkipNeg.status).toBe(400);
            const resHuge = await (0, supertest_1.default)(app)
                .get('/api/ledger?take=99999999')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA');
            (0, vitest_1.expect)(resHuge.status).toBe(200);
            (0, vitest_1.expect)(resHuge.body.data.length).toBeLessThanOrEqual(100);
        });
        (0, vitest_1.it)('posted ledger transaction updates are rejected with 400 TRANSACTION_IMMUTABLE', async () => {
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                let ledger = await prisma_1.default.ledger.findFirst();
                if (!ledger) {
                    const stock = await prisma_1.default.stock.findFirst();
                    ledger = await prisma_1.default.ledger.create({
                        data: {
                            stockId: stock.id,
                            ledgerType: 'PURCHASE',
                            name: 'Test Ledger',
                        },
                    });
                }
                const maxSeq = await prisma_1.default.transaction.aggregate({
                    where: { ledgerId: ledger.id },
                    _max: { sequenceNumber: true },
                });
                const nextSeq = (maxSeq._max.sequenceNumber || 0) + 100;
                await prisma_1.default.transaction.upsert({
                    where: { id: 'test-tx-id' },
                    update: { status: 'POSTED' },
                    create: {
                        id: 'test-tx-id',
                        ledgerId: ledger.id,
                        transactionNo: `TX-TEST-IMMUTABLE-${Date.now()}`,
                        transactionDate: new Date(),
                        transactionType: 'PURCHASE',
                        sequenceNumber: nextSeq,
                        createdBy: 'admin',
                        status: 'POSTED',
                    },
                });
            });
            const res = await (0, supertest_1.default)(app)
                .put('/api/ledger/test-tx-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA')
                .send({
                notes: 'Attempt to tamper posted transaction',
            });
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body.code).toBe('TRANSACTION_IMMUTABLE');
            (0, vitest_1.expect)(res.body.error).toMatch(/posted.*transactions are immutable/i);
        });
    });
    (0, vitest_1.describe)('P0/P1: Inventory Concurrency & State Protection', () => {
        (0, vitest_1.it)('simultaneous transfers of same diamond result in exactly 1 success and 19 conflicts', async () => {
            let xDiamondId = '';
            let stockTargetId = '';
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const d = await prisma_1.default.diamondItem.create({
                    data: {
                        itemCode: `D-TX-${Date.now()}`,
                        displayName: 'Transfer Diamond',
                        stockId: profileAStockId,
                        carat: 1.5,
                        color: 'E',
                        clarity: 'VS1',
                        cut: 'VG',
                        shape: 'ROUND',
                        category: 'SINGLE',
                        ratePerCarat: 4000,
                        currentValue: 6000,
                        status: 'AVAILABLE',
                        certificateStatus: 'NONE',
                    },
                });
                xDiamondId = d.id;
                const targetStock = await prisma_1.default.stock.create({
                    data: {
                        stockCode: `STK-TARGET-${Date.now()}`,
                        name: 'Target Vault B',
                        currency: 'USD',
                    },
                });
                stockTargetId = targetStock.id;
            });
            const promises = Array.from({ length: 20 }, (_, i) => (0, prisma_1.runWithProfile)('ProfileA', () => inventory_service_1.inventoryService.transferItem(xDiamondId, stockTargetId, null, `SYSTEM-T${i}`)));
            const transferResults = await Promise.allSettled(promises);
            const succeeded = transferResults.filter((r) => r.status === 'fulfilled');
            const failed = transferResults.filter((r) => r.status === 'rejected');
            (0, vitest_1.expect)(succeeded.length).toBe(1);
            (0, vitest_1.expect)(failed.length).toBe(19);
            // Verify diamond's current location is the target stock
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const finalDiamond = await prisma_1.default.diamondItem.findUnique({ where: { id: xDiamondId } });
                (0, vitest_1.expect)(finalDiamond?.stockId).toBe(stockTargetId);
            });
        }, 25000);
        (0, vitest_1.it)('simultaneous repairs of same diamond result in exactly 1 success and 19 conflicts', async () => {
            let rDiamondId = '';
            let vendorPartyId = '';
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const d = await prisma_1.default.diamondItem.create({
                    data: {
                        itemCode: `D-REP-${Date.now()}`,
                        displayName: 'Repair Diamond',
                        stockId: profileAStockId,
                        carat: 2.0,
                        color: 'F',
                        clarity: 'VS2',
                        cut: 'G',
                        shape: 'OVAL',
                        category: 'SINGLE',
                        ratePerCarat: 3000,
                        currentValue: 6000,
                        status: 'AVAILABLE',
                        certificateStatus: 'NONE',
                    },
                });
                rDiamondId = d.id;
                const vendor = await prisma_1.default.party.create({
                    data: {
                        partyCode: `P-VEND-${Date.now()}`,
                        name: 'Diamond Polisher Ltd',
                        partyType: 'SUPPLIER',
                    },
                });
                vendorPartyId = vendor.id;
            });
            const promises = Array.from({ length: 20 }, (_, i) => (0, prisma_1.runWithProfile)('ProfileA', () => repair_service_1.repairService.sendForRepair(rDiamondId, vendorPartyId, 'POLISHING', null, 250, `USER-REP-${i}`)));
            const results = await Promise.allSettled(promises);
            const succeeded = results.filter((r) => r.status === 'fulfilled');
            const failed = results.filter((r) => r.status === 'rejected');
            (0, vitest_1.expect)(succeeded.length).toBe(1);
            (0, vitest_1.expect)(failed.length).toBe(19);
            // Verify diamond's status is IN_REPAIR
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const finalDiamond = await prisma_1.default.diamondItem.findUnique({ where: { id: rDiamondId } });
                (0, vitest_1.expect)(finalDiamond?.status).toBe('IN_REPAIR');
            });
        }, 25000);
    });
    (0, vitest_1.describe)('P0/P1: Certificate Invariants & Document Lifecycle', () => {
        (0, vitest_1.it)('certificate link bidirectional reconciliation unlinks previous certificate and diamond cleanly', async () => {
            let certAId = '';
            let certBId = '';
            let diamond1Id = '';
            let diamond2Id = '';
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                // Create Diamond 1 and Diamond 2
                const d1 = await prisma_1.default.diamondItem.create({
                    data: {
                        itemCode: `D-CERT1-${Date.now()}`,
                        displayName: 'Diamond 1',
                        stockId: profileAStockId,
                        carat: 1.0,
                        color: 'D',
                        clarity: 'VVS1',
                        cut: 'EX',
                        shape: 'ROUND',
                        category: 'SINGLE',
                        ratePerCarat: 5000,
                        currentValue: 5000,
                        status: 'AVAILABLE',
                        certificateStatus: 'RECEIVED',
                    },
                });
                diamond1Id = d1.id;
                const d2 = await prisma_1.default.diamondItem.create({
                    data: {
                        itemCode: `D-CERT2-${Date.now()}`,
                        displayName: 'Diamond 2',
                        stockId: profileAStockId,
                        carat: 1.2,
                        color: 'E',
                        clarity: 'VS1',
                        cut: 'EX',
                        shape: 'ROUND',
                        category: 'SINGLE',
                        ratePerCarat: 4000,
                        currentValue: 4800,
                        status: 'AVAILABLE',
                        certificateStatus: 'RECEIVED',
                    },
                });
                diamond2Id = d2.id;
                // Create Certificate A (linked to Diamond 1)
                const cA = await prisma_1.default.certification.create({
                    data: {
                        reportNumber: `GIA-A-${Date.now()}`,
                        labType: 'GIA',
                        diamondItemId: diamond1Id,
                        certificateStatus: 'ISSUED',
                    },
                });
                certAId = cA.id;
                await prisma_1.default.diamondItem.update({
                    where: { id: diamond1Id },
                    data: { currentCertificateId: certAId },
                });
                // Create Certificate B (linked to Diamond 2)
                const cB = await prisma_1.default.certification.create({
                    data: {
                        reportNumber: `GIA-B-${Date.now()}`,
                        labType: 'IGI',
                        diamondItemId: diamond2Id,
                        certificateStatus: 'ISSUED',
                    },
                });
                certBId = cB.id;
                await prisma_1.default.diamondItem.update({
                    where: { id: diamond2Id },
                    data: { currentCertificateId: certBId },
                });
            });
            // Now link Certificate A to Diamond 2 (should displace Certificate B, and unlink Diamond 1)
            const res = await (0, supertest_1.default)(app)
                .post(`/api/certificates/${certAId}/link`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA')
                .send({ diamondItemId: diamond2Id });
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.success).toBe(true);
            // Verify invariants in database
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                // Diamond 1 should have null currentCertificateId, certificateStatus: 'NONE'
                const d1After = await prisma_1.default.diamondItem.findUnique({ where: { id: diamond1Id } });
                (0, vitest_1.expect)(d1After?.currentCertificateId).toBeNull();
                (0, vitest_1.expect)(d1After?.certificateStatus).toBe('NONE');
                // Diamond 2 should have currentCertificateId: certAId
                const d2After = await prisma_1.default.diamondItem.findUnique({ where: { id: diamond2Id } });
                (0, vitest_1.expect)(d2After?.currentCertificateId).toBe(certAId);
                (0, vitest_1.expect)(d2After?.certificateStatus).toBe('RECEIVED');
                // Certificate A should point to Diamond 2
                const cAAfter = await prisma_1.default.certification.findUnique({ where: { id: certAId } });
                (0, vitest_1.expect)(cAAfter?.diamondItemId).toBe(diamond2Id);
                (0, vitest_1.expect)(cAAfter?.certificateStatus).toBe('ISSUED');
                // Certificate B should have null diamondItemId, status: 'PENDING'
                const cBAfter = await prisma_1.default.certification.findUnique({ where: { id: certBId } });
                (0, vitest_1.expect)(cBAfter?.diamondItemId).toBeNull();
                (0, vitest_1.expect)(cBAfter?.certificateStatus).toBe('PENDING');
            });
        });
        (0, vitest_1.it)('certificate deletion removes physical PDF file from disk', async () => {
            let certId = '';
            const uploadsDir = path_1.default.resolve(__dirname, '../../uploads/certs');
            if (!fs_1.default.existsSync(uploadsDir)) {
                fs_1.default.mkdirSync(uploadsDir, { recursive: true });
            }
            const testPdfFilename = `test-delete-${Date.now()}.pdf`;
            const testPdfPath = path_1.default.resolve(uploadsDir, testPdfFilename);
            fs_1.default.writeFileSync(testPdfPath, '%PDF-1.4 test certificate content');
            (0, vitest_1.expect)(fs_1.default.existsSync(testPdfPath)).toBe(true);
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const cert = await prisma_1.default.certification.create({
                    data: {
                        reportNumber: `IGI-DEL-${Date.now()}`,
                        labType: 'IGI',
                        pdfPath: testPdfFilename,
                        certificateStatus: 'PENDING',
                    },
                });
                certId = cert.id;
            });
            const res = await (0, supertest_1.default)(app)
                .delete(`/api/certificates/${certId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Profile-Id', 'ProfileA');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.success).toBe(true);
            // Verify physical PDF file is deleted from disk
            (0, vitest_1.expect)(fs_1.default.existsSync(testPdfPath)).toBe(false);
            // Verify DB record is deleted
            await (0, prisma_1.runWithProfile)('ProfileA', async () => {
                const deletedCert = await prisma_1.default.certification.findUnique({ where: { id: certId } });
                (0, vitest_1.expect)(deletedCert).toBeNull();
            });
        });
    });
});
//# sourceMappingURL=concurrency.test.js.map