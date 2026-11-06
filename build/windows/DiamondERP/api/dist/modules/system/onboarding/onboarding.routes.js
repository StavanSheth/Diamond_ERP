"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const onboarding_controller_1 = require("./onboarding.controller");
const router = (0, express_1.Router)();
// Onboarding status & initialization
router.get('/', onboarding_controller_1.onboardingController.getOnboardingStatus);
router.get('/status', onboarding_controller_1.onboardingController.getOnboardingStatus);
router.post('/app-setup', onboarding_controller_1.onboardingController.initializeApp);
// PIN setup & Device registration
router.post('/pin', onboarding_controller_1.onboardingController.setupPin);
router.post('/device', onboarding_controller_1.onboardingController.registerDevice);
// User discovery & selection/creation
router.get('/users', onboarding_controller_1.onboardingController.discoverUsers);
router.post('/users/select', onboarding_controller_1.onboardingController.selectUser);
router.post('/users/create', onboarding_controller_1.onboardingController.createUser);
router.post('/users/new', onboarding_controller_1.onboardingController.createUser);
// Database discovery, inspection, attachment, and creation
router.get('/databases', onboarding_controller_1.onboardingController.discoverDatabases);
router.post('/databases/inspect', onboarding_controller_1.onboardingController.inspectDatabase);
router.post('/databases/validate', onboarding_controller_1.onboardingController.inspectDatabase);
router.post('/databases/attach', onboarding_controller_1.onboardingController.attachDatabase);
router.post('/databases/select', onboarding_controller_1.onboardingController.attachDatabase);
router.post('/databases/create', onboarding_controller_1.onboardingController.createDatabase);
router.post('/database-setup', onboarding_controller_1.onboardingController.completeDatabaseSetup);
// Onboarding completion & recovery
router.post('/complete', onboarding_controller_1.onboardingController.completeOnboarding);
router.post('/reset-step', onboarding_controller_1.onboardingController.resetRecoverableStep);
exports.default = router;
//# sourceMappingURL=onboarding.routes.js.map