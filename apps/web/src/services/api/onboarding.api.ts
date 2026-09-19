import { request } from './client';
import type {
  OnboardingStatusDto,
  UserDiscoveryResponseDto,
  DatabaseDiscoveryResponseDto,
  DatabaseAttachmentPreviewDto,
  DeviceDto,
  AttachDatabaseRequest,
  CreateDatabaseRequest,
  CreateOnboardingUserRequest,
  LifecycleState,
} from '@diamond-erp/contracts';

export const onboardingApi = {
  async getStatus(): Promise<OnboardingStatusDto> {
    const res = await request<{ success: boolean; data: OnboardingStatusDto }>('/api/system/onboarding');
    return res.data;
  },

  async updateLifecycleState(lifecycleState: LifecycleState): Promise<any> {
    const res = await request<{ success: boolean; data: any }>('/api/system/lifecycle-state', {
      method: 'POST',
      body: JSON.stringify({ lifecycleState }),
    });
    return res.data;
  },

  async initializeApp(): Promise<OnboardingStatusDto> {
    const res = await request<{ success: boolean; data: OnboardingStatusDto }>('/api/system/onboarding/app-setup', {
      method: 'POST',
    });
    return res.data;
  },

  async registerDevice(deviceName: string): Promise<DeviceDto> {
    const res = await request<{ success: boolean; data: DeviceDto }>('/api/system/device', {
      method: 'POST',
      body: JSON.stringify({ deviceName }),
    });
    return res.data;
  },

  async discoverUsers(): Promise<UserDiscoveryResponseDto> {
    const res = await request<{ success: boolean; data: UserDiscoveryResponseDto }>('/api/system/onboarding/users');
    return res.data;
  },

  async selectUser(userId: string): Promise<{ success: boolean; user: any }> {
    return request<{ success: boolean; user: any }>('/api/system/onboarding/users/select', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  async createUser(data: CreateOnboardingUserRequest): Promise<{ success: boolean; user: any }> {
    return request<{ success: boolean; user: any }>('/api/system/onboarding/users/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async discoverDatabases(): Promise<DatabaseDiscoveryResponseDto> {
    const res = await request<{ success: boolean; data: DatabaseDiscoveryResponseDto }>('/api/system/onboarding/databases');
    return res.data;
  },

  async inspectDatabase(path: string): Promise<DatabaseAttachmentPreviewDto> {
    const res = await request<{ success: boolean; data: DatabaseAttachmentPreviewDto }>('/api/system/onboarding/databases/inspect', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
    return res.data;
  },

  async attachDatabase(data: AttachDatabaseRequest): Promise<{ success: boolean; registry: any }> {
    return request<{ success: boolean; registry: any }>('/api/system/onboarding/databases/attach', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async createDatabase(data: CreateDatabaseRequest): Promise<{ success: boolean; registry: any }> {
    return request<{ success: boolean; registry: any }>('/api/system/onboarding/databases/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async completeOnboarding(): Promise<OnboardingStatusDto> {
    const res = await request<{ success: boolean; data: OnboardingStatusDto }>('/api/system/onboarding/complete', {
      method: 'POST',
    });
    return res.data;
  },

  async resetStep(): Promise<OnboardingStatusDto> {
    const res = await request<{ success: boolean; data: OnboardingStatusDto }>('/api/system/onboarding/reset-step', {
      method: 'POST',
    });
    return res.data;
  },
};
