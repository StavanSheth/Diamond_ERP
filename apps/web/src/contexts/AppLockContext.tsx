import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  isPlatformAuthenticatorAvailable,
  registerDeviceCredential,
  verifyDeviceCredential,
  hashPin,
  verifyPin,
  clampSessionTimeout,
} from '../services/deviceAuth';
import { api } from '../services/api';

export interface AppLockContextType {
  isAppLockEnabled: boolean;
  sessionTimeoutMinutes: number;
  isLocked: boolean;
  hasDeviceLock: boolean;
  hasBackupPin: boolean;
  isPlatformAuthSupported: boolean;
  lockNow: () => void;
  unlockWithDevice: () => Promise<{ success: boolean; error?: string }>;
  unlockWithPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  enableAppLock: (options: {
    timeoutMinutes?: number;
    credentialId?: string;
    backupPin?: string;
  }) => Promise<void>;
  disableAppLock: () => Promise<void>;
  setSessionTimeout: (minutes: number) => Promise<void>;
  setBackupPin: (pin: string) => Promise<void>;
}

const AppLockContext = createContext<AppLockContextType | null>(null);

const STORAGE_KEYS = {
  ENABLED: 'appLock_enabled',
  TIMEOUT: 'appLock_timeout',
  LOCKED: 'appLock_locked',
  CREDENTIAL_ID: 'appLock_credentialId',
  PIN_HASH: 'appLock_pinHash',
  LAST_ACTIVE: 'appLock_lastActive',
};

