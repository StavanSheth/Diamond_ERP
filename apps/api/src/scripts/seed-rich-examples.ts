import prisma, { runWithProfile } from '../infrastructure/database/prisma';

async function seedRichExamples() {
  console.log('🚀 Starting rich example seeding for DiamondERP V3.0 (Profile: Stavan)...');

  await runWithProfile('Stavan', async () => {
    // 1. Parties (16 Diverse Examples)
    console.log('👥 Seeding 16 Diverse Parties...');
    const partiesData = [
      // Suppliers
      { partyCode: 'PTY-SUP-01', name: 'Ketan Brothers Diamonds', partyType: 'SUPPLIER', phone: '+91 98201 11223', email: 'sales@ketanbros.com', address: 'Tower C, BDB, BKC, Mumbai', gstin: '27AABCK1234F1Z1', notes: 'Premier supplier for GIA Round Brilliants (1ct - 5ct)' },
      { partyCode: 'PTY-SUP-02', name: 'Dharmanandan Exports Ltd', partyType: 'SUPPLIER', phone: '+91 98980 22334', email: 'trade@dharmanandan.com', address: 'Diamond Park, Katargam, Surat', gstin: '24AAACD5678B1Z4', notes: 'Large melee parcels and fancy cut rough diamonds' },
      { partyCode: 'PTY-SUP-03', name: 'Rosy Blue Trading LLC', partyType: 'SUPPLIER', phone: '+32 3 206 8000', email: 'belgium@rosyblue.com', address: 'Hoveniersstraat 53, Antwerp', gstin: '07AABCR9988C1Z6', notes: 'Direct sight-holder allocation parcel supplies' },
      { partyCode: 'PTY-SUP-04', name: 'Shree Ramkrishna Gems', partyType: 'SUPPLIER', phone: '+91 98250 11999', email: 'exports@srk.in', address: 'Varachha Main Road, Surat', gstin: '24AABCS9876C1Z9', notes: 'Ethically sourced, high-clarity IF-VVS certified lots' },

      // Customers
      { partyCode: 'PTY-CUS-01', name: 'Malabar Gold & Diamonds', partyType: 'CUSTOMER', phone: '+91 94470 33445', email: 'procurement@malabargroup.com', address: 'Ram Mohan Road, Calicut, Kerala', gstin: '32AAACM4321D1Z8', notes: 'VIP retail chain client, requires net-30 terms' },
      { partyCode: 'PTY-CUS-02', name: 'Tanishq Titan Jewels', partyType: 'CUSTOMER', phone: '+91 98450 44556', email: 'diamonddesk@titan.co.in', address: 'Golden Enclave, Airport Road, Bengaluru', gstin: '29AAACT5566E1Z2', notes: 'Demands strict GIA certified EX-EX-EX stones' },
      { partyCode: 'PTY-CUS-03', name: 'Kalyan Jewellers Ltd', partyType: 'CUSTOMER', phone: '+91 98460 55667', email: 'diamondsupply@kalyan.com', address: 'Round West, Thrissur, Kerala', gstin: '32AAACK6677G1Z7', notes: 'High volume solitaire purchaser for bridal collections' },
      { partyCode: 'PTY-CUS-04', name: 'Tiffany & Co. Sourcing Office', partyType: 'CUSTOMER', phone: '+1 212 755 8000', email: 'global.sourcing@tiffany.com', address: 'Fifth Avenue, New York / BKC Mumbai', gstin: '27AABCT8899K1Z5', notes: 'International prestige client; strict inspection standards' },

      // Brokers
      { partyCode: 'PTY-BRK-01', name: 'Mehta Brokerage Services', partyType: 'BROKER', phone: '+91 98200 66778', email: 'mehtabrokers@gmail.com', address: 'Tower B, Suite 502, BDB, BKC, Mumbai', gstin: '27AABCM7788H1Z3', brokeragePercentage: 1.0, notes: 'Senior BDB broker specializing in 2ct+ solitaires' },
      { partyCode: 'PTY-BRK-02', name: 'Jhaveri & Associates', partyType: 'BROKER', phone: '+91 98210 77889', email: 'jhaveri.diamonds@gmail.com', address: 'Panchratna Building, Opera House, Mumbai', gstin: '27AABCJ8899I1Z5', brokeragePercentage: 1.5, notes: 'Specializes in export sales and international tenders' },

      // Workshops
      { partyCode: 'PTY-WKP-01', name: 'Surat Diamond Cutters Workshop', partyType: 'WORKSHOP', phone: '+91 98250 88990', email: 'suratcutters@gmail.com', address: 'A.K. Road, Varachha, Surat', gstin: '24AABCW1122J1Z6', notes: 'Top-grade laser sawing, table polishing, and facet touchup' },
      { partyCode: 'PTY-WKP-02', name: 'Laxmi Laser & Recut Workshop', partyType: 'WORKSHOP', phone: '+91 98251 99001', email: 'laxmilaser@yahoo.com', address: 'Mahidharpura, Gundi Sheri, Surat', gstin: '24AABCL2233K1Z8', notes: 'Expert in weight-saving recutting and chip removal' },
      { partyCode: 'PTY-WKP-03', name: 'Precision Polishing Studio', partyType: 'WORKSHOP', phone: '+91 98202 10112', email: 'precision.bkc@gmail.com', address: 'Diamond Plaza, BKC Gate 2, Mumbai', gstin: '27AABCP3344L1Z0', notes: 'Rapid turnaround emergency repolish and facet repair' },

      // Certification Labs
      { partyCode: 'PTY-LAB-01', name: 'Gemological Institute of America (GIA)', partyType: 'CERTIFICATION_LAB', phone: '+91 22 4085 1500', email: 'mumbailab@gia.edu', address: 'Bandra Kurla Complex, Mumbai', gstin: '27AABCG4455M1Z2', notes: 'Standard 7-day grading turn; express dossiers available' },
      { partyCode: 'PTY-LAB-02', name: 'International Gemological Institute (IGI)', partyType: 'CERTIFICATION_LAB', phone: '+91 22 4035 2500', email: 'mumbai@igi.org', address: 'Bharat Diamond Bourse, BKC, Mumbai', gstin: '27AABCI5566N1Z4', notes: 'Rapid 3-day turnaround for solitaires and jewellery certificates' },
      { partyCode: 'PTY-LAB-03', name: 'HRD Antwerp India Pvt Ltd', partyType: 'CERTIFICATION_LAB', phone: '+91 22 4256 6000', email: 'india@hrdantwerp.com', address: 'Trade Centre, BKC, Bandra East, Mumbai', gstin: '27AABCH6677O1Z6', notes: 'European color grading authority; laser verification' },
    ];

    const partyMap: Record<string, any> = {};
    for (const p of partiesData) {
      const party = await prisma.party.upsert({
        where: { partyCode: p.partyCode },
        update: p,
        create: p,
      });
      partyMap[p.partyCode] = party;
    }

    // 2. Stocks & Multiple Ledgers (4 Stocks, each with 2 Ledgers)
    console.log('📦 Seeding Stocks & Multi-Ledger Configurations...');
    const stocksData = [
      {
        stockCode: 'STK-WSR-2026',
        name: 'WHITE STAR ROUNDS',
        description: 'Premium Triple-Ex Round Brilliant parcel lot with flawless makes',
        ledgers: [
          { ledgerType: 'PRIMARY', name: 'Main Inward Ledger', openingCarat: 45.80, openingValue: 5500000 },
          { ledgerType: 'EXPORT', name: 'Certified Export Ledger', openingCarat: 28.50, openingValue: 4200000 },
        ],
      },
      {
        stockCode: 'STK-FVC-2026',
        name: 'FANCY VIVID LOT',
        description: 'Rare Fancy Vivid and Intense colored diamonds (Yellow, Pink, Green)',
        ledgers: [
          { ledgerType: 'PRIMARY', name: 'Inward Fancy Rough & Polish Ledger', openingCarat: 18.25, openingValue: 8900000 },
          { ledgerType: 'CONSIGNMENT', name: 'Boutique Consignment Ledger', openingCarat: 12.10, openingValue: 6100000 },
        ],
      },
      {
        stockCode: 'STK-SMM-2026',
        name: 'SURAT MELEE MIX',
        description: 'Commercial melee and small sizes calibrated for micro-pave setting',
        ledgers: [
          { ledgerType: 'PRIMARY', name: 'Wholesale Sieve Sorting Ledger', openingCarat: 125.50, openingValue: 3750000 },
          { ledgerType: 'TRADING', name: 'Domestic Trading Ledger', openingCarat: 64.00, openingValue: 1920000 },
        ],
      },
      {
        stockCode: 'STK-ECE-2026',
        name: 'EMERALD CUT COLLECTION',
        description: 'High-clarity step cut Emerald, Radiant, and Asscher stones',
        ledgers: [
          { ledgerType: 'PRIMARY', name: 'BKC Vault Solitaire Ledger', openingCarat: 32.40, openingValue: 4850000 },
          { ledgerType: 'INSPECTION', name: 'On-Approval Inspection Ledger', openingCarat: 15.60, openingValue: 2340000 },
        ],
      },
    ];

    const stockMap: Record<string, any> = {};
    const ledgerMap: Record<string, any> = {};

    for (const s of stocksData) {
      const stock = await prisma.stock.upsert({
        where: { stockCode: s.stockCode },
        update: { name: s.name, description: s.description, isActive: true },
        create: { stockCode: s.stockCode, name: s.name, description: s.description, isActive: true },
      });
      stockMap[s.stockCode] = stock;

      // Seed locations for this stock
      await prisma.location.upsert({
        where: { stockId_name: { stockId: stock.id, name: 'MUMBAI-BKC' } },
        update: { locationType: 'VAULT' },
        create: { stockId: stock.id, name: 'MUMBAI-BKC', locationType: 'VAULT' },
      });
      await prisma.location.upsert({
        where: { stockId_name: { stockId: stock.id, name: 'SURAT-MAIN-VAULT' } },
        update: { locationType: 'SAFE' },
        create: { stockId: stock.id, name: 'SURAT-MAIN-VAULT', locationType: 'SAFE' },
      });

      for (const l of s.ledgers) {
        const key = `${s.stockCode}-${l.ledgerType}`;
        const existingLedger = await prisma.ledger.findFirst({
          where: { stockId: stock.id, ledgerType: l.ledgerType },
        });
        if (existingLedger) {
          const updated = await prisma.ledger.update({
            where: { id: existingLedger.id },
            data: { name: l.name, openingCarat: l.openingCarat, openingValue: l.openingValue },
          });
          ledgerMap[key] = updated;
        } else {
          const created = await prisma.ledger.create({
            data: {
              stockId: stock.id,
              ledgerType: l.ledgerType,
              name: l.name,
              openingCarat: l.openingCarat,
              openingValue: l.openingValue,
            },
          });
          ledgerMap[key] = created;
        }
      }
    }

    // 3. Diamond Items (20 Unique Individual Stones)
    console.log('💎 Seeding 20 Diamond Items...');
    const diamondItemsData = [
      // Stock 1: White Star Rounds
      { itemCode: 'DIA-WSR-001', stockCode: 'STK-WSR-2026', carat: 1.52, color: 'D', clarity: 'VVS1', cut: 'EX', shape: 'Round', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 420000, status: 'AVAILABLE', certStatus: 'CERTIFIED' },
      { itemCode: 'DIA-WSR-002', stockCode: 'STK-WSR-2026', carat: 2.05, color: 'E', clarity: 'VS1', cut: 'EX', shape: 'Round', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 580000, status: 'AVAILABLE', certStatus: 'CERTIFIED' },
      { itemCode: 'DIA-WSR-003', stockCode: 'STK-WSR-2026', carat: 1.01, color: 'D', clarity: 'IF', cut: 'EX', shape: 'Round', polish: 'EX', symmetry: 'EX', fluorescence: 'FAINT', rate: 380000, status: 'IN_REPAIR', certStatus: 'NONE' },
      { itemCode: 'DIA-WSR-004', stockCode: 'STK-WSR-2026', carat: 3.15, color: 'F', clarity: 'VS2', cut: 'EX', shape: 'Round', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 750000, status: 'AVAILABLE', certStatus: 'CERTIFIED' },
      { itemCode: 'DIA-WSR-005', stockCode: 'STK-WSR-2026', carat: 0.92, color: 'G', clarity: 'VVS2', cut: 'EX', shape: 'Round', polish: 'VG', symmetry: 'EX', fluorescence: 'NONE', rate: 220000, status: 'IN_CERTIFICATION', certStatus: 'PENDING' },

      // Stock 2: Fancy Vivid Collection
      { itemCode: 'DIA-FVC-001', stockCode: 'STK-FVC-2026', carat: 2.30, color: 'Fancy Vivid Yellow', clarity: 'VS1', cut: 'EX', shape: 'Cushion', polish: 'EX', symmetry: 'VG', fluorescence: 'FAINT', rate: 920000, status: 'AVAILABLE', certStatus: 'CERTIFIED' },
      { itemCode: 'DIA-FVC-002', stockCode: 'STK-FVC-2026', carat: 1.75, color: 'Fancy Intense Yellow', clarity: 'VVS2', cut: 'EX', shape: 'Radiant', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 680000, status: 'AVAILABLE', certStatus: 'CERTIFIED' },
      { itemCode: 'DIA-FVC-003', stockCode: 'STK-FVC-2026', carat: 3.02, color: 'Fancy Light Pink', clarity: 'VS2', cut: 'VG', shape: 'Pear', polish: 'VG', symmetry: 'VG', fluorescence: 'MEDIUM BLUE', rate: 1650000, status: 'IN_REPAIR', certStatus: 'NONE' },
      { itemCode: 'DIA-FVC-004', stockCode: 'STK-FVC-2026', carat: 1.15, color: 'Fancy Vivid Orange-Yellow', clarity: 'SI1', cut: 'EX', shape: 'Oval', polish: 'EX', symmetry: 'VG', fluorescence: 'NONE', rate: 450000, status: 'IN_CERTIFICATION', certStatus: 'PENDING' },
      { itemCode: 'DIA-FVC-005', stockCode: 'STK-FVC-2026', carat: 4.10, color: 'Fancy Yellow', clarity: 'VS1', cut: 'EX', shape: 'Heart', polish: 'EX', symmetry: 'EX', fluorescence: 'FAINT', rate: 1250000, status: 'SOLD', certStatus: 'CERTIFIED' },

      // Stock 3: Surat Melee Mix
      { itemCode: 'DIA-SMM-001', stockCode: 'STK-SMM-2026', carat: 0.52, color: 'F', clarity: 'VS1', cut: 'EX', shape: 'Round', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 95000, status: 'AVAILABLE', certStatus: 'NONE' },
      { itemCode: 'DIA-SMM-002', stockCode: 'STK-SMM-2026', carat: 0.65, color: 'G', clarity: 'VS2', cut: 'VG', shape: 'Round', polish: 'VG', symmetry: 'VG', fluorescence: 'NONE', rate: 88000, status: 'AVAILABLE', certStatus: 'NONE' },
      { itemCode: 'DIA-SMM-003', stockCode: 'STK-SMM-2026', carat: 0.78, color: 'H', clarity: 'SI1', cut: 'GD', shape: 'Round', polish: 'GD', symmetry: 'VG', fluorescence: 'FAINT', rate: 72000, status: 'IN_REPAIR', certStatus: 'NONE' },
      { itemCode: 'DIA-SMM-004', stockCode: 'STK-SMM-2026', carat: 0.88, color: 'E', clarity: 'VVS2', cut: 'EX', shape: 'Round', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 145000, status: 'SOLD', certStatus: 'CERTIFIED' },
      { itemCode: 'DIA-SMM-005', stockCode: 'STK-SMM-2026', carat: 0.45, color: 'D', clarity: 'VVS1', cut: 'EX', shape: 'Princess', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 110000, status: 'AVAILABLE', certStatus: 'NONE' },

      // Stock 4: Emerald Cut Exclusive
      { itemCode: 'DIA-ECE-001', stockCode: 'STK-ECE-2026', carat: 2.18, color: 'D', clarity: 'VVS1', cut: 'EX', shape: 'Emerald', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 620000, status: 'AVAILABLE', certStatus: 'CERTIFIED' },
      { itemCode: 'DIA-ECE-002', stockCode: 'STK-ECE-2026', carat: 3.50, color: 'E', clarity: 'VS1', cut: 'EX', shape: 'Emerald', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 890000, status: 'AVAILABLE', certStatus: 'CERTIFIED' },
      { itemCode: 'DIA-ECE-003', stockCode: 'STK-ECE-2026', carat: 1.80, color: 'F', clarity: 'VS2', cut: 'VG', shape: 'Asscher', polish: 'VG', symmetry: 'EX', fluorescence: 'FAINT', rate: 410000, status: 'IN_REPAIR', certStatus: 'NONE' },
      { itemCode: 'DIA-ECE-004', stockCode: 'STK-ECE-2026', carat: 2.75, color: 'D', clarity: 'IF', cut: 'EX', shape: 'Radiant', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 980000, status: 'IN_CERTIFICATION', certStatus: 'PENDING' },
      { itemCode: 'DIA-ECE-005', stockCode: 'STK-ECE-2026', carat: 5.20, color: 'G', clarity: 'VVS2', cut: 'EX', shape: 'Emerald', polish: 'EX', symmetry: 'EX', fluorescence: 'NONE', rate: 1450000, status: 'SOLD', certStatus: 'CERTIFIED' },
    ];

    const diamondMap: Record<string, any> = {};
    for (const d of diamondItemsData) {
      const stock = stockMap[d.stockCode];
      const val = d.carat * d.rate;
      const created = await prisma.diamondItem.upsert({
        where: { itemCode: d.itemCode },
        update: {
          stockId: stock.id,
          displayName: `${d.carat}ct ${d.shape} ${d.color} ${d.clarity}`,
          carat: d.carat,
          color: d.color,
          clarity: d.clarity,
          cut: d.cut,
          shape: d.shape,
          polish: d.polish,
          symmetry: d.symmetry,
          fluorescence: d.fluorescence,
          ratePerCarat: d.rate,
          currentValue: val,
          status: d.status,
          certificateStatus: d.certStatus,
        },
        create: {
          itemCode: d.itemCode,
          stockId: stock.id,
          displayName: `${d.carat}ct ${d.shape} ${d.color} ${d.clarity}`,
          carat: d.carat,
          color: d.color,
          clarity: d.clarity,
          cut: d.cut,
          shape: d.shape,
          polish: d.polish,
          symmetry: d.symmetry,
          fluorescence: d.fluorescence,
          ratePerCarat: d.rate,
          currentValue: val,
          status: d.status,
          certificateStatus: d.certStatus,
        },
      });
      diamondMap[d.itemCode] = created;
    }

    // 4. Certificates (15 Examples)
    console.log('📜 Seeding 15 Lab Certificates...');
    const certsData = [
      { reportNumber: 'GIA-2235891472', labType: 'GIA', itemCode: 'DIA-WSR-001', status: 'ISSUED', cost: 12500, measurements: '7.38 - 7.42 x 4.56 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: '1.52ct Round GIA Natural Diamond Dossier' },
      { reportNumber: 'GIA-2248902145', labType: 'GIA', itemCode: 'DIA-WSR-002', status: 'ISSUED', cost: 16800, measurements: '8.12 - 8.16 x 5.01 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: '2.05ct Round GIA Diamond Grading Report' },
      { reportNumber: 'GIA-2210492837', labType: 'GIA', itemCode: 'DIA-WSR-004', status: 'ISSUED', cost: 24500, measurements: '9.45 - 9.50 x 5.82 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: '3.15ct Round GIA Solitaire Grading Report' },
      { reportNumber: 'GIA-5221084729', labType: 'GIA', itemCode: 'DIA-WSR-005', status: 'SUBMITTED', cost: 9500, measurements: '6.20 - 6.24 x 3.84 mm', polish: 'VG', symmetry: 'EX', fluorescence: 'None', name: '0.92ct Round GIA In-Progress Dossier' },

      { reportNumber: 'GIA-1209384721', labType: 'GIA', itemCode: 'DIA-FVC-001', status: 'ISSUED', cost: 22000, measurements: '7.85 x 7.12 x 4.82 mm', polish: 'EX', symmetry: 'VG', fluorescence: 'Faint', name: '2.30ct Cushion Fancy Vivid Yellow GIA Report' },
      { reportNumber: 'IGI-5821094321', labType: 'IGI', itemCode: 'DIA-FVC-002', status: 'ISSUED', cost: 14500, measurements: '7.10 x 6.45 x 4.25 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: '1.75ct Radiant Fancy Intense Yellow IGI Cert' },
      { reportNumber: 'GIA-2230918273', labType: 'GIA', itemCode: 'DIA-FVC-004', status: 'PENDING', cost: 11000, measurements: '8.25 x 5.90 x 3.65 mm', polish: 'EX', symmetry: 'VG', fluorescence: 'None', name: '1.15ct Oval Fancy Color GIA Submission' },
      { reportNumber: 'GIA-6201928374', labType: 'GIA', itemCode: 'DIA-FVC-005', status: 'ISSUED', cost: 31000, measurements: '10.15 x 10.45 x 6.20 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'Faint', name: '4.10ct Heart Fancy Yellow GIA Certificate' },

      { reportNumber: 'IGI-4920192834', labType: 'IGI', itemCode: 'DIA-SMM-004', status: 'ISSUED', cost: 7500, measurements: '6.15 - 6.18 x 3.80 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: '0.88ct Round IGI Diamond Report' },
      { reportNumber: 'HRD-2200192837', labType: 'HRD', itemCode: null, status: 'SUBMITTED', cost: 6800, measurements: 'Various calibrated', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: 'Surat Melee Parcel - General HRD Identification' },

      { reportNumber: 'GIA-3301928374', labType: 'GIA', itemCode: 'DIA-ECE-001', status: 'ISSUED', cost: 18500, measurements: '8.72 x 6.15 x 4.12 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: '2.18ct Emerald Cut GIA Solitaire Report' },
      { reportNumber: 'GIA-1102938475', labType: 'GIA', itemCode: 'DIA-ECE-002', status: 'ISSUED', cost: 26500, measurements: '10.25 x 7.35 x 4.95 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: '3.50ct Emerald Cut GIA Prestige Dossier' },
      { reportNumber: 'GIA-4401928371', labType: 'GIA', itemCode: 'DIA-ECE-004', status: 'PENDING', cost: 21000, measurements: '8.40 x 8.35 x 5.60 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: '2.75ct Radiant Cut GIA Inspection Order' },
      { reportNumber: 'HRD-2301928371', labType: 'HRD', itemCode: 'DIA-ECE-005', status: 'ISSUED', cost: 38000, measurements: '11.85 x 8.45 x 5.75 mm', polish: 'EX', symmetry: 'EX', fluorescence: 'None', name: '5.20ct Emerald Cut HRD Antwerp Certified' },
      { reportNumber: 'IGI-5910293847', labType: 'IGI', itemCode: null, status: 'SUBMITTED', cost: 12000, measurements: 'Step Cut Assortment', polish: 'VG', symmetry: 'VG', fluorescence: 'Faint', name: 'Emerald Cut Parcel - Batch IGI Screening' },
    ];

    for (const c of certsData) {
      const diamondItem = c.itemCode ? diamondMap[c.itemCode] : null;
      const cert = await prisma.certification.upsert({
        where: { reportNumber: c.reportNumber },
        update: {
          name: c.name,
          diamondItemId: diamondItem ? diamondItem.id : null,
          labType: c.labType,
          certificateStatus: c.status,
          cost: c.cost,
          measurements: c.measurements,
          polish: c.polish,
          symmetry: c.symmetry,
          fluorescence: c.fluorescence,
        },
        create: {
          reportNumber: c.reportNumber,
          name: c.name,
          diamondItemId: diamondItem ? diamondItem.id : null,
          labType: c.labType,
          certificateStatus: c.status,
          cost: c.cost,
          measurements: c.measurements,
          polish: c.polish,
          symmetry: c.symmetry,
          fluorescence: c.fluorescence,
        },
      });

      if (diamondItem && c.status === 'ISSUED') {
        await prisma.diamondItem.update({
          where: { id: diamondItem.id },
          data: { currentCertificateId: cert.id, certificateStatus: 'CERTIFIED' },
        });
      }
    }

    // 5. Repairs (14 Diverse Repair Jobs)
    console.log('🔧 Seeding 14 Workshop Repair Jobs...');
    const repairsData = [
      { name: 'Table Re-polish & Scratch Removal', itemCode: 'DIA-WSR-003', vendorCode: 'PTY-WKP-01', repairType: 'Polishing', status: 'IN_PROGRESS', cost: 8500, dateOffsetDays: -3, caratBefore: 1.01, remarks: 'Fine table scratch removal; preserve maximum weight above 1.00ct' },
      { name: 'Pavilion Facet Recutting', itemCode: 'DIA-FVC-003', vendorCode: 'PTY-WKP-02', repairType: 'Recutting', status: 'IN_PROGRESS', cost: 18000, dateOffsetDays: -7, caratBefore: 3.02, remarks: 'Correct pavilion bulge to maximize color intensity' },
      { name: 'Girdle Chip Repair & Re-facet', itemCode: 'DIA-SMM-003', vendorCode: 'PTY-WKP-01', repairType: 'Chip Repair', status: 'IN_PROGRESS', cost: 4500, dateOffsetDays: -2, caratBefore: 0.78, remarks: 'Small corner chip repair; polish to smooth girdle' },
      { name: 'Crown Angle Symmetry Correction', itemCode: 'DIA-ECE-003', vendorCode: 'PTY-WKP-03', repairType: 'Symmetry Correction', status: 'IN_PROGRESS', cost: 12500, dateOffsetDays: -5, caratBefore: 1.80, remarks: 'Align step cut parallel facets for GIA Excellent symmetry rating' },

      { name: 'Culet Bruise Touchup & High Polish', itemCode: 'DIA-WSR-001', vendorCode: 'PTY-WKP-03', repairType: 'Polishing', status: 'COMPLETED', cost: 6500, dateOffsetDays: -30, caratBefore: 1.53, caratAfter: 1.52, remarks: 'Completed smoothly with 0.01ct loss; symmetry preserved' },
      { name: 'Fancy Cut Repolishing', itemCode: 'DIA-FVC-001', vendorCode: 'PTY-WKP-02', repairType: 'Polishing', status: 'COMPLETED', cost: 14000, dateOffsetDays: -45, caratBefore: 2.31, caratAfter: 2.30, remarks: 'Surface burn mark removed after laser treatment' },
      { name: 'Table Symmetry Enhancement', itemCode: 'DIA-ECE-001', vendorCode: 'PTY-WKP-01', repairType: 'Symmetry Correction', status: 'COMPLETED', cost: 9500, dateOffsetDays: -60, caratBefore: 2.19, caratAfter: 2.18, remarks: 'Step cut parallel facet perfection achieved' },
      { name: 'Laser Sawing Calibration Repair', itemCode: 'DIA-SMM-001', vendorCode: 'PTY-WKP-01', repairType: 'Surface Repair', status: 'COMPLETED', cost: 3500, dateOffsetDays: -20, caratBefore: 0.53, caratAfter: 0.52, remarks: 'Laser sawing residue successfully polished off' },
      { name: 'Princess Cut Corner Smoothing', itemCode: 'DIA-SMM-005', vendorCode: 'PTY-WKP-03', repairType: 'Chip Repair', status: 'COMPLETED', cost: 5000, dateOffsetDays: -15, caratBefore: 0.46, caratAfter: 0.45, remarks: 'Sharp corner reinforced to prevent setting breakage' },
      { name: 'Windowing Depth Adjustment', itemCode: 'DIA-ECE-002', vendorCode: 'PTY-WKP-02', repairType: 'Recutting', status: 'COMPLETED', cost: 22000, dateOffsetDays: -75, caratBefore: 3.55, caratAfter: 3.50, remarks: 'Light leakage window reduced significantly' },

      { name: 'Routine Workshop Inspection Order', itemCode: 'DIA-WSR-002', vendorCode: 'PTY-WKP-01', repairType: 'Surface Repair', status: 'CANCELLED', cost: 0, dateOffsetDays: -10, caratBefore: 2.05, remarks: 'Client preferred keeping original weight without touchup' },
      { name: 'Optional Re-polish Review', itemCode: 'DIA-FVC-002', vendorCode: 'PTY-WKP-03', repairType: 'Polishing', status: 'CANCELLED', cost: 0, dateOffsetDays: -12, caratBefore: 1.75, remarks: 'Cancelled; stone already graded Excellent by IGI' },
      { name: 'General Parcel Ultrasonic Clean & Polish', itemCode: 'DIA-SMM-002', vendorCode: 'PTY-WKP-01', repairType: 'Polishing', status: 'IN_PROGRESS', cost: 3200, dateOffsetDays: -1, caratBefore: 0.65, remarks: 'Ultrasonic cleansing and pavilion facet buffing' },
      { name: 'Radiant Corner Bevel Recut', itemCode: 'DIA-ECE-004', vendorCode: 'PTY-WKP-02', repairType: 'Recutting', status: 'IN_PROGRESS', cost: 15500, dateOffsetDays: -4, caratBefore: 2.76, remarks: 'Bevel corner alignment prior to final GIA submission' },
    ];

    for (const r of repairsData) {
      const stone = diamondMap[r.itemCode];
      const vendor = partyMap[r.vendorCode];
      const dateSent = new Date(Date.now() + r.dateOffsetDays * 86400000);
      const dateCompleted = r.status === 'COMPLETED' ? new Date(dateSent.getTime() + 5 * 86400000) : null;

      const existingRepair = await prisma.repair.findFirst({
        where: { diamondItemId: stone.id, vendorPartyId: vendor.id, name: r.name },
      });

      if (existingRepair) {
        await prisma.repair.update({
          where: { id: existingRepair.id },
          data: {
            status: r.status,
            cost: r.cost,
            dateSent,
            dateCompleted,
            remarks: r.remarks,
            caratBefore: r.caratBefore,
            caratAfter: r.caratAfter || null,
          },
        });
      } else {
        await prisma.repair.create({
          data: {
            diamondItemId: stone.id,
            vendorPartyId: vendor.id,
            name: r.name,
            repairType: r.repairType,
            status: r.status,
            cost: r.cost,
            dateSent,
            dateCompleted,
            remarks: r.remarks,
            caratBefore: r.caratBefore,
            caratAfter: r.caratAfter || null,
          },
        });
      }
    }

    // 6. Transactions (16 Realistic Transactions across Ledgers and Permutations)
    console.log('💳 Seeding 16 Ledger Transactions...');
    const now = Date.now();
    const txnsData = [
      // Purchases
      {
        transactionNo: 'TXN-2026-000101',
        stockCode: 'STK-WSR-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-SUP-01',
        txnType: 'PURCHASE',
        paymentType: 'TO_PAY',
        paymentStatus: 'COMPLETED',
        paymentDone: 1827400,
        paymentDue: 0,
        daysAgo: 45,
        items: [{ itemCode: 'DIA-WSR-001', carat: 1.52, rate: 420000, val: 638400 }, { itemCode: 'DIA-WSR-002', carat: 2.05, rate: 580000, val: 1189000 }],
        remarks: 'Inward purchase of high make White Star solitaires; payment cleared via RTGS',
      },
      {
        transactionNo: 'TXN-2026-000102',
        stockCode: 'STK-WSR-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-SUP-04',
        txnType: 'PURCHASE',
        paymentType: 'TO_PAY',
        paymentStatus: 'PARTIAL',
        paymentDone: 1000000,
        paymentDue: 1362500,
        daysAgo: 25,
        items: [{ itemCode: 'DIA-WSR-004', carat: 3.15, rate: 750000, val: 2362500 }],
        remarks: '3.15ct Solitaire purchased on 30-day partial payment terms',
      },
      {
        transactionNo: 'TXN-2026-000103',
        stockCode: 'STK-FVC-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-SUP-03',
        txnType: 'PURCHASE',
        paymentType: 'TO_PAY',
        paymentStatus: 'PENDING',
        paymentDone: 0,
        paymentDue: 3306000,
        daysAgo: 10,
        items: [{ itemCode: 'DIA-FVC-001', carat: 2.30, rate: 920000, val: 2116000 }, { itemCode: 'DIA-FVC-002', carat: 1.75, rate: 680000, val: 1190000 }],
        remarks: 'Antwerp sight fancy color stones inward; invoice due net-45',
      },
      {
        transactionNo: 'TXN-2026-000104',
        stockCode: 'STK-SMM-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-SUP-02',
        txnType: 'PURCHASE',
        paymentType: 'TO_PAY',
        paymentStatus: 'COMPLETED',
        paymentDone: 106600,
        paymentDue: 0,
        daysAgo: 35,
        items: [{ itemCode: 'DIA-SMM-001', carat: 0.52, rate: 95000, val: 49400 }, { itemCode: 'DIA-SMM-002', carat: 0.65, rate: 88000, val: 57200 }],
        remarks: 'Surat melee calibrated sieve lot settled in full',
      },
      {
        transactionNo: 'TXN-2026-000105',
        stockCode: 'STK-ECE-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-SUP-01',
        txnType: 'PURCHASE',
        paymentType: 'TO_PAY',
        paymentStatus: 'PARTIAL',
        paymentDone: 2000000,
        paymentDue: 2466600,
        daysAgo: 18,
        items: [{ itemCode: 'DIA-ECE-001', carat: 2.18, rate: 620000, val: 1351600 }, { itemCode: 'DIA-ECE-002', carat: 3.50, rate: 890000, val: 3115000 }],
        remarks: 'Emerald cut solitaires inward; 50% advance paid, remaining due upon delivery',
      },

      // Sales
      {
        transactionNo: 'TXN-2026-000201',
        stockCode: 'STK-FVC-2026',
        ledgerType: 'CONSIGNMENT',
        partyCode: 'PTY-CUS-01',
        txnType: 'SALE',
        paymentType: 'TO_COLLECT',
        paymentStatus: 'COMPLETED',
        paymentDone: 5125000,
        paymentDue: 0,
        daysAgo: 20,
        items: [{ itemCode: 'DIA-FVC-005', carat: 4.10, rate: 1250000, val: 5125000 }],
        remarks: '4.10ct Heart Fancy Yellow diamond sold for bespoke bridal necklace; payment received in full',
      },
      {
        transactionNo: 'TXN-2026-000202',
        stockCode: 'STK-ECE-2026',
        ledgerType: 'INSPECTION',
        partyCode: 'PTY-CUS-02',
        txnType: 'SALE',
        paymentType: 'TO_COLLECT',
        paymentStatus: 'PARTIAL',
        paymentDone: 4000000,
        paymentDue: 3540000,
        daysAgo: 14,
        items: [{ itemCode: 'DIA-ECE-005', carat: 5.20, rate: 1450000, val: 7540000 }],
        remarks: '5.20ct Emerald cut sold to Titan luxury collection; 50% installment received',
      },
      {
        transactionNo: 'TXN-2026-000203',
        stockCode: 'STK-SMM-2026',
        ledgerType: 'TRADING',
        partyCode: 'PTY-CUS-03',
        txnType: 'SALE',
        paymentType: 'TO_COLLECT',
        paymentStatus: 'PENDING',
        paymentDone: 0,
        paymentDue: 127600,
        daysAgo: 7,
        items: [{ itemCode: 'DIA-SMM-004', carat: 0.88, rate: 145000, val: 127600 }],
        remarks: '0.88ct Round solitaire supplied on net-30 credit terms',
      },
      {
        transactionNo: 'TXN-2026-000204',
        stockCode: 'STK-WSR-2026',
        ledgerType: 'EXPORT',
        partyCode: 'PTY-CUS-04',
        txnType: 'SALE',
        paymentType: 'TO_COLLECT',
        paymentStatus: 'COMPLETED',
        paymentDone: 1189000,
        paymentDue: 0,
        daysAgo: 40,
        items: [{ itemCode: 'DIA-WSR-002', carat: 2.05, rate: 580000, val: 1189000 }],
        remarks: 'Export lot cleared through Mumbai customs; wire transfer confirmed',
      },

      // Brokerage Transactions
      {
        transactionNo: 'TXN-2026-000301',
        stockCode: 'STK-WSR-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-BRK-01',
        txnType: 'PURCHASE',
        paymentType: 'TO_PAY',
        paymentStatus: 'COMPLETED',
        paymentDone: 383800,
        paymentDue: 0,
        brokeragePercentage: 1.0,
        brokerageAmount: 3838,
        brokerageType: 'INCLUSIVE',
        daysAgo: 15,
        items: [{ itemCode: 'DIA-WSR-003', carat: 1.01, rate: 380000, val: 383800 }],
        remarks: 'Brokered transaction via Mehta Brokerage; 1.0% inclusive commission settled',
      },
      {
        transactionNo: 'TXN-2026-000302',
        stockCode: 'STK-ECE-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-BRK-02',
        txnType: 'SALE',
        paymentType: 'TO_COLLECT',
        paymentStatus: 'PARTIAL',
        paymentDone: 1500000,
        paymentDue: 1195000,
        brokeragePercentage: 1.5,
        brokerageAmount: 40425,
        brokerageType: 'EXCLUSIVE',
        daysAgo: 12,
        items: [{ itemCode: 'DIA-ECE-004', carat: 2.75, rate: 980000, val: 2695000 }],
        remarks: 'Brokered export deal via Jhaveri; 1.5% exclusive brokerage calculated',
      },

      // Repair In/Out
      {
        transactionNo: 'TXN-2026-000401',
        stockCode: 'STK-WSR-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-WKP-01',
        txnType: 'REPAIR_OUT',
        paymentType: 'TO_PAY',
        paymentStatus: 'PENDING',
        paymentDone: 0,
        paymentDue: 8500,
        daysAgo: 5,
        items: [{ itemCode: 'DIA-WSR-003', carat: 1.01, rate: 380000, val: 383800 }],
        remarks: 'Stone dispatched to workshop for precision table scratch polish',
      },
      {
        transactionNo: 'TXN-2026-000402',
        stockCode: 'STK-WSR-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-WKP-03',
        txnType: 'REPAIR_IN',
        paymentType: 'TO_PAY',
        paymentStatus: 'COMPLETED',
        paymentDone: 6500,
        paymentDue: 0,
        daysAgo: 28,
        items: [{ itemCode: 'DIA-WSR-001', carat: 1.52, rate: 420000, val: 638400 }],
        remarks: 'Repair completed and received back in BKC vault; invoice paid in full',
      },

      // Certification In/Out
      {
        transactionNo: 'TXN-2026-000501',
        stockCode: 'STK-WSR-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-LAB-01',
        txnType: 'CERTIFICATION',
        paymentType: 'TO_PAY',
        paymentStatus: 'PENDING',
        paymentDone: 0,
        paymentDue: 9500,
        daysAgo: 6,
        items: [{ itemCode: 'DIA-WSR-005', carat: 0.92, rate: 220000, val: 202400 }],
        remarks: 'Solitaire submitted to GIA BKC laboratory for full dossier grading',
      },
      {
        transactionNo: 'TXN-2026-000502',
        stockCode: 'STK-WSR-2026',
        ledgerType: 'PRIMARY',
        partyCode: 'PTY-LAB-01',
        txnType: 'CERTIFICATION_IN',
        paymentType: 'TO_PAY',
        paymentStatus: 'COMPLETED',
        paymentDone: 12500,
        paymentDue: 0,
        daysAgo: 42,
        items: [{ itemCode: 'DIA-WSR-001', carat: 1.52, rate: 420000, val: 638400 }],
        remarks: 'GIA report #2235891472 received with D/VVS1/3EX grade; grading fee paid',
      },
    ];

    let seqCount = 100;
    for (const t of txnsData) {
      const ledger = ledgerMap[`${t.stockCode}-${t.ledgerType}`];
      const party = partyMap[t.partyCode];
      const txDate = new Date(now - t.daysAgo * 86400000);

      const itemsToCreate = t.items.map((item) => {
        const stone = diamondMap[item.itemCode];
        return {
          diamondItemId: stone.id,
          name: stone.displayName,
          quantity: 1,
          carat: item.carat,
          ratePerCarat: item.rate,
          totalValue: item.val,
          itemAction: ['PURCHASE', 'REPAIR_IN', 'CERTIFICATION_IN'].includes(t.txnType) ? 'IN' : 'OUT',
        };
      });

      const existingTx = await prisma.transaction.findUnique({
        where: { transactionNo: t.transactionNo },
      });

      if (!existingTx) {
        await prisma.transaction.create({
          data: {
            ledgerId: ledger.id,
            transactionNo: t.transactionNo,
            transactionDate: txDate,
            transactionType: t.txnType,
            status: 'AUTHORIZED',
            partyId: party ? party.id : null,
            remarks: t.remarks,
            referenceNo: t.transactionNo,
            paymentType: t.paymentType,
            paymentStatus: t.paymentStatus,
            paymentDone: t.paymentDone,
            paymentDue: t.paymentDue,
            brokeragePercentage: t.brokeragePercentage || 0,
            brokerageAmount: t.brokerageAmount || 0,
            brokerageType: t.brokerageType || 'INCLUSIVE',
            createdBy: 'Admin (System)',
            sequenceNumber: seqCount++,
            items: {
              create: itemsToCreate,
            },
          },
        });
      }
    }

    console.log('✅ Seeding completed successfully!');
  });
}

seedRichExamples()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
