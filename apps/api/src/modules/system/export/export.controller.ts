import { Request, Response, NextFunction } from 'express';
import { exportService } from './export.service';

export class ExportController {
  exportData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const performedBy = (req as any).user?.username || (req as any).user?.displayName || 'admin';
      const result = await exportService.exportBusinessData(req.body, performedBy);
      res.status(201).json({
        success: true,
        message: 'Business data export completed and verified successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  verifyExport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const target = req.body?.path || req.body?.exportId || (req.query?.exportId as string);
      const result = await exportService.verifyExport(target);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const exportController = new ExportController();
