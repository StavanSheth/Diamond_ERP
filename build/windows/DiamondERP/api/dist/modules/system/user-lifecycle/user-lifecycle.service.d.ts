export declare class UserLifecycleService {
    /**
     * Deactivates a user account while strictly preserving the associated database and registry.
     */
    deactivateUser(userId: string, performedBy?: string): Promise<{
        success: boolean;
        message: string;
        databasePreserved: boolean;
    }>;
    /**
     * Soft-deletes a user account (deletedAt != null, isActive = false) while strictly preserving
     * the associated database, profile, and registry for ownership traceability and recovery.
     */
    deleteUser(userId: string, performedBy?: string): Promise<{
        success: boolean;
        message: string;
        databasePreserved: boolean;
    }>;
}
export declare const userLifecycleService: UserLifecycleService;
//# sourceMappingURL=user-lifecycle.service.d.ts.map