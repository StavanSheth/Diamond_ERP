import { Request, Response, NextFunction } from 'express';
export declare class LedgerController {
    /**
     * GET /api/ledger
     * Returns all transactions with their items, ordered by date descending.
     */
    getAll: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/ledger
     * Create a transaction using TransactionService.
     */
    create: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * DELETE /api/ledger/:id
     * Soft deletes a transaction. Wait, rule 1: "Never delete historical transactions. Use reversal/correction transactions."
     * For the API, we can either throw an error or implement a reverse.
     */
    delete: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    update: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getParties: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    getStockNames: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=ledger.controller.d.ts.map