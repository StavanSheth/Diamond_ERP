import prisma from './providers/db/prisma';

async function main() {
  const stocks = await prisma.stock.findMany();
  if (stocks.length < 10) return;

  // Make 5 stocks ARCHIVED
  const toArchive = stocks.slice(0, 5);
  for (const s of toArchive) {
    await prisma.stock.update({ where: { id: s.id }, data: { isActive: false } });
  }

  // Make 5 stocks SOLD_OUT (change all their diamond items to SOLD)
  const toSellOut = stocks.slice(5, 10);
  for (const s of toSellOut) {
    await prisma.diamondItem.updateMany({
      where: { stockId: s.id },
      data: { status: 'SOLD' }
    });
  }

  console.log('Fixed states for 10 stocks.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
