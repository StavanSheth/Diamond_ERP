import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';

export function createSettingsRouter(controller: SettingsController): Router {
  const router = Router();

  router.get('/', controller.getSettings);
  router.put('/', controller.updateSettings);

  return router;
}
