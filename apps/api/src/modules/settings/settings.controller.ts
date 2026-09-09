import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';

export class SettingsController {
  
  getSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = await prisma.setting.findMany();
      const settings: Record<string, string> = {};
      
      rows.forEach(r => {
        settings[r.key] = r.value;
      });

      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settingsToUpdate: Record<string, string> = req.body;
      
      for (const [key, value] of Object.entries(settingsToUpdate)) {
        await prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value }
        });
      }

      res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
      next(error);
    }
  };

  exportExcel = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const diamonds = await prisma.diamondItem.findMany({ 
        include: { stock: true, location: true },
        orderBy: { itemCode: 'asc' }
      });
      const stocks = await prisma.stock.findMany({ orderBy: { stockCode: 'asc' } });
      const locations = await prisma.location.findMany({
        include: { stock: true, parentLocation: true },
        orderBy: { name: 'asc' },
      });
      const parties = await prisma.party.findMany({ orderBy: { partyCode: 'asc' } });
      const certificates = await prisma.certification.findMany({ include: { diamondItem: true } });
      const repairs = await prisma.repair.findMany({ include: { diamondItem: true, vendor: true } });
      const ledgers = await prisma.ledger.findMany({
        include: {
          stock: true,
          transactions: {
            include: { items: true },
          },
        },
        orderBy: { name: 'asc' },
      });
      const transactions = await prisma.transaction.findMany({
        include: {
          ledger: { include: { stock: true } },
          party: true,
          items: { include: { diamondItem: true } },
        },
        orderBy: [{ ledgerId: 'asc' }, { transactionDate: 'asc' }, { sequenceNumber: 'asc' }],
      });

      const workbook = new ExcelJS.Workbook();
      
      // 1. Diamonds Sheet
      const diamondSheet = workbook.addWorksheet('Diamonds');
      diamondSheet.columns = [
        { header: 'Item Code', key: 'itemCode', width: 15 },
        { header: 'Display Name', key: 'displayName', width: 20 },
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Location Name', key: 'locationName', width: 20 },
        { header: 'Category', key: 'category', width: 15 },
        { header: 'Carat', key: 'carat', width: 10 },
        { header: 'Color', key: 'color', width: 10 },
        { header: 'Clarity', key: 'clarity', width: 10 },
        { header: 'Cut', key: 'cut', width: 10 },
        { header: 'Shape', key: 'shape', width: 15 },
        { header: 'Polish', key: 'polish', width: 12 },
        { header: 'Symmetry', key: 'symmetry', width: 12 },
        { header: 'Fluorescence', key: 'fluorescence', width: 15 },
        { header: 'Length (mm)', key: 'lengthMm', width: 12 },
        { header: 'Width (mm)', key: 'widthMm', width: 12 },
        { header: 'Depth (mm)', key: 'depthMm', width: 12 },
        { header: 'Rate Per Carat', key: 'ratePerCarat', width: 15 },
        { header: 'Current Value', key: 'currentValue', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
      ];
      diamonds.forEach(d => {
        diamondSheet.addRow({
          itemCode: d.itemCode,
          displayName: d.displayName,
          stockCode: d.stock?.stockCode,
          locationName: d.location?.name || '',
          category: d.category,
          carat: Number(d.carat),
          color: d.color,
          clarity: d.clarity,
          cut: d.cut,
          shape: d.shape,
          polish: d.polish || '',
          symmetry: d.symmetry || '',
          fluorescence: d.fluorescence || '',
          lengthMm: d.lengthMm != null ? Number(d.lengthMm) : '',
          widthMm: d.widthMm != null ? Number(d.widthMm) : '',
          depthMm: d.depthMm != null ? Number(d.depthMm) : '',
          ratePerCarat: Number(d.ratePerCarat),
          currentValue: Number(d.currentValue),
          status: d.status,
        });
      });

      // 2. Stocks Sheet
      const stockSheet = workbook.addWorksheet('Stocks');
      stockSheet.columns = [
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Is Active', key: 'isActive', width: 10 },
      ];
      stocks.forEach(s => stockSheet.addRow(s));

      // 3. Locations Sheet
      const locationSheet = workbook.addWorksheet('Locations');
      locationSheet.columns = [
        { header: 'Location Name', key: 'name', width: 25 },
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Location Type', key: 'locationType', width: 15 },
        { header: 'Parent Location', key: 'parentLocation', width: 25 },
      ];
      locations.forEach(loc => {
        locationSheet.addRow({
          name: loc.name,
          stockCode: loc.stock?.stockCode,
          locationType: loc.locationType,
          parentLocation: loc.parentLocation?.name || '',
        });
      });

      // 4. Parties Sheet
      const partySheet = workbook.addWorksheet('Parties');
      partySheet.columns = [
        { header: 'Party Code', key: 'partyCode', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Type', key: 'partyType', width: 15 },
        { header: 'Brokerage (%)', key: 'brokeragePercentage', width: 15 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Address', key: 'address', width: 30 },
      ];
      parties.forEach(p => partySheet.addRow({
        ...p,
        brokeragePercentage: Number(p.brokeragePercentage || 0),
      }));

      // 5. Ledgers Sheet with Debit, Credit & Closing Balance
      const ledgerSheet = workbook.addWorksheet('Ledgers');
      ledgerSheet.columns = [
        { header: 'Ledger Name', key: 'name', width: 25 },
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Ledger Type', key: 'ledgerType', width: 15 },
        { header: 'Opening Balance (Ct)', key: 'openingCarat', width: 20 },
        { header: 'Opening Balance (₹)', key: 'openingValue', width: 20 },
        { header: 'Total Debit (Ct)', key: 'totalDebitCarat', width: 18 },
        { header: 'Total Debit (₹)', key: 'totalDebitValue', width: 18 },
        { header: 'Total Credit (Ct)', key: 'totalCreditCarat', width: 18 },
        { header: 'Total Credit (₹)', key: 'totalCreditValue', width: 18 },
        { header: 'Closing Balance (Ct)', key: 'closingCarat', width: 20 },
        { header: 'Closing Balance (₹)', key: 'closingValue', width: 20 },
      ];
      ledgers.forEach(l => {
        const openingCarat = Number(l.openingCarat || 0);
        const openingValue = Number(l.openingValue || 0);
        let totalDebitCarat = 0;
        let totalDebitValue = 0;
        let totalCreditCarat = 0;
        let totalCreditValue = 0;

        l.transactions?.forEach(t => {
          t.items?.forEach(i => {
            if (i.itemAction === 'IN') {
              totalDebitCarat += Number(i.carat || 0);
              totalDebitValue += Number(i.totalValue || 0);
            } else if (i.itemAction === 'OUT') {
              totalCreditCarat += Number(i.carat || 0);
              totalCreditValue += Number(i.totalValue || 0);
            }
          });
        });

        ledgerSheet.addRow({
          name: l.name,
          stockCode: l.stock?.stockCode,
          ledgerType: l.ledgerType,
          openingCarat,
          openingValue,
          totalDebitCarat,
          totalDebitValue,
          totalCreditCarat,
          totalCreditValue,
          closingCarat: openingCarat + totalDebitCarat - totalCreditCarat,
          closingValue: openingValue + totalDebitValue - totalCreditValue,
        });
      });

      // 6. Certificates Sheet
      const certSheet = workbook.addWorksheet('Certificates');
      certSheet.columns = [
        { header: 'Report Number', key: 'reportNumber', width: 20 },
        { header: 'Item Code', key: 'itemCode', width: 15 },
        { header: 'Lab Type', key: 'labType', width: 15 },
        { header: 'Status', key: 'certificateStatus', width: 15 },
        { header: 'Cost', key: 'cost', width: 10 },
      ];
      certificates.forEach(c => certSheet.addRow({
        reportNumber: c.reportNumber,
        itemCode: c.diamondItem?.itemCode,
        labType: c.labType,
        certificateStatus: c.certificateStatus,
        cost: c.cost,
      }));

      // 7. Repairs Sheet
      const repairSheet = workbook.addWorksheet('Repairs');
      repairSheet.columns = [
        { header: 'Item Code', key: 'itemCode', width: 15 },
        { header: 'Repair Type', key: 'repairType', width: 20 },
        { header: 'Vendor', key: 'vendorName', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Cost', key: 'cost', width: 10 },
      ];
      repairs.forEach(r => repairSheet.addRow({
        itemCode: r.diamondItem?.itemCode,
        repairType: r.repairType,
        vendorName: r.vendor?.name,
        status: r.status,
        cost: r.cost,
      }));

      // 8. Transactions Sheet with Debit, Credit & Closing Balance
      const txnSheet = workbook.addWorksheet('Transactions');
      txnSheet.columns = [
        { header: 'Transaction No', key: 'transactionNo', width: 20 },
        { header: 'Ledger Name', key: 'ledgerName', width: 25 },
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Transaction Date', key: 'transactionDate', width: 20 },
        { header: 'Transaction Type', key: 'transactionType', width: 15 },
        { header: 'Party Code', key: 'partyCode', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Reference No', key: 'referenceNo', width: 15 },
        { header: 'Remarks', key: 'remarks', width: 25 },
        { header: 'Debit Carats (Dr)', key: 'debitCarats', width: 18 },
        { header: 'Debit Value (Dr ₹)', key: 'debitValue', width: 18 },
        { header: 'Credit Carats (Cr)', key: 'creditCarats', width: 18 },
        { header: 'Credit Value (Cr ₹)', key: 'creditValue', width: 18 },
        { header: 'Closing Balance (Ct)', key: 'closingBalCarat', width: 20 },
        { header: 'Closing Balance (₹)', key: 'closingBalValue', width: 20 },
        { header: 'Brokerage (%)', key: 'brokeragePercentage', width: 15 },
        { header: 'Brokerage (₹)', key: 'brokerageAmount', width: 15 },
        { header: 'Brokerage Type', key: 'brokerageType', width: 15 },
        { header: 'Payment Status', key: 'paymentStatus', width: 15 },
        { header: 'Payment Done', key: 'paymentDone', width: 15 },
        { header: 'Payment Due', key: 'paymentDue', width: 15 },
      ];

      const ledgerRunningBalances: Record<string, { carat: number; value: number }> = {};
      ledgers.forEach(l => {
        ledgerRunningBalances[l.id] = {
          carat: Number(l.openingCarat || 0),
          value: Number(l.openingValue || 0),
        };
      });

      transactions.forEach(t => {
        let debitCarats = 0;
        let debitValue = 0;
        let creditCarats = 0;
        let creditValue = 0;

        t.items?.forEach(i => {
          if (i.itemAction === 'IN') {
            debitCarats += Number(i.carat || 0);
            debitValue += Number(i.totalValue || 0);
          } else if (i.itemAction === 'OUT') {
            creditCarats += Number(i.carat || 0);
            creditValue += Number(i.totalValue || 0);
          }
        });

        const bal = ledgerRunningBalances[t.ledgerId] || { carat: 0, value: 0 };
        bal.carat = bal.carat + debitCarats - creditCarats;
        bal.value = bal.value + debitValue - creditValue;

        txnSheet.addRow({
          transactionNo: t.transactionNo,
          ledgerName: t.ledger?.name,
          stockCode: t.ledger?.stock?.stockCode,
          transactionDate: t.transactionDate ? t.transactionDate.toISOString().split('T')[0] : '',
          transactionType: t.transactionType,
          partyCode: t.party?.partyCode,
          status: t.status,
          referenceNo: t.referenceNo,
          remarks: t.remarks,
          debitCarats,
          debitValue,
          creditCarats,
          creditValue,
          closingBalCarat: bal.carat,
          closingBalValue: bal.value,
          brokeragePercentage: Number(t.brokeragePercentage || 0),
          brokerageAmount: Number(t.brokerageAmount || 0),
          brokerageType: t.brokerageType || 'INCLUSIVE',
          paymentStatus: t.paymentStatus,
          paymentDone: Number(t.paymentDone || 0),
          paymentDue: Number(t.paymentDue || 0),
        });
      });

      // 9. Transaction Items Sheet
      const txnItemSheet = workbook.addWorksheet('Transaction Items');
      txnItemSheet.columns = [
        { header: 'Transaction No', key: 'transactionNo', width: 20 },
        { header: 'Item Code', key: 'itemCode', width: 15 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Carat', key: 'carat', width: 10 },
        { header: 'Rate Per Carat', key: 'ratePerCarat', width: 15 },
        { header: 'Total Value', key: 'totalValue', width: 15 },
        { header: 'Item Action', key: 'itemAction', width: 12 },
      ];
      transactions.forEach(t => {
        t.items?.forEach(i => {
          txnItemSheet.addRow({
            transactionNo: t.transactionNo,
            itemCode: i.diamondItem?.itemCode || '',
            quantity: Number(i.quantity || 1),
            carat: Number(i.carat || 0),
            ratePerCarat: Number(i.ratePerCarat || 0),
            totalValue: Number(i.totalValue || 0),
            itemAction: i.itemAction || 'IN',
          });
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="diamond_inventory_export.xlsx"');
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  };

  downloadTemplate = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workbook = new ExcelJS.Workbook();
      
      const diamondSheet = workbook.addWorksheet('Diamonds');
      diamondSheet.columns = [
        { header: 'Item Code', key: 'itemCode', width: 15 },
        { header: 'Display Name', key: 'displayName', width: 20 },
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Location Name', key: 'locationName', width: 20 },
        { header: 'Category', key: 'category', width: 15 },
        { header: 'Carat', key: 'carat', width: 10 },
        { header: 'Color', key: 'color', width: 10 },
        { header: 'Clarity', key: 'clarity', width: 10 },
        { header: 'Cut', key: 'cut', width: 10 },
        { header: 'Shape', key: 'shape', width: 15 },
        { header: 'Polish', key: 'polish', width: 12 },
        { header: 'Symmetry', key: 'symmetry', width: 12 },
        { header: 'Fluorescence', key: 'fluorescence', width: 15 },
        { header: 'Length (mm)', key: 'lengthMm', width: 12 },
        { header: 'Width (mm)', key: 'widthMm', width: 12 },
        { header: 'Depth (mm)', key: 'depthMm', width: 12 },
        { header: 'Rate Per Carat', key: 'ratePerCarat', width: 15 },
        { header: 'Current Value', key: 'currentValue', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
      ];
      diamondSheet.addRow({
        itemCode: 'D-001',
        displayName: '1.00ct Round D VS1',
        stockCode: 'STK-01',
        locationName: 'Mumbai Vault Safe 1',
        category: 'SINGLE',
        carat: 1.00,
        color: 'D',
        clarity: 'VS1',
        cut: 'EX',
        shape: 'Round',
        polish: 'EX',
        symmetry: 'EX',
        fluorescence: 'NONE',
        lengthMm: 6.45,
        widthMm: 6.42,
        depthMm: 3.98,
        ratePerCarat: 5000,
        currentValue: 5000,
        status: 'AVAILABLE',
      });

      const stockSheet = workbook.addWorksheet('Stocks');
      stockSheet.columns = [
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Is Active', key: 'isActive', width: 10 },
      ];
      stockSheet.addRow({ stockCode: 'STK-01', name: 'Main Inventory', currency: 'USD', isActive: true });

      const locationSheet = workbook.addWorksheet('Locations');
      locationSheet.columns = [
        { header: 'Location Name', key: 'name', width: 25 },
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Location Type', key: 'locationType', width: 15 },
        { header: 'Parent Location', key: 'parentLocation', width: 25 },
      ];
      locationSheet.addRow({
        name: 'Mumbai Vault Safe 1',
        stockCode: 'STK-01',
        locationType: 'VAULT',
        parentLocation: '',
      });

      const partySheet = workbook.addWorksheet('Parties');
      partySheet.columns = [
        { header: 'Party Code', key: 'partyCode', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Type', key: 'partyType', width: 15 },
        { header: 'Brokerage (%)', key: 'brokeragePercentage', width: 15 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Address', key: 'address', width: 30 },
      ];
      partySheet.addRow({
        partyCode: 'CUST-01',
        name: 'John Doe',
        partyType: 'CUSTOMER',
        brokeragePercentage: 0,
        phone: '1234567890',
        email: 'john@example.com',
        address: '123 Diamond St, Mumbai',
      });

      const ledgerSheet = workbook.addWorksheet('Ledgers');
      ledgerSheet.columns = [
        { header: 'Ledger Name', key: 'name', width: 25 },
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Ledger Type', key: 'ledgerType', width: 15 },
        { header: 'Opening Balance (Ct)', key: 'openingCarat', width: 20 },
        { header: 'Opening Balance (₹)', key: 'openingValue', width: 20 },
        { header: 'Total Debit (Ct)', key: 'totalDebitCarat', width: 18 },
        { header: 'Total Debit (₹)', key: 'totalDebitValue', width: 18 },
        { header: 'Total Credit (Ct)', key: 'totalCreditCarat', width: 18 },
        { header: 'Total Credit (₹)', key: 'totalCreditValue', width: 18 },
        { header: 'Closing Balance (Ct)', key: 'closingCarat', width: 20 },
        { header: 'Closing Balance (₹)', key: 'closingValue', width: 20 },
      ];
      ledgerSheet.addRow({
        name: 'Main Inventory Ledger',
        stockCode: 'STK-01',
        ledgerType: 'DEFAULT',
        openingCarat: 10.00,
        openingValue: 50000,
        totalDebitCarat: 1.00,
        totalDebitValue: 5000,
        totalCreditCarat: 0.00,
        totalCreditValue: 0,
        closingCarat: 11.00,
        closingValue: 55000,
      });

      const certSheet = workbook.addWorksheet('Certificates');
      certSheet.columns = [
        { header: 'Report Number', key: 'reportNumber', width: 20 },
        { header: 'Item Code', key: 'itemCode', width: 15 },
        { header: 'Lab Type', key: 'labType', width: 15 },
        { header: 'Status', key: 'certificateStatus', width: 15 },
        { header: 'Cost', key: 'cost', width: 10 },
      ];
      certSheet.addRow({ reportNumber: 'GIA-123456', itemCode: 'D-001', labType: 'GIA', certificateStatus: 'ISSUED', cost: 120 });

      const repairSheet = workbook.addWorksheet('Repairs');
      repairSheet.columns = [
        { header: 'Item Code', key: 'itemCode', width: 15 },
        { header: 'Repair Type', key: 'repairType', width: 20 },
        { header: 'Vendor', key: 'vendorName', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Cost', key: 'cost', width: 10 },
      ];
      repairSheet.addRow({ itemCode: 'D-001', repairType: 'REPOLISH', vendorName: 'Workshop A', status: 'COMPLETED', cost: 50 });

      const txnSheet = workbook.addWorksheet('Transactions');
      txnSheet.columns = [
        { header: 'Transaction No', key: 'transactionNo', width: 20 },
        { header: 'Ledger Name', key: 'ledgerName', width: 25 },
        { header: 'Stock Code', key: 'stockCode', width: 15 },
        { header: 'Transaction Date', key: 'transactionDate', width: 20 },
        { header: 'Transaction Type', key: 'transactionType', width: 15 },
        { header: 'Party Code', key: 'partyCode', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Reference No', key: 'referenceNo', width: 15 },
        { header: 'Remarks', key: 'remarks', width: 25 },
        { header: 'Debit Carats (Dr)', key: 'debitCarats', width: 18 },
        { header: 'Debit Value (Dr ₹)', key: 'debitValue', width: 18 },
        { header: 'Credit Carats (Cr)', key: 'creditCarats', width: 18 },
        { header: 'Credit Value (Cr ₹)', key: 'creditValue', width: 18 },
        { header: 'Closing Balance (Ct)', key: 'closingBalCarat', width: 20 },
        { header: 'Closing Balance (₹)', key: 'closingBalValue', width: 20 },
        { header: 'Brokerage (%)', key: 'brokeragePercentage', width: 15 },
        { header: 'Brokerage (₹)', key: 'brokerageAmount', width: 15 },
        { header: 'Brokerage Type', key: 'brokerageType', width: 15 },
        { header: 'Payment Status', key: 'paymentStatus', width: 15 },
        { header: 'Payment Done', key: 'paymentDone', width: 15 },
        { header: 'Payment Due', key: 'paymentDue', width: 15 },
      ];
      txnSheet.addRow({
        transactionNo: 'TXN-001',
        ledgerName: 'Main Inventory Ledger',
        stockCode: 'STK-01',
        transactionDate: '2026-09-01',
        transactionType: 'PURCHASE',
        partyCode: 'CUST-01',
        status: 'POSTED',
        referenceNo: 'INV-1001',
        remarks: 'Initial stock intake',
        debitCarats: 1.00,
        debitValue: 5000,
        creditCarats: 0,
        creditValue: 0,
        closingBalCarat: 11.00,
        closingBalValue: 55000,
        brokeragePercentage: 0,
        brokerageAmount: 0,
        brokerageType: 'INCLUSIVE',
        paymentStatus: 'COMPLETED',
        paymentDone: 5000,
        paymentDue: 0,
      });

      const txnItemSheet = workbook.addWorksheet('Transaction Items');
      txnItemSheet.columns = [
        { header: 'Transaction No', key: 'transactionNo', width: 20 },
        { header: 'Item Code', key: 'itemCode', width: 15 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Carat', key: 'carat', width: 10 },
        { header: 'Rate Per Carat', key: 'ratePerCarat', width: 15 },
        { header: 'Total Value', key: 'totalValue', width: 15 },
        { header: 'Item Action', key: 'itemAction', width: 12 },
      ];
      txnItemSheet.addRow({
        transactionNo: 'TXN-001',
        itemCode: 'D-001',
        quantity: 1,
        carat: 1.00,
        ratePerCarat: 5000,
        totalValue: 5000,
        itemAction: 'IN',
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="diamond_import_template.xlsx"');
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  };

  getProfiles = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Lazy import to get current profiles logic
      const prismaObj = require('../../infrastructure/database/prisma');
      const profiles = prismaObj.getAllProfiles ? prismaObj.getAllProfiles() : ['Stavan'];
      const active = prismaObj.getActiveProfile ? prismaObj.getActiveProfile() : 'Stavan';
      
      res.json({ success: true, data: { profiles, active } });
    } catch (error) {
      next(error);
    }
  };

  switchProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { profileName } = req.body;
      if (!profileName) {
        res.status(400).json({ success: false, message: 'Profile name is required' });
        return;
      }
      
      const prismaObj = require('../../infrastructure/database/prisma');
      if (prismaObj.switchProfile) {
        await prismaObj.switchProfile(profileName);
      }
      
      res.json({ success: true, message: `Switched to profile: ${profileName}` });
    } catch (error) {
      next(error);
    }
  };

  factoryReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // ── SECURITY: Factory reset protection ──────────────────────────────
      // 1. Check if factory reset is allowed by environment configuration
      if (process.env.ALLOW_FACTORY_RESET !== 'true') {
        res.status(403).json({
          success: false,
          error: 'Factory reset is disabled. Set ALLOW_FACTORY_RESET=true in environment to enable.',
        });
        return;
      }

      // 2. Require re-authentication: user must provide their password
      const { confirmPassword } = req.body;
      if (!confirmPassword || typeof confirmPassword !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Password confirmation required. Send { confirmPassword: "your-password" } to confirm this destructive operation.',
        });
        return;
      }

      // 3. Verify the password matches the authenticated user
      // Note: req.user is attached by the authenticate middleware
      const authenticatedUser = (req as any).user;
      if (!authenticatedUser) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }

      // Verify re-authentication password
      const { authService } = await import('../auth/auth.service');
      const user = await prisma.user.findUnique({ where: { id: authenticatedUser.id } });
      if (!user) {
        res.status(401).json({ success: false, error: 'User not found.' });
        return;
      }
      const passwordValid = await authService.verifyPassword(confirmPassword, user.passwordHash);
      if (!passwordValid) {
        res.status(401).json({ success: false, error: 'Incorrect password. Factory reset aborted.' });
        return;
      }

      // 4. Create audit event BEFORE the reset
      await prisma.auditEvent.create({
        data: {
          entityType: 'SYSTEM',
          entityId: 'factory-reset',
          eventType: 'FACTORY_RESET',
          description: `Factory reset initiated by ${authenticatedUser.username} (${authenticatedUser.role})`,
          performedBy: authenticatedUser.id,
          ipAddress: req.ip || undefined,
        },
      });

      // 5. Wipe the database in proper dependency order
      await prisma.$transaction([
        prisma.transformationProvenance.deleteMany({}),
        prisma.itemTransformation.deleteMany({}),
        prisma.itemEvent.deleteMany({}),
        prisma.inventoryMovement.deleteMany({}),
        prisma.financialEntry.deleteMany({}),
        prisma.transactionItem.deleteMany({}),
        prisma.certification.deleteMany({}),
        prisma.repair.deleteMany({}),
        prisma.transaction.deleteMany({}),
        prisma.diamondItem.deleteMany({}),
        prisma.ledger.deleteMany({}),
        prisma.location.deleteMany({}),
        prisma.stock.deleteMany({}),
        prisma.party.deleteMany({}),
        prisma.versionChange.deleteMany({}),
        prisma.recordVersion.deleteMany({}),
        prisma.draftRevision.deleteMany({}),
        prisma.documentDraft.deleteMany({}),
        // Note: auditEvent is intentionally NOT deleted — audit trail is preserved
      ]);

      res.json({ success: true, message: 'Factory reset completed. All business data wiped. Audit trail preserved.' });
    } catch (error) {
      next(error);
    }
  };

  importExcel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const mode = req.query.mode as string || 'merge'; // 'merge' or 'overwrite'

      if (mode === 'overwrite') {
        await prisma.$transaction([
          prisma.transformationProvenance.deleteMany({}),
          prisma.itemTransformation.deleteMany({}),
          prisma.itemEvent.deleteMany({}),
          prisma.inventoryMovement.deleteMany({}),
          prisma.financialEntry.deleteMany({}),
          prisma.transactionItem.deleteMany({}),
          prisma.certification.deleteMany({}),
          prisma.repair.deleteMany({}),
          prisma.transaction.deleteMany({}),
          prisma.diamondItem.deleteMany({}),
          prisma.ledger.deleteMany({}),
          prisma.location.deleteMany({}),
          prisma.stock.deleteMany({}),
          prisma.party.deleteMany({}),
          prisma.versionChange.deleteMany({}),
          prisma.recordVersion.deleteMany({}),
          prisma.draftRevision.deleteMany({}),
          prisma.documentDraft.deleteMany({}),
          prisma.auditEvent.deleteMany({}),
        ]);
      }

      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(req.file.buffer as any);
      } catch {
        res.status(400).json({ success: false, message: 'Invalid Excel file format' });
        return;
      }

      const errors: string[] = [];
      let totalSuccess = 0;
      
      await prisma.$transaction(async (tx) => {

      // Helper: read sheet rows into objects
      const readSheet = (sheetName: string): any[] => {
        const sheet = workbook.getWorksheet(sheetName);
        if (!sheet) return [];
        const headers: string[] = [];
        sheet.getRow(1).eachCell((cell, col) => {
          headers[col] = cell.value?.toString() || '';
        });
        const rows: any[] = [];
        for (let r = 2; r <= sheet.rowCount; r++) {
          const row = sheet.getRow(r);
          if (!row.hasValues) continue;
          const obj: any = {};
          row.eachCell((cell, col) => {
            if (headers[col]) obj[headers[col]] = cell.value;
          });
          rows.push(obj);
        }
        return rows;
      };

      // ── 1. Import Stocks ─────────────────────────────────────────────
      const stockRows = readSheet('Stocks');
      for (const row of stockRows) {
        try {
          const stockCode = row['Stock Code'];
          if (!stockCode) continue;
          await tx.stock.upsert({
            where: { stockCode: String(stockCode) },
            update: { name: row['Name'] || stockCode, currency: row['Currency'] || 'INR', isActive: row['Is Active'] !== undefined ? Boolean(row['Is Active']) : true },
            create: { stockCode: String(stockCode), name: row['Name'] || stockCode, currency: row['Currency'] || 'INR', isActive: row['Is Active'] !== undefined ? Boolean(row['Is Active']) : true },
          });
          totalSuccess++;
        } catch (err: any) {
          errors.push(`[Stocks] Row "${row['Stock Code']}": ${err.message}`);
        }
      }

      // ── 1b. Import Locations ──────────────────────────────────────────
      const locationRows = readSheet('Locations');
      for (const row of locationRows) {
        try {
          const locName = row['Location Name'] || row['Name'];
          if (!locName) continue;
          const stockCode = row['Stock Code'];
          let stock = null;
          if (stockCode) {
            stock = await tx.stock.findUnique({ where: { stockCode: String(stockCode) } });
          }
          if (!stock) {
            stock = await tx.stock.findFirst();
          }
          if (!stock) {
            stock = await tx.stock.create({
              data: { stockCode: 'MAIN', name: 'Main Inventory', currency: 'INR' }
            });
          }

          const existingLoc = await tx.location.findFirst({
            where: { name: String(locName), stockId: stock.id }
          });

          if (existingLoc) {
            await tx.location.update({
              where: { id: existingLoc.id },
              data: { locationType: row['Location Type'] || 'VAULT' }
            });
          } else {
            await tx.location.create({
              data: {
                name: String(locName),
                stockId: stock.id,
                locationType: row['Location Type'] || 'VAULT'
              }
            });
          }
          totalSuccess++;
        } catch (err: any) {
          errors.push(`[Locations] Row "${row['Location Name'] || row['Name'] || '?'}": ${err.message}`);
        }
      }

      // ── 2. Import Parties ────────────────────────────────────────────
      const partyRows = readSheet('Parties');
      for (const row of partyRows) {
        try {
          const partyCode = row['Party Code'];
          if (!partyCode) continue;
          await tx.party.upsert({
            where: { partyCode: String(partyCode) },
            update: {
              name: row['Name'] || partyCode,
              partyType: row['Type'] || 'OTHER',
              brokeragePercentage: row['Brokerage (%)'] != null ? Number(row['Brokerage (%)']) : undefined,
              phone: row['Phone'] ? String(row['Phone']) : null,
              email: row['Email'] ? String(row['Email']) : null,
              address: row['Address'] ? String(row['Address']) : null,
            },
            create: {
              partyCode: String(partyCode),
              name: row['Name'] || partyCode,
              partyType: row['Type'] || 'OTHER',
              brokeragePercentage: row['Brokerage (%)'] != null ? Number(row['Brokerage (%)']) : 0,
              phone: row['Phone'] ? String(row['Phone']) : null,
              email: row['Email'] ? String(row['Email']) : null,
              address: row['Address'] ? String(row['Address']) : null,
            },
          });
          totalSuccess++;
        } catch (err: any) {
          errors.push(`[Parties] Row "${row['Party Code']}": ${err.message}`);
        }
      }

      // ── 3. Import Ledgers ─────────────────────────────────────────────
      const ledgerRows = readSheet('Ledgers');
      for (const row of ledgerRows) {
        try {
          const ledgerName = row['Ledger Name'] || row['Name'];
          if (!ledgerName) continue;
          const stockCode = row['Stock Code'];
          let stock = null;
          if (stockCode) {
            stock = await tx.stock.findUnique({ where: { stockCode: String(stockCode) } });
          }
          if (!stock) {
            stock = await tx.stock.findFirst();
          }
          if (!stock) {
            stock = await tx.stock.create({
              data: { stockCode: 'MAIN', name: 'Main Inventory', currency: 'INR' }
            });
          }

          const existingLedger = await tx.ledger.findFirst({
            where: { name: String(ledgerName), stockId: stock.id }
          });

          const openingCarat = parseFloat(row['Opening Balance (Ct)']) || parseFloat(row['Opening Carat']) || 0;
          const openingValue = parseFloat(row['Opening Balance (₹)']) || parseFloat(row['Opening Value']) || 0;

          const ledgerData = {
            name: String(ledgerName),
            stockId: stock.id,
            ledgerType: row['Ledger Type'] || 'DEFAULT',
            openingCarat,
            openingValue,
          };

          if (existingLedger) {
            await tx.ledger.update({
              where: { id: existingLedger.id },
              data: ledgerData,
            });
          } else {
            await tx.ledger.create({
              data: ledgerData,
            });
          }
          totalSuccess++;
        } catch (err: any) {
          errors.push(`[Ledgers] Row "${row['Ledger Name'] || row['Name'] || '?'}": ${err.message}`);
        }
      }

      // ── 4. Import Diamonds ───────────────────────────────────────────
      const diamondRows = readSheet('Diamonds');
      let defaultStock = await tx.stock.findFirst();
      if (!defaultStock) {
        defaultStock = await tx.stock.create({ data: { stockCode: 'MAIN', name: 'Main Inventory', currency: 'INR' } });
      }

      for (const row of diamondRows) {
        try {
          const stockCode = row['Stock Code'];
          let stockId = defaultStock?.id;
          if (stockCode) {
            let stock = await tx.stock.findUnique({ where: { stockCode: String(stockCode) } });
            if (!stock) {
              stock = await tx.stock.create({ data: { stockCode: String(stockCode), name: `Imported ${stockCode}` } });
            }
            stockId = stock.id;
          }
          if (!stockId) throw new Error('No stock available');

          const carat = parseFloat(row['Carat']);
          if (isNaN(carat)) throw new Error('Carat is required and must be a number');

          const itemCode = row['Item Code'] || `D-${uuidv4().substring(0, 6)}`;

          // Find location if specified
          let locationId: string | null = null;
          const locName = row['Location Name'] || row['Location'];
          if (locName) {
            const loc = await tx.location.findFirst({
              where: { name: String(locName), stockId }
            }) || await tx.location.findFirst({ where: { name: String(locName) } });
            if (loc) locationId = loc.id;
          }

          const lengthMm = row['Length (mm)'] != null && !isNaN(parseFloat(row['Length (mm)'])) 
            ? parseFloat(row['Length (mm)']) 
            : (row['lengthMm'] != null && !isNaN(parseFloat(row['lengthMm'])) ? parseFloat(row['lengthMm']) : null);
          const widthMm = row['Width (mm)'] != null && !isNaN(parseFloat(row['Width (mm)'])) 
            ? parseFloat(row['Width (mm)']) 
            : (row['widthMm'] != null && !isNaN(parseFloat(row['widthMm'])) ? parseFloat(row['widthMm']) : null);
          const depthMm = row['Depth (mm)'] != null && !isNaN(parseFloat(row['Depth (mm)'])) 
            ? parseFloat(row['Depth (mm)']) 
            : (row['depthMm'] != null && !isNaN(parseFloat(row['depthMm'])) ? parseFloat(row['depthMm']) : null);

          const data = {
            displayName: row['Display Name'] || `${carat}ct ${row['Color'] || 'D'} ${row['Clarity'] || 'VS1'}`,
            stockId,
            locationId,
            carat,
            color: row['Color'] || 'D',
            clarity: row['Clarity'] || 'VS1',
            cut: row['Cut'] || 'EX',
            shape: row['Shape'] || 'Round',
            category: row['Category'] || 'SINGLE',
            polish: row['Polish'] || null,
            symmetry: row['Symmetry'] || null,
            fluorescence: row['Fluorescence'] || null,
            lengthMm,
            widthMm,
            depthMm,
            ratePerCarat: parseFloat(row['Rate Per Carat']) || 0,
            currentValue: parseFloat(row['Current Value']) || 0,
            status: row['Status'] || 'AVAILABLE',
            certificateStatus: 'PENDING',
          };

          await tx.diamondItem.upsert({
            where: { itemCode: String(itemCode) },
            update: data,
            create: { ...data, itemCode: String(itemCode) },
          });
          totalSuccess++;
        } catch (err: any) {
          errors.push(`[Diamonds] Row "${row['Item Code'] || '?'}": ${err.message}`);
        }
      }

      // ── 5. Import Certificates ───────────────────────────────────────
      const certRows = readSheet('Certificates');
      for (const row of certRows) {
        try {
          const reportNumber = row['Report Number'];
          if (!reportNumber) continue;

          // Try to find linked diamond by Item Code
          let diamondItemId: string | null = null;
          if (row['Item Code']) {
            const diamond = await tx.diamondItem.findUnique({ where: { itemCode: String(row['Item Code']) } });
            if (diamond) diamondItemId = diamond.id;
          }

          // Check if cert with this report number already exists
          const existing = await tx.certification.findFirst({ where: { reportNumber: String(reportNumber) } });
          if (existing) {
            await tx.certification.update({
              where: { id: existing.id },
              data: {
                labType: row['Lab Type'] || existing.labType,
                certificateStatus: row['Status'] || existing.certificateStatus,
                cost: row['Cost'] != null ? parseFloat(row['Cost']) : undefined,
                diamondItemId: diamondItemId || existing.diamondItemId,
              },
            });
          } else {
            await tx.certification.create({
              data: {
                reportNumber: String(reportNumber),
                labType: row['Lab Type'] || '',
                certificateStatus: row['Status'] || 'PENDING',
                cost: row['Cost'] != null ? parseFloat(row['Cost']) : 0,
                diamondItemId,
              },
            });
          }
          totalSuccess++;
        } catch (err: any) {
          errors.push(`[Certificates] Row "${row['Report Number'] || '?'}": ${err.message}`);
        }
      }

      // ── 6. Import Repairs ─────────────────────────────────────────────
      const repairRows = readSheet('Repairs');
      for (const row of repairRows) {
        try {
          if (!row['Item Code']) continue;
          const diamond = await tx.diamondItem.findUnique({ where: { itemCode: String(row['Item Code']) } });
          if (!diamond) throw new Error(`Diamond "${row['Item Code']}" not found`);

          // Find vendor party
          let vendorId: string | undefined;
          if (row['Vendor']) {
            const vendor = await tx.party.findFirst({ where: { name: String(row['Vendor']) } });
            if (vendor) vendorId = vendor.id;
          }
          if (!vendorId) {
            const code = `WS-${String(row['Vendor'] || 'UNKNOWN').toUpperCase().replace(/\s+/g, '_').substring(0, 10)}`;
            let party = await tx.party.findUnique({ where: { partyCode: code } });
            if (!party) {
              party = await tx.party.create({ data: { partyCode: code, name: String(row['Vendor'] || 'Unknown Workshop'), partyType: 'WORKSHOP' } });
            }
            vendorId = party.id;
          }

          await tx.repair.create({
            data: {
              diamondItemId: diamond.id,
              repairType: row['Repair Type'] || 'OTHER',
              vendorPartyId: vendorId,
              dateSent: new Date(),
              caratBefore: diamond.carat,
              cost: row['Cost'] != null ? parseFloat(row['Cost']) : 0,
              status: row['Status'] || 'IN_PROGRESS',
            },
          });
          totalSuccess++;
        } catch (err: any) {
          errors.push(`[Repairs] Row "${row['Item Code'] || '?'}": ${err.message}`);
        }
      }

      // ── 7. Import Transactions ────────────────────────────────────────
      const txnRows = readSheet('Transactions');
      const importedTxnIds: string[] = [];
      for (const row of txnRows) {
        try {
          const transactionNo = row['Transaction No'] || row['Transaction Number'] || row['Txn No'];
          if (!transactionNo) continue;

          // Resolve ledger
          let ledger = null;
          if (row['Ledger Name']) {
            ledger = await tx.ledger.findFirst({ where: { name: String(row['Ledger Name']) } });
          }
          if (!ledger && row['Stock Code']) {
            const stock = await tx.stock.findUnique({ where: { stockCode: String(row['Stock Code']) } });
            if (stock) {
              ledger = await tx.ledger.findFirst({ where: { stockId: stock.id } });
            }
          }
          if (!ledger) {
            ledger = await tx.ledger.findFirst();
          }
          if (!ledger) {
            const defStock = await tx.stock.findFirst() || await tx.stock.create({
              data: { stockCode: 'MAIN', name: 'Main Inventory', currency: 'INR' }
            });
            ledger = await tx.ledger.create({
              data: { stockId: defStock.id, name: `${defStock.name} Ledger`, ledgerType: 'DEFAULT' }
            });
          }

          // Resolve party
          let partyId: string | null = null;
          if (row['Party Code']) {
            const party = await tx.party.findUnique({ where: { partyCode: String(row['Party Code']) } });
            if (party) partyId = party.id;
          }

          const existingTxn = await tx.transaction.findUnique({
            where: { transactionNo: String(transactionNo) }
          });

          const txnDate = row['Transaction Date'] ? new Date(row['Transaction Date']) : new Date();
          const validDate = isNaN(txnDate.getTime()) ? new Date() : txnDate;

          const lastSeq = await tx.transaction.findFirst({
            where: { ledgerId: ledger.id },
            orderBy: { sequenceNumber: 'desc' }
          });
          const sequenceNumber = (lastSeq?.sequenceNumber || 0) + 1;

          const txnData = {
            ledgerId: ledger.id,
            transactionDate: validDate,
            transactionType: row['Transaction Type'] || 'PURCHASE',
            status: row['Status'] || 'POSTED',
            partyId,
            referenceNo: row['Reference No'] ? String(row['Reference No']) : null,
            remarks: row['Remarks'] ? String(row['Remarks']) : null,
            brokeragePercentage: row['Brokerage (%)'] != null ? parseFloat(row['Brokerage (%)']) : 0,
            brokerageAmount: row['Brokerage (₹)'] != null ? parseFloat(row['Brokerage (₹)']) : 0,
            brokerageType: row['Brokerage Type'] ? String(row['Brokerage Type']).trim().toUpperCase() : 'INCLUSIVE',
            paymentStatus: row['Payment Status'] || 'COMPLETED',
            paymentDone: parseFloat(row['Payment Done']) || parseFloat(row['Debit Value (Dr ₹)']) || 0,
            paymentDue: parseFloat(row['Payment Due']) || 0,
            createdBy: 'import',
          };

          let currentTxnId: string;
          if (existingTxn) {
            currentTxnId = existingTxn.id;
            await tx.transaction.update({
              where: { id: existingTxn.id },
              data: txnData,
            });
          } else {
            const created = await tx.transaction.create({
              data: {
                ...txnData,
                transactionNo: String(transactionNo),
                sequenceNumber,
              },
            });
            currentTxnId = created.id;
          }
          importedTxnIds.push(currentTxnId);

          // Support optional inline item details in Transactions row
          if (row['Item Code']) {
            const diamond = await tx.diamondItem.findUnique({ where: { itemCode: String(row['Item Code']) } });
            if (diamond) {
              const existingItem = await tx.transactionItem.findFirst({
                where: { transactionId: currentTxnId, diamondItemId: diamond.id }
              });
              const carat = parseFloat(row['Item Carat']) || Number(diamond.carat);
              const ratePerCarat = parseFloat(row['Item Rate']) || Number(diamond.ratePerCarat);
              const totalValue = parseFloat(row['Item Value']) || (Number(carat) * Number(ratePerCarat));
              const itemAction = row['Item Action'] || (txnData.transactionType === 'SALE' ? 'OUT' : 'IN');

              if (existingItem) {
                await tx.transactionItem.update({
                  where: { id: existingItem.id },
                  data: { carat, ratePerCarat, totalValue, itemAction },
                });
              } else {
                await tx.transactionItem.create({
                  data: {
                    transactionId: currentTxnId,
                    diamondItemId: diamond.id,
                    quantity: 1,
                    carat,
                    ratePerCarat,
                    totalValue,
                    itemAction,
                  },
                });
              }
            }
          }

          totalSuccess++;
        } catch (err: any) {
          errors.push(`[Transactions] Row "${row['Transaction No'] || '?'}": ${err.message}`);
        }
      }

      // ── 8. Import Transaction Items Sheet ─────────────────────────────
      const txnItemRows = readSheet('Transaction Items');
      for (const row of txnItemRows) {
        try {
          const transactionNo = row['Transaction No'];
          const itemCode = row['Item Code'];
          if (!transactionNo || !itemCode) continue;

          const txn = await tx.transaction.findUnique({ where: { transactionNo: String(transactionNo) } });
          if (!txn) throw new Error(`Transaction "${transactionNo}" not found`);

          const diamond = await tx.diamondItem.findUnique({ where: { itemCode: String(itemCode) } });
          if (!diamond) throw new Error(`Diamond item "${itemCode}" not found`);

          const existingItem = await tx.transactionItem.findFirst({
            where: { transactionId: txn.id, diamondItemId: diamond.id }
          });

          const carat = parseFloat(row['Carat']) || Number(diamond.carat);
          const ratePerCarat = parseFloat(row['Rate Per Carat']) || Number(diamond.ratePerCarat);
          const totalValue = parseFloat(row['Total Value']) || (Number(carat) * Number(ratePerCarat));
          const quantity = parseFloat(row['Quantity']) || 1;
          const itemAction = row['Item Action'] || 'IN';

          if (existingItem) {
            await tx.transactionItem.update({
              where: { id: existingItem.id },
              data: { quantity, carat, ratePerCarat, totalValue, itemAction },
            });
          } else {
            await tx.transactionItem.create({
              data: {
                transactionId: txn.id,
                diamondItemId: diamond.id,
                quantity,
                carat,
                ratePerCarat,
                totalValue,
                itemAction,
              },
            });
          }
          totalSuccess++;
        } catch (err: any) {
          errors.push(`[Transaction Items] Row "${row['Transaction No'] || '?'}-${row['Item Code'] || '?'}": ${err.message}`);
        }
      }

      // ── 9. Auto-Generate Movements & Financial Entries for Complete Integrity ────────
      for (const txnId of importedTxnIds) {
        try {
          const txn = await tx.transaction.findUnique({
            where: { id: txnId },
            include: { items: { include: { diamondItem: true } }, ledger: true }
          });
          if (!txn) continue;

          // Auto-generate movements if missing
          const existingMovements = await tx.inventoryMovement.count({ where: { transactionId: txn.id } });
          if (existingMovements === 0) {
            for (const item of txn.items) {
              await tx.inventoryMovement.create({
                data: {
                  diamondItemId: item.diamondItemId,
                  transactionId: txn.id,
                  movementType: txn.transactionType,
                  fromStockId: item.itemAction === 'OUT' ? txn.ledger.stockId : null,
                  toStockId: item.itemAction === 'IN' ? txn.ledger.stockId : null,
                  fromLocationId: item.itemAction === 'OUT' ? item.diamondItem.locationId : null,
                  toLocationId: item.itemAction === 'IN' ? item.diamondItem.locationId : null,
                  caratMoved: item.carat,
                  quantity: item.quantity,
                  movementDate: txn.transactionDate,
                  reason: txn.remarks || `Imported ${txn.transactionType}`,
                  createdBy: 'import',
                }
              });
            }
          }

          // Auto-generate double-entry financial entries if missing
          const existingFin = await tx.financialEntry.count({ where: { transactionId: txn.id } });
          if (existingFin === 0 && txn.items.length > 0) {
            const totalVal = txn.items.reduce((sum, it) => sum + Number(it.totalValue || 0), 0);
            await tx.financialEntry.create({
              data: {
                transactionId: txn.id,
                partyId: txn.partyId,
                entryType: txn.transactionType,
                debit: txn.transactionType === 'PURCHASE' ? totalVal : 0,
                credit: txn.transactionType === 'SALE' ? totalVal : 0,
                amount: totalVal,
                currency: 'INR',
                description: txn.remarks || `${txn.transactionType} ${txn.transactionNo}`,
              }
            });
          }
        } catch (postErr) {
          console.warn('[Import] Post-reconciliation warning:', postErr);
        }
      }

      
      });
      // ── Response ─────────────────────────────────────────────────────
      if (errors.length > 0 && totalSuccess === 0) {
        res.status(400).json({ success: false, message: `Import failed. ${errors.length} errors:\n${errors.join('\n')}` });
        return;
      }

      res.json({
        success: true,
        message: `Imported ${totalSuccess} records successfully.${errors.length > 0 ? ` ${errors.length} rows had errors.` : ''}`,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      next(error);
    }
  };
}

