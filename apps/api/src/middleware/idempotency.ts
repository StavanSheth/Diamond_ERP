import { Request, Response, NextFunction } from 'express';
import prisma from '../infrastructure/database/prisma';
import { logger } from '../infrastructure/logging';

/**
 * Idempotency middleware for financially sensitive mutations.
 * Reads the 'Idempotency-Key' or 'X-Idempotency-Key' header.
 * If the key has already been executed successfully within the retention window,
 * replays the saved response without re-executing business logic.
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Only apply to mutating methods (POST, PUT, PATCH)
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

  try {
    // Check if key already exists
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (existing) {
      if (existing.expiresAt > new Date()) {
        logger.info(`[Idempotency] Replaying cached response for key: ${key}`);
        res.setHeader('X-Idempotency-Replayed', 'true');
        res.status(existing.statusCode).json(JSON.parse(existing.responseBody));
        return;
      }
      // If expired, remove old record and proceed
      await prisma.idempotencyKey.delete({ where: { key } }).catch(() => null);
    }

    // Capture the original json method to intercept successful responses
    const originalJson = res.json.bind(res);
    res.json = function (body: any): Response {
      // Only cache successful 2xx responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const responseJson = JSON.stringify(body);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        prisma.idempotencyKey.create({
          data: {
            key,
            resource: req.path,
            statusCode: res.statusCode,
            responseBody: responseJson,
            expiresAt,
          },
        }).catch((err) => {
          logger.warn(`[Idempotency] Failed to store idempotency key ${key}: ${err.message}`);
        });
      }
      return originalJson(body);
    };

    next();
  } catch (error) {
    logger.error(`[Idempotency] Error processing idempotency key: ${error}`);
    next();
  }
}
