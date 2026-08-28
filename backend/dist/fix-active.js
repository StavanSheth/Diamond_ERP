"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("./providers/db/prisma"));
async function main() {
    const stocks = await prisma_1.default.stock.findMany({ include: { diamondItems: true } });
    // Find all partial stocks (soldCount > 0 && soldCount < totalCount)
    const partialStocks = stocks.filter(s => {
        if (!s.isActive)
            return false;
        const soldCount = s.diamondItems.filter(i => i.status === 'SOLD').length;
        return soldCount > 0 && soldCount < s.diamondItems.length;
    });
    // Take 20 of them and revert their SOLD items to AVAILABLE
    const toRevert = partialStocks.slice(0, 20);
    for (const s of toRevert) {
        await prisma_1.default.diamondItem.updateMany({
            where: { stockId: s.id, status: 'SOLD' },
            data: { status: 'AVAILABLE' } // simple revert to make them fully ACTIVE
        });
    }
    console.log('Reverted sold items for 20 stocks. They are now fully ACTIVE.');
}
main().catch(console.error).finally(() => prisma_1.default.$disconnect());
//# sourceMappingURL=fix-active.js.map