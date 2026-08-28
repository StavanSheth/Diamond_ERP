import { Request, Response, NextFunction } from 'express';
import { draftService } from '../../services/draft.service';

export class DraftController {
  /** GET /api/drafts */
  getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, entityType, createdBy } = req.query;
      const drafts = await draftService.listDrafts({
        status: status as string,
        entityType: entityType as string,
        createdBy: createdBy as string,
      });
      res.json({ success: true, data: drafts });
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/drafts/:id */
  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const draft = await draftService.getDraft(id);
      if (!draft) {
        res.status(404).json({ success: false, error: 'Draft not found' });
        return;
      }
      res.json({ success: true, data: draft });
    } catch (err) {
      next(err);
    }
  };

  /** POST /api/drafts */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { entityType, entityId, ledgerId, payload, createdBy, deviceId, sessionId } = req.body;
      const draft = await draftService.createDraft({
        entityType,
        entityId,
        ledgerId,
        payload: payload || {},
        createdBy: createdBy || 'system',
        deviceId,
        sessionId,
      });
      res.status(201).json({ success: true, data: draft });
    } catch (err) {
      next(err);
    }
  };

  /** PUT /api/drafts/:id */
  saveRevision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { payload, changeSet, changeSummary, updatedBy, deviceId, sessionId } = req.body;
      const revision = await draftService.saveDraftRevision(id, {
        payload,
        changeSet,
        changeSummary,
        updatedBy: updatedBy || 'system',
        deviceId,
        sessionId,
      });
      res.json({ success: true, data: revision });
    } catch (err) {
      next(err);
    }
  };

  /** POST /api/drafts/:id/commit */
  commit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { createdBy } = req.body;
      const committed = await draftService.commitDraft(id, createdBy || 'system');
      res.json({ success: true, data: committed });
    } catch (err) {
      next(err);
    }
  };

  /** DELETE /api/drafts/:id */
  abandon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const abandoned = await draftService.abandonDraft(id);
      res.json({ success: true, data: abandoned });
    } catch (err) {
      next(err);
    }
  };
}
