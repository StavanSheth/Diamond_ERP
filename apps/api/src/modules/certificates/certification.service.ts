import prisma from '../../infrastructure/database/prisma';
import { CertificationStatus, ItemEventType, CertificateState } from '../../types/enums';

class CertificationService {
  async submitCertification(diamondItemId: string, labType: string, transactionId: string | null | undefined, createdBy: string, partyId?: string) {
    return await prisma.$transaction(async (tx) => {
      const diamondItem = await tx.diamondItem.findUnique({ where: { id: diamondItemId }});
      if (!diamondItem) throw new Error('Diamond not found');

      const cert = await tx.certification.create({
        data: {
          diamondItemId,
          transactionId,
          labType,
          certificateStatus: CertificationStatus.PENDING
        }
      });

      await tx.diamondItem.update({
        where: { id: diamondItemId },
        data: { certificateStatus: CertificateState.PENDING }
      });

      await tx.itemEvent.create({
        data: {
          diamondItemId,
          transactionId,
          eventType: ItemEventType.CERTIFIED, // Or SUBMITTED
          eventDate: new Date(),
          partyId,
          caratBefore: diamondItem.carat,
          caratAfter: diamondItem.carat,
          statusBefore: diamondItem.status,
          statusAfter: diamondItem.status,
          certificateBeforeId: diamondItem.currentCertificateId,
          createdBy,
          remarks: `Submitted to ${labType}`
        }
      });

      return cert;
    });
  }
}

export const certificationService = new CertificationService();
