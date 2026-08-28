"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("./providers/db/prisma"));
async function main() {
    const stocks = await prisma_1.default.stock.findMany({ include: { diamondItems: true } });
    let active = 0, partial = 0, soldOut = 0, archived = 0;
    for (const s of stocks) {
        if (!s.isActive) {
            archived++;
            continue;
        }
        const soldCount = s.diamondItems.filter(i => i.status === 'SOLD').length;
        if (s.diamondItems.length > 0 && soldCount === s.diamondItems.length) {
            soldOut++;
        }
        else if (soldCount > 0 && soldCount < s.diamondItems.length) {
            partial++;
        }
        else {
            active++;
        }
    }
    console.log(`Active: ${active}, Partial: ${partial}, SoldOut: ${soldOut}, Archived: ${archived}`);
}
main().catch(console.error).finally(() => prisma_1.default.$disconnect());
//# sourceMappingURL=check-stocks.js.map