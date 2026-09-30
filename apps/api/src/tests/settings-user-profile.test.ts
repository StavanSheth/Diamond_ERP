import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsController } from '../modules/settings/settings.controller';
import { installationService } from '../modules/system/installation.service';
import { systemPrisma } from '../infrastructure/database/prisma';

describe('Settings Controller — User & Profile Creation Tests', () => {
  let controller: SettingsController;

  beforeEach(async () => {
    controller = new SettingsController();
    await installationService.getOrCreateInstallation();
  });

  it('successfully creates a new team user via SettingsController.createUser', async () => {
    const testUsername = `user_${Date.now()}`;
    const req: any = {
      body: {
        username: testUsername,
        password: 'ValidPassword123!',
        displayName: 'Test New User',
        role: 'MANAGER',
      },
    };

    let statusCode = 200;
    let jsonResult: any = null;
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        jsonResult = data;
        return res;
      },
    };
    let capturedError: any = null;
    const next = (err?: any) => {
      capturedError = err;
    };

    await controller.createUser(req, res, next);

    expect(capturedError).toBeNull();
    expect(statusCode).toBe(201);
    expect(jsonResult.success).toBe(true);
    expect(jsonResult.data.username).toBe(testUsername);

    // Verify user is in SQLite
    const userInDb = await systemPrisma.user.findUnique({
      where: { username: testUsername },
    });
    expect(userInDb).not.toBeNull();
    expect(userInDb?.role).toBe('MANAGER');
  });

  it('creates a profile without failing on unauthenticated default-admin caller', async () => {
    // Simulate desktop unauthenticated caller with default-admin
    const req: any = {
      user: { id: 'default-admin' },
      body: {
        profileName: `prof_${Date.now()}`,
        displayName: 'Test New Profile',
      },
    };

    let jsonResult: any = null;
    const res: any = {
      status: () => res,
      json: (data: any) => {
        jsonResult = data;
        return res;
      },
    };
    let capturedError: any = null;
    const next = (err?: any) => {
      capturedError = err;
    };

    await controller.createProfile(req, res, next);

    expect(capturedError).toBeNull();
    expect(jsonResult?.success).toBe(true);
  });
});
