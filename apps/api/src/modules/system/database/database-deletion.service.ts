import fs from 'fs';
import path from 'path';
import { systemPrisma, removeConfiguredProfile } from '../../../infrastructure/database/prisma';
import { databaseContextService } from '../../../infrastructure/database/database-context.service';
import { backupService } from '../backup/backup.service';
import { logger } from '../../../infrastructure/logging';
import { getControlDbPath, getDatabaseTemplatePath } from '../../../infrastructure/paths';
import { ValidationError, NotFoundError, ConflictError } from '../../../errors';

export interface DeleteDatabaseResult {
  success: boolean;
  profileCode: string;
  databaseDeleted: boolean;
  backupId?: string;
  backupPath?: string;
  deletedFiles: string[];
  message: string;
}

export class DatabaseDeletionService {
  private deletionLocks = new Set<string>();

  /**
   * Authoritative, unified physical database deletion safety gate (Phase 4 / Section 3).
   *
   * Enforces:
   * 1. Resolution of exact DB from DatabaseRegistry (no guessing or bypassing)
   * 2. Validation of ownership & guards against system.db, template.db, and stavan.db
   * 3. Verified PROFILE_DELETE backup BEFORE any destructive action
   * 4. Complete backup verification required — aborts on any failure
   * 5. Closing active database handles
   * 6. Physical deletion of .db, -wal, -shm files
   * 7. Verification that files no longer exist on disk
   * 8. DatabaseRegistry removal or update to ORPHANED
   */
  async deletePhysicalDatabaseSafely(options: {
    profileCode?: string;
    profileIdOrCode?: string;
    deleteDatabaseFile?: boolean;
    deleteMode?: 'DELETE_DATABASE' | 'RETAIN_DATABASE';
    reason?: string;
    performedBy?: string;
  }): Promise<DeleteDatabaseResult> {
    const rawCode = options.profileCode || options.profileIdOrCode || '';
    if (!rawCode) {
      throw new ValidationError('profileCode or profileIdOrCode is required for physical database deletion.');
    }
    const cleanCode = rawCode.trim();
    const deleteDatabaseFile = options.deleteDatabaseFile ?? (options.deleteMode === 'DELETE_DATABASE');
    const performedBy = options.performedBy || 'system';

    if (cleanCode.toLowerCase() === 'stavan') {
      throw new ValidationError('The primary profile "Stavan" cannot be deleted.');
    }

    const forbiddenProfiles = new Set(['system', 'template', 'test']);
    if (forbiddenProfiles.has(cleanCode.toLowerCase())) {
      throw new ValidationError(`Cannot delete reserved profile "${cleanCode}".`);
    }

    if (this.deletionLocks.has(cleanCode.toLowerCase())) {
      throw new ConflictError(`A deletion operation is already in progress for profile "${cleanCode}".`);
    }

    this.deletionLocks.add(cleanCode.toLowerCase());

    try {
      // 1. Resolve Profile record in system.db
      const profile = await systemPrisma.profile.findFirst({
        where: { code: { equals: cleanCode } },
        include: { databaseRegistries: true, userProfiles: true },
      });

      if (!profile) {
        throw new NotFoundError(`Profile "${cleanCode}" not found.`);
      }

      // 2. Resolve database context strictly via DatabaseContextService
      let canonicalDbFile: string | null = null;
      let registryRecord: any = null;

      try {
        const dbContext = await databaseContextService.getDatabaseForProfile(profile.id);
        canonicalDbFile = dbContext.canonicalPath;
        registryRecord = profile.databaseRegistries.find(
          (r) => r.id === dbContext.databaseId || r.canonicalPath === dbContext.canonicalPath
        );
      } catch (ctxErr) {
        if (deleteDatabaseFile) {
          throw new ConflictError(
            `Cannot physically delete database for profile "${cleanCode}": Authoritative database context could not be verified (${(ctxErr as Error).message}). Physical deletion aborted.`
          );
        }
      }

      if (deleteDatabaseFile && (!canonicalDbFile || !registryRecord)) {
        throw new ConflictError(
          `Cannot physically delete database for profile "${cleanCode}": Active authoritative registry was not found. Physical deletion aborted.`
        );
      }

      const deletedFiles: string[] = [];
      let backupId: string | undefined;
      let backupPath: string | undefined;

      if (deleteDatabaseFile && canonicalDbFile && fs.existsSync(canonicalDbFile)) {
        const lowerPath = canonicalDbFile.toLowerCase();
        const controlDb = path.resolve(getControlDbPath()).toLowerCase();
        const templateDb = getDatabaseTemplatePath() ? path.resolve(getDatabaseTemplatePath()!).toLowerCase() : '';
        const baseName = path.basename(canonicalDbFile).toLowerCase();

        // Safety guards
        if (lowerPath === controlDb || baseName === 'system.db') {
          throw new ConflictError('Cannot delete system control database (system.db).');
        }
        if (templateDb && (lowerPath === templateDb || baseName === 'template.db')) {
          throw new ConflictError('Cannot delete database template (template.db).');
        }
        if (baseName === 'stavan.db') {
          throw new ConflictError('Cannot physically delete the primary Stavan.db database file.');
        }

        // STEP 1: SAFETY GATE — Verified PROFILE_DELETE backup
        logger.info(`[DatabaseDeletionService] Creating mandatory PROFILE_DELETE backup for "${canonicalDbFile}"`);
        const backupRecord = await backupService.createBackup({
          databasePath: canonicalDbFile,
          backupType: 'PROFILE_DELETE',
        }, performedBy);

        if (!backupRecord || backupRecord.status !== 'VERIFIED') {
          throw new Error(
            `Safety Gate Failure: PROFILE_DELETE backup was not verified for ${canonicalDbFile}. Deletion ABORTED.`
          );
        }

        backupId = backupRecord.backupId;
        backupPath = backupRecord.backupPath;
        logger.info(`[DatabaseDeletionService] Safety backup verified: ${backupId}`);

        // STEP 2: Evict in-memory Prisma client
        removeConfiguredProfile(cleanCode);

        // STEP 3: Delete physical files (.db, -wal, -shm)
        try {
          fs.unlinkSync(canonicalDbFile);
          deletedFiles.push(canonicalDbFile);

          const walPath = `${canonicalDbFile}-wal`;
          if (fs.existsSync(walPath)) {
            fs.unlinkSync(walPath);
            deletedFiles.push(walPath);
          }

          const shmPath = `${canonicalDbFile}-shm`;
          if (fs.existsSync(shmPath)) {
            fs.unlinkSync(shmPath);
            deletedFiles.push(shmPath);
          }
        } catch (delErr: any) {
          throw new Error(`Safety backup succeeded (${backupId}), but physical file deletion failed: ${delErr.message}`);
        }

        // STEP 4: Verify deletion
        if (fs.existsSync(canonicalDbFile)) {
          throw new Error(`Physical deletion verification failed: ${canonicalDbFile} still exists on disk.`);
        }

        // STEP 5: Delete DatabaseRegistry entry
        if (registryRecord) {
          await systemPrisma.databaseRegistry.delete({
            where: { id: registryRecord.id },
          }).catch(() => {});
        }
      } else if (!deleteDatabaseFile && registryRecord) {
        // Case A: Retain DB — explicitly mark ORPHANED / RECOVERABLE
        logger.info(`[DatabaseDeletionService] Profile "${cleanCode}" deleted, physical DB retained as ORPHANED: ${registryRecord.canonicalPath}`);
        await systemPrisma.databaseRegistry.update({
          where: { id: registryRecord.id },
          data: {
            status: 'ORPHANED',
            profileId: null,
          },
        }).catch(() => {});
        removeConfiguredProfile(cleanCode);
      } else {
        removeConfiguredProfile(cleanCode);
      }

      // Cleanup user profile associations and profile record
      await systemPrisma.userProfile.deleteMany({
        where: { profileId: profile.id },
      }).catch(() => {});

      await systemPrisma.profile.delete({
        where: { id: profile.id },
      }).catch(() => {});

      // Record audit event
      await systemPrisma.auditEvent.create({
        data: {
          entityType: 'PROFILE',
          entityId: profile.id,
          eventType: 'PROFILE_DELETED',
          description: `Profile "${cleanCode}" deleted. Physical database ${deleteDatabaseFile ? 'deleted with verified backup' : 'retained as orphaned'}.`,
          performedBy,
          metadata: JSON.stringify({
            profileCode: cleanCode,
            databaseDeleted: deleteDatabaseFile,
            backupId,
            deletedFiles,
          }),
        },
      }).catch(() => {});

      return {
        success: true,
        profileCode: cleanCode,
        databaseDeleted: deleteDatabaseFile,
        backupId,
        backupPath,
        deletedFiles,
        message: deleteDatabaseFile
          ? `Profile "${cleanCode}" and physical database safely deleted with verified backup.`
          : `Profile "${cleanCode}" removed, physical database preserved.`,
      };
    } finally {
      this.deletionLocks.delete(cleanCode.toLowerCase());
    }
  }
}

export const databaseDeletionService = new DatabaseDeletionService();
