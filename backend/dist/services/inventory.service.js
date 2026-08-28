"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryService = exports.InventoryService = void 0;
const prisma_1 = __importDefault(require("../providers/db/prisma"));
const enums_1 = require("../types/enums");
class InventoryService {
    async transferItem(diamondItemId, toStockId, toLocationId, createdBy, remarks) {
        return await prisma_1.default.$transaction(async (tx) => {
            const existingDiamond = await tx.diamondItem.findUnique({ where: { id: diamondItemId } });
            if (!existingDiamond)
                throw new Error(`Diamond ${diamondItemId} not found`);
            const stockBeforeId = existingDiamond.stockId;
            const locationBeforeId = existingDiamond.locationId;
            await tx.inventoryMovement.create({
                data: {
                    diamondItemId,
                    movementType: enums_1.MovementType.TRANSFER,
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
                    eventType: enums_1.ItemEventType.TRANSFERRED,
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
exports.InventoryService = InventoryService;
exports.inventoryService = new InventoryService();
//# sourceMappingURL=inventory.service.js.map