"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairService = exports.RepairService = void 0;
const prisma_1 = __importDefault(require("../providers/db/prisma"));
const enums_1 = require("../types/enums");
class RepairService {
    async sendForRepair(diamondItemId, vendorPartyId, repairType, transactionId, cost, createdBy) {
        return await prisma_1.default.$transaction(async (tx) => {
            const diamondItem = await tx.diamondItem.findUnique({ where: { id: diamondItemId } });
            if (!diamondItem)
                throw new Error('Diamond not found');
            const repair = await tx.repair.create({
                data: {
                    diamondItemId,
                    transactionId,
                    vendorPartyId,
                    repairType,
                    caratBefore: diamondItem.carat,
                    cost,
                    status: enums_1.RepairStatus.IN_PROGRESS,
                    dateSent: new Date()
                }
            });
            await tx.diamondItem.update({
                where: { id: diamondItemId },
                data: { status: enums_1.ItemStatus.IN_REPAIR }
            });
            await tx.inventoryMovement.create({
                data: {
                    diamondItemId,
                    transactionId,
                    movementType: enums_1.MovementType.REPAIR_OUT,
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
                    transactionId,
                    eventType: enums_1.ItemEventType.REPAIRED,
                    eventDate: new Date(),
                    partyId: vendorPartyId,
                    caratBefore: diamondItem.carat,
                    caratAfter: diamondItem.carat,
                    statusBefore: diamondItem.status,
                    statusAfter: enums_1.ItemStatus.IN_REPAIR,
                    createdBy,
                    remarks: `Sent for ${repairType}`
                }
            });
            return repair;
        });
    }
}
exports.RepairService = RepairService;
exports.repairService = new RepairService();
//# sourceMappingURL=repair.service.js.map