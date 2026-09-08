import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLock } from '../../contexts/AppLockContext';

export const AppLockOverlay: React.FC = () => {
  const { t } = useTranslation();
  const {
    isLocked,
    unlockWithDevice,
    unlockWithPin,
    hasBackupPin,
    hasDeviceLock,
  } = useAppLock();

  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifyingDevice, setIsVerifyingDevice] = useState(false);
  const [isSubmittingPin, setIsSubmittingPin] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // When lock screen opens, automatically attempt device verification once if device lock is available
  useEffect(() => {
    if (isLocked && hasDeviceLock && !showPinInput) {
      // Small delay to ensure browser UI is ready
      const timer = setTimeout(() => {
        handleDeviceUnlock();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isLocked]);

  if (!isLocked) return null;

  const handleDeviceUnlock = async () => {
    if (cooldownRemaining > 0 || isVerifyingDevice) return;
    setErrorMsg(null);
    setIsVerifyingDevice(true);
    try {
      const res = await unlockWithDevice();
      if (!res.success) {
        if (res.error) {
          setErrorMsg(res.error);
        }
        if (hasBackupPin) {
          setShowPinInput(true);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
      if (hasBackupPin) {
        setShowPinInput(true);
      }
    } finally {
      setIsVerifyingDevice(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownRemaining > 0 || isSubmittingPin || !pin.trim()) return;

    setErrorMsg(null);
    setIsSubmittingPin(true);
    try {
      const res = await unlockWithPin(pin);
      if (!res.success) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        if (nextAttempts >= 5) {
          setCooldownRemaining(30);
          setErrorMsg('Too many failed attempts. Please wait 30 seconds.');
        } else {
          setErrorMsg(res.error || `Incorrect PIN (${5 - nextAttempts} attempts remaining).`);
        }
        setPin('');
      } else {
        setPin('');
        setFailedAttempts(0);
        setErrorMsg(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'PIN unlock failed');
    } finally {
      setIsSubmittingPin(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App Lock Screen"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 select-none overflow-y-auto"
    >
      <div className="w-full max-w-md bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl p-8 text-center flex flex-col items-center gap-6 relative overflow-hidden">
        
        {/* Glow ambient decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Lock Shield Icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary to-blue-500 flex items-center justify-center shadow-lg shadow-primary/30 ring-4 ring-primary/20">
            <span className="material-symbols-outlined text-white text-[42px]">
              lock
            </span>
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 border-2 border-slate-900 rounded-full flex items-center justify-center text-white" title="Protected by Device Lock">
            <span className="material-symbols-outlined text-[16px]">security</span>
          </div>
        </div>

        {/* Title & Description */}
        <div className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>DiamondERP</span>
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-blue-300 border border-primary/40">
              LOCKED
            </span>
          </h2>
          <p className="text-sm text-slate-300">
            {t('Session secured with device lock. Authenticate with your Windows Hello, laptop PIN, fingerprint, or phone screen lock to resume.')}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="w-full bg-rose-500/15 border border-rose-500/30 text-rose-300 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 text-left animate-shake">
            <span className="material-symbols-outlined text-[18px] shrink-0 text-rose-400">error</span>
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {/* Cooldown notice */}
        {cooldownRemaining > 0 && (
          <div className="w-full bg-amber-500/15 border border-amber-500/30 text-amber-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[18px]">timer</span>
            <span>Cooldown active: retry in {cooldownRemaining}s</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="w-full flex flex-col gap-3">
          {/* Device Unlock Button */}
          {hasDeviceLock && (
            <button
              type="button"
              onClick={handleDeviceUnlock}
              disabled={isVerifyingDevice || cooldownRemaining > 0}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-500 active:scale-[0.98] text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isVerifyingDevice ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
                  <span>{t('Verifying with Device...')}</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[22px]">fingerprint</span>
                  <span>{t('Unlock with Device Lock (Phone / Laptop Lock)')}</span>
                </>
              )}
            </button>
          )}

          {/* Subtext explaining device lock options */}
          <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-primary">devices</span>
            <span>{t('Uses the screen lock already configured on your device (Windows Hello / Phone lock)')}</span>
          </div>

          {/* PIN Option / Fallback */}
          {hasBackupPin && (
            <div className="mt-2 w-full pt-4 border-t border-slate-800">
              {!showPinInput ? (
                <button
                  type="button"
                  onClick={() => setShowPinInput(true)}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors flex items-center justify-center gap-1 mx-auto"
                >
                  <span className="material-symbols-outlined text-[16px]">pin</span>
                  <span>{t('Use Backup PIN Instead')}</span>
                </button>
              ) : (
                <form onSubmit={handlePinSubmit} className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-slate-300 text-left block">
                    {t('Enter Backup Security PIN')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={12}
                      autoFocus
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      placeholder="••••"
                      disabled={isSubmittingPin || cooldownRemaining > 0}
                      className="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-2.5 text-center text-lg tracking-widest text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingPin || !pin.trim() || cooldownRemaining > 0}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold rounded-xl text-sm border border-slate-600 transition-all disabled:opacity-50"
                    >
                      {isSubmittingPin ? (
                        <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      ) : (
                        <span>{t('Unlock')}</span>
                      )}
                    </button>
                  </div>
                  {hasDeviceLock && (
                    <button
                      type="button"
                      onClick={() => setShowPinInput(false)}
                      className="text-[11px] text-slate-400 hover:text-slate-300 transition-colors mt-1"
                    >
                      ← Back to Device Lock
                    </button>
                  )}
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="text-[11px] text-slate-500">
          DiamondERP Enterprise Security &bull; Client Data Protected
        </div>

      </div>
    </div>
  );
};
