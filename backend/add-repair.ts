import { PrismaClient } from '@prisma/client';
import { TransactionService } from './src/services/transaction.service';

const prisma = new PrismaClient();
const transactionService = new TransactionService();

async function main() {
  console.log('Fetching active diamonds...');
  const activeDiamonds = await prisma.diamondItem.findMany({
    take: 3,
  });

  if (activeDiamonds.length === 0) {
    console.log('No active diamonds found. Aborting.');
    return;
  }

  const stockId = activeDiamonds[0].stockId;
  const ledger = await prisma.ledger.findFirst({
    where: { stockId: stockId }
  });

  if (!ledger) {
    console.log('No ledger found for stock.');
    return;
  }

  const parties = await prisma.party.findMany();
  const party = parties.find(p => p.partyType === 'VENDOR' || p.partyType === 'OTHER') || parties[0];

  if (!party) {
    console.log('No party found.');
    return;
  }

  console.log(`Creating REPAIR_OUT transaction for ${activeDiamonds.length} diamonds...`);
  
  const payload = {
    ledgerId: ledger.id,
    transactionType: 'REPAIR_OUT',
    transactionDate: new Date().toISOString(),
    createdBy: 'system',
    partyId: party.id,
    remarks: 'Mock Repair',
    referenceNo: 'REP-' + Date.now(),
    items: activeDiamonds.map((d, i) => ({
      itemCode: `REP-ITM-${Date.now()}-${i}`,
      existingDiamondId: d.id,
      carat: d.carat,
      totalValue: d.currentValue,
      ratePerCarat: d.ratePerCarat,
      itemAction: 'OUT',
      shape: d.shape,
      color: d.color,
      clarity: d.clarity,
      cut: d.cut,
      polish: d.polish,
      symmetry: d.symmetry,
      fluorescence: d.fluorescence,
      category: d.category,
      repairType: 'Polishing',
      repairVendorId: party.id,
      repairCost: 50
    }))
  };

  const txn = await transactionService.createTransaction(payload as any);
  console.log('Created Repair Transaction:', txn.transactionNo);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
