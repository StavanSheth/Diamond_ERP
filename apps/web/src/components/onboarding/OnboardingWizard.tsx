import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type {
  OnboardingStatusDto,
  UserDiscoveryCandidateDto,
  DatabaseDiscoveryCandidateDto,
  DatabaseAttachmentPreviewDto,
} from '@diamond-erp/contracts';

export const OnboardingWizard: React.FC = () => {
  const [status, setStatus] = useState<OnboardingStatusDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // PIN step state
  const [pin, setPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');

  // Device step state
  const [deviceName, setDeviceName] = useState<string>('Main Workstation');

  // User step state
  const [userMode, setUserMode] = useState<'SELECT' | 'CREATE'>('SELECT');
  const [userCandidates, setUserCandidates] = useState<UserDiscoveryCandidateDto[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newDisplayName, setNewDisplayName] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // Database step state
  const [dbMode, setDbMode] = useState<'EXISTING' | 'NEW'>('NEW');
  const [dbCandidates, setDbCandidates] = useState<DatabaseDiscoveryCandidateDto[]>([]);
  const [candidatePath, setCandidatePath] = useState<string>('');
  const [inspectPreview, setInspectPreview] = useState<DatabaseAttachmentPreviewDto | null>(null);
  const [confirmAttach, setConfirmAttach] = useState<boolean>(false);
  const [newDbName, setNewDbName] = useState<string>('Main Company');

  const fetchStatus = async () => {
    try {
      setError(null);
      const data = await api.onboarding.getStatus();
      setStatus(data);

      if (data.lifecycleState === 'USER_DISCOVERY') {
        const users = await api.onboarding.discoverUsers();
        setUserCandidates(users.candidates);
        if (users.candidates.length > 0) {
          setSelectedUserId(users.candidates[0].id);
          setUserMode('SELECT');
        } else {
          setUserMode('CREATE');
        }
      } else if (
        data.lifecycleState === 'DATABASE_DISCOVERY' ||
        data.lifecycleState === 'DATABASE_VALIDATION' ||
        data.lifecycleState === 'DATABASE_SETUP'
      ) {
        const dbs = await api.onboarding.discoverDatabases();
        setDbCandidates(dbs.candidates);
        // Important: Never automatically pre-select candidates[0].
        // User must explicitly click or enter a database path.
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load onboarding status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (loading) return null;
  if (!status || status.ready || status.lifecycleState === 'READY') {
    return null;
  }

  // ── Step 1: App Setup ───────────────────────────────────────────────────
  const handleAppSetup = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.onboarding.initializeApp();
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize application setup');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 2: PIN Setup ───────────────────────────────────────────────────
  const handlePinSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.security.setupPin(pin);
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to configure application PIN');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 3: Device Setup ────────────────────────────────────────────────
  const handleDeviceSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName.trim()) {
      setError('Please provide a valid device name');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.onboarding.registerDevice(deviceName.trim());
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to register device');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 4: User Selection / Creation ───────────────────────────────────
  const handleUserStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (userMode === 'SELECT') {
        if (!selectedUserId) {
          setError('Please select a business user to associate with this installation.');
          setSubmitting(false);
          return;
        }
        await api.onboarding.selectUser(selectedUserId);
      } else {
        if (newPassword.length < 12) {
          setError('Password must be at least 12 characters');
          setSubmitting(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError('Passwords do not match');
          setSubmitting(false);
          return;
        }
        await api.onboarding.createUser({
          username: newUsername.trim(),
          password: newPassword,
          displayName: newDisplayName.trim() || newUsername.trim(),
          role: 'ADMIN',
        });
      }
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message || 'User configuration failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 5: Database Inspection & Attachment / Creation ──────────────────
  const runInspectPath = async (targetPath: string) => {
    if (!targetPath.trim()) {
      setError('Please enter or select a database path');
      return;
    }
    setSubmitting(true);
    setError(null);
    setInspectPreview(null);
    setConfirmAttach(false);
    try {
      const preview = await api.onboarding.inspectDatabase(targetPath.trim());
      setInspectPreview(preview);
    } catch (err: any) {
      setError(err?.message || 'Inspection failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInspect = async () => {
    await runInspectPath(candidatePath);
  };

  const handleSelectCandidate = async (candidate: DatabaseDiscoveryCandidateDto) => {
    setCandidatePath(candidate.canonicalPath);
    await runInspectPath(candidate.canonicalPath);
  };

  const handleAttachExisting = async () => {
    if (!confirmAttach) {
      setError('You must confirm attachment of the existing database.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.onboarding.attachDatabase({
        path: candidatePath.trim(),
        confirmAttachment: true,
      });
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message || 'Attachment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateNewDb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbName.trim()) {
      setError('Please provide a database name');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.onboarding.createDatabase({
        displayName: newDbName.trim(),
      });
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message || 'New database creation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 6: Final Complete Onboarding ───────────────────────────────────
  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.onboarding.completeOnboarding();
      await fetchStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to finalize onboarding');
    } finally {
      setSubmitting(false);
    }
  };

  const currentStep = status.lifecycleState;

  return (
    <div
      id="onboarding-wizard-overlay"
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 select-none animate-fadeIn text-slate-100 overflow-y-auto"
    >
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-8 relative my-8">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        {/* Header */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Diamond ERP Setup</h1>
            <p className="text-xs text-slate-400">Step: {currentStep}</p>
          </div>
          <span className="text-xs px-3 py-1 bg-indigo-500/20 text-indigo-400 rounded-full font-mono">
            V3.0
          </span>
        </div>

        {error && (
          <div
            id="onboarding-error-banner"
            className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2"
          >
            <span>{error}</span>
          </div>
        )}

        {/* STEP: NOT_INITIALIZED / APP_SETUP */}
        {(currentStep === 'NOT_INITIALIZED' || currentStep === 'APP_SETUP') && (
          <div className="space-y-6">
            <div className="text-slate-300 text-sm leading-relaxed">
              Welcome to Diamond ERP. Let&apos;s get your workstation set up with secure storage and local identity.
            </div>
            <button
              id="btn-init-app"
              type="button"
              disabled={submitting}
              onClick={handleAppSetup}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg transition-all"
            >
              {submitting ? 'Initializing...' : 'Initialize Application Setup'}
            </button>
          </div>
        )}

        {/* STEP: PIN_SETUP */}
        {currentStep === 'PIN_SETUP' && (
          <form onSubmit={handlePinSetup} className="space-y-5">
            <div className="text-slate-300 text-sm leading-relaxed">
              Configure a 6-digit device PIN to secure your local Diamond ERP terminal.
            </div>
            <div>
              <label htmlFor="input-setup-pin" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                New 6-Digit PIN
              </label>
              <input
                id="input-setup-pin"
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-center text-2xl tracking-widest text-slate-100 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="input-confirm-pin" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Confirm PIN
              </label>
              <input
                id="input-confirm-pin"
                type="password"
                maxLength={6}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-center text-2xl tracking-widest text-slate-100 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              id="btn-confirm-pin"
              type="submit"
              disabled={submitting || pin.length !== 6 || confirmPin.length !== 6}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              {submitting ? 'Saving PIN...' : 'Set Application PIN'}
            </button>
          </form>
        )}

        {/* STEP: DEVICE_SETUP */}
        {currentStep === 'DEVICE_SETUP' && (
          <form onSubmit={handleDeviceSetup} className="space-y-5">
            <div className="text-slate-300 text-sm leading-relaxed">
              Register this terminal to uniquely link local security and authorization keys.
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Workstation / Device Name
              </label>
              <input
                id="input-device-name"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Sales Counter Terminal"
                className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-100 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              id="btn-register-device"
              type="submit"
              disabled={submitting || !deviceName.trim()}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Register Device & Continue'}
            </button>
          </form>
        )}

        {/* STEP: USER_DISCOVERY */}
        {currentStep === 'USER_DISCOVERY' && (
          <form onSubmit={handleUserStep} className="space-y-5">
            <div className="flex gap-4 border-b border-slate-800 pb-3">
              {userCandidates.length > 0 && (
                <button
                  type="button"
                  onClick={() => setUserMode('SELECT')}
                  className={`text-sm font-medium pb-2 border-b-2 ${
                    userMode === 'SELECT'
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-slate-400'
                  }`}
                >
                  Use Existing User ({userCandidates.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setUserMode('CREATE')}
                className={`text-sm font-medium pb-2 border-b-2 ${
                  userMode === 'CREATE'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400'
                }`}
              >
                Create New Business User
              </button>
            </div>

            {userMode === 'SELECT' ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Select User
                </label>
                <select
                  id="select-user-dropdown"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-100 focus:ring-2 focus:ring-indigo-500"
                >
                  {userCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.username}) — Role: {u.role}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Username
                  </label>
                  <input
                    id="input-new-username"
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. stavan"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Display Name
                  </label>
                  <input
                    id="input-new-displayname"
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="e.g. Stavan Sheth"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Password (min. 12 chars)
                  </label>
                  <input
                    id="input-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    id="input-new-password-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-100"
                  />
                </div>
              </div>
            )}

            <button
              id="btn-confirm-user"
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              {submitting ? 'Saving User...' : 'Continue to Database Setup'}
            </button>
          </form>
        )}

        {/* STEP: DATABASE_DISCOVERY / VALIDATION / SETUP */}
        {(currentStep === 'DATABASE_DISCOVERY' ||
          currentStep === 'DATABASE_VALIDATION' ||
          currentStep === 'DATABASE_SETUP') && (
          <div className="space-y-5">
            <div className="flex gap-4 border-b border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => {
                  setDbMode('NEW');
                  setInspectPreview(null);
                  setConfirmAttach(false);
                }}
                className={`text-sm font-medium pb-2 border-b-2 ${
                  dbMode === 'NEW'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400'
                }`}
              >
                Create New Database
              </button>
              <button
                type="button"
                onClick={() => {
                  setDbMode('EXISTING');
                  setInspectPreview(null);
                  setConfirmAttach(false);
                }}
                className={`text-sm font-medium pb-2 border-b-2 ${
                  dbMode === 'EXISTING'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400'
                }`}
              >
                Use Existing Database
              </button>
            </div>

            {dbMode === 'NEW' ? (
              <form onSubmit={handleCreateNewDb} className="space-y-4">
                <div className="text-slate-300 text-xs leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                  This will create a new pristine Diamond ERP database from the immutable schema template. Existing databases will not be modified.
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Database / Profile Name
                  </label>
                  <input
                    id="input-new-dbname"
                    type="text"
                    value={newDbName}
                    onChange={(e) => setNewDbName(e.target.value)}
                    placeholder="e.g. Mumbai Main Office"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-100"
                  />
                </div>
                <button
                  id="btn-create-db"
                  type="submit"
                  disabled={submitting || !newDbName.trim()}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg transition-all disabled:opacity-50"
                >
                  {submitting ? 'Creating Database...' : 'Create Database'}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                {/* Discovered Candidates List */}
                {dbCandidates.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Discovered Databases ({dbCandidates.length})
                    </label>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {dbCandidates.map((c) => (
                        <div
                          key={c.canonicalPath}
                          className={`p-3 rounded-xl border transition-all text-xs flex items-center justify-between gap-3 ${
                            candidatePath === c.canonicalPath
                              ? 'bg-indigo-950/30 border-indigo-500/60'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div className="font-medium text-slate-200 truncate">{c.displayName}</div>
                            <div className="text-slate-400 font-mono text-[11px] truncate">{c.canonicalPath}</div>
                            <div className="flex gap-2 mt-1">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                                {c.source === 'REGISTRY' ? 'Registered database' : 'Local Diamond ERP directory'}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-900/40 text-indigo-300">
                                {c.status}
                              </span>
                            </div>
                          </div>
                          <button
                            id={`btn-select-inspect-${c.displayName}`}
                            type="button"
                            onClick={() => handleSelectCandidate(c)}
                            disabled={submitting}
                            className="px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium shrink-0"
                          >
                            Select & Inspect
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual Path Entry Option */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Database File Path (.db)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="input-candidate-path"
                      type="text"
                      value={candidatePath}
                      onChange={(e) => setCandidatePath(e.target.value)}
                      placeholder="C:\DiamondERP\databases\company.db"
                      className="flex-1 px-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-slate-100 font-mono text-xs"
                    />
                    <button
                      id="btn-inspect-path"
                      type="button"
                      onClick={handleInspect}
                      disabled={submitting || !candidatePath.trim()}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium shrink-0"
                    >
                      {submitting ? 'Checking...' : 'Inspect Path'}
                    </button>
                  </div>
                </div>

                {/* Inspection Preview Panel */}
                {inspectPreview && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-sm">
                    <div className="font-semibold text-white flex items-center justify-between">
                      <span>Inspection Result:</span>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          inspectPreview.suitability === 'REQUIRES_CONFIRMATION' || inspectPreview.suitability === 'VALID'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : inspectPreview.suitability === 'CONFLICT'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {inspectPreview.suitability}
                      </span>
                    </div>
                    <div>Database: <span className="text-slate-200 font-medium">{inspectPreview.displayName}</span></div>
                    <div className="text-xs text-slate-400 font-mono truncate">{inspectPreview.canonicalPath}</div>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-slate-300">
                      <div>Status: <span className="text-indigo-400">{inspectPreview.status}</span></div>
                      <div>Tables Found: <span className="text-indigo-400">{inspectPreview.tableCount}</span></div>
                      {inspectPreview.profileCode && (
                        <div>Profile: <span className="text-indigo-400">{inspectPreview.profileCode}</span></div>
                      )}
                      {inspectPreview.schemaVersion > 0 && (
                        <div>Schema Version: <span className="text-indigo-400">{inspectPreview.schemaVersion}</span></div>
                      )}
                    </div>

                    {inspectPreview.details && (
                      <div className="text-xs text-slate-400 pt-1">{inspectPreview.details}</div>
                    )}

                    {/* Show Confirmation Checkbox & Attach Button ONLY if suitable */}
                    {(inspectPreview.suitability === 'REQUIRES_CONFIRMATION' || inspectPreview.suitability === 'VALID') ? (
                      <div className="pt-3 border-t border-slate-800 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                          <input
                            id="checkbox-confirm-attach"
                            type="checkbox"
                            checked={confirmAttach}
                            onChange={(e) => setConfirmAttach(e.target.checked)}
                            className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>I confirm that I want to attach this database to this Diamond ERP installation.</span>
                        </label>

                        <button
                          id="btn-attach-db"
                          type="button"
                          disabled={submitting || !confirmAttach}
                          onClick={handleAttachExisting}
                          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg transition-all disabled:opacity-50"
                        >
                          {submitting ? 'Attaching...' : 'Use This Database'}
                        </button>
                      </div>
                    ) : (
                      <div className="pt-2 text-xs text-red-400 bg-red-950/30 p-2.5 rounded-lg border border-red-900/50">
                        This database cannot be attached: {inspectPreview.details || inspectPreview.conflictReason || 'Incompatible or invalid database.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentStep === 'DATABASE_SETUP' && (
              <div className="pt-4 border-t border-slate-800">
                <button
                  id="btn-complete-onboarding"
                  type="button"
                  disabled={submitting}
                  onClick={handleComplete}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-lg transition-all"
                >
                  {submitting ? 'Finalizing Setup...' : 'Complete Onboarding & Enter App'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
