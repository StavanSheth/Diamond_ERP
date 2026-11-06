import { Request, Response, NextFunction } from 'express';
export declare class ReportsController {
    /**
     * Existing KPI charts data endpoint for backward compatibility
     */
    getReports: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/reports/preview
     * Live interactive table preview before export
     */
    getReportPreview: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * GET /api/reports/export/excel
     * Downloads formatted Excel spreadsheet, respecting user-selected rows and visible columns if specified
     */
    exportExcel: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=reports.controller.d.ts.map