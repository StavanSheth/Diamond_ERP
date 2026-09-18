import { Router } from 'express';
import { recoveryController } from './recovery.controller';
import { onboardingAuthorizationService } from '../onboarding/onboarding-authorization.service';

const router = Router();

// Middleware for operations available in bootstrap (Pre-READY) or authenticated admin (Post-READY)
const bootstrapOrAdmin = (operation: any) => {
  return async (req: any, _res: any, next: any) => {
    try {
      await onboardingAuthorizationService.authorize(req, operation);
      next();
    } catch (err) {
      next(err);
    }
  };
};

// Reinstall detection probe (always permitted)
router.get('/reinstall-status', recoveryController.detectReinstallState);

// Recovery candidate discovery & inspection (available during pre-READY or post-READY admin)
router.get('/candidates', bootstrapOrAdmin('DISCOVER_RECOVERY_CANDIDATES'), recoveryController.discoverCandidates);
router.post('/discover', bootstrapOrAdmin('DISCOVER_RECOVERY_CANDIDATES'), recoveryController.discoverCandidates);
router.post('/inspect', bootstrapOrAdmin('INSPECT_RECOVERY_CANDIDATE'), recoveryController.inspectCandidate);
router.post('/validate', bootstrapOrAdmin('VALIDATE_RECOVERY_CANDIDATE'), recoveryController.validateCandidate);

// Staged restore preparation & execution
router.post('/prepare', bootstrapOrAdmin('PREPARE_RESTORE'), recoveryController.prepareRestore);
router.post('/restore', bootstrapOrAdmin('CONFIRM_RESTORE'), recoveryController.confirmRestore);

// Fresh installation initialization
router.post('/fresh-install', bootstrapOrAdmin('INITIALIZE_APPLICATION'), recoveryController.startFreshInstallation);

export default router;
