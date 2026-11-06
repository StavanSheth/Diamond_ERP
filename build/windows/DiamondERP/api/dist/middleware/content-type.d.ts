import { Request, Response, NextFunction } from 'express';
/**
 * Strict Content-Type enforcement middleware (Finding 62).
 * Ensures that mutating HTTP requests (POST, PUT, PATCH) with a request body
 * declare an accepted Content-Type (application/json or multipart/form-data).
 * Rejects unexpected media types with 415 Unsupported Media Type.
 */
export declare function enforceContentType(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=content-type.d.ts.map