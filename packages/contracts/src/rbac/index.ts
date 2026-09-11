/**
 * Role-Based Access Control (RBAC) definitions.
 * 
 * Single source of truth for all user roles and permissions across
 * Diamond ERP clients (Web, Mobile, Windows).
 */

// ── User Roles ──────────────────────────────────────────────────────────

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',
  INVENTORY_MANAGER = 'INVENTORY_MANAGER',
  SALES = 'SALES',
  VIEWER = 'VIEWER',
}

/** All available roles as a readonly array for iteration/validation. */
export const ALL_ROLES = Object.values(UserRole) as readonly UserRole[];

/** Human-readable labels for roles. */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Administrator',
  [UserRole.ADMIN]: 'Administrator',
  [UserRole.MANAGER]: 'Manager',
  [UserRole.ACCOUNTANT]: 'Accountant',
  [UserRole.INVENTORY_MANAGER]: 'Inventory Manager',
  [UserRole.SALES]: 'Sales',
  [UserRole.VIEWER]: 'Viewer',
};

// ── Permissions ─────────────────────────────────────────────────────────

/**
 * Permission strings follow the pattern: resource.action
 * e.g., 'stock.create', 'transaction.authorize'
 */
export enum Permission {
  // Stock
  STOCK_READ = 'stock.read',
  STOCK_CREATE = 'stock.create',
  STOCK_UPDATE = 'stock.update',
  STOCK_ARCHIVE = 'stock.archive',

  // Diamond
  DIAMOND_READ = 'diamond.read',
  DIAMOND_CREATE = 'diamond.create',
  DIAMOND_UPDATE = 'diamond.update',
  DIAMOND_DELETE = 'diamond.delete',

  // Transaction
  TRANSACTION_READ = 'transaction.read',
  TRANSACTION_CREATE = 'transaction.create',
  TRANSACTION_UPDATE = 'transaction.update',
  TRANSACTION_POST = 'transaction.post',
  TRANSACTION_REVERSE = 'transaction.reverse',
  TRANSACTION_AUTHORIZE = 'transaction.authorize',

  // Ledger
  LEDGER_READ = 'ledger.read',
  LEDGER_CREATE = 'ledger.create',
  LEDGER_UPDATE = 'ledger.update',

  // Certificate
  CERTIFICATE_READ = 'certificate.read',
  CERTIFICATE_CREATE = 'certificate.create',
  CERTIFICATE_UPDATE = 'certificate.update',
  CERTIFICATE_UPLOAD = 'certificate.upload',
  CERTIFICATE_DELETE = 'certificate.delete',

  // Repair
  REPAIR_READ = 'repair.read',
  REPAIR_CREATE = 'repair.create',
  REPAIR_UPDATE = 'repair.update',

  // Party
  PARTY_READ = 'party.read',
  PARTY_CREATE = 'party.create',
  PARTY_UPDATE = 'party.update',
  PARTY_ARCHIVE = 'party.archive',
  PARTY_DELETE = 'party.delete',

  // Report
  REPORT_READ = 'report.read',
  REPORT_EXPORT = 'report.export',

  // Settings
  SETTINGS_READ = 'settings.read',
  SETTINGS_UPDATE = 'settings.update',

  // Database
  DATABASE_RESET = 'database.reset',
  DATABASE_IMPORT = 'database.import',
  DATABASE_EXPORT = 'database.export',

  // System
  SYSTEM_ACTIVATE = 'system.activate',

  // User Management
  USER_CREATE = 'user.create',
  USER_UPDATE = 'user.update',
  USER_DELETE = 'user.delete',

  // Profile
  PROFILE_READ = 'profile.read',
  PROFILE_SWITCH = 'profile.switch',

  // Audit
  AUDIT_READ = 'audit.read',

  // Dashboard
  DASHBOARD_READ = 'dashboard.read',
}

/**
 * Canonical role → permission mapping.
 * Used by both server (authorization middleware) and clients (UI visibility).
 */
