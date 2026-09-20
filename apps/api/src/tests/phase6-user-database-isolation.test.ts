import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { onboardingService } from '../modules/system/onboarding/onboarding.service';
import { installationService } from '../modules/system/installation.service';
import { ValidationError } from '../errors';

describe('Phase 6 — User ↔ Database Absolute Isolation Matrix', () => {
  let userA: any;
  let userB: any;
  let dbA: any;
  let dbB: any;
  const createdFiles: string[] = [];

  beforeAll(async () => {
    await installationService.getOrCreateInstallation();
    const suffix = Date.now().toString();

    // Create User A
    const resA = await onboardingService.createBusinessUser({
      username: `user_a_${suffix}`,
      password: 'Password123456!',
      displayName: 'User A',
      role: 'ADMIN',
    });
    userA = resA.user;

    // Create User B
    const resB = await onboardingService.createBusinessUser({
      username: `user_b_${suffix}`,
      password: 'Password123456!',
      displayName: 'User B',
      role: 'VIEWER',
    });
    userB = resB.user;

    // Provision DB A for User A
    const provA = await onboardingService.createNewDatabase({
      userId: userA.id,
      displayName: `DB_UserA_${suffix}`,
    });
    dbA = provA.registry;
    createdFiles.push(dbA.canonicalPath);

    // Provision DB B for User B
    const provB = await onboardingService.createNewDatabase({
      userId: userB.id,
      displayName: `DB_UserB_${suffix}`,
    });
    dbB = provB.registry;
    createdFiles.push(dbB.canonicalPath);

    // Seed distinct business records into DB A
    const clientA = new PrismaClient({
      datasources: { db: { url: `file:${dbA.canonicalPath.replace(/\\/g, '/')}` } },
    });
    await clientA.$connect();
    await clientA.$executeRawUnsafe(
      `INSERT INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);`,
      crypto.randomUUID(),
      'PARTY_A_001',
      'Diamond Supplier Alpha for User A',
      'SUPPLIER',
      new Date().toISOString(),
      new Date().toISOString()
    );
    await clientA.$disconnect();

    // Seed distinct business records into DB B
    const clientB = new PrismaClient({
      datasources: { db: { url: `file:${dbB.canonicalPath.replace(/\\/g, '/')}` } },
    });
    await clientB.$connect();
    await clientB.$executeRawUnsafe(
      `INSERT INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);`,
      crypto.randomUUID(),
      'PARTY_B_001',
      'Diamond Supplier Beta for User B',
      'CUSTOMER',
      new Date().toISOString(),
      new Date().toISOString()
    );
    await clientB.$disconnect();
  });

  afterAll(async () => {
    for (const f of createdFiles) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
  });

  it('proves User A and User B have separate physical database files', () => {
    expect(dbA.canonicalPath).not.toBe(dbB.canonicalPath);
    expect(fs.existsSync(dbA.canonicalPath)).toBe(true);
    expect(fs.existsSync(dbB.canonicalPath)).toBe(true);
  });

  it('proves User B cannot see or inherit User A records', async () => {
    const clientB = new PrismaClient({
      datasources: { db: { url: `file:${dbB.canonicalPath.replace(/\\/g, '/')}` } },
    });
    await clientB.$connect();
    const partiesInB = await clientB.$queryRawUnsafe<any[]>('SELECT * FROM "Party";');
    await clientB.$disconnect();

    expect(partiesInB.some((p) => p.partyCode === 'PARTY_A_001')).toBe(false);
    expect(partiesInB.some((p) => p.partyCode === 'PARTY_B_001')).toBe(true);
  });

  it('proves User A cannot see or inherit User B records', async () => {
    const clientA = new PrismaClient({
      datasources: { db: { url: `file:${dbA.canonicalPath.replace(/\\/g, '/')}` } },
    });
    await clientA.$connect();
    const partiesInA = await clientA.$queryRawUnsafe<any[]>('SELECT * FROM "Party";');
    await clientA.$disconnect();

    expect(partiesInA.some((p) => p.partyCode === 'PARTY_B_001')).toBe(false);
    expect(partiesInA.some((p) => p.partyCode === 'PARTY_A_001')).toBe(true);
  });

  it('proves provisioning without an explicit target userId is strictly rejected', async () => {
    await expect(
      onboardingService.createNewDatabase({
        userId: '' as any,
        displayName: 'Anonymous_DB',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('proves provisioning with a foreign or inactive userId is strictly rejected', async () => {
    await expect(
      onboardingService.createNewDatabase({
        userId: 'non-existent-user-id',
        displayName: 'Ghost_DB',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('proves User B provisioning does not mutate User A database', async () => {
    const clientA = new PrismaClient({
      datasources: { db: { url: `file:${dbA.canonicalPath.replace(/\\/g, '/')}` } },
    });
    await clientA.$connect();
    const countBeforeRes = await clientA.$queryRawUnsafe<any[]>('SELECT count(*) as c FROM "Party";');
    const countBefore = Number(countBeforeRes[0].c);

    // Provision a third database for User B
    const provB2 = await onboardingService.createNewDatabase({
      userId: userB.id,
      displayName: `DB_UserB_Second_${Date.now()}`,
    });
    createdFiles.push(provB2.registry.canonicalPath);

    const countAfterRes = await clientA.$queryRawUnsafe<any[]>('SELECT count(*) as c FROM "Party";');
    const countAfter = Number(countAfterRes[0].c);
    await clientA.$disconnect();

    expect(countAfter).toBe(countBefore);
  });

  it('proves User B cannot attach User A database without explicit confirmation', async () => {
    await expect(
      onboardingService.attachExistingDatabase({
        path: dbA.canonicalPath,
        userId: userB.id,
        confirmAttachment: false,
      })
    ).rejects.toThrow(/Explicit confirmation is required/i);
  });
});
