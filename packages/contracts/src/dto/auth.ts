/**
 * Authentication DTOs for Diamond ERP.
 *
 * These types define the request/response shapes for all auth endpoints.
 * Shared between server and all clients.
 */

// ── Login ───────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthenticatedUserInfo;
}

export interface AuthenticatedUserInfo {
  id: string;
  username: string;
  displayName: string;
  role: string;
  profiles: string[];
  activeProfile: string;
}

// ── Bootstrap ───────────────────────────────────────────────────────────

export interface BootstrapRequest {
  bootstrapSecret: string;
  username: string;
  password: string;
  displayName: string;
}

// ── User Management ─────────────────────────────────────────────────────

export interface CreateUserRequest {
  username: string;
  password: string;
  displayName: string;
  role: string;
  profileCodes?: string[];
}

export interface CreateUserResponse {
  id: string;
  username: string;
  displayName: string;
  role: string;
  profiles: string[];
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UserListItem {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  profiles: string[];
}

// ── Session ─────────────────────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string;
  ipAddress?: string;
  userAgent?: string;
  isCurrent: boolean;
}

// ── Profile ─────────────────────────────────────────────────────────────

export interface ProfileInfo {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}
