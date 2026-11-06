"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uninstall_controller_1 = require("./uninstall.controller");
const auth_1 = require("../../../middleware/auth");
const idempotency_1 = require("../../../middleware/idempotency");
const router = (0, express_1.Router)();
const adminStack = [auth_1.authenticate, idempotency_1.idempotencyMiddleware];
router.get('/preflight', adminStack, uninstall_controller_1.uninstallController.getPreflight);
router.post('/preserve', adminStack, uninstall_controller_1.uninstallController.createPreservation);
router.post('/verify', adminStack, uninstall_controller_1.uninstallController.verifyPreservation);
router.post('/authorize', adminStack, uninstall_controller_1.uninstallController.authorizeUninstall);
router.get('/authorization', adminStack, uninstall_controller_1.uninstallController.checkAuthorization);
router.post('/validate-destination', adminStack, uninstall_controller_1.uninstallController.validateDestination);
router.post('/browse-destination', adminStack, uninstall_controller_1.uninstallController.browseDestination);
router.post('/export', adminStack, uninstall_controller_1.uninstallController.createUninstallExport);
router.post('/auto-preserve', adminStack, uninstall_controller_1.uninstallController.autoPreserveAndAuthorize);
exports.default = router;
//# sourceMappingURL=uninstall.routes.js.map