import { Request, Response, NextFunction } from 'express';
import prisma from '../../providers/db/prisma';

export class PartyController {
  
  getParties = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parties = await prisma.party.findMany({
        include: {
          transactions: true,
          repairs: true,
          financialEntries: true
        }
      });
      const mapped = parties.map(p => {
        let outstandingBalance = 0;
        let lastTxDate = p.updatedAt;

        if (p.transactions.length > 0) {
          const latestTx = p.transactions.sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime())[0];
          lastTxDate = latestTx.transactionDate;
        } else if (p.repairs.length > 0) {
          const latestRepair = p.repairs.sort((a, b) => (b.dateSent?.getTime() || 0) - (a.dateSent?.getTime() || 0))[0];
          if (latestRepair.dateSent) {
            lastTxDate = latestRepair.dateSent;
          }
        }

        // outstanding balance is sum of credit - debit for suppliers? 
        // Actually, let's just do sum(credit) - sum(debit). If it's > 0, we owe them. If it's < 0, they owe us.
        // Wait, for CUSTOMER, debit is what they owe us. So Customer Balance = sum(debit) - sum(credit)
        // For SUPPLIER, credit is what we owe them. So Supplier Balance = sum(credit) - sum(debit)
        if (p.partyType === 'SUPPLIER') {
          outstandingBalance = p.financialEntries.reduce((acc, fe) => acc + Number(fe.credit) - Number(fe.debit), 0);
        } else if (p.partyType === 'CUSTOMER') {
          outstandingBalance = p.financialEntries.reduce((acc, fe) => acc + Number(fe.debit) - Number(fe.credit), 0);
        } else if (p.partyType === 'WORKSHOP') {
          // For workshops, balance might be pending repair costs
          outstandingBalance = p.repairs.filter(r => r.status !== 'COMPLETED').reduce((acc, r) => acc + Number(r.cost), 0);
        }

        return {
          partyId: p.id,
          partyName: p.name,
          type: p.partyType,
          nickname: p.partyCode,
          phone: p.phone || '',
          email: p.email || '',
          outstandingBalance,
          lastTxDate,
          notes: ''
        };
      });
      res.json({ success: true, data: mapped });
    } catch (error) {
      next(error);
    }
  };

  createParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const party = await prisma.party.create({
        data: {
          partyCode: req.body.nickname?.toUpperCase().replace(/\s+/g, '_') || `PTY-${Date.now()}`,
          name: req.body.partyName,
          partyType: req.body.type || 'OTHER',
          phone: req.body.phone,
          email: req.body.email,
        }
      });
      res.status(201).json({ success: true, data: party });
    } catch (error) {
      next(error);
    }
  };

  updateParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const party = await prisma.party.update({
        where: { id },
        data: {
          name: req.body.partyName,
          partyType: req.body.type,
          phone: req.body.phone,
          email: req.body.email,
        }
      });
      res.json({ success: true, data: party });
    } catch (error) {
      next(error);
    }
  };

  deleteParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      await prisma.party.delete({
        where: { id }
      });
      res.json({ success: true, message: 'Party deleted' });
    } catch (error) {
      next(error);
    }
  };
}
