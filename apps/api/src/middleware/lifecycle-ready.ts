import { Request, Response, NextFunction } from 'express';
import { installationService } from '../modules/system/installation.service';
import { logger } from '../infrastructure/logging';

/**
 * Lifecycle Ready Gate Middleware.
 *
 * Enforces that core ERP business operations (Stocks, Ledger, Parties, Repairs, Reports)
 * cannot be executed unless the installation lifecycle is in the authoritative 'READY' state.
 *
 * Rejects with 428 Precondition Required if installation is not fully initialized/onboarded.
 */
export async function lifecycleReadyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const install = await installationService.getOrCreateInstallation();

    if (install.lifecycleState !== 'READY') {
      logger.warn(
        `[LifecycleGate] Business API call blocked: ${req.method} ${req.originalUrl}. Installation lifecycle is "${install.lifecycleState}", required: "READY"`
      );
      res.status(428).json({
        success: false,
        error: 'Installation lifecycle not ready',
        code: 'LIFECYCLE_NOT_READY',
        currentLifecycleState: install.lifecycleState,
        message: `The application is currently in '${install.lifecycleState}' state. The onboarding setup must be completed before accessing business records.`,
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
