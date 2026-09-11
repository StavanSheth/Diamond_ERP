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
  router.post('/profile', controller.switchProfile);

  // Database backup and SQLite WAL maintenance
  router.post('/backup', controller.backupDatabase);
  router.post('/checkpoint', controller.checkpointWAL);

  // Factory reset
  router.post('/factory-reset', controller.factoryReset);

  return router;
}
