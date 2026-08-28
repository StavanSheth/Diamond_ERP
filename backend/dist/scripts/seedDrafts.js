"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const draft_service_1 = require("../services/draft.service");
const prisma = new client_1.PrismaClient();
async function seedDrafts() {
    console.log('Seeding drafts...');
    // Find a random ledger and party to use
    const ledger = await prisma.ledger.findFirst();
    const party = await prisma.party.findFirst();
    if (!ledger) {
        console.log('No ledgers found in database. Cannot create realistic drafts.');
        return;
    }
    const draft1 = {
        entityType: 'TRANSACTION',
        entityId: `draft-txn-1`,
        createdBy: 'Stavan',
        deviceId: 'web-browser-1',
        status: 'ACTIVE',
        payload: {
            ledgerId: ledger.id,
            txnType: 'PURCHASE',
            transactionDate: new Date().toISOString(),
            partyId: party?.id || 'P1',
            remarks: 'Draft for importing a new batch of 5ct round diamonds from Surat.',
            items: [
                {
                    itemCode: `ITM-${Date.now()}-0`,
                    carat: 5.2,
                    totalValue: 520000,
                    ratePerCarat: 100000,
                    itemAction: 'IN',
                    shape: 'Round',
                    color: 'F',
                    clarity: 'VVS2',
                    cut: 'EX',
                    category: 'SINGLE'
                }
            ]
        }
    };
    const draft2 = {
        entityType: 'TRANSACTION',
        entityId: `draft-txn-2`,
        createdBy: 'Stavan',
        deviceId: 'web-browser-2',
        status: 'ACTIVE',
        payload: {
            ledgerId: ledger.id,
            txnType: 'SALE',
            transactionDate: new Date().toISOString(),
            partyId: party?.id || 'P2',
            remarks: 'Pending sale to Mumbai client. Needs confirmation on certification costs.',
            items: [
                {
                    itemCode: `ITM-${Date.now()}-1`,
                    carat: 2.1,
                    totalValue: 189000,
                    ratePerCarat: 90000,
                    itemAction: 'OUT',
                    shape: 'Oval',
                    color: 'G',
                    clarity: 'VS1',
                    cut: 'VG',
                    category: 'SINGLE'
                },
                {
                    itemCode: `ITM-${Date.now()}-2`,
                    carat: 1.0,
                    totalValue: 85000,
                    ratePerCarat: 85000,
                    itemAction: 'OUT',
                    shape: 'Princess',
                    color: 'E',
                    clarity: 'VVS1',
                    cut: 'EX',
                    category: 'SINGLE'
                }
            ]
        }
    };
    const draft3 = {
        entityType: 'TRANSACTION',
        entityId: `draft-txn-3`,
        createdBy: 'Stavan',
        deviceId: 'mobile-app-1',
        status: 'ACTIVE',
        payload: {
            ledgerId: ledger.id,
            txnType: 'REPAIR_OUT',
            transactionDate: new Date().toISOString(),
            partyId: party?.id || 'P3',
            remarks: 'Sending two rough stones for polishing and symmetry fixing.',
            items: [
                {
                    itemCode: `ITM-${Date.now()}-3`,
                    carat: 3.0,
                    totalValue: 150000,
                    ratePerCarat: 50000,
                    itemAction: 'OUT',
                    shape: 'Rough',
                    color: 'I',
                    clarity: 'SI1',
                    category: 'SINGLE',
                    repairType: 'Polishing',
                    repairCost: 5000
                }
            ]
        }
    };
    for (const draft of [draft1, draft2, draft3]) {
        const created = await draft_service_1.draftService.createDraft({
            entityType: draft.entityType,
            entityId: draft.entityId,
            createdBy: draft.createdBy,
            payload: draft.payload,
            deviceId: draft.deviceId
        });
        console.log(`Created draft ${created.id}`);
    }
    console.log('Successfully seeded 3 realistic drafts.');
}
seedDrafts()
    .catch(e => console.error(e))
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seedDrafts.js.map