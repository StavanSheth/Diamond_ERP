import { Router } from 'express';
import { SettingsController } from './settings.controller';

import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max for Excel files
  },
  fileFilter: (_req, file, cb) => {
    // Only allow .xlsx files
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx Excel files are allowed'));
    }
  },
});

export function createSettingsRouter(controller: SettingsController): Router {
  const router = Router();

  router.get('/', controller.getSettings);
  router.put('/', controller.updateSettings);
  
  router.get('/export/excel', controller.exportExcel);
  router.get('/export/template', controller.downloadTemplate);
  router.post('/import/excel', upload.single('file'), controller.importExcel);

  router.get('/profiles', controller.getProfiles);
  router.post('/profiles', controller.createProfile);
  if (controller.deleteProfile) router.delete('/profiles/:profileCode', controller.deleteProfile);
  router.post('/profile', controller.switchProfile);

  // Database backup and SQLite WAL maintenance
  router.post('/backup', controller.backupDatabase);
  router.post('/checkpoint', controller.checkpointWAL);

  // User & Database Management
  if (controller.listUsers) router.get('/users', controller.listUsers);
  if (controller.updateUser) router.put('/users/:userId', controller.updateUser);
  if (controller.deactivateUser) router.post('/users/:userId/deactivate', controller.deactivateUser);
  if (controller.deleteUser) router.delete('/users/:userId', controller.deleteUser);

  if (controller.listDatabases) router.get('/databases', controller.listDatabases);
  if (controller.updateDatabase) router.put('/databases/:profileId', controller.updateDatabase);
  if (controller.linkDatabaseToUser) router.post('/users/:userId/link-database', controller.linkDatabaseToUser);
  if (controller.unlinkDatabaseFromUser) router.post('/users/:userId/unlink-database', controller.unlinkDatabaseFromUser);

  // Direct download backup endpoints (Native Save As)
  if (controller.downloadActiveDatabase) router.get('/backup/download-active', controller.downloadActiveDatabase);
  if (controller.downloadBackup) router.get('/backup/:backupId/download', controller.downloadBackup);

  // Factory reset
  router.post('/factory-reset', controller.factoryReset);

  return router;
}
