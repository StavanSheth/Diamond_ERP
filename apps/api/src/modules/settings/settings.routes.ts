import { Router } from 'express';
import { SettingsController } from './settings.controller';

export function createSettingsRouter(controller: SettingsController): Router {
  const router = Router();

  router.get('/', controller.getSettings);
  router.put('/', controller.updateSettings);
  
  router.get('/export/excel', controller.exportExcel);
  router.get('/export/csv', controller.exportCsv);

  router.get('/profiles', controller.getProfiles);
  router.post('/profiles', controller.createProfile);
  if (controller.deleteProfile) router.delete('/profiles/:profileCode', controller.deleteProfile);
  router.post('/profile', controller.switchProfile);

  // Database backup and SQLite WAL maintenance
  router.post('/backup', controller.backupDatabase);
  router.post('/checkpoint', controller.checkpointWAL);

  // User & Database Management
  if (controller.listUsers) router.get('/users', controller.listUsers);
  if (controller.updateUser) router.put('/users/:userId', controller.updateUser);
  if (controller.deactivateUser) router.post('/users/:userId/deactivate', controller.deactivateUser);
  if (controller.deleteUser) router.delete('/users/:userId', controller.deleteUser);

  if (controller.listDatabases) router.get('/databases', controller.listDatabases);
  if (controller.updateDatabase) router.put('/databases/:profileId', controller.updateDatabase);
  if (controller.linkDatabaseToUser) router.post('/users/:userId/link-database', controller.linkDatabaseToUser);
  if (controller.unlinkDatabaseFromUser) router.post('/users/:userId/unlink-database', controller.unlinkDatabaseFromUser);

  // Direct download backup endpoints (Native Save As)
  if (controller.downloadActiveDatabase) router.get('/backup/download-active', controller.downloadActiveDatabase);
  if (controller.downloadBackup) router.get('/backup/:backupId/download', controller.downloadBackup);

  // Data Health & Diagnostics
  if (controller.getDataHealth) router.get('/data-health', controller.getDataHealth);
  if (controller.getDiskSpace) router.get('/disk-space', controller.getDiskSpace);
  if (controller.openFolder) router.post('/open-folder', controller.openFolder);
  if (controller.migrateDataLocation) router.post('/data-location/migrate', controller.migrateDataLocation);

  // Factory reset
  router.post('/factory-reset', controller.factoryReset);

  return router;
}
