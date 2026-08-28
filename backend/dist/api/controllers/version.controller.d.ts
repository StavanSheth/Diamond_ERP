import { Request, Response, NextFunction } from 'express';
export declare class VersionController {
    /** GET /api/versions/:entityType/:entityId */
    getHistory: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /** GET /api/versions/:id */
    getOne: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /** POST /api/versions/:id/restore */
    restore: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /** GET /api/versions/:idA/diff/:idB */
    diff: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=version.controller.d.ts.map