export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAppLockEnabled, setIsAppLockEnabled] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.ENABLED) === 'true';
  });

  const [sessionTimeoutMinutes, setSessionTimeoutState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.TIMEOUT);
    return stored ? clampSessionTimeout(stored) : 15;
  });

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const enabled = localStorage.getItem(STORAGE_KEYS.ENABLED) === 'true';
    if (!enabled) return false;

    // Check if explicitly locked
    if (localStorage.getItem(STORAGE_KEYS.LOCKED) === 'true') {
      return true;
    }

    // Check if elapsed inactivity time on startup exceeds timeout
    const lastActiveStr = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE);
    if (lastActiveStr) {
      const lastActive = parseInt(lastActiveStr, 10);
      const timeoutMin = clampSessionTimeout(localStorage.getItem(STORAGE_KEYS.TIMEOUT) || 15);
      if (Date.now() - lastActive > timeoutMin * 60 * 1000) {
        return true;
      }
    }
    return false;
  });

  const [deviceCredentialId, setDeviceCredentialId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.CREDENTIAL_ID);
  });

  const [backupPinHash, setBackupPinHash] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.PIN_HASH);
  });

  const [isPlatformAuthSupported, setIsPlatformAuthSupported] = useState<boolean>(false);

  const lastActiveRef = useRef<number>(Date.now());
  const lastRecordedRef = useRef<number>(0);

  // Check platform authenticator support on mount
  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(supported => {
      setIsPlatformAuthSupported(supported);
    });
  }, []);

  // Fetch initial remote settings if available
  useEffect(() => {
    api.getSettings().then(res => {
      if (res?.success && res.data) {
        if (res.data.appLock_enabled !== undefined) {
          const remoteEnabled = res.data.appLock_enabled === 'true';
          setIsAppLockEnabled(prev => {
            const finalVal = localStorage.getItem(STORAGE_KEYS.ENABLED) !== null
              ? localStorage.getItem(STORAGE_KEYS.ENABLED) === 'true'
              : remoteEnabled;
            return finalVal;
          });
        }
        if (res.data.appLock_timeout !== undefined) {
          const remoteTimeout = clampSessionTimeout(res.data.appLock_timeout);
          setSessionTimeoutState(prev => {
            const finalTimeout = localStorage.getItem(STORAGE_KEYS.TIMEOUT) !== null
              ? clampSessionTimeout(localStorage.getItem(STORAGE_KEYS.TIMEOUT)!)
              : remoteTimeout;
            return finalTimeout;
          });
        }
      }
    }).catch(err => {
      console.warn('Unable to load app lock settings from backend, using local defaults:', err);
    });
  }, []);

  const lockNow = useCallback(() => {
    if (!isAppLockEnabled) return;
    setIsLocked(true);
    localStorage.setItem(STORAGE_KEYS.LOCKED, 'true');
  }, [isAppLockEnabled]);

  const unlockWithDevice = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      let verified = false;
      if (deviceCredentialId) {
        verified = await verifyDeviceCredential(deviceCredentialId);
      }
      if (!verified) {
        verified = await verifyDeviceCredential();
      }
      if (!verified && isPlatformAuthSupported) {
        const cred = await registerDeviceCredential();
        if (cred?.credentialId) {
          setDeviceCredentialId(cred.credentialId);
          localStorage.setItem(STORAGE_KEYS.CREDENTIAL_ID, cred.credentialId);
          verified = true;
        }
      }
      if (verified) {
        setIsLocked(false);
        localStorage.removeItem(STORAGE_KEYS.LOCKED);
        lastActiveRef.current = Date.now();
        localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE, String(Date.now()));
        return { success: true };
      }
      return { success: false, error: 'Verification was cancelled. Please try again or enter your PIN.' };
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (rawMsg.includes('timed out') || rawMsg.includes('not allowed') || rawMsg.includes('webauthn')) {
        return { success: false, error: 'Verification timed out or was cancelled. Please try again or enter your PIN.' };
      }
      return { success: false, error: 'Device verification could not be completed. Please try again or enter your PIN.' };
    }
  }, [deviceCredentialId, isPlatformAuthSupported]);

  const unlockWithPin = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    if (!backupPinHash) {
      return { success: false, error: 'No backup PIN has been configured.' };
    }
    const isValid = await verifyPin(pin, backupPinHash);
    if (isValid) {
      setIsLocked(false);
      localStorage.removeItem(STORAGE_KEYS.LOCKED);
      lastActiveRef.current = Date.now();
      localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE, String(Date.now()));
      return { success: true };
    }
    return { success: false, error: 'Incorrect PIN. Please try again.' };
  }, [backupPinHash]);

  const enableAppLock = useCallback(async (options: {
    timeoutMinutes?: number;
    credentialId?: string;
    backupPin?: string;
  }): Promise<void> => {
    const finalTimeout = options.timeoutMinutes !== undefined ? clampSessionTimeout(options.timeoutMinutes) : sessionTimeoutMinutes;
    
    setIsAppLockEnabled(true);
    localStorage.setItem(STORAGE_KEYS.ENABLED, 'true');
    setSessionTimeoutState(finalTimeout);
    localStorage.setItem(STORAGE_KEYS.TIMEOUT, String(finalTimeout));

    if (options.credentialId) {
      setDeviceCredentialId(options.credentialId);
      localStorage.setItem(STORAGE_KEYS.CREDENTIAL_ID, options.credentialId);
    }

    if (options.backupPin) {
      const hashed = await hashPin(options.backupPin);
      setBackupPinHash(hashed);
      localStorage.setItem(STORAGE_KEYS.PIN_HASH, hashed);
    }

    // Update backend settings in background
    api.updateSettings({
      appLock_enabled: 'true',
      appLock_timeout: String(finalTimeout),
    }).catch(err => console.warn('Failed to sync appLock_enabled to backend:', err));
  }, [sessionTimeoutMinutes]);

  const disableAppLock = useCallback(async (): Promise<void> => {
    setIsAppLockEnabled(false);
    setIsLocked(false);
    localStorage.setItem(STORAGE_KEYS.ENABLED, 'false');
    localStorage.removeItem(STORAGE_KEYS.LOCKED);

    // Update backend settings in background
    api.updateSettings({
      appLock_enabled: 'false',
    }).catch(err => console.warn('Failed to sync disable appLock to backend:', err));
  }, []);

  const setSessionTimeout = useCallback(async (minutes: number): Promise<void> => {
    const clamped = clampSessionTimeout(minutes);
    setSessionTimeoutState(clamped);
    localStorage.setItem(STORAGE_KEYS.TIMEOUT, String(clamped));

    api.updateSettings({
      appLock_timeout: String(clamped),
    }).catch(err => console.warn('Failed to sync appLock_timeout to backend:', err));
  }, []);

  const setBackupPin = useCallback(async (pin: string): Promise<void> => {
    const hashed = await hashPin(pin);
    setBackupPinHash(hashed);
    localStorage.setItem(STORAGE_KEYS.PIN_HASH, hashed);
  }, []);

  // Idle Activity Tracking
  useEffect(() => {
    if (!isAppLockEnabled || isLocked) return;

    const recordActivity = () => {
      const now = Date.now();
      lastActiveRef.current = now;

      // Throttle writing to localStorage to at most once every 5 seconds
      if (now - lastRecordedRef.current > 5000) {
        lastRecordedRef.current = now;
        localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE, String(now));
      }
    };

    // User interaction events
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach(event => {
      window.addEventListener(event, recordActivity, { passive: true });
    });

    // Check timer every 5 seconds for inactivity
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActiveRef.current;
      const timeoutMs = sessionTimeoutMinutes * 60 * 1000;

      if (elapsed >= timeoutMs) {
        lockNow();
      }
    }, 5000);

    // Handle visibility changes (e.g., user minimizes app or switches browser tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const storedLastActive = localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE);
        const lastActive = storedLastActive ? parseInt(storedLastActive, 10) : lastActiveRef.current;
        const elapsed = now - lastActive;
        const timeoutMs = sessionTimeoutMinutes * 60 * 1000;

        if (elapsed >= timeoutMs) {
          lockNow();
        } else {
          lastActiveRef.current = now;
        }
      } else {
        localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE, String(Date.now()));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, recordActivity);
      });
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAppLockEnabled, isLocked, sessionTimeoutMinutes, lockNow]);

  const value: AppLockContextType = {
    isAppLockEnabled,
    sessionTimeoutMinutes,
    isLocked,
    hasDeviceLock: !!deviceCredentialId || isPlatformAuthSupported,
    hasBackupPin: !!backupPinHash,
    isPlatformAuthSupported,
    lockNow,
    unlockWithDevice,
    unlockWithPin,
    enableAppLock,
    disableAppLock,
    setSessionTimeout,
    setBackupPin,
  };

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
};

export const useAppLock = (): AppLockContextType => {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error('useAppLock must be used within an AppLockProvider');
  }
  return context;
};
