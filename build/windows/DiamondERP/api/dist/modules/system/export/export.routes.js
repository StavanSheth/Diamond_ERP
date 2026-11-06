"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const export_controller_1 = require("./export.controller");
const auth_1 = require("../../../middleware/auth");
const idempotency_1 = require("../../../middleware/idempotency");
const router = (0, express_1.Router)();
const adminStack = [auth_1.authenticate, idempotency_1.idempotencyMiddleware];
router.post('/', adminStack, export_controller_1.exportController.exportData);
router.post('/verify', adminStack, export_controller_1.exportController.verifyExport);
exports.default = router;
//# sourceMappingURL=export.routes.js.map