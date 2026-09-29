import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import prisma, { systemPrisma, getAllProfiles, getActiveProfileOrDefault, FORBIDDEN_PROFILE_NAMES, updateProfileDbPath } from '../../infrastructure/database/prisma';
import { ValidationError, NotFoundError } from '../../errors';
import { getDatabasesDir } from '../../infrastructure/paths';
import { userLifecycleService } from '../system/user-lifecycle/user-lifecycle.service';
import { backupService } from '../system/backup/backup.service';
import { databaseProvisioningService } from '../system/database/database-provisioning.service';
import { databaseContextService } from '../../infrastructure/database/database-context.service';
import { databaseHealthService } from '../system/database/database-health.service';
import { databaseRegistryService } from '../system/database/database-registry.service';
import { databaseDeletionService } from '../system/database/database-deletion.service';
import { dataLocationService } from '../../infrastructure/data';


export class SettingsController {

  getSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let rows: any[] = [];
      try {
        rows = await prisma.setting.findMany();
      } catch (err: any) {
        // Fallback gracefully if Setting table does not exist in current profile DB
        rows = [];
      }
      const settings: Record<string, string> = {};

      rows.forEach(r => {
        settings[r.key] = r.value;
      });

      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settingsToUpdate: Record<string, string> = req.body;
      if (!settingsToUpdate || typeof settingsToUpdate !== 'object' || Array.isArray(settingsToUpdate)) {
        throw new ValidationError('Settings payload must be a valid key-value object');
      }

      // Task 17: Settings Allowlist
      const ALLOWED_SETTINGS = [
        'COMPANY_NAME', 'COMPANY_ADDRESS', 'COMPANY_PHONE', 'COMPANY_EMAIL',
        'DEFAULT_CURRENCY', 'TAX_PERCENTAGE', 'DEFAULT_BROKERAGE',
        'FINANCIAL_YEAR_START', 'INVOICE_PREFIX', 'THEME_PREFERENCE',
        'CUSTOM_LOCATIONS'
      ];

      // 1. Validate ALL settings before performing any DB operations
      for (const [key, value] of Object.entries(settingsToUpdate)) {
        if (!ALLOWED_SETTINGS.includes(key)) {
          throw new ValidationError(`Setting key '${key}' is not allowed`);
        }
        if (typeof value !== 'string') {
          throw new ValidationError(`Setting value for '${key}' must be a string`);
        }
      }

      // 2. Perform atomic database transaction - all or nothing
      await prisma.$transaction(async (tx) => {
        for (const [key, value] of Object.entries(settingsToUpdate)) {
          await tx.setting.upsert({
            where: { key },
            update: { value },
            create: { key, value }
          });
        }
      });

      res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Normal user-facing XLSX export.
   * Delegates to ExportService — the same engine used by preservation/uninstall.
   * Arrangement is retained for future presentation-layer grouping (does not change data).
   */
  exportExcel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { exportService } = await import('../system/export/export.service');
      const profileCode = (req as any).profileCode
        || String(req.headers['x-profile-code'] || '');

      const exportResult = await exportService.exportBusinessData(
        {
          format: 'XLSX',
          ...(profileCode ? { profileCode } : {}),
        },
        (req as any).user?.id || 'user'
      );

