import { Request, Response, NextFunction } from 'express';
import { AuthenticatedUser } from '../modules/auth/auth.service';
/**
 * Extends Express Request with authenticated user information.
 */
export interface AuthenticatedRequest extends Request {
    user: AuthenticatedUser;
}
/**
 * Authentication middleware.
 * Validates JWT, user active status, token version, and active session.
 * For local desktop ERP mode without auth headers, automatically authenticates as Super Admin.
 */
export declare function authenticate(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Optional authentication middleware.
 */
export declare function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.d.ts.map