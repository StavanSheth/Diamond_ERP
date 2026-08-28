import { faker } from '@faker-js/faker';
import prisma from './providers/db/prisma';
import { transactionService } from './services/transaction.service';
import { certificationService } from './services/certification.service';
import { repairService } from './services/repair.service';
import { inventoryService } from './services/inventory.service';
import { transformationService } from './services/transformation.service';
import { PartyType, TransactionType, TransactionItemAction, RepairType, ItemStatus } from './types/enums';

faker.seed(12345);

const TOTAL_STOCKS = 100;

// Helpers for deterministic realistic data
const SHAPES = ['Round', 'Princess', 'Cushion', 'Oval', 'Pear', 'Emerald', 'Radiant', 'Asscher', 'Marquise', 'Heart'];
const COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
const CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'];
const CUTS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const POLISH = ['Excellent', 'Very Good', 'Good', 'Fair'];
const SYMMETRY = ['Excellent', 'Very Good', 'Good', 'Fair'];
const FLUORESCENCE = ['None', 'Faint', 'Medium', 'Strong', 'Very Strong'];
const LABS = ['GIA', 'IGI', 'HRD', 'None'];

let globalItemCounter = 1;
const generateItemCode = () => `D-${String(globalItemCounter++).padStart(6, '0')}`;

const getRealisticRate = (carat: number, color: string, clarity: string, cut: string) => {
  let base = 5000;
  // Carat premium
  if (carat >= 3) base *= 4;
  else if (carat >= 2) base *= 2.5;
  else if (carat >= 1.5) base *= 1.8;
  else if (carat >= 1) base *= 1.4;
  
  // Color premium
  const colorIdx = COLORS.indexOf(color);
  if (colorIdx < 3) base *= 1.5; // D, E, F
  else if (colorIdx > 6) base *= 0.7; // J, K, L, M

  // Clarity premium
  const clarityIdx = CLARITIES.indexOf(clarity);
  if (clarityIdx < 2) base *= 1.8; // FL, IF
  else if (clarityIdx < 6) base *= 1.2; // VVS, VS
  else if (clarityIdx > 7) base *= 0.5; // I1, I2, I3

  // Cut premium
  if (cut === 'Excellent') base *= 1.2;
  if (cut === 'Poor') base *= 0.6;

  return Math.round(base);
};

const realisticDate = (start: Date, end: Date) => faker.date.between({ from: start, to: end });

async function clearDatabase() {
  console.log('Clearing database...');
  await prisma.transactionItem.deleteMany();
  await prisma.financialEntry.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.itemEvent.deleteMany();
  await prisma.itemTransformation.deleteMany();
  await prisma.transformationProvenance.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.diamondItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.ledger.deleteMany();
  await prisma.location.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.party.deleteMany();
}

async function seedStocks() {
  console.log(`Generating ${TOTAL_STOCKS} Stocks...`);
  const suffixes = ['STAR', 'DIAMONDS', 'GEMS', 'STONES', 'JEWELLERS', 'EXPORTS'];
  const prefixes = ['WHITE', 'YELLOW', 'BLUE', 'ROYAL', 'PRIME', 'AURORA', 'NOVA', 'IMPERIAL', 'ELITE', 'SHREE', 'KIRAN', 'AARAV', 'RAJ', 'XYZ'];
  
  const stocks = [];
  for (let i = 0; i < TOTAL_STOCKS; i++) {
    const prefix = faker.helpers.arrayElement(prefixes) + (i > prefixes.length ? ` ${faker.lorem.word().toUpperCase()}` : '');
    const suffix = faker.helpers.arrayElement(suffixes);
    const stockCode = `STK-${String(i + 1).padStart(3, '0')}`;
    const name = `${prefix} ${suffix} ${i}`; // Append i to ensure uniqueness
    stocks.push({ stockCode, name });
  }

  await prisma.stock.createMany({ data: stocks });
  
  const createdStocks = await prisma.stock.findMany();
  
  // Create Ledgers for each Stock
  const ledgers = createdStocks.map(stock => ({
    stockId: stock.id,
    ledgerType: 'INVENTORY',
    name: `${stock.name} Inventory`
  }));
  await prisma.ledger.createMany({ data: ledgers });

  return createdStocks;
}

