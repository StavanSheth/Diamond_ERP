import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../../infrastructure/database/prisma';
import { getConfigDir } from '../../infrastructure/paths';

export const getActivationFilePath = (): string => path.join(getConfigDir(), '.app-activation.json');

export const DEFAULT_APP_ACTIVATION_KEY = 'Diamond@2026#SecureVault-APP';

export const isKeyValid = (input: string): boolean => {
  const trimmed = input.trim();
  const configured = process.env.DIAMOND_ACTIVATION_KEY;
  if (configured) {
    return trimmed === configured;
  }
  // Default complex key with phase tweak, plus test fallback in test env
  if (trimmed === DEFAULT_APP_ACTIVATION_KEY) return true;
  if (process.env.NODE_ENV === 'test' && trimmed === 'XW2756WGH') return true;
  return false;
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

      if (!isKeyValid(password)) {
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

      await prisma.setting.upsert({
        where: { key: 'app_activated_at' },
        update: { value: new Date().toISOString() },
        create: { key: 'app_activated_at', value: new Date().toISOString() }
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
