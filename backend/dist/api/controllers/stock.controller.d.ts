import { Request, Response, NextFunction } from 'express';
export declare class StockController {
    getStocks: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    createStock: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    updateStock: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    deleteStock: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getStockItems: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=stock.controller.d.ts.map