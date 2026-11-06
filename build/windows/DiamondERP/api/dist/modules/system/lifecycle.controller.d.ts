import { Request, Response, NextFunction } from 'express';
export declare class LifecycleController {
    /**
     * Helper: Enforce bootstrap security boundary.
     * If installation is already READY, mutations require authenticated caller.
     */
    private checkBootstrapAccess;
    /**
     * GET /api/system/lifecycle
     * Public probe returning the current installation status and lifecycle state.
     */
    getLifecycleStatus: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/system/installation
     * Returns complete installation details and registered devices.
     */
    getInstallation: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/system/lifecycle-state
     * Update the authoritative lifecycle state machine.
     */
    updateLifecycleState: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/system/device
     * Register or update the local desktop Device.
     */
    registerDevice: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/system/database/validate
     * Read-only inspection of a candidate SQLite database file.
     */
    validateDatabase: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/system/database/register
     * Register a database file in the control database registry.
     */
    registerDatabase: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/system/database/list
     * List all registered databases for the local installation.
     */
    listDatabases: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/system/device/:deviceId/revoke
     */
    revokeDevice: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/system/device/:deviceId/reactivate
     */
    reactivateDevice: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/system/users/associate
     */
    associateUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/system/users/disassociate
     */
    disassociateUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/system/users
     */
    getInstallationUsers: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const lifecycleController: LifecycleController;
//# sourceMappingURL=lifecycle.controller.d.ts.map