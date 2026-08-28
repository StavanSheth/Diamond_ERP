import { Request, Response, NextFunction } from 'express';
export declare class DraftController {
    /** GET /api/drafts */
    getAll: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /** GET /api/drafts/:id */
    getOne: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /** POST /api/drafts */
    create: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /** PUT /api/drafts/:id */
    saveRevision: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /** POST /api/drafts/:id/commit */
    commit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /** DELETE /api/drafts/:id */
    abandon: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=draft.controller.d.ts.map