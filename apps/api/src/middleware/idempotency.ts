import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma, { getActiveProfileOrDefault } from '../infrastructure/database/prisma';
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
  const profileId = getActiveProfileOrDefault();
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
          userId_profileId_key: {
            userId,
            profileId,
            key,
          },
        },
      });

      if (existing) {
        // Finding 16: Atomic handling of expired idempotency keys
        if (existing.expiresAt <= new Date()) {
          const casExpired = await prisma.idempotencyKey.updateMany({
            where: {
              userId,
              profileId,
              key,
              expiresAt: { lte: new Date() },
            },
            data: {
              status: 'PENDING',
              requestHash,
              expiresAt,
              method: req.method,
              path: req.path,
              statusCode: null,
              responseBody: null,
            },
          });

          if (casExpired.count === 0) {
            // Another concurrent request claimed this expired key
            res.status(409).json({
              success: false,
              error: 'A request with this idempotency key is currently being processed. Please retry shortly.',
              code: 'IDEMPOTENCY_KEY_LOCKED',
            });
            return;
          }

          reservationSuccess = true;
        }

        if (!reservationSuccess) {
          // Verify request method and path match original request
          if (existing.method !== req.method || existing.path !== req.path) {
            res.status(422).json({
              success: false,
              error: 'Idempotency key reuse across different HTTP methods or endpoints is prohibited.',
              code: 'IDEMPOTENCY_KEY_MISMATCH',
            });
            return;
          }

        // Verify request payload hash matches original request
        if (existing.requestHash && existing.requestHash !== requestHash) {
          res.status(422).json({
            success: false,
            error: 'Idempotency key payload does not match original request payload.',
            code: 'IDEMPOTENCY_BODY_MISMATCH',
          });
          return;
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
          logger.info(`[Idempotency] Replaying cached response for key "${key}" (${existing.statusCode})`);
          res.setHeader('X-Idempotency-Replayed', 'true');
          res.status(existing.statusCode).json(JSON.parse(existing.responseBody));
          return;
        }

        // Finding 15: Atomic CAS for FAILED -> PENDING to prevent concurrent double-execution
        if (existing.status === 'FAILED') {
          const casFailed = await prisma.idempotencyKey.updateMany({
            where: {
              userId,
              profileId,
              key,
              status: 'FAILED',
            },
            data: {
              status: 'PENDING',
              requestHash,
              expiresAt,
            },
          });

          if (casFailed.count === 0) {
            // Another concurrent request already claimed the retry
            res.status(409).json({
              success: false,
              error: 'A retry for this idempotency key is currently being processed. Please retry shortly.',
              code: 'IDEMPOTENCY_KEY_LOCKED',
            });
            return;
          }
        }
      }
    }
  }

    // 3. We hold the PENDING reservation. Intercept res.json to atomically finalize the record.
    const originalJson = res.json.bind(res);
    res.json = function (body: any): Response {
      const statusCode = res.statusCode;
      const isSuccess = statusCode >= 200 && statusCode < 300;

      // Response compaction (Finding 18): Avoid storing unbounded JSON in SQLite
      let responseBodyString: string;
      try {
        const serialized = JSON.stringify(body);
        if (serialized.length > 64 * 1024) {
          responseBodyString = JSON.stringify({
            success: body?.success ?? true,
            compacted: true,
            message: body?.message || 'Response compacted for idempotency cache (>64KB)',
            data: body?.data?.id ? { id: body.data.id } : undefined,
          });
        } else {
          responseBodyString = serialized;
        }
      } catch {
        responseBodyString = JSON.stringify({ success: isSuccess });
      }

      // Atomically update DB record before flushing response to client
      (async () => {
        try {
          await prisma.idempotencyKey.update({
            where: {
              userId_profileId_key: { userId, profileId, key },
            },
            data: {
              status: isSuccess ? 'SUCCESS' : 'FAILED',
              statusCode,
              responseBody: responseBodyString,
            },
          });
        } catch (err: any) {
          logger.warn(`[Idempotency] Failed to finalize status for key "${key}": ${err.message}`);
        } finally {
          originalJson(body);
        }
      })();

      return res;
    };

    next();
  } catch (error) {
    logger.error(`[Idempotency] Unexpected error processing key "${key}": ${error}`);
    next();
  }
}

/**
 * Middleware factory requiring an explicit Idempotency-Key header on mutating HTTP requests.
 * Finding 14: Financial mutations must require idempotency keys to prevent duplicate posting.
 */
export function requireIdempotency(options?: { message?: string }): (req: Request, res: Response, next: NextFunction) => void {
  return function requireIdempotencyHandler(req: Request, res: Response, next: NextFunction): void {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const rawKey = req.header('idempotency-key') || req.header('x-idempotency-key');
      if (!rawKey || rawKey.trim() === '') {
        res.status(400).json({
          success: false,
          error: options?.message || 'Idempotency-Key header is required for this operation.',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        });
        return;
      }
    }
    next();
  };
}
