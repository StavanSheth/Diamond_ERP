import { describe, it, expect, beforeEach } from 'vitest';
import { DraftService } from '../draft.service';
import { prisma } from '../../tests/setup';

describe('DraftService', () => {
  const draftService = new DraftService();

  beforeEach(async () => {
    // Clear drafts before each test
    await prisma.draftRevision.deleteMany();
    await prisma.documentDraft.deleteMany();
  });

  describe('saveDraftRevision', () => {
    it('should create a new draft if it does not exist', async () => {
      const payload = { test: true };
      
      const createdDraft = await draftService.createDraft({
        entityType: 'TRANSACTION',
        payload,
        createdBy: 'tester',
        deviceId: 'device-1'
      });
      
      const revision = await draftService.saveDraftRevision(createdDraft.id, {
        payload: { test: false },

        updatedBy: 'tester',
        deviceId: 'device-1'
      });
      
      expect(revision.revisionNumber).toBe(2);
      
      const draft = await prisma.documentDraft.findUnique({ where: { id: createdDraft.id } });
      expect(draft).toBeDefined();
      expect(draft?.status).toBe('SAVED');
      expect(draft?.entityType).toBe('TRANSACTION');
    });

    it('should increment revision number on subsequent saves', async () => {
      const createdDraft = await draftService.createDraft({
        entityType: 'TRANSACTION',
        payload: { step: 1 },
        createdBy: 'tester',
        deviceId: 'device-1'
      });
      
      const revision2 = await draftService.saveDraftRevision(createdDraft.id, {
        payload: { step: 2 },

        updatedBy: 'tester',
        deviceId: 'device-1'
      });
      
      expect(revision2.revisionNumber).toBe(2);
      expect(revision2.snapshot).toEqual(JSON.stringify({ step: 2 }));
    });
  });

  describe('commitDraft', () => {
    it('should change draft status to COMMITTED', async () => {
      const createdDraft = await draftService.createDraft({
        entityType: 'TRANSACTION',
        payload: { step: 1 },
        createdBy: 'tester'
      });
      
      const draft = await draftService.commitDraft(createdDraft.id, 'tester');
      expect(draft.status).toBe('COMMITTED');
      
      const dbDraft = await prisma.documentDraft.findUnique({ where: { id: createdDraft.id } });
      expect(dbDraft?.status).toBe('COMMITTED');
    });
  });
});
