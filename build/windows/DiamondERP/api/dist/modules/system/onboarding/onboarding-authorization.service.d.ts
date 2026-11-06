import { Request } from 'express';
export type OnboardingOperation = 'READ_ONBOARDING_STATUS' | 'INITIALIZE_APPLICATION' | 'REGISTER_DEVICE' | 'BIND_DEVICE' | 'SETUP_PIN' | 'VERIFY_PIN' | 'DISCOVER_USERS' | 'SELECT_USER' | 'CREATE_USER' | 'DISCOVER_DATABASES' | 'INSPECT_DATABASE' | 'ATTACH_DATABASE' | 'CREATE_DATABASE' | 'COMPLETE_DATABASE_SETUP' | 'RESET_ONBOARDING_STEP' | 'COMPLETE_ONBOARDING' | 'DISCOVER_RECOVERY_CANDIDATES' | 'INSPECT_RECOVERY_CANDIDATE' | 'VALIDATE_RECOVERY_CANDIDATE' | 'PREPARE_RESTORE' | 'CONFIRM_RESTORE' | 'CONTINUE_INSTALLATION' | 'CREATE_BACKUP' | 'LIST_BACKUPS' | 'EXPORT_DATA' | 'UNINSTALL_PREFLIGHT';
export declare class OnboardingAuthorizationService {
    /**
     * Centralized bootstrap and production security policy enforcement.
     * Considers installation state, device status, session validity, user role, and operation.
     */
    authorize(req: Request, operation: OnboardingOperation): Promise<void>;
}
export declare const onboardingAuthorizationService: OnboardingAuthorizationService;
//# sourceMappingURL=onboarding-authorization.service.d.ts.map