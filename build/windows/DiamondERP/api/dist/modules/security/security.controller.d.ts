import { Request, Response, NextFunction } from 'express';
export declare class SecurityController {
    private getAuditMeta;
    /**
     * Helper: Extracts active authenticated user and validates session is not revoked.
     */
    private getAuthenticatedUser;
    /**
     * Predicate: Can configure initial PIN.
     * Disallowed if PIN is already configured (ConflictError).
     * In READY state, requires an active authenticated session.
     */
    private canConfigureInitialPin;
    /**
     * Predicate: Can change PIN.
     * In READY state, PIN change requires an active authenticated session.
     */
    private canChangePin;
    /**
     * Predicate: Can bind device.
     * In READY state, device binding requires an active authenticated session.
     */
    private canBindDevice;
    getSecurityStatus: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    setupPin: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    verifyPin: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    changePin: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    lock: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    unlock: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    bindDevice: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const securityController: SecurityController;
//# sourceMappingURL=security.controller.d.ts.map