import { Router } from 'express';
import { uninstallController } from './uninstall.controller';
import { authenticate } from '../../../middleware/auth';
import { authorize } from '../../../middleware/authorize';
import { idempotencyMiddleware } from '../../../middleware/idempotency';

const router = Router();
const adminStack = [authenticate, idempotencyMiddleware];

router.get('/preflight', adminStack, authorize('settings.read'), uninstallController.getPreflight);
router.post('/preserve', adminStack, authorize('settings.update'), uninstallController.createPreservation);
router.post('/verify', adminStack, authorize('settings.read'), uninstallController.verifyPreservation);
router.post('/authorize', adminStack, authorize('settings.update'), uninstallController.authorizeUninstall);
router.get('/authorization', adminStack, authorize('settings.read'), uninstallController.checkAuthorization);
router.post('/export', adminStack, authorize('settings.update'), uninstallController.createUninstallExport);

export default router;
