import { Router } from 'express';
import { backupController } from './backup.controller';
import { authenticate } from '../../../middleware/auth';
import { idempotencyMiddleware } from '../../../middleware/idempotency';

const router = Router();

// Administrative backup operations
const adminStack = [authenticate, idempotencyMiddleware];

router.post('/create', adminStack, backupController.createBackup);
router.get('/list', adminStack, backupController.listBackups);
router.post('/inspect', adminStack, backupController.inspectBackup);
router.post('/verify', adminStack, backupController.verifyBackup);
router.get('/:backupId/download', adminStack, backupController.downloadBackup);
router.delete('/:backupId', adminStack, backupController.deleteBackup);

export default router;

