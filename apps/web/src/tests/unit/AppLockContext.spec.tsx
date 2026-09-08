import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { AppLockProvider, useAppLock } from '../../contexts/AppLockContext';

// Mock api service
vi.mock('../../services/api', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateSettings: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('AppLockContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('provides default state when not configured', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppLockProvider>{children}</AppLockProvider>
    );
    const { result } = renderHook(() => useAppLock(), { wrapper });

    expect(result.current.isAppLockEnabled).toBe(false);
    expect(result.current.sessionTimeoutMinutes).toBe(15);
    expect(result.current.isLocked).toBe(false);
  });

  it('enables app lock and sets session timeout clamped to minimum 1 minute', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppLockProvider>{children}</AppLockProvider>
    );
    const { result } = renderHook(() => useAppLock(), { wrapper });

    await act(async () => {
      await result.current.enableAppLock({
        timeoutMinutes: 0, // Below 1 -> should clamp to 1
        backupPin: '1234',
      });
    });

    expect(result.current.isAppLockEnabled).toBe(true);
    expect(result.current.sessionTimeoutMinutes).toBe(1);
    expect(result.current.hasBackupPin).toBe(true);
  });

  it('updates session timeout and supports custom durations including hours and days', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppLockProvider>{children}</AppLockProvider>
    );
    const { result } = renderHook(() => useAppLock(), { wrapper });

    await act(async () => {
      await result.current.setSessionTimeout(90); // 1.5 hours
    });
    expect(result.current.sessionTimeoutMinutes).toBe(90);

    await act(async () => {
      await result.current.setSessionTimeout(1440); // 1 day
    });
    expect(result.current.sessionTimeoutMinutes).toBe(1440);

    await act(async () => {
      await result.current.setSessionTimeout(10080); // 7 days
    });
    expect(result.current.sessionTimeoutMinutes).toBe(10080);
  });

  it('can be manually locked and unlocked with backup PIN', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppLockProvider>{children}</AppLockProvider>
    );
    const { result } = renderHook(() => useAppLock(), { wrapper });

    await act(async () => {
      await result.current.enableAppLock({
        timeoutMinutes: 30,
        backupPin: '4321',
      });
    });

    act(() => {
      result.current.lockNow();
    });

    expect(result.current.isLocked).toBe(true);

    // Wrong PIN
    let unlockRes: any;
    await act(async () => {
      unlockRes = await result.current.unlockWithPin('0000');
    });
    expect(unlockRes.success).toBe(false);
    expect(result.current.isLocked).toBe(true);

    // Correct PIN
    await act(async () => {
      unlockRes = await result.current.unlockWithPin('4321');
    });
    expect(unlockRes.success).toBe(true);
    expect(result.current.isLocked).toBe(false);
  });

  it('turns off app lock when disableAppLock is called (off button)', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppLockProvider>{children}</AppLockProvider>
    );
    const { result } = renderHook(() => useAppLock(), { wrapper });

    await act(async () => {
      await result.current.enableAppLock({
        timeoutMinutes: 10,
        backupPin: '9999',
      });
    });

    act(() => {
      result.current.lockNow();
    });
    expect(result.current.isLocked).toBe(true);

    // Disable / Turn Off
    await act(async () => {
      await result.current.disableAppLock();
    });

    expect(result.current.isAppLockEnabled).toBe(false);
    expect(result.current.isLocked).toBe(false);
    expect(localStorage.getItem('appLock_enabled')).toBe('false');
  });
});
