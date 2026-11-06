"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const recovery_controller_1 = require("./recovery.controller");
const onboarding_authorization_service_1 = require("../onboarding/onboarding-authorization.service");
const router = (0, express_1.Router)();
// Middleware for operations available in bootstrap (Pre-READY) or authenticated admin (Post-READY)
const bootstrapOrAdmin = (operation) => {
    return async (req, _res, next) => {
        try {
            await onboarding_authorization_service_1.onboardingAuthorizationService.authorize(req, operation);
            next();
        }
        catch (err) {
            next(err);
        }
    };
};
// Reinstall detection probe (always permitted)
router.get('/reinstall-status', recovery_controller_1.recoveryController.detectReinstallState);
// Recovery candidate discovery & inspection (available during pre-READY or post-READY admin)
router.get('/candidates', bootstrapOrAdmin('DISCOVER_RECOVERY_CANDIDATES'), recovery_controller_1.recoveryController.discoverCandidates);
router.post('/discover', bootstrapOrAdmin('DISCOVER_RECOVERY_CANDIDATES'), recovery_controller_1.recoveryController.discoverCandidates);
router.post('/inspect', bootstrapOrAdmin('INSPECT_RECOVERY_CANDIDATE'), recovery_controller_1.recoveryController.inspectCandidate);
router.post('/validate', bootstrapOrAdmin('VALIDATE_RECOVERY_CANDIDATE'), recovery_controller_1.recoveryController.validateCandidate);
// Staged restore preparation & execution
router.post('/prepare', bootstrapOrAdmin('PREPARE_RESTORE'), recovery_controller_1.recoveryController.prepareRestore);
router.post('/restore', bootstrapOrAdmin('CONFIRM_RESTORE'), recovery_controller_1.recoveryController.confirmRestore);
// Fresh installation initialization & continue existing installation
router.post('/fresh-install', bootstrapOrAdmin('INITIALIZE_APPLICATION'), recovery_controller_1.recoveryController.startFreshInstallation);
router.post('/continue', bootstrapOrAdmin('INITIALIZE_APPLICATION'), recovery_controller_1.recoveryController.continueExistingInstallation);
// Interrupted operation reconciliation
router.post('/reconcile', bootstrapOrAdmin('INITIALIZE_APPLICATION'), recovery_controller_1.recoveryController.reconcileInterruptedRestores);
exports.default = router;
//# sourceMappingURL=recovery.routes.js.map