import { Request, Response, NextFunction } from 'express';
import { uninstallPreflightService } from './uninstall-preflight.service';

export class UninstallController {
  getPreflight = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await uninstallPreflightService.getPreflightStatus();
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  createUninstallExport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const performedBy = (req as any).user?.username || (req as any).user?.displayName || 'admin';
      const result = await uninstallPreflightService.createUninstallBackup(req.body, performedBy);
      res.status(201).json({
        success: true,
        message: 'Pre-uninstall backup bundle created and verified successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const uninstallController = new UninstallController();
