"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userLifecycleController = exports.UserLifecycleController = void 0;
const user_lifecycle_service_1 = require("./user-lifecycle.service");
class UserLifecycleController {
    constructor() {
        this.deactivateUser = async (req, res, next) => {
            try {
                const userId = String(req.params.id || req.params.userId);
                const performedBy = req.user?.username || 'system';
                const result = await user_lifecycle_service_1.userLifecycleService.deactivateUser(userId, performedBy);
                res.status(200).json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
        this.deleteUser = async (req, res, next) => {
            try {
                const userId = String(req.params.id || req.params.userId);
                const performedBy = req.user?.username || 'system';
                const result = await user_lifecycle_service_1.userLifecycleService.deleteUser(userId, performedBy);
                res.status(200).json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.UserLifecycleController = UserLifecycleController;
exports.userLifecycleController = new UserLifecycleController();
//# sourceMappingURL=user-lifecycle.controller.js.map