import { Request, Response, NextFunction } from 'express';
/**
 * Generate a short request ID (REQ-XXXX format) and attach it to the request.
 * Also sets the X-Request-ID response header for end-to-end tracing.
 */
export declare function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void;
/**
 * Extended Request type that includes requestId.
 */
export interface RequestWithId extends Request {
    requestId: string;
}
//# sourceMappingURL=request-id.d.ts.map