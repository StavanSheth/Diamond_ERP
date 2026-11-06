"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityService = exports.SecurityService = void 0;
const installation_service_1 = require("../system/installation.service");
const device_security_service_1 = require("./device-security.service");
const errors_1 = require("../../errors");
class SecurityService {
    /**
     * Resolves the authoritative local device ID from disk/control layer.
     */
    getLocalDeviceId() {
        return installation_service_1.installationService.getOrGenerateDeviceId();
    }
    /**
     * Resolves the authoritative local device ID and verifies that any client-supplied
     * deviceId strictly matches this node's authoritative identity.
     * Invariant: Client cannot spoof or operate on another device's security state.
     */
    resolveAuthoritativeDeviceId(requestedDeviceId) {
        const authoritativeId = this.getLocalDeviceId();
        if (requestedDeviceId !== undefined && requestedDeviceId !== null && requestedDeviceId.trim() !== '') {
            if (requestedDeviceId.trim() !== authoritativeId) {
                throw new errors_1.ValidationError('Invalid device identity: Client cannot operate on another device.');
            }
        }
        return authoritativeId;
    }
    /**
     * Retrieves security status for the local authoritative device.
     */
    async getStatus(deviceId) {
        const id = this.resolveAuthoritativeDeviceId(deviceId);
        return device_security_service_1.deviceSecurityService.getSecurityStatus(id);
    }
    /**
     * Configures initial PIN for the local authoritative device.
     */
    async setupPin(pin, deviceId, meta) {
        const id = this.resolveAuthoritativeDeviceId(deviceId);
        return device_security_service_1.deviceSecurityService.setupPin(id, pin, meta);
    }
    /**
     * Verifies PIN for the local authoritative device.
     */
    async verifyPin(pin, deviceId, meta) {
        const id = this.resolveAuthoritativeDeviceId(deviceId);
        return device_security_service_1.deviceSecurityService.verifyPin(id, pin, meta);
    }
    /**
     * Changes PIN for the local authoritative device.
     */
    async changePin(currentPin, newPin, deviceId, meta) {
        const id = this.resolveAuthoritativeDeviceId(deviceId);
        return device_security_service_1.deviceSecurityService.changePin(id, currentPin, newPin, meta);
    }
    /**
     * Locks the application workstation on the local authoritative device.
     */
    async lock(deviceId, meta) {
        const id = this.resolveAuthoritativeDeviceId(deviceId);
        return device_security_service_1.deviceSecurityService.lockApplication(id, meta);
    }
    /**
     * Unlocks the application workstation on the local authoritative device with PIN.
     */
    async unlock(pin, deviceId, meta) {
        const id = this.resolveAuthoritativeDeviceId(deviceId);
        return device_security_service_1.deviceSecurityService.unlockApplication(id, pin, meta);
    }
    /**
     * Binds the local authoritative device.
     */
    async bind(deviceId, meta) {
        const id = this.resolveAuthoritativeDeviceId(deviceId);
        return device_security_service_1.deviceSecurityService.bindDevice(id, meta);
    }
}
exports.SecurityService = SecurityService;
exports.securityService = new SecurityService();
//# sourceMappingURL=security.service.js.map