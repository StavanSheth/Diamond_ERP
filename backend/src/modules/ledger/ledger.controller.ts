import { Request, Response, NextFunction } from 'express';
import prisma from '../../providers/db/prisma';
import { transactionService } from '../../services/transaction.service';

export class LedgerController {

  /**
   * GET /api/ledger
   * Returns all transactions with their items, ordered by date descending.
   */
  getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stockId, partyId, itemCode, paymentStatus } = req.query;
      
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
  }

  /**
   * POST /api/ledger
   * Create a transaction using TransactionService.
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = req.body;
      // Map payload to CreateTransactionPayload
      const transaction = await transactionService.createTransaction({
        ledgerId: payload.ledgerId,
        transactionType: payload.txnType,
        transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : new Date(),
        partyId: payload.partyId,
        remarks: payload.remarks,
        referenceNo: payload.referenceNo,
        createdBy: payload.createdBy || 'system',
        totalCarat: payload.totalCarat || (payload.items || []).reduce((sum: number, item: any) => sum + Number(item.carat || 0), 0),
        totalValue: payload.totalValue || (payload.items || []).reduce((sum: number, item: any) => sum + Number(item.totalValue || 0), 0),
        items: payload.items || []
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
      const transaction = await transactionService.updateTransaction(id, payload);
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
      const { stockId, partyId, itemCode } = req.query;
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

      const purchases = await prisma.transaction.findMany({
        where: { ...whereCondition, transactionType: 'PURCHASE' },
        select: { paymentDue: true, paymentDone: true, items: { select: { totalValue: true } } }
      });
      const sales = await prisma.transaction.findMany({
        where: { ...whereCondition, transactionType: 'SALE' },
        select: { paymentDue: true, paymentDone: true, items: { select: { totalValue: true } } }
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

      res.json({
        success: true,
        data: {
          payableDue,
          payablePaid,
          receivableDue,
          receivableCollected
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
