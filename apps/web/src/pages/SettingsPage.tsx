import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { useDrafts } from '../hooks/useDrafts';
import { deleteLocalDraft } from '../services/draftDb';
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
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const directoryInputRef = React.useRef<HTMLInputElement>(null);

  const [draftAutoSaveEnabled, setDraftAutoSaveEnabled] = useState<boolean>(() => {
    return localStorage.getItem('draftAutoSaveEnabled') !== 'false';
  });

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
      <header className="px-margin-page py-lg bg-surface border-b border-outline-variant shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-gutter">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">{t('System Settings')}</h2>
            <p className="font-body-md text-on-surface-variant mt-xs">{t('Configure application parameters and defaults.')}</p>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-xs bg-[#1565C0] hover:bg-[#0D47A1] text-white rounded-md px-md py-sm font-body-md font-bold transition-colors disabled:opacity-50"
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
          <div className="bg-error-container text-on-error-container p-md rounded-md">
            {error}
          </div>
        ) : (
          <form className="max-w-3xl flex flex-col gap-xl pb-32" onSubmit={handleSave}>
            
            

            {/* ══════════════════════════════════════════════════════════ */}
            {/* APP LOCK & DEVICE SECURITY SECTION                       */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-md mb-lg border-b border-outline-variant pb-sm">
                <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm">
                  <span className="material-symbols-outlined text-primary">security</span>
                  {t('App Lock & Device Security')}
                </h3>
                
                {/* Master Switch & Status */}
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${
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
                        if (window.confirm(t('Turn OFF App Lock? The application will no longer lock after inactivity.'))) {
                          await disableAppLock();
                        }
                      } else {
                        try {
                          setDeviceRegistrationStatus(t('Prompting device lock...'));
                          const cred = await registerDeviceCredential();
                          await enableAppLock({
                            timeoutMinutes: sessionTimeoutMinutes,
                            credentialId: cred?.credentialId,
                          });
                          setDeviceRegistrationStatus(null);
                        } catch (err: any) {
                          console.warn('Device lock notice:', err);
                          await enableAppLock({ timeoutMinutes: sessionTimeoutMinutes });
                          setDeviceRegistrationStatus(null);
                        }
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isAppLockEnabled ? 'bg-primary' : 'bg-slate-300'
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

              <div className="flex flex-col gap-lg">
                <p className="font-body-md text-on-surface-variant">
                  {t('Protect DiamondERP with your device screen lock (Windows Hello, Fingerprint, Face ID, PIN, or Pattern) and configure automatic session timeout when idle.')}
                </p>

                {/* If Disabled: Show Call-to-action */}
                {!isAppLockEnabled && (
                  <div className="p-md bg-surface-container-lowest border border-dashed border-outline-variant rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-md">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[24px]">lock</span>
                      </div>
                      <div>
                        <h4 className="font-title-md font-bold text-on-surface">{t('App Lock is currently turned OFF')}</h4>
                        <p className="font-caption text-caption text-on-surface-variant">{t('Turn on App Lock to protect business transactions and stock inventory.')}</p>
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
                      className="px-md py-sm bg-primary hover:bg-[#0D47A1] text-white rounded-md font-bold text-sm transition-colors whitespace-nowrap"
                    >
                      {t('Enable App Lock')}
                    </button>
                  </div>
                )}

                {/* When Enabled */}
                {isAppLockEnabled && (
                  <>
                    {/* Session Inactivity Timeout Selection */}
                    <div className="p-md bg-surface-container-lowest border border-outline-variant rounded-lg flex flex-col gap-md">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-sm">
                        <div>
                          <h4 className="font-title-md font-bold text-on-surface flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[20px]">timer</span>
                            {t('Session Inactivity Timeout')}
                          </h4>
                          <p className="font-caption text-caption text-on-surface-variant">
                            {t('Configure how long the app stays idle before automatically locking. Choose from quick presets or set any custom duration (from 1 min to multiple days).')}
                          </p>
                        </div>
                        <div className="sm:text-right bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant/60 shrink-0">
                          <span className="text-xl font-mono font-black text-primary">{formatSessionTimeout(sessionTimeoutMinutes)}</span>
                          <div className="text-[11px] font-semibold text-on-surface-variant">
                            {sessionTimeoutMinutes >= 60 ? `(${sessionTimeoutMinutes.toLocaleString()} ${t('total mins')})` : t('inactivity period')}
                          </div>
                        </div>
                      </div>

                      {/* Quick Presets */}
                      <div>
                        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
                          {t('Quick Presets')}
                        </span>
                        <div className="flex flex-wrap gap-2">
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
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                sessionTimeoutMinutes === preset.value
                                  ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30'
                                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Duration Selector */}
                      <div className="pt-3 border-t border-outline-variant/40">
                        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-2">
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
                              className="w-24 px-3 py-1.5 font-bold border border-outline-variant rounded-md bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
                              className="px-3 py-1.5 font-medium border border-outline-variant rounded-md bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                            >
                              <option value="minutes">{t('Minutes')}</option>
                              <option value="hours">{t('Hours')}</option>
                              <option value="days">{t('Days')}</option>
                            </select>
                          </div>

                          <div className="text-xs text-on-surface-variant flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px] text-primary">info</span>
                            <span>
                              {t('App locks after')} <strong>{formatSessionTimeout(sessionTimeoutMinutes)}</strong> {t('of inactivity.')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Device Lock Authentication Info & Actions */}
                    <div className="p-md bg-surface-container-lowest border border-outline-variant rounded-lg flex flex-col gap-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary text-[20px]">fingerprint</span>
                          <h4 className="font-title-md font-bold text-on-surface">{t('Native Device Lock (Windows Hello / Phone Lock)')}</h4>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                          {isPlatformAuthSupported ? t('Native Device Lock Detected') : t('Standard Device Lock')}
                        </span>
                      </div>
                      <p className="font-caption text-caption text-on-surface-variant">
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
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded-md text-xs font-bold text-on-surface transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px] text-primary">devices</span>
                          <span>{deviceRegistrationStatus || t('Test Device Lock Screen')}</span>
                        </button>
                      </div>
                    </div>

                    {/* Section 3: Lock Now & OFF Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-md pt-md border-t border-outline-variant">
                      <button
                        type="button"
                        onClick={lockNow}
                        className="flex items-center gap-2 bg-primary hover:bg-[#0D47A1] text-white px-md py-sm rounded-md font-bold text-sm transition-colors shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">lock</span>
                        {t('Lock Screen Now')}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(t('Are you sure you want to turn OFF App Lock? The application will no longer lock after inactivity.'))) {
                            await disableAppLock();
                          }
                        }}
                        className="flex items-center gap-1.5 text-error hover:bg-error-container/20 border border-error/30 hover:border-error px-md py-sm rounded-md font-bold text-sm transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">lock_open</span>
                        {t('Turn Off App Lock')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">domain</span>
                Workspace &amp; Profile Selection
              </h3>
              
              <div className="flex flex-col gap-md">
                <p className="font-body-md text-on-surface-variant">
                  Select your active company profile or create a new isolated tenant database.
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-md">
                  <div className="flex-1 max-w-xs">
                    <label className="font-caption text-caption font-bold text-on-surface-variant mb-xs block">Active Profile</label>
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
                      className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface font-semibold"
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
                          await api.switchProfile(name);
                          switchProfile(name);
                          setActiveProfile(name);
                          window.location.reload();
                        } catch (err: any) {
                          alert(err.message || 'Failed to create profile');
                        }
                      });
                      setNewProfileModalOpen(true);
                    }}
                    className="mt-4 sm:mt-auto px-md py-sm bg-primary hover:bg-[#0D47A1] text-white rounded-md font-bold text-sm transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_business</span>
                    New Profile
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">store</span>
                Company Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Company Name</label>
                  <input 
                    type="text" 
                    value={settings.companyName || ''}
                    onChange={e => handleChange('companyName', e.target.value)}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Contact Email</label>
                  <input 
                    type="email" 
                    value={settings.contactEmail || ''}
                    onChange={e => handleChange('contactEmail', e.target.value)}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Address</label>
                  <textarea 
                    value={settings.companyAddress || ''}
                    onChange={e => handleChange('companyAddress', e.target.value)}
                    rows={3}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface resize-none"
                  />
                </div>
              </div>
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">payments</span>
                Financial & Currency
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Default Currency</label>
                  <select 
                    value={settings.defaultCurrency || 'INR'}
                    onChange={e => handleChange('defaultCurrency', e.target.value)}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Tax Rate (%)</label>
                  <input 
                    type="number"
                    step="0.1" 
                    value={settings.taxRate || '0'}
                    onChange={e => handleChange('taxRate', e.target.value)}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
              </div>
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">language</span>
                {t('Language & Localization')}
              </h3>
              
              <div className="flex flex-col gap-xs max-w-md">
                <label className="font-caption text-caption font-bold text-on-surface-variant">{t('Display Language')}</label>
                <select 
                  value={i18n.language}
                  onChange={e => {
                    i18n.changeLanguage(e.target.value);
                    localStorage.setItem('appLanguage', e.target.value);
                  }}
                  className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
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
                <p className="text-xs text-on-surface-variant mt-1">Changes are applied immediately.</p>
              </div>
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">sync</span>
                System & Sync
              </h3>
              
              <div className="flex flex-col gap-md">
                <div className="flex items-center justify-between p-md border border-outline-variant rounded-md">
                  <div>
                    <h4 className="font-title-md font-bold text-on-surface">Auto-Sync to Google Sheets</h4>
                    <p className="font-caption text-caption text-on-surface-variant">Automatically backup data periodically.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={settings.autoSync === 'true'}
                      onChange={e => handleChange('autoSync', e.target.checked ? 'true' : 'false')}
                    />
                    <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1565C0]"></div>
                  </label>
                </div>
                
                {settings.autoSync === 'true' && (
                  <div className="flex flex-col gap-xs">
                    <label className="font-caption text-caption font-bold text-on-surface-variant">Sync Interval (Minutes)</label>
                    <select 
                      value={settings.syncInterval || '15'}
                      onChange={e => handleChange('syncInterval', e.target.value)}
                      className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="5">5 Minutes</option>
                      <option value="15">15 Minutes</option>
                      <option value="30">30 Minutes</option>
                      <option value="60">1 Hour</option>
                    </select>
                  </div>
                )}
                
                <div className="mt-md pt-md border-t border-outline-variant">
                  <h4 className="font-title-md font-bold text-error mb-xs">Danger Zone</h4>
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
                    className="flex items-center gap-xs bg-error hover:bg-error-container text-white px-md py-sm rounded-md font-bold transition-colors w-fit"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                    Delete All System Data
                  </button>
                </div>
              </div>
            </section>
            
            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">save</span>
                Local Data Saving & Backups
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Local Backup Directory Path</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g., C:\ERP_Backups or /backups"
                      value={settings.localBackupPath || ''}
                      onChange={e => handleChange('localBackupPath', e.target.value)}
                      className="flex-1 px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                    />
                    <button
                      type="button"
                      onClick={handleSelectDirectory}
                      className="flex items-center gap-1.5 px-md py-sm bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded-md text-on-surface font-bold text-sm transition-colors whitespace-nowrap shadow-2xs"
                      title="Select folder from user device"
                    >
                      <span className="material-symbols-outlined text-[18px] text-primary">folder_open</span>
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
                  <p className="text-xs text-on-surface-variant mt-1">Select or enter the storage directory on this system where backups will be stored.</p>
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Backup Format</label>
                  <select 
                    value={settings.localBackupFormat || 'CSV'}
                    onChange={e => handleChange('localBackupFormat', e.target.value)}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                  >
                    <option value="CSV">CSV</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">import_export</span>
                Data Management
              </h3>
              
              <div className="flex flex-col gap-md">
                <div>
                  <p className="font-body-md text-on-surface">
                    Import or Export your Inventory &amp; Ledger Data in Excel format for seamless, lossless transfer between users or profiles.
                  </p>
                  <p className="font-caption text-caption text-on-surface-variant mt-xs">
                    Supports 9 comprehensive tables: <strong>Stocks</strong>, <strong>Locations</strong>, <strong>Parties</strong>, <strong>Diamonds</strong> (with Polish, Symmetry, Fluorescence &amp; Dimensions), <strong>Certificates</strong>, <strong>Repairs</strong>, <strong>Ledgers</strong> (with Opening, Debit, Credit &amp; Closing Balance), <strong>Transactions</strong> (with Debit, Credit &amp; Running Closing Balance), and <strong>Transaction Items</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap gap-md">
                  <button 
                    type="button"
                    onClick={async () => {
                      setExporting(true);
                      try {
                        const blob = await api.exportExcel();
                        downloadBlob(blob, `Diamond_Inventory_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
                      } catch(e: any) {
                        alert(e.message || 'Export failed');
                      } finally {
                        setExporting(false);
                      }
                    }}
                    disabled={exporting}
                    className="flex items-center gap-xs bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant rounded-md px-md py-sm font-body-md font-bold transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
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
                    className="flex items-center gap-xs bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant rounded-md px-md py-sm font-body-md font-bold transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">description</span>
                    Download Template
                  </button>
                  
                  <label className="flex items-center gap-xs bg-primary hover:bg-[#0D47A1] text-white rounded-md px-md py-sm font-body-md font-bold transition-colors cursor-pointer">
                    <span className="material-symbols-outlined text-[18px]">upload</span>
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
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">draft</span>
                Local Document Drafts
              </h3>
              
              <div className="flex flex-col gap-md">
                <div className="flex items-center justify-between p-md border border-outline-variant rounded-md bg-surface-container-lowest">
                  <div>
                    <h4 className="font-title-md font-bold text-on-surface">Auto-Save In-Progress Drafts</h4>
                    <p className="font-caption text-caption text-on-surface-variant">Automatically preserve in-progress transaction forms locally so you never lose work.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !draftAutoSaveEnabled;
                        setDraftAutoSaveEnabled(next);
                        localStorage.setItem('draftAutoSaveEnabled', next.toString());
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        draftAutoSaveEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                      role="switch"
                      aria-checked={draftAutoSaveEnabled}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          draftAutoSaveEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-xs font-bold ${draftAutoSaveEnabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {draftAutoSaveEnabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                </div>
                <p className="font-body-md text-on-surface-variant">Manage unsaved transaction drafts stored locally on this device.</p>
                {drafts.length === 0 ? (
                  <div className="text-center p-xl bg-surface-container-lowest rounded-lg border border-outline-variant border-dashed">
                    <span className="material-symbols-outlined text-outline text-[48px] mb-sm">draft</span>
                    <p className="text-on-surface-variant font-body-lg">No local drafts found.</p>
                  </div>
                ) : (
                  <div className="border border-outline-variant rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-container text-on-surface-variant text-label-lg uppercase">
                          <th className="p-sm border-b border-outline-variant">Draft ID</th>
                          <th className="p-sm border-b border-outline-variant">Entity Type</th>
                          <th className="p-sm border-b border-outline-variant">Last Saved</th>
                          <th className="p-sm border-b border-outline-variant">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-surface">
                        {drafts.map(draft => (
                          <tr key={draft.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-lowest">
                            <td className="p-sm text-body-md text-on-surface font-mono">{draft.draftNumber}</td>
                            <td className="p-sm text-body-md text-on-surface">{draft.entityType}</td>
                            <td className="p-sm text-body-md text-on-surface-variant">
                              {new Date(draft.updatedAt).toLocaleString()}
                            </td>
                            <td className="p-sm">
                              <button 
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Delete this local draft?')) return;
                                  if (draft.localId) {
                                    await deleteLocalDraft(draft.localId);
                                    refreshDrafts();
                                  }
                                }}
                                className="text-error hover:text-error-container p-1 rounded transition-colors"
                                title="Delete Draft"
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
            
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
