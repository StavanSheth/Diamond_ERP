import { Request, Response, NextFunction } from 'express';
export declare class RepairController {
    getRepairs: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    createRepair: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    updateRepair: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    deleteRepair: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=repair.controller.d.ts.map