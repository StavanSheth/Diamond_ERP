import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { Prisma } from '@prisma/client';

export class PartyController {
  
  getParties = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
      const take = req.query.take ? parseInt(req.query.take as string, 10) : 1000;

      const [total, parties] = await prisma.$transaction([
        prisma.party.count(),
        prisma.party.findMany({
          skip,
          take,
          include: {
            transactions: true,
            repairs: true,
            financialEntries: true
          }
        })
      ]);
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
          id: p.id,
          partyId: p.id,
          name: p.name,
          partyName: p.name,
          type: p.partyType,
          partyType: p.partyType,
          partyCode: p.partyCode,
          nickname: p.partyCode,
          phone: p.phone || '',
          email: p.email || '',
          address: p.address || '',
          brokeragePercentage: p.brokeragePercentage ? Number(p.brokeragePercentage) : 0,
          outstandingBalance,
          lastTxDate,
          notes: ''
        };
      });
      res.json({ success: true, data: mapped, total });
    } catch (error) {
      next(error);
    }
  };

  createParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawCode = req.body.partyCode || req.body.nickname;
      const partyCode = rawCode ? rawCode.toUpperCase().replace(/\s+/g, '_') : `PTY-${Date.now()}`;
      
      // Check for duplicate party code
      const existing = await prisma.party.findUnique({ where: { partyCode } });
      if (existing) {
        res.status(409).json({ success: false, error: `A party with code "${partyCode}" already exists.` });
        return;
      }

      const party = await prisma.party.create({
        data: {
          partyCode,
          name: req.body.partyName || req.body.name,
          partyType: req.body.type || req.body.partyType || 'OTHER',
          phone: req.body.phone,
          email: req.body.email,
          address: req.body.address,
          brokeragePercentage: req.body.brokeragePercentage ? parseFloat(req.body.brokeragePercentage) : 0,
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
      const data: Prisma.PartyUpdateInput = {
        name: req.body.partyName || req.body.name,
        partyType: req.body.type || req.body.partyType,
        phone: req.body.phone,
        email: req.body.email,
        address: req.body.address,
      };
      if (req.body.brokeragePercentage !== undefined) {
        data.brokeragePercentage = req.body.brokeragePercentage ? parseFloat(req.body.brokeragePercentage) : 0;
      }

      const party = await prisma.party.update({
        where: { id },
        data
      });
      res.json({ success: true, data: party });
    } catch (error) {
      next(error);
    }
  };

  deleteParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const existing = await prisma.party.findUnique({
        where: { id },
        include: {
          transactions: { select: { id: true }, take: 1 },
          repairs: { select: { id: true }, take: 1 },
          financialEntries: { select: { id: true }, take: 1 }
        }
      });

      if (!existing) {
        res.status(404).json({ success: false, error: 'Party not found' });
        return;
      }

      if (existing.transactions.length > 0 || existing.repairs.length > 0 || existing.financialEntries.length > 0) {
        res.status(400).json({ 
          success: false, 
          error: 'Cannot delete party because it has existing transactions, financial entries, or repairs attached to it. Please archive or deactivate instead.' 
        });
        return;
      }

      await prisma.party.delete({
        where: { id }
      });
      res.json({ success: true, message: 'Party deleted successfully' });
    } catch (error) {
      next(error);
    }
  };
}
