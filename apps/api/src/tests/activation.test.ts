import { describe, it, expect, beforeEach } from 'vitest';
import { activationController } from '../modules/system/activation.controller';
import fs from 'fs';
import path from 'path';
import prisma from '../infrastructure/database/prisma';

const ACTIVATION_FILE = path.resolve(__dirname, '../../../../.app-activation.json');

describe('Master App Lock & Lifetime Activation Controller', () => {
  beforeEach(async () => {
    // Clean up activation state before each test
    if (fs.existsSync(ACTIVATION_FILE)) {
      fs.unlinkSync(ACTIVATION_FILE);
    }
    await prisma.setting.deleteMany({
      where: { key: 'app_activated' }
    }).catch(() => null);
  });

  it('reports isActivated: false on fresh install', async () => {
    let jsonResult: any = null;
    const mockRes: any = {
      json: (data: any) => { jsonResult = data; },
      status: () => mockRes,
    };

    await activationController.getActivationStatus({} as any, mockRes, () => {});
    expect(jsonResult).toBeDefined();
    expect(jsonResult.success).toBe(true);
    expect(jsonResult.isActivated).toBe(false);
  });

  it('rejects incorrect master activation password with 401', async () => {
    let statusCode = 200;
    let jsonResult: any = null;
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => { jsonResult = data; }
    };

    await activationController.activate({
      body: { password: 'WRONG_PASSWORD_123' }
    } as any, mockRes, () => {});

    expect(statusCode).toBe(401);
    expect(jsonResult.success).toBe(false);
    expect(jsonResult.error).toContain('Invalid');
  });

  it('activates permanently with default master password XW2756WGH', async () => {
    let statusCode = 200;
    let jsonResult: any = null;
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => { jsonResult = data; }
    };

    await activationController.activate({
      body: { password: 'XW2756WGH' }
    } as any, mockRes, () => {});

    expect(statusCode).toBe(200);
    expect(jsonResult.success).toBe(true);

    // Verify status now reports isActivated: true
    let statusResult: any = null;
    const mockStatusRes: any = {
      json: (data: any) => { statusResult = data; },
      status: () => mockStatusRes,
    };
    await activationController.getActivationStatus({} as any, mockStatusRes, () => {});
    expect(statusResult.isActivated).toBe(true);
  });
});
