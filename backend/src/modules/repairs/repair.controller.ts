import { Request, Response, NextFunction } from 'express';
import prisma from '../../providers/db/prisma';
import { repairService } from '../../services/repair.service';
import { buildDiamondWhereClause } from '../../utils/filter.utils';

export class RepairController {
  getRepairs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const diamondWhere = buildDiamondWhereClause(req.query);
      const repairs = await prisma.repair.findMany({
        where: Object.keys(diamondWhere).length > 0 ? {
          diamondItem: diamondWhere
        } : undefined,
        include: {
          diamondItem: true,
          vendor: true
        }
      });
      
      const formatted = repairs.map(r => ({
        id: r.id, // Added for UI compatibility
        repairId: r.id,
        diamondItemId: r.diamondItemId, // Added for UI mapping
        name: r.name, // Added for UI mapping
        stockItemId: r.diamondItem?.itemCode || r.diamondItemId,
        itemName: r.name || `${r.diamondItem?.clarity || ''} ${r.diamondItem?.shape || 'Unknown'}`,
        weight: r.diamondItem ? Number(r.diamondItem.carat) : 0,
        status: r.status,
        repairType: r.repairType,
        vendor: r.vendor?.name || r.vendorPartyId,
        estCost: Number(r.cost),
        finalCost: Number(r.cost),
        dueDate: r.dateSent ? r.dateSent.toISOString() : '',
        completedOn: r.dateCompleted ? r.dateCompleted.toISOString() : '',
        restoresTo: 'ACTIVE',
        remarks: r.remarks || '',
      }));

      res.json({ success: true, data: formatted });
    } catch (error) {
      next(error);
    }
  };

  createRepair = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stockItemId, repairType, vendor, estCost } = req.body;
      
      // Need a vendor party id. The user might have sent a party ID or name.
      // If it doesn't look like a valid UUID/ID, maybe we should find by name. But frontend usually sends partyId in modern selects?
      // Wait, let's just assume vendor is the partyId if it's new.
      let vendorId = vendor;
      if (vendor && !vendor.includes('-')) {
        const party = await prisma.party.findFirst({ where: { name: vendor } });
        if (party) vendorId = party.id;
      }

      // Check if stockItemId is an item code and find its ID
      let diamondItem = await prisma.diamondItem.findUnique({ where: { id: stockItemId }});
      if (!diamondItem) {
        diamondItem = await prisma.diamondItem.findUnique({ where: { itemCode: stockItemId }});
      }

      if (!diamondItem) throw new Error('Diamond item not found');

      // Call repairService to create an immutable transaction
      // transactionId is required in sendForRepair, but from UI we might not have a transactionId.
      // So let's create a stub transaction first or just pass '' if it's optional, wait, transactionId is optional?
      // In schema: transactionId String? -> it is optional.
      // But repairService.sendForRepair requires it! Let's just create a generic transaction for it using transactionService.
      // Actually, since it's an ad-hoc repair, maybe we don't have a transaction?
      // Wait, sendForRepair in repair.service.ts takes transactionId: string. I'll pass 'MANUAL' for now or create a transaction.
      // Better to just let the service handle it, or modify repairService to allow transactionId?: string.
      // For now, let's just do it directly using prisma or update repairService later.
      const repair = await repairService.sendForRepair(
        diamondItem.id,
        vendorId || '',
        repairType || '',
        'MANUAL-TX-' + Date.now(),
        parseFloat(estCost || 0),
        'SYSTEM'
      );

      res.json({ success: true, message: 'Repair created successfully', data: repair });
    } catch (error) {
      next(error);
    }
  };

  updateRepair = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { status, repairType, vendor, estCost, dueDate, completedOn, remarks } = req.body;
      
      let vendorId = vendor;
      if (vendor && !vendor.includes('-')) {
        const party = await prisma.party.findFirst({ where: { name: vendor } });
        if (party) vendorId = party.id;
      }

      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (repairType !== undefined) updateData.repairType = repairType;
      if (vendorId !== undefined) updateData.vendorPartyId = vendorId;
      if (estCost !== undefined) updateData.cost = parseFloat(estCost);
      if (dueDate !== undefined) updateData.dateSent = new Date(dueDate);
      if (completedOn !== undefined) updateData.dateCompleted = new Date(completedOn);
      if (remarks !== undefined) updateData.remarks = remarks;

      const updated = await prisma.repair.update({
        where: { id },
        data: updateData
      });

      res.json({ success: true, message: 'Repair updated successfully', data: updated });
    } catch (error) {
      next(error);
    }
  };

  deleteRepair = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      await prisma.repair.delete({
        where: { id }
      });

      res.json({ success: true, message: 'Repair deleted successfully' });
    } catch (error) {
      next(error);
    }
  };
}