      if (!exportResult.filePath) {
        res.status(500).json({ success: false, message: 'Export generated no XLSX output.' });
        return;
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="diamond_inventory_export.xlsx"');
      const readStream = fs.createReadStream(exportResult.filePath);
      readStream.pipe(res);
      readStream.on('error', (err: Error) => next(err));
    } catch (error) {
      next(error);
    }
  };


  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { exportService } = await import('../system/export/export.service');
      const profileCode = (req as any).profileCode
        || String(req.headers['x-profile-code'] || '');

      const exportResult = await exportService.exportBusinessData(
        {
          format: 'CSV',
          ...(profileCode ? { profileCode } : {}),
        },
        (req as any).user?.id || 'user'
      );

      res.json({ success: true, data: exportResult });
    } catch (error) {
      next(error);
    }
  };



  getProfiles = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profiles = getAllProfiles();
      const active = getActiveProfileOrDefault();

      res.json({ success: true, data: { profiles, active } });
    } catch (error) {
      next(error);
    }
  };

  createProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { profileName, displayName } = req.body;
      if (!profileName || typeof profileName !== 'string') {
        res.status(400).json({ success: false, message: 'Profile name is required' });
        return;
      }

      const cleanName = profileName.trim();
      if (!/^[a-zA-Z0-9_-]{1,50}$/.test(cleanName)) {
        res.status(400).json({
          success: false,
          message: 'Profile name must be 1-50 alphanumeric characters (hyphens and underscores allowed)'
        });
        return;
      }

      if (FORBIDDEN_PROFILE_NAMES.has(cleanName.toLowerCase())) {
        res.status(400).json({
          success: false,
          message: `Profile name "${cleanName}" is reserved for system use and cannot be registered as a business profile.`
        });
        return;
      }

      // Resolve requesting user
      let targetUser = (req as any).user;
      if (!targetUser?.id) {
        targetUser = await systemPrisma.user.findFirst({ where: { isActive: true } });
      }
      if (!targetUser) {
        throw new ValidationError('Cannot provision profile without an active system user.');
      }

      // Check if profile code already exists
      const existingProf = await systemPrisma.profile.findUnique({ where: { code: cleanName } });
      if (existingProf) {
        throw new ValidationError(`Profile "${cleanName}" already exists.`);
      }

      // Authoritative database provisioning via DatabaseProvisioningService
      const provisionResult = await databaseProvisioningService.provisionBlankDatabase({
        profileCode: cleanName,
        displayName: displayName || cleanName,
        userId: targetUser.id,
      });

      // Synchronize in-memory Prisma client pool
      const { registerProfile, getClientForProfileAsync } = require('../../infrastructure/database/prisma');
      registerProfile({
        code: cleanName,
        name: displayName || cleanName,
        dbPath: provisionResult.canonicalPath,
      });
      await getClientForProfileAsync(cleanName);

      // Create initial verified backup for the new database
      try {
        await backupService.createBackup({
          databasePath: provisionResult.canonicalPath,
          backupType: 'MANUAL',
        });
      } catch (bkpErr: any) {
        console.warn(`[SettingsController] Initial backup notice for ${cleanName}:`, bkpErr.message);
      }

      const allProfiles = getAllProfiles();
      res.json({
        success: true,
        message: `Profile "${cleanName}" created successfully`,
        data: { active: cleanName, profiles: allProfiles },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profileCode = String(req.params.profileCode);
      const deleteDatabase = req.query.deleteDatabase === 'true' || req.body?.deleteDatabase === true;
      const performedBy = (req as any).user?.username || (req as any).user?.displayName || 'admin';

      const result = await databaseDeletionService.deletePhysicalDatabaseSafely({
        profileCode,
        deleteDatabaseFile: deleteDatabase,
        performedBy,
      });

      res.json({
        success: true,
        message: result.message,
        deletedDatabases: result.deletedFiles,
        backupId: result.backupId,
      });
    } catch (error) {
      next(error);
    }
  };

  switchProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { profileName } = req.body;
      if (!profileName || typeof profileName !== 'string') {
        res.status(400).json({ success: false, message: 'Profile name is required' });
        return;
      }

      const cleanName = profileName.trim();
      if (!/^[a-zA-Z0-9_-]{1,50}$/.test(cleanName)) {
        res.status(400).json({
          success: false,
          message: 'Profile name must be 1-50 alphanumeric characters (hyphens and underscores allowed)'
        });
        return;
      }

      const { FORBIDDEN_PROFILE_NAMES, getClientForProfileAsync } = require('../../infrastructure/database/prisma');
      if (FORBIDDEN_PROFILE_NAMES.has(cleanName.toLowerCase())) {
        res.status(400).json({
          success: false,
          message: `Profile name "${cleanName}" is reserved for system use.`
        });
        return;
      }

      // Invariant: Profile must exist in system.db before switching
      const existingProfile = await systemPrisma.profile.findFirst({
        where: {
          OR: [
            { code: cleanName },
            { id: cleanName },
          ],
        },
      });

      if (!existingProfile) {
        res.status(404).json({
          success: false,
          message: `PROFILE_NOT_FOUND: Profile "${cleanName}" does not exist. Switching cannot create profiles.`,
        });
        return;
      }

      // Assert valid business database context (rejects template.db, system.db, missing DB, etc.)
      await databaseContextService.assertValidBusinessDatabaseContext(cleanName);
      await getClientForProfileAsync(cleanName);

      const allProfiles = getAllProfiles();
      res.json({
        success: true,
        message: `Verified profile: ${cleanName}`,
        data: { active: cleanName, profiles: allProfiles }
      });
    } catch (error) {
      next(error);
    }
  };

  factoryReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const confirmation = req.body.confirmation || req.body.confirm || req.body.confirmPassword;
      if (!confirmation || (confirmation !== 'DELETE' && typeof confirmation !== 'string')) {
        throw new ValidationError('Confirmation required. Send { confirmation: "DELETE" } to confirm this destructive operation.');
      }

      // If user is authenticated, create an audit event
      const authenticatedUser = (req as any).user;
      try {
        await prisma.auditEvent.create({
          data: {
            entityType: 'SYSTEM',
            entityId: 'factory-reset',
            eventType: 'FACTORY_RESET',
            description: `Factory reset initiated by ${authenticatedUser?.username || 'desktop-admin'}`,
            performedBy: authenticatedUser?.id || 'admin',
            ipAddress: req.ip || undefined,
          },
        });
      } catch { }

      // Wipe all database tables in proper dependency order
      await prisma.$transaction([
        prisma.transformationProvenance.deleteMany({}),
        prisma.itemTransformation.deleteMany({}),
        prisma.itemEvent.deleteMany({}),
        prisma.inventoryMovement.deleteMany({}),
        prisma.financialEntry.deleteMany({}),
        prisma.transactionItem.deleteMany({}),
        prisma.certification.deleteMany({}),
        prisma.repair.deleteMany({}),
        prisma.transaction.deleteMany({}),
        prisma.diamondItem.deleteMany({}),
        prisma.ledger.deleteMany({}),
        prisma.location.deleteMany({}),
        prisma.stock.deleteMany({}),
        prisma.party.deleteMany({}),
        prisma.versionChange.deleteMany({}),
        prisma.recordVersion.deleteMany({}),
        prisma.draftRevision.deleteMany({}),
        prisma.documentDraft.deleteMany({}),
      ]);

      try {
        await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
        await prisma.$queryRawUnsafe('VACUUM;');
      } catch { }

      res.json({ success: true, message: 'All database data wiped cleanly. Database is now empty.' });
    } catch (error) {
      next(error);
    }
  };


  /**
   * POST /api/settings/backup
   * Creates an atomic, consistent database snapshot.
   * Delegates to authoritative BackupService (SSOT).
   */
  backupDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeProfile = (req as any).profileCode || getActiveProfileOrDefault();
      const dbContext = await databaseContextService.getDatabaseForProfileCode(activeProfile);

      const backupRecord = await backupService.createBackup({
        databasePath: dbContext.canonicalPath,
        backupType: 'MANUAL',
      }, (req as any).user?.username || 'user');

      res.json({
        success: true,
        message: 'Database backup created successfully',
        data: {
          filename: path.basename(backupRecord.backupPath),
          backupId: backupRecord.backupId,
          sizeBytes: backupRecord.sizeBytes,
          timestamp: backupRecord.createdAt,
          sha256: backupRecord.sha256,
          status: backupRecord.status,
          checkpoint: 'TRUNCATE'
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/settings/checkpoint
   * Flushes SQLite Write-Ahead Log on the active business database file.
   */
  checkpointWAL = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeProfile = (req as any).profileCode || getActiveProfileOrDefault();
      const { getClientForProfileAsync } = require('../../infrastructure/database/prisma');
      const client = await getClientForProfileAsync(activeProfile);

      const result: any = await client.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
      res.json({
        success: true,
        message: 'SQLite WAL checkpoint completed successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/settings/users
   * Lists all business users with their assigned profiles and database paths.
   */
  listUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await systemPrisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          isActive: true,
          createdAt: true,
          userProfiles: {
            where: { isActive: true },
            include: {
              profile: {
                include: {
                  databaseRegistries: {
                    where: { status: 'ACTIVE' },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const formatted = users.map((u) => {
        const profiles = u.userProfiles.map((up) => {
          const registry = up.profile.databaseRegistries[0];
          return {
            profileId: up.profile.id,
            code: up.profile.code,
            name: up.profile.name,
            dbPath: registry?.canonicalPath || up.profile.dbPath || null,
            databaseId: registry?.databaseId || null,
          };
        });

        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt,
          profiles,
        };
      });

      res.json({ success: true, data: formatted });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/settings/users/:userId/deactivate
   * Deactivates a user, strictly preserving their database and registry.
   */
  deactivateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.userId || req.params.id);
      const performedBy = (req as any).user?.username || 'system';
      const result = await userLifecycleService.deactivateUser(userId, performedBy);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/settings/users/:userId
   * Soft-deletes a user, strictly preserving their database and registry.
   */
  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.userId || req.params.id);
      const performedBy = (req as any).user?.username || 'system';
      const result = await userLifecycleService.deleteUser(userId, performedBy);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/settings/users/:userId
   * Update user details (displayName, role).
   */
  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.userId || req.params.id);
      const { displayName, role } = req.body;

      const user = await systemPrisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundError(`User not found: ${userId}`);
      }

      const isPrimaryAdmin = user.username.toLowerCase() === 'stavan';
      const updatedData: any = {};
      if (displayName && typeof displayName === 'string') {
        updatedData.displayName = displayName.trim();
      }
      if (role && typeof role === 'string') {
        if (isPrimaryAdmin && role !== 'SUPER_ADMIN') {
          throw new ValidationError('Cannot downgrade primary administrator role.');
        }
        updatedData.role = role;
      }

      const updated = await systemPrisma.user.update({
        where: { id: userId },
        data: updatedData,
      });

      res.json({
        success: true,
        message: 'User updated successfully',
        data: {
          id: updated.id,
          username: updated.username,
          displayName: updated.displayName,
          role: updated.role,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/settings/databases
   * Lists all registered SQLite databases and profile mappings.
   */
  listDatabases = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profiles = await systemPrisma.profile.findMany({
        where: { isActive: true },
        include: {
          databaseRegistries: {
            where: { status: 'ACTIVE' },
          },
          userProfiles: {
            where: { isActive: true },
            include: { user: { select: { id: true, username: true, displayName: true } } },
          },
        },
        orderBy: { name: 'asc' },
      });

      const activeProfile = getActiveProfileOrDefault();

      const formatted = profiles.map((p) => {
        const canonicalPath = p.databaseRegistries[0]?.canonicalPath || p.dbPath || path.resolve(getDatabasesDir(), `${p.code}.db`);
        const filename = path.basename(canonicalPath);
        const exists = fs.existsSync(canonicalPath);
        const sizeBytes = exists ? fs.statSync(canonicalPath).size : 0;

        return {
          id: p.id,
          code: p.code,
          name: p.name,
          dbPath: canonicalPath,
          canonicalPath,
          filename,
          sizeBytes,
          exists,
          isActive: p.code.toLowerCase() === activeProfile.toLowerCase(),
          assignedUsers: p.userProfiles.map((up) => ({
            id: up.user.id,
            username: up.user.username,
            displayName: up.user.displayName,
          })),
        };
      });

      res.json({ success: true, data: formatted });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/settings/databases/:profileId
   * Edit database display name / details.
   */
  updateDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profileId = String(req.params.profileId || req.params.id);
      const { name, path: newPath, canonicalPath } = req.body;
      if (!name || typeof name !== 'string') {
        throw new ValidationError('Database name is required');
      }

      const prof = await systemPrisma.profile.findFirst({
        where: {
          OR: [{ id: profileId }, { code: profileId }],
        },
      });
      if (!prof) {
        throw new NotFoundError(`Database / profile not found: ${profileId}`);
      }

      const updated = await systemPrisma.profile.update({
        where: { id: prof.id },
        data: { name: name.trim() },
      });

      await systemPrisma.databaseRegistry.updateMany({
        where: { profileId: prof.id },
        data: { displayName: name.trim() },
      });

      const targetPath = (newPath || canonicalPath)?.trim();
      if (targetPath) {
        const reg = await systemPrisma.databaseRegistry.findFirst({
          where: { profileId: prof.id },
        });
        if (reg) {
          await databaseRegistryService.updateDatabasePath(reg.databaseId, targetPath);
          updateProfileDbPath(prof.code, targetPath);
        }
      }

      res.json({
        success: true,
        message: 'Database details updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/settings/users/:userId/link-database
   * Links a database / profile to a user.
   */
  linkDatabaseToUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.userId || req.params.id);
      const { profileId } = req.body;
      if (!profileId) {
        throw new ValidationError('profileId is required');
      }

      const user = await systemPrisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError('User not found');

      const profile = await systemPrisma.profile.findFirst({
        where: { OR: [{ id: profileId }, { code: profileId }] },
      });
      if (!profile) throw new NotFoundError('Database / profile not found');

      const existingLink = await systemPrisma.userProfile.findFirst({
        where: { userId: user.id, profileId: profile.id },
      });

      // Enforce: Each user is attached with only one DB and no other DB
      await systemPrisma.userProfile.deleteMany({
        where: { userId: user.id, profileId: { not: profile.id } },
      });

      if (existingLink) {
        if (!existingLink.isActive) {
          await systemPrisma.userProfile.update({
            where: { id: existingLink.id },
            data: { isActive: true },
          });
        }
      } else {
        await systemPrisma.userProfile.create({
          data: {
            userId: user.id,
            profileId: profile.id,
            role: user.role,
            isActive: true,
          },
        });
      }

      res.json({ success: true, message: `Database "${profile.name}" linked to user @${user.username}` });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/settings/users/:userId/unlink-database
   * Unlinks a database / profile from a user.
   */
  unlinkDatabaseFromUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.userId || req.params.id);
      const { profileId } = req.body;
      if (!profileId) throw new ValidationError('profileId is required');

      const profile = await systemPrisma.profile.findFirst({
        where: { OR: [{ id: profileId }, { code: profileId }] },
      });
      if (!profile) throw new NotFoundError('Database / profile not found');

      await systemPrisma.userProfile.deleteMany({
        where: { userId, profileId: profile.id },
      });

      res.json({ success: true, message: 'Database unlinked from user successfully' });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/settings/backup/download-active
   * Flushes WAL and triggers browser file download for active SQLite DB.
   */
  downloadActiveDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeProfile = (req as any).profileCode || getActiveProfileOrDefault();
      const dbContext = await databaseContextService.getDatabaseForProfileCode(activeProfile);
      const resolvedDbPath = dbContext.canonicalPath;

      if (!fs.existsSync(resolvedDbPath)) {
        res.status(404).json({ success: false, message: `Database file for "${activeProfile}" not found` });
        return;
      }

      try {
        const { getClientForProfileAsync } = require('../../infrastructure/database/prisma');
        const client = await getClientForProfileAsync(activeProfile);
        await client.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch { }

      const dateStr = new Date().toISOString().slice(0, 10);
      const downloadName = `${activeProfile}_Database_${dateStr}.db`;
      res.download(resolvedDbPath, downloadName);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/settings/backup/:backupId/download
   * Streams snapshot backup file.
   */
  downloadBackup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const backupId = String(req.params.backupId);
      const record = await systemPrisma.backupRecord.findUnique({ where: { backupId } });
      if (!record || !fs.existsSync(record.backupPath)) {
        res.status(404).json({ success: false, message: 'Backup file not found on disk' });
        return;
      }
      const filename = path.basename(record.backupPath);
      res.download(record.backupPath, filename);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/settings/data-health
   * Runs central database health inspection across all profiles and databases.
   */
  getDataHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await databaseHealthService.checkHealth();
      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/settings/open-folder
   * Opens data, backup, export, or log directory in Windows Explorer (Section 70).
   */
  openFolder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { folder } = req.body;
      let success = false;
      if (folder === 'backups') {
        success = await dataLocationService.openBackupFolder();
      } else if (folder === 'exports') {
        success = await dataLocationService.openExportFolder();
      } else if (folder === 'logs') {
        success = await dataLocationService.openLogsFolder();
      } else {
        success = await dataLocationService.openDataFolder();
      }
      res.json({ success, message: success ? 'Folder opened in Explorer' : 'Could not open folder' });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/settings/data-location/migrate
   * Executes safe data location migration workflow (Sections 7 & 8).
   */
  migrateDataLocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { targetDataDir } = req.body;
      if (!targetDataDir) {
        res.status(400).json({ success: false, message: 'targetDataDir is required' });
        return;
      }
      const result = await dataLocationService.migrateDataLocation(targetDataDir);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/settings/disk-space
   * Returns current disk space assessment across data directory (Section 25).
   */
  getDiskSpace = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const space = dataLocationService.checkDiskSpace();
      res.json({ success: true, data: space });
    } catch (error) {
      next(error);
    }
  };
}


