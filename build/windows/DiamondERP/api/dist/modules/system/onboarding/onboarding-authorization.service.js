"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingAuthorizationService = exports.OnboardingAuthorizationService = void 0;
const installation_service_1 = require("../installation.service");
const prisma_1 = require("../../../infrastructure/database/prisma");
const auth_service_1 = require("../../auth/auth.service");
const errors_1 = require("../../../errors");
/**
 * State-based operation authorization matrix for bootstrap phases (Pre-READY).
 * Enforces that onboarding steps cannot be bypassed or invoked out-of-order.
 */
const PRE_READY_OPERATIONS = {
    NOT_INITIALIZED: new Set([
        'READ_ONBOARDING_STATUS',
        'INITIALIZE_APPLICATION',
        'DISCOVER_RECOVERY_CANDIDATES',
        'INSPECT_RECOVERY_CANDIDATE',
        'VALIDATE_RECOVERY_CANDIDATE',
    ]),
    APP_SETUP: new Set([
        'READ_ONBOARDING_STATUS',
        'INITIALIZE_APPLICATION',
        'SETUP_PIN',
        'DISCOVER_RECOVERY_CANDIDATES',
        'INSPECT_RECOVERY_CANDIDATE',
        'VALIDATE_RECOVERY_CANDIDATE',
        'PREPARE_RESTORE',
        'CONFIRM_RESTORE',
        'CONTINUE_INSTALLATION',
    ]),
    PIN_SETUP: new Set([
        'READ_ONBOARDING_STATUS',
        'SETUP_PIN',
        'VERIFY_PIN',
    ]),
    DEVICE_SETUP: new Set([
        'READ_ONBOARDING_STATUS',
        'REGISTER_DEVICE',
        'BIND_DEVICE',
        'VERIFY_PIN',
    ]),
    USER_DISCOVERY: new Set([
        'READ_ONBOARDING_STATUS',
        'DISCOVER_USERS',
        'SELECT_USER',
        'CREATE_USER',
        'RESET_ONBOARDING_STEP',
    ]),
    DATABASE_DISCOVERY: new Set([
        'READ_ONBOARDING_STATUS',
        'DISCOVER_DATABASES',
        'INSPECT_DATABASE',
        'ATTACH_DATABASE',
        'CREATE_DATABASE',
        'RESET_ONBOARDING_STEP',
    ]),
    DATABASE_VALIDATION: new Set([
        'READ_ONBOARDING_STATUS',
        'DISCOVER_DATABASES',
        'INSPECT_DATABASE',
        'ATTACH_DATABASE',
        'CREATE_DATABASE',
        'COMPLETE_DATABASE_SETUP',
        'RESET_ONBOARDING_STEP',
    ]),
    DATABASE_SETUP: new Set([
        'READ_ONBOARDING_STATUS',
        'DISCOVER_DATABASES',
        'INSPECT_DATABASE',
        'ATTACH_DATABASE',
        'CREATE_DATABASE',
        'COMPLETE_DATABASE_SETUP',
        'COMPLETE_ONBOARDING',
        'RESET_ONBOARDING_STEP',
    ]),
};
class OnboardingAuthorizationService {
    /**
     * Centralized bootstrap and production security policy enforcement.
     * Considers installation state, device status, session validity, user role, and operation.
     */
    async authorize(req, operation) {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        const localDeviceId = installation_service_1.installationService.getOrGenerateDeviceId();
        // 1. Device identity & revocation check
        const device = await prisma_1.systemPrisma.device.findUnique({
            where: { deviceId: localDeviceId },
        });
        if (device && device.status === 'REVOKED' && operation !== 'READ_ONBOARDING_STATUS') {
            throw new errors_1.AuthorizationError(`Local device (${localDeviceId}) is REVOKED and cannot perform onboarding operation: ${operation}`);
        }
        // 2. Read operations are always permitted
        if (operation === 'READ_ONBOARDING_STATUS') {
            return;
        }
        // 3. Post-READY Security Boundary:
        // When installation is READY, all mutations strictly require an authenticated administrative session.
        if (install.lifecycleState === 'READY') {
            let user = req.user;
            if (!user && req.headers?.authorization?.startsWith('Bearer ')) {
                const token = req.headers.authorization.substring(7);
                const payload = auth_service_1.authService.verifyToken(token);
                if (payload) {
                    user = payload;
                }
            }
            if (!user) {
                throw new errors_1.AuthenticationError('Authentication required. Installation is initialized in READY state.');
            }
            // Post-READY operations require an active authenticated user
            const targetUserId = user.userId || user.id;
            if (!targetUserId) {
                throw new errors_1.AuthenticationError('Invalid authentication token: missing user identifier.');
            }
            const dbUser = await prisma_1.systemPrisma.user.findUnique({
                where: { id: targetUserId },
            });
            if (!dbUser || !dbUser.isActive || dbUser.deletedAt) {
                throw new errors_1.AuthorizationError('Authenticated user account is inactive or not found.');
            }
            if (dbUser.role !== 'ADMIN' && dbUser.role !== 'SUPER_ADMIN') {
                throw new errors_1.AuthorizationError('Operation requires ADMIN role.');
            }
            return;
        }
        // 4. Pre-READY Bootstrap Matrix:
        // Enforces step-by-step authorization based on the authoritative lifecycle state machine.
        const allowed = PRE_READY_OPERATIONS[install.lifecycleState];
        if (!allowed || !allowed.has(operation)) {
            throw new errors_1.AuthorizationError(`Operation ${operation} is forbidden at lifecycle state ${install.lifecycleState}. Complete required prerequisite steps first.`);
        }
    }
}
exports.OnboardingAuthorizationService = OnboardingAuthorizationService;
exports.onboardingAuthorizationService = new OnboardingAuthorizationService();
//# sourceMappingURL=onboarding-authorization.service.js.map