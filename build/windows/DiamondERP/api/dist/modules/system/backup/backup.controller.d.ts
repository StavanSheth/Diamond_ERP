import { Request, Response, NextFunction } from 'express';
export declare class BackupController {
    createBackup: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    listBackups: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    inspectBackup: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    verifyBackup: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    downloadBackup: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    deleteBackup: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const backupController: BackupController;
//# sourceMappingURL=backup.controller.d.ts.map