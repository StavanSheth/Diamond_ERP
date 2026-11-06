import { Request, Response, NextFunction } from 'express';
export declare class LedgerController {
    /**
     * GET /api/ledger
     * Returns transactions with pagination, bounded relations, and correct running balances.
     */
    getAll: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * POST /api/ledger
     * Create a transaction using TransactionService with server-authoritative financial calculation.
     */
    create: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * DELETE /api/ledger/:id
     * Historical transactions cannot be deleted.
     */
    delete: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * PUT /api/ledger/:id
     * Allow edits for non-COMPLETED transactions. COMPLETED transactions are immutable.
     */
    update: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getParties: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    getStockNames: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/ledger/payment-summary
     * Memory-safe database aggregated payment summaries.
     */
    getPaymentSummary: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=ledger.controller.d.ts.map