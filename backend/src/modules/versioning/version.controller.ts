import { Request, Response, NextFunction } from 'express';
import { versionService } from '../../services/version.service';

export class VersionController {
  /** GET /api/versions/:entityType/:entityId */
  getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const entityType = req.params.entityType as string;
      const entityId = req.params.entityId as string;
      const versions = await versionService.getVersionHistory(entityType, entityId);
      res.json({ success: true, data: versions });
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/versions/:id */
  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const version = await versionService.getVersion(id);
      if (!version) {
        res.status(404).json({ success: false, error: 'Version not found' });
        return;
      }
      res.json({ success: true, data: version });
    } catch (err) {
      next(err);
    }
  };

  /** POST /api/versions/:id/restore */
  restore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { createdBy } = req.body;
      const restored = await versionService.restoreVersion(id, createdBy || 'system');
      res.json({ success: true, data: restored });
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/versions/:idA/diff/:idB */
  diff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idA = req.params.idA as string;
      const idB = req.params.idB as string;
      const result = await versionService.diffVersions(idA, idB);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}
