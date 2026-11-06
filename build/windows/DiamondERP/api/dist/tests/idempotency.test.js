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
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const idempotency_1 = require("../middleware/idempotency");
const prisma_1 = __importStar(require("../infrastructure/database/prisma"));
(0, vitest_1.describe)('Phase 3: Idempotency Hardening & Guarantees', () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    const apiDir = path_1.default.resolve(__dirname, '../../');
    const idemDbPath = path_1.default.resolve(apiDir, 'IdemTest.db');
    // Setup test routes
    app.get('/test-read', (_req, res) => {
        res.json({ success: true, message: 'read ok' });
    });
    app.post('/test-financial-mutation', (0, idempotency_1.requireIdempotency)({ message: 'Financial operations require Idempotency-Key' }), idempotency_1.idempotencyMiddleware, (req, res) => {
        res.status(201).json({ success: true, received: req.body });
    });
    app.post('/test-large-mutation', idempotency_1.idempotencyMiddleware, (_req, res) => {
        // Return a payload larger than 64KB to trigger compaction
        const largeData = 'X'.repeat(70 * 1024);
        res.status(200).json({ success: true, data: { id: 'large-123', payload: largeData } });
    });
    (0, vitest_1.beforeAll)(async () => {
        const templateDb = path_1.default.resolve(apiDir, 'prisma/template.db');
        if (fs_1.default.existsSync(templateDb)) {
            fs_1.default.copyFileSync(templateDb, idemDbPath);
        }
        (0, prisma_1.registerProfile)({ code: 'IdemTest', name: 'Idempotency Test Profile', dbPath: idemDbPath });
    });
    (0, vitest_1.afterAll)(async () => {
        await (0, prisma_1.disconnectAllClients)();
        ['IdemTest.db', 'IdemTest.db-wal', 'IdemTest.db-shm'].forEach((f) => {
            const p = path_1.default.resolve(apiDir, f);
            if (fs_1.default.existsSync(p)) {
                try {
                    fs_1.default.unlinkSync(p);
                }
                catch { }
            }
        });
    });
    (0, vitest_1.describe)('3.1 requireIdempotency middleware', () => {
        (0, vitest_1.it)('rejects POST request without Idempotency-Key with 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
            const res = await (0, supertest_1.default)(app)
                .post('/test-financial-mutation')
                .send({ amount: 1000 });
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body.success).toBe(false);
            (0, vitest_1.expect)(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
            (0, vitest_1.expect)(res.body.error).toContain('Financial operations require Idempotency-Key');
        });
        (0, vitest_1.it)('allows GET requests through without Idempotency-Key', async () => {
            const res = await (0, supertest_1.default)(app).get('/test-read');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.success).toBe(true);
        });
        (0, vitest_1.it)('allows mutating request with valid Idempotency-Key', async () => {
            const key = `idem-valid-${Date.now()}`;
            const res = await (0, supertest_1.default)(app)
                .post('/test-financial-mutation')
                .set('Idempotency-Key', key)
                .send({ amount: 500 });
            (0, vitest_1.expect)(res.status).toBe(201);
            (0, vitest_1.expect)(res.body.success).toBe(true);
        });
    });
    (0, vitest_1.describe)('3.4 Compact response storage', () => {
        (0, vitest_1.it)('compacts stored response body when response exceeds 64KB', async () => {
            const key = `idem-large-${Date.now()}`;
            const res = await (0, supertest_1.default)(app)
                .post('/test-large-mutation')
                .set('Idempotency-Key', key)
                .send({ trigger: 'large' });
            (0, vitest_1.expect)(res.status).toBe(200);
            // Inspect the idempotencyKey record directly in the DB
            const record = await prisma_1.default.idempotencyKey.findFirst({
                where: { key },
            });
            (0, vitest_1.expect)(record).toBeDefined();
            (0, vitest_1.expect)(record?.status).toBe('SUCCESS');
            (0, vitest_1.expect)(record?.responseBody).toBeDefined();
            const parsedStored = JSON.parse(record.responseBody);
            (0, vitest_1.expect)(parsedStored.compacted).toBe(true);
            (0, vitest_1.expect)(parsedStored.data.id).toBe('large-123');
            (0, vitest_1.expect)(record.responseBody.length).toBeLessThan(1024); // Well under 64KB
        });
    });
    (0, vitest_1.describe)('3.2 & 3.3 Atomic CAS on FAILED and Expired records', () => {
        (0, vitest_1.it)('allows retrying a FAILED idempotency key with new request', async () => {
            const key = `idem-retry-${Date.now()}`;
            const retryPayload = { retry: true };
            const hash = crypto_1.default.createHash('sha256').update(JSON.stringify(retryPayload)).digest('hex');
            // Insert a FAILED record manually into DB with matching payload hash
            await prisma_1.default.idempotencyKey.create({
                data: {
                    key,
                    userId: 'anonymous',
                    profileId: prisma_1.defaultProfile,
                    method: 'POST',
                    path: '/test-financial-mutation',
                    requestHash: hash,
                    status: 'FAILED',
                    expiresAt: new Date(Date.now() + 3600 * 1000),
                },
            });
            // Now retry with same key through the middleware
            const res = await (0, supertest_1.default)(app)
                .post('/test-financial-mutation')
                .set('Idempotency-Key', key)
                .send(retryPayload);
            (0, vitest_1.expect)(res.status).toBe(201);
            (0, vitest_1.expect)(res.body.success).toBe(true);
            const record = await prisma_1.default.idempotencyKey.findFirst({
                where: { key },
            });
            (0, vitest_1.expect)(record?.status).toBe('SUCCESS');
        });
        (0, vitest_1.it)('reclaims an expired idempotency key and executes successfully', async () => {
            const key = `idem-expired-${Date.now()}`;
            // Insert an expired record
            await prisma_1.default.idempotencyKey.create({
                data: {
                    key,
                    userId: 'anonymous',
                    profileId: prisma_1.defaultProfile,
                    method: 'POST',
                    path: '/test-financial-mutation',
                    requestHash: 'old-hash',
                    status: 'SUCCESS',
                    statusCode: 200,
                    responseBody: JSON.stringify({ old: true }),
                    expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 minute ago
                },
            });
            // Now request with the same key
            const res = await (0, supertest_1.default)(app)
                .post('/test-financial-mutation')
                .set('Idempotency-Key', key)
                .send({ reclaimed: true });
            (0, vitest_1.expect)(res.status).toBe(201);
            (0, vitest_1.expect)(res.body.received).toEqual({ reclaimed: true });
            const record = await prisma_1.default.idempotencyKey.findFirst({
                where: { key },
            });
            (0, vitest_1.expect)(record?.status).toBe('SUCCESS');
        });
    });
});
//# sourceMappingURL=idempotency.test.js.map