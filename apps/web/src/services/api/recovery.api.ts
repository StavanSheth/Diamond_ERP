import { request } from './client';
import type {
  RecoveryCandidateDiscoveryResponseDto,
  RecoveryInspectionPreviewDto,
  PrepareRestoreRequest,
  RestorePreviewDto,
  ConfirmRestoreRequest,
  RestoreOperationResponseDto,
  ReinstallDetectionDto,
} from '@diamond-erp/contracts';

export const recoveryApi = {
  async getReinstallStatus(): Promise<ReinstallDetectionDto> {
    const res = await request<{ success: boolean; data: ReinstallDetectionDto }>('/api/system/recovery/reinstall-status');
    return res.data;
  },

  async discoverCandidates(directory?: string): Promise<RecoveryCandidateDiscoveryResponseDto> {
    const res = await request<{ success: boolean; data: RecoveryCandidateDiscoveryResponseDto }>(
      '/api/system/recovery/discover',
      {
        method: 'POST',
        body: JSON.stringify({ directory }),
      }
    );
    return res.data;
  },

  async inspectCandidate(path: string): Promise<RecoveryInspectionPreviewDto> {
    const res = await request<{ success: boolean; data: RecoveryInspectionPreviewDto }>(
      '/api/system/recovery/inspect',
      {
        method: 'POST',
        body: JSON.stringify({ path }),
      }
    );
    return res.data;
  },

  async prepareRestore(data: PrepareRestoreRequest): Promise<RestorePreviewDto> {
    const res = await request<{ success: boolean; data: RestorePreviewDto }>('/api/system/recovery/prepare', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async confirmRestore(data: ConfirmRestoreRequest): Promise<RestoreOperationResponseDto> {
    const res = await request<{ success: boolean; data: RestoreOperationResponseDto }>('/api/system/recovery/restore', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async startFreshInstall(): Promise<any> {
    const res = await request<{ success: boolean; data: any }>('/api/system/recovery/fresh-install', {
      method: 'POST',
    });
    return res.data;
  },
};
