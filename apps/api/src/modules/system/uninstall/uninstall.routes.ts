import { Router } from 'express';
import { uninstallController } from './uninstall.controller';
import { authenticate } from '../../../middleware/auth';
import { idempotencyMiddleware } from '../../../middleware/idempotency';

const router = Router();
const adminStack = [authenticate, idempotencyMiddleware];

router.get('/preflight', adminStack, uninstallController.getPreflight);
router.post('/preserve', adminStack, uninstallController.createPreservation);
router.post('/verify', adminStack, uninstallController.verifyPreservation);
router.post('/authorize', adminStack, uninstallController.authorizeUninstall);
router.get('/authorization', adminStack, uninstallController.checkAuthorization);
router.post('/validate-destination', adminStack, uninstallController.validateDestination);
router.post('/browse-destination', adminStack, uninstallController.browseDestination);
router.post('/export', adminStack, uninstallController.createUninstallExport);
router.post('/auto-preserve', adminStack, uninstallController.autoPreserveAndAuthorize);

export default router;
