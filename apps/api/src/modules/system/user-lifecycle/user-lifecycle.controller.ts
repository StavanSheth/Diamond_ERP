import { Request, Response, NextFunction } from 'express';
import { userLifecycleService } from './user-lifecycle.service';

export class UserLifecycleController {
  deactivateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.id || req.params.userId);
      const performedBy = (req as any).user?.username || 'system';
      const result = await userLifecycleService.deactivateUser(userId, performedBy);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.id || req.params.userId);
      const performedBy = (req as any).user?.username || 'system';
      const result = await userLifecycleService.deleteUser(userId, performedBy);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}

export const userLifecycleController = new UserLifecycleController();
