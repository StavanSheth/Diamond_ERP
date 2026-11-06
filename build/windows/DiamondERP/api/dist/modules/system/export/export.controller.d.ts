import { Request, Response, NextFunction } from 'express';
export declare class ExportController {
    exportData: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    verifyExport: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const exportController: ExportController;
//# sourceMappingURL=export.controller.d.ts.map