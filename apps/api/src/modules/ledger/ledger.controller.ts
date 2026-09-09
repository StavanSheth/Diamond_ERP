import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { transactionService } from '../transactions/transaction.service';

export class LedgerController {

  /**
   * GET /api/ledger
   * Returns all transactions with their items, ordered by date descending.
   */
  getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stockId, partyId, itemCode, paymentStatus, agingDays, paymentDirection } = req.query;
      
      const whereCondition: any = {};
      
      if (stockId) {
        whereCondition.ledger = { stockId: stockId as string };
      }
      if (partyId) {
        whereCondition.partyId = partyId as string;
      }
      if (itemCode) {
        whereCondition.items = {
          some: {
            diamondItem: {
              itemCode: itemCode as string
            }
          }
        };
      }
      if (paymentStatus) {
        whereCondition.paymentStatus = paymentStatus as string;
      }

      if (paymentDirection === 'RECEIVABLE' || paymentDirection === 'TO_COLLECT') {
        whereCondition.transactionType = 'SALE';
        whereCondition.paymentStatus = { not: 'COMPLETED' };
      } else if (paymentDirection === 'PAYABLE' || paymentDirection === 'TO_PAY') {
        whereCondition.transactionType = 'PURCHASE';
        whereCondition.paymentStatus = { not: 'COMPLETED' };
      }

      if (agingDays) {
        const days = parseInt(agingDays as string, 10);
        if (!isNaN(days) && days > 0) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          whereCondition.transactionDate = { lte: cutoff };
        }
      }

      const transactions = await prisma.transaction.findMany({
        where: whereCondition,
        include: {
          ledger: { include: { stock: true } },
          party: true,
          items: { include: { diamondItem: true } },
          inventoryMovements: true,
          financialEntries: true
        },
        orderBy: { transactionDate: 'desc' }
      });

      // Calculate running balances on the fly (since ledger might have many transactions)
      // Actually the prompt said "Running balances should preferably be calculated from an ordered transaction stream"
      let currentCaratBalance = 0;
      let currentValueBalance = 0;
      
      const transactionsAsc = [...transactions].reverse();
      const balancedTransactions = transactionsAsc.map(txn => {
        let caratIn = 0;
        let caratOut = 0;
        let valueIn = 0;
        let valueOut = 0;
        
        // Compute carat and value in/out from transaction items (TransactionItem stream)
        txn.items.forEach(item => {
          if (item.itemAction === 'IN') {
            caratIn += Number(item.carat);
            valueIn += Number(item.totalValue);
          } else if (item.itemAction === 'OUT') {
            caratOut += Number(item.carat);
            valueOut += Number(item.totalValue);
          }
        });

        currentCaratBalance = currentCaratBalance + caratIn - caratOut;
        currentValueBalance = currentValueBalance + valueIn - valueOut;
        return {
          ...txn,
          caratIn,
          caratOut,
          valueIn,
          valueOut,
          balanceCarat: currentCaratBalance,
          balanceValue: currentValueBalance,
          itemsCount: txn.items.length
        };
      });

      // Reverse back for display
      balancedTransactions.reverse();

      res.json({ success: true, data: balancedTransactions });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/ledger
   * Create a transaction using TransactionService.
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = req.body;
      
      let targetLedgerId = payload.ledgerId;
      if (!targetLedgerId && payload.stockId) {
        const ledger = await prisma.ledger.findFirst({ where: { stockId: payload.stockId } });
        if (ledger) targetLedgerId = ledger.id;
      }
      if (!targetLedgerId) {
        const firstLedger = await prisma.ledger.findFirst();
        if (firstLedger) targetLedgerId = firstLedger.id;
      }

      const normalizedItems = (payload.items || []).map((item: any) => ({
        ...item,
        carat: item.carat != null ? item.carat : (item.caratWeight != null ? item.caratWeight : 0),
        totalValue: item.totalValue != null ? item.totalValue : (Number(item.carat || item.caratWeight || 0) * Number(item.ratePerCarat || item.caratRate || 0)),
      }));

      const totalCarat = payload.totalCarat != null
        ? Number(payload.totalCarat)
        : normalizedItems.reduce((sum: number, item: any) => sum + Number(item.carat || 0), 0);

      const totalValue = payload.totalValue != null
        ? Number(payload.totalValue)
        : normalizedItems.reduce((sum: number, item: any) => sum + Number(item.totalValue || 0), 0);

      const transaction = await transactionService.createTransaction({
        ledgerId: targetLedgerId,
        transactionType: payload.transactionType || payload.txnType || payload.type || 'SALE',
        transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : new Date(),
        partyId: payload.partyId,
        remarks: payload.remarks,
        referenceNo: payload.referenceNo,
        createdBy: (req as any).user?.username || payload.createdBy || 'system',
        paymentStatus: payload.paymentStatus || 'PENDING',
        paymentDone: payload.paymentDone ? parseFloat(payload.paymentDone) : 0,
        paymentDue: payload.paymentDue ? parseFloat(payload.paymentDue) : 0,
        brokeragePercentage: payload.brokeragePercentage ? parseFloat(payload.brokeragePercentage) : 0,
        brokerageAmount: payload.brokerageAmount ? parseFloat(payload.brokerageAmount) : 0,
        brokerageType: payload.brokerageType || 'INCLUSIVE',
        totalCarat,
        totalValue,
        items: normalizedItems
      });

      res.json({ success: true, data: transaction });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/ledger/:id
   * Soft deletes a transaction. Wait, rule 1: "Never delete historical transactions. Use reversal/correction transactions."
   * For the API, we can either throw an error or implement a reverse. 
   */
  delete = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(400).json({ success: false, error: 'Historical transactions cannot be deleted. Please create a reversal transaction instead.' });
    } catch (err) {
      next(err);
    }
  }

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const payload = req.body;
      const mappedPayload = {
        ...payload,
        ledgerId: payload.ledgerId,
        transactionType: payload.txnType || payload.transactionType,
        transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : undefined,
        partyId: payload.partyId,
        paymentStatus: payload.paymentStatus,
        paymentDone: payload.paymentDone !== undefined ? parseFloat(payload.paymentDone) : undefined,
        paymentDue: payload.paymentDue !== undefined ? parseFloat(payload.paymentDue) : undefined,
        brokeragePercentage: payload.brokeragePercentage !== undefined ? parseFloat(payload.brokeragePercentage) : undefined,
        brokerageAmount: payload.brokerageAmount !== undefined ? parseFloat(payload.brokerageAmount) : undefined,
        brokerageType: payload.brokerageType || undefined,
        expectedVersion: payload.version !== undefined ? parseInt(payload.version, 10) : undefined,
      };
      const transaction = await transactionService.updateTransaction(id, mappedPayload as any);
      res.json({ success: true, data: transaction });
    } catch (err) {
      next(err);
    }
  }

  getParties = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parties = await prisma.party.findMany();
      res.json({ success: true, data: parties });
    } catch (err) {
      next(err);
    }
  }

  getStockNames = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stocks = await prisma.stock.findMany();
      res.json({ success: true, data: stocks });
    } catch (err) {
      next(err);
    }
  }

  getPaymentSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stockId, partyId, itemCode, agingDays } = req.query;
      const whereCondition: any = {};
      
      if (stockId) {
        whereCondition.ledger = { stockId: stockId as string };
      }
      if (partyId) {
        whereCondition.partyId = partyId as string;
      }
      if (itemCode) {
        whereCondition.items = {
          some: { diamondItem: { itemCode: itemCode as string } }
        };
      }

      const now = new Date();
      if (agingDays) {
        const days = parseInt(agingDays as string, 10);
        if (!isNaN(days) && days > 0) {
          const cutoff = new Date(now);
          cutoff.setDate(cutoff.getDate() - days);
          whereCondition.transactionDate = { lte: cutoff };
        }
      }

      const purchases = await prisma.transaction.findMany({
        where: { ...whereCondition, transactionType: 'PURCHASE' },
        select: { paymentDue: true, paymentDone: true, transactionDate: true, items: { select: { totalValue: true } } }
      });
      const sales = await prisma.transaction.findMany({
        where: { ...whereCondition, transactionType: 'SALE' },
        select: { paymentDue: true, paymentDone: true, transactionDate: true, items: { select: { totalValue: true } } }
      });

      const calcLegacy = (t: any) => {
        const pd = Number(t.paymentDue || 0);
        const pdo = Number(t.paymentDone || 0);
        if (pd === 0 && pdo === 0) {
          return t.items.reduce((sum: number, i: any) => sum + Number(i.totalValue || 0), 0);
        }
        return pd;
      };

      const payableDue = purchases.reduce((s, t) => s + calcLegacy(t), 0);
      const payablePaid = purchases.reduce((s, t) => s + Number(t.paymentDone || 0), 0);
      
      const receivableDue = sales.reduce((s, t) => s + calcLegacy(t), 0);
      const receivableCollected = sales.reduce((s, t) => s + Number(t.paymentDone || 0), 0);

      // Compute aging breakdown for over 15, 30, 45, 60 days
      const getOverdue = (txns: any[], days: number) => {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        return txns
          .filter(t => new Date(t.transactionDate) <= cutoff)
          .reduce((s, t) => s + calcLegacy(t), 0);
      };

      res.json({
        success: true,
        data: {
          payableDue,
          payablePaid,
          receivableDue,
          receivableCollected,
          aging: {
            receivable: {
              over15: getOverdue(sales, 15),
              over30: getOverdue(sales, 30),
              over45: getOverdue(sales, 45),
              over60: getOverdue(sales, 60),
            },
            payable: {
              over15: getOverdue(purchases, 15),
              over30: getOverdue(purchases, 30),
              over45: getOverdue(purchases, 45),
              over60: getOverdue(purchases, 60),
            }
          }
        }
      });
    } catch (err) {
      next(err);
    }
  };
}
