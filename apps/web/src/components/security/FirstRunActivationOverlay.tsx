import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

const LOCAL_STORAGE_KEY = 'diamond_erp_lifetime_activated';

export const FirstRunActivationOverlay: React.FC = () => {
  // Optimistically check localStorage first to avoid flash of overlay if already activated
  const [isActivated, setIsActivated] = useState<boolean>(() => {
    return localStorage.getItem(LOCAL_STORAGE_KEY) === 'true';
  });
  const [loading, setLoading] = useState<boolean>(!isActivated);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // If local storage says already activated, verify in background; else check API
    let isMounted = true;
    api.getActivationStatus()
      .then((res) => {
        if (!isMounted) return;
        if (res.isActivated) {
          localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
          setIsActivated(true);
        } else {
          // If backend says not activated, override localStorage
          localStorage.removeItem(LOCAL_STORAGE_KEY);
          setIsActivated(false);
        }
      })
      .catch(() => {
        // If API is temporarily unreachable, rely on localStorage state
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || isActivated) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage('Please enter the master password.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await api.activateApp(password.trim());
      if (res.success) {
        localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
        setIsActivated(true);
      } else {
        setErrorMessage(res.message || 'Authentication failed. Please verify your password.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Invalid master password. Access denied.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="first-run-activation-overlay"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-lg p-4 select-none animate-fadeIn"
    >
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-8 text-slate-100 relative">
        {/* Decorative Top Accent Gradient */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500" />

        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 border border-indigo-400/30">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white mb-1">
            DiamondERP System Activation
          </h2>
          <p className="text-sm text-slate-400 max-w-xs">
            Enter the authorized master security key to initialize and unlock this installation.
          </p>
        </div>

        {errorMessage && (
          <div
            id="activation-error-banner"
            className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="master-activation-password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Master Password
            </label>
            <div className="relative">
              <input
                id="master-activation-password"
                type={showPassword ? 'text' : 'password'}
                autoFocus
                required
                disabled={submitting}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            id="activate-submit-btn"
            type="submit"
            disabled={submitting || !password.trim()}
            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-600/25 transition-all duration-200 transform active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Validating Security Key...</span>
              </>
            ) : (
              <span>Unlock & Activate</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
          <p className="text-xs text-slate-500">
            One-time verification. Once unlocked, this app will remain permanently activated on this machine.
          </p>
        </div>
      </div>
    </div>
  );
};
