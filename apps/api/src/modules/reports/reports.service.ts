import { Response } from 'express';
import prisma from '../../infrastructure/database/prisma';
import ExcelJS from 'exceljs';

const parseArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string') {
    return val.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [String(val)];
};


export class ReportsService {

  async getKPIs() {
      // 1. Sales vs Purchases (select only totalValue from items)
      const sales = await prisma.transaction.findMany({
        where: { transactionType: 'SALE' },
        select: { items: { select: { totalValue: true } } }
      });
      const purchases = await prisma.transaction.findMany({
        where: { transactionType: 'PURCHASE' },
        select: { items: { select: { totalValue: true } } }
      });

      const totalSalesValue = sales.reduce((acc, t) => acc + t.items.reduce((sum, item) => sum + Number(item.totalValue || 0), 0), 0);
      const totalPurchasesValue = purchases.reduce((acc, t) => acc + t.items.reduce((sum, item) => sum + Number(item.totalValue || 0), 0), 0);

      const salesVsPurchases = [
        { name: 'Purchases', value: totalPurchasesValue },
        { name: 'Sales', value: totalSalesValue }
      ];

      // 2. Inventory by Category (project only needed aggregation columns)
      const items = await prisma.diamondItem.findMany({
        where: { status: 'AVAILABLE' },
        select: { category: true, currentValue: true, certificateStatus: true }
      });

      const categories = items.reduce((acc: any, item) => {
        const cat = item.category || 'SINGLE';
        if (!acc[cat]) acc[cat] = 0;
        acc[cat] += Number(item.currentValue || 0);
        return acc;
      }, {});

      const inventoryByCategory = Object.keys(categories).map(key => ({
        name: key,
        value: categories[key]
      }));

      // 3. Certified vs Non-Certified
      const certifiedStats = items.reduce((acc: any, item) => {
        const status = item.certificateStatus === 'NONE' || !item.certificateStatus ? 'Non-Certified' : 'Certified';
        if (!acc[status]) acc[status] = 0;
        acc[status]++;
        return acc;
      }, {});

      const certificationStatus = Object.keys(certifiedStats).map(key => ({
        name: key,
        value: certifiedStats[key]
      }));


    return {
      salesVsPurchases,
      inventoryByCategory,
      certificationStatus
    };
  }

