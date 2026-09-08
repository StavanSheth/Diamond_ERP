import { Request, Response, NextFunction } from 'express';
import { reportsService } from './reports.service';

export class ReportsController {
  /**
   * Existing KPI charts data endpoint for backward compatibility
   */
  getReports = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await reportsService.getKPIs();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/reports/preview
   * Live interactive table preview before export
   */
  getReportPreview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await reportsService.buildReportData(req.query);
      res.json({ success: true, ...data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/reports/export/excel
   * Downloads formatted Excel spreadsheet, respecting user-selected rows and visible columns if specified
   */
  exportExcel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await reportsService.exportExcel(req.query, res);
    } catch (error) {
      next(error);
    }
  };
}
