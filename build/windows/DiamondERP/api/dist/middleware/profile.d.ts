import { Request, Response, NextFunction } from 'express';
export interface ProfileMiddlewareOptions {
    /**
     * When true (default), tenant-scoped endpoints REQUIRE an explicit
     * X-Profile-Id header. Missing header → 400 PROFILE_CONTEXT_REQUIRED.
     *
     * When false, the middleware will fall back to the user's first
     * assigned profile if no header is provided. This mode should ONLY
     * be used for endpoints that genuinely do not require profile context
     * (e.g., user settings, profile listing).
     */
    required: boolean;
}
/**
 * Server-side Profile Authorization Middleware Factory.
 *
 * Enforces:
 * Authenticated User
 *         ↓
 * User/Profile Membership
 *         ↓
 * Requested Profile (explicit via header)
 *         ↓
 * Server-side authorization
 *         ↓
 * Canonical Profile Context
 *         ↓
 * Scoped Prisma/database client
 *
 * Never allows client-controlled arbitrary SQLite file access.
 * Never silently selects a default profile for tenant-scoped operations.
 */
export declare function createProfileMiddleware(options?: ProfileMiddlewareOptions): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Default profile middleware — REQUIRES explicit X-Profile-Id header.
 * Use this for all tenant-scoped business endpoints.
 *
 * This is the safe default: missing profile context → 400 error,
 * preventing accidental cross-tenant data mutations.
 */
export declare const profileMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Optional profile middleware — allows fallback to user's first profile.
 * Use ONLY for endpoints where profile context is genuinely optional
 * (e.g., profile listing, user settings, switching profiles).
 */
export declare const optionalProfileMiddleware: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=profile.d.ts.map