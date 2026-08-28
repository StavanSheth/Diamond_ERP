"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformationService = exports.TransformationService = void 0;
const prisma_1 = __importDefault(require("../providers/db/prisma"));
const enums_1 = require("../types/enums");
class TransformationService {
    async processTransformation(diamondItemId, transformationType, caratAfter, cost, createdBy, remarks) {
        return await prisma_1.default.$transaction(async (tx) => {
            const existingDiamond = await tx.diamondItem.findUnique({
                where: { id: diamondItemId }
            });
            if (!existingDiamond)
                throw new Error(`Diamond ${diamondItemId} not found`);
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
                    status: enums_1.ItemStatus.AVAILABLE
                }
            });
            await tx.itemEvent.create({
                data: {
                    diamondItemId,
                    eventType: enums_1.ItemEventType.TRANSFORMED,
                    eventDate: new Date(),
                    caratBefore,
                    caratAfter,
                    rateBefore: existingDiamond.ratePerCarat,
                    rateAfter: existingDiamond.ratePerCarat,
                    valueBefore: existingDiamond.currentValue,
                    valueAfter: existingDiamond.currentValue,
                    statusBefore: existingDiamond.status,
                    statusAfter: enums_1.ItemStatus.AVAILABLE,
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
    async processSplit(parentDiamondId, childItems, _createdBy, cost = 0, remarks = '') {
        return prisma_1.default.$transaction(async (tx) => {
            const existingParent = await tx.diamondItem.findUnique({ where: { id: parentDiamondId } });
            if (!existingParent)
                throw new Error(`Diamond ${parentDiamondId} not found`);
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
exports.TransformationService = TransformationService;
exports.transformationService = new TransformationService();
//# sourceMappingURL=transformation.service.js.map