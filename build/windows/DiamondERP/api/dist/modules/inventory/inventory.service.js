"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryService = void 0;
const prisma_1 = __importDefault(require("../../infrastructure/database/prisma"));
const enums_1 = require("../../types/enums");
const errors_1 = require("../../errors");
class InventoryService {
    /**
     * Concurrency-safe item transfer between stocks and locations.
     * Enforces optimistic conditional updates to prevent race conditions during simultaneous transfers.
     */
    async transferItem(diamondItemId, toStockId, toLocationId, createdBy, remarks) {
        return await prisma_1.default.$transaction(async (tx) => {
            const existingDiamond = await tx.diamondItem.findUnique({
                where: { id: diamondItemId },
            });
            if (!existingDiamond) {
                throw new errors_1.NotFoundError(`Diamond ${diamondItemId} not found`);
            }
            // Check status validity
            if (existingDiamond.status === 'SOLD' || existingDiamond.status === 'RETIRED') {
                throw new errors_1.ConflictError(`Cannot transfer diamond ${diamondItemId} in state "${existingDiamond.status}".`);
            }
            const stockBeforeId = existingDiamond.stockId;
            const locationBeforeId = existingDiamond.locationId;
            if (stockBeforeId === toStockId && locationBeforeId === toLocationId) {
                throw new errors_1.ValidationError('Destination stock and location must differ from current location.');
            }
            // Validate target stock exists in current profile's database
            const targetStock = await tx.stock.findUnique({ where: { id: toStockId } });
            if (!targetStock) {
                throw new errors_1.NotFoundError(`Target stock ${toStockId} does not exist in this profile.`);
            }
            if (toLocationId) {
                const targetLocation = await tx.location.findUnique({ where: { id: toLocationId } });
                if (!targetLocation) {
                    throw new errors_1.NotFoundError(`Target location ${toLocationId} does not exist in this profile.`);
                }
            }
            // 1. Optimistic conditional update: atomically claim the transfer only if stock hasn't changed
            const updateResult = await tx.diamondItem.updateMany({
                where: {
                    id: diamondItemId,
                    stockId: stockBeforeId,
                },
                data: {
                    stockId: toStockId,
                    locationId: toLocationId,
                    updatedAt: new Date(),
                },
            });
            if (updateResult.count === 0) {
                throw new errors_1.ConflictError(`Concurrent transfer detected: diamond ${diamondItemId} has already been moved from stock ${stockBeforeId}.`);
            }
            // 2. Record inventory movement
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
                    createdBy,
                },
            });
            // 3. Record item event history
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
                    remarks,
                },
            });
            return {
                ...existingDiamond,
                stockId: toStockId,
                locationId: toLocationId,
            };
        });
    }
}
exports.inventoryService = new InventoryService();
//# sourceMappingURL=inventory.service.js.map