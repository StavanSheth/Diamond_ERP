import { Router } from 'express';
import { onboardingController } from './onboarding.controller';

const router = Router();

// Onboarding status & initialization
router.get('/', onboardingController.getOnboardingStatus);
router.get('/status', onboardingController.getOnboardingStatus);
router.post('/app-setup', onboardingController.initializeApp);

// PIN setup & Device registration
router.post('/pin', onboardingController.setupPin);
router.post('/device', onboardingController.registerDevice);

// User discovery & selection/creation
router.get('/users', onboardingController.discoverUsers);
router.post('/users/select', onboardingController.selectUser);
router.post('/users/create', onboardingController.createUser);
router.post('/users/new', onboardingController.createUser);

// Database discovery, inspection, attachment, and creation
router.get('/databases', onboardingController.discoverDatabases);
router.post('/databases/inspect', onboardingController.inspectDatabase);
router.post('/databases/validate', onboardingController.inspectDatabase);
router.post('/databases/attach', onboardingController.attachDatabase);
router.post('/databases/select', onboardingController.attachDatabase);
router.post('/databases/create', onboardingController.createDatabase);
router.post('/database-setup', onboardingController.completeDatabaseSetup);

// Onboarding completion & recovery
router.post('/complete', onboardingController.completeOnboarding);
router.post('/reset-step', onboardingController.resetRecoverableStep);

export default router;

