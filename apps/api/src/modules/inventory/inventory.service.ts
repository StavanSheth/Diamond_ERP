import prisma from '../../infrastructure/database/prisma';
import { MovementType, ItemEventType } from '../../types/enums';

class InventoryService {
  async transferItem(diamondItemId: string, toStockId: string, toLocationId: string | null, createdBy: string, remarks?: string) {
    return await prisma.$transaction(async (tx) => {
      const existingDiamond = await tx.diamondItem.findUnique({ where: { id: diamondItemId }});
      if (!existingDiamond) throw new Error(`Diamond ${diamondItemId} not found`);

      const stockBeforeId = existingDiamond.stockId;
      const locationBeforeId = existingDiamond.locationId;

      await tx.inventoryMovement.create({
        data: {
          diamondItemId,
          movementType: MovementType.TRANSFER,
          fromStockId: stockBeforeId,
          toStockId,
          fromLocationId: locationBeforeId,
          toLocationId,
          caratMoved: existingDiamond.carat,
          quantity: 1,
          movementDate: new Date(),
          reason: remarks,
          createdBy
        }
      });

      await tx.diamondItem.update({
        where: { id: diamondItemId },
        data: { 
          stockId: toStockId,
          locationId: toLocationId
        }
      });

      await tx.itemEvent.create({
        data: {
          diamondItemId,
          eventType: ItemEventType.TRANSFERRED,
          eventDate: new Date(),
          caratBefore: existingDiamond.carat,
          caratAfter: existingDiamond.carat,
          rateBefore: existingDiamond.ratePerCarat,
          rateAfter: existingDiamond.ratePerCarat,
          valueBefore: existingDiamond.currentValue,
          valueAfter: existingDiamond.currentValue,
          statusBefore: existingDiamond.status,
          statusAfter: existingDiamond.status,
          stockBeforeId,
          stockAfterId: toStockId,
          locationBeforeId,
          locationAfterId: toLocationId,
          createdBy,
          remarks
        }
      });
      
      return existingDiamond;
    });
  }
}

export const inventoryService = new InventoryService();