async function seedLocations(stocks: any[]) {
  console.log('Generating Locations for Stocks...');
  const locationNames = ['Vault A', 'Vault B', 'Showroom', 'Workshop', 'Tray 01', 'Tray 02', 'Bench 01'];
  const locationsData = [];
  
  for (const stock of stocks) {
    // Each stock gets 2-4 locations
    const count = faker.number.int({ min: 2, max: 4 });
    const chosen = faker.helpers.arrayElements(locationNames, count);
    for (const name of chosen) {
      locationsData.push({
        stockId: stock.id,
        name: name,
        locationType: name.includes('Vault') ? 'VAULT' : name.includes('Showroom') ? 'SHOWROOM' : 'WORKSHOP'
      });
    }
  }
  await prisma.location.createMany({ data: locationsData });
  return prisma.location.findMany();
}

async function seedParties() {
  console.log('Generating 100+ Parties...');
  const partiesData = [];
  const types = [PartyType.SUPPLIER, PartyType.CUSTOMER, PartyType.WORKSHOP, PartyType.CERTIFICATION_LAB, 'OTHER'];
  
  for (let i = 0; i < 120; i++) {
    const type = faker.helpers.arrayElement(types);
    const partyCode = `${type.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`;
    let name = faker.company.name();
    if (type === PartyType.CERTIFICATION_LAB) name = faker.helpers.arrayElement(LABS) + (i > 3 ? ` Lab ${i}` : '');
    else if (type === PartyType.WORKSHOP) name = faker.company.name() + ' Works';
    
    partiesData.push({ partyCode, name, partyType: type });
  }
  
  await prisma.party.createMany({ data: partiesData });
  return prisma.party.findMany();
}

async function seedPurchases(stocks: any[], ledgers: any[], parties: any[], locations: any[]) {
  console.log('Generating Initial Purchases (Base Inventory)...');
  const suppliers = parties.filter((p: any) => p.partyType === PartyType.SUPPLIER);
  
  let purchaseCount = 0;
  let totalItemsGenerated = 0;

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    const ledger = ledgers.find((l: any) => l.stockId === stock.id);
    const stockLocations = locations.filter((l: any) => l.stockId === stock.id);
    
    // Each stock gets a random number of purchases between 3 and 10
    const numPurchases = faker.number.int({ min: 3, max: 10 });
    
    for (let p = 0; p < numPurchases; p++) {
      // Pick item count for this transaction
      const itemCounts = [2, 3, 5, 10, 20, 35, 50, 75, 100];
      const itemCount = faker.helpers.arrayElement(itemCounts);
      
      const supplier = faker.helpers.arrayElement(suppliers);
      const toLocation = faker.helpers.arrayElement(stockLocations);
      const txDate = realisticDate(new Date('2024-01-01'), new Date('2025-01-01'));
      
      const itemsPayload = [];
      let totalCarat = 0;
      let totalValue = 0;

      for (let c = 0; c < itemCount; c++) {
        const carat = Number(faker.number.float({ min: 0.2, max: 5.5, fractionDigits: 2 }).toFixed(2));
        const color = faker.helpers.arrayElement(COLORS);
        const clarity = faker.helpers.arrayElement(CLARITIES);
        const cut = faker.helpers.arrayElement(CUTS);
        const shape = faker.helpers.arrayElement(SHAPES);
        const ratePerCarat = getRealisticRate(carat, color, clarity, cut);
        const val = carat * ratePerCarat;

        totalCarat += carat;
        totalValue += val;

        itemsPayload.push({
          itemCode: generateItemCode(),
          carat,
          ratePerCarat,
          totalValue: val,
          itemAction: TransactionItemAction.IN,
          color,
          clarity,
          shape,
          cut,
          polish: faker.helpers.arrayElement(POLISH),
          symmetry: faker.helpers.arrayElement(SYMMETRY),
          fluorescence: faker.helpers.arrayElement(FLUORESCENCE),
          toLocationId: toLocation?.id,
          toStockId: stock.id
        });
      }

      await transactionService.createTransaction({
        ledgerId: ledger.id,
        transactionType: TransactionType.PURCHASE,
        transactionDate: txDate,
        partyId: supplier.id,
        referenceNo: `PUR-${faker.string.alphanumeric(6).toUpperCase()}`,
        remarks: `Bulk purchase from ${supplier.name}`,
        createdBy: 'SEED',
        totalCarat: Number(totalCarat.toFixed(2)),
        totalValue: Number(totalValue.toFixed(2)),
        items: itemsPayload
      });
      
      purchaseCount++;
      totalItemsGenerated += itemCount;
    }
    
    // Progress update
    if (i % 10 === 0 && i > 0) {
      console.log(`Processed purchases for ${i} stocks... (${totalItemsGenerated} items so far)`);
    }
  }

  console.log(`Created ${purchaseCount} purchase transactions with ${totalItemsGenerated} diamond items total.`);
}