  public async buildReportData(query: any) {
    let effectiveReportType = query.reportType || 'FY_25_26';
    const { level = 'ITEM', startDate, endDate } = query;

    // Multi-select filters parsing
    const fys = parseArray(query.fys || query.fy);
    const partyIds = parseArray(query.partyIds || query.partyId);
    const partyTypes = parseArray(query.partyTypes || query.partyType);
    const stockIds = parseArray(query.stockIds || query.stockId);
    const statuses = parseArray(query.statuses || query.status);
    const shapes = parseArray(query.shapes || query.shape);
    const colors = parseArray(query.colors || query.color);
    const clarities = parseArray(query.clarities || query.clarity);
    const cuts = parseArray(query.cuts || query.cut);
    const polishes = parseArray(query.polishes || query.polish);
    const symmetries = parseArray(query.symmetries || query.symmetry);

    const paymentDirection = query.paymentDirection;
    const agingDays = query.agingDays ? Number(query.agingDays) : undefined;
    const minCarat = query.minCarat ? Number(query.minCarat) : undefined;
    const maxCarat = query.maxCarat ? Number(query.maxCarat) : undefined;
    const minPrice = query.minPrice ? Number(query.minPrice) : undefined;
    const maxPrice = query.maxPrice ? Number(query.maxPrice) : undefined;
    const category = query.category;
    const hasRepair = query.hasRepair === 'true' || query.hasRepair === true;
    const hasCert = query.hasCert === 'true' || query.hasCert === true;

    // If generic INVENTORY report requested, honor the level toggle
    if (effectiveReportType === 'INVENTORY') {
      effectiveReportType = (level === 'SUMMARY' || level === 'STOCK') ? 'INVENTORY_SUMMARY' : 'INVENTORY_ITEMS';
    }

    // Date range setup across single or multiple FYs
    let dateFilter: any = undefined;
    const fyRanges: { gte: Date; lte: Date }[] = [];

    if (fys.length > 0 && !fys.includes('ALL_TIME')) {
      if (fys.some(f => f.includes('24-25') || f.includes('2024-25'))) {
        fyRanges.push({ gte: new Date('2024-04-01T00:00:00.000Z'), lte: new Date('2025-03-31T23:59:59.999Z') });
      }
      if (fys.some(f => f.includes('25-26') || f.includes('2025-26'))) {
        fyRanges.push({ gte: new Date('2025-04-01T00:00:00.000Z'), lte: new Date('2026-03-31T23:59:59.999Z') });
      }
      if (fys.some(f => f.includes('26-27') || f.includes('2026-27'))) {
        fyRanges.push({ gte: new Date('2026-04-01T00:00:00.000Z'), lte: new Date('2027-03-31T23:59:59.999Z') });
      }

      if (fyRanges.length === 1) {
        dateFilter = fyRanges[0];
      } else if (fyRanges.length > 1) {
        // Find earliest start and latest end for combined continuous range or OR
        const minDate = new Date(Math.min(...fyRanges.map(r => r.gte.getTime())));
        const maxDate = new Date(Math.max(...fyRanges.map(r => r.lte.getTime())));
        dateFilter = { gte: minDate, lte: maxDate };
      }
    } else if (startDate || endDate) {
      dateFilter = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    let title = 'Diamond ERP Report';
    let subtitle = 'Generated report data';
    let columns: { key: string; header: string; align?: 'left' | 'center' | 'right'; width?: number }[] = [];
    let rows: any[] = [];
    let kpis: { label: string; value: string | number; color?: string }[] = [];
    let entityProfile: any = null;

    switch (effectiveReportType) {
      // ═══════════════════════════════════════════════════════════
      // 1. FINANCIAL YEAR & AUDIT TRADING STATEMENT (DEBIT / CREDIT / BALANCES)
      // ═══════════════════════════════════════════════════════════
      case 'FY_25_26':
      case 'FY_ANNUAL':
      case 'FINANCIAL_LEDGER':
      case 'GENERAL_LEDGER': {
        const fyLabel = fys.length > 0 ? fys.join(', ') : (startDate ? `${startDate} to ${endDate}` : 'FY 2025-26');
        title = `Financial Year Trading & Audit Statement (${fyLabel})`;
        subtitle = `Accounting ledger stream with Debit (Dr / In), Credit (Cr / Out), running balances & brokerage`;

        const txnWhere: any = {};
        if (dateFilter) txnWhere.transactionDate = dateFilter;
        if (partyIds.length > 0) txnWhere.partyId = { in: partyIds };
        if (partyTypes.length > 0) txnWhere.party = { partyType: { in: partyTypes } };
        if (stockIds.length > 0) txnWhere.ledger = { stockId: { in: stockIds } };
        if (statuses.length > 0) txnWhere.paymentStatus = { in: statuses };

        // Payment Direction filter
        if (paymentDirection === 'CLIENTS_DUE') {
          txnWhere.transactionType = 'SALE';
          txnWhere.paymentStatus = { in: ['PENDING', 'PARTIAL'] };
        } else if (paymentDirection === 'VENDORS_DUE') {
          txnWhere.transactionType = 'PURCHASE';
          txnWhere.paymentStatus = { in: ['PENDING', 'PARTIAL'] };
        }

        // Aging filter
        if (agingDays) {
          const cutOff = new Date(Date.now() - agingDays * 24 * 60 * 60 * 1000);
          txnWhere.transactionDate = { ...(txnWhere.transactionDate || {}), lte: cutOff };
        }

        // 4Cs Filter on transactions
        const has4CsFilter = shapes.length || colors.length || clarities.length || cuts.length || symmetries.length || polishes.length || minCarat || maxCarat || minPrice || maxPrice;
        if (has4CsFilter) {
          txnWhere.items = {
            some: {
              diamondItem: {
                ...(shapes.length ? { shape: { in: shapes } } : {}),
                ...(colors.length ? { color: { in: colors } } : {}),
                ...(clarities.length ? { clarity: { in: clarities } } : {}),
                ...(cuts.length ? { cut: { in: cuts } } : {}),
                ...(symmetries.length ? { symmetry: { in: symmetries } } : {}),
                ...(polishes.length ? { polish: { in: polishes } } : {}),
                ...(minCarat || maxCarat ? { carat: { ...(minCarat ? { gte: minCarat } : {}), ...(maxCarat ? { lte: maxCarat } : {}) } } : {}),
                ...(minPrice || maxPrice ? { currentValue: { ...(minPrice ? { gte: minPrice } : {}), ...(maxPrice ? { lte: maxPrice } : {}) } } : {})
              }
            }
          };
        }

        const transactions = await prisma.transaction.findMany({
          where: txnWhere,
          include: {
            party: { select: { name: true, partyType: true } },
            ledger: { select: { stock: { select: { name: true, stockCode: true } } } },
            items: {
              select: {
                id: true,
                carat: true,
                ratePerCarat: true,
                totalValue: true,
                diamondItem: {
                  select: {
                    itemCode: true,
                    shape: true,
                    color: true,
                    clarity: true,
                    cut: true,
                    polish: true,
                    symmetry: true,
                    currentCertificate: { select: { reportNumber: true } }
                  }
                }
              }
            }
          },
          orderBy: { transactionDate: 'asc' }
        });

        // Exact columns requested by user:
        // Date | Stock | Type | Party | Items | Debit (Dr / In) | Credit (Cr / Out) | Closing Bal. (Ct) | Closing Bal. (₹) | Total (₹) | Brokerage
        columns = [
          { key: 'date', header: 'Date', width: 12 },
          { key: 'stock', header: 'Stock', width: 20 },
          { key: 'type', header: 'Type', align: 'center', width: 14 },
          { key: 'party', header: 'Party', width: 22 },
          { key: 'itemsCount', header: 'Items', align: 'center', width: 10 },
          { key: 'debit', header: 'Debit (Dr / In)', align: 'right', width: 16 },
          { key: 'credit', header: 'Credit (Cr / Out)', align: 'right', width: 16 },
          { key: 'closingBalCt', header: 'Closing Bal. (Ct)', align: 'right', width: 16 },
          { key: 'closingBalVal', header: 'Closing Bal. (₹)', align: 'right', width: 18 },
          { key: 'total', header: 'Total (₹)', align: 'right', width: 16 },
          { key: 'brokerage', header: 'Brokerage', align: 'center', width: 20 }
        ];

        let totalPurchasesVal = 0;
        let totalPurchasesCt = 0;
        let totalSalesVal = 0;
        let totalSalesCt = 0;
        let totalBrokerageVal = 0;
        let inclusiveBrokerageVal = 0;
        let exclusiveBrokerageVal = 0;

        let runningCarats = 0;
        let runningValue = 0;

        rows = transactions.map((t) => {
          const sumVal = t.items?.reduce((s, it) => s + Number(it.totalValue || 0), 0) || 0;
          const sumCts = t.items?.reduce((s, it) => s + Number(it.carat || 0), 0) || 0;
          const brokWorth = Number(t.brokerageAmount || 0);
          const brokPct = Number(t.brokeragePercentage || 0);
          const bType = t.brokerageType || 'INCLUSIVE';

          const isPurchase = t.transactionType === 'PURCHASE';
          const isSale = t.transactionType === 'SALE';

          if (isPurchase) {
            totalPurchasesVal += sumVal;
            totalPurchasesCt += sumCts;
            runningCarats += sumCts;
            runningValue += sumVal;
          } else if (isSale) {
            totalSalesVal += sumVal;
            totalSalesCt += sumCts;
            runningCarats -= sumCts;
            runningValue -= sumVal;
          }

          totalBrokerageVal += brokWorth;
          if (bType === 'EXCLUSIVE') exclusiveBrokerageVal += brokWorth;
          else inclusiveBrokerageVal += brokWorth;

          // Nested stone items for expandable row view
          const stoneItems = (t.items || []).map((ti) => ({
            id: ti.id,
            itemCode: ti.diamondItem?.itemCode || '-',
            shape: ti.diamondItem?.shape || 'Round',
            carat: Number(ti.carat || 0).toFixed(2),
            color: ti.diamondItem?.color || 'D',
            clarity: ti.diamondItem?.clarity || 'VS1',
            cut: ti.diamondItem?.cut || 'EX',
            polish: ti.diamondItem?.polish || 'EX',
            symmetry: ti.diamondItem?.symmetry || 'EX',
            ratePerCarat: Number(ti.ratePerCarat || 0),
            totalValue: Number(ti.totalValue || 0),
            certNo: ti.diamondItem?.currentCertificate?.reportNumber || '-'
          }));

          // Brokerage format: e.g. "₹150.00 Excl. (1.50%)"
          let brokerageFormatted = '—';
          if (brokWorth > 0) {
            const modeLabel = bType === 'EXCLUSIVE' ? 'Excl.' : 'Incl.';
            brokerageFormatted = `₹${brokWorth.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${modeLabel} (${brokPct.toFixed(2)}%)`;
          }

          return {
            id: t.id,
            rowKey: t.id,
            date: t.transactionDate ? t.transactionDate.toISOString().split('T')[0] : '',
            stock: t.ledger?.stock?.name || 'General Inventory',
            stockCode: t.ledger?.stock?.stockCode || '',
            type: t.transactionType,
            status: t.paymentStatus || 'COMPLETED',
            party: t.party?.name || 'Counterparty',
            partyType: t.party?.partyType || 'CLIENT',
            itemsCount: `${t.items?.length || 0} pcs`,
            debit: isPurchase ? `+${sumCts.toFixed(2)} ct / ₹${sumVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—',
            credit: isSale ? `-${sumCts.toFixed(2)} ct / ₹${sumVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—',
            closingBalCt: `${runningCarats.toFixed(2)} ct`,
            closingBalVal: `₹${runningValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
            total: `₹${sumVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
            brokerage: brokerageFormatted,
            items: stoneItems,
            _rawCarats: sumCts,
            _rawValue: sumVal
          };
        });

        // Closing stock valuation
        const closingAgg = await prisma.diamondItem.aggregate({
          where: { status: 'AVAILABLE' },
          _sum: { currentValue: true }
        });
        const closingValuation = Number(closingAgg._sum.currentValue || 0);
        const grossMargin = totalSalesVal - totalPurchasesVal;

        kpis = [
          { label: 'Total Purchases (Dr / In)', value: `₹${totalPurchasesVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })} (${totalPurchasesCt.toFixed(1)} ct)`, color: 'blue' },
          { label: 'Total Sales (Cr / Out)', value: `₹${totalSalesVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })} (${totalSalesCt.toFixed(1)} ct)`, color: 'emerald' },
          { label: 'Gross Trading Margin', value: `₹${grossMargin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: grossMargin >= 0 ? 'emerald' : 'rose' },
          { label: 'Total Brokerage Expense', value: `₹${totalBrokerageVal.toLocaleString('en-IN')} (Incl: ₹${inclusiveBrokerageVal.toLocaleString('en-IN')}, Excl: ₹${exclusiveBrokerageVal.toLocaleString('en-IN')})`, color: 'purple' },
          { label: 'Closing Stock Valuation', value: `₹${closingValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'teal' }
        ];
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // 2. FULL INVENTORY STONE REGISTER (ITEM LEVEL)
      // ═══════════════════════════════════════════════════════════
      case 'INVENTORY_ITEMS': {
        title = 'Complete Inventory Stone Register';
        subtitle = 'Granular item-level audit of diamonds with full 4Cs, status & valuation';

        const itemWhere: any = {};
        if (stockIds.length > 0) itemWhere.stockId = { in: stockIds };
        if (statuses.length > 0) itemWhere.status = { in: statuses };
        if (shapes.length > 0) itemWhere.shape = { in: shapes };
        if (colors.length > 0) itemWhere.color = { in: colors };
        if (clarities.length > 0) itemWhere.clarity = { in: clarities };
        if (cuts.length > 0) itemWhere.cut = { in: cuts };
        if (polishes.length > 0) itemWhere.polish = { in: polishes };
        if (symmetries.length > 0) itemWhere.symmetry = { in: symmetries };
        if (category && category !== 'ALL') itemWhere.category = category;
        if (hasCert) itemWhere.certificateStatus = { in: ['RECEIVED', 'IN_CERTIFICATION'] };
        if (hasRepair) itemWhere.status = 'IN_REPAIR';

        if (minCarat || maxCarat) {
          itemWhere.carat = {};
          if (minCarat) itemWhere.carat.gte = minCarat;
          if (maxCarat) itemWhere.carat.lte = maxCarat;
        }
        if (minPrice || maxPrice) {
          itemWhere.currentValue = {};
          if (minPrice) itemWhere.currentValue.gte = minPrice;
          if (maxPrice) itemWhere.currentValue.lte = maxPrice;
        }

        const items = await prisma.diamondItem.findMany({
          where: itemWhere,
          include: {
            stock: { select: { name: true } },
            currentCertificate: { select: { labType: true, reportNumber: true } }
          },
          orderBy: { itemCode: 'asc' }
        });

        columns = [
          { key: 'itemCode', header: 'Item Code', width: 14 },
          { key: 'stockName', header: 'Stock Parcel', width: 20 },
          { key: 'carat', header: 'Carat', align: 'right', width: 10 },
          { key: 'shape', header: 'Shape', align: 'center', width: 12 },
          { key: 'color', header: 'Color', align: 'center', width: 8 },
          { key: 'clarity', header: 'Clarity', align: 'center', width: 10 },
          { key: 'cut', header: 'Cut', align: 'center', width: 8 },
          { key: 'polish', header: 'Pol', align: 'center', width: 8 },
          { key: 'symmetry', header: 'Sym', align: 'center', width: 8 },
          { key: 'fluorescence', header: 'Fluor', align: 'center', width: 10 },
          { key: 'ratePerCarat', header: 'Rate/Ct (₹)', align: 'right', width: 15 },
          { key: 'currentValue', header: 'Total Value (₹)', align: 'right', width: 18 },
          { key: 'status', header: 'Status', align: 'center', width: 14 },
          { key: 'certStatus', header: 'Lab Certificate', align: 'center', width: 16 }
        ];

        let totalCarats = 0;
        let totalValuation = 0;

        rows = items.map((it) => {
          const c = Number(it.carat || 0);
          const v = Number(it.currentValue || 0);
          totalCarats += c;
          totalValuation += v;

          let certLabel = 'None';
          if (it.currentCertificate) {
            certLabel = `${it.currentCertificate.labType || 'CERT'} #${it.currentCertificate.reportNumber || 'Doc'}`;
          } else if (it.certificateStatus === 'IN_CERTIFICATION') {
            certLabel = 'In Lab';
          }

          return {
            id: it.id,
            rowKey: it.id,
            itemCode: it.itemCode,
            stockName: it.stock?.name || '-',
            carat: c.toFixed(2),
            shape: it.shape || 'Round',
            color: it.color || 'D',
            clarity: it.clarity || 'VS1',
            cut: it.cut || 'EX',
            polish: it.polish || 'EX',
            symmetry: it.symmetry || 'EX',
            fluorescence: it.fluorescence || 'NONE',
            ratePerCarat: `₹${Number(it.ratePerCarat || 0).toLocaleString('en-IN')}`,
            currentValue: `₹${v.toLocaleString('en-IN')}`,
            status: it.status,
            certStatus: certLabel,
            _rawCarats: c,
            _rawValue: v
          };
        });

        kpis = [
          { label: 'Total Stones', value: items.length, color: 'blue' },
          { label: 'Total Carats', value: `${totalCarats.toFixed(2)} ct`, color: 'purple' },
          { label: 'Total Inventory Value', value: `₹${totalValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'emerald' },
          { label: 'Avg Rate / Carat', value: totalCarats > 0 ? `₹${(totalValuation / totalCarats).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '₹0', color: 'teal' }
        ];
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // 3. STOCK MASTER SUMMARY (PARCEL LEVEL)
      // ═══════════════════════════════════════════════════════════
      case 'INVENTORY_SUMMARY':
      case 'STOCK_MASTER': {
        title = 'Stock Master & Inventory Valuation';
        subtitle = 'Parcel-level summary of active inventory stocks and aggregates';

        const stockWhere: any = {};
        if (stockIds.length > 0) stockWhere.id = { in: stockIds };

        const stocks = await prisma.stock.findMany({
          where: stockWhere,
          include: {
            diamondItems: {
              select: {
                carat: true,
                currentValue: true,
                status: true,
                certificateStatus: true,
                currentCertificateId: true
              }
            }
          },
          orderBy: { name: 'asc' }
        });

        columns = [
          { key: 'stockCode', header: 'Stock Code', width: 14 },
          { key: 'stockName', header: 'Stock / Parcel Name', width: 26 },
          { key: 'totalCarats', header: 'Total Carat (Ct)', align: 'right', width: 16 },
          { key: 'avgRate', header: 'Avg Rate (₹/Ct)', align: 'right', width: 16 },
          { key: 'totalValue', header: 'Total Value (₹)', align: 'right', width: 20 },
          { key: 'totalStones', header: 'Stones Count', align: 'center', width: 14 },
          { key: 'availableStones', header: 'Available', align: 'center', width: 12 },
          { key: 'certifiedStones', header: 'Certified', align: 'center', width: 12 },
          { key: 'inRepairStones', header: 'In Repair', align: 'center', width: 12 },
          { key: 'status', header: 'Status', align: 'center', width: 12 }
        ];

        let grandCarats = 0;
        let grandValue = 0;
        let grandStones = 0;

        rows = stocks.map((s) => {
          const items = s.diamondItems || [];
          const totalCts = items.reduce((acc, it) => acc + Number(it.carat || 0), 0);
          const totalVal = items.reduce((acc, it) => acc + Number(it.currentValue || 0), 0);
          const avgRate = totalCts > 0 ? totalVal / totalCts : 0;
          const avail = items.filter(it => it.status === 'AVAILABLE').length;
          const certs = items.filter(it => it.certificateStatus === 'RECEIVED' || it.currentCertificateId).length;
          const repairs = items.filter(it => it.status === 'IN_REPAIR').length;

          grandCarats += totalCts;
          grandValue += totalVal;
          grandStones += items.length;

          return {
            id: s.id,
            rowKey: s.id,
            stockCode: s.stockCode,
            stockName: s.name,
            totalCarats: totalCts.toFixed(3),
            avgRate: `₹${avgRate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
            totalValue: `₹${totalVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
            totalStones: items.length,
            availableStones: avail,
            certifiedStones: certs,
            inRepairStones: repairs,
            status: s.isActive ? 'ACTIVE' : 'INACTIVE',
            _rawCarats: totalCts,
            _rawValue: totalVal
          };
        });

        kpis = [
          { label: 'Total Stocks / Lots', value: stocks.length, color: 'blue' },
          { label: 'Total Carat Weight', value: `${grandCarats.toFixed(3)} ct`, color: 'purple' },
          { label: 'Total Valuation', value: `₹${grandValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'emerald' },
          { label: 'Total Stones Registered', value: grandStones, color: 'teal' }
        ];
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // 4. MASTER INVENTORY & AUDIT RECONCILIATION
      // ═══════════════════════════════════════════════════════════
      case 'AUDIT_RECONCILIATION':
      case 'AUDIT': {
        title = 'Inventory & Financial Reconciliation Audit';
        subtitle = 'Audit of book balances, physical stones and weight tolerance verification';

        const ledgers = await prisma.ledger.findMany({
          include: {
            stock: {
              select: {
                name: true,
                diamondItems: {
                  select: {
                    carat: true,
                    currentValue: true,
                    status: true
                  }
                }
              }
            },
            transactions: {
              select: {
                transactionType: true,
                items: {
                  select: { carat: true }
                }
              }
            }
          }
        });

        columns = [
          { key: 'stockName', header: 'Stock Parcel', width: 22 },
          { key: 'openingCarats', header: 'Opening (Ct)', align: 'right', width: 14 },
          { key: 'purchasedCarats', header: 'Inward (Ct)', align: 'right', width: 14 },
          { key: 'soldCarats', header: 'Outward (Ct)', align: 'right', width: 14 },
          { key: 'bookBalanceCarats', header: 'Book Bal (Ct)', align: 'right', width: 15 },
          { key: 'physicalCarats', header: 'Physical (Ct)', align: 'right', width: 15 },
          { key: 'varianceCarats', header: 'Carat Variance', align: 'right', width: 15 },
          { key: 'physicalValue', header: 'Valuation (₹)', align: 'right', width: 20 },
          { key: 'auditStatus', header: 'Audit Status', align: 'center', width: 15 }
        ];

        let totalBookBal = 0;
        let totalPhysBal = 0;
        let cleanStocks = 0;

        rows = ledgers.map((l) => {
          const opCarats = Number(l.openingCarat || 0);
          let inCarats = 0;
          let outCarats = 0;

          l.transactions.forEach((tx) => {
            const sum = tx.items.reduce((s, it) => s + Number(it.carat || 0), 0);
            if (tx.transactionType === 'PURCHASE') inCarats += sum;
            else if (tx.transactionType === 'SALE') outCarats += sum;
          });

          const bookBal = opCarats + inCarats - outCarats;
          const physicalStones = l.stock?.diamondItems?.filter(it => it.status === 'AVAILABLE') || [];
          const physBal = physicalStones.reduce((s, it) => s + Number(it.carat || 0), 0);
          const physVal = physicalStones.reduce((s, it) => s + Number(it.currentValue || 0), 0);

          const variance = physBal - bookBal;
          const isClean = Math.abs(variance) < 0.005;
          if (isClean) cleanStocks++;

          totalBookBal += bookBal;
          totalPhysBal += physBal;

          return {
            id: l.id,
            rowKey: l.id,
            stockName: l.stock?.name || l.name,
            openingCarats: opCarats.toFixed(3),
            purchasedCarats: inCarats.toFixed(3),
            soldCarats: outCarats.toFixed(3),
            bookBalanceCarats: bookBal.toFixed(3),
            physicalCarats: physBal.toFixed(3),
            varianceCarats: (variance > 0 ? '+' : '') + variance.toFixed(3),
            physicalValue: `₹${physVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
            auditStatus: isClean ? 'MATCHED' : 'DISCREPANCY'
          };
        });

        kpis = [
          { label: 'Ledgers Audited', value: ledgers.length, color: 'blue' },
          { label: 'Reconciled Stocks', value: `${cleanStocks} of ${ledgers.length}`, color: cleanStocks === ledgers.length ? 'emerald' : 'amber' },
          { label: 'Total Book Balance', value: `${totalBookBal.toFixed(3)} ct`, color: 'purple' },
          { label: 'Physical Verified Weight', value: `${totalPhysBal.toFixed(3)} ct`, color: 'teal' }
        ];
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // 5. BROKERAGE COMMISSION AUDIT
      // ═══════════════════════════════════════════════════════════
      case 'BROKERAGE': {
        title = 'Brokerage Commission Audit & Payout Report';
        subtitle = 'Audit of brokered transactions, inclusive vs exclusive commissions & payout liability';

        const txns = await prisma.transaction.findMany({
          where: {
            brokerageAmount: { gt: 0 }
          },
          include: {
            party: { select: { name: true, partyType: true } },
            items: { select: { totalValue: true } }
          },
          orderBy: { transactionDate: 'desc' }
        });

        columns = [
          { key: 'date', header: 'Date', width: 12 },
          { key: 'refNo', header: 'Ref / Voucher', width: 16 },
          { key: 'type', header: 'Deal Type', align: 'center', width: 12 },
          { key: 'partyName', header: 'Counterparty', width: 20 },
          { key: 'brokerName', header: 'Broker', width: 20 },
          { key: 'dealValue', header: 'Brokered Value (₹)', align: 'right', width: 18 },
          { key: 'rate', header: 'Commission %', align: 'center', width: 14 },
          { key: 'mode', header: 'Mode', align: 'center', width: 14 },
          { key: 'payout', header: 'Net Payout (₹)', align: 'right', width: 18 }
        ];

        let totalBrokered = 0;
        let totalCommission = 0;

        rows = txns.map((t) => {
          const sumVal = t.items.reduce((s, it) => s + Number(it.totalValue || 0), 0);
          const comm = Number(t.brokerageAmount || 0);
          const rate = Number(t.brokeragePercentage || 0);
          const bType = t.brokerageType || 'INCLUSIVE';

          totalBrokered += sumVal;
          totalCommission += comm;

          return {
            id: t.id,
            rowKey: t.id,
            date: t.transactionDate ? t.transactionDate.toISOString().split('T')[0] : '',
            refNo: t.referenceNo || t.transactionNo,
            type: t.transactionType,
            partyName: t.party?.name || '-',
            brokerName: (t.party?.partyType === 'BROKER' || t.party?.partyType === 'MIX') ? t.party.name : 'Primary Broker',
            dealValue: `₹${sumVal.toLocaleString('en-IN')}`,
            rate: `${rate.toFixed(2)}%`,
            mode: bType,
            payout: `₹${comm.toLocaleString('en-IN')}`
          };
        });

        kpis = [
          { label: 'Brokered Transactions', value: txns.length, color: 'blue' },
          { label: 'Total Brokered Volume', value: `₹${totalBrokered.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'purple' },
          { label: 'Total Commission Payout', value: `₹${totalCommission.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'emerald' }
        ];
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // 6. PARTY STATEMENT & ENTITY PROFILE REPORT
      // ═══════════════════════════════════════════════════════════
      case 'PARTY_STATEMENT':
      case 'PARTY_ENTITY': {
        const targetPartyId = query.partyId || (partyIds.length > 0 ? partyIds[0] : undefined);

        if (targetPartyId) {
          const party = await prisma.party.findUnique({
            where: { id: targetPartyId },
            include: {
              transactions: {
                include: {
                  ledger: { select: { stock: { select: { name: true } } } },
                  items: { select: { totalValue: true } }
                },
                orderBy: { transactionDate: 'asc' }
              }
            }
          });

          if (party) {
            title = `Statement of Account — ${party.name}`;
            subtitle = `Detailed ledger & transaction statement for ${party.partyType || 'CLIENT'}`;

            columns = [
              { key: 'date', header: 'Date', width: 12 },
              { key: 'refNo', header: 'Voucher / Ref', width: 18 },
              { key: 'type', header: 'Type', align: 'center', width: 12 },
              { key: 'stock', header: 'Stock', width: 18 },
              { key: 'itemsCount', header: 'Items', align: 'center', width: 10 },
              { key: 'debit', header: 'Debit (Dr / In)', align: 'right', width: 16 },
              { key: 'credit', header: 'Credit (Cr / Out)', align: 'right', width: 16 },
              { key: 'balance', header: 'Closing Balance (₹)', align: 'right', width: 18 },
              { key: 'brokerage', header: 'Brokerage', align: 'center', width: 18 }
            ];

            let partySales = 0;
            let partyPurchases = 0;
            let runningBal = 0;

            rows = party.transactions.map((t) => {
              const sumVal = t.items.reduce((s, it) => s + Number(it.totalValue || 0), 0);
              const brokWorth = Number(t.brokerageAmount || 0);

              if (t.transactionType === 'SALE') {
                partySales += sumVal;
                runningBal += sumVal;
              } else if (t.transactionType === 'PURCHASE') {
                partyPurchases += sumVal;
                runningBal -= sumVal;
              }

              return {
                id: t.id,
                rowKey: t.id,
                date: t.transactionDate ? t.transactionDate.toISOString().split('T')[0] : '',
                refNo: t.referenceNo || t.transactionNo,
                type: t.transactionType,
                stock: t.ledger?.stock?.name || '-',
                itemsCount: `${t.items.length} pcs`,
                debit: t.transactionType === 'SALE' ? `₹${sumVal.toLocaleString('en-IN')}` : '—',
                credit: t.transactionType === 'PURCHASE' ? `₹${sumVal.toLocaleString('en-IN')}` : '—',
                balance: `₹${runningBal.toLocaleString('en-IN')}`,
                brokerage: brokWorth > 0 ? `₹${brokWorth.toLocaleString('en-IN')}` : '—'
              };
            });

            entityProfile = {
              id: party.id,
              name: party.name,
              code: party.partyCode,
              partyType: party.partyType,
              phone: party.phone || '—',
              email: party.email || '—',
              address: party.address || '—',
              brokeragePercentage: Number(party.brokeragePercentage || 0),
              totalSales: partySales,
              totalPurchases: partyPurchases,
              netBalance: runningBal
            };

            kpis = [
              { label: 'Total Sales (Cr)', value: `₹${partySales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'emerald' },
              { label: 'Total Purchases (Dr)', value: `₹${partyPurchases.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'blue' },
              { label: 'Net Ledger Balance', value: `₹${runningBal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: runningBal >= 0 ? 'emerald' : 'rose' }
            ];
            break;
          }
        }

        // Default all parties overview if no specific partyId
        title = 'Party Ledger & Counterparty Statements';
        subtitle = 'Consolidated sales, purchases and net ledger positions across counterparties';

        const parties = await prisma.party.findMany({
          include: {
            transactions: {
              select: {
                transactionType: true,
                items: { select: { totalValue: true } }
              }
            }
          },
          orderBy: { name: 'asc' }
        });

        columns = [
          { key: 'partyCode', header: 'Party Code', width: 14 },
          { key: 'name', header: 'Party Name', width: 24 },
          { key: 'partyType', header: 'Role / Type', align: 'center', width: 14 },
          { key: 'phone', header: 'Phone', width: 14 },
          { key: 'purchases', header: 'Purchases (Dr ₹)', align: 'right', width: 18 },
          { key: 'sales', header: 'Sales (Cr ₹)', align: 'right', width: 18 },
          { key: 'netBalance', header: 'Closing Balance (₹)', align: 'right', width: 20 },
          { key: 'brokeragePct', header: 'Broker %', align: 'center', width: 12 }
        ];

        let totalAllPurchases = 0;
        let totalAllSales = 0;

        rows = parties.map((p) => {
          let pSales = 0;
          let pPurchases = 0;

          p.transactions.forEach((tx) => {
            const sum = tx.items.reduce((s, it) => s + Number(it.totalValue || 0), 0);
            if (tx.transactionType === 'SALE') pSales += sum;
            else if (tx.transactionType === 'PURCHASE') pPurchases += sum;
          });

          totalAllSales += pSales;
          totalAllPurchases += pPurchases;
          const net = pSales - pPurchases;

          return {
            id: p.id,
            rowKey: p.id,
            partyCode: p.partyCode,
            name: p.name,
            partyType: p.partyType,
            phone: p.phone || '—',
            purchases: `₹${pPurchases.toLocaleString('en-IN')}`,
            sales: `₹${pSales.toLocaleString('en-IN')}`,
            netBalance: `₹${net.toLocaleString('en-IN')}`,
            brokeragePct: Number(p.brokeragePercentage || 0) > 0 ? `${Number(p.brokeragePercentage).toFixed(2)}%` : '—'
          };
        });

        kpis = [
          { label: 'Total Counterparties', value: parties.length, color: 'blue' },
          { label: 'Total Sales Volume', value: `₹${totalAllSales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'emerald' },
          { label: 'Total Purchases Volume', value: `₹${totalAllPurchases.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'teal' }
        ];
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // 7. LAB CERTIFICATION REGISTER & ENTITY
      // ═══════════════════════════════════════════════════════════
      case 'CERTIFICATES':
      case 'CERTIFICATE_ENTITY': {
        title = 'Lab Certification Pipeline Register';
        subtitle = 'Audit of grading laboratory submissions, certificates issued, turnarounds and lab fee costs';

        const certs = await prisma.certification.findMany({
          include: {
            diamondItem: {
              select: {
                itemCode: true,
                carat: true,
                shape: true,
                color: true,
                clarity: true,
                stock: { select: { name: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        columns = [
          { key: 'itemCode', header: 'Diamond Code', width: 14 },
          { key: 'stockName', header: 'Stock Parcel', width: 18 },
          { key: 'labName', header: 'Lab / Entity', width: 16 },
          { key: 'reportNo', header: 'Certificate #', width: 16 },
          { key: 'carat', header: 'Carat', align: 'right', width: 10 },
          { key: 'shape', header: 'Shape', align: 'center', width: 12 },
          { key: 'color', header: 'Color', align: 'center', width: 8 },
          { key: 'clarity', header: 'Clarity', align: 'center', width: 10 },
          { key: 'status', header: 'Status', align: 'center', width: 14 },
          { key: 'cost', header: 'Lab Fees (₹)', align: 'right', width: 16 },
          { key: 'date', header: 'Submission Date', width: 14 }
        ];

        let totalFee = 0;
        let inLabCount = 0;
        let completedCount = 0;

        rows = certs.map((c) => {
          const fee = Number(c.cost || 0);
          totalFee += fee;
          const isPending = c.certificateStatus === 'PENDING' || c.certificateStatus === 'SUBMITTED';
          if (isPending) inLabCount++;
          else completedCount++;

          return {
            id: c.id,
            rowKey: c.id,
            itemCode: c.diamondItem?.itemCode || '-',
            stockName: c.diamondItem?.stock?.name || '-',
            labName: c.labType || 'GIA',
            reportNo: c.reportNumber || 'Pending',
            carat: Number(c.diamondItem?.carat || 0).toFixed(2),
            shape: c.diamondItem?.shape || 'Round',
            color: c.diamondItem?.color || 'D',
            clarity: c.diamondItem?.clarity || 'VS1',
            status: c.certificateStatus || 'ISSUED',
            cost: fee > 0 ? `₹${fee.toLocaleString('en-IN')}` : '—',
            date: c.createdAt ? c.createdAt.toISOString().split('T')[0] : ''
          };
        });

        kpis = [
          { label: 'Total Submissions', value: certs.length, color: 'blue' },
          { label: 'Currently in Lab', value: inLabCount, color: 'amber' },
          { label: 'Certified Completed', value: completedCount, color: 'emerald' },
          { label: 'Total Testing Expenses', value: `₹${totalFee.toLocaleString('en-IN')}`, color: 'purple' }
        ];
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // 8. WORKSHOP REPAIRS REGISTER & ENTITY
      // ═══════════════════════════════════════════════════════════
      case 'REPAIRS':
      case 'REPAIR_ENTITY': {
        title = 'Workshop Repairs & Polishing Register';
        subtitle = 'Tracking stone recutting, repolishing, workshop turnaround times & repair expenses';

        const repairs = await prisma.repair.findMany({
          include: {
            diamondItem: {
              select: {
                itemCode: true,
                carat: true,
                stock: { select: { name: true } }
              }
            },
            vendor: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        });

        columns = [
          { key: 'itemCode', header: 'Diamond Code', width: 14 },
          { key: 'stockName', header: 'Stock Parcel', width: 18 },
          { key: 'vendorName', header: 'Workshop / Vendor', width: 18 },
          { key: 'repairType', header: 'Issue / Job', width: 18 },
          { key: 'carat', header: 'Carat', align: 'right', width: 10 },
          { key: 'status', header: 'Status', align: 'center', width: 14 },
          { key: 'cost', header: 'Repair Cost (₹)', align: 'right', width: 16 },
          { key: 'sentDate', header: 'Sent Date', width: 14 },
          { key: 'returnDate', header: 'Return Date', width: 14 }
        ];

        let totalRepairCost = 0;
        let inWorkshopCount = 0;

        rows = repairs.map((r) => {
          const cost = Number(r.cost || 0);
          totalRepairCost += cost;
          if (r.status === 'IN_PROGRESS' || r.status === 'SENT') inWorkshopCount++;

          return {
            id: r.id,
            rowKey: r.id,
            itemCode: r.diamondItem?.itemCode || '-',
            stockName: r.diamondItem?.stock?.name || '-',
            vendorName: r.vendor?.name || 'Workshop',
            repairType: r.repairType || 'Recut & Polish',
            carat: Number(r.caratBefore || r.diamondItem?.carat || 0).toFixed(2),
            status: r.status,
            cost: cost > 0 ? `₹${cost.toLocaleString('en-IN')}` : '—',
            sentDate: r.dateSent ? r.dateSent.toISOString().split('T')[0] : '',
            returnDate: r.dateCompleted ? r.dateCompleted.toISOString().split('T')[0] : 'In Progress'
          };
        });

        kpis = [
          { label: 'Total Repair Orders', value: repairs.length, color: 'blue' },
          { label: 'Currently in Workshop', value: inWorkshopCount, color: 'amber' },
          { label: 'Total Workshop Expenses', value: `₹${totalRepairCost.toLocaleString('en-IN')}`, color: 'purple' }
        ];
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // 9. OUTSTANDING AGING & PAYMENT DUES
      // ═══════════════════════════════════════════════════════════
      case 'AGING_DUES': {
        title = 'Payment Due & Aging Analysis Report';
        subtitle = 'Receivables and payables categorized into overdue aging buckets';

        const txns = await prisma.transaction.findMany({
          where: {
            paymentStatus: { in: ['PENDING', 'PARTIAL'] }
          },
          include: {
            party: { select: { name: true, partyType: true } },
            items: { select: { totalValue: true } }
          },
          orderBy: { transactionDate: 'asc' }
        });

        columns = [
          { key: 'partyName', header: 'Party Name', width: 22 },
          { key: 'partyType', header: 'Role', align: 'center', width: 12 },
          { key: 'refNo', header: 'Voucher Ref', width: 16 },
          { key: 'date', header: 'Voucher Date', width: 14 },
          { key: 'dueAmount', header: 'Overdue Amount (₹)', align: 'right', width: 18 },
          { key: 'days', header: 'Days Overdue', align: 'center', width: 14 },
          { key: 'bucket', header: 'Aging Bucket', align: 'center', width: 16 }
        ];

        let totalReceivable = 0;
        let totalPayable = 0;
        const now = Date.now();

        rows = txns.map((t) => {
          const sumVal = t.items.reduce((s, it) => s + Number(it.totalValue || 0), 0);
          const done = Number(t.paymentDone || 0);
          const due = Math.max(0, sumVal - done);

          const billDate = t.transactionDate ? new Date(t.transactionDate) : new Date();
          const diffDays = Math.floor((now - billDate.getTime()) / (1000 * 60 * 60 * 24));

          let bucket = '< 15 Days';
          if (diffDays > 60) bucket = '> 60 Days';
          else if (diffDays > 45) bucket = '45–60 Days';
          else if (diffDays > 30) bucket = '30–45 Days';
          else if (diffDays > 15) bucket = '15–30 Days';

          if (t.transactionType === 'SALE') totalReceivable += due;
          else totalPayable += due;

          return {
            id: t.id,
            rowKey: t.id,
            partyName: t.party?.name || 'Counterparty',
            partyType: t.party?.partyType || 'CLIENT',
            refNo: t.referenceNo || t.transactionNo,
            date: billDate.toISOString().split('T')[0],
            dueAmount: `₹${due.toLocaleString('en-IN')}`,
            days: `${diffDays} days`,
            bucket
          };
        });

        kpis = [
          { label: 'Unsettled Vouchers', value: txns.length, color: 'blue' },
          { label: 'Total Receivables (Clients Owe You)', value: `₹${totalReceivable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'emerald' },
          { label: 'Total Payables (You Owe Suppliers)', value: `₹${totalPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'rose' }
        ];
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // 10. AUDITED PROFIT & LOSS (P&L) STATEMENT (BANKING STANDARDS)
      // ═══════════════════════════════════════════════════════════
      case 'PROFIT_AND_LOSS':
      case 'P_AND_L':
      case 'PL_STATEMENT': {
        const fyLabel = fys.length > 0 ? fys.join(', ') : (startDate ? `${startDate} to ${endDate}` : 'FY 2025-26');
        title = `Audited Profit & Loss Statement (${fyLabel})`;
        subtitle = `Banking & Statutory GAAP Format: Revenue from Operations, COGS, Gross Trading Margin & Net Profit`;

        const txnWhere: any = {};
        if (dateFilter) txnWhere.transactionDate = dateFilter;
        if (partyIds.length > 0) txnWhere.partyId = { in: partyIds };
        if (stockIds.length > 0) txnWhere.ledger = { stockId: { in: stockIds } };

        const allTxns = await prisma.transaction.findMany({
          where: txnWhere,
          select: {
            transactionType: true,
            brokerageAmount: true,
            items: {
              select: {
                totalValue: true,
                carat: true
              }
            }
          }
        });

        const sales = allTxns.filter(t => t.transactionType === 'SALE');
        const purchases = allTxns.filter(t => t.transactionType === 'PURCHASE');

        const totalSales = sales.reduce((s, t) => s + t.items.reduce((sum, it) => sum + Number(it.totalValue || 0), 0), 0);
        const totalSalesCarats = sales.reduce((s, t) => s + t.items.reduce((sum, it) => sum + Number(it.carat || 0), 0), 0);
        const totalPurchases = purchases.reduce((s, t) => s + t.items.reduce((sum, it) => sum + Number(it.totalValue || 0), 0), 0);
        const totalPurchasesCarats = purchases.reduce((s, t) => s + t.items.reduce((sum, it) => sum + Number(it.carat || 0), 0), 0);

        const repairAgg = await prisma.repair.aggregate({ _sum: { cost: true } });
        const totalRepairs = Number(repairAgg._sum.cost || 0);

        const certAgg = await prisma.certification.aggregate({ _sum: { cost: true } });
        const totalCerts = Number(certAgg._sum.cost || 0);

        const itemAgg = await prisma.diamondItem.aggregate({
          where: { status: 'AVAILABLE' },
          _sum: { currentValue: true, carat: true }
        });
        const closingStockVal = Number(itemAgg._sum.currentValue || 0);
        const closingStockCt = Number(itemAgg._sum.carat || 0);

        const openingStockVal = 0;
        const openingStockCt = 0;

        const totalBrokerage = allTxns.reduce((s, t) => s + Number(t.brokerageAmount || 0), 0);

        // Standard Banking COGS Formula for Diamond Traders:
        // COGS = Opening Stock + Diamond Purchases + Workshop Recutting Charges + Lab Cert Fees - Closing Stock Asset
        const cogsGross = openingStockVal + totalPurchases + totalRepairs + totalCerts;
        const cogs = Math.max(0, cogsGross - closingStockVal);

        const grossProfit = totalSales - cogs;
        const grossMarginPct = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

        const operatingOverheads = totalBrokerage;
        const netProfit = grossProfit - operatingOverheads;
        const netMarginPct = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

        columns = [
          { key: 'schedule', header: 'Schedule', align: 'center', width: 12 },
          { key: 'particulars', header: 'Particulars & Account Head', width: 36 },
          { key: 'debit', header: 'Debit (Dr ₹)', align: 'right', width: 18 },
          { key: 'credit', header: 'Credit (Cr ₹)', align: 'right', width: 18 },
          { key: 'netAmount', header: 'Net Amount (₹)', align: 'right', width: 20 },
          { key: 'pctOfRev', header: '% of Turnover', align: 'center', width: 14 }
        ];

        const fmt = (v: number) => `₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
        const pct = (v: number) => totalSales > 0 ? `${((v / totalSales) * 100).toFixed(2)}%` : '0.00%';

        rows = [
          // Section I: Operating Revenue
          {
            id: 'row-sec-1',
            rowKey: 'row-sec-1',
            schedule: 'SCH-1',
            particulars: 'I. REVENUE FROM OPERATIONS',
            debit: '—',
            credit: '—',
            netAmount: '—',
            pctOfRev: '—'
          },
          {
            id: 'row-sales-gross',
            rowKey: 'row-sales-gross',
            schedule: '1.1',
            particulars: `  Gross Diamond Sales (${totalSalesCarats.toFixed(2)} ct)`,
            debit: '—',
            credit: fmt(totalSales),
            netAmount: fmt(totalSales),
            pctOfRev: '100.00%'
          },
          {
            id: 'row-rev-total',
            rowKey: 'row-rev-total',
            schedule: 'TOTAL A',
            particulars: 'TOTAL REVENUE FROM OPERATIONS (A)',
            debit: '—',
            credit: fmt(totalSales),
            netAmount: fmt(totalSales),
            pctOfRev: '100.00%'
          },

          // Section II: Cost of Goods Sold
          {
            id: 'row-sec-2',
            rowKey: 'row-sec-2',
            schedule: 'SCH-2',
            particulars: 'II. COST OF GOODS SOLD (COGS)',
            debit: '—',
            credit: '—',
            netAmount: '—',
            pctOfRev: '—'
          },
          {
            id: 'row-open-stock',
            rowKey: 'row-open-stock',
            schedule: '2.1',
            particulars: `  Opening Diamond Inventory (${openingStockCt.toFixed(2)} ct)`,
            debit: fmt(openingStockVal),
            credit: '—',
            netAmount: fmt(openingStockVal),
            pctOfRev: pct(openingStockVal)
          },
          {
            id: 'row-purchases',
            rowKey: 'row-purchases',
            schedule: '2.2',
            particulars: `  Add: Purchases of Rough & Polished Diamonds (${totalPurchasesCarats.toFixed(2)} ct)`,
            debit: fmt(totalPurchases),
            credit: '—',
            netAmount: fmt(totalPurchases),
            pctOfRev: pct(totalPurchases)
          },
          {
            id: 'row-repairs',
            rowKey: 'row-repairs',
            schedule: '2.3',
            particulars: '  Add: Diamond Processing, Recutting & Workshop Charges',
            debit: fmt(totalRepairs),
            credit: '—',
            netAmount: fmt(totalRepairs),
            pctOfRev: pct(totalRepairs)
          },
          {
            id: 'row-certs',
            rowKey: 'row-certs',
            schedule: '2.4',
            particulars: '  Add: Laboratory Grading & Testing Charges (GIA/IGI)',
            debit: fmt(totalCerts),
            credit: '—',
            netAmount: fmt(totalCerts),
            pctOfRev: pct(totalCerts)
          },
          {
            id: 'row-close-stock',
            rowKey: 'row-close-stock',
            schedule: '2.5',
            particulars: `  Less: Closing Inventory Valuation Asset (${closingStockCt.toFixed(2)} ct)`,
            debit: '—',
            credit: fmt(closingStockVal),
            netAmount: `(${fmt(closingStockVal)})`,
            pctOfRev: `-${pct(closingStockVal)}`
          },
          {
            id: 'row-cogs-total',
            rowKey: 'row-cogs-total',
            schedule: 'TOTAL B',
            particulars: 'TOTAL COST OF GOODS SOLD (COGS) (B)',
            debit: fmt(cogs),
            credit: '—',
            netAmount: fmt(cogs),
            pctOfRev: pct(cogs)
          },

          // Section III: Gross Profit
          {
            id: 'row-sec-3',
            rowKey: 'row-sec-3',
            schedule: 'SCH-3',
            particulars: 'III. GROSS TRADING PROFIT (C = A - B)',
            debit: grossProfit < 0 ? fmt(grossProfit) : '—',
            credit: grossProfit >= 0 ? fmt(grossProfit) : '—',
            netAmount: fmt(grossProfit),
            pctOfRev: `${grossMarginPct.toFixed(2)}%`
          },

          // Section IV: Operating Overhead
          {
            id: 'row-sec-4',
            rowKey: 'row-sec-4',
            schedule: 'SCH-4',
            particulars: 'IV. OPERATING & TRADING OVERHEADS',
            debit: '—',
            credit: '—',
            netAmount: '—',
            pctOfRev: '—'
          },
          {
            id: 'row-brokerage-exp',
            rowKey: 'row-brokerage-exp',
            schedule: '4.1',
            particulars: '  Brokerage & Trading Commission Overhead',
            debit: fmt(totalBrokerage),
            credit: '—',
            netAmount: fmt(totalBrokerage),
            pctOfRev: pct(totalBrokerage)
          },
          {
            id: 'row-overhead-total',
            rowKey: 'row-overhead-total',
            schedule: 'TOTAL D',
            particulars: 'TOTAL OPERATING OVERHEADS (D)',
            debit: fmt(operatingOverheads),
            credit: '—',
            netAmount: fmt(operatingOverheads),
            pctOfRev: pct(operatingOverheads)
          },

          // Section V: Net Profit
          {
            id: 'row-sec-5',
            rowKey: 'row-sec-5',
            schedule: 'SCH-5',
            particulars: 'V. NET PROFIT BEFORE TAX (EBITDA) (E = C - D)',
            debit: netProfit < 0 ? fmt(netProfit) : '—',
            credit: netProfit >= 0 ? fmt(netProfit) : '—',
            netAmount: fmt(netProfit),
            pctOfRev: `${netMarginPct.toFixed(2)}%`
          }
        ];

        kpis = [
          { label: 'Net Sales Turnover', value: fmt(totalSales), color: 'blue' },
          { label: 'Cost of Goods Sold (COGS)', value: fmt(cogs), color: 'purple' },
          { label: 'Gross Profit (Margin %)', value: `${fmt(grossProfit)} (${grossMarginPct.toFixed(1)}%)`, color: grossProfit >= 0 ? 'emerald' : 'rose' },
          { label: 'Closing Diamond Inventory', value: fmt(closingStockVal), color: 'teal' },
          { label: 'Net Profit (EBITDA)', value: `${fmt(netProfit)} (${netMarginPct.toFixed(1)}%)`, color: netProfit >= 0 ? 'emerald' : 'rose' }
        ];
        break;
      }
    }

    return { title, subtitle, columns, rows, kpis, entityProfile };
  }

  /**
   * GET /api/reports/preview
   * Live interactive table preview before export
   */


  async exportExcel(query: any, res: Response): Promise<void> {
    const report = await this.buildReportData(query);

    // Support column-level selection
    let columnsToExport = report.columns;
    if (query.visibleColumns) {
      const visibleKeys = new Set(parseArray(query.visibleColumns));
      if (visibleKeys.size > 0) {
        columnsToExport = report.columns.filter((c: any) => visibleKeys.has(c.key));
      }
    }

    // Support row-level selection
    let rowsToExport = report.rows;
    if (query.selectedRowKeys) {
      const keys = parseArray(query.selectedRowKeys);
      const keySet = new Set(keys);
      rowsToExport = report.rows.filter((r: any) => keySet.has(r.id) || keySet.has(r.rowKey));
    } else if (query.selectedIndices) {
      const indices = new Set(parseArray(query.selectedIndices).map(Number));
      rowsToExport = report.rows.filter((_: any, idx: number) => indices.has(idx));
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DiamondERP V3.0';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(report.title.substring(0, 31) || 'Report', {
      pageSetup: { orientation: 'landscape', paperSize: 9 }
    });

    // Title Block
    const titleRow = sheet.addRow(['DiamondERP V3.0 — ' + report.title]);
    titleRow.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    titleRow.alignment = { vertical: 'middle', horizontal: 'left' };
    titleRow.height = 30;

    const subRow = sheet.addRow([`${report.subtitle} • Generated on ${new Date().toLocaleString('en-IN')}`]);
    subRow.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FFFFFFFF' } };
    subRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    subRow.height = 20;

    // Blank spacer (Row 3)
    sheet.addRow([]);

    // Styled header row at row 4
    const headerRow = sheet.addRow(columnsToExport.map((c: any) => c.header));
    headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    // Set Column Widths individually
    columnsToExport.forEach((c: any, idx: number) => {
      sheet.getColumn(idx + 1).width = Math.max(c.width || 15, 14);
    });

    // Add Data Rows with only visible columns
    rowsToExport.forEach((r: any) => {
      const rowValues = columnsToExport.map((c: any) => r[c.key] ?? '');
      const row = sheet.addRow(rowValues);
      row.font = { name: 'Calibri', size: 10 };
      row.alignment = { vertical: 'middle' };
    });

    // Borders
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });
      }
    });

    const filename = `DiamondERP_${(query.reportType || 'REPORT').toString().toUpperCase()}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  }
}

export const reportsService = new ReportsService();
