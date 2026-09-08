import { Router } from 'express';
import { SettingsController } from './settings.controller';

import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

export function createSettingsRouter(controller: SettingsController): Router {
  const router = Router();

  router.get('/', controller.getSettings);
  router.put('/', controller.updateSettings);
  
  router.get('/export/excel', controller.exportExcel);
  router.get('/export/template', controller.downloadTemplate);
  router.post('/import/excel', upload.single('file'), controller.importExcel);

  router.get('/profiles', controller.getProfiles);
  router.post('/profile', controller.switchProfile);
  router.post('/factory-reset', controller.factoryReset);

  return router;
}
