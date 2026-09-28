import { Router } from 'express';
import { exportController } from './export.controller';
import { authenticate } from '../../../middleware/auth';
import { idempotencyMiddleware } from '../../../middleware/idempotency';

const router = Router();
const adminStack = [authenticate, idempotencyMiddleware];

router.post('/', adminStack, exportController.exportData);
router.post('/verify', adminStack, exportController.verifyExport);

export default router;
