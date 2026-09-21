import { request, requestBlob, requestUpload } from './client';

export const settingsApi = {
  getSettings(): Promise<{ success: boolean; data: Record<string, string> }> {
    return request('/api/settings');
  },

  updateSettings(data: Record<string, string>): Promise<any> {
    return request('/api/settings', { method: 'PUT', body: JSON.stringify(data) });
  },

  getProfiles(): Promise<{ success: boolean; data: { profiles: string[]; active: string } }> {
    return request('/api/settings/profiles');
  },

  createProfile(profileName: string): Promise<any> {
    return request('/api/settings/profiles', { method: 'POST', body: JSON.stringify({ profileName }) });
  },

  switchProfile(profileName: string): Promise<any> {
    return request('/api/settings/profile', { method: 'POST', body: JSON.stringify({ profileName }) });
  },

  deleteProfile(profileCode: string, deleteDatabase = true): Promise<{ success: boolean; message?: string; deletedDatabases?: string[] }> {
    return request(`/api/settings/profiles/${profileCode}?deleteDatabase=${deleteDatabase}`, {
      method: 'DELETE',
    });
  },

  factoryReset(confirmPassword = 'DELETE'): Promise<any> {
    return request('/api/settings/factory-reset', {
      method: 'POST',
      body: JSON.stringify({ confirmation: confirmPassword, confirmPassword }),
    });
  },

  /** Export data to Excel */
  exportExcel(options?: { arrangement?: 'default' | 'party' | 'stock' }): Promise<Blob> {
    const params = options?.arrangement && options.arrangement !== 'default'
      ? `?arrangement=${options.arrangement}` : '';
    return requestBlob(`/api/settings/export/excel${params}`);
  },

  /** Download Excel template */
  downloadTemplate(): Promise<Blob> {
    return requestBlob('/api/settings/export/template');
  },

  /** Import data from Excel */
  async importExcel(file: File, mode: 'merge' | 'overwrite' = 'merge'): Promise<{ success: boolean; message?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return requestUpload(`/api/settings/import/excel?mode=${mode}`, formData);
  },

  /** Get lifetime activation / master lock status */
  getActivationStatus(): Promise<{ success: boolean; isActivated: boolean }> {
    return request<{ success: boolean; isActivated: boolean }>('/api/system/activation-status');
  },

  /** Activate application with master password */
  activateApp(password: string): Promise<{ success: boolean; message?: string }> {
    return request<{ success: boolean; message?: string }>('/api/system/activate', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  /** List all business users with their assigned profiles and databases */
  listUsers(): Promise<{ success: boolean; data: any[] }> {
    return request('/api/settings/users');
  },

  /** Update user details */
  updateUser(userId: string, data: { displayName?: string; role?: string }): Promise<{ success: boolean; message: string; data: any }> {
    return request(`/api/settings/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /** List all registered databases / profiles */
  listDatabases(): Promise<{ success: boolean; data: any[] }> {
    return request('/api/settings/databases');
  },

  /** Update database display name */
  updateDatabase(profileId: string, data: { name: string }): Promise<{ success: boolean; message: string; data: any }> {
    return request(`/api/settings/databases/${profileId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /** Link a database / profile to a user */
  linkDatabaseToUser(userId: string, profileId: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/settings/users/${userId}/link-database`, {
      method: 'POST',
      body: JSON.stringify({ profileId }),
    });
  },

  /** Unlink a database / profile from a user */
  unlinkDatabaseFromUser(userId: string, profileId: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/settings/users/${userId}/unlink-database`, {
      method: 'POST',
      body: JSON.stringify({ profileId }),
    });
  },

  /** Delete a user and optionally their dedicated profile database */
  deleteUser(userId: string, deleteDatabase = true): Promise<{ success: boolean; message?: string; deletedDatabases?: string[] }> {
    return request(`/api/settings/users/${userId}?deleteDatabase=${deleteDatabase}`, {
      method: 'DELETE',
    });
  },
};

