"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const p = new client_1.PrismaClient();
async function run() {
    const ledgers = await p.ledger.findMany({ include: { stock: { include: { diamondItems: true } } } });
    for (const l of ledgers) {
        if (l.stock.diamondItems.length > 0) {
            let cIn = 0, vIn = 0;
            const evs = [];
            const tis = [];
            for (const i of l.stock.diamondItems) {
                cIn += Number(i.carat);
                vIn += Number(i.currentValue);
                tis.push({
                    diamondItemId: i.id,
                    quantity: 1,
                    carat: Number(i.carat),
                    ratePerCarat: Number(i.ratePerCarat),
                    totalValue: Number(i.currentValue),
                    itemAction: 'ADDED'
                });
                evs.push({
                    diamondItemId: i.id,
                    eventType: 'OPENING_BALANCE',
                    eventDate: new Date(),
                    caratAfter: Number(i.carat),
                    valueAfter: Number(i.currentValue),
                    statusAfter: i.status,
                    createdBy: 'system',
                    remarks: 'Legacy Sync'
                });
            }
            await p.transaction.create({
                data: {
                    ledgerId: l.id,
                    transactionNo: 'TXN-MIG-' + l.id.substring(0, 6),
                    transactionDate: new Date(),
                    transactionType: 'PURCHASE',
                    createdBy: 'system',
                    caratIn: cIn,
                    valueIn: vIn,
                    items: { create: tis },
                    events: { create: evs }
                }
            });
            console.log('Created ledger txn for ' + l.stock.name);
        }
    }
}
run().catch(console.error).finally(() => p.$disconnect());
//# sourceMappingURL=fix.js.map