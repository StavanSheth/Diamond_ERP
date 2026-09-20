import { systemPrisma } from '../../../infrastructure/database/prisma';
import { ValidationError, NotFoundError } from '../../../errors';
import { logger } from '../../../infrastructure/logging';

export class UserLifecycleService {
  /**
   * Deactivates a user account while strictly preserving the associated database and registry.
   */
  async deactivateUser(userId: string, performedBy: string = 'system'): Promise<{ success: boolean; message: string; databasePreserved: boolean }> {
    const user = await systemPrisma.user.findUnique({
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
      throw new NotFoundError(`User with ID ${userId} not found.`);
    }

    if (user.username?.toLowerCase() === 'stavan') {
      throw new ValidationError('The primary administrator "stavan" cannot be deactivated.');
    }

    const now = new Date();

    await systemPrisma.$transaction(async (tx) => {
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

    logger.info(`[UserLifecycleService] User ${user.username} (${userId}) deactivated successfully. Database preserved.`);

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
  async deleteUser(userId: string, performedBy: string = 'system'): Promise<{ success: boolean; message: string; databasePreserved: boolean }> {
    const user = await systemPrisma.user.findUnique({
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
      throw new NotFoundError(`User with ID ${userId} not found.`);
    }

    if (user.username?.toLowerCase() === 'stavan') {
      throw new ValidationError('The primary administrator "stavan" cannot be deleted.');
    }

    const now = new Date();

    await systemPrisma.$transaction(async (tx) => {
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

      // 5. Explicitly record audit event
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
            deletedAt: now.toISOString(),
            preservedRegistries: user.userProfiles.flatMap((up) =>
              (up.profile?.databaseRegistries || []).map((r) => r.canonicalPath)
            ),
          }),
        },
      });
    });

    logger.info(`[UserLifecycleService] User ${user.username} (${userId}) deleted (soft-delete). Customer database files preserved.`);

    return {
      success: true,
      databasePreserved: true,
      message: `User "${user.username}" deleted successfully. Database files preserved and remain discoverable for recovery.`,
    };
  }
}

export const userLifecycleService = new UserLifecycleService();
