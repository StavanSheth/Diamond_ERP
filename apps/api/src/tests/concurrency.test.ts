import path from 'path';
import fs from 'fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requestIdMiddleware } from '../middleware/request-id';
import { errorHandler } from '../middleware/error-handler';
import { createRoutes } from '../routes';
import { StockController } from '../modules/stocks/stock.controller';
import { HealthController } from '../modules/system/health.controller';
import { DashboardController } from '../modules/dashboard/dashboard.controller';
import { LedgerController } from '../modules/ledger/ledger.controller';
import { CertificateController } from '../modules/certificates/certificate.controller';
import { PartyController } from '../modules/parties/party.controller';
import { RepairController } from '../modules/repairs/repair.controller';
import { SettingsController } from '../modules/settings/settings.controller';
import prisma, { systemPrisma, registerProfile, runWithProfile, disconnectAllClients } from '../infrastructure/database/prisma';
import { authService } from '../modules/auth/auth.service';
import { transactionService } from '../modules/transactions/transaction.service';
import { inventoryService } from '../modules/inventory/inventory.service';
import { repairService } from '../modules/repairs/repair.service';
import { TransactionType } from '../types/enums';

const app = express();
app.use(express.json());
app.use(requestIdMiddleware);
app.use(
  '/',
  createRoutes(
    new StockController(),
    new HealthController(),
    new DashboardController(),
    new LedgerController(),
    new CertificateController(),
    new PartyController(),
    new RepairController(),
    new SettingsController()
  )
);
app.use(errorHandler);

