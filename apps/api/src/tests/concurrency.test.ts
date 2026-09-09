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
      const stock = await prisma.stock.create({
        data: {
          stockCode: 'STK-PROFA-01',
          name: 'Profile A Main Vault',
          currency: 'USD',
        },
      });
      profileAStockId = stock.id;
    });

    await runWithProfile('ProfileB', async () => {
      await prisma.stock.create({
        data: {
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
  });
});
