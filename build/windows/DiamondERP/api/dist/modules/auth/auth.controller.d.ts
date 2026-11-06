import { Request, Response, NextFunction } from 'express';
import { AuthenticatedUser } from './auth.service';
export interface AuthenticatedRequest extends Request {
    user: AuthenticatedUser;
}
export declare class AuthController {
    /**
     * POST /api/auth/login
     * Authenticate user, create session, and return JWT token.
     */
    login: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/auth/me
     * Return current authenticated user info.
     */
    me: (req: Request, res: Response, _next: NextFunction) => Promise<void>;
    /**
     * POST /api/auth/users
     * Create a new user (admin only).
     */
    createUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/auth/change-password
     * Change the current user's password.
     */
    changePassword: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/auth/logout
     * Invalidate the current session or all sessions.
     */
    logout: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/auth/bootstrap
     * Secure initialization: requires BOOTSTRAP_SECRET header, verifies system uninitialized,
     * atomically creates the first administrator, and permanently disables the endpoint.
     */
    bootstrap: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/auth/users/:userId/deactivate or DELETE /api/auth/users/:userId
     * Safe user soft-deactivation (Admin only).
     */
    deactivateUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/auth/users/:userId/reactivate
     * Reactivate previously deactivated user (Admin only).
     */
    reactivateUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const authController: AuthController;
//# sourceMappingURL=auth.controller.d.ts.map