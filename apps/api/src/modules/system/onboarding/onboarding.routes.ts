import { Router } from 'express';
import { onboardingController } from './onboarding.controller';

const router = Router();

// Onboarding status & initialization
router.get('/', onboardingController.getOnboardingStatus);
router.post('/app-setup', onboardingController.initializeApp);

// User discovery & selection/creation
router.get('/users', onboardingController.discoverUsers);
router.post('/users/select', onboardingController.selectUser);
router.post('/users/create', onboardingController.createUser);

// Database discovery, inspection, attachment, and creation
router.get('/databases', onboardingController.discoverDatabases);
router.post('/databases/inspect', onboardingController.inspectDatabase);
router.post('/databases/attach', onboardingController.attachDatabase);
router.post('/databases/create', onboardingController.createDatabase);

// Onboarding completion & recovery
router.post('/complete', onboardingController.completeOnboarding);
router.post('/reset-step', onboardingController.resetRecoverableStep);

export default router;
