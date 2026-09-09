import prisma from '../../infrastructure/database/prisma';
import { RepairStatus, ItemEventType, ItemStatus, MovementType } from '../../types/enums';
import { ConflictError, NotFoundError } from '../../errors';

class RepairService {
  async sendForRepair(diamondItemId: string, vendorPartyId: string, repairType: string, transactionId: string | null | undefined, cost: number, createdBy: string) {
    return await prisma.$transaction(async (tx) => {
      const diamondItem = await tx.diamondItem.findUnique({ where: { id: diamondItemId }});
      if (!diamondItem) throw new NotFoundError('Diamond not found');

      if (diamondItem.status === ItemStatus.IN_REPAIR) {
        throw new ConflictError(`Diamond ${diamondItemId} is already in repair.`);
      }
      if (diamondItem.status !== ItemStatus.AVAILABLE) {
        throw new ConflictError(`Diamond ${diamondItemId} cannot be sent for repair from state "${diamondItem.status}".`);
      }

      const validTransactionId = (transactionId && !transactionId.startsWith('MANUAL')) ? transactionId : null;

      // Optimistic concurrency check: atomically claim the diamond only if it hasn't changed status
      const updateResult = await tx.diamondItem.updateMany({
        where: {
          id: diamondItemId,
          status: diamondItem.status,
        },
        data: {
          status: ItemStatus.IN_REPAIR,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictError(`Concurrent modification detected: Diamond ${diamondItemId} is no longer in state "${diamondItem.status}".`);
      }

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
