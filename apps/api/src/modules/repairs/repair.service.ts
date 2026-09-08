import prisma from '../../infrastructure/database/prisma';
import { RepairStatus, ItemEventType, ItemStatus, MovementType } from '../../types/enums';

class RepairService {
  async sendForRepair(diamondItemId: string, vendorPartyId: string, repairType: string, transactionId: string | null | undefined, cost: number, createdBy: string) {
    return await prisma.$transaction(async (tx) => {
      const diamondItem = await tx.diamondItem.findUnique({ where: { id: diamondItemId }});
      if (!diamondItem) throw new Error('Diamond not found');

      const validTransactionId = (transactionId && !transactionId.startsWith('MANUAL')) ? transactionId : null;

      const repair = await tx.repair.create({
        data: {
          diamondItemId,
          transactionId: validTransactionId,
          vendorPartyId,
          repairType,
          caratBefore: diamondItem.carat,
          cost,
          status: RepairStatus.IN_PROGRESS,
          dateSent: new Date()
        }
      });

      await tx.diamondItem.update({
        where: { id: diamondItemId },
        data: { status: ItemStatus.IN_REPAIR }
      });

      await tx.inventoryMovement.create({
        data: {
          diamondItemId,
          transactionId: validTransactionId,
          movementType: MovementType.REPAIR_OUT,
          fromStockId: diamondItem.stockId,
          fromLocationId: diamondItem.locationId,
          caratMoved: diamondItem.carat,
          quantity: 1,
          movementDate: new Date(),
          createdBy
        }
      });

      await tx.itemEvent.create({
        data: {
          diamondItemId,
          transactionId: validTransactionId,
          eventType: ItemEventType.REPAIRED,
          eventDate: new Date(),
          partyId: vendorPartyId,
          caratBefore: diamondItem.carat,
          caratAfter: diamondItem.carat,
          statusBefore: diamondItem.status,
          statusAfter: ItemStatus.IN_REPAIR,
          createdBy,
          remarks: `Sent for ${repairType}`
        }
      });

      return repair;
    });
  }
}

export const repairService = new RepairService();
