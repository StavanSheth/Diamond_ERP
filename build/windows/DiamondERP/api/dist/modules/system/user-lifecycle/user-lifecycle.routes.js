"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userLifecycleRoutes = void 0;
const express_1 = require("express");
const user_lifecycle_controller_1 = require("./user-lifecycle.controller");
const auth_1 = require("../../../middleware/auth");
const router = (0, express_1.Router)();
router.post('/:id/deactivate', auth_1.authenticate, user_lifecycle_controller_1.userLifecycleController.deactivateUser);
router.post('/:id/delete', auth_1.authenticate, user_lifecycle_controller_1.userLifecycleController.deleteUser);
router.delete('/:id', auth_1.authenticate, user_lifecycle_controller_1.userLifecycleController.deleteUser);
exports.userLifecycleRoutes = router;
//# sourceMappingURL=user-lifecycle.routes.js.map