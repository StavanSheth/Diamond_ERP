import { describe, it, expect, beforeEach } from 'vitest';
import { VersionService } from '../version.service';
import { prisma } from '../../tests/setup';

describe('VersionService', () => {
  const versionService = new VersionService();

  beforeEach(async () => {
    // Clear versions before each test
    await prisma.recordVersion.deleteMany();
    await prisma.versionChange.deleteMany();
  });

  describe('diff engine', () => {
    it('should detect added fields', () => {
      const oldObj = { name: 'Diamond 1' };
      const newObj = { name: 'Diamond 1', carat: 1.2 };
      
      const changes = (versionService as any)._deepDiff(oldObj, newObj);
      expect(changes).toHaveLength(1);
      expect(changes[0].path).toBe('carat');
      expect(changes[0].before).toBeUndefined();
      expect(changes[0].after).toBe(1.2);
    });

    it('should detect removed fields', () => {
      const oldObj = { name: 'Diamond 1', carat: 1.2 };
      const newObj = { name: 'Diamond 1' };
      
      const changes = (versionService as any)._deepDiff(oldObj, newObj);
      expect(changes).toHaveLength(1);
      expect(changes[0].path).toBe('carat');
      expect(changes[0].before).toBe(1.2);
      expect(changes[0].after).toBeUndefined();
    });

    it('should detect changed fields', () => {
      const oldObj = { name: 'Diamond 1', color: 'G' };
      const newObj = { name: 'Diamond 1', color: 'F' };
      
      const changes = (versionService as any)._deepDiff(oldObj, newObj);
      expect(changes).toHaveLength(1);
      expect(changes[0].path).toBe('color');
      expect(changes[0].before).toBe('G');
      expect(changes[0].after).toBe('F');
    });
  });

  describe('createVersion', () => {
    it('should create a new version with incremented version number', async () => {
      const entityId = 'txn-123';
      const entityType = 'TRANSACTION';
      
      const v1 = await versionService.createVersion({
        entityType,
        entityId,
        versionType: 'TRANSACTION_CREATED',
        snapshot: { status: 'DRAFT' },
        changeSummary: 'Initial creation',
        createdBy: 'tester'
      });
      
      expect(v1.versionNumber).toBe(1);
      expect(v1.entityId).toBe(entityId);
      
      const v2 = await versionService.createVersion({
        entityType,
        entityId,
        versionType: 'TRANSACTION_EDITED',
        snapshot: { status: 'AUTHORIZED' },
        changeSummary: 'Authorized transaction',
        createdBy: 'tester',
        changeSet: [{ path: 'status', before: 'DRAFT', after: 'AUTHORIZED' }]
      });
      
      expect(v2.versionNumber).toBe(2);
      expect(v2.changes).toBeDefined();
      expect(v2.changes.length).toBe(1);
      expect(v2.changes[0].fieldPath).toBe('status');
      expect(v2.changes[0].valueBefore).toBe(JSON.stringify('DRAFT'));
      expect(v2.changes[0].valueAfter).toBe(JSON.stringify('AUTHORIZED'));
    });
  });
});
