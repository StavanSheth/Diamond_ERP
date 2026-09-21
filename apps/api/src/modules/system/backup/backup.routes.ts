import { Router } from 'express';
import { backupController } from './backup.controller';
import { authenticate } from '../../../middleware/auth';
import { authorize } from '../../../middleware/authorize';
import { idempotencyMiddleware } from '../../../middleware/idempotency';

const router = Router();

// Administrative backup operations (post-READY require authentication & admin role)
const adminStack = [authenticate, idempotencyMiddleware];

router.post('/create', adminStack, authorize('settings.update'), backupController.createBackup);
router.get('/list', adminStack, authorize('settings.read'), backupController.listBackups);
router.post('/inspect', adminStack, authorize('settings.read'), backupController.inspectBackup);
router.post('/verify', adminStack, authorize('settings.read'), backupController.verifyBackup);
router.get('/:backupId/download', adminStack, authorize('settings.read'), backupController.downloadBackup);
router.delete('/:backupId', adminStack, authorize('settings.update'), backupController.deleteBackup);

export default router;

