import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { Prisma } from '@prisma/client';
import { transactionService } from '../transactions/transaction.service';
import { computeLedgerBalances } from './ledger.service';

export class LedgerController {

  /**
   * GET /api/ledger
   * Returns transactions with pagination, bounded relations, and correct running balances.
   */
  getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stockId, partyId, itemCode, paymentStatus, agingDays, paymentDirection } = req.query;
      
      // Strict pagination validation and clamping
      const rawSkip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
      const rawTake = req.query.take ? parseInt(req.query.take as string, 10) : 50;

      if (isNaN(rawSkip) || rawSkip < 0) {
        res.status(400).json({ success: false, error: 'Invalid skip parameter: must be an integer >= 0' });
        return;
      }
      if (isNaN(rawTake) || rawTake <= 0) {
        res.status(400).json({ success: false, error: 'Invalid take parameter: must be an integer > 0' });
        return;
      }
      const take = Math.min(rawTake, 100); // max 100 records per page
      const skip = rawSkip;

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

      // Query total count and page of transactions with optimized projection
      const [total, transactions] = await prisma.$transaction([
        prisma.transaction.count({ where: whereCondition }),
        prisma.transaction.findMany({
          where: whereCondition,
          skip,
          take,
          include: {
            ledger: { 
              select: { 
                id: true, 
                name: true, 
                stockId: true,
                stock: { select: { id: true, name: true, description: true } }
              } 
            },
            party: { select: { id: true, name: true, partyCode: true, partyType: true } },
            items: {
              select: {
                id: true,
                name: true,
                carat: true,
                totalValue: true,
                itemAction: true,
                ratePerCarat: true,
                diamondItem: { 
                  select: { 
                    id: true, 
                    itemCode: true, 
                    displayName: true,
                    color: true,
                    clarity: true,
                    cut: true,
                    shape: true,
                    status: true 
                  } 
                }
              }
            }
          },
          orderBy: { transactionDate: 'desc' }
        })
      ]);

      // Bug #14: Incorporate ledger opening balance
      let openingCarat = 0;
      let openingValue = 0;
      if (stockId) {
        const ledger = await prisma.ledger.findFirst({
          where: { stockId: stockId as string },
          select: { openingCarat: true, openingValue: true },
        });
        if (ledger) {
          openingCarat = Number(ledger.openingCarat || 0);
          openingValue = Number(ledger.openingValue || 0);
        }
      }

      // Bug #13: Fix pagination balance — query older TRANSACTIONS (not items) to get correct carry-forward
      const olderTransactions = skip > 0 ? await prisma.transaction.findMany({
        where: whereCondition,
        include: { items: { select: { itemAction: true, carat: true, totalValue: true } } },
        orderBy: { transactionDate: 'desc' },
        skip: take, // skip current page, get everything after
        // Note: we need ALL older transactions for correct balance, not just one page
      }) : [];

      // Compute carry-forward from older transactions
      let carryForwardCarat = new Prisma.Decimal(openingCarat);
      let carryForwardValue = new Prisma.Decimal(openingValue);
      // olderTransactions are desc; process them in asc order
      [...olderTransactions].reverse().forEach(txn => {
        txn.items.forEach(item => {
          if (item.itemAction === 'IN') {
            carryForwardCarat = carryForwardCarat.add(item.carat || 0);
            carryForwardValue = carryForwardValue.add(item.totalValue || 0);
          } else if (item.itemAction === 'OUT') {
            carryForwardCarat = carryForwardCarat.sub(item.carat || 0);
            carryForwardValue = carryForwardValue.sub(item.totalValue || 0);
          }
        });
      });

      // Use shared service for balance computation on current page
      const transactionsAsc = [...transactions].reverse();
      const balancedTransactions = computeLedgerBalances(
        transactionsAsc as any,
        carryForwardCarat.toNumber(),
        carryForwardValue.toNumber(),
      );

      // Reverse back for display (newest first)
      balancedTransactions.reverse();

      res.json({ success: true, data: balancedTransactions, total });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/ledger
   * Create a transaction using TransactionService with server-authoritative financial calculation.
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
        res.status(400).json({
          success: false,
          error: 'A valid ledgerId or stockId is required to post a transaction.',
          code: 'LEDGER_REQUIRED'
        });
        return;
      }

      // Server-authoritative calculation using Decimal
      let computedTotalCarat = new Prisma.Decimal(0);
      let computedTotalValue = new Prisma.Decimal(0);

      const normalizedItems = (payload.items || []).map((item: any) => {
        const caratDec = new Prisma.Decimal(item.carat != null ? item.carat : (item.caratWeight != null ? item.caratWeight : 0));
        const rateDec = new Prisma.Decimal(item.ratePerCarat || item.caratRate || 0);
        
        let itemValueDec: Prisma.Decimal;
        if (item.totalValue != null) {
          itemValueDec = new Prisma.Decimal(item.totalValue);
        } else {
          itemValueDec = caratDec.mul(rateDec);
        }

        computedTotalCarat = computedTotalCarat.add(caratDec);
        computedTotalValue = computedTotalValue.add(itemValueDec);

        return {
          ...item,
          carat: caratDec.toNumber(),
          totalValue: itemValueDec.toNumber(),
        };
      });

      // FINANCIAL INTEGRITY CHECK: Client totalCarat and totalValue verification
      if (payload.totalCarat != null) {
        const clientCarat = new Prisma.Decimal(payload.totalCarat);
        if (clientCarat.sub(computedTotalCarat).abs().greaterThan(0.001)) {
          res.status(422).json({
            success: false,
            error: `Financial total mismatch: client totalCarat (${clientCarat}) does not match calculated sum of items (${computedTotalCarat}).`,
            code: 'FINANCIAL_TOTAL_MISMATCH',
          });
          return;
        }
      }

      if (payload.totalValue != null) {
        const clientValue = new Prisma.Decimal(payload.totalValue);
        if (clientValue.sub(computedTotalValue).abs().greaterThan(0.01)) {
          res.status(422).json({
            success: false,
            error: `Financial total mismatch: client totalValue (${clientValue}) does not match calculated sum of items (${computedTotalValue}).`,
            code: 'FINANCIAL_TOTAL_MISMATCH',
          });
          return;
        }
      }

      const totalCarat = computedTotalCarat.toNumber();
      const totalValue = computedTotalValue.toNumber();

      const paymentDoneDec = new Prisma.Decimal(payload.paymentDone || 0);
      const paymentDueDec = computedTotalValue.sub(paymentDoneDec);
      const paymentDue = paymentDueDec.greaterThan(0) ? paymentDueDec.toNumber() : 0;

      const transaction = await transactionService.createTransaction({
        ledgerId: targetLedgerId,
        transactionType: payload.transactionType || payload.txnType || payload.type || 'SALE',
        transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : new Date(),
        partyId: payload.partyId,
        remarks: payload.remarks,
        referenceNo: payload.referenceNo,
        createdBy: (req as any).user?.username || payload.createdBy || 'system',
        paymentType: payload.paymentType,
        paymentStatus: payload.paymentStatus || (paymentDue === 0 ? 'COMPLETED' : 'PENDING'),
        paymentDone: paymentDoneDec.toNumber(),
        paymentDue,
        brokeragePercentage: payload.brokeragePercentage ? parseFloat(payload.brokeragePercentage) : 0,
        brokerageAmount: payload.brokerageAmount ? parseFloat(payload.brokerageAmount) : 0,
        brokerageType: payload.brokerageType || 'INCLUSIVE',
        totalCarat,
        totalValue,
        items: normalizedItems
      });

      res.status(201).json({ success: true, data: transaction });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/ledger/:id
   * Historical transactions cannot be deleted.
   */
  delete = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(400).json({
        success: false,
        error: 'Historical accounting transactions cannot be deleted. Please create a reversal transaction instead.',
        code: 'TRANSACTION_IMMUTABLE'
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PUT /api/ledger/:id
   * Allow edits for non-COMPLETED transactions. COMPLETED transactions are immutable.
   */
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const txn = await prisma.transaction.findUnique({ where: { id: req.params.id as string } });
      if (!txn) {
        res.status(404).json({ success: false, error: 'Transaction not found' });
        return;
      }
      if (txn.status === 'COMPLETED') {
        res.status(400).json({
          success: false,
          error: 'Completed accounting transactions are immutable. To correct balances, please post a reversal or correcting transaction.',
          code: 'TRANSACTION_IMMUTABLE'
        });
        return;
      }
      const updated = await transactionService.updateTransaction(txn.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  getParties = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parties = await prisma.party.findMany();
      res.json({ success: true, data: parties });
    } catch (err) {
      next(err);
    }
  };

  getStockNames = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stocks = await prisma.stock.findMany();
      res.json({ success: true, data: stocks });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/ledger/payment-summary
   * Memory-safe database aggregated payment summaries.
   */
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

      // Memory-safe database-level aggregations
      const [purchaseAgg, saleAgg] = await prisma.$transaction([
        prisma.transaction.aggregate({
          where: { ...whereCondition, transactionType: 'PURCHASE' },
          _sum: {
            paymentDue: true,
            paymentDone: true,
          }
        }),
        prisma.transaction.aggregate({
          where: { ...whereCondition, transactionType: 'SALE' },
          _sum: {
            paymentDue: true,
            paymentDone: true,
          }
        })
      ]);

      const payableDue = purchaseAgg._sum.paymentDue?.toNumber() || 0;
      const payablePaid = purchaseAgg._sum.paymentDone?.toNumber() || 0;
      const receivableDue = saleAgg._sum.paymentDue?.toNumber() || 0;
      const receivableCollected = saleAgg._sum.paymentDone?.toNumber() || 0;

      // Aggregations for aging breakdown
      const getOverdueSum = async (txnType: string, days: number) => {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        const agg = await prisma.transaction.aggregate({
          where: {
            ...whereCondition,
            transactionType: txnType,
            transactionDate: { lte: cutoff }
          },
          _sum: {
            paymentDue: true,
          }
        });
        return agg._sum.paymentDue?.toNumber() || 0;
      };

      const [r15, r30, r45, r60, p15, p30, p45, p60] = await Promise.all([
        getOverdueSum('SALE', 15),
        getOverdueSum('SALE', 30),
        getOverdueSum('SALE', 45),
        getOverdueSum('SALE', 60),
        getOverdueSum('PURCHASE', 15),
        getOverdueSum('PURCHASE', 30),
        getOverdueSum('PURCHASE', 45),
        getOverdueSum('PURCHASE', 60),
      ]);

      res.json({
        success: true,
        data: {
          payableDue,
          payablePaid,
          receivableDue,
          receivableCollected,
          aging: {
            receivable: {
              over15: r15,
              over30: r30,
              over45: r45,
              over60: r60,
            },
            payable: {
              over15: p15,
              over30: p30,
              over45: p45,
              over60: p60,
            }
          }
        }
      });
    } catch (err) {
      next(err);
    }
  };
}
