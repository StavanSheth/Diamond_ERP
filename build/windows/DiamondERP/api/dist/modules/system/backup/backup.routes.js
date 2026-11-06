"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const backup_controller_1 = require("./backup.controller");
const auth_1 = require("../../../middleware/auth");
const idempotency_1 = require("../../../middleware/idempotency");
const router = (0, express_1.Router)();
// Administrative backup operations
const adminStack = [auth_1.authenticate, idempotency_1.idempotencyMiddleware];
router.post('/create', adminStack, backup_controller_1.backupController.createBackup);
router.get('/list', adminStack, backup_controller_1.backupController.listBackups);
router.post('/inspect', adminStack, backup_controller_1.backupController.inspectBackup);
router.post('/verify', adminStack, backup_controller_1.backupController.verifyBackup);
router.get('/:backupId/download', adminStack, backup_controller_1.backupController.downloadBackup);
router.delete('/:backupId', adminStack, backup_controller_1.backupController.deleteBackup);
exports.default = router;
//# sourceMappingURL=backup.routes.js.map