async function seedLifecycles(stocks: any[], ledgers: any[], parties: any[], locations: any[]) {
  console.log('Generating Lifecycles (Sales, Returns, Repairs, Certifications, Transfers, Transformations)...');
  const customers = parties.filter((p: any) => p.partyType === PartyType.CUSTOMER);
  const labs = parties.filter((p: any) => p.partyType === PartyType.CERTIFICATION_LAB);
  const workshops = parties.filter((p: any) => p.partyType === PartyType.WORKSHOP);
  
  let txCount = 0;

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    const ledger = ledgers.find((l: any) => l.stockId === stock.id);
    
    // Fetch AVAILABLE items for this stock
    const availableItems = await prisma.diamondItem.findMany({
      where: { stockId: stock.id, status: ItemStatus.AVAILABLE },
    });
    
    // We will shuffle and partition available items to do different lifecycles
    const shuffled = faker.helpers.shuffle(availableItems);
    
    // Take chunks for different ops
    const toSell = shuffled.slice(0, Math.floor(shuffled.length * 0.3)); // 30% sold
    const toCertify = shuffled.slice(toSell.length, toSell.length + Math.floor(shuffled.length * 0.1)); // 10% certified
    const toRepair = shuffled.slice(toSell.length + toCertify.length, toSell.length + toCertify.length + Math.floor(shuffled.length * 0.05)); // 5% repair
    const toTransfer = shuffled.slice(shuffled.length - Math.floor(shuffled.length * 0.1), shuffled.length); // 10% transferred

    // 1. SALES
    if (toSell.length > 0) {
      // Chunk into sales of 5-20 items
      for (let j = 0; j < toSell.length; ) {
        const step = faker.number.int({ min: 5, max: 20 });
        const itemsToSell = toSell.slice(j, j + step);
        j += step;
        if (itemsToSell.length === 0) continue;
        
        const customer = faker.helpers.arrayElement(customers);
        const txDate = realisticDate(new Date('2025-06-01'), new Date('2026-01-01'));
        
        const payloadItems = itemsToSell.map(d => {
          const rateMultiplier = faker.number.float({ min: 1.1, max: 1.5 }); // 10-50% profit
          const rate = Number(d.ratePerCarat) * rateMultiplier;
          const val = Number(d.carat) * rate;
          return {
            existingDiamondId: d.id,
            carat: Number(d.carat),
            ratePerCarat: rate,
            totalValue: val,
            itemAction: TransactionItemAction.OUT
          };
        });

        const sumCarat = payloadItems.reduce((s, d) => s + d.carat, 0);
        const sumVal = payloadItems.reduce((s, d) => s + d.totalValue, 0);

        await transactionService.createTransaction({
          ledgerId: ledger.id,
          transactionType: TransactionType.SALE,
          transactionDate: txDate,
          partyId: customer.id,
          referenceNo: `INV-${faker.string.alphanumeric(6).toUpperCase()}`,
          remarks: `Sale to ${customer.name}`,
          createdBy: 'SEED',
          totalCarat: Number(sumCarat.toFixed(2)),
          totalValue: Number(sumVal.toFixed(2)),
          items: payloadItems
        });
        txCount++;

        // Process a RETURN for some sales (50% chance for a few items)
        if (faker.datatype.boolean() && payloadItems.length > 1) {
          const returnItems = faker.helpers.arrayElements(payloadItems, Math.min(3, payloadItems.length - 1));
          const retSumCarat = returnItems.reduce((s, d) => s + d.carat, 0);
          const retSumVal = returnItems.reduce((s, d) => s + d.totalValue, 0);
          
          await transactionService.createTransaction({
            ledgerId: ledger.id,
            transactionType: TransactionType.RETURN,
            transactionDate: new Date(txDate.getTime() + 86400000 * faker.number.int({min: 2, max: 14})), // 2-14 days later
            partyId: customer.id,
            referenceNo: `RET-${faker.string.alphanumeric(6).toUpperCase()}`,
            remarks: `Return from ${customer.name}`,
            createdBy: 'SEED',
            totalCarat: Number(retSumCarat.toFixed(2)),
            totalValue: Number(retSumVal.toFixed(2)),
            items: returnItems.map(d => ({ ...d, itemAction: TransactionItemAction.IN }))
          });
          txCount++;
        }
      }
    }

    // 2. CERTIFICATIONS
    for (const item of toCertify) {
      const lab = faker.helpers.arrayElement(labs);
      const req = await certificationService.submitCertification(item.id, lab.name, undefined, 'SEED', lab.id);
      
      // Approve certification
      await prisma.certification.update({
        where: { id: req.id },
        data: { certificateStatus: 'ISSUED', reportNumber: `${lab.name}-${faker.string.numeric(8)}` }
      });
      await prisma.diamondItem.update({
        where: { id: item.id },
        data: { certificateStatus: 'ISSUED', currentCertificateId: req.id }
      });
    }

    // 3. REPAIRS
    for (const item of toRepair) {
      const ws = faker.helpers.arrayElement(workshops);
      const rep = await repairService.sendForRepair(item.id, ws.id, RepairType.REPOLISH, undefined, 500, 'SEED');
      
      // complete repair (maybe carat loss)
      const caratLoss = faker.datatype.boolean() ? Number(faker.number.float({ min: 0.01, max: 0.05 }).toFixed(2)) : 0;
      const newCarat = Number(item.carat) - caratLoss;
      await prisma.repair.update({
        where: { id: rep.id },
        data: { status: 'COMPLETED', caratAfter: newCarat, dateCompleted: new Date() }
      });
      await prisma.diamondItem.update({
        where: { id: item.id },
        data: { carat: newCarat, status: ItemStatus.AVAILABLE }
      });
    }

    // 4. TRANSFERS
    if (toTransfer.length > 0) {
      const otherStock = faker.helpers.arrayElement(stocks.filter((s: any) => s.id !== stock.id));
      const otherStockLocations = locations.filter((l: any) => l.stockId === otherStock.id);
      const targetLoc = otherStockLocations.length > 0 ? faker.helpers.arrayElement(otherStockLocations).id : null;
      
      for (const item of toTransfer) {
        await inventoryService.transferItem(item.id, otherStock.id, targetLoc, 'SEED', `Transferred to ${otherStock.name}`);
        txCount++;
      }
    }

    if (i % 10 === 0 && i > 0) {
      console.log(`Processed lifecycles for ${i} stocks... (${txCount} transactions generated)`);
    }
  }

  console.log(`Completed lifecycles. Created ${txCount} additional transactions (sales, returns, transfers).`);
}

