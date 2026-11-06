"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupController = exports.BackupController = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const backup_service_1 = require("./backup.service");
const prisma_1 = require("../../../infrastructure/database/prisma");
class BackupController {
    constructor() {
        this.createBackup = async (req, res, next) => {
            try {
                const performedBy = req.user?.username || req.user?.displayName || 'admin';
                const record = await backup_service_1.backupService.createBackup(req.body, performedBy);
                res.status(201).json({
                    success: true,
                    message: 'Backup created and verified successfully',
                    data: record,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.listBackups = async (_req, res, next) => {
            try {
                const result = await backup_service_1.backupService.listBackups();
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.inspectBackup = async (req, res, next) => {
            try {
                const identifier = req.body?.backupId || req.body?.path || req.query?.backupId;
                const result = await backup_service_1.backupService.inspectBackup(identifier);
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.verifyBackup = async (req, res, next) => {
            try {
                const identifier = req.body?.backupId || req.body?.path || req.query?.backupId;
                const result = await backup_service_1.backupService.verifyBackup(identifier);
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.downloadBackup = async (req, res, next) => {
            try {
                const backupId = String(req.params.backupId);
                const record = await prisma_1.systemPrisma.backupRecord.findUnique({ where: { backupId } });
                if (!record || !fs_1.default.existsSync(record.backupPath)) {
                    res.status(404).json({ success: false, message: 'Backup file not found on disk' });
                    return;
                }
                const filename = path_1.default.basename(record.backupPath);
                res.download(record.backupPath, filename);
            }
            catch (err) {
                next(err);
            }
        };
        this.deleteBackup = async (req, res, next) => {
            try {
                const backupId = req.params.backupId || req.body?.backupId;
                await backup_service_1.backupService.deleteBackupRecord(backupId);
                res.json({
                    success: true,
                    message: 'Backup record marked as deleted',
                });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.BackupController = BackupController;
exports.backupController = new BackupController();
//# sourceMappingURL=backup.controller.js.map