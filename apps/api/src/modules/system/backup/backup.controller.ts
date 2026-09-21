import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { backupService } from './backup.service';
import { systemPrisma } from '../../../infrastructure/database/prisma';

export class BackupController {
  createBackup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const performedBy = (req as any).user?.username || (req as any).user?.displayName || 'admin';
      const record = await backupService.createBackup(req.body, performedBy);
      res.status(201).json({
        success: true,
        message: 'Backup created and verified successfully',
        data: record,
      });
    } catch (err) {
      next(err);
    }
  };

  listBackups = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await backupService.listBackups();
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  inspectBackup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identifier = req.body?.backupId || req.body?.path || (req.query?.backupId as string);
      const result = await backupService.inspectBackup(identifier);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  verifyBackup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identifier = req.body?.backupId || req.body?.path || (req.query?.backupId as string);
      const result = await backupService.verifyBackup(identifier);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  downloadBackup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const backupId = String(req.params.backupId);
      const record = await systemPrisma.backupRecord.findUnique({ where: { backupId } });
      if (!record || !fs.existsSync(record.backupPath)) {
        res.status(404).json({ success: false, message: 'Backup file not found on disk' });
        return;
      }
      const filename = path.basename(record.backupPath);
      res.download(record.backupPath, filename);
    } catch (err) {
      next(err);
    }
  };

  deleteBackup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const backupId = req.params.backupId || req.body?.backupId;
      await backupService.deleteBackupRecord(backupId);
      res.json({
        success: true,
        message: 'Backup record marked as deleted',
      });
    } catch (err) {
      next(err);
    }
  };
}

export const backupController = new BackupController();

