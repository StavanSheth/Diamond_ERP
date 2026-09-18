import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { securityController } from './security.controller';

const router = Router();

// Dedicated rate limiters appropriate for a local Windows application
// Invariant: Protects against fast HTTP spam while DB failure counters enforce the 5-attempt lockout.
const pinVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many PIN verification attempts, please try again later.' },
});

const pinSetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many PIN setup attempts, please try again later.' },
});

const pinChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many PIN change attempts, please try again later.' },
});

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many workstation unlock attempts, please try again later.' },
});

// Device security status query
router.get('/', securityController.getSecurityStatus);
router.get('/status', securityController.getSecurityStatus);

// PIN management
router.post('/pin/setup', pinSetupLimiter, securityController.setupPin);
router.post('/pin/verify', pinVerifyLimiter, securityController.verifyPin);
router.post('/pin/change', pinChangeLimiter, securityController.changePin);

// Workstation App Lock / Unlock
router.post('/lock', securityController.lock);
router.post('/unlock', unlockLimiter, securityController.unlock);

// Device binding
router.post('/bind', securityController.bindDevice);

export default router;
