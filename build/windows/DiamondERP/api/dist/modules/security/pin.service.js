"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pinService = exports.PinService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const security_constants_1 = require("./security.constants");
class PinService {
    /**
     * Strictly validates a PIN against security policy and weak combination rules.
     * Never throws; returns a deterministic validation result.
     */
    validatePin(pin) {
        if (typeof pin !== 'string') {
            return { valid: false, reason: 'PIN must be a string of digits.' };
        }
        if (pin.trim() !== pin) {
            return { valid: false, reason: 'PIN must not contain leading or trailing whitespace.' };
        }
        if (pin.length < security_constants_1.SECURITY_CONFIG.MIN_PIN_LENGTH) {
            return { valid: false, reason: `PIN must be at least ${security_constants_1.SECURITY_CONFIG.MIN_PIN_LENGTH} digits.` };
        }
        if (pin.length > security_constants_1.SECURITY_CONFIG.MAX_PIN_LENGTH) {
            return { valid: false, reason: `PIN must not exceed ${security_constants_1.SECURITY_CONFIG.MAX_PIN_LENGTH} digits.` };
        }
        // Must be strictly digits only
        if (!/^\d+$/.test(pin)) {
            return { valid: false, reason: 'PIN must contain only numeric digits (0-9).' };
        }
        // Check disallowed dictionary
        if (security_constants_1.DISALLOWED_PINS.has(pin)) {
            return { valid: false, reason: 'This PIN is too common or easily guessed. Please choose a more secure PIN.' };
        }
        // Check for all identical digits (e.g., 000000, 777777)
        if (/^(\d)\1+$/.test(pin)) {
            return { valid: false, reason: 'PIN cannot consist of all identical digits.' };
        }
        // Check for sequential ascending or descending digits
        const digits = pin.split('').map(Number);
        let isAscending = true;
        let isDescending = true;
        for (let i = 1; i < digits.length; i++) {
            if (digits[i] !== (digits[i - 1] + 1) % 10) {
                isAscending = false;
            }
            if (digits[i] !== (digits[i - 1] - 1 + 10) % 10) {
                isDescending = false;
            }
        }
        if (isAscending || isDescending) {
            return { valid: false, reason: 'PIN cannot be a sequential series of digits.' };
        }
        return { valid: true };
    }
    /**
     * Cryptographically hashes the PIN using salted bcrypt.
     * Never logs plaintext PIN or hash.
     */
    async hashPin(pin) {
        const validation = this.validatePin(pin);
        if (!validation.valid) {
            throw new Error(validation.reason || 'Invalid PIN');
        }
        return bcryptjs_1.default.hash(pin, security_constants_1.SECURITY_CONFIG.BCRYPT_PIN_ROUNDS);
    }
    /**
     * Securely verifies a PIN against a bcrypt hash in constant time.
     */
    async verifyPinHash(pin, hash) {
        if (!pin || !hash)
            return false;
        try {
            return await bcryptjs_1.default.compare(pin, hash);
        }
        catch {
            return false;
        }
    }
}
exports.PinService = PinService;
exports.pinService = new PinService();
//# sourceMappingURL=pin.service.js.map