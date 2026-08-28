import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const prisma = new PrismaClient();

async function run() {
  console.log('Starting migration from legacy sheets to Prisma SQLite DB...');
  
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID || '', serviceAccountAuth);
  await doc.loadInfo();
  
  const masterSheet = doc.sheetsByTitle['Stock_Master'];
  const itemSheet = doc.sheetsByTitle['Stock_Item_Master'];
  const certSheet = doc.sheetsByTitle['Certificate_Master'];
  const repairSheet = doc.sheetsByTitle['Repair_Master'];
  const settingsSheet = doc.sheetsByTitle['System_Settings'];
  
  if (!masterSheet || !itemSheet || !certSheet) {
    console.error('Legacy sheets not found!');
    process.exit(1);
  }

  const masters = await masterSheet.getRows();
  const items = await itemSheet.getRows();
  const certs = await certSheet.getRows();
  const repairsSheetData = repairSheet ? await repairSheet.getRows() : [];
  const settingsSheetData = settingsSheet ? await settingsSheet.getRows() : [];
  
  console.log(`Found ${masters.length} Stocks, ${items.length} Items, ${certs.length} Certs, ${repairsSheetData.length} Repairs. Clearing DB...`);
  await prisma.itemEvent.deleteMany({});
  await prisma.repair.deleteMany({});
  await prisma.certification.deleteMany({});
  await prisma.transactionItem.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.diamondItem.deleteMany({});
  await prisma.ledger.deleteMany({});
  await prisma.setting.deleteMany({});
  await prisma.stock.deleteMany({});

  const masterMap = new Map();
  let importedStocks = 0;

  for (const m of masters) {
    const id = m.get('ID');
    if (!id) continue;

    const name = m.get('Stock_Name') || 'UNKNOWN';
    const code = name.toUpperCase().replace(/\s+/g, '_') + '_' + Math.floor(Math.random()*1000); 
    
    // Parse the total carats and total values from the MASTER table
    const masterCarat = parseFloat(m.get('Current_Carat')) || 0;
    const masterValue = parseFloat(m.get('Current_Value')) || 0;

    const stock = await prisma.stock.create({
      data: {
        stockCode: code,
        name: name,
        description: m.get('Remarks') || '',
        currency: 'INR',
        isActive: m.get('Status') !== 'DELETED',
        ledgers: {
          create: [{
            ledgerType: 'DEFAULT',
            name: `${name} Ledger`
          }]
        }
      },
      include: { ledgers: true }
    });

    masterMap.set(id, { stock, masterCarat, masterValue, assignedCount: 0 });
    importedStocks++;
  }

  // Pre-calculate how many items belong to each stock
  const itemCountMap = new Map();
  for (const item of items) {
    const stockId = item.get('Stock_ID');
    itemCountMap.set(stockId, (itemCountMap.get(stockId) || 0) + 1);
  }

  let importedItems = 0;
  for (const item of items) {
    const stockId = item.get('Stock_ID');
    const masterData = masterMap.get(stockId);
    
    if (!masterData) {
      console.warn(`Warning: Item ${item.get('ID')} references unknown Stock_ID ${stockId}. Skipping.`);
      continue;
    }

    const { stock, masterCarat, masterValue } = masterData;
    const totalItems = itemCountMap.get(stockId);

    // If item sheet has 0, inherit from master sheet distributed equally among items!
    let itemCarat = parseFloat(item.get('Current_Carat'));
    let itemValue = parseFloat(item.get('Current_Value'));
    
    if (!itemCarat || itemCarat === 0) {
        itemCarat = masterCarat / totalItems;
    }
    if (!itemValue || itemValue === 0) {
        itemValue = masterValue / totalItems;
    }

    const rate = itemCarat > 0 ? (itemValue / itemCarat) : 0;
    
    const dbItem = await prisma.diamondItem.create({
      data: {
        itemCode: item.get('ID') || `ITM-${Math.floor(Math.random()*1000000)}`,
        stockId: stock.id,
        displayName: `${item.get('Clarity') || 'VS'} ${item.get('Shape') || 'Round'}`,
        carat: itemCarat,
        color: item.get('Color_Grade') || 'D',
        clarity: item.get('Clarity') || 'VS1',
        cut: item.get('Cut') || 'EX',
        shape: item.get('Shape') || 'Round',
        ratePerCarat: rate,
        currentValue: itemValue,
        status: item.get('Status') === 'SOLD_OUT' ? 'SOLD' : 'IN_STOCK',
        certificateStatus: item.get('Certificate_Status') || 'NONE'
      }
    });
    
    // Check if this item has a certificate in Cert sheet
    const itemCerts = certs.filter(c => c.get('Stock_Item_ID') === item.get('ID') && c.get('Is_Deleted') !== 'TRUE');
    for (const cert of itemCerts) {
      let dt = new Date();
      if (cert.get('Created_Date')) {
        const d = new Date(cert.get('Created_Date'));
        if (!isNaN(d.getTime())) dt = d;
      }
      await prisma.certification.create({
        data: {
          id: cert.get('ID') || undefined,
          diamondItemId: dbItem.id,
          labType: cert.get('Lab_Type') || '',
          reportNumber: cert.get('Report_Number') || '',
          certificateStatus: cert.get('Certificate_Status') || 'PENDING',
          cost: parseFloat(cert.get('Cost')) || 0,
          measurements: cert.get('Measurements') || '',
          polish: cert.get('Polish') || '',
          symmetry: cert.get('Symmetry') || '',
          fluorescence: cert.get('Fluorescence') || '',
          laserInscription: cert.get('Laser_Inscription') || '',
          naturalOrLabGrown: cert.get('Natural_Or_Lab_Grown') || '',
          pdfPath: cert.get('PDF_Path') || '',
          proportionDiagramPath: cert.get('Proportion_Diagram_Path') || '',
          inclusionPlotPath: cert.get('Inclusion_Plot_Path') || '',
          createdAt: dt
        }
      });
    }

    // Check if this item has repairs in Repair sheet
    const itemRepairs = repairsSheetData.filter(r => r.get('Stock_Item_ID') === item.get('ID') && r.get('Is_Deleted') !== 'TRUE');
    for (const repair of itemRepairs) {
      let ds = new Date();
      if (repair.get('Created_Date')) {
        const d = new Date(repair.get('Created_Date'));
        if (!isNaN(d.getTime())) ds = d;
      }
      
      let vendorParty = await prisma.party.findFirst({ where: { name: repair.get('Vendor') }});
      if (!vendorParty && repair.get('Vendor')) {
        vendorParty = await prisma.party.create({
          data: {
            partyCode: `VND-${Date.now()}-${Math.floor(Math.random()*1000)}`,
            name: repair.get('Vendor'),
            partyType: 'WORKSHOP'
          }
        });
      }

      await prisma.repair.create({
        data: {
          id: repair.get('ID') || undefined,
          diamondItemId: dbItem.id,
          repairType: repair.get('Repair_Type') || 'Unknown',
          vendorPartyId: vendorParty?.id || 'UNKNOWN',
          dateSent: ds,
          cost: parseFloat(repair.get('Est_Cost') || '0'),
          caratBefore: dbItem.carat,
          status: repair.get('Status') || 'PENDING',
          remarks: repair.get('Remarks') || '',
        }
      });
    }

    importedItems++;
  }
  
  // Import settings
  for (const s of settingsSheetData) {
    const k = s.get('Setting_Key');
    const v = s.get('Setting_Value');
    if (k) {
      await prisma.setting.create({
        data: {
          key: k,
          value: v || ''
        }
      });
    }
  }

  console.log(`Migration complete. Imported ${importedStocks} Stocks and ${importedItems} Items with Certifications and Repairs.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
