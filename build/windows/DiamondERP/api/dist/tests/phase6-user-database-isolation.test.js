"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const client_1 = require("@prisma/client");
const onboarding_service_1 = require("../modules/system/onboarding/onboarding.service");
const installation_service_1 = require("../modules/system/installation.service");
const errors_1 = require("../errors");
(0, vitest_1.describe)('Phase 6 — User ↔ Database Absolute Isolation Matrix', () => {
    let userA;
    let userB;
    let dbA;
    let dbB;
    const createdFiles = [];
    (0, vitest_1.beforeAll)(async () => {
        await installation_service_1.installationService.getOrCreateInstallation();
        const suffix = Date.now().toString();
        // Create User A
        const resA = await onboarding_service_1.onboardingService.createBusinessUser({
            username: `user_a_${suffix}`,
            password: 'Password123456!',
            displayName: 'User A',
            role: 'ADMIN',
        });
        userA = resA.user;
        // Create User B
        const resB = await onboarding_service_1.onboardingService.createBusinessUser({
            username: `user_b_${suffix}`,
            password: 'Password123456!',
            displayName: 'User B',
            role: 'VIEWER',
        });
        userB = resB.user;
        // Provision DB A for User A
        const provA = await onboarding_service_1.onboardingService.createNewDatabase({
            userId: userA.id,
            displayName: `DB_UserA_${suffix}`,
        });
        dbA = provA.registry;
        createdFiles.push(dbA.canonicalPath);
        // Provision DB B for User B
        const provB = await onboarding_service_1.onboardingService.createNewDatabase({
            userId: userB.id,
            displayName: `DB_UserB_${suffix}`,
        });
        dbB = provB.registry;
        createdFiles.push(dbB.canonicalPath);
        // Seed distinct business records into DB A
        const clientA = new client_1.PrismaClient({
            datasources: { db: { url: `file:${dbA.canonicalPath.replace(/\\/g, '/')}` } },
        });
        await clientA.$connect();
        await clientA.$executeRawUnsafe(`INSERT INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);`, crypto.randomUUID(), 'PARTY_A_001', 'Diamond Supplier Alpha for User A', 'SUPPLIER', new Date().toISOString(), new Date().toISOString());
        await clientA.$disconnect();
        // Seed distinct business records into DB B
        const clientB = new client_1.PrismaClient({
            datasources: { db: { url: `file:${dbB.canonicalPath.replace(/\\/g, '/')}` } },
        });
        await clientB.$connect();
        await clientB.$executeRawUnsafe(`INSERT INTO "Party" (id, partyCode, name, partyType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);`, crypto.randomUUID(), 'PARTY_B_001', 'Diamond Supplier Beta for User B', 'CUSTOMER', new Date().toISOString(), new Date().toISOString());
        await clientB.$disconnect();
    });
    (0, vitest_1.afterAll)(async () => {
        for (const f of createdFiles) {
            if (fs_1.default.existsSync(f)) {
                try {
                    fs_1.default.unlinkSync(f);
                }
                catch { }
            }
        }
    });
    (0, vitest_1.it)('proves User A and User B have separate physical database files', () => {
        (0, vitest_1.expect)(dbA.canonicalPath).not.toBe(dbB.canonicalPath);
        (0, vitest_1.expect)(fs_1.default.existsSync(dbA.canonicalPath)).toBe(true);
        (0, vitest_1.expect)(fs_1.default.existsSync(dbB.canonicalPath)).toBe(true);
    });
    (0, vitest_1.it)('proves User B cannot see or inherit User A records', async () => {
        const clientB = new client_1.PrismaClient({
            datasources: { db: { url: `file:${dbB.canonicalPath.replace(/\\/g, '/')}` } },
        });
        await clientB.$connect();
        const partiesInB = await clientB.$queryRawUnsafe('SELECT * FROM "Party";');
        await clientB.$disconnect();
        (0, vitest_1.expect)(partiesInB.some((p) => p.partyCode === 'PARTY_A_001')).toBe(false);
        (0, vitest_1.expect)(partiesInB.some((p) => p.partyCode === 'PARTY_B_001')).toBe(true);
    });
    (0, vitest_1.it)('proves User A cannot see or inherit User B records', async () => {
        const clientA = new client_1.PrismaClient({
            datasources: { db: { url: `file:${dbA.canonicalPath.replace(/\\/g, '/')}` } },
        });
        await clientA.$connect();
        const partiesInA = await clientA.$queryRawUnsafe('SELECT * FROM "Party";');
        await clientA.$disconnect();
        (0, vitest_1.expect)(partiesInA.some((p) => p.partyCode === 'PARTY_B_001')).toBe(false);
        (0, vitest_1.expect)(partiesInA.some((p) => p.partyCode === 'PARTY_A_001')).toBe(true);
    });
    (0, vitest_1.it)('proves provisioning without an explicit target userId is strictly rejected', async () => {
        await (0, vitest_1.expect)(onboarding_service_1.onboardingService.createNewDatabase({
            userId: '',
            displayName: 'Anonymous_DB',
        })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('proves provisioning with a foreign or inactive userId is strictly rejected', async () => {
        await (0, vitest_1.expect)(onboarding_service_1.onboardingService.createNewDatabase({
            userId: 'non-existent-user-id',
            displayName: 'Ghost_DB',
        })).rejects.toThrow(errors_1.ValidationError);
    });
    (0, vitest_1.it)('proves User B provisioning does not mutate User A database', async () => {
        const clientA = new client_1.PrismaClient({
            datasources: { db: { url: `file:${dbA.canonicalPath.replace(/\\/g, '/')}` } },
        });
        await clientA.$connect();
        const countBeforeRes = await clientA.$queryRawUnsafe('SELECT count(*) as c FROM "Party";');
        const countBefore = Number(countBeforeRes[0].c);
        // Provision a third database for User B
        const provB2 = await onboarding_service_1.onboardingService.createNewDatabase({
            userId: userB.id,
            displayName: `DB_UserB_Second_${Date.now()}`,
        });
        createdFiles.push(provB2.registry.canonicalPath);
        const countAfterRes = await clientA.$queryRawUnsafe('SELECT count(*) as c FROM "Party";');
        const countAfter = Number(countAfterRes[0].c);
        await clientA.$disconnect();
        (0, vitest_1.expect)(countAfter).toBe(countBefore);
    });
    (0, vitest_1.it)('proves User B cannot attach User A database without explicit confirmation', async () => {
        await (0, vitest_1.expect)(onboarding_service_1.onboardingService.attachExistingDatabase({
            path: dbA.canonicalPath,
            userId: userB.id,
            confirmAttachment: false,
        })).rejects.toThrow(/Explicit confirmation is required/i);
    });
});
//# sourceMappingURL=phase6-user-database-isolation.test.js.map