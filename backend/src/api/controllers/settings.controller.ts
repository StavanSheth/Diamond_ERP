import { Request, Response, NextFunction } from 'express';
import prisma from '../../providers/db/prisma';

export class SettingsController {
  getSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = await prisma.setting.findMany();
      const settings: Record<string, string> = {};
      
      rows.forEach(r => {
        settings[r.key] = r.value;
      });

      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settingsToUpdate: Record<string, string> = req.body;
      
      for (const [key, value] of Object.entries(settingsToUpdate)) {
        await prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value }
        });
      }

      res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
      next(error);
    }
  };
}
