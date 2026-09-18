import { request } from './client';
import type {
  SecurityStatusDto,
  DeviceSecurityDto,
  PinVerificationResponse,
  LockStateDto,
} from '@diamond-erp/contracts';

export const securityApi = {
  /**
   * Retrieves security status of the local or specified device.
   */
  async getStatus(deviceId?: string): Promise<SecurityStatusDto> {
    const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
    return request<SecurityStatusDto>(`/api/system/security/status${query}`);
  },

  /**
   * Sets up initial PIN for the device.
   */
  async setupPin(pin: string, deviceId?: string): Promise<DeviceSecurityDto> {
    return request<DeviceSecurityDto>('/api/system/security/pin/setup', {
      method: 'POST',
      body: JSON.stringify({ pin, deviceId }),
    });
  },

  /**
   * Verifies PIN against device security state.
   */
  async verifyPin(pin: string, deviceId?: string): Promise<PinVerificationResponse> {
    return request<PinVerificationResponse>('/api/system/security/pin/verify', {
      method: 'POST',
      body: JSON.stringify({ pin, deviceId }),
    });
  },

  /**
   * Changes PIN requiring current PIN verification.
   */
  async changePin(currentPin: string, newPin: string, deviceId?: string): Promise<DeviceSecurityDto> {
    return request<DeviceSecurityDto>('/api/system/security/pin/change', {
      method: 'POST',
      body: JSON.stringify({ currentPin, newPin, deviceId }),
    });
  },

  /**
   * Explicitly locks the application screen.
   */
  async lock(deviceId?: string): Promise<LockStateDto> {
    return request<LockStateDto>('/api/system/security/lock', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });
  },

  /**
   * Unlocks the application screen with PIN.
   */
  async unlock(pin: string, deviceId?: string): Promise<LockStateDto> {
    return request<LockStateDto>('/api/system/security/unlock', {
      method: 'POST',
      body: JSON.stringify({ pin, deviceId }),
    });
  },

  /**
   * Binds device security record.
   */
  async bind(deviceId?: string): Promise<SecurityStatusDto> {
    return request<SecurityStatusDto>('/api/system/security/bind', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });
  },
};
