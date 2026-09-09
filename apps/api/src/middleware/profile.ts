import { Request, Response, NextFunction } from 'express';
import { requestContext } from '../infrastructure/database/prisma';

/**
 * Extracts the X-Profile-Id header and injects it into the AsyncLocalStorage context.
 * All subsequent calls to `prisma` will automatically route to the database for this profile.
 */
export function profileMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Use X-Profile-Id if provided, otherwise fallback to a default (e.g., 'Stavan')
  const profileId = (req.headers['x-profile-id'] as string) || 'Stavan';
  
  // Run the rest of the request within the async context
  requestContext.run({ profileId }, () => {
    next();
  });
}
