"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.certificationService = exports.CertificationService = void 0;
const prisma_1 = __importDefault(require("../providers/db/prisma"));
const enums_1 = require("../types/enums");
class CertificationService {
    async submitCertification(diamondItemId, labType, transactionId, createdBy, partyId) {
        return await prisma_1.default.$transaction(async (tx) => {
            const diamondItem = await tx.diamondItem.findUnique({ where: { id: diamondItemId } });
            if (!diamondItem)
                throw new Error('Diamond not found');
            const cert = await tx.certification.create({
                data: {
                    diamondItemId,
                    transactionId,
                    labType,
                    certificateStatus: enums_1.CertificationStatus.PENDING
                }
            });
            await tx.diamondItem.update({
                where: { id: diamondItemId },
                data: { certificateStatus: enums_1.CertificateState.PENDING }
            });
            await tx.itemEvent.create({
                data: {
                    diamondItemId,
                    transactionId,
                    eventType: enums_1.ItemEventType.CERTIFIED, // Or SUBMITTED
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
exports.CertificationService = CertificationService;
exports.certificationService = new CertificationService();
//# sourceMappingURL=certification.service.js.map