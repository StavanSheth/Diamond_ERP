import prisma from './providers/db/prisma';

async function main() {
  const stocks = await prisma.stock.findMany({ include: { diamondItems: true } });
  let active = 0, partial = 0, soldOut = 0, archived = 0;
  for (const s of stocks) {
    if (!s.isActive) {
      archived++;
      continue;
    }
    const soldCount = s.diamondItems.filter(i => i.status === 'SOLD').length;
    if (s.diamondItems.length > 0 && soldCount === s.diamondItems.length) {
      soldOut++;
    } else if (soldCount > 0 && soldCount < s.diamondItems.length) {
      partial++;
    } else {
      active++;
    }
  }
  console.log(`Active: ${active}, Partial: ${partial}, SoldOut: ${soldOut}, Archived: ${archived}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