describe('Production Hardening: Concurrency, Profile Isolation & Atomicity', () => {
  let userAToken: string;
  let userBToken: string;
  let adminToken: string;
  let profileAStockId: string;

  beforeAll(async () => {
    // 0. Ensure Profile database files exist with schema
    const apiDir = path.resolve(__dirname, '../../');
    const testDbPath = path.resolve(apiDir, 'prisma/test.db');
    const profileADbPath = path.resolve(apiDir, 'ProfileA.db');
    const profileBDbPath = path.resolve(apiDir, 'ProfileB.db');

    if (fs.existsSync(testDbPath)) {
      fs.copyFileSync(testDbPath, profileADbPath);
      fs.copyFileSync(testDbPath, profileBDbPath);
    }

    // 1. Register canonical profiles ProfileA and ProfileB
    registerProfile({ code: 'ProfileA', name: 'Profile A Tenant' });
    registerProfile({ code: 'ProfileB', name: 'Profile B Tenant' });

    // 2. Ensure Profile records exist in system database
    const profA = await systemPrisma.profile.upsert({
      where: { code: 'ProfileA' },
      update: {},
      create: { code: 'ProfileA', name: 'Profile A Tenant' },
    });

    const profB = await systemPrisma.profile.upsert({
      where: { code: 'ProfileB' },
      update: {},
      create: { code: 'ProfileB', name: 'Profile B Tenant' },
    });

    // 3. Create User A (only assigned to ProfileA)
    const hash = await authService.hashPassword('Password123!');
    const userA = await systemPrisma.user.upsert({
      where: { username: 'usera' },
      update: { passwordHash: hash },
      create: {
        username: 'usera',
        passwordHash: hash,
        displayName: 'User A',
        role: 'MANAGER',
      },
    });

    await systemPrisma.userProfile.upsert({
      where: { userId_profileId: { userId: userA.id, profileId: profA.id } },
      update: {},
      create: { userId: userA.id, profileId: profA.id, role: 'MANAGER' },
    });

    // 4. Create User B (only assigned to ProfileB)
    const userB = await systemPrisma.user.upsert({
      where: { username: 'userb' },
      update: { passwordHash: hash },
      create: {
        username: 'userb',
        passwordHash: hash,
        displayName: 'User B',
        role: 'MANAGER',
      },
    });

    await systemPrisma.userProfile.upsert({
      where: { userId_profileId: { userId: userB.id, profileId: profB.id } },
      update: {},
      create: { userId: userB.id, profileId: profB.id, role: 'MANAGER' },
    });

    // 5. Create Admin (assigned to both ProfileA and ProfileB)
    const admin = await systemPrisma.user.upsert({
      where: { username: 'admin_test' },
      update: { passwordHash: hash },
      create: {
        username: 'admin_test',
        passwordHash: hash,
        displayName: 'Admin Test',
        role: 'SUPER_ADMIN',
      },
    });

    await systemPrisma.userProfile.upsert({
      where: { userId_profileId: { userId: admin.id, profileId: profA.id } },
      update: {},
      create: { userId: admin.id, profileId: profA.id, role: 'SUPER_ADMIN' },
    });
    await systemPrisma.userProfile.upsert({
      where: { userId_profileId: { userId: admin.id, profileId: profB.id } },
      update: {},
      create: { userId: admin.id, profileId: profB.id, role: 'SUPER_ADMIN' },
    });

    // 6. Generate authenticated tokens with sessions
    const loginA = await authService.login('usera', 'Password123!');
    userAToken = loginA.token;

    const loginB = await authService.login('userb', 'Password123!');
    userBToken = loginB.token;

    const loginAdmin = await authService.login('admin_test', 'Password123!');
    adminToken = loginAdmin.token;

    // 7. Deterministic seed data in ProfileA and ProfileB databases
    await runWithProfile('ProfileA', async () => {
      const stock = await prisma.stock.upsert({
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

    await runWithProfile('ProfileB', async () => {
      await prisma.stock.upsert({
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

  afterAll(async () => {
    // Disconnect clients to release SQLite file handles
    await disconnectAllClients();

    // Clean up test users
    await systemPrisma.userProfile.deleteMany({
      where: { user: { username: { in: ['usera', 'userb', 'admin_test'] } } },
    }).catch(() => null);
    await systemPrisma.user.deleteMany({
      where: { username: { in: ['usera', 'userb', 'admin_test'] } },
    }).catch(() => null);

    const apiDir = path.resolve(__dirname, '../../');
    ['ProfileA.db', 'ProfileA.db-wal', 'ProfileA.db-shm', 'ProfileB.db', 'ProfileB.db-wal', 'ProfileB.db-shm'].forEach((f) => {
      const p = path.resolve(apiDir, f);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    });
  });

  describe('P0: Profile & Tenant Authorization', () => {
    it('User A accessing Profile A returns 200 OK', async () => {
      const res = await request(app)
        .get('/api/stocks')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Profile-Id', 'ProfileA');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const stockNames = res.body.data.map((s: any) => s.name);
      expect(stockNames).toContain('Profile A Main Vault');
      expect(stockNames).not.toContain('Profile B Main Vault');
    });

    it('User A accessing Profile B returns 403 Forbidden (cross-profile rejection)', async () => {
      const res = await request(app)
        .get('/api/stocks')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Profile-Id', 'ProfileB');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('does not have access');
    });

    it('User B accessing Profile A returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/stocks')
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Profile-Id', 'ProfileA');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('does not have access');
    });

    it('User B accessing Profile B returns 200 OK and sees only Profile B data', async () => {
      const res = await request(app)
        .get('/api/stocks')
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Profile-Id', 'ProfileB');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const stockNames = res.body.data.map((s: any) => s.name);
      expect(stockNames).toContain('Profile B Main Vault');
      expect(stockNames).not.toContain('Profile A Main Vault');
    });

    it('Malformed profile header (path traversal attempt) returns 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/stocks')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Profile-Id', '../../etc/passwd');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('Unknown/unconfigured profile returns 404 Not Found', async () => {
      const res = await request(app)
        .get('/api/stocks')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Profile-Id', 'NonExistentProfile');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('User A attempting to create resource in Profile B returns 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/stocks')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Profile-Id', 'ProfileB')
        .send({
          stockName: 'Unauthorized Cross Stock',
          caratWeight: 1.0,
          caratRate: 5000,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('User A attempting to export report from Profile B returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/reports/export/excel')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Profile-Id', 'ProfileB');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('User A attempting to download certificate file from Profile B returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/certificates/dummy-id/file')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Profile-Id', 'ProfileB');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('P1: High-Concurrency Authenticated Isolation (50 Simultaneous Requests)', () => {
    it('handles 50 concurrent authenticated requests across Profile A and Profile B without state leakage', async () => {
      const requests = [];

      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          // Request to Profile A with User A token
          requests.push(
            request(app)
              .get('/api/stocks')
              .set('Authorization', `Bearer ${userAToken}`)
              .set('X-Profile-Id', 'ProfileA')
              .then((res) => ({ index: i, profile: 'ProfileA', status: res.status, body: res.body }))
          );
        } else {
          // Request to Profile B with User B token
          requests.push(
            request(app)
              .get('/api/stocks')
              .set('Authorization', `Bearer ${userBToken}`)
              .set('X-Profile-Id', 'ProfileB')
              .then((res) => ({ index: i, profile: 'ProfileB', status: res.status, body: res.body }))
          );
        }
      }

      const results = await Promise.all(requests);

      // Verify all 50 requests completed with 200 OK
      expect(results.length).toBe(50);
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const stockNames = res.body.data.map((s: any) => s.name);
        if (res.profile === 'ProfileA') {
          expect(stockNames).toContain('Profile A Main Vault');
          expect(stockNames).not.toContain('Profile B Main Vault');
        } else {
          expect(stockNames).toContain('Profile B Main Vault');
          expect(stockNames).not.toContain('Profile A Main Vault');
        }
      }
    });
  });

  describe('P1: Double-Sale / Concurrency Conflict Prevention', () => {
    it('concurrent sales of the same diamond result in exactly one success and one 409 conflict', async () => {
      let testDiamondId = '';
      let testLedgerId = '';
      let testPartyId = '';

      await runWithProfile('ProfileA', async () => {
        const party = await prisma.party.create({
          data: { partyCode: 'P-RACE-01', name: 'Race Customer', partyType: 'CUSTOMER' },
        });
        testPartyId = party.id;

        const ledger = await prisma.ledger.create({
          data: {
            stockId: profileAStockId,
            name: 'Sales Ledger',
            ledgerType: 'SALES',
            openingCarat: 0,
            openingValue: 0,
          },
        });
        testLedgerId = ledger.id;

        const diamond = await prisma.diamondItem.create({
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
        transactionType: TransactionType.SALE,
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
        runWithProfile('ProfileA', () =>
          transactionService.createTransaction({ ...salePayload, createdBy: 'SYSTEM-1' })
        ),
        runWithProfile('ProfileA', () =>
          transactionService.createTransaction({ ...salePayload, createdBy: 'SYSTEM-2' })
        ),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      // Exactly one sale must succeed, and the second must be rejected with conflict
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify the rejected reason matches our state machine / optimistic concurrency guard
      const rejectionError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionError.message).toMatch(/(Concurrent modification detected|already sold|Invalid state transition|Cannot perform SALE)/i);

      // Verify final database state: diamond status is SOLD, exactly 1 inventory movement exists
      await runWithProfile('ProfileA', async () => {
        const finalDiamond = await prisma.diamondItem.findUnique({ where: { id: testDiamondId } });
        expect(finalDiamond?.status).toBe('SOLD');

        const movements = await prisma.inventoryMovement.findMany({
          where: { diamondItemId: testDiamondId },
        });
        expect(movements.length).toBe(1);
      });
    });
  });

  describe('P0: Bootstrap Security & Race Conditions', () => {
    const originalBootstrapSecret = process.env.BOOTSTRAP_SECRET;

    beforeAll(() => {
      process.env.BOOTSTRAP_SECRET = 'test-secret-at-least-16-chars-long';
    });

    afterAll(() => {
      if (originalBootstrapSecret) {
        process.env.BOOTSTRAP_SECRET = originalBootstrapSecret;
      } else {
        delete process.env.BOOTSTRAP_SECRET;
      }
    });

    it('rejects bootstrap request without X-Bootstrap-Secret header', async () => {
      const res = await request(app)
        .post('/api/auth/bootstrap')
        .send({
          username: 'bootstrap_hacker',
          password: 'Password123!',
          displayName: 'Hacker',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/bootstrap authorization|bootstrap/i);
    });

    it('rejects bootstrap request with invalid X-Bootstrap-Secret header', async () => {
      const res = await request(app)
        .post('/api/auth/bootstrap')
        .set('X-Bootstrap-Secret', 'wrong-secret')
        .send({
          username: 'bootstrap_hacker',
          password: 'Password123!',
          displayName: 'Hacker',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/bootstrap authorization|bootstrap/i);
    });
  });

  describe('P2: Financial Idempotency', () => {
    it('replays identical response for repeated request with same Idempotency-Key', async () => {
      const idempotencyKey = `idem-test-${Date.now()}`;
      const stockName = `Idempotency Vault ${Date.now()}`;

      // First request: create a stock item
      const res1 = await request(app)
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

      expect(res1.status).toBe(201);
      const originalStockId = res1.body.data.id;

      // Second request: same key, same payload (simulating network retry)
      const res2 = await request(app)
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
      expect(res2.status).toBe(201);
      expect(res2.header['x-idempotency-replayed']).toBe('true');
      expect(res2.body.data.id).toBe(originalStockId);
    });

    it('same key across 20 concurrent requests results in exactly 1 creation', async () => {
      const key = `concur-idem-${Date.now()}`;
      const stockName = `Concur Stock ${Date.now()}`;

      const reqs = Array.from({ length: 20 }, () =>
        request(app)
          .post('/api/stocks')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Profile-Id', 'ProfileA')
          .set('Idempotency-Key', key)
          .send({ stockName, caratWeight: 1.0, caratRate: 5000 })
      );

      const results = await Promise.all(reqs);
      const created = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      // All 20 requests must either succeed or return 409 Conflict
      expect(created.length + conflicts.length).toBe(20);
      expect(created.length).toBeGreaterThanOrEqual(1);

      // All 201 responses must return the EXACT same stock ID
      const stockIds = new Set(created.map((r) => r.body.data.id));
      expect(stockIds.size).toBe(1);

      // Verify exactly 1 stock record exists in the database
      await runWithProfile('ProfileA', async () => {
        const count = await prisma.stock.count({ where: { name: stockName } });
        expect(count).toBe(1);
      });
    });

    it('same key with different request body returns 422 IDEMPOTENCY_BODY_MISMATCH', async () => {
      const idempotencyKey = `idem-mismatch-${Date.now()}`;
      const stockName1 = `Vault Original ${Date.now()}`;
      const stockName2 = `Vault Modified ${Date.now()}`;

      // First request: create stock item
      const res1 = await request(app)
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

      expect(res1.status).toBe(201);

      // Second request: same key, DIFFERENT payload
      const res2 = await request(app)
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

      expect(res2.status).toBe(422);
      expect(res2.body.code).toBe('IDEMPOTENCY_BODY_MISMATCH');
    });
  });

  describe('P0/P1: Session Fail-Closed & Creation Guarantees', () => {
    it('valid JWT with deleted session returns 401 Unauthorized (Fail-Closed)', async () => {
      const login = await authService.login('usera', 'Password123!');
      const payload = authService.verifyToken(login.token);
      expect(payload?.sessionId).toBeDefined();

      // Delete the session record from system DB
      await systemPrisma.session.delete({ where: { id: payload!.sessionId! } });

      // Authenticated request with original token must be rejected
      const res = await request(app)
        .get('/api/stocks')
        .set('Authorization', `Bearer ${login.token}`)
        .set('X-Profile-Id', 'ProfileA');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/session has been revoked, expired, or is invalid/i);
    });

    it('session DB failure causes login to fail without issuing JWT', async () => {
      const originalCreate = systemPrisma.session.create;
      systemPrisma.session.create = (() => {
        throw new Error('Database disk full: session write failure');
      }) as any;

      try {
        await expect(authService.login('usera', 'Password123!')).rejects.toThrow(/failed to persist session/i);
      } finally {
        systemPrisma.session.create = originalCreate;
      }
    });
  });

  describe('P0/P1: Financial Calculations & Ledger Integrity', () => {
    it('rejects transaction when client totalValue does not match item sum with 422', async () => {
      let testPartyId = '';
      let testLedgerId = '';
      await runWithProfile('ProfileA', async () => {
        const p = await prisma.party.create({
          data: { partyCode: `P-FIN-${Date.now()}`, name: 'Fin Customer', partyType: 'CUSTOMER' },
        });
        testPartyId = p.id;

        const l = await prisma.ledger.create({
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

      const res = await request(app)
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

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('FINANCIAL_TOTAL_MISMATCH');
    });

    it('validates and clamps pagination parameters in ledger', async () => {
      const resNeg = await request(app)
        .get('/api/ledger?take=-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Profile-Id', 'ProfileA');
      expect(resNeg.status).toBe(400);

      const resZero = await request(app)
        .get('/api/ledger?take=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Profile-Id', 'ProfileA');
      expect(resZero.status).toBe(400);

      const resSkipNeg = await request(app)
        .get('/api/ledger?skip=-10')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Profile-Id', 'ProfileA');
      expect(resSkipNeg.status).toBe(400);

      const resHuge = await request(app)
        .get('/api/ledger?take=99999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Profile-Id', 'ProfileA');
      expect(resHuge.status).toBe(200);
      expect(resHuge.body.data.length).toBeLessThanOrEqual(100);
    });

    it('posted ledger transaction updates are rejected with 400 TRANSACTION_IMMUTABLE', async () => {
      const res = await request(app)
        .put('/api/ledger/test-tx-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Profile-Id', 'ProfileA')
        .send({
          notes: 'Attempt to tamper posted transaction',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TRANSACTION_IMMUTABLE');
      expect(res.body.error).toMatch(/posted.*transactions are immutable/i);
    });
  });

  describe('P0/P1: Inventory Concurrency & State Protection', () => {
    it('simultaneous transfers of same diamond result in exactly 1 success and 19 conflicts', async () => {
      let xDiamondId = '';
      let stockTargetId = '';
      await runWithProfile('ProfileA', async () => {
        const d = await prisma.diamondItem.create({
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

        const targetStock = await prisma.stock.create({
          data: {
            stockCode: `STK-TARGET-${Date.now()}`,
            name: 'Target Vault B',
            currency: 'USD',
          },
        });
        stockTargetId = targetStock.id;
      });

      const promises = Array.from({ length: 20 }, (_, i) =>
        runWithProfile('ProfileA', () =>
          inventoryService.transferItem(xDiamondId, stockTargetId, null, `SYSTEM-T${i}`)
        )
      );

      const transferResults = await Promise.allSettled(promises);
      const succeeded = transferResults.filter((r) => r.status === 'fulfilled');
      const failed = transferResults.filter((r) => r.status === 'rejected');

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(19);

      // Verify diamond's current location is the target stock
      await runWithProfile('ProfileA', async () => {
        const finalDiamond = await prisma.diamondItem.findUnique({ where: { id: xDiamondId } });
        expect(finalDiamond?.stockId).toBe(stockTargetId);
      });
    }, 25000);

    it('simultaneous repairs of same diamond result in exactly 1 success and 19 conflicts', async () => {
      let rDiamondId = '';
      let vendorPartyId = '';
      await runWithProfile('ProfileA', async () => {
        const d = await prisma.diamondItem.create({
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

        const vendor = await prisma.party.create({
          data: {
            partyCode: `P-VEND-${Date.now()}`,
            name: 'Diamond Polisher Ltd',
            partyType: 'SUPPLIER',
          },
        });
        vendorPartyId = vendor.id;
      });

      const promises = Array.from({ length: 20 }, (_, i) =>
        runWithProfile('ProfileA', () =>
          repairService.sendForRepair(
            rDiamondId,
            vendorPartyId,
            'POLISHING',
            null,
            250,
            `USER-REP-${i}`
          )
        )
      );

      const results = await Promise.allSettled(promises);
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(19);

      // Verify diamond's status is IN_REPAIR
      await runWithProfile('ProfileA', async () => {
        const finalDiamond = await prisma.diamondItem.findUnique({ where: { id: rDiamondId } });
        expect(finalDiamond?.status).toBe('IN_REPAIR');
      });
    }, 25000);
  });

  describe('P0/P1: Certificate Invariants & Document Lifecycle', () => {
    it('certificate link bidirectional reconciliation unlinks previous certificate and diamond cleanly', async () => {
      let certAId = '';
      let certBId = '';
      let diamond1Id = '';
      let diamond2Id = '';

      await runWithProfile('ProfileA', async () => {
        // Create Diamond 1 and Diamond 2
        const d1 = await prisma.diamondItem.create({
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
            certificateStatus: 'CERTIFIED',
          },
        });
        diamond1Id = d1.id;

        const d2 = await prisma.diamondItem.create({
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
            certificateStatus: 'CERTIFIED',
          },
        });
        diamond2Id = d2.id;

        // Create Certificate A (linked to Diamond 1)
        const cA = await prisma.certification.create({
          data: {
            reportNumber: `GIA-A-${Date.now()}`,
            labType: 'GIA',
            diamondItemId: diamond1Id,
            certificateStatus: 'ISSUED',
          },
        });
        certAId = cA.id;
        await prisma.diamondItem.update({
          where: { id: diamond1Id },
          data: { currentCertificateId: certAId },
        });

        // Create Certificate B (linked to Diamond 2)
        const cB = await prisma.certification.create({
          data: {
            reportNumber: `GIA-B-${Date.now()}`,
            labType: 'IGI',
            diamondItemId: diamond2Id,
            certificateStatus: 'ISSUED',
          },
        });
        certBId = cB.id;
        await prisma.diamondItem.update({
          where: { id: diamond2Id },
          data: { currentCertificateId: certBId },
        });
      });

      // Now link Certificate A to Diamond 2 (should displace Certificate B, and unlink Diamond 1)
      const res = await request(app)
        .post(`/api/certificates/${certAId}/link`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Profile-Id', 'ProfileA')
        .send({ diamondItemId: diamond2Id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify invariants in database
      await runWithProfile('ProfileA', async () => {
        // Diamond 1 should have null currentCertificateId, certificateStatus: 'NONE'
        const d1After = await prisma.diamondItem.findUnique({ where: { id: diamond1Id } });
        expect(d1After?.currentCertificateId).toBeNull();
        expect(d1After?.certificateStatus).toBe('NONE');

        // Diamond 2 should have currentCertificateId: certAId
        const d2After = await prisma.diamondItem.findUnique({ where: { id: diamond2Id } });
        expect(d2After?.currentCertificateId).toBe(certAId);
        expect(d2After?.certificateStatus).toBe('RECEIVED');

        // Certificate A should point to Diamond 2
        const cAAfter = await prisma.certification.findUnique({ where: { id: certAId } });
        expect(cAAfter?.diamondItemId).toBe(diamond2Id);
        expect(cAAfter?.certificateStatus).toBe('ISSUED');

        // Certificate B should have null diamondItemId, status: 'PENDING'
        const cBAfter = await prisma.certification.findUnique({ where: { id: certBId } });
        expect(cBAfter?.diamondItemId).toBeNull();
        expect(cBAfter?.certificateStatus).toBe('PENDING');
      });
    });

    it('certificate deletion removes physical PDF file from disk', async () => {
      let certId = '';
      const uploadsDir = path.resolve(__dirname, '../../uploads/certs');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const testPdfFilename = `test-delete-${Date.now()}.pdf`;
      const testPdfPath = path.resolve(uploadsDir, testPdfFilename);
      fs.writeFileSync(testPdfPath, '%PDF-1.4 test certificate content');
      expect(fs.existsSync(testPdfPath)).toBe(true);

      await runWithProfile('ProfileA', async () => {
        const cert = await prisma.certification.create({
          data: {
            reportNumber: `IGI-DEL-${Date.now()}`,
            labType: 'IGI',
            pdfPath: testPdfFilename,
            certificateStatus: 'PENDING',
          },
        });
        certId = cert.id;
      });

      const res = await request(app)
        .delete(`/api/certificates/${certId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Profile-Id', 'ProfileA');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify physical PDF file is deleted from disk
      expect(fs.existsSync(testPdfPath)).toBe(false);

      // Verify DB record is deleted
      await runWithProfile('ProfileA', async () => {
        const deletedCert = await prisma.certification.findUnique({ where: { id: certId } });
        expect(deletedCert).toBeNull();
      });
    });
  });
});
