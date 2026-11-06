/**
 * API route path constants for Diamond ERP.
 *
 * Single source of truth for all API endpoint paths.
 * Used by the API client and server route registrations.
 */

/** API version prefix. */
export const API_PREFIX = '/api';

/** Route path definitions grouped by module. */
export const API_ROUTES = {
  AUTH: {
    BASE: `${API_PREFIX}/auth`,
    LOGIN: `${API_PREFIX}/auth/login`,
    BOOTSTRAP: `${API_PREFIX}/auth/bootstrap`,
    CHANGE_PASSWORD: `${API_PREFIX}/auth/change-password`,
    ME: `${API_PREFIX}/auth/me`,
  },

  STOCKS: {
    BASE: `${API_PREFIX}/stocks`,
    BY_ID: (id: string) => `${API_PREFIX}/stocks/${id}`,
    ITEMS: (stockId: string) => `${API_PREFIX}/stocks/${stockId}/items`,
    IMPORT: `${API_PREFIX}/stocks/import`,
    EXPORT: `${API_PREFIX}/stocks/export`,
  },

  DIAMONDS: {
    BASE: `${API_PREFIX}/diamonds`,
    BY_ID: (id: string) => `${API_PREFIX}/diamonds/${id}`,
    EVENTS: (id: string) => `${API_PREFIX}/diamonds/${id}/events`,
  },

  LEDGER: {
    BASE: `${API_PREFIX}/ledger`,
    BY_ID: (id: string) => `${API_PREFIX}/ledger/${id}`,
    TRANSACTIONS: (ledgerId: string) => `${API_PREFIX}/ledger/${ledgerId}/transactions`,
    TRANSACTION_BY_ID: (ledgerId: string, txnId: string) => `${API_PREFIX}/ledger/${ledgerId}/transactions/${txnId}`,
  },

  CERTIFICATES: {
    BASE: `${API_PREFIX}/certificates`,
    BY_ID: (id: string) => `${API_PREFIX}/certificates/${id}`,
    UPLOAD: (id: string) => `${API_PREFIX}/certificates/${id}/upload`,
  },

  PARTIES: {
    BASE: `${API_PREFIX}/parties`,
    BY_ID: (id: string) => `${API_PREFIX}/parties/${id}`,
  },

  REPAIRS: {
    BASE: `${API_PREFIX}/repairs`,
    BY_ID: (id: string) => `${API_PREFIX}/repairs/${id}`,
  },

  REPORTS: {
    BASE: `${API_PREFIX}/reports`,
    GENERATE: `${API_PREFIX}/reports/generate`,
    EXPORT: `${API_PREFIX}/reports/export`,
  },

  DASHBOARD: {
    BASE: `${API_PREFIX}/dashboard`,
  },

  SETTINGS: {
    BASE: `${API_PREFIX}/settings`,
    PROFILES: `${API_PREFIX}/settings/profiles`,
    USERS: `${API_PREFIX}/settings/users`,
    FACTORY_RESET: `${API_PREFIX}/settings/factory-reset`,
  },

  SYSTEM: {
    HEALTH: '/health',
    LIVENESS: '/health/liveness',
    READINESS: '/health/readiness',
    ACTIVATE: `${API_PREFIX}/system/activate`,
  },
} as const;
