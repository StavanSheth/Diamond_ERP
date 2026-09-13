import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../../infrastructure/database/prisma';
import { getConfigDir } from '../../infrastructure/paths';

export const getActivationFilePath = (): string => path.join(getConfigDir(), '.app-activation.json');

// ⚠️ SECURITY: No hard-coded fallback key in production. Must be set via environment variable.
// In test environment, a default test key is allowed for test suites.
const getMasterKey = (): string | undefined => {
  return process.env.DIAMOND_ACTIVATION_KEY || (process.env.NODE_ENV === 'test' ? 'XW2756WGH' : undefined);
};

export class ActivationController {

  private isFileActivated(): boolean {
    try {
      const filePath = getActivationFilePath();
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return data?.activated === true;
      }
    } catch {
      // Ignore read errors
    }
    return false;
  }

  private setFileActivated(): void {
    try {
      const filePath = getActivationFilePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify({
        activated: true,
        activatedAt: new Date().toISOString()
      }, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Activation] Failed to write activation file:', err);
    }
  }

  getActivationStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Check file flag
      if (this.isFileActivated()) {
        res.json({ success: true, isActivated: true });
        return;
      }

      // 2. Check database setting
      const setting = await prisma.setting.findUnique({
        where: { key: 'app_activated' }
      }).catch(() => null);

      if (setting?.value === 'true') {
        // Sync to file for resilience
        this.setFileActivated();
        res.json({ success: true, isActivated: true });
        return;
      }

      res.json({ success: true, isActivated: false });
    } catch (error) {
      next(error);
    }
  };

  activate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { password } = req.body;

      if (!password || typeof password !== 'string') {
        res.status(400).json({ success: false, error: 'Password is required' });
        return;
      }

      const masterKey = getMasterKey();
      if (!masterKey) {
        res.status(503).json({
          success: false,
          error: 'Activation is not configured. DIAMOND_ACTIVATION_KEY environment variable must be set.',
        });
        return;
      }

      if (password.trim() !== masterKey) {
        res.status(401).json({ success: false, error: 'Invalid master activation password. Access denied.' });
        return;
      }

      // Mark activated in both DB and File
      this.setFileActivated();

      await prisma.setting.upsert({
        where: { key: 'app_activated' },
        update: { value: 'true' },
        create: { key: 'app_activated', value: 'true' }
      }).catch(() => null);

      res.json({
        success: true,
        message: 'Application unlocked and activated permanently.'
      });
    } catch (error) {
      next(error);
    }
  };
}

export const activationController = new ActivationController();
