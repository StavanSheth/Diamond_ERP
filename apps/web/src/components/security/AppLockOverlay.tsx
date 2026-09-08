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

  // Helper to sanitize any unexpected raw technical error messages
  const cleanErrorMessage = (msg?: string | null): string | null => {
    if (!msg) return null;
    if (msg.includes('w3.org') || msg.includes('webauthn') || msg.includes('timed out') || msg.includes('not allowed')) {
      return 'Verification timed out or was cancelled. Please try again or use your PIN.';
    }
    return msg;
  };

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
        setErrorMsg(cleanErrorMessage(res.error) || 'Verification was cancelled. Please try again.');
        if (hasBackupPin) {
          setShowPinInput(true);
        }
      }
    } catch (err: any) {
      setErrorMsg(cleanErrorMessage(err.message) || 'Verification failed. Please try again.');
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
          setErrorMsg('Too many attempts. Please wait 30 seconds.');
        } else {
          setErrorMsg(`Incorrect PIN (${5 - nextAttempts} attempts left).`);
        }
        setPin('');
      } else {
        setPin('');
        setFailedAttempts(0);
        setErrorMsg(null);
      }
    } catch (err: any) {
      setErrorMsg('PIN unlock failed. Please try again.');
    } finally {
      setIsSubmittingPin(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App Lock Screen"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 select-none overflow-y-auto animate-fadeIn"
    >
      <div className="w-full max-w-sm bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl p-7 text-center flex flex-col items-center gap-5 relative overflow-hidden text-slate-100">
        
        {/* Glow decoration */}
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Clean Lock Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-500/15">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {/* Title & Simple Description */}
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <span>DiamondERP</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Locked
            </span>
          </h2>
          <p className="text-sm text-slate-400">
            {t('Unlock your session to continue')}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="w-full bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2.5 text-left animate-shake">
            <svg className="w-4 h-4 text-rose-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="flex-1 leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Cooldown notice */}
        {cooldownRemaining > 0 && (
          <div className="w-full bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-2">
            <span>Please wait {cooldownRemaining}s to try again</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="w-full flex flex-col gap-3">
          {/* Device Unlock Button */}
          {hasDeviceLock && (
            <div>
              <button
                type="button"
                onClick={handleDeviceUnlock}
                disabled={isVerifyingDevice || cooldownRemaining > 0}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 active:scale-[0.99] text-white rounded-xl font-medium text-sm shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isVerifyingDevice ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Verifying Device...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 004.07 9.29" />
                    </svg>
                    <span>Unlock with Device</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-400 mt-2">
                Use Windows Hello, fingerprint, or screen lock
              </p>
            </div>
          )}

          {/* PIN Option / Fallback */}
          {hasBackupPin && (
            <div className="w-full pt-3 border-t border-slate-800/80">
              {!showPinInput ? (
                <button
                  type="button"
                  onClick={() => setShowPinInput(true)}
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors flex items-center justify-center gap-1.5 mx-auto py-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Or enter PIN</span>
                </button>
              ) : (
                <form onSubmit={handlePinSubmit} className="flex flex-col gap-2.5">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={12}
                      autoFocus
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      placeholder="Enter PIN"
                      disabled={isSubmittingPin || cooldownRemaining > 0}
                      className="flex-1 bg-slate-950/60 border border-slate-700/80 rounded-xl px-4 py-2.5 text-center text-base tracking-widest text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingPin || !pin.trim() || cooldownRemaining > 0}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium rounded-xl text-sm transition-all disabled:opacity-50"
                    >
                      {isSubmittingPin ? (
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <span>Unlock</span>
                      )}
                    </button>
                  </div>
                  {hasDeviceLock && (
                    <button
                      type="button"
                      onClick={() => setShowPinInput(false)}
                      className="text-[11px] text-slate-400 hover:text-slate-300 transition-colors"
                    >
                      ← Back to Device Unlock
                    </button>
                  )}
                </form>
              )}
            </div>
          )}
        </div>

        {/* Minimal Footer */}
        <div className="text-[11px] text-slate-500 pt-1">
          DiamondERP Security
        </div>

      </div>
    </div>
  );
};
