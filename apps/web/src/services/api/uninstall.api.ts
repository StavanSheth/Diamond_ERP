import { request } from './client';
import type {
  UninstallPreflightDto,
  CreatePreservationPackageRequest,
  PreservationPackageDto,
  PreservationVerificationDto,
  AuthorizeUninstallRequest,
  UninstallAuthorizationDto,
} from '@diamond-erp/contracts';

export const uninstallApi = {
  /**
   * Run the Phase 7 Preflight inspection to detect active databases, backups, and customer data.
   */
  async getPreflight(): Promise<UninstallPreflightDto> {
    const res = await request<{ success: boolean; data: UninstallPreflightDto }>('/api/system/uninstall/preflight');
    return res.data;
  },

  /**
   * Create an authoritative preservation package (Database backup + CSVs + XLSX + Manifests).
   */
  async createPreservationPackage(data: CreatePreservationPackageRequest): Promise<PreservationPackageDto> {
    const res = await request<{ success: boolean; data: PreservationPackageDto }>('/api/system/uninstall/export', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  /**
   * Run deep non-destructive verification on an existing preservation package.
   */
  async verifyPreservation(packageId: string): Promise<PreservationVerificationDto> {
    const res = await request<{ success: boolean; data: PreservationVerificationDto }>('/api/system/uninstall/verify', {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    });
    return res.data;
  },

  /**
   * Issue a short-lived, single-use uninstall authorization token checked by Windows Installer.
   */
  async authorizeUninstall(data: AuthorizeUninstallRequest): Promise<UninstallAuthorizationDto> {
    const res = await request<{ success: boolean; data: UninstallAuthorizationDto }>('/api/system/uninstall/authorize', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  /**
   * Soft-deactivate a user while preserving database and registry records.
   */
  async deactivateUser(userId: string, reason = 'ADMIN_REQUEST'): Promise<{ success: boolean; message: string }> {
    return request(`/api/system/users/${userId}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /**
   * Soft-delete a user while strictly preserving database, profile, and registry records.
   */
  async deleteUser(userId: string, reason = 'ADMIN_REQUEST'): Promise<{ success: boolean; message: string; databasePreserved: boolean }> {
    return request(`/api/system/users/${userId}/delete`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};
