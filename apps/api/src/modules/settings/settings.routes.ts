import { Router } from 'express';
import { SettingsController } from './settings.controller';
import { authorize, requireRole } from '../../middleware/authorize';

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

  router.get('/', authorize('settings.read'), controller.getSettings);
  router.put('/', authorize('settings.update'), controller.updateSettings);
  
  router.get('/export/excel', authorize('database.export'), controller.exportExcel);
  router.get('/export/template', authorize('database.export'), controller.downloadTemplate);
  router.post('/import/excel', authorize('database.import'), upload.single('file'), controller.importExcel);

  router.get('/profiles', authorize('profile.read'), controller.getProfiles);
  router.post('/profile', authorize('profile.switch'), controller.switchProfile);

  // Factory reset: SUPER_ADMIN only + additional re-authentication in controller
  router.post('/factory-reset', requireRole('SUPER_ADMIN'), controller.factoryReset);

  return router;
}
