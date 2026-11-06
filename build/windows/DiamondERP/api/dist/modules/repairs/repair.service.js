"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairService = void 0;
const prisma_1 = __importDefault(require("../../infrastructure/database/prisma"));
const enums_1 = require("../../types/enums");
const errors_1 = require("../../errors");
class RepairService {
    async sendForRepair(diamondItemId, vendorPartyId, repairType, transactionId, cost, createdBy) {
        return await prisma_1.default.$transaction(async (tx) => {
            const diamondItem = await tx.diamondItem.findUnique({ where: { id: diamondItemId } });
            if (!diamondItem)
                throw new errors_1.NotFoundError('Diamond not found');
            if (diamondItem.status === enums_1.ItemStatus.IN_REPAIR) {
                throw new errors_1.ConflictError(`Diamond ${diamondItemId} is already in repair.`);
            }
            if (diamondItem.status !== enums_1.ItemStatus.AVAILABLE) {
                throw new errors_1.ConflictError(`Diamond ${diamondItemId} cannot be sent for repair from state "${diamondItem.status}".`);
            }
            const validTransactionId = (transactionId && !transactionId.startsWith('MANUAL')) ? transactionId : null;
            // Optimistic concurrency check: atomically claim the diamond only if it hasn't changed status
            const updateResult = await tx.diamondItem.updateMany({
                where: {
                    id: diamondItemId,
                    status: diamondItem.status,
                },
                data: {
                    status: enums_1.ItemStatus.IN_REPAIR,
                },
            });
            if (updateResult.count === 0) {
                throw new errors_1.ConflictError(`Concurrent modification detected: Diamond ${diamondItemId} is no longer in state "${diamondItem.status}".`);
            }
            const repair = await tx.repair.create({
                data: {
                    diamondItemId,
                    transactionId: validTransactionId,
                    vendorPartyId,
                    repairType,
                    caratBefore: diamondItem.carat,
                    cost,
                    status: enums_1.RepairStatus.IN_PROGRESS,
                    dateSent: new Date()
                }
            });
            await tx.inventoryMovement.create({
                data: {
                    diamondItemId,
                    transactionId: validTransactionId,
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
                    transactionId: validTransactionId,
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
exports.repairService = new RepairService();
//# sourceMappingURL=repair.service.js.map