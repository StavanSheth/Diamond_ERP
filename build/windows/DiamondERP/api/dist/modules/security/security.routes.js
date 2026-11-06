"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const security_controller_1 = require("./security.controller");
const router = (0, express_1.Router)();
// Dedicated rate limiters appropriate for a local Windows application
// Invariant: Protects against fast HTTP spam while DB failure counters enforce the 5-attempt lockout.
const pinVerifyLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 60, // 60 attempts per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many PIN verification attempts, please try again later.' },
});
const pinSetupLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many PIN setup attempts, please try again later.' },
});
const pinChangeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many PIN change attempts, please try again later.' },
});
const unlockLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many workstation unlock attempts, please try again later.' },
});
// Device security status query
router.get('/', security_controller_1.securityController.getSecurityStatus);
router.get('/status', security_controller_1.securityController.getSecurityStatus);
// PIN management
router.post('/pin/setup', pinSetupLimiter, security_controller_1.securityController.setupPin);
router.post('/pin/verify', pinVerifyLimiter, security_controller_1.securityController.verifyPin);
router.post('/pin/change', pinChangeLimiter, security_controller_1.securityController.changePin);
// Workstation App Lock / Unlock
router.post('/lock', security_controller_1.securityController.lock);
router.post('/unlock', unlockLimiter, security_controller_1.securityController.unlock);
// Device binding
router.post('/bind', security_controller_1.securityController.bindDevice);
exports.default = router;
//# sourceMappingURL=security.routes.js.map