import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { RequestWithId } from './request-id';
import { ROLES, Role } from '../modules/auth/auth.service';

// ── Permission Definitions ──────────────────────────────────────────────
/**
 * Maps each role to its allowed permissions.
 * Permissions use the format: resource.action
 */
const ROLE_PERMISSIONS: Record<Role, Set<string>> = {
  [ROLES.SUPER_ADMIN]: new Set([
    // All permissions
    'stock.read', 'stock.create', 'stock.update', 'stock.archive',
    'diamond.read', 'diamond.create', 'diamond.update', 'diamond.delete',
    'transaction.read', 'transaction.create', 'transaction.update', 'transaction.post', 'transaction.reverse', 'transaction.authorize',
    'ledger.read', 'ledger.create', 'ledger.update',
    'certificate.read', 'certificate.create', 'certificate.update', 'certificate.upload', 'certificate.delete',
    'repair.read', 'repair.create', 'repair.update',
    'party.read', 'party.create', 'party.update', 'party.archive', 'party.delete',
    'report.read', 'report.export',
    'settings.read', 'settings.update',
    'database.reset', 'database.import', 'database.export',
    'system.activate',
    'user.create', 'user.update', 'user.delete',
    'profile.read', 'profile.switch',
    'audit.read',
    'dashboard.read',
  ]),

  [ROLES.ADMIN]: new Set([
    'stock.read', 'stock.create', 'stock.update', 'stock.archive',
    'diamond.read', 'diamond.create', 'diamond.update', 'diamond.delete',
    'transaction.read', 'transaction.create', 'transaction.update', 'transaction.post', 'transaction.reverse', 'transaction.authorize',
    'ledger.read', 'ledger.create', 'ledger.update',
    'certificate.read', 'certificate.create', 'certificate.update', 'certificate.upload', 'certificate.delete',
    'repair.read', 'repair.create', 'repair.update',
    'party.read', 'party.create', 'party.update', 'party.archive',
    'report.read', 'report.export',
    'settings.read', 'settings.update',
    'database.import', 'database.export',
    'user.create', 'user.update',
    'profile.read', 'profile.switch',
    'audit.read',
    'dashboard.read',
  ]),

  [ROLES.MANAGER]: new Set([
    'stock.read', 'stock.create', 'stock.update',
    'diamond.read', 'diamond.create', 'diamond.update',
    'transaction.read', 'transaction.create', 'transaction.update', 'transaction.post', 'transaction.authorize',
    'ledger.read', 'ledger.create', 'ledger.update',
    'certificate.read', 'certificate.create', 'certificate.update', 'certificate.upload',
    'repair.read', 'repair.create', 'repair.update',
    'party.read', 'party.create', 'party.update',
    'report.read', 'report.export',
    'settings.read',
    'database.export',
    'profile.read',
    'dashboard.read',
  ]),

  [ROLES.ACCOUNTANT]: new Set([
    'stock.read',
    'diamond.read',
    'transaction.read', 'transaction.create', 'transaction.update',
    'ledger.read', 'ledger.create', 'ledger.update',
    'certificate.read',
    'repair.read',
    'party.read', 'party.create', 'party.update',
    'report.read', 'report.export',
    'dashboard.read',
  ]),

  [ROLES.INVENTORY_MANAGER]: new Set([
    'stock.read', 'stock.create', 'stock.update',
    'diamond.read', 'diamond.create', 'diamond.update',
    'transaction.read', 'transaction.create',
    'ledger.read',
    'certificate.read', 'certificate.create', 'certificate.update', 'certificate.upload',
    'repair.read', 'repair.create', 'repair.update',
    'party.read',
    'report.read',
    'dashboard.read',
  ]),

  [ROLES.SALES]: new Set([
    'stock.read',
    'diamond.read',
    'transaction.read', 'transaction.create',
    'ledger.read',
    'certificate.read',
    'repair.read',
    'party.read', 'party.create',
    'report.read',
    'dashboard.read',
  ]),

  [ROLES.VIEWER]: new Set([
    'stock.read',
    'diamond.read',
    'transaction.read',
    'ledger.read',
    'certificate.read',
    'repair.read',
    'party.read',
    'report.read',
    'dashboard.read',
  ]),
};

/**
 * Authorization middleware factory.
 * 
 * Creates a middleware that checks if the authenticated user has the required permission.
 * Must be used AFTER the authenticate middleware.
 * 
 * @param permission - The required permission string (e.g., 'stock.create')
 * @returns Express middleware function
 * 
 * @example
 * router.post('/stocks', authenticate, authorize('stock.create'), controller.createStock);
 */
export function authorize(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req as RequestWithId).requestId || 'unknown';
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required.',
        requestId,
      });
      return;
    }

    const role = user.role as Role;
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions || !permissions.has(permission)) {
      res.status(403).json({
        success: false,
        error: `Forbidden. You do not have permission to perform this action (requires: ${permission}).`,
        requestId,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware that restricts access to specific roles.
 * 
 * @param allowedRoles - Array of roles that are allowed
 * @returns Express middleware function
 * 
 * @example
 * router.post('/factory-reset', authenticate, requireRole('SUPER_ADMIN'), controller.factoryReset);
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req as RequestWithId).requestId || 'unknown';
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required.',
        requestId,
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden. This action requires one of: ${allowedRoles.join(', ')}.`,
        requestId,
      });
      return;
    }

    next();
  };
}

/**
 * Check if a user has a specific permission.
 * Utility function for use in services/controllers.
 */
export function hasPermission(role: string, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role as Role];
  return permissions ? permissions.has(permission) : false;
}
