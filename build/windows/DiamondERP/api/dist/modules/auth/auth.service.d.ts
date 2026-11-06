import { AuthenticationError, AuthorizationError, ConflictError, ValidationError } from '../../errors';
export declare const AUTH_CONFIG: {
    ACCESS_TOKEN_TTL: string;
    SESSION_TTL_MS: number;
    BCRYPT_ROUNDS: number;
    MIN_PASSWORD_LENGTH: number;
    MAX_FAILED_LOGIN_ATTEMPTS: number;
    LOCKOUT_DURATION_MS: number;
};
/**
 * Validates that required auth configuration is present.
 * Must fail fast in production.
 */
export declare function validateAuthConfig(): void;
export interface AuthTokenPayload {
    userId: string;
    username: string;
    role: string;
    tokenVersion: number;
    sessionId?: string;
}
export interface LoginResult {
    token: string;
    user: {
        id: string;
        username: string;
        displayName: string;
        role: string;
        profiles: string[];
        activeProfile: string;
    };
}
export interface AuthenticatedUser {
    id: string;
    username: string;
    displayName: string;
    role: string;
    sessionId?: string;
    profiles: string[];
}
export declare const ROLES: {
    readonly SUPER_ADMIN: "SUPER_ADMIN";
    readonly ADMIN: "ADMIN";
    readonly MANAGER: "MANAGER";
    readonly ACCOUNTANT: "ACCOUNTANT";
    readonly INVENTORY_MANAGER: "INVENTORY_MANAGER";
    readonly SALES: "SALES";
    readonly VIEWER: "VIEWER";
};
export type Role = typeof ROLES[keyof typeof ROLES];
export declare class AuthService {
    /**
     * Hash a plaintext password with bcrypt.
     */
    hashPassword(password: string): Promise<string>;
    /**
     * Verify a plaintext password against a bcrypt hash.
     */
    verifyPassword(password: string, hash: string): Promise<boolean>;
    /**
     * Generate a JWT access token.
     */
    generateToken(payload: AuthTokenPayload): string;
    /**
     * Verify and decode a JWT token.
     * Returns null if invalid or expired.
     */
    verifyToken(token: string): AuthTokenPayload | null;
    /**
     * Records a failed login attempt for account-based brute force protection.
     */
    private recordFailedAttempt;
    /**
     * Authenticate a user with username and password.
     * Creates a tracked database session and returns accessible profiles.
     */
    login(username: string, password: string, meta?: {
        ip?: string;
        userAgent?: string;
        deviceId?: string;
    }): Promise<LoginResult>;
    /**
     * Create a new user account with optional profile memberships.
     */
    createUser(username: string, password: string, displayName: string, role?: string, profileCodes?: string[]): Promise<{
        id: string;
        username: string;
        displayName: string;
        role: string;
        profiles: string[];
    }>;
    /**
     * Change a user's password and invalidate existing sessions.
     */
    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
    /**
     * Invalidate all sessions globally for a user.
     */
    invalidateSessions(userId: string): Promise<void>;
    /**
     * Revoke a specific single session (device logout).
     */
    revokeSession(sessionId: string): Promise<void>;
    /**
     * Safe user deactivation (Phase 2 foundation).
     * Soft-deletes user record and revokes sessions without touching SQLite database files.
     * Guarantees: DELETE USER != DELETE DATABASE.
     */
    deactivateUser(userId: string): Promise<{
        id: string;
        username: string;
        isActive: boolean;
        deletedAt: Date | null;
    }>;
    /**
     * Reactivate a previously deactivated user.
     */
    reactivateUser(userId: string): Promise<{
        id: string;
        username: string;
        isActive: boolean;
    }>;
    /**
     * Seed a default admin user and default profile if database contains no users.
     */
    seedDefaultAdmin(): Promise<void>;
}
export { AuthenticationError, AuthorizationError, ConflictError, ValidationError };
export declare const authService: AuthService;
//# sourceMappingURL=auth.service.d.ts.map