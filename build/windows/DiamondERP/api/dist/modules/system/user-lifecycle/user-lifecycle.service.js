"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userLifecycleService = exports.UserLifecycleService = void 0;
const prisma_1 = require("../../../infrastructure/database/prisma");
const errors_1 = require("../../../errors");
const logging_1 = require("../../../infrastructure/logging");
class UserLifecycleService {
    /**
     * Deactivates a user account while strictly preserving the associated database and registry.
     */
    async deactivateUser(userId, performedBy = 'system') {
        const user = await prisma_1.systemPrisma.user.findUnique({
            where: { id: userId },
            include: {
                userProfiles: {
                    include: {
                        profile: {
                            include: { databaseRegistries: true },
                        },
                    },
                },
            },
        });
        if (!user) {
            throw new errors_1.NotFoundError(`User with ID ${userId} not found.`);
        }
        if (user.username?.toLowerCase() === 'stavan') {
            throw new errors_1.ValidationError('The primary administrator "stavan" cannot be deactivated.');
        }
        const now = new Date();
        await prisma_1.systemPrisma.$transaction(async (tx) => {
            // 1. Mark user inactive
            await tx.user.update({
                where: { id: userId },
                data: { isActive: false },
            });
            // 2. Mark user profiles inactive
            await tx.userProfile.updateMany({
                where: { userId },
                data: { isActive: false },
            });
            // 4. Revoke active sessions
            await tx.session.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: now },
            });
            // 5. Create audit event
            await tx.auditEvent.create({
                data: {
                    entityType: 'USER',
                    entityId: userId,
                    eventType: 'USER_DEACTIVATED',
                    description: `User "${user.username}" deactivated. Associated database files and registries preserved.`,
                    performedBy,
                    metadata: JSON.stringify({
                        userId,
                        username: user.username,
                        profilesPreserved: user.userProfiles.map((up) => up.profile?.code).filter(Boolean),
                    }),
                },
            });
        });
        logging_1.logger.info(`[UserLifecycleService] User ${user.username} (${userId}) deactivated successfully. Database preserved.`);
        return {
            success: true,
            databasePreserved: true,
            message: `User "${user.username}" deactivated successfully. Associated databases and registries preserved.`,
        };
    }
    /**
     * Soft-deletes a user account (deletedAt != null, isActive = false) while strictly preserving
     * the associated database, profile, and registry for ownership traceability and recovery.
     */
    async deleteUser(userId, performedBy = 'system') {
        const user = await prisma_1.systemPrisma.user.findUnique({
            where: { id: userId },
            include: {
                userProfiles: {
                    include: {
                        profile: {
                            include: { databaseRegistries: true },
                        },
                    },
                },
            },
        });
        if (!user) {
            throw new errors_1.NotFoundError(`User with ID ${userId} not found.`);
        }
        if (user.username?.toLowerCase() === 'stavan') {
            throw new errors_1.ValidationError('The primary administrator "stavan" cannot be deleted.');
        }
        const now = new Date();
        await prisma_1.systemPrisma.$transaction(async (tx) => {
            // 1. Soft-delete user account (retaining metadata for ownership recovery)
            await tx.user.update({
                where: { id: userId },
                data: {
                    isActive: false,
                    deletedAt: now,
                },
            });
            // 2. Mark user profiles inactive
            await tx.userProfile.updateMany({
                where: { userId },
                data: { isActive: false },
            });
            // 3. Detach or mark installation user associations
            await tx.installationUser.deleteMany({
                where: { userId },
            });
            // 4. Revoke all active sessions
            await tx.session.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: now },
            });
            // 5. Update profile description with ownership traceability
            for (const up of user.userProfiles) {
                if (up.profile) {
                    await tx.profile.update({
                        where: { id: up.profile.id },
                        data: {
                            description: `Previously owned by: ${user.username} (${user.displayName || user.username}) [deleted at ${now.toISOString()}]`,
                        },
                    }).catch(() => { });
                }
            }
            // 6. Explicitly record audit event
            await tx.auditEvent.create({
                data: {
                    entityType: 'USER',
                    entityId: userId,
                    eventType: 'USER_DELETED',
                    description: `User "${user.username}" soft-deleted. Database files and registries strictly preserved for recovery.`,
                    performedBy,
                    metadata: JSON.stringify({
                        userId,
                        username: user.username,
                        displayName: user.displayName || user.username,
                        deletedAt: now.toISOString(),
                        profileIds: user.userProfiles.map((up) => up.profileId),
                        profileCodes: user.userProfiles.map((up) => up.profile?.code).filter(Boolean),
                        preservedRegistries: user.userProfiles.flatMap((up) => (up.profile?.databaseRegistries || []).map((r) => r.canonicalPath)),
                    }),
                },
            });
        });
        logging_1.logger.info(`[UserLifecycleService] User ${user.username} (${userId}) deleted (soft-delete). Customer database files preserved.`);
        return {
            success: true,
            databasePreserved: true,
            message: `User "${user.username}" deleted successfully. Database files preserved and remain discoverable for recovery.`,
        };
    }
}
exports.UserLifecycleService = UserLifecycleService;
exports.userLifecycleService = new UserLifecycleService();
//# sourceMappingURL=user-lifecycle.service.js.map