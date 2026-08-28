import { describe, it, expect, vi } from 'vitest';
import { VersionController } from '../controllers/version.controller';

// Mock the response object
const mockResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

// Mock next
const mockNext = vi.fn();

describe('VersionController', () => {
  const versionController = new VersionController();

  it('should return 404 if version is not found', async () => {
    const req: any = { params: { id: 'non-existent' } };
    const res = mockResponse();

    await versionController.getOne(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Version not found' });
  });

  it('should call getHistory with correct params', async () => {
    const req: any = { params: { entityType: 'TRANSACTION', entityId: 'txn-1' } };
    const res = mockResponse();

    await versionController.getHistory(req, res, mockNext);

    expect(res.json).toHaveBeenCalled();
    const callArgs = res.json.mock.calls[0][0];
    expect(callArgs.success).toBe(true);
    // data might be empty array because DB is empty
    expect(Array.isArray(callArgs.data)).toBe(true);
  });
});
