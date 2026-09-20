import { describe, it, expect } from 'vitest';
import { installationService } from '../modules/system/installation.service';
import { systemPrisma } from '../infrastructure/database/prisma';
import { ConflictError } from '../errors';

describe('Phase 5 — Lifecycle Transition Authority & Controlled Reset', () => {
  it('rejects resetting to NOT_INITIALIZED without isReset flag', async () => {
    await expect(
      installationService.updateLifecycleState('NOT_INITIALIZED' as any)
    ).rejects.toThrow(ConflictError);
  });

  it('rejects resetting to NOT_INITIALIZED without valid resetReason', async () => {
    await expect(
      installationService.updateLifecycleState('NOT_INITIALIZED' as any, {
        isReset: true,
        resetReason: 'arbitrary_invalid_reason',
      })
    ).rejects.toThrow(/Controlled reset policy violation/i);
  });

  it('allows controlled reset with explicit valid resetReason and logs LIFECYCLE_RESET audit event', async () => {
    await installationService.getOrCreateInstallation();

    const result = await installationService.updateLifecycleState('NOT_INITIALIZED', {
      isReset: true,
      resetReason: 'DEVELOPMENT_TEST_RESET',
    });

    expect(result.lifecycleState).toBe('NOT_INITIALIZED');

    const audit = await systemPrisma.auditEvent.findFirst({
      where: {
        entityType: 'Installation',
        eventType: 'LIFECYCLE_RESET',
      },
      orderBy: { performedAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.description).toContain('DEVELOPMENT_TEST_RESET');
  });

  it('records LIFECYCLE_STATE_TRANSITION audit event on forward step progression', async () => {
    const result = await installationService.updateLifecycleState('APP_SETUP');
    expect(result.lifecycleState).toBe('APP_SETUP');

    const audit = await systemPrisma.auditEvent.findFirst({
      where: {
        entityType: 'Installation',
        eventType: 'LIFECYCLE_STATE_TRANSITION',
      },
      orderBy: { performedAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.description).toContain('APP_SETUP');

    // Clean up back to APP_SETUP / NOT_INITIALIZED
    await installationService.updateLifecycleState('NOT_INITIALIZED', {
      isReset: true,
      resetReason: 'DEVELOPMENT_TEST_RESET',
    });
  });
});
