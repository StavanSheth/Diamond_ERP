import { Request, Response, NextFunction } from 'express';
export declare class UninstallController {
    getPreflight: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    createPreservation: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    verifyPreservation: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    authorizeUninstall: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    checkAuthorization: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    createUninstallExport: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    validateDestination: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    browseDestination: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * Section 12: Standard 1-step automated uninstall flow endpoint.
     */
    autoPreserveAndAuthorize: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const uninstallController: UninstallController;
//# sourceMappingURL=uninstall.controller.d.ts.map