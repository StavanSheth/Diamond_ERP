import { Request, Response, NextFunction } from 'express';
export declare class DiamondController {
    /**
     * GET /api/diamonds/:id
     * Get full details of a single diamond item, including its lifecycle events, certs, and repairs.
     */
    getDiamond: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/diamonds
     * Get all diamonds
     */
    getAllDiamonds: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=diamond.controller.d.ts.map