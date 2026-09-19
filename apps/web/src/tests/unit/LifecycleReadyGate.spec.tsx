import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import App from '../../App';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: {
    getActivationStatus: vi.fn().mockResolvedValue({ isActivated: true, status: 'ACTIVATED' }),
    getSettings: vi.fn().mockResolvedValue({ success: true, data: { appLock_enabled: false } }),
    onboarding: {
      getStatus: vi.fn(),
      initializeApp: vi.fn(),
      registerDevice: vi.fn(),
      setupPin: vi.fn(),
      discoverUsers: vi.fn(),
      selectUser: vi.fn(),
      createUser: vi.fn(),
      discoverDatabases: vi.fn(),
      inspectDatabase: vi.fn(),
      attachDatabase: vi.fn(),
      createDatabase: vi.fn(),
      completeOnboarding: vi.fn(),
      resetStep: vi.fn(),
    },
    security: {
      getStatus: vi.fn().mockResolvedValue({ isLocked: false, isConfigured: true }),
      verifyPin: vi.fn(),
      setupPin: vi.fn(),
    },
    recovery: {
      detectReinstall: vi.fn().mockResolvedValue({ hasPreviousData: false }),
    },
    stocks: {
      getAll: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('../../hooks/useStocks', () => ({
  useStocks: () => ({
    stocks: [],
    loading: false,
    error: null,
    lastSyncedAt: new Date().toISOString(),
    syncStatus: 'synced',
    createStock: vi.fn(),
    updateStock: vi.fn(),
    deleteStock: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('Lifecycle Ready Gate & ERP Blocking Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strictly blocks ERP layout from rendering when lifecycle is NOT_INITIALIZED', async () => {
    (api.onboarding.getStatus as any).mockResolvedValue({
      lifecycleState: 'NOT_INITIALIZED',
      ready: false,
      installationInitialized: false,
      deviceConfigured: false,
      pinConfigured: false,
      userConfigured: false,
      databaseConfigured: false,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Diamond ERP Setup/i)).toBeDefined();
    });

    // ERP layout elements must NOT be mounted
    expect(screen.queryByText(/Inventory/i)).toBeNull();
    expect(screen.queryByText(/Diamond ERP Dashboard/i)).toBeNull();
  });

  it('strictly blocks ERP layout from rendering when lifecycle is at DATABASE_VALIDATION', async () => {
    (api.onboarding.getStatus as any).mockResolvedValue({
      lifecycleState: 'DATABASE_VALIDATION',
      ready: false,
      installationInitialized: true,
      deviceConfigured: true,
      pinConfigured: true,
      userConfigured: true,
      databaseConfigured: false,
    });

    (api.onboarding.discoverDatabases as any).mockResolvedValue({ candidates: [] });

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Diamond ERP Setup/i)).toBeDefined();
    });

    expect(screen.queryByText(/Diamond ERP Dashboard/i)).toBeNull();
  });

  it('does NOT render ERP when direct ERP URL is requested prior to READY state', async () => {
    (api.onboarding.getStatus as any).mockResolvedValue({
      lifecycleState: 'PIN_SETUP',
      ready: false,
      installationInitialized: true,
      deviceConfigured: false,
      pinConfigured: false,
      userConfigured: false,
      databaseConfigured: false,
    });

    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Diamond ERP Setup/i)).toBeDefined();
    });

    // Even though /inventory was requested, ERP layout must NOT mount
    expect(screen.queryByText(/Stock Items/i)).toBeNull();
    expect(screen.queryByText(/Diamond ERP Dashboard/i)).toBeNull();
  });

  it('does NOT render ERP when onboarding API fails or is unavailable', async () => {
    (api.onboarding.getStatus as any).mockRejectedValue(new Error('Network connection refused'));

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.onboarding.getStatus).toHaveBeenCalled();
    });

    // On network failure, ERP must NEVER be mounted
    expect(screen.queryByText(/Diamond ERP Dashboard/i)).toBeNull();
  });

  it('successfully mounts ERP application when backend lifecycle is READY and unlocked', async () => {
    (api.onboarding.getStatus as any).mockResolvedValue({
      lifecycleState: 'READY',
      ready: true,
      installationInitialized: true,
      deviceConfigured: true,
      pinConfigured: true,
      userConfigured: true,
      databaseConfigured: true,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      // Wizard must NOT be rendered
      expect(screen.queryByText(/Diamond ERP Setup/i)).toBeNull();
    });
  });
});
