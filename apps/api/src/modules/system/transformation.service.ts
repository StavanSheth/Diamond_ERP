import { Prisma } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
import { ItemEventType, ItemStatus } from '../../types/enums';

class TransformationService {
  async processTransformation(
    diamondItemId: string,
    transformationType: string,
    caratAfter: number,
    cost: number,
    createdBy: string,
    remarks?: string
  ) {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingDiamond = await tx.diamondItem.findUnique({
        where: { id: diamondItemId }
      });
      if (!existingDiamond) throw new Error(`Diamond ${diamondItemId} not found`);

      const caratBefore = existingDiamond.carat.toNumber();

      const transformation = await tx.itemTransformation.create({
        data: {
          provenance: {
            create: [
              { diamondItemId, role: 'SOURCE' },
              { diamondItemId, role: 'RESULT' } // Simple 1:1 transformation modifies the same item
            ]
          },
          transformationType,
          dateStarted: new Date(),
          dateCompleted: new Date(),
          caratBefore,
          caratAfter,
          valueBefore: existingDiamond.currentValue,
          valueAfter: existingDiamond.currentValue,
          cost,
          status: 'COMPLETED',
          remarks
        }
      });

      await tx.diamondItem.update({
        where: { id: diamondItemId },
        data: { 
          carat: caratAfter,
          polish: 'EX', // Assume transformation produces a polished item, or keep it dynamic
          status: ItemStatus.AVAILABLE
        }
      });

      await tx.itemEvent.create({
        data: {
          diamondItemId,
          eventType: ItemEventType.TRANSFORMED,
          eventDate: new Date(),
          caratBefore,
          caratAfter,
          rateBefore: existingDiamond.ratePerCarat,
          rateAfter: existingDiamond.ratePerCarat,
          valueBefore: existingDiamond.currentValue,
          valueAfter: existingDiamond.currentValue,
          statusBefore: existingDiamond.status,
          statusAfter: ItemStatus.AVAILABLE,
          stockBeforeId: existingDiamond.stockId,
          stockAfterId: existingDiamond.stockId,
          locationBeforeId: existingDiamond.locationId,
          locationAfterId: existingDiamond.locationId,
          createdBy,
          remarks
        }
      });

      return transformation;
    });
  }
  async processSplit(
    parentDiamondId: string, 
    childItems: { itemCode: string, carat: number, value: number, color?: string, clarity?: string, cut?: string, shape?: string }[],
    _createdBy: string,
    cost: number = 0,
    remarks: string = ''
  ): Promise<any> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingParent = await tx.diamondItem.findUnique({ where: { id: parentDiamondId } });
      if (!existingParent) throw new Error(`Diamond ${parentDiamondId} not found`);

      // Create children
      const children = await Promise.all(childItems.map(child => tx.diamondItem.create({
        data: {
          itemCode: child.itemCode,
          carat: child.carat,
          currentValue: child.value,
          ratePerCarat: child.value / child.carat,
          status: 'AVAILABLE',
          stockId: existingParent.stockId,
          locationId: existingParent.locationId,
          displayName: `${child.clarity || existingParent.clarity} ${child.shape || existingParent.shape}`,
          color: child.color || existingParent.color,
          clarity: child.clarity || existingParent.clarity,
          cut: child.cut || existingParent.cut,
          shape: child.shape || existingParent.shape,
          category: 'SINGLE',
          certificateStatus: 'NONE'
        }
      })));

      // Mark parent as WRITTEN_OFF (or TRANSFORMED if we had it in enums)
      await tx.diamondItem.update({
        where: { id: parentDiamondId },
        data: { status: 'WRITTEN_OFF' } 
      });

      const transformation = await tx.itemTransformation.create({
        data: {
          transformationType: 'SPLIT',
          dateStarted: new Date(),
          dateCompleted: new Date(),
          caratBefore: existingParent.carat,
          valueBefore: existingParent.currentValue,
          cost,
          status: 'COMPLETED',
          remarks,
          provenance: {
            create: [
              { diamondItemId: parentDiamondId, role: 'SOURCE' },
              ...children.map(c => ({ diamondItemId: c.id, role: 'RESULT' }))
            ]
          }
        }
      });

      return transformation;
    });
  }
}

export const transformationService = new TransformationService();
