import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { systemPrisma, defaultProfile, getAllProfiles } from '../../infrastructure/database/prisma';
import { logger } from '../../infrastructure/logging';
import { AuthenticationError, AuthorizationError, ConflictError, ValidationError } from '../../errors';

// ── Configuration ───────────────────────────────────────────────────────
export const AUTH_CONFIG = {
  ACCESS_TOKEN_TTL: process.env.JWT_EXPIRES_IN || '24h',
  SESSION_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  BCRYPT_ROUNDS: 12,
  MIN_PASSWORD_LENGTH: 12,
  MAX_FAILED_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
};

/**
 * Resolves the JWT signing secret according to strict environment rules.
 * Finding 6.1: Production MUST provide JWT_SECRET (>= 32 chars).
 * Non-production environments use explicit fallback secrets.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
      throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production.');
    }
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: JWT_SECRET environment variable is missing. ' +
      'Production server cannot start without a secure JWT signing secret.'
    );
  }
  if (process.env.NODE_ENV === 'test') {
    return process.env.TEST_JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long-diamond-erp';
  }
  return process.env.DEVELOPMENT_JWT_SECRET || 'dev-jwt-secret-at-least-32-chars-long-diamond-erp';
}

/**
 * Validates that required auth configuration is present.
 * Must fail fast in production.
 */
export function validateAuthConfig(): void {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error(
        'FATAL: JWT_SECRET environment variable is missing or less than 32 characters. ' +
        'Production server cannot start without a secure JWT signing secret.'
      );
    }
  } else if (!secret) {
    logger.warn('JWT_SECRET not explicitly set in environment. Using non-production fallback secret.');
  }
}

// ── In-Memory Account Brute-Force Tracker (Finding 10) ───────────────────
interface AccountAttemptRecord {
  failures: number;
  lockoutUntil?: Date;
}
const accountAttempts = new Map<string, AccountAttemptRecord>();

// ── Types ───────────────────────────────────────────────────────────────
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

// ── Roles ───────────────────────────────────────────────────────────────
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  SALES: 'SALES',
  VIEWER: 'VIEWER',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// ── Helpers ─────────────────────────────────────────────────────────────
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Service ─────────────────────────────────────────────────────────────
export class AuthService {

  /**
   * Hash a plaintext password with bcrypt.
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, AUTH_CONFIG.BCRYPT_ROUNDS);
  }

  /**
   * Verify a plaintext password against a bcrypt hash.
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a JWT access token.
   */
  generateToken(payload: AuthTokenPayload): string {
    const secret = getJwtSecret();
    return jwt.sign(payload, secret, {
      expiresIn: AUTH_CONFIG.ACCESS_TOKEN_TTL,
    } as jwt.SignOptions);
  }

  /**
   * Verify and decode a JWT token.
   * Returns null if invalid or expired.
   */
  verifyToken(token: string): AuthTokenPayload | null {
    const secret = getJwtSecret();
    try {
      const decoded = jwt.verify(token, secret) as AuthTokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Records a failed login attempt for account-based brute force protection.
   */
  private recordFailedAttempt(username: string): void {
    const record = accountAttempts.get(username) || { failures: 0 };
    record.failures += 1;
    if (record.failures >= AUTH_CONFIG.MAX_FAILED_LOGIN_ATTEMPTS) {
      record.lockoutUntil = new Date(Date.now() + AUTH_CONFIG.LOCKOUT_DURATION_MS);
      logger.warn(`Account "${username}" temporarily locked out due to ${record.failures} consecutive failures.`);
    }
    accountAttempts.set(username, record);
  }

  /**
   * Authenticate a user with username and password.
   * Creates a tracked database session and returns accessible profiles.
   */
  async login(
    username: string, 
    password: string, 
    meta?: { ip?: string; userAgent?: string }
  ): Promise<LoginResult> {
    const normalizedUsername = username.toLowerCase().trim();

    // Account-level brute-force check (Finding 10)
    const attemptRecord = accountAttempts.get(normalizedUsername);
    if (attemptRecord?.lockoutUntil && attemptRecord.lockoutUntil > new Date()) {
      const remainingMinutes = Math.ceil((attemptRecord.lockoutUntil.getTime() - Date.now()) / 60000);
      logger.warn(`Login rejected: account "${normalizedUsername}" is locked for ${remainingMinutes} more minute(s).`);
      throw new AuthenticationError('Account is temporarily locked due to repeated failed login attempts. Please try again later.');
    }

    // Query from system/primary database
    const user = await systemPrisma.user.findUnique({
      where: { username: normalizedUsername },
      include: {
        userProfiles: {
          include: { profile: true },
        },
      },
    });

    if (!user || !user.isActive) {
      this.recordFailedAttempt(normalizedUsername);
      logger.warn(`Failed login attempt: user not found or inactive`);
      throw new AuthenticationError('Invalid username or password');
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      this.recordFailedAttempt(normalizedUsername);
      logger.warn(`Failed login attempt for account ID: ${user.id}`);
      throw new AuthenticationError('Invalid username or password');
    }

    // Login succeeded: reset brute force failure counter
    accountAttempts.delete(normalizedUsername);

    // Determine accessible profiles
    let accessibleProfiles: string[] = [];
    if (user.role === ROLES.SUPER_ADMIN) {
      accessibleProfiles = getAllProfiles();
    } else {
      accessibleProfiles = user.userProfiles
        .filter((up) => up.isActive && up.profile.isActive)
        .map((up) => up.profile.code);
    }

    // Generate unique session identifier
    const sessionId = crypto.randomUUID();
    const sessionSecret = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(sessionSecret);

    // Persist session in database ATOMICALLY - if session creation fails, login MUST fail
    const expiresAt = new Date(Date.now() + AUTH_CONFIG.SESSION_TTL_MS);
    try {
      await systemPrisma.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash,
          expiresAt,
          ipAddress: meta?.ip,
          userAgent: meta?.userAgent,
          lastUsedAt: new Date(),
        },
      });
    } catch (sessionErr: any) {
      logger.error(`Failed to record session in DB for user ${user.id}: ${sessionErr.message}`);
      throw new Error('Authentication system failed to persist session. Please try again.');
    }

