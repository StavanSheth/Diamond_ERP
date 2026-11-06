import { PinValidationResult } from './security.types';
export declare class PinService {
    /**
     * Strictly validates a PIN against security policy and weak combination rules.
     * Never throws; returns a deterministic validation result.
     */
    validatePin(pin: unknown): PinValidationResult;
    /**
     * Cryptographically hashes the PIN using salted bcrypt.
     * Never logs plaintext PIN or hash.
     */
    hashPin(pin: string): Promise<string>;
    /**
     * Securely verifies a PIN against a bcrypt hash in constant time.
     */
    verifyPinHash(pin: string, hash: string): Promise<boolean>;
}
export declare const pinService: PinService;
//# sourceMappingURL=pin.service.d.ts.map