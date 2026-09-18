import { Router } from 'express';
import { uninstallController } from './uninstall.controller';
import { authenticate } from '../../../middleware/auth';
import { authorize } from '../../../middleware/authorize';
import { idempotencyMiddleware } from '../../../middleware/idempotency';

const router = Router();
const adminStack = [authenticate, idempotencyMiddleware];

router.get('/preflight', adminStack, authorize('settings.read'), uninstallController.getPreflight);
router.post('/export', adminStack, authorize('settings.update'), uninstallController.createUninstallExport);

export default router;
