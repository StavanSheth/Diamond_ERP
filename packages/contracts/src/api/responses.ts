/**
 * Standardized API response types for Diamond ERP.
 *
 * All API endpoints return responses conforming to these shapes,
 * enabling consistent client-side parsing across Web, Mobile, and Windows.
 */

// ── Base Response ───────────────────────────────────────────────────────

export interface PerformanceMetrics {
  requestTimeMs: number;
  processingTimeMs: number;
  totalTimeMs: number;
}

/**
 * Standard API response envelope.
 * Every endpoint wraps its data in this structure.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  requestId?: string;
  timestamp?: string;
  syncStatus?: 'success' | 'error' | 'partial' | string;
  lastSyncedAt?: string;
  performance?: PerformanceMetrics;
}


// ── Paginated Response ──────────────────────────────────────────────────

export interface PaginationMeta {
  /** Current page number (1-indexed). */
  page: number;
  /** Number of items per page. */
  pageSize: number;
  /** Total number of items across all pages. */
  totalItems: number;
  /** Total number of pages. */
  totalPages: number;
  /** Whether there is a next page. */
  hasNextPage: boolean;
  /** Whether there is a previous page. */
  hasPreviousPage: boolean;
}

/**
 * API response with pagination metadata.
 */
export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

// ── Error Response ──────────────────────────────────────────────────────

export enum ErrorCode {
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // Authentication
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',

  // Authorization
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  PROFILE_ACCESS_DENIED = 'PROFILE_ACCESS_DENIED',
  PROFILE_CONTEXT_REQUIRED = 'PROFILE_CONTEXT_REQUIRED',
  PROFILE_NOT_CONFIGURED = 'PROFILE_NOT_CONFIGURED',
  NO_PROFILE_MEMBERSHIPS = 'NO_PROFILE_MEMBERSHIPS',
  INVALID_PROFILE_FORMAT = 'INVALID_PROFILE_FORMAT',

  // Business Rules
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  CONCURRENCY_CONFLICT = 'CONCURRENCY_CONFLICT',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',

  // Resources
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  ALREADY_EXISTS = 'ALREADY_EXISTS',

  // Rate Limiting
  RATE_LIMITED = 'RATE_LIMITED',

  // Server
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  DATABASE_UNAVAILABLE = 'DATABASE_UNAVAILABLE',
}

export interface ErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: ErrorCode;
  details?: ErrorDetail[];
  requestId?: string;
  timestamp?: string;
}

// ── Pagination Request Parameters ───────────────────────────────────────

export interface PaginationParams {
  /** Page number (1-indexed). Default: 1. */
  page?: number;
  /** Items per page. Default: 25. Max: 100. */
  pageSize?: number;
}

export interface SortParams {
  /** Field to sort by. */
  sortBy?: string;
  /** Sort direction. Default: 'asc'. */
  sortOrder?: 'asc' | 'desc';
}

export interface SearchParams {
  /** Full-text search query. */
  search?: string;
}

/** Combined query parameters for list endpoints. */
export interface ListQueryParams extends PaginationParams, SortParams, SearchParams {
  [key: string]: string | number | boolean | undefined;
}

// ── Sync Status ─────────────────────────────────────────────────────────

export type SyncStatus = 'success' | 'error' | 'partial' | 'pending' | 'offline';

export interface SyncMeta {
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
}
