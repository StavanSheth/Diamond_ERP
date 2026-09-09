import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma, { getActiveProfile } from '../infrastructure/database/prisma';
import { logger } from '../infrastructure/logging';
import { AuthenticatedRequest } from './auth';

/**
 * Generates a deterministic SHA-256 hash of the request body.
 */
function computeRequestHash(body: unknown): string {
  try {
    const serialized = JSON.stringify(body || {});
    return crypto.createHash('sha256').update(serialized).digest('hex');
  } catch {
    return 'unhashable';
  }
}

/**
 * Production-grade atomic idempotency middleware for mutating endpoints.
 * Enforces atomic reservation via a PENDING -> SUCCESS/FAILED state machine.
 *
 * Prevents race conditions:
 * - Request A and Request B arrive simultaneously with the same key.
 * - Only ONE can successfully insert the PENDING record due to @@unique([profileId, key]).
 * - The winning request proceeds to execute the business mutation.
 * - The losing request immediately receives 409 Conflict.
 * - Subsequent requests after completion replay the cached response.
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only apply to mutating HTTP methods
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const rawKey = req.header('idempotency-key') || req.header('x-idempotency-key');
  if (!rawKey) {
    return next();
  }

  const key = rawKey.trim();
  if (key.length < 4 || key.length > 128) {
    res.status(400).json({
      success: false,
      error: 'Invalid Idempotency-Key format. Must be between 4 and 128 characters.',
    });
    return;
  }

  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id || 'anonymous';
  const profileId = getActiveProfile();
  const requestHash = computeRequestHash(req.body);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour retention

  try {
    // 1. Attempt ATOMIC reservation by inserting a PENDING record.
    let reservationSuccess = false;
    try {
      await prisma.idempotencyKey.create({
        data: {
          key,
          userId,
          profileId,
          method: req.method,
          path: req.path,
          requestHash,
          status: 'PENDING',
          expiresAt,
        },
      });
      reservationSuccess = true;
    } catch (createErr: any) {
      // If unique constraint violation (P2002 or SQLite constraint), another request already claimed this key
      if (createErr.code !== 'P2002' && !createErr.message?.includes('Unique constraint')) {
        logger.error(`[Idempotency] Reservation insert error: ${createErr.message}`);
        return next();
      }
    }

    // 2. If reservation failed, inspect the existing record
    if (!reservationSuccess) {
      const existing = await prisma.idempotencyKey.findUnique({
        where: {
          profileId_key: {
            profileId,
            key,
          },
        },
      });

      if (existing) {
        // If expired, remove and allow retry
        if (existing.expiresAt <= new Date()) {
          await prisma.idempotencyKey.delete({
            where: {
              profileId_key: { profileId, key },
            },
          }).catch(() => null);
          return next();
        }

        // If PENDING: A concurrent request is currently in progress
        if (existing.status === 'PENDING') {
          logger.warn(`[Idempotency] Concurrent lock conflict for key "${key}" on ${req.method} ${req.path}`);
          res.status(409).json({
            success: false,
            error: 'A request with this idempotency key is currently being processed. Please retry shortly.',
            code: 'IDEMPOTENCY_KEY_LOCKED',
          });
          return;
        }

        // If SUCCESS: Verify request context matches before replaying
        if (existing.status === 'SUCCESS' && existing.statusCode && existing.responseBody) {
          if (existing.method !== req.method || existing.path !== req.path) {
            res.status(422).json({
              success: false,
              error: 'Idempotency key reuse across different HTTP methods or endpoints is prohibited.',
              code: 'IDEMPOTENCY_KEY_MISMATCH',
            });
            return;
          }

          logger.info(`[Idempotency] Replaying cached response for key "${key}" (${existing.statusCode})`);
          res.setHeader('X-Idempotency-Replayed', 'true');
          res.status(existing.statusCode).json(JSON.parse(existing.responseBody));
          return;
        }

        // If FAILED: allow retry by updating status back to PENDING
        if (existing.status === 'FAILED') {
          await prisma.idempotencyKey.update({
            where: {
              profileId_key: { profileId, key },
            },
            data: {
              status: 'PENDING',
              requestHash,
              expiresAt,
            },
          }).catch(() => null);
        }
      }
    }

    // 3. We hold the PENDING reservation. Intercept res.json to finalize the record.
    const originalJson = res.json.bind(res);
    res.json = function (body: any): Response {
      const statusCode = res.statusCode;
      if (statusCode >= 200 && statusCode < 300) {
        // Mutation succeeded -> update to SUCCESS and cache response
        prisma.idempotencyKey.update({
          where: {
            profileId_key: { profileId, key },
          },
          data: {
            status: 'SUCCESS',
            statusCode,
            responseBody: JSON.stringify(body),
          },
        }).catch((err) => {
          logger.warn(`[Idempotency] Failed to finalize SUCCESS for key "${key}": ${err.message}`);
        });
      } else {
        // Mutation failed -> update to FAILED so key can be retried safely
        prisma.idempotencyKey.update({
          where: {
            profileId_key: { profileId, key },
          },
          data: {
            status: 'FAILED',
            statusCode,
            responseBody: JSON.stringify(body),
          },
        }).catch(() => null);
      }

      return originalJson(body);
    };

    next();
  } catch (error) {
    logger.error(`[Idempotency] Unexpected error processing key "${key}": ${error}`);
    next();
  }
}
