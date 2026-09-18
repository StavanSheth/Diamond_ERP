import { Router } from 'express';
import { exportController } from './export.controller';
import { authenticate } from '../../../middleware/auth';
import { authorize } from '../../../middleware/authorize';
import { idempotencyMiddleware } from '../../../middleware/idempotency';

const router = Router();
const adminStack = [authenticate, idempotencyMiddleware];

router.post('/', adminStack, authorize('settings.read'), exportController.exportData);
router.post('/verify', adminStack, authorize('settings.read'), exportController.verifyExport);

export default router;
