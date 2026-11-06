import { Request, Response, NextFunction } from 'express';
export declare class RecoveryController {
    discoverCandidates: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    inspectCandidate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    validateCandidate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    prepareRestore: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    confirmRestore: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    detectReinstallState: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    startFreshInstallation: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    continueExistingInstallation: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    reconcileInterruptedRestores: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const recoveryController: RecoveryController;
//# sourceMappingURL=recovery.controller.d.ts.map