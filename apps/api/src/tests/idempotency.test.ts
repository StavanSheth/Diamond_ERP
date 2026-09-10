import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { idempotencyMiddleware, requireIdempotency } from '../middleware/idempotency';
import prisma, { registerProfile, disconnectAllClients, defaultProfile } from '../infrastructure/database/prisma';

describe('Phase 3: Idempotency Hardening & Guarantees', () => {
  const app = express();
  app.use(express.json());

  // Setup test routes
  app.get('/test-read', (_req: Request, res: Response) => {
    res.json({ success: true, message: 'read ok' });
  });

  app.post(
    '/test-financial-mutation',
    requireIdempotency({ message: 'Financial operations require Idempotency-Key' }),
    idempotencyMiddleware,
    (req: Request, res: Response) => {
      res.status(201).json({ success: true, received: req.body });
    }
  );

  app.post(
    '/test-large-mutation',
    idempotencyMiddleware,
    (_req: Request, res: Response) => {
      // Return a payload larger than 64KB to trigger compaction
      const largeData = 'X'.repeat(70 * 1024);
      res.status(200).json({ success: true, data: { id: 'large-123', payload: largeData } });
    }
  );

  beforeAll(async () => {
    registerProfile({ code: 'IdemTest', name: 'Idempotency Test Profile' });
  });

  afterAll(async () => {
    await disconnectAllClients();
  });

  describe('3.1 requireIdempotency middleware', () => {
    it('rejects POST request without Idempotency-Key with 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
      const res = await request(app)
        .post('/test-financial-mutation')
        .send({ amount: 1000 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(res.body.error).toContain('Financial operations require Idempotency-Key');
    });

    it('allows GET requests through without Idempotency-Key', async () => {
      const res = await request(app).get('/test-read');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('allows mutating request with valid Idempotency-Key', async () => {
      const key = `idem-valid-${Date.now()}`;
      const res = await request(app)
        .post('/test-financial-mutation')
        .set('Idempotency-Key', key)
        .send({ amount: 500 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('3.4 Compact response storage', () => {
    it('compacts stored response body when response exceeds 64KB', async () => {
      const key = `idem-large-${Date.now()}`;
      const res = await request(app)
        .post('/test-large-mutation')
        .set('Idempotency-Key', key)
        .send({ trigger: 'large' });

      expect(res.status).toBe(200);

      // Inspect the idempotencyKey record directly in the DB
      const record = await prisma.idempotencyKey.findFirst({
        where: { key },
      });

      expect(record).toBeDefined();
      expect(record?.status).toBe('SUCCESS');
      expect(record?.responseBody).toBeDefined();
      
      const parsedStored = JSON.parse(record!.responseBody!);
      expect(parsedStored.compacted).toBe(true);
      expect(parsedStored.data.id).toBe('large-123');
      expect(record!.responseBody!.length).toBeLessThan(1024); // Well under 64KB
    });
  });

  describe('3.2 & 3.3 Atomic CAS on FAILED and Expired records', () => {
    it('allows retrying a FAILED idempotency key with new request', async () => {
      const key = `idem-retry-${Date.now()}`;
      const retryPayload = { retry: true };
      const hash = crypto.createHash('sha256').update(JSON.stringify(retryPayload)).digest('hex');

      // Insert a FAILED record manually into DB with matching payload hash
      await prisma.idempotencyKey.create({
        data: {
          key,
          userId: 'anonymous',
          profileId: defaultProfile,
          method: 'POST',
          path: '/test-financial-mutation',
          requestHash: hash,
          status: 'FAILED',
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });

      // Now retry with same key through the middleware
      const res = await request(app)
        .post('/test-financial-mutation')
        .set('Idempotency-Key', key)
        .send(retryPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const record = await prisma.idempotencyKey.findFirst({
        where: { key },
      });
      expect(record?.status).toBe('SUCCESS');
    });

    it('reclaims an expired idempotency key and executes successfully', async () => {
      const key = `idem-expired-${Date.now()}`;

      // Insert an expired record
      await prisma.idempotencyKey.create({
        data: {
          key,
          userId: 'anonymous',
          profileId: defaultProfile,
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
      const res = await request(app)
        .post('/test-financial-mutation')
        .set('Idempotency-Key', key)
        .send({ reclaimed: true });

      expect(res.status).toBe(201);
      expect(res.body.received).toEqual({ reclaimed: true });

      const record = await prisma.idempotencyKey.findFirst({
        where: { key },
      });
      expect(record?.status).toBe('SUCCESS');
    });
  });
});
