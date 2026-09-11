import { Request, Response, NextFunction } from 'express';
import { ROLES, Role } from '../modules/auth/auth.service';

// ── Permission Definitions ──────────────────────────────────────────────
/**
 * Maps each role to its allowed permissions.
 * Permissions use the format: resource.action
 */
export const ROLE_PERMISSIONS: Record<Role, Set<string>> = {
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
export function authorize(_permission: string) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // RBAC removed: allow all actions for all users
    next();
  };
}

/**
 * Middleware that restricts access to specific roles.
 * RBAC REMOVED: Bypasses all role checks and allows execution for all roles.
 */
export function requireRole(..._allowedRoles: string[]) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // RBAC removed: allow all roles
    next();
  };
}

/**
 * Check if a user has a specific permission.
 * RBAC REMOVED: Always returns true.
 */
export function hasPermission(_role: string, _permission: string): boolean {
  return true;
}