    const token = this.generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionId,
    });

    // Update last login timestamp with explicit logging (Finding 8)
    try {
      await systemPrisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch (updateErr: any) {
      logger.warn(`Failed to record lastLoginAt for user ${user.id}: ${updateErr?.message || updateErr}`);
    }

    logger.info(`User logged in: ${user.username} (role: ${user.role}, profiles: [${accessibleProfiles.join(', ')}])`);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        profiles: accessibleProfiles,
        activeProfile: accessibleProfiles[0] || defaultProfile,
      },
    };
  }

  /**
   * Create a new user account with optional profile memberships.
   */
  async createUser(
    username: string,
    password: string,
    displayName: string,
    role: string,
    profileCodes?: string[],
  ): Promise<{ id: string; username: string; displayName: string; role: string; profiles: string[] }> {
    if (!Object.values(ROLES).includes(role as Role)) {
      throw new ValidationError(`Invalid role: ${role}. Valid roles: ${Object.values(ROLES).join(', ')}`);
    }

    if (password.length < AUTH_CONFIG.MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at least ${AUTH_CONFIG.MIN_PASSWORD_LENGTH} characters long`);
    }

    const normalizedUsername = username.toLowerCase().trim();
    const existing = await systemPrisma.user.findUnique({
      where: { username: normalizedUsername },
    });
    if (existing) {
      throw new ConflictError(`User with username "${username}" already exists`);
    }

    const passwordHash = await this.hashPassword(password);

    // Atomic creation of user and profile memberships
    const user = await systemPrisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: normalizedUsername,
          displayName,
          passwordHash,
          role,
          isActive: true,
        },
      });

      // Ensure default profiles exist in Profile table
      const targetProfiles = profileCodes && profileCodes.length > 0 ? profileCodes : [defaultProfile];
      for (const pCode of targetProfiles) {
        let prof = await tx.profile.findUnique({ where: { code: pCode } });
        if (!prof) {
          prof = await tx.profile.create({
            data: {
              code: pCode,
              name: pCode,
              isActive: true,
            },
          });
        }

        await tx.userProfile.create({
          data: {
            userId: newUser.id,
            profileId: prof.id,
            role,
            isActive: true,
          },
        });
      }

      return newUser;
    });

    logger.info(`User created: ${user.username} (role: ${user.role})`);

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      profiles: profileCodes || [defaultProfile],
    };
  }

  /**
   * Change a user's password and invalidate existing sessions.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await systemPrisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    const isValid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters long');
    }

    const passwordHash = await this.hashPassword(newPassword);

    await systemPrisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
        },
      });

      // Revoke all active sessions
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    logger.info(`Password changed and all sessions revoked for user: ${user.username}`);
  }

  /**
   * Invalidate all sessions globally for a user.
   */
  async invalidateSessions(userId: string): Promise<void> {
    await systemPrisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });

      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    logger.info(`All sessions invalidated for user ID: ${userId}`);
  }

  /**
   * Revoke a specific single session (device logout).
   */
  async revokeSession(sessionId: string): Promise<void> {
    await systemPrisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.info(`Session revoked: ${sessionId}`);
  }

  /**
   * Seed a default admin user and default profile if database contains no users.
   */
  async seedDefaultAdmin(): Promise<void> {
    const userCount = await systemPrisma.user.count();
    if (userCount > 0) return;

    const isProd = process.env.NODE_ENV === 'production';
    const envPassword = process.env.DEFAULT_ADMIN_PASSWORD;

    if (isProd && !envPassword) {
      logger.warn('[Auth] Database is uninitialized. Provision initial administrator using /api/auth/bootstrap with BOOTSTRAP_SECRET.');
      return;
    }

    const defaultPassword = envPassword || (process.env.NODE_ENV === 'test' ? 'Admin@123456' : crypto.randomBytes(12).toString('base64url'));

    // Ensure default profile exists
    let stavanProfile = await systemPrisma.profile.findUnique({ where: { code: defaultProfile } });
    if (!stavanProfile) {
      stavanProfile = await systemPrisma.profile.create({
        data: {
          code: defaultProfile,
          name: defaultProfile,
          isActive: true,
        },
      });
    }

    await this.createUser('admin', defaultPassword, 'System Administrator', ROLES.SUPER_ADMIN, [defaultProfile]);
    if (envPassword) {
      logger.info(`Default admin user seeded from DEFAULT_ADMIN_PASSWORD. Change password immediately.`);
    } else if (process.env.NODE_ENV !== 'test') {
      logger.warn(`Default admin seeded with generated password: ${defaultPassword}. Please change immediately.`);
    }
  }
}

// Re-export error classes
export { AuthenticationError, AuthorizationError, ConflictError, ValidationError };

export const authService = new AuthService();
