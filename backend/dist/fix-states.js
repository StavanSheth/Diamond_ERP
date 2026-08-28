"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("./providers/db/prisma"));
async function main() {
    const stocks = await prisma_1.default.stock.findMany();
    if (stocks.length < 10)
        return;
    // Make 5 stocks ARCHIVED
    const toArchive = stocks.slice(0, 5);
    for (const s of toArchive) {
        await prisma_1.default.stock.update({ where: { id: s.id }, data: { isActive: false } });
    }
    // Make 5 stocks SOLD_OUT (change all their diamond items to SOLD)
    const toSellOut = stocks.slice(5, 10);
    for (const s of toSellOut) {
        await prisma_1.default.diamondItem.updateMany({
            where: { stockId: s.id },
            data: { status: 'SOLD' }
        });
    }
    console.log('Fixed states for 10 stocks.');
}
main().catch(console.error).finally(() => prisma_1.default.$disconnect());
//# sourceMappingURL=fix-states.js.map