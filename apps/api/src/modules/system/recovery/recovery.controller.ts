import { Request, Response, NextFunction } from 'express';
import { recoveryService } from './recovery.service';

export class RecoveryController {
  discoverCandidates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const additionalDir = (req.query?.directory as string) || req.body?.directory;
      const result = await recoveryService.discoverCandidates(additionalDir);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  inspectCandidate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const candidatePath = req.body?.path || (req.query?.path as string);
      const result = await recoveryService.inspectCandidate(candidatePath);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  validateCandidate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const candidatePath = req.body?.path || (req.query?.path as string);
      const result = await recoveryService.inspectCandidate(candidatePath);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  prepareRestore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await recoveryService.prepareRestore(req.body);
      res.status(201).json({
        success: true,
        message: 'Restore staged and validated successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  confirmRestore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const performedBy = (req as any).user?.username || (req as any).user?.displayName || 'admin';
      const result = await recoveryService.confirmRestore(req.body, performedBy);
      res.json({
        success: true,
        message: 'Restore completed successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  detectReinstallState = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await recoveryService.detectReinstallState();
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  startFreshInstallation = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await recoveryService.startFreshInstallation();
      res.status(201).json({
        success: true,
        message: 'Fresh installation initialized; existing data files preserved on disk.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const recoveryController = new RecoveryController();
