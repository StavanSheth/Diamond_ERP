import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OnboardingWizard } from '../../components/onboarding/OnboardingWizard';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: {
    onboarding: {
      getStatus: vi.fn(),
      initializeApp: vi.fn(),
      setupPin: vi.fn(),
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

  it('explicitly does NOT auto-populate candidates[0] into candidatePath upon database discovery', async () => {
    (api.onboarding.getStatus as any).mockResolvedValueOnce({
      lifecycleState: 'DATABASE_DISCOVERY',
      ready: false,
      installationInitialized: true,
      deviceConfigured: true,
      pinConfigured: true,
      userConfigured: true,
      databaseConfigured: false,
    });

    (api.onboarding.discoverDatabases as any).mockResolvedValueOnce({
      candidates: [
        {
          displayName: 'company_main',
          canonicalPath: 'C:\\DiamondERP\\databases\\company_main.db',
          source: 'LOCAL_DIR',
          status: 'ACTIVE',
          isKnown: false,
          isCurrentInstallation: false,
        },
      ],
    });

    render(<OnboardingWizard />);

    // Switch to Existing Database mode
    await waitFor(() => expect(screen.getByText(/Use Existing Database/i)).toBeDefined());
    fireEvent.click(screen.getByText(/Use Existing Database/i));

    await waitFor(() => {
      // Input path MUST be empty, not auto-populated!
      const input = screen.getByPlaceholderText('C:\\DiamondERP\\databases\\company.db') as HTMLInputElement;
      expect(input.value).toBe('');
      // Discovered candidate card is rendered with source badge
      expect(screen.getByText('company_main')).toBeDefined();
      expect(screen.getByText(/Local Diamond ERP directory/i)).toBeDefined();
    });
  });

  it('requires explicit confirmation checkbox before enabling attachment of existing database', async () => {
    (api.onboarding.getStatus as any).mockResolvedValueOnce({
      lifecycleState: 'DATABASE_DISCOVERY',
      ready: false,
      installationInitialized: true,
      deviceConfigured: true,
      pinConfigured: true,
      userConfigured: true,
      databaseConfigured: false,
    });

    (api.onboarding.discoverDatabases as any).mockResolvedValueOnce({
      candidates: [
        {
          displayName: 'mumbai_db',
          canonicalPath: 'C:\\DiamondERP\\databases\\mumbai_db.db',
          source: 'REGISTRY',
          status: 'ACTIVE',
          isKnown: true,
          isCurrentInstallation: false,
        },
      ],
    });

    (api.onboarding.inspectDatabase as any).mockResolvedValueOnce({
      canonicalPath: 'C:\\DiamondERP\\databases\\mumbai_db.db',
      displayName: 'mumbai_db',
      status: 'ACTIVE',
      suitability: 'REQUIRES_CONFIRMATION',
      tableCount: 14,
      schemaVersion: 1,
      isExistingRegistry: true,
      details: 'Valid Diamond ERP database. Explicit confirmation required to attach.',
    });

    render(<OnboardingWizard />);

    await waitFor(() => expect(screen.getByText(/Use Existing Database/i)).toBeDefined());
    fireEvent.click(screen.getByText(/Use Existing Database/i));

    // Click inspect on the candidate
    await waitFor(() => expect(screen.getByText('mumbai_db')).toBeDefined());
    const inspectBtn = screen.getByRole('button', { name: /Select & Inspect/i });
    fireEvent.click(inspectBtn);

    // Preview panel appears
    await waitFor(() => {
      expect(screen.getByText(/REQUIRES_CONFIRMATION/i)).toBeDefined();
      expect(screen.getByText(/Tables Found:/i)).toBeDefined();
    });

    // Checkbox is unchecked -> button disabled
    const attachBtn = screen.getByRole('button', { name: /Use This Database/i }) as HTMLButtonElement;
    expect(attachBtn.disabled).toBe(true);

    // Check confirmation checkbox -> button becomes enabled
    const checkbox = screen.getByLabelText(/I confirm that I want to attach this database/i) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(attachBtn.disabled).toBe(false);
  });

  it('renders visual 8-step progress milestone track and active step highlighting', async () => {
    (api.onboarding.getStatus as any).mockResolvedValueOnce({
      lifecycleState: 'DEVICE_SETUP',
      ready: false,
      installationInitialized: true,
      deviceConfigured: false,
      pinConfigured: true,
      userConfigured: false,
      databaseConfigured: false,
      completedSteps: ['NOT_INITIALIZED', 'APP_SETUP', 'PIN_SETUP'],
    });

    render(<OnboardingWizard />);
    await waitFor(() => {
      expect(screen.getByText('App Setup')).toBeDefined();
      expect(screen.getByText('PIN Setup')).toBeDefined();
      expect(screen.getByText('Device Setup')).toBeDefined();
      expect(screen.getByText('User Discovery')).toBeDefined();
      expect(screen.getByText('DB Discovery')).toBeDefined();
      expect(screen.getByText('DB Validation')).toBeDefined();
      expect(screen.getByText('DB Setup')).toBeDefined();
      expect(screen.getByText('Complete')).toBeDefined();
    });
  });

  it('renders friendly resume notification when resuming from incomplete lifecycle state', async () => {
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
      expect(screen.getByText(/Resumed Onboarding:/i)).toBeDefined();
      expect(screen.getByText(/Terminal PIN Setup/i)).toBeDefined();
    });
  });

  it('submits 6-digit PIN via atomic setupPin endpoint and updates status', async () => {
    (api.onboarding.getStatus as any).mockResolvedValueOnce({
      lifecycleState: 'PIN_SETUP',
      ready: false,
      installationInitialized: true,
      deviceConfigured: false,
      pinConfigured: false,
      userConfigured: false,
      databaseConfigured: false,
    });

    (api.onboarding.setupPin as any).mockResolvedValueOnce({
      lifecycleState: 'DEVICE_SETUP',
      ready: false,
      installationInitialized: true,
      deviceConfigured: false,
      pinConfigured: true,
      userConfigured: false,
      databaseConfigured: false,
    });

    render(<OnboardingWizard />);
    await waitFor(() => expect(screen.getByLabelText(/New 6-Digit PIN/i)).toBeDefined());

    const pinInput = screen.getByLabelText(/New 6-Digit PIN/i);
    const confirmInput = screen.getByLabelText(/Confirm PIN/i);
    fireEvent.change(pinInput, { target: { value: '123456' } });
    fireEvent.change(confirmInput, { target: { value: '123456' } });

    const submitBtn = screen.getByRole('button', { name: /Set Application PIN/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.onboarding.setupPin).toHaveBeenCalledWith('123456');
    });
  });
});

