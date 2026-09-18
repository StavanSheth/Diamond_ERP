import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { OnboardingWizard } from '../../components/onboarding/OnboardingWizard';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: {
    onboarding: {
      getStatus: vi.fn(),
      initializeApp: vi.fn(),
      registerDevice: vi.fn(),
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
      setupPin: vi.fn(),
    },
  },
}));

describe('OnboardingWizard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when onboarding is already complete and READY', async () => {
    (api.onboarding.getStatus as any).mockResolvedValueOnce({
      lifecycleState: 'READY',
      ready: true,
      installationInitialized: true,
      deviceConfigured: true,
      pinConfigured: true,
      userConfigured: true,
      databaseConfigured: true,
    });

    const { container } = render(<OnboardingWizard />);
    await waitFor(() => expect(api.onboarding.getStatus).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('renders welcome and initialize button when in NOT_INITIALIZED state', async () => {
    (api.onboarding.getStatus as any).mockResolvedValueOnce({
      lifecycleState: 'NOT_INITIALIZED',
      ready: false,
      installationInitialized: false,
      deviceConfigured: false,
      pinConfigured: false,
      userConfigured: false,
      databaseConfigured: false,
    });

    render(<OnboardingWizard />);
    await waitFor(() => {
      expect(screen.getByText(/Diamond ERP Setup/i)).toBeDefined();
      expect(screen.getByText(/Initialize Application Setup/i)).toBeDefined();
    });
  });

  it('renders 6-digit PIN input when in PIN_SETUP state', async () => {
    (api.onboarding.getStatus as any).mockResolvedValueOnce({
      lifecycleState: 'PIN_SETUP',
      ready: false,
      installationInitialized: true,
      deviceConfigured: false,
      pinConfigured: false,
      userConfigured: false,
      databaseConfigured: false,
    });

    render(<OnboardingWizard />);
    await waitFor(() => {
      expect(screen.getByLabelText(/6-Digit PIN/i)).toBeDefined();
      expect(screen.getByLabelText(/Confirm PIN/i)).toBeDefined();
    });
  });

  it('renders user discovery candidates when in USER_DISCOVERY state', async () => {
    (api.onboarding.getStatus as any).mockResolvedValueOnce({
      lifecycleState: 'USER_DISCOVERY',
      ready: false,
      installationInitialized: true,
      deviceConfigured: true,
      pinConfigured: true,
      userConfigured: false,
      databaseConfigured: false,
    });

    (api.onboarding.discoverUsers as any).mockResolvedValueOnce({
      candidates: [
        {
          id: 'u1',
          username: 'stavan',
          displayName: 'Stavan Sheth',
          role: 'ADMIN',
          isActive: true,
          associatedWithInstallation: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(<OnboardingWizard />);
    await waitFor(() => {
      expect(screen.getByText(/Use Existing User/i)).toBeDefined();
      expect(screen.getByText(/Stavan Sheth/i)).toBeDefined();
    });
  });
});
