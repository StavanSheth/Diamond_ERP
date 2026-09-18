import { request } from './client';
import type {
  BackupRecordDto,
  CreateBackupRequest,
  BackupVerificationDto,
  BackupListResponseDto,
} from '@diamond-erp/contracts';

export const backupApi = {
  async listBackups(): Promise<BackupListResponseDto> {
    const res = await request<{ success: boolean; data: BackupListResponseDto }>('/api/system/backup/list');
    return res.data;
  },

  async createBackup(data: CreateBackupRequest = {}): Promise<BackupRecordDto> {
    const res = await request<{ success: boolean; data: BackupRecordDto }>('/api/system/backup/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async inspectBackup(backupIdOrPath: string): Promise<any> {
    const res = await request<{ success: boolean; data: any }>('/api/system/backup/inspect', {
      method: 'POST',
      body: JSON.stringify({ backupId: backupIdOrPath }),
    });
    return res.data;
  },

  async verifyBackup(backupIdOrPath: string): Promise<BackupVerificationDto> {
    const res = await request<{ success: boolean; data: BackupVerificationDto }>('/api/system/backup/verify', {
      method: 'POST',
      body: JSON.stringify({ backupId: backupIdOrPath }),
    });
    return res.data;
  },

  async deleteBackup(backupId: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/system/backup/${backupId}`, {
      method: 'DELETE',
    });
  },
};