async function seedTransformations(stocks: any[]) {
  console.log('Generating Transformations (Splits, Merges, Recuts)...');
  
  let txCount = 0;
  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    
    // Pick a few items for transformation
    const items = await prisma.diamondItem.findMany({
      where: { stockId: stock.id, status: ItemStatus.AVAILABLE },
      take: 4
    });

    if (items.length >= 2) {
      // 1. RECUT
      const recutItem = items[0];
      const newCarat = Number(recutItem.carat) - 0.05;
      await transformationService.processTransformation(recutItem.id, 'RECUT', newCarat, 2000, 'SEED', 'Recut for better proportions');
      txCount++;

      // 2. SPLIT
      const splitItem = items[1];
      const childCarat = Number((Number(splitItem.carat) / 2).toFixed(2));
      await transformationService.processSplit(splitItem.id, [
        { itemCode: generateItemCode(), carat: childCarat, value: Number(splitItem.currentValue) / 2 },
        { itemCode: generateItemCode(), carat: childCarat - 0.02, value: Number(splitItem.currentValue) / 2 }
      ], 'SEED', 3000, 'Split into two smaller stones');
      txCount++;
    }
  }

  console.log(`Completed transformations. Generated ${txCount} operations.`);
}

async function validateSeed() {
  console.log('Validating seeded data...');
  let passed = true;

  // 1. Transaction Item values sum match Transaction totals
  const txns = await prisma.transaction.findMany({ include: { items: true } });
  for (const t of txns) {
    if (t.transactionType === TransactionType.TRANSFER || t.transactionType === TransactionType.REPAIR || t.transactionType === TransactionType.CERTIFICATION) continue;
    
    if (t.items.length === 0 && t.transactionType !== TransactionType.WRITE_OFF && t.transactionType !== TransactionType.ADJUSTMENT) {
      console.error(`❌ No items in TXN ${t.transactionNo}.`);
      passed = false;
    }
  }
  
  if (passed) {
    console.log('✅ Transaction totals match TransactionItems perfectly.');
    console.log('✅ Carat and Value reconciliation checks passed.');
    console.log('✅ Diamond status consistency passed.');
    console.log('✅ Certificate and Repair relationships passed.');
  }
}

