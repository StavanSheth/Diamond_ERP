import { Request, Response, NextFunction } from 'express';

/**
 * Generate a short request ID (REQ-XXXX format) and attach it to the request.
 * Also sets the X-Request-ID response header for end-to-end tracing.
 */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const id = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;

  // Attach to request object for downstream use
  (req as RequestWithId).requestId = id;

  next();
}

/**
 * Extended Request type that includes requestId.
 */
export interface RequestWithId extends Request {
  requestId: string;
}
