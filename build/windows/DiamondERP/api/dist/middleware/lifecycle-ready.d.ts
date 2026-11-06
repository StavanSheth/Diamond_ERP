import { Request, Response, NextFunction } from 'express';
/**
 * Lifecycle Ready Gate Middleware.
 *
 * Enforces that core ERP business operations (Stocks, Ledger, Parties, Repairs, Reports)
 * cannot be executed unless the installation lifecycle is in the authoritative 'READY' state.
 *
 * Rejects with 428 Precondition Required if installation is not fully initialized/onboarded.
 */
export declare function lifecycleReadyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=lifecycle-ready.d.ts.map