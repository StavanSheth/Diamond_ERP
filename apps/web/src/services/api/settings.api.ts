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

  factoryReset(confirmPassword?: string): Promise<any> {
    return request('/api/settings/factory-reset', {
      method: 'POST',
      body: JSON.stringify({ confirmPassword }),
    });
  },

  /** Export data to Excel */
  exportExcel(): Promise<Blob> {
    return requestBlob('/api/settings/export/excel');
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
};
