import { Request, Response, NextFunction } from 'express';
import { uninstallPreflightService } from './uninstall-preflight.service';
import { preservationService } from '../preservation/preservation.service';

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

  createPreservation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const performedBy = (req as any).user?.username || (req as any).user?.displayName || 'admin';
      const result = await preservationService.createPreservationPackage(req.body, performedBy);
      res.status(201).json({
        success: true,
        message: 'Preservation package created and verified successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  verifyPreservation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const packageIdOrPath = req.body?.packageId || req.body?.path || String(req.query.packageId || '');
      const result = await preservationService.verifyPreservationPackage(packageIdOrPath);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  authorizeUninstall = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const packageId = req.body?.preservationPackageId || req.body?.packageId;
      const result = await uninstallPreflightService.issueUninstallAuthorization(packageId);
      res.status(201).json({
        success: true,
        message: 'One-time uninstall authorization issued successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  checkAuthorization = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await uninstallPreflightService.checkAuthorizationToken();
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

  validateDestination = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const destinationDir = req.body?.destinationDir || req.query?.destinationDir || '';
      const result = await uninstallPreflightService.validateDestination(String(destinationDir));
      res.json({
        success: result.valid,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  browseDestination = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await uninstallPreflightService.browseDestination();
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const uninstallController = new UninstallController();
