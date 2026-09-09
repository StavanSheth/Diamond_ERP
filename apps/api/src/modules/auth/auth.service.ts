import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../infrastructure/database/prisma';
import { logger } from '../../infrastructure/logging';

// ── Configuration ───────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = 12;

/**
 * Validates that required auth configuration is present.
 * Must be called during application startup.
 */
export function validateAuthConfig(): void {
  if (!JWT_SECRET) {
    throw new Error(
      'FATAL: JWT_SECRET environment variable is not set. ' +
      'The application cannot start without a JWT signing secret. ' +
      'Set JWT_SECRET to a strong random string (minimum 32 characters).'
    );
  }
}

// ── Types ───────────────────────────────────────────────────────────────
export interface AuthTokenPayload {
  userId: string;
  username: string;
  role: string;
  tokenVersion: number;
}

export interface LoginResult {
  token: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
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

// ── Service ─────────────────────────────────────────────────────────────
export class AuthService {

  /**
   * Hash a plaintext password with bcrypt.
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
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
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  /**
   * Verify and decode a JWT token.
   * Returns null if invalid/expired.
   */
  verifyToken(token: string): AuthTokenPayload | null {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Authenticate a user with username and password.
   */
  async login(username: string, password: string): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
    });

    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid username or password');
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      logger.warn(`Failed login attempt for user: ${username}`);
      throw new AuthenticationError('Invalid username or password');
    }

    const token = this.generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => null); // Non-critical, don't fail login

    logger.info(`User logged in: ${user.username} (role: ${user.role})`);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  /**
   * Create a new user account.
   * Only callable by SUPER_ADMIN or ADMIN.
   */
  async createUser(
    username: string,
    password: string,
    displayName: string,
    role: string,
  ): Promise<{ id: string; username: string; displayName: string; role: string }> {
    if (!Object.values(ROLES).includes(role as Role)) {
      throw new Error(`Invalid role: ${role}. Valid roles: ${Object.values(ROLES).join(', ')}`);
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const existing = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
    });
    if (existing) {
      throw new Error(`User with username "${username}" already exists`);
    }

    const passwordHash = await this.hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase().trim(),
        displayName,
        passwordHash,
        role,
        isActive: true,
      },
    });

    logger.info(`User created: ${user.username} (role: ${user.role})`);

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  }

  /**
   * Change a user's password.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const passwordHash = await this.hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { 
        passwordHash,
        tokenVersion: { increment: 1 }
      },
    });

    logger.info(`Password changed for user: ${user.username}`);
  }

  /**
   * Invalidate all existing sessions for a user by incrementing their tokenVersion.
   */
  async invalidateSessions(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    logger.info(`Sessions invalidated for user ID: ${userId}`);
  }

  /**
   * Seed a default admin user if no users exist.
   * This is called during application startup.
   */
  async seedDefaultAdmin(): Promise<void> {
    const userCount = await prisma.user.count();
    if (userCount > 0) return;

    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    if (!defaultPassword) {
      logger.warn(
        'No users exist and DEFAULT_ADMIN_PASSWORD is not set. ' +
        'Set DEFAULT_ADMIN_PASSWORD environment variable to create the initial admin user.'
      );
      return;
    }

    await this.createUser('admin', defaultPassword, 'System Administrator', ROLES.SUPER_ADMIN);
    logger.info('Default admin user created. Change the password after first login.');
  }
}

// ── Error Classes ───────────────────────────────────────────────────────
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export const authService = new AuthService();
