import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { repairService } from '../repairs/repair.service';
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
          diamondItem: {
            include: {
              stock: true
            }
          },
          vendor: true
        }
      });
      
      const formatted = repairs.map(r => ({
        id: r.id, // Added for UI compatibility
        repairId: r.id,
        diamondItemId: r.diamondItemId, // Added for UI mapping
        name: r.name, // Added for UI mapping
        stockItemId: r.diamondItem?.itemCode || r.diamondItemId,
        stockName: r.diamondItem?.stock?.name || r.name || 'Diamond Stock',
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
      const { stockItemId, diamondItemId, repairType, vendor, estCost, name } = req.body;
      
      let vendorId = vendor;
      if (vendor) {
        const partyById = await prisma.party.findUnique({ where: { id: vendor } });
        if (partyById) {
          vendorId = partyById.id;
        } else {
          const partyByName = await prisma.party.findFirst({ where: { name: vendor } });
          if (partyByName) vendorId = partyByName.id;
        }
      }

      if (!vendorId) {
        res.status(400).json({ success: false, error: 'A valid workshop or vendor party is required to initiate a repair.' });
        return;
      }

      const stoneRef = diamondItemId || stockItemId;
      if (!stoneRef) {
        res.status(400).json({ success: false, error: 'A valid diamond stone reference is required to initiate a repair.' });
        return;
      }

      let diamondItem = await prisma.diamondItem.findUnique({ where: { id: stoneRef }});
      if (!diamondItem) {
        diamondItem = await prisma.diamondItem.findUnique({ where: { itemCode: stoneRef }});
      }

      if (!diamondItem) {
        res.status(404).json({ success: false, error: `Diamond item "${stoneRef}" was not found in inventory.` });
        return;
      }

      if (diamondItem.status === 'SOLD' || diamondItem.status === 'WRITTEN_OFF') {
        res.status(400).json({ success: false, error: `Cannot send stone "${diamondItem.itemCode}" for repair because its status is ${diamondItem.status}.` });
        return;
      }

      const repair = await repairService.sendForRepair(
        diamondItem.id,
        vendorId,
        repairType || 'Polishing',
        null,
        parseFloat(estCost || 0),
        'SYSTEM'
      );

      if (name) {
        await prisma.repair.update({
          where: { id: repair.id },
          data: { name }
        });
      }

      res.status(201).json({ success: true, message: 'Repair created successfully', data: repair });
    } catch (error) {
      next(error);
    }
  };

  updateRepair = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { status, repairType, vendor, estCost, dueDate, completedOn, remarks, caratAfter } = req.body;
      
      const currentRepair = await prisma.repair.findUnique({ where: { id } });
      if (!currentRepair) {
        res.status(404).json({ success: false, error: 'Repair record not found' });
        return;
      }

      let vendorId = vendor;
      if (vendor) {
        const partyById = await prisma.party.findUnique({ where: { id: vendor } });
        if (partyById) {
          vendorId = partyById.id;
        } else {
          const partyByName = await prisma.party.findFirst({ where: { name: vendor } });
          if (partyByName) vendorId = partyByName.id;
        }
      }

      let normalizedStatus = status;
      if (normalizedStatus === 'IN PROGRESS') normalizedStatus = 'IN_PROGRESS';

      const updateData: any = {};
      if (normalizedStatus !== undefined) updateData.status = normalizedStatus;
      if (repairType !== undefined) updateData.repairType = repairType;
      if (vendorId !== undefined) updateData.vendorPartyId = vendorId;
      if (estCost !== undefined) updateData.cost = parseFloat(estCost);
      if (dueDate !== undefined) updateData.dateSent = new Date(dueDate);
      if (completedOn !== undefined) updateData.dateCompleted = new Date(completedOn);
      if (remarks !== undefined) updateData.remarks = remarks;
      if (caratAfter !== undefined) updateData.caratAfter = parseFloat(caratAfter);

      const updated = await prisma.repair.update({
        where: { id },
        data: updateData
      });

      // Status transition handling for linked diamond
      if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'CANCELLED') {
        const diamondUpdateData: any = { status: 'AVAILABLE' };
        if (normalizedStatus === 'COMPLETED' && caratAfter) {
          diamondUpdateData.carat = parseFloat(caratAfter);
        }

        await prisma.diamondItem.update({
          where: { id: currentRepair.diamondItemId },
          data: diamondUpdateData
        });

        if (normalizedStatus === 'COMPLETED') {
          const diamond = await prisma.diamondItem.findUnique({ where: { id: currentRepair.diamondItemId } });
          await prisma.inventoryMovement.create({
            data: {
              diamondItemId: currentRepair.diamondItemId,
              movementType: 'REPAIR_IN',
              toStockId: diamond?.stockId,
              toLocationId: diamond?.locationId,
              caratMoved: caratAfter ? parseFloat(caratAfter) : currentRepair.caratBefore,
              quantity: 1,
              movementDate: completedOn ? new Date(completedOn) : new Date(),
              reason: remarks || 'Completed repair returned to available inventory',
              createdBy: 'SYSTEM'
            }
          });

          await prisma.itemEvent.create({
            data: {
              diamondItemId: currentRepair.diamondItemId,
              eventType: 'REPAIRED',
              eventDate: completedOn ? new Date(completedOn) : new Date(),
              partyId: currentRepair.vendorPartyId,
              caratBefore: currentRepair.caratBefore,
              caratAfter: caratAfter ? parseFloat(caratAfter) : currentRepair.caratBefore,
              statusBefore: 'IN_REPAIR',
              statusAfter: 'AVAILABLE',
              createdBy: 'SYSTEM',
              remarks: remarks || `Completed repair: ${currentRepair.repairType}`
            }
          });
        }
      }

      res.json({ success: true, message: 'Repair updated successfully', data: updated });
    } catch (error) {
      next(error);
    }
  };

  deleteRepair = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const currentRepair = await prisma.repair.findUnique({ where: { id } });

      if (currentRepair && currentRepair.status === 'IN_PROGRESS') {
        await prisma.diamondItem.update({
          where: { id: currentRepair.diamondItemId },
          data: { status: 'AVAILABLE' }
        });
      }

      await prisma.repair.delete({
        where: { id }
      });

      res.json({ success: true, message: 'Repair deleted successfully' });
    } catch (error) {
      next(error);
    }
  };
}
