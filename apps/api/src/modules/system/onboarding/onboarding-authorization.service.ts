import { Request } from 'express';
import { installationService } from '../installation.service';
import { systemPrisma } from '../../../infrastructure/database/prisma';
import { authService } from '../../auth/auth.service';
import { AuthenticationError, AuthorizationError } from '../../../errors';

export type OnboardingOperation =
  | 'READ_ONBOARDING_STATUS'
  | 'INITIALIZE_APPLICATION'
  | 'REGISTER_DEVICE'
  | 'BIND_DEVICE'
  | 'SETUP_PIN'
  | 'VERIFY_PIN'
  | 'DISCOVER_USERS'
  | 'SELECT_USER'
  | 'CREATE_USER'
  | 'DISCOVER_DATABASES'
  | 'INSPECT_DATABASE'
  | 'ATTACH_DATABASE'
  | 'CREATE_DATABASE'
  | 'RESET_ONBOARDING_STEP'
  | 'COMPLETE_ONBOARDING'
  | 'DISCOVER_RECOVERY_CANDIDATES'
  | 'INSPECT_RECOVERY_CANDIDATE'
  | 'VALIDATE_RECOVERY_CANDIDATE'
  | 'PREPARE_RESTORE'
  | 'CONFIRM_RESTORE'
  | 'CONTINUE_INSTALLATION'
  | 'CREATE_BACKUP'
  | 'LIST_BACKUPS'
  | 'EXPORT_DATA'
  | 'UNINSTALL_PREFLIGHT';

/**
 * State-based operation authorization matrix for bootstrap phases (Pre-READY).
 * Enforces that onboarding steps cannot be bypassed or invoked out-of-order.
 */
const PRE_READY_OPERATIONS: Record<string, Set<OnboardingOperation>> = {
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
    'REGISTER_DEVICE',
    'BIND_DEVICE',
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
    'REGISTER_DEVICE',
    'BIND_DEVICE',
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
    'DISCOVER_USERS',
    'DISCOVER_DATABASES',
    'INSPECT_DATABASE',
    'RESET_ONBOARDING_STEP',
  ]),
  DATABASE_VALIDATION: new Set([
    'READ_ONBOARDING_STATUS',
    'DISCOVER_DATABASES',
    'INSPECT_DATABASE',
    'ATTACH_DATABASE',
    'CREATE_DATABASE',
    'RESET_ONBOARDING_STEP',
  ]),
  DATABASE_SETUP: new Set([
    'READ_ONBOARDING_STATUS',
    'DISCOVER_DATABASES',
    'INSPECT_DATABASE',
    'ATTACH_DATABASE',
    'CREATE_DATABASE',
    'COMPLETE_ONBOARDING',
    'RESET_ONBOARDING_STEP',
  ]),
};

export class OnboardingAuthorizationService {
  /**
   * Centralized bootstrap and production security policy enforcement.
   * Considers installation state, device status, session validity, user role, and operation.
   */
  async authorize(req: Request, operation: OnboardingOperation): Promise<void> {
    const install = await installationService.getOrCreateInstallation();
    const localDeviceId = installationService.getOrGenerateDeviceId();

    // 1. Device identity & revocation check
    const device = await systemPrisma.device.findUnique({
      where: { deviceId: localDeviceId },
    });

    if (device && device.status === 'REVOKED' && operation !== 'READ_ONBOARDING_STATUS') {
      throw new AuthorizationError(
        `Local device (${localDeviceId}) is REVOKED and cannot perform onboarding operation: ${operation}`
      );
    }

    // 2. Read operations are always permitted
    if (operation === 'READ_ONBOARDING_STATUS') {
      return;
    }

    // 3. Post-READY Security Boundary:
    // When installation is READY, all mutations strictly require an authenticated administrative session.
    if (install.lifecycleState === 'READY') {
      let user = (req as any).user;
      if (!user && req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.substring(7);
        const payload = authService.verifyToken(token);
        if (payload) {
          user = payload;
        }
      }

      if (!user) {
        throw new AuthenticationError(
          'Authentication required. Installation is initialized in READY state.'
        );
      }

      // Explicit role-based check: user must be an active administrator
      const targetUserId = user.userId || user.id;
      if (!targetUserId) {
        throw new AuthenticationError('Invalid authentication token: missing user identifier.');
      }

      const dbUser = await systemPrisma.user.findUnique({
        where: { id: targetUserId },
      });

      if (!dbUser || !dbUser.isActive || dbUser.deletedAt) {
        throw new AuthorizationError('Authenticated user account is inactive or not found.');
      }

      if (dbUser.role !== 'ADMIN') {
        throw new AuthorizationError(
          `Operation ${operation} requires ADMIN role once installation is in READY state.`
        );
      }

      return;
    }

    // 4. Pre-READY Bootstrap Matrix:
    // Enforces step-by-step authorization based on the authoritative lifecycle state machine.
    const allowed = PRE_READY_OPERATIONS[install.lifecycleState];
    if (!allowed || !allowed.has(operation)) {
      throw new AuthorizationError(
        `Operation ${operation} is forbidden at lifecycle state ${install.lifecycleState}. Complete required prerequisite steps first.`
      );
    }
  }
}

export const onboardingAuthorizationService = new OnboardingAuthorizationService();
