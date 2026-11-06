"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthRouter = createAuthRouter;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_controller_1 = require("./auth.controller");
const auth_1 = require("../../middleware/auth");
function createAuthRouter() {
    const router = (0, express_1.Router)();
    // Layered rate limiters for public authentication endpoints
    const authLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 30, // 30 attempts per 15 min
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many login attempts, please try again later.' },
    });
    const bootstrapLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 5, // 5 attempts per 15 min
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many bootstrap attempts. Access temporarily suspended.' },
    });
    // Public routes (rate limited)
    router.post('/login', authLimiter, auth_controller_1.authController.login);
    router.post('/bootstrap', bootstrapLimiter, auth_controller_1.authController.bootstrap);
    // Protected routes (require authentication)
    router.get('/me', auth_1.authenticate, auth_controller_1.authController.me);
    router.post('/change-password', auth_1.authenticate, auth_controller_1.authController.changePassword);
    router.post('/logout', auth_1.authenticate, auth_controller_1.authController.logout);
    // User lifecycle routes
    router.post('/users', auth_1.authenticate, auth_controller_1.authController.createUser);
    router.post('/users/:userId/deactivate', auth_1.authenticate, auth_controller_1.authController.deactivateUser);
    router.delete('/users/:userId', auth_1.authenticate, auth_controller_1.authController.deactivateUser);
    router.post('/users/:userId/reactivate', auth_1.authenticate, auth_controller_1.authController.reactivateUser);
    return router;
}
//# sourceMappingURL=auth.routes.js.map