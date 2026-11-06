import { Request, Response, NextFunction } from 'express';
export declare const getActivationFilePath: () => string;
export declare const DEFAULT_APP_ACTIVATION_KEY = "Diamond@2026#SecureVault-APP";
export declare const isKeyValid: (input: string) => boolean;
export declare class ActivationController {
    private isFileActivated;
    private setFileActivated;
    getActivationStatus: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    activate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const activationController: ActivationController;
//# sourceMappingURL=activation.controller.d.ts.map