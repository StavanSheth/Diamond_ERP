"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diamondItemService = exports.DiamondItemService = void 0;
const prisma_1 = __importDefault(require("../providers/db/prisma"));
class DiamondItemService {
    /**
     * Send a diamond out for repair.
     */
    async sendForRepair(payload, createdBy) {
        return await prisma_1.default.$transaction(async (tx) => {
            const diamond = await tx.diamondItem.findUnique({ where: { id: payload.diamondItemId } });
            if (!diamond)
                throw new Error('Diamond not found');
            // Update diamond status
            await tx.diamondItem.update({
                where: { id: payload.diamondItemId },
                data: { status: 'IN_REPAIR' }
            });
            // Create repair record
            const repair = await tx.repair.create({
                data: {
                    diamondItemId: payload.diamondItemId,
                    vendorPartyId: payload.vendorPartyId,
                    repairType: payload.repairType,
                    cost: payload.cost,
                    remarks: payload.remarks,
                    dateSent: payload.dateSent,
                    caratBefore: diamond.carat,
                    status: 'PENDING'
                }
            });
            // Create lifecycle event
            await tx.itemEvent.create({
                data: {
                    diamondItemId: payload.diamondItemId,
                    eventType: 'REPAIRED',
                    eventDate: new Date(),
                    partyId: payload.vendorPartyId,
                    statusBefore: diamond.status,
                    statusAfter: 'IN_REPAIR',
                    createdBy,
                    remarks: payload.remarks
                }
            });
            return repair;
        });
    }
    /**
     * Add a certification to a diamond.
     */
    async addCertification(payload, createdBy) {
        return await prisma_1.default.$transaction(async (tx) => {
            const diamond = await tx.diamondItem.findUnique({ where: { id: payload.diamondItemId } });
            if (!diamond)
                throw new Error('Diamond not found');
            const cert = await tx.certification.create({
                data: {
                    diamondItemId: payload.diamondItemId,
                    labType: payload.labType,
                    reportNumber: payload.reportNumber,
                    cost: payload.cost,
                    certificateStatus: 'RECEIVED'
                }
            });
            await tx.diamondItem.update({
                where: { id: payload.diamondItemId },
                data: {
                    certificateStatus: 'RECEIVED'
                }
            });
            await tx.itemEvent.create({
                data: {
                    diamondItemId: payload.diamondItemId,
                    eventType: 'CERTIFIED',
                    eventDate: new Date(),
                    caratBefore: diamond.carat,
                    createdBy,
                    remarks: `Certified by ${payload.labType} #${payload.reportNumber}`
                }
            });
            return cert;
        });
    }
}
exports.DiamondItemService = DiamondItemService;
exports.diamondItemService = new DiamondItemService();
//# sourceMappingURL=diamond.service.js.map