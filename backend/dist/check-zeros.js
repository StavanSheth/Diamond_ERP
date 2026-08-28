"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const p = new client_1.PrismaClient();
async function run() {
    const items = await p.diamondItem.findMany();
    console.log("DIAMONDS:");
    console.log(items.map(i => ({ id: i.itemCode, carat: Number(i.carat), rate: Number(i.ratePerCarat), val: Number(i.currentValue) })));
    const ledgers = await p.ledger.findMany({ include: { transactions: true } });
    console.log("LEDGERS & TRANSACTIONS:");
    for (const l of ledgers) {
        for (const t of l.transactions) {
            console.log(`TXN ${t.transactionNo} - caratIn: ${Number(t.caratIn)}, valueIn: ${Number(t.valueIn)}`);
        }
    }
}
run().finally(() => p.$disconnect());
//# sourceMappingURL=check-zeros.js.map