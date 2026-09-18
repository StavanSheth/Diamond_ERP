import { installationService } from '../system/installation.service';
import { deviceSecurityService, AuditMeta } from './device-security.service';
import type {
  SecurityStatusDto,
  PinVerificationResponse,
  LockStateDto,
  DeviceSecurityDto,
} from './security.types';

export class SecurityService {
  /**
   * Resolves the authoritative local device ID from disk/control layer.
   */
  getLocalDeviceId(): string {
    return installationService.getOrGenerateDeviceId();
  }

  /**
   * Retrieves security status for the local device or a specified deviceId.
   */
  async getStatus(deviceId?: string): Promise<SecurityStatusDto> {
    const id = deviceId || this.getLocalDeviceId();
    return deviceSecurityService.getSecurityStatus(id);
  }

  /**
   * Configures initial PIN for the local device or a specified deviceId.
   */
  async setupPin(pin: string, deviceId?: string, meta?: AuditMeta): Promise<DeviceSecurityDto> {
    const id = deviceId || this.getLocalDeviceId();
    return deviceSecurityService.setupPin(id, pin, meta);
  }

  /**
   * Verifies PIN for the local device or a specified deviceId.
   */
  async verifyPin(pin: string, deviceId?: string, meta?: AuditMeta): Promise<PinVerificationResponse> {
    const id = deviceId || this.getLocalDeviceId();
    return deviceSecurityService.verifyPin(id, pin, meta);
  }

  /**
   * Changes PIN for the local device or a specified deviceId.
   */
  async changePin(currentPin: string, newPin: string, deviceId?: string, meta?: AuditMeta): Promise<DeviceSecurityDto> {
    const id = deviceId || this.getLocalDeviceId();
    return deviceSecurityService.changePin(id, currentPin, newPin, meta);
  }

  /**
   * Locks the application.
   */
  async lock(deviceId?: string, meta?: AuditMeta): Promise<LockStateDto> {
    const id = deviceId || this.getLocalDeviceId();
    return deviceSecurityService.lockApplication(id, meta);
  }

  /**
   * Unlocks the application with PIN.
   */
  async unlock(pin: string, deviceId?: string, meta?: AuditMeta): Promise<LockStateDto> {
    const id = deviceId || this.getLocalDeviceId();
    return deviceSecurityService.unlockApplication(id, pin, meta);
  }

  /**
   * Binds the local or specified device.
   */
  async bind(deviceId?: string, meta?: AuditMeta): Promise<SecurityStatusDto> {
    const id = deviceId || this.getLocalDeviceId();
    return deviceSecurityService.bindDevice(id, meta);
  }
}

export const securityService = new SecurityService();