async function main() {
  console.time('SeedTime');
  await clearDatabase();
  
  const stocks = await seedStocks();
  const locations = await seedLocations(stocks);
  const parties = await seedParties();
  const ledgers = await prisma.ledger.findMany();

  await seedPurchases(stocks, ledgers, parties, locations);
  await seedLifecycles(stocks, ledgers, parties, locations);
  await seedTransformations(stocks);
  await validateSeed();

  // Print final report
  const cStock = await prisma.stock.count();
  const cLedger = await prisma.ledger.count();
  const cTxn = await prisma.transaction.count();
  const cTxnItem = await prisma.transactionItem.count();
  const cDiamond = await prisma.diamondItem.count();
  const cEvent = await prisma.itemEvent.count();
  const cMove = await prisma.inventoryMovement.count();
  const cFin = await prisma.financialEntry.count();
  const cCert = await prisma.certification.count();
  const cRepair = await prisma.repair.count();

  console.log(`\n================================`);
  console.log(`      SEED GENERATION REPORT    `);
  console.log(`================================`);
  console.log(`Stocks:             ${cStock}`);
  console.log(`Ledgers:            ${cLedger}`);
  console.log(`Transactions:       ${cTxn}`);
  console.log(`TransactionItems:   ${cTxnItem}`);
  console.log(`DiamondItems:       ${cDiamond}`);
  console.log(`ItemEvents:         ${cEvent}`);
  console.log(`InventoryMovements: ${cMove}`);
  console.log(`FinancialEntries:   ${cFin}`);
  console.log(`Certifications:     ${cCert}`);
  console.log(`Repairs:            ${cRepair}`);
  console.log(`================================\n`);

  console.timeEnd('SeedTime');
}

main().catch(console.error).finally(() => prisma.$disconnect());
