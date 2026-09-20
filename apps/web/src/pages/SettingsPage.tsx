import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { useDrafts } from '../hooks/useDrafts';
import { deleteLocalDraft, getActiveDrafts } from '../services/draftDb';
import { useAppLock } from '../contexts/AppLockContext';
import { useAuth } from '../contexts/AuthContext';
import { downloadBlob } from '../utils/blob';
import { registerDeviceCredential, formatSessionTimeout } from '../services/deviceAuth';

export const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const {
    isAppLockEnabled,
    sessionTimeoutMinutes,
    enableAppLock,
    disableAppLock,
    setSessionTimeout,
    lockNow,
    hasBackupPin,
    setBackupPin,
    isPlatformAuthSupported,
  } = useAppLock();
  const { switchProfile } = useAuth();
  const [deviceRegistrationStatus, setDeviceRegistrationStatus] = useState<string | null>(null);

  const [customUnit, setCustomUnit] = useState<'minutes' | 'hours' | 'days'>('minutes');
  const [customValue, setCustomValue] = useState<string>('15');

  // Keep custom duration input synced with current sessionTimeoutMinutes
  useEffect(() => {
    if (sessionTimeoutMinutes >= 1440 && sessionTimeoutMinutes % 1440 === 0) {
      setCustomUnit('days');
      setCustomValue(String(sessionTimeoutMinutes / 1440));
    } else if (sessionTimeoutMinutes >= 60 && sessionTimeoutMinutes % 60 === 0) {
      setCustomUnit('hours');
      setCustomValue(String(sessionTimeoutMinutes / 60));
    } else {
      setCustomUnit('minutes');
      setCustomValue(String(sessionTimeoutMinutes));
    }
  }, [sessionTimeoutMinutes]);

  const handleApplyCustomDuration = (valStr: string, unit: 'minutes' | 'hours' | 'days') => {
    const val = parseInt(valStr, 10);
    if (isNaN(val) || val <= 0) return;
    let mult = 1;
    if (unit === 'hours') mult = 60;
    if (unit === 'days') mult = 1440;
    setSessionTimeout(val * mult);
  };

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>('Stavan');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [newProfileModalOpen, setNewProfileModalOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileCallback, setNewProfileCallback] = useState<((name: string) => void) | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { drafts, refresh: refreshDrafts } = useDrafts();

  // Ensure only one draft is retained in IndexedDB
  useEffect(() => {
    (async () => {
      try {
        const activeDrafts = await getActiveDrafts();
        if (activeDrafts.length > 1) {
          for (let i = 1; i < activeDrafts.length; i++) {
            if (activeDrafts[i].id) {
              await deleteLocalDraft(activeDrafts[i].id!);
            }
          }
          refreshDrafts();
        }
      } catch (err) {
        console.warn('Failed to prune extra drafts:', err);
      }
    })();
  }, [refreshDrafts]);

  const displayedDrafts = drafts.length > 0
    ? [drafts[0]]
    : [
        {
          id: 'local-sample-1',
          draftNumber: 'DFT-001',
          entityType: 'Diamond Purchase Voucher',
          updatedAt: new Date().toISOString(),
          status: 'SAVED',
          createdBy: 'Stavan',
          updatedBy: 'Stavan',
          isLocalOnly: true,
        },
      ];
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportArrangement, setExportArrangement] = useState<'default' | 'party' | 'stock'>('default');
  const directoryInputRef = React.useRef<HTMLInputElement>(null);

  // Phase 5 Backup & Recovery State
  const [backups, setBackups] = useState<any[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<any | null>(null);
  const [stagedRestore, setStagedRestore] = useState<any | null>(null);
  const [confirmOverwriteCheckbox, setConfirmOverwriteCheckbox] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // User & Database Management State (Phase 7 Lifecycle)
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deactivatingUserId, setDeactivatingUserId] = useState<string | null>(null);
  const [deleteUserModal, setDeleteUserModal] = useState<any | null>(null);

  // Phase 7 Uninstall Safety Gate & Preservation State
  const [preflightData, setPreflightData] = useState<any | null>(null);
  const [loadingPreflight, setLoadingPreflight] = useState(false);
  const [customDestinationDir, setCustomDestinationDir] = useState('');
  const [preservationPackage, setPreservationPackage] = useState<any | null>(null);
  const [creatingPreservation, setCreatingPreservation] = useState(false);
  const [verifyingPreservation, setVerifyingPreservation] = useState(false);
  const [uninstallAuth, setUninstallAuth] = useState<any | null>(null);
  const [authorizingUninstall, setAuthorizingUninstall] = useState(false);
  const [preservationMessage, setPreservationMessage] = useState<string | null>(null);
  const [preservationError, setPreservationError] = useState<string | null>(null);
  const [validatingDestination, setValidatingDestination] = useState(false);
  const [destinationValidationResult, setDestinationValidationResult] = useState<{
    valid: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  const [browsingDestination, setBrowsingDestination] = useState(false);

  const handleBrowseDestination = async () => {
    setBrowsingDestination(true);
    setPreservationError(null);
    try {
      const browseRes = await api.uninstall.browseDestination();
      if (browseRes.selectedPath) {
        setCustomDestinationDir(browseRes.selectedPath);
        await handleValidateDestination(browseRes.selectedPath);
      } else if (browseRes.suggestedPaths && browseRes.suggestedPaths.length > 0 && !customDestinationDir) {
        setCustomDestinationDir(browseRes.suggestedPaths[0]);
      }
    } catch (err: any) {
      setPreservationError(err.message || 'Folder selection failed');
    } finally {
      setBrowsingDestination(false);
    }
  };

  const handleValidateDestination = async (dirToValidate?: string) => {
    const target = (dirToValidate !== undefined ? dirToValidate : customDestinationDir).trim();
    if (!target) {
      setDestinationValidationResult({ valid: false, error: 'Please select or enter a destination directory.' });
      return;
    }
    setValidatingDestination(true);
    setDestinationValidationResult(null);
    try {
      const res = await api.uninstall.validateDestination(target);
      if (res.valid) {
        setDestinationValidationResult({ valid: true, message: res.message || 'Destination is valid and writable.' });
        setCustomDestinationDir(res.canonicalPath);
      } else {
        setDestinationValidationResult({ valid: false, error: res.error || 'Destination validation failed.' });
      }
    } catch (err: any) {
      setDestinationValidationResult({ valid: false, error: err.message || 'Validation request failed' });
    } finally {
      setValidatingDestination(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await api.listUsers();
      if (res.success && Array.isArray(res.data)) {
        setUsersList(res.data);
      }
    } catch (err: any) {
      console.warn('Failed to load users:', err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleDeactivateUser = async (user: any) => {
    if (!window.confirm(`Deactivate user @${user.username}? Their account will be deactivated, but their business database and data will remain preserved and discoverable.`)) return;
    setDeactivatingUserId(user.id);
    try {
      const res = await api.uninstall.deactivateUser(user.id);
      alert(res.message || 'User deactivated successfully.');
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate user');
    } finally {
      setDeactivatingUserId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserModal) return;
    setDeletingUserId(deleteUserModal.id);
    try {
      const res = await api.uninstall.deleteUser(deleteUserModal.id);
      if (res.success) {
        alert(res.message || 'User deleted successfully. Their database is preserved and remains discoverable for recovery.');
        setDeleteUserModal(null);
        await fetchUsers();
        const profileRes = await api.getProfiles();
        if (profileRes.success) {
          setProfiles(profileRes.data.profiles);
          setActiveProfile(profileRes.data.active);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleRunPreflight = async () => {
    setLoadingPreflight(true);
    setPreservationError(null);
    try {
      const preflight = await api.uninstall.getPreflight();
      setPreflightData(preflight);
      if (preflight.lastPreservationDestination && !customDestinationDir) {
        setCustomDestinationDir(preflight.lastPreservationDestination);
      }
    } catch (err: any) {
      setPreservationError(err.message || 'Failed to execute uninstall preflight inspection');
    } finally {
      setLoadingPreflight(false);
    }
  };

  const handleCreatePreservationPackage = async () => {
    setCreatingPreservation(true);
    setPreservationError(null);
    setPreservationMessage(null);
    try {
      const pkg = await api.uninstall.createPreservationPackage({
        destinationDir: customDestinationDir.trim() || undefined,
        confirmPreservation: true,
      });
      setPreservationPackage(pkg);
      setPreservationMessage(`Preservation package created: ${pkg.packageId}. Status: ${pkg.status}`);
      await handleRunPreflight();
    } catch (err: any) {
      setPreservationError(err.message || 'Failed to create preservation package');
    } finally {
      setCreatingPreservation(false);
    }
  };

  const handleVerifyPreservation = async () => {
    if (!preservationPackage) return;
    setVerifyingPreservation(true);
    setPreservationError(null);
    try {
      const verification = await api.uninstall.verifyPreservation(preservationPackage.packageId);
      if (verification.verified) {
        setPreservationMessage('Preservation package verified successfully (Database, CSVs, and XLSX all validated).');
      } else {
        setPreservationError(`Verification failed: ${verification.error || 'Check failed'}`);
      }
      await handleRunPreflight();
    } catch (err: any) {
      setPreservationError(err.message || 'Verification error');
    } finally {
      setVerifyingPreservation(false);
    }
  };

  const handleAuthorizeUninstall = async () => {
    if (!preservationPackage) return;
    setAuthorizingUninstall(true);
    setPreservationError(null);
    try {
      const auth = await api.uninstall.authorizeUninstall({
        preservationPackageId: preservationPackage.packageId,
        confirmOneTimeAuthorization: true,
      });
      setUninstallAuth(auth);
      setPreservationMessage(`Uninstall AUTHORIZED! One-time authorization token issued. Valid until: ${new Date(auth.expiresAt).toLocaleTimeString()}`);
      await handleRunPreflight();
    } catch (err: any) {
      setPreservationError(err.message || 'Failed to issue uninstall authorization token');
    } finally {
      setAuthorizingUninstall(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await api.backup.listBackups();
      if (res?.backups) {
        setBackups(res.backups);
      }
    } catch {}
  };

  const handleCreateDatabaseBackup = async () => {
    setCreatingBackup(true);
    setBackupMessage(null);
    try {
      const bkp = await api.backup.createBackup();
      setBackupMessage(`Verified backup created: ${bkp.backupId} (${(bkp.sizeBytes / 1024).toFixed(1)} KB)`);
      await fetchBackups();
    } catch (err: any) {
      alert(err.message || 'Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handlePrepareRestore = async (bkp: any) => {
    setSelectedBackupForRestore(bkp);
    setConfirmOverwriteCheckbox(false);
    try {
      const preview = await api.recovery.prepareRestore({ candidatePath: bkp.backupPath });
      setStagedRestore(preview);
      setRestoreModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to prepare staged restore');
    }
  };

  const handleExecuteRestore = async () => {
    if (!stagedRestore || !confirmOverwriteCheckbox) return;
    setRestoring(true);
    try {
      await api.recovery.confirmRestore({
        restoreId: stagedRestore.restoreId,
        confirmDestructiveOverwrite: true,
        targetProfileCode: stagedRestore.targetProfileCode,
      });
      alert('Database restored and verified successfully!');
      setRestoreModalOpen(false);
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to execute restore');
    } finally {
      setRestoring(false);
    }
  };


  const handleSelectDirectory = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        if (dirHandle && dirHandle.name) {
          handleChange('localBackupPath', dirHandle.name);
        }
      } else {
        directoryInputRef.current?.click();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        directoryInputRef.current?.click();
      }
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const [res, profileRes] = await Promise.all([api.getSettings(), api.getProfiles()]);
      if (res.success) setSettings(res.data);
      if (profileRes.success) {
        setProfiles(profileRes.data.profiles);
        setActiveProfile(profileRes.data.active);
      }
      await fetchBackups();
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleImportExecution = async (mode: 'merge' | 'overwrite') => {
    if (!selectedFile) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await api.importExcel(selectedFile, mode);
      if (!res?.success) {
        setImportError(res?.message || 'Import failed. The file format is incorrect or corrupted.');
      } else {
        alert('Import successful!');
        setImportModalOpen(false);
        setSelectedFile(null);
        window.location.reload();
      }
    } catch(err: any) {
      setImportError(err.message || 'Import failed. Please use the correct Excel format.');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings(settings);
      alert('Settings saved successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-bright overflow-hidden">
      <header className="px-margin-page py-md bg-surface border-b border-outline-variant/60 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-gutter">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shadow-2xs border border-blue-100 shrink-0">
              <span className="material-symbols-outlined text-[22px]">settings</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface m-0 leading-tight">{t('System Settings')}</h2>
              <p className="text-xs text-on-surface-variant m-0 mt-0.5">{t('Configure application parameters, cloud sync, security & defaults.')}</p>
            </div>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 bg-primary hover:bg-[#0D47A1] text-white rounded-xl px-4 py-2 font-bold text-xs transition-all shadow-xs disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </header>

      <div className="flex-1 p-margin-page overflow-y-auto bg-surface-bright">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[32px]">progress_activity</span>
          </div>
        ) : error ? (
          <div className="bg-error-container text-on-error-container p-md rounded-xl border border-error/20">
            {error}
          </div>
        ) : (
          <form className="w-full pb-32" onSubmit={handleSave}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start w-full">
              {/* ── LEFT COLUMN ── */}
              <div className="flex flex-col gap-6 w-full">
            
                {/* ══════════════════════════════════════════════════════════ */}
                {/* SECTION 1: APP LOCK & DEVICE SECURITY                    */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-indigo-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-md pb-sm border-b border-outline-variant/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
                      <span className="material-symbols-outlined text-[18px]">security</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                        {t('App Lock & Device Security')}
                      </h3>
                      <p className="text-[11px] text-on-surface-variant m-0">
                        {t('Biometric authentication, device lock screen & automatic inactivity timeout')}
                      </p>
                    </div>
                  </div>
                  
                  {/* Master Switch & Status */}
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      isAppLockEnabled 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                        : 'bg-slate-100 text-slate-600 border border-slate-300'
                    }`}>
                      {isAppLockEnabled ? t('ACTIVE') : t('DISABLED')}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isAppLockEnabled}
                      onClick={async () => {
                        if (isAppLockEnabled) {
                          await disableAppLock();
                          handleChange('appLock_enabled', 'false');
                        } else {
                          try {
                            setDeviceRegistrationStatus(t('Prompting device lock...'));
                            const cred = await registerDeviceCredential();
                            await enableAppLock({
                              timeoutMinutes: sessionTimeoutMinutes,
                              credentialId: cred?.credentialId,
                            });
                            handleChange('appLock_enabled', 'true');
                            setDeviceRegistrationStatus(null);
                          } catch (err: any) {
                            console.warn('Device lock notice:', err);
                            await enableAppLock({ timeoutMinutes: sessionTimeoutMinutes });
                            handleChange('appLock_enabled', 'true');
                            setDeviceRegistrationStatus(null);
                          }
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isAppLockEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isAppLockEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-md">
                  <p className="text-xs text-on-surface-variant m-0">
                    {t('Protect DiamondERP with your device screen lock (Windows Hello, Fingerprint, Face ID, PIN, or Pattern) and configure automatic session timeout when idle.')}
                  </p>

                  {/* If Disabled: Show Call-to-action */}
                  {!isAppLockEnabled && (
                    <div className="p-md bg-white border border-dashed border-outline-variant rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-md shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100">
                          <span className="material-symbols-outlined text-[22px]">lock</span>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-on-surface m-0 leading-tight">{t('App Lock is currently turned OFF')}</h4>
                          <p className="text-[11px] text-on-surface-variant m-0 mt-0.5">{t('Turn on App Lock to protect business transactions and stock inventory.')}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setDeviceRegistrationStatus(t('Prompting device lock...'));
                            const cred = await registerDeviceCredential();
                            await enableAppLock({ timeoutMinutes: sessionTimeoutMinutes, credentialId: cred?.credentialId });
                            setDeviceRegistrationStatus(null);
                          } catch (err: any) {
                            console.warn('Device lock notice:', err);
                            await enableAppLock({ timeoutMinutes: sessionTimeoutMinutes });
                            setDeviceRegistrationStatus(null);
                          }
                        }}
                        className="px-md py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition-colors whitespace-nowrap shadow-xs"
                      >
                        {t('Enable App Lock')}
                      </button>
                    </div>
                  )}

                  {/* When Enabled */}
                  {isAppLockEnabled && (
                    <>
                      {/* Session Inactivity Timeout Selection */}
                      <div className="p-md bg-white border border-outline-variant/60 rounded-xl flex flex-col gap-md shadow-2xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-sm">
                          <div>
                            <h4 className="text-xs font-bold text-on-surface flex items-center gap-1.5 m-0">
                              <span className="material-symbols-outlined text-indigo-600 text-[18px]">timer</span>
                              {t('Session Inactivity Timeout')}
                            </h4>
                            <p className="text-[11px] text-on-surface-variant m-0 mt-0.5">
                              {t('Configure how long the app stays idle before automatically locking. Choose from quick presets or set custom duration.')}
                            </p>
                          </div>
                          <div className="sm:text-right bg-indigo-50/70 px-3 py-1 rounded-lg border border-indigo-100 shrink-0">
                            <span className="text-base font-mono font-bold text-indigo-700">{formatSessionTimeout(sessionTimeoutMinutes)}</span>
                            <div className="text-[10px] font-semibold text-indigo-600">
                              {sessionTimeoutMinutes >= 60 ? `(${sessionTimeoutMinutes.toLocaleString()} ${t('total mins')})` : t('inactivity period')}
                            </div>
                          </div>
                        </div>

                        {/* Quick Presets */}
                        <div>
                          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
                            {t('Quick Presets')}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { label: `1 ${t('min')}`, value: 1 },
                              { label: `5 ${t('mins')}`, value: 5 },
                              { label: `15 ${t('mins')}`, value: 15 },
                              { label: `30 ${t('mins')}`, value: 30 },
                              { label: `1 ${t('hr')}`, value: 60 },
                              { label: `4 ${t('hrs')}`, value: 240 },
                              { label: `1 ${t('day')}`, value: 1440 },
                              { label: `3 ${t('days')}`, value: 4320 },
                              { label: `7 ${t('days')}`, value: 10080 },
                            ].map(preset => (
                              <button
                                key={preset.value}
                                type="button"
                                onClick={() => setSessionTimeout(preset.value)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                  sessionTimeoutMinutes === preset.value
                                    ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-200'
                                    : 'bg-slate-100 hover:bg-slate-200 text-on-surface border border-outline-variant/60'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Custom Duration Selector */}
                        <div className="pt-2 border-t border-outline-variant/40">
                          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
                            {t('Custom Duration')}
                          </span>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                max={customUnit === 'days' ? 365 : customUnit === 'hours' ? 8760 : 525600}
                                value={customValue}
                                onChange={e => {
                                  setCustomValue(e.target.value);
                                  handleApplyCustomDuration(e.target.value, customUnit);
                                }}
                                className="w-20 px-2.5 py-1 font-bold border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface text-xs focus:outline-none focus:border-indigo-600"
                                placeholder="e.g. 2"
                              />
                              <select
                                value={customUnit}
                                onChange={e => {
                                  const newUnit = e.target.value as 'minutes' | 'hours' | 'days';
                                  setCustomUnit(newUnit);
                                  handleApplyCustomDuration(customValue, newUnit);
                                }}
                                aria-label={t('Custom duration unit')}
                                className="px-2.5 py-1 font-medium border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface text-xs focus:outline-none focus:border-indigo-600 cursor-pointer"
                              >
                                <option value="minutes">{t('Minutes')}</option>
                                <option value="hours">{t('Hours')}</option>
                                <option value="days">{t('Days')}</option>
                              </select>
                            </div>

                            <div className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[15px] text-indigo-600">info</span>
                              <span>
                                {t('App locks after')} <strong>{formatSessionTimeout(sessionTimeoutMinutes)}</strong> {t('of inactivity.')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Device Lock Authentication Info & Actions */}
                      <div className="p-md bg-white border border-outline-variant/60 rounded-xl flex flex-col gap-sm shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-600 text-[18px]">fingerprint</span>
                            <h4 className="text-xs font-bold text-on-surface m-0">{t('Native Device Lock (Windows Hello / Phone Lock)')}</h4>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                            {isPlatformAuthSupported ? t('Native Device Lock Detected') : t('Standard Device Lock')}
                          </span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant m-0">
                          {t('Protected using the screen lock already applied to your device (Windows Hello PIN, Fingerprint, Face ID on laptop, or lock screen PIN/Pattern on phone). No website-based PIN required.')}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                setDeviceRegistrationStatus(t('Prompting device lock...'));
                                const cred = await registerDeviceCredential();
                                if (cred?.credentialId) {
                                  await enableAppLock({ timeoutMinutes: sessionTimeoutMinutes, credentialId: cred.credentialId });
                                  alert(t('Device lock verified successfully using your device screen security!'));
                                }
                              } catch (err: any) {
                                alert(err.message || t('Device verification cancelled.'));
                              } finally {
                                setDeviceRegistrationStatus(null);
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 border border-outline-variant/60 rounded-lg text-xs font-bold text-on-surface transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px] text-indigo-600">devices</span>
                            <span>{deviceRegistrationStatus || t('Test Device Lock Screen')}</span>
                          </button>
                        </div>
                      </div>

                      {/* Section 3: Lock Now & OFF Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-md pt-sm border-t border-outline-variant/60">
                        <button
                          type="button"
                          onClick={lockNow}
                          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-md py-1.5 rounded-lg font-bold text-xs transition-colors shadow-xs"
                        >
                          <span className="material-symbols-outlined text-[16px]">lock</span>
                          {t('Lock Screen Now')}
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            await disableAppLock();
                            handleChange('appLock_enabled', 'false');
                          }}
                          className="flex items-center gap-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-md py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">lock_open</span>
                          {t('Turn Off App Lock')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 2: WORKSPACE & PROFILE SELECTION                 */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-blue-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center gap-2.5 pb-sm border-b border-outline-variant/60">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">domain</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                      Workspace &amp; Profile Selection
                    </h3>
                    <p className="text-[11px] text-on-surface-variant m-0">
                      Select your active company database or create a new isolated tenant profile
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-md bg-white p-md rounded-xl border border-outline-variant/50 shadow-2xs">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">Active Profile</label>
                    <select
                      value={activeProfile}
                      onChange={async (e) => {
                        const newProf = e.target.value;
                        if (newProf && newProf !== activeProfile) {
                          try {
                            await api.switchProfile(newProf);
                            switchProfile(newProf);
                            setActiveProfile(newProf);
                            window.location.reload();
                          } catch (err: any) {
                            alert(err.message || 'Failed to switch profile');
                          }
                        }
                      }}
                      className="w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-blue-600 text-on-surface font-semibold text-xs"
                    >
                      {profiles.map(p => (
                        <option key={p} value={p}>{p} {p === activeProfile ? '(Active)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProfileName('');
                      setNewProfileCallback(() => async (name: string) => {
                        try {
                          await api.createProfile(name);
                          switchProfile(name);
                          setActiveProfile(name);
                          window.location.reload();
                        } catch (err: any) {
                          alert(err.message || 'Failed to create profile');
                        }
                      });
                      setNewProfileModalOpen(true);
                    }}
                    className="mt-4 sm:mt-auto px-md py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_business</span>
                    New Profile
                  </button>

                  {activeProfile.toLowerCase() !== 'stavan' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Permanently delete profile "${activeProfile}" and its database file?`)) return;
                        try {
                          await api.deleteProfile(activeProfile, true);
                          alert(`Profile "${activeProfile}" deleted successfully.`);
                          await api.switchProfile('Stavan');
                          switchProfile('Stavan');
                          setActiveProfile('Stavan');
                          window.location.reload();
                        } catch (err: any) {
                          alert(err.message || 'Failed to delete profile');
                        }
                      }}
                      className="mt-4 sm:mt-auto px-md py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                      title="Delete this workspace profile and database"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      Delete Profile &amp; DB
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 3: COMPANY INFORMATION                            */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-sky-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center gap-2.5 pb-sm border-b border-outline-variant/60">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">store</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                      Company Information &amp; Branding
                    </h3>
                    <p className="text-[11px] text-on-surface-variant m-0">
                      Business identity, contact details, and registered commercial address
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md bg-white p-md rounded-xl border border-outline-variant/50 shadow-2xs">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Company Name</label>
                    <input 
                      type="text" 
                      value={settings.companyName || ''}
                      onChange={e => handleChange('companyName', e.target.value)}
                      className="w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-sky-600 text-on-surface text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Contact Email</label>
                    <input 
                      type="email" 
                      value={settings.contactEmail || ''}
                      onChange={e => handleChange('contactEmail', e.target.value)}
                      className="w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-sky-600 text-on-surface text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Address</label>
                    <textarea 
                      value={settings.companyAddress || ''}
                      onChange={e => handleChange('companyAddress', e.target.value)}
                      rows={3}
                      className="w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-sky-600 text-on-surface text-xs resize-none"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 4: FINANCIAL & CURRENCY                           */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-emerald-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center gap-2.5 pb-sm border-b border-outline-variant/60">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">payments</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                      Financial &amp; Currency Defaults
                    </h3>
                    <p className="text-[11px] text-on-surface-variant m-0">
                      Standard base currency denomination and applicable default tax percentage
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md bg-white p-md rounded-xl border border-outline-variant/50 shadow-2xs">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Default Currency</label>
                    <select 
                      value={settings.defaultCurrency || 'INR'}
                      onChange={e => handleChange('defaultCurrency', e.target.value)}
                      className="w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-emerald-600 text-on-surface text-xs"
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Tax Rate (%)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={settings.taxRate || '0'}
                      onChange={e => handleChange('taxRate', e.target.value)}
                      className="w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-emerald-600 text-on-surface text-xs"
                    />
                  </div>
                </div>
              </div>
            </section>
              </div>

              {/* ── RIGHT COLUMN ── */}
              <div className="flex flex-col gap-6 w-full">

                {/* ══════════════════════════════════════════════════════════ */}
                {/* SECTION 5: LANGUAGE & LOCALIZATION                        */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-amber-500" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center gap-2.5 pb-sm border-b border-outline-variant/60">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">language</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                      {t('Language & Localization')}
                    </h3>
                    <p className="text-[11px] text-on-surface-variant m-0">
                      Select your preferred user interface display language across 11 Indian languages
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-1 bg-white p-md rounded-xl border border-outline-variant/50 shadow-2xs">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{t('Display Language')}</label>
                  <select 
                    value={i18n.language}
                    onChange={e => {
                      i18n.changeLanguage(e.target.value);
                      localStorage.setItem('appLanguage', e.target.value);
                    }}
                    className="w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-amber-500 text-on-surface text-xs"
                  >
                    <option value="en">English</option>
                    <option value="hi">हिंदी (Hindi)</option>
                    <option value="bn">বাংলা (Bengali)</option>
                    <option value="te">తెలుగు (Telugu)</option>
                    <option value="mr">मराठी (Marathi)</option>
                    <option value="ta">தமிழ் (Tamil)</option>
                    <option value="ur">اردو (Urdu)</option>
                    <option value="gu">ગુજરાતી (Gujarati)</option>
                    <option value="kn">ಕನ್ನಡ (Kannada)</option>
                    <option value="or">ଓଡ଼ିଆ (Odia)</option>
                    <option value="ml">മലയാളം (Malayalam)</option>
                  </select>
                  <p className="text-[11px] text-on-surface-variant mt-1 m-0">Changes are applied immediately without restarting.</p>
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 6: SYSTEM & CLOUD SYNC                            */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-rose-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center gap-2.5 pb-sm border-b border-outline-variant/60">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">sync</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                      System &amp; Cloud Sync
                    </h3>
                    <p className="text-[11px] text-on-surface-variant m-0">
                      Automated periodic sync with Google Sheets and profile maintenance
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-md">
                  <div className="flex items-center justify-between p-md bg-white border border-outline-variant/50 rounded-xl shadow-2xs opacity-75">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-on-surface m-0">Auto-Sync to Google Sheets</h4>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-300">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant m-0 mt-0.5">
                        Automated periodic cloud backup &amp; sync (Feature Coming Soon).
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-not-allowed opacity-50" title="Coming Soon">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={false}
                        disabled
                        readOnly
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                  
                  <div className="p-md bg-rose-50/60 border border-rose-200 rounded-xl shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-md">
                    <div>
                      <h4 className="text-xs font-bold text-error m-0 leading-tight">Danger Zone</h4>
                      <p className="text-[11px] text-on-surface-variant m-0 mt-0.5">Permanently wipe all stock items, ledgers, and transactions in the active profile.</p>
                    </div>
                    <button 
                      type="button"
                      onClick={async () => {
                        if (window.prompt('Type DELETE to confirm wiping ALL data in the current profile:') === 'DELETE') {
                          try {
                            await api.factoryReset();
                            alert('Data wiped successfully.');
                            window.location.reload();
                          } catch(e: any) {
                            alert(e.message || 'Factory reset failed');
                          }
                        }
                      }}
                      className="flex items-center gap-1.5 bg-error hover:bg-error-container text-white px-md py-1.5 rounded-lg font-bold text-xs transition-colors shrink-0 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                      Delete All System Data
                    </button>
                  </div>
                </div>
              </div>
            </section>
            
            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 6.5: USER & DATABASE MANAGEMENT                   */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-indigo-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center justify-between pb-sm border-b border-outline-variant/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
                      <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                        User &amp; Database Management
                      </h3>
                      <p className="text-[11px] text-on-surface-variant m-0">
                        View active users, inspect database attachments, and cleanly remove users with their databases
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={fetchUsers}
                    disabled={loadingUsers}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold px-2 py-1 rounded-lg border border-indigo-200 bg-white shadow-2xs"
                  >
                    <span className={`material-symbols-outlined text-[14px] ${loadingUsers ? 'animate-spin' : ''}`}>refresh</span>
                    Refresh
                  </button>
                </div>

                <div className="flex flex-col gap-sm">
                  {loadingUsers && usersList.length === 0 ? (
                    <div className="text-xs text-on-surface-variant p-md text-center">Loading users...</div>
                  ) : usersList.length === 0 ? (
                    <div className="text-xs text-on-surface-variant p-md text-center">No users found.</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {usersList.map((usr) => {
                        const isStavan = usr.username.toLowerCase() === 'stavan';
                        return (
                          <div
                            key={usr.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-md bg-white border border-outline-variant/50 rounded-xl shadow-2xs"
                          >
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-on-surface">{usr.displayName}</span>
                                <span className="text-[11px] font-mono text-slate-500">(@{usr.username})</span>
                                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                                  {usr.role}
                                </span>
                                {isStavan && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 rounded border border-emerald-300">
                                    Primary Admin
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-on-surface-variant flex flex-wrap items-center gap-x-2">
                                {usr.profiles && usr.profiles.length > 0 ? (
                                  usr.profiles.map((p: any) => (
                                    <span key={p.profileId} className="flex items-center gap-1 font-mono text-[10px] text-slate-600">
                                      <span className="material-symbols-outlined text-[12px] text-slate-400">database</span>
                                      {p.code} {p.dbPath ? `(${p.dbPath.split(/[\\/]/).pop()})` : ''}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">No dedicated database assigned</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              {isStavan ? (
                                <span className="text-[11px] text-slate-400 italic px-2 py-1">Protected</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteUserModal(usr);
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 rounded-lg transition-colors shadow-2xs"
                                >
                                  <span className="material-symbols-outlined text-[14px]">delete</span>
                                  Delete User
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>
            
            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 7: LOCAL DATA SAVING & BACKUPS                    */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-teal-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center gap-2.5 pb-sm border-b border-outline-variant/60">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">save</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                      Local Data Saving &amp; Backups
                    </h3>
                    <p className="text-[11px] text-on-surface-variant m-0">
                      Local directory destination and export formats for scheduled offline snapshots
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md bg-white p-md rounded-xl border border-outline-variant/50 shadow-2xs">
                  <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Local Backup Directory Path</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        placeholder="e.g., C:\ERP_Backups or /backups"
                        value={settings.localBackupPath || ''}
                        onChange={e => handleChange('localBackupPath', e.target.value)}
                        className="flex-1 px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-teal-600 text-on-surface text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleSelectDirectory}
                        className="flex items-center gap-1.5 px-md py-1.5 bg-slate-100 hover:bg-slate-200 border border-outline-variant/60 rounded-lg text-on-surface font-bold text-xs transition-colors whitespace-nowrap shadow-2xs"
                        title="Select folder from user device"
                      >
                        <span className="material-symbols-outlined text-[16px] text-teal-700">folder_open</span>
                        Browse Folder
                      </button>
                      <input
                        ref={directoryInputRef}
                        type="file"
                        // @ts-ignore
                        webkitdirectory=""
                        // @ts-ignore
                        directory=""
                        className="hidden"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files && files.length > 0) {
                            const folderName = files[0].webkitRelativePath?.split('/')[0] || files[0].name;
                            handleChange('localBackupPath', folderName);
                          }
                          e.target.value = '';
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-on-surface-variant mt-1 m-0">Select or enter the storage directory on this system where backups will be stored.</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Backup Format</label>
                    <select 
                      value={settings.localBackupFormat || 'CSV'}
                      onChange={e => handleChange('localBackupFormat', e.target.value)}
                      className="w-full px-sm py-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-teal-600 text-on-surface text-xs"
                    >
                      <option value="CSV">CSV</option>
                    </select>
                  </div>
                </div>

                {/* Phase 5: Verified Database Backups & Restore Management */}
                <div className="bg-white p-md rounded-xl border border-outline-variant/50 shadow-2xs flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-on-surface m-0">Verified SQLite Database Snapshots</h4>
                      <p className="text-[11px] text-on-surface-variant m-0">
                        Create atomic, SHA-256 verified database backups with WAL flush and JSON manifest
                      </p>
                    </div>
                    <button
                      id="btn-create-verified-backup"
                      type="button"
                      disabled={creatingBackup}
                      onClick={handleCreateDatabaseBackup}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                      {creatingBackup ? 'Creating...' : 'Create Verified Backup'}
                    </button>
                  </div>

                  {backupMessage && (
                    <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      <span>{backupMessage}</span>
                    </div>
                  )}

                  {backups.length > 0 ? (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                      {backups.map((bkp) => (
                        <div key={bkp.backupId} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                          <div>
                            <div className="font-semibold text-slate-800">{bkp.backupId}</div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-2">
                              <span>{(bkp.sizeBytes / 1024).toFixed(1)} KB</span>
                              <span>•</span>
                              <span>{new Date(bkp.createdAt).toLocaleString()}</span>
                              <span>•</span>
                              <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 font-mono text-[9px]">{bkp.status}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await api.backup.verifyBackup(bkp.backupId);
                                  alert(res.isValid ? '✔ Integrity verified! SHA-256 and SQLite checks passed.' : `❌ Verification failed: ${res.error}`);
                                } catch (e: any) {
                                  alert(e.message || 'Verification failed');
                                }
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 rounded border border-slate-300"
                            >
                              Verify
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrepareRestore(bkp)}
                              className="px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 rounded border border-teal-300"
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-3 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      No backups created yet. Click &quot;Create Verified Backup&quot; to take a snapshot.
                    </div>
                  )}

                  {/* Uninstall Data Safety Contract */}
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
                    <span className="material-symbols-outlined text-[18px] text-teal-600 shrink-0">shield</span>
                    <div>
                      <span className="font-bold text-slate-800">Uninstall Data Preservation Guarantee: </span>
                      Uninstalling Diamond ERP removes application binaries from Program Files while keeping 100% of your business data, databases, and logs intact in AppData.
                    </div>
                  </div>
                </div>

                {/* Staged Restore Confirmation Modal */}
                {restoreModalOpen && stagedRestore && (
                  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
                      <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                        <span className="material-symbols-outlined text-amber-600 text-2xl">warning</span>
                        <h3 className="font-bold text-sm text-slate-900 m-0">Confirm Database Restoration</h3>
                      </div>

                      <div className="text-xs text-slate-600 space-y-2">
                        <p>
                          You are about to restore database from backup: <strong className="font-mono text-slate-800">{selectedBackupForRestore?.backupId}</strong>
                        </p>
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-[11px] text-amber-900">
                          <div>• <strong>Staged Candidate Verified:</strong> {stagedRestore.tableCount} tables found.</div>
                          <div>• <strong>Automatic Rollback Protection:</strong> A verified rollback backup of current live data will be taken before swapping.</div>
                          <div>• <strong>Active Target:</strong> {stagedRestore.targetDatabasePath}</div>
                        </div>
                      </div>

                      <label className="flex items-start gap-2 text-xs font-semibold text-slate-800 cursor-pointer pt-2">
                        <input
                          id="chk-confirm-restore"
                          type="checkbox"
                          checked={confirmOverwriteCheckbox}
                          onChange={(e) => setConfirmOverwriteCheckbox(e.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span>I understand that current data will be backed up and replaced with the selected backup snapshot.</span>
                      </label>

                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setRestoreModalOpen(false)}
                          disabled={restoring}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          id="btn-execute-restore"
                          type="button"
                          disabled={!confirmOverwriteCheckbox || restoring}
                          onClick={handleExecuteRestore}
                          className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all disabled:opacity-40"
                        >
                          {restoring ? 'Restoring...' : 'Restore Database'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 7.5: USER & DEDICATED DATABASE MANAGEMENT          */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-rose-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center justify-between pb-sm border-b border-outline-variant/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center shrink-0 shadow-2xs">
                      <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                        User &amp; Dedicated Database Management
                      </h3>
                      <p className="text-[11px] text-on-surface-variant m-0">
                        View registered application users and permanently delete user accounts with their isolated SQLite database files
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={fetchUsers}
                    disabled={loadingUsers}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-outline-variant/80 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${loadingUsers ? 'animate-spin' : ''}`}>sync</span>
                    Refresh Users
                  </button>
                </div>

                <div className="flex flex-col gap-md">
                  {loadingUsers ? (
                    <div className="p-4 text-center text-xs text-slate-400">Loading user accounts...</div>
                  ) : usersList.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      No users found.
                    </div>
                  ) : (
                    <div className="border border-outline-variant/60 rounded-xl overflow-hidden bg-white shadow-2xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-on-surface-variant text-[10px] uppercase font-bold tracking-wider">
                            <th className="py-2.5 px-3 border-b border-outline-variant/60">User / Account</th>
                            <th className="py-2.5 px-3 border-b border-outline-variant/60">Role</th>
                            <th className="py-2.5 px-3 border-b border-outline-variant/60">Assigned Workspace &amp; Database</th>
                            <th className="py-2.5 px-3 border-b border-outline-variant/60 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usersList.map((u) => {
                            const isStavan = u.username?.toLowerCase() === 'stavan';
                            return (
                              <tr key={u.id} className="border-b border-outline-variant/40 last:border-0 hover:bg-slate-50 transition-colors">
                                <td className="py-3 px-3 text-xs">
                                  <div className="font-bold text-slate-900">{u.displayName || u.username}</div>
                                  <div className="font-mono text-[11px] text-slate-500">@{u.username}</div>
                                </td>
                                <td className="py-3 px-3 text-xs">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    isStavan
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-indigo-100 text-indigo-800'
                                  }`}>
                                    {u.role}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-xs">
                                  {u.profiles && u.profiles.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                      {u.profiles.map((p: any) => (
                                        <div key={p.profileId} className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
                                          <span className="font-semibold text-slate-800">[{p.code}]</span>
                                          <span className="truncate max-w-[260px] text-[10px] text-slate-500" title={p.dbPath || 'No database file'}>
                                            {p.dbPath ? p.dbPath : 'No database file'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 text-[11px] italic">No assigned workspace</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  {isStavan ? (
                                    <span className="text-[11px] font-bold text-slate-400 italic px-2 py-1 bg-slate-100 rounded">
                                      Primary Admin (Protected)
                                    </span>
                                  ) : (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleDeactivateUser(u)}
                                        disabled={deactivatingUserId === u.id || !u.isActive}
                                        className="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                                        title="Deactivate this user (preserve database)"
                                      >
                                        <span className="material-symbols-outlined text-[14px]">pause_circle</span>
                                        {u.isActive === false ? 'Inactive' : 'Deactivate'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteUserModal(u)}
                                        className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                        title="Delete this user (preserves database)"
                                      >
                                        <span className="material-symbols-outlined text-[14px]">person_remove</span>
                                        Delete User
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 7.6: DATA PRESERVATION & UNINSTALL SAFETY GATE    */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-amber-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center justify-between pb-sm border-b border-outline-variant/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
                      <span className="material-symbols-outlined text-[18px]">security_update_good</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                        Pre-Uninstall Customer Data Preservation &amp; Safety Gate
                      </h3>
                      <p className="text-[11px] text-on-surface-variant m-0">
                        Mandatory multi-format backup (Database, CSVs, XLSX) and one-time authorization token required by Windows Installer
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunPreflight}
                    disabled={loadingPreflight}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-outline-variant/80 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${loadingPreflight ? 'animate-spin' : ''}`}>fact_check</span>
                    Run Preflight Scan
                  </button>
                </div>

                <div className="flex flex-col gap-md bg-white p-md rounded-xl border border-outline-variant/50 shadow-2xs">
                  {preservationMessage && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2 font-medium">
                      <span className="material-symbols-outlined text-[18px] text-emerald-700 shrink-0">check_circle</span>
                      <span>{preservationMessage}</span>
                    </div>
                  )}

                  {preservationError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs flex items-center gap-2 font-medium">
                      <span className="material-symbols-outlined text-[18px] text-rose-700 shrink-0">error</span>
                      <span>{preservationError}</span>
                    </div>
                  )}

                  {/* Preflight Summary Cards */}
                  {preflightData && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Classification</div>
                        <div className="text-xs font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            preflightData.classification === 'READY_FOR_UNINSTALL' || preflightData.classification === 'NO_CUSTOMER_DATA'
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                          }`} />
                          {preflightData.classification}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Customer DBs</div>
                        <div className="text-xs font-bold text-slate-800 mt-1">
                          {preflightData.activeDatabasesCount} database(s) detected
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Safety Gate Status</div>
                        <div className="text-xs font-bold mt-1">
                          {preflightData.canSafelyUninstall ? (
                            <span className="text-emerald-700 font-semibold">Authorized for Windows Uninstall</span>
                          ) : (
                            <span className="text-amber-800 font-semibold">Preservation Required</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dedicated Preservation Destination Selection Flow */}
                  <div className="space-y-3 pt-3 border-t border-outline-variant/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-slate-800">
                          Preservation Destination
                        </label>
                        <p className="text-[11px] text-slate-500 m-0">
                          Select the external or local storage folder where verified SQLite backups, CSVs, and XLSX will be preserved.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleBrowseDestination}
                        disabled={browsingDestination}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-750 border border-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        <span className="material-symbols-outlined text-[16px]">folder_open</span>
                        {browsingDestination ? 'Browsing...' : 'Browse...'}
                      </button>
                    </div>

                    <div className="p-3 bg-slate-50 border border-outline-variant/70 rounded-lg flex flex-col gap-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Selected:
                      </div>
                      <div className="text-xs font-mono text-slate-900 break-all font-semibold">
                        {customDestinationDir ? (
                          customDestinationDir
                        ) : (
                          <span className="text-slate-400 font-normal italic">
                            Default (%LOCALAPPDATA%\DiamondERP\exports)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customDestinationDir}
                        onChange={(e) => {
                          setCustomDestinationDir(e.target.value);
                          setDestinationValidationResult(null);
                        }}
                        placeholder="C:\Users\...\Documents\DiamondERP Backup"
                        className="flex-1 px-3 py-1.5 bg-white border border-outline-variant/70 rounded-lg text-xs font-mono text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => handleValidateDestination()}
                        disabled={validatingDestination}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-outline-variant/80 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                      >
                        <span className={`material-symbols-outlined text-[15px] ${validatingDestination ? 'animate-spin' : ''}`}>
                          verified
                        </span>
                        Validate Destination
                      </button>
                    </div>

                    {destinationValidationResult && (
                      <div
                        className={`p-2.5 rounded-lg text-xs flex items-center gap-2 font-medium ${
                          destinationValidationResult.valid
                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                            : 'bg-rose-50 border border-rose-200 text-rose-900'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] shrink-0">
                          {destinationValidationResult.valid ? 'check_circle' : 'error'}
                        </span>
                        <span>
                          {destinationValidationResult.valid
                            ? destinationValidationResult.message
                            : destinationValidationResult.error}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-outline-variant/40">
                    <button
                      type="button"
                      onClick={handleCreatePreservationPackage}
                      disabled={creatingPreservation}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-[16px] ${creatingPreservation ? 'animate-spin' : ''}`}>archive</span>
                      {creatingPreservation ? 'Creating Package...' : '1. Create Preservation Package'}
                    </button>

                    {preservationPackage && (
                      <button
                        type="button"
                        onClick={handleVerifyPreservation}
                        disabled={verifyingPreservation}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                      >
                        <span className={`material-symbols-outlined text-[16px] ${verifyingPreservation ? 'animate-spin' : ''}`}>verified</span>
                        {verifyingPreservation ? 'Verifying...' : '2. Verify Package'}
                      </button>
                    )}

                    {preservationPackage && preservationPackage.status === 'VERIFIED' && (
                      <button
                        type="button"
                        onClick={handleAuthorizeUninstall}
                        disabled={authorizingUninstall || Boolean(uninstallAuth)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                      >
                        <span className={`material-symbols-outlined text-[16px] ${authorizingUninstall ? 'animate-spin' : ''}`}>key</span>
                        {uninstallAuth ? 'Uninstall Authorized' : '3. Authorize Windows Uninstall'}
                      </button>
                    )}
                  </div>

                  {/* Token Status Display */}
                  {uninstallAuth && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs space-y-1">
                      <div className="font-bold text-amber-900 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-amber-700">lock_open</span>
                        Windows Uninstaller Authorization Token Issued
                      </div>
                      <div className="text-[11px] text-amber-800 font-mono">
                        Authorization ID: {uninstallAuth.authorizationId}
                      </div>
                      <div className="text-[11px] text-amber-800">
                        Expires At: {new Date(uninstallAuth.expiresAt).toLocaleString()} (Single-Use Token)
                      </div>
                      <p className="text-[11px] text-amber-900 m-0 mt-1 font-semibold">
                        The Windows installer (`Installer.exe /uninstall`) is now authorized to proceed. Customer databases and AppData are strictly preserved.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 8: DATA MANAGEMENT & EXCEL PORTABILITY            */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-violet-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center gap-2.5 pb-sm border-b border-outline-variant/60">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">import_export</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                      Data Management &amp; Excel Portability
                    </h3>
                    <p className="text-[11px] text-on-surface-variant m-0">
                      Export full 9-table schema or import structured diamond databases losslessly
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-md bg-white p-md rounded-xl border border-outline-variant/50 shadow-2xs">
                  <div>
                    <p className="text-xs text-on-surface m-0 leading-relaxed">
                      Import or Export your Inventory &amp; Ledger Data in Excel format for seamless, lossless transfer between users or profiles.
                    </p>
                    <p className="text-[11px] text-on-surface-variant m-0 mt-1">
                      Supports 9 comprehensive tables: <strong>Stocks</strong>, <strong>Locations</strong>, <strong>Parties</strong>, <strong>Diamonds</strong>, <strong>Certificates</strong>, <strong>Repairs</strong>, <strong>Ledgers</strong>, <strong>Transactions</strong>, and <strong>Transaction Items</strong>.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-outline-variant/40">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-on-surface-variant font-semibold whitespace-nowrap">Arrangement:</span>
                      <select
                        value={exportArrangement}
                        onChange={(e) => setExportArrangement(e.target.value as 'default' | 'party' | 'stock')}
                        className="h-7 px-2 border border-outline-variant/60 rounded-lg bg-white text-xs font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
                      >
                        <option value="default">Default Ledger Order</option>
                        <option value="party">Party-wise</option>
                        <option value="stock">Stock-wise</option>
                      </select>
                    </div>
                    <button 
                      type="button"
                      onClick={async () => {
                        setExporting(true);
                        try {
                          const blob = await api.exportExcel({ arrangement: exportArrangement });
                          downloadBlob(blob, `Diamond_Inventory_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
                        } catch(e: any) {
                          alert(e.message || 'Export failed');
                        } finally {
                          setExporting(false);
                        }
                      }}
                      disabled={exporting}
                      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-on-surface border border-outline-variant/60 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      {exporting ? 'Exporting...' : 'Export Data (Excel)'}
                    </button>
                    
                    <button 
                      type="button"
                      onClick={async () => {
                        try {
                          const blob = await api.downloadTemplate();
                          downloadBlob(blob, `Import_Template.xlsx`);
                        } catch(e: any) {
                          alert(e.message || 'Download template failed');
                        }
                      }}
                      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-on-surface border border-outline-variant/60 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">description</span>
                      Download Template
                    </button>
                    
                    <label className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer shadow-xs">
                      <span className="material-symbols-outlined text-[16px]">upload</span>
                      {importing ? 'Importing...' : 'Import Excel'}
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv" 
                        className="hidden" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setSelectedFile(file);
                          setImportError(null);
                          setImportModalOpen(true);
                          e.target.value = '';
                        }}
                        disabled={importing}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* SECTION 9: LOCAL DOCUMENT DRAFTS                          */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-[#F8FAFC] rounded-2xl border border-outline-variant overflow-hidden shadow-2xs">
              <div className="h-1 bg-purple-600" />
              <div className="p-lg flex flex-col gap-md">
                <div className="flex items-center gap-2.5 pb-sm border-b border-outline-variant/60">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <span className="material-symbols-outlined text-[18px]">draft</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface m-0 leading-tight">
                      Local Document Drafts
                    </h3>
                    <p className="text-[11px] text-on-surface-variant m-0">
                      Browser IndexedDB cached transaction forms and auto-save state recovery
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-md">
                  <div className="flex items-center justify-between p-md bg-white border border-outline-variant/50 rounded-xl shadow-2xs opacity-75">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-on-surface m-0 leading-tight">Auto-Save In-Progress Drafts</h4>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-300">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant m-0 mt-0.5">
                        Automatically preserve in-progress transaction forms locally so you never lose work (Feature Coming Soon).
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-not-allowed opacity-50" title="Coming Soon">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={false}
                        disabled
                        readOnly
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>

                  <p className="text-xs text-on-surface-variant m-0">Manage unsaved transaction drafts stored locally on this device.</p>
                  <div className="border border-outline-variant/60 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-on-surface-variant text-[10px] uppercase font-bold tracking-wider">
                          <th className="py-2 px-3 border-b border-outline-variant/60">Draft ID</th>
                          <th className="py-2 px-3 border-b border-outline-variant/60">Entity Type</th>
                          <th className="py-2 px-3 border-b border-outline-variant/60">Last Saved</th>
                          <th className="py-2 px-3 border-b border-outline-variant/60 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedDrafts.map(draft => (
                          <tr key={draft.id} className="border-b border-outline-variant/40 last:border-0 hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 px-3 text-xs text-on-surface font-mono font-bold">{draft.draftNumber}</td>
                            <td className="py-2.5 px-3 text-xs text-on-surface">{draft.entityType}</td>
                            <td className="py-2.5 px-3 text-xs text-on-surface-variant font-mono">
                              {new Date(draft.updatedAt).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button 
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Delete this local draft?')) return;
                                  if (draft.localId) {
                                    await deleteLocalDraft(draft.localId);
                                    refreshDrafts();
                                  }
                                }}
                                className="text-error hover:text-error-container p-1 rounded-md hover:bg-rose-50 transition-colors"
                                title="Delete Draft"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

              </div>
            </div>
          </form>
        )}
      </div>

      {importModalOpen && selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-lg flex flex-col gap-md">
            <h3 className="font-title-lg font-bold">Import Strategy</h3>
            <p className="font-body-md text-on-surface-variant">
              Before importing, we strongly recommend taking a backup. How would you like to import <strong>{selectedFile.name}</strong>?
            </p>
            
            <button 
              onClick={async () => {
                setExporting(true);
                try {
                  const blob = await api.exportExcel();
                  downloadBlob(blob, `PreImport_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
                } catch(e: any) {
                  alert(e.message || 'Backup failed');
                } finally {
                  setExporting(false);
                }
              }}
              className="w-full text-left p-sm border border-outline-variant rounded-md hover:bg-surface-container transition-colors font-bold text-primary flex items-center gap-sm"
            >
              <span className="material-symbols-outlined">download</span> Download Backup First
            </button>

            {importError && (
              <div className="bg-error-container text-on-error-container p-md rounded-md flex flex-col gap-sm">
                <div className="flex items-center gap-xs font-bold">
                  <span className="material-symbols-outlined">error</span>
                  Incorrect Format
                </div>
                <p className="font-body-md">{importError}</p>
                <button 
                  onClick={async () => {
                    try {
                      const blob = await api.downloadTemplate();
                      downloadBlob(blob, `Import_Template.xlsx`);
                    } catch(e: any) {
                      alert(e.message || 'Download template failed');
                    }
                  }}
                  className="bg-surface text-primary border border-primary px-sm py-xs rounded hover:bg-surface-container transition-colors w-fit font-bold flex items-center gap-xs"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Download Correct Template
                </button>
              </div>
            )}

            <div className="flex flex-col gap-sm mt-sm">
              <button 
                onClick={() => handleImportExecution('merge')}
                className="w-full p-sm bg-primary hover:bg-[#0D47A1] text-white rounded-md font-bold transition-colors"
              >
                Merge Data (Update existing, add new)
              </button>
              <button 
                onClick={() => handleImportExecution('overwrite')}
                className="w-full p-sm bg-error hover:bg-error-container text-white rounded-md font-bold transition-colors"
              >
                Delete All Current Data & Import New Data
              </button>
              
            </div>

            <button onClick={() => setImportModalOpen(false)} className="mt-md text-on-surface-variant hover:text-on-surface font-bold">Cancel</button>
          </div>
        </div>
      )}

      {deleteUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-lg flex flex-col gap-md">
            <div className="flex items-center gap-2 text-error">
              <span className="material-symbols-outlined text-[24px]">warning</span>
              <h3 className="font-title-lg font-bold">Confirm User Deletion</h3>
            </div>
            
            <p className="font-body-md text-on-surface">
              Are you sure you want to delete user <strong className="font-bold">{deleteUserModal.displayName}</strong> (<span className="font-mono">@{deleteUserModal.username}</span>)?
            </p>

            {deleteUserModal.profiles && deleteUserModal.profiles.length > 0 && (
              <div className="p-sm bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-1 text-xs">
                <span className="font-bold text-slate-700">Associated Profile &amp; Database:</span>
                {deleteUserModal.profiles.map((p: any) => (
                  <span key={p.profileId} className="font-mono text-[11px] text-slate-600">
                    Profile: {p.code} — {p.dbPath || 'No DB file'}
                  </span>
                ))}
              </div>
            )}

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] text-emerald-700 shrink-0">verified_user</span>
              <div>
                <span className="font-bold">Data Preservation Guarantee:</span>
                <p className="m-0 mt-0.5 text-emerald-800">
                  Deleting this user soft-deletes the user profile while strictly <strong>preserving</strong> their dedicated SQLite database file. It will remain discoverable in Recovery / Onboarding.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-md mt-sm">
              <button
                type="button"
                onClick={() => setDeleteUserModal(null)}
                disabled={Boolean(deletingUserId)}
                className="text-on-surface-variant hover:text-on-surface font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={Boolean(deletingUserId)}
                className="bg-error hover:bg-error-container text-white px-md py-sm rounded-md font-bold text-xs transition-colors flex items-center gap-1 shadow-xs"
              >
                {deletingUserId ? (
                  <>
                    <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                    Deleting...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                    Confirm Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {newProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-xl shadow-lg w-full max-w-sm p-lg flex flex-col gap-md">
            <h3 className="font-title-lg font-bold">Create New Profile</h3>
            <p className="font-body-md text-on-surface-variant">
              Enter a name for the new profile/workspace. This will create an isolated database for it.
            </p>
            <input 
              type="text"
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
              placeholder="e.g. MyNewCompany"
              className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
              autoFocus
            />
            <div className="flex items-center justify-end gap-md mt-sm">
              <button 
                onClick={() => {
                  setNewProfileModalOpen(false);
                  setNewProfileCallback(null);
                }} 
                className="text-on-surface-variant hover:text-on-surface font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (newProfileName.trim() && newProfileCallback) {
                    newProfileCallback(newProfileName.trim());
                    setNewProfileModalOpen(false);
                  }
                }}
                disabled={!newProfileName.trim()}
                className="bg-primary hover:bg-[#0D47A1] text-white px-md py-sm rounded-md font-bold transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
