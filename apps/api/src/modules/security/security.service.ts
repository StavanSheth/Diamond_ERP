import { installationService } from '../system/installation.service';
import { deviceSecurityService, AuditMeta } from './device-security.service';
import { ValidationError } from '../../errors';
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
   * Resolves the authoritative local device ID and verifies that any client-supplied
   * deviceId strictly matches this node's authoritative identity.
   * Invariant: Client cannot spoof or operate on another device's security state.
   */
  resolveAuthoritativeDeviceId(requestedDeviceId?: string): string {
    const authoritativeId = this.getLocalDeviceId();
    if (requestedDeviceId !== undefined && requestedDeviceId !== null && requestedDeviceId.trim() !== '') {
      if (requestedDeviceId.trim() !== authoritativeId) {
        throw new ValidationError('Invalid device identity: Client cannot operate on another device.');
      }
    }
    return authoritativeId;
  }

  /**
   * Retrieves security status for the local authoritative device.
   */
  async getStatus(deviceId?: string): Promise<SecurityStatusDto> {
    const id = this.resolveAuthoritativeDeviceId(deviceId);
    return deviceSecurityService.getSecurityStatus(id);
  }

  /**
   * Configures initial PIN for the local authoritative device.
   */
  async setupPin(pin: string, deviceId?: string, meta?: AuditMeta): Promise<DeviceSecurityDto> {
    const id = this.resolveAuthoritativeDeviceId(deviceId);
    return deviceSecurityService.setupPin(id, pin, meta);
  }

  /**
   * Verifies PIN for the local authoritative device.
   */
  async verifyPin(pin: string, deviceId?: string, meta?: AuditMeta): Promise<PinVerificationResponse> {
    const id = this.resolveAuthoritativeDeviceId(deviceId);
    return deviceSecurityService.verifyPin(id, pin, meta);
  }

  /**
   * Changes PIN for the local authoritative device.
   */
  async changePin(currentPin: string, newPin: string, deviceId?: string, meta?: AuditMeta): Promise<DeviceSecurityDto> {
    const id = this.resolveAuthoritativeDeviceId(deviceId);
    return deviceSecurityService.changePin(id, currentPin, newPin, meta);
  }

  /**
   * Locks the application workstation on the local authoritative device.
   */
  async lock(deviceId?: string, meta?: AuditMeta): Promise<LockStateDto> {
    const id = this.resolveAuthoritativeDeviceId(deviceId);
    return deviceSecurityService.lockApplication(id, meta);
  }

  /**
   * Unlocks the application workstation on the local authoritative device with PIN.
   */
  async unlock(pin: string, deviceId?: string, meta?: AuditMeta): Promise<LockStateDto> {
    const id = this.resolveAuthoritativeDeviceId(deviceId);
    return deviceSecurityService.unlockApplication(id, pin, meta);
  }

  /**
   * Binds the local authoritative device.
   */
  async bind(deviceId?: string, meta?: AuditMeta): Promise<SecurityStatusDto> {
    const id = this.resolveAuthoritativeDeviceId(deviceId);
    return deviceSecurityService.bindDevice(id, meta);
  }
}

export const securityService = new SecurityService();