export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  [UserRole.SUPER_ADMIN]: new Set(Object.values(Permission)),

  [UserRole.ADMIN]: new Set([
    Permission.STOCK_READ, Permission.STOCK_CREATE, Permission.STOCK_UPDATE, Permission.STOCK_ARCHIVE,
    Permission.DIAMOND_READ, Permission.DIAMOND_CREATE, Permission.DIAMOND_UPDATE, Permission.DIAMOND_DELETE,
    Permission.TRANSACTION_READ, Permission.TRANSACTION_CREATE, Permission.TRANSACTION_UPDATE, Permission.TRANSACTION_POST, Permission.TRANSACTION_REVERSE, Permission.TRANSACTION_AUTHORIZE,
    Permission.LEDGER_READ, Permission.LEDGER_CREATE, Permission.LEDGER_UPDATE,
    Permission.CERTIFICATE_READ, Permission.CERTIFICATE_CREATE, Permission.CERTIFICATE_UPDATE, Permission.CERTIFICATE_UPLOAD, Permission.CERTIFICATE_DELETE,
    Permission.REPAIR_READ, Permission.REPAIR_CREATE, Permission.REPAIR_UPDATE,
    Permission.PARTY_READ, Permission.PARTY_CREATE, Permission.PARTY_UPDATE, Permission.PARTY_ARCHIVE,
    Permission.REPORT_READ, Permission.REPORT_EXPORT,
    Permission.SETTINGS_READ, Permission.SETTINGS_UPDATE,
    Permission.DATABASE_IMPORT, Permission.DATABASE_EXPORT,
    Permission.USER_CREATE, Permission.USER_UPDATE,
    Permission.PROFILE_READ, Permission.PROFILE_SWITCH,
    Permission.AUDIT_READ,
    Permission.DASHBOARD_READ,
  ]),

  [UserRole.MANAGER]: new Set([
    Permission.STOCK_READ, Permission.STOCK_CREATE, Permission.STOCK_UPDATE,
    Permission.DIAMOND_READ, Permission.DIAMOND_CREATE, Permission.DIAMOND_UPDATE,
    Permission.TRANSACTION_READ, Permission.TRANSACTION_CREATE, Permission.TRANSACTION_UPDATE, Permission.TRANSACTION_POST, Permission.TRANSACTION_AUTHORIZE,
    Permission.LEDGER_READ, Permission.LEDGER_CREATE, Permission.LEDGER_UPDATE,
    Permission.CERTIFICATE_READ, Permission.CERTIFICATE_CREATE, Permission.CERTIFICATE_UPDATE, Permission.CERTIFICATE_UPLOAD,
    Permission.REPAIR_READ, Permission.REPAIR_CREATE, Permission.REPAIR_UPDATE,
    Permission.PARTY_READ, Permission.PARTY_CREATE, Permission.PARTY_UPDATE,
    Permission.REPORT_READ, Permission.REPORT_EXPORT,
    Permission.SETTINGS_READ,
    Permission.DATABASE_EXPORT,
    Permission.PROFILE_READ,
    Permission.DASHBOARD_READ,
  ]),

  [UserRole.ACCOUNTANT]: new Set([
    Permission.STOCK_READ,
    Permission.DIAMOND_READ,
    Permission.TRANSACTION_READ, Permission.TRANSACTION_CREATE, Permission.TRANSACTION_UPDATE,
    Permission.LEDGER_READ, Permission.LEDGER_CREATE, Permission.LEDGER_UPDATE,
    Permission.CERTIFICATE_READ,
    Permission.REPAIR_READ,
    Permission.PARTY_READ, Permission.PARTY_CREATE, Permission.PARTY_UPDATE,
    Permission.REPORT_READ, Permission.REPORT_EXPORT,
    Permission.DASHBOARD_READ,
  ]),

  [UserRole.INVENTORY_MANAGER]: new Set([
    Permission.STOCK_READ, Permission.STOCK_CREATE, Permission.STOCK_UPDATE,
    Permission.DIAMOND_READ, Permission.DIAMOND_CREATE, Permission.DIAMOND_UPDATE,
    Permission.TRANSACTION_READ, Permission.TRANSACTION_CREATE,
    Permission.LEDGER_READ,
    Permission.CERTIFICATE_READ, Permission.CERTIFICATE_CREATE, Permission.CERTIFICATE_UPDATE, Permission.CERTIFICATE_UPLOAD,
    Permission.REPAIR_READ, Permission.REPAIR_CREATE, Permission.REPAIR_UPDATE,
    Permission.PARTY_READ,
    Permission.REPORT_READ,
    Permission.DASHBOARD_READ,
  ]),

  [UserRole.SALES]: new Set([
    Permission.STOCK_READ,
    Permission.DIAMOND_READ,
    Permission.TRANSACTION_READ, Permission.TRANSACTION_CREATE,
    Permission.LEDGER_READ,
    Permission.CERTIFICATE_READ,
    Permission.REPAIR_READ,
    Permission.PARTY_READ, Permission.PARTY_CREATE,
    Permission.REPORT_READ,
    Permission.DASHBOARD_READ,
  ]),

  [UserRole.VIEWER]: new Set([
    Permission.STOCK_READ,
    Permission.DIAMOND_READ,
    Permission.TRANSACTION_READ,
    Permission.LEDGER_READ,
    Permission.CERTIFICATE_READ,
    Permission.REPAIR_READ,
    Permission.PARTY_READ,
    Permission.REPORT_READ,
    Permission.DASHBOARD_READ,
  ]),
};

/**
 * Check if a role has a specific permission.
 * Usable on both server and client.
 */
export function hasPermission(role: UserRole | string, permission: Permission | string): boolean {
  const perms = ROLE_PERMISSIONS[role as UserRole];
  return perms ? perms.has(permission as Permission) : false;
}
