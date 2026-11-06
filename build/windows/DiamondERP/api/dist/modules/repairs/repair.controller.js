"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepairController = void 0;
const prisma_1 = __importDefault(require("../../infrastructure/database/prisma"));
const repair_service_1 = require("../repairs/repair.service");
const filter_utils_1 = require("../../utils/filter.utils");
const errors_1 = require("../../errors");
const shared_utils_1 = require("@diamond-erp/shared-utils");
class RepairController {
    constructor() {
        this.getRepairs = async (req, res, next) => {
            try {
                const diamondWhere = (0, filter_utils_1.buildDiamondWhereClause)(req.query);
                const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
                const take = req.query.take ? parseInt(req.query.take, 10) : 1000;
                const [total, repairs] = await prisma_1.default.$transaction([
                    prisma_1.default.repair.count({
                        where: Object.keys(diamondWhere).length > 0 ? {
                            diamondItem: diamondWhere
                        } : undefined
                    }),
                    prisma_1.default.repair.findMany({
                        where: Object.keys(diamondWhere).length > 0 ? {
                            diamondItem: diamondWhere
                        } : undefined,
                        skip,
                        take,
                        include: {
                            diamondItem: {
                                include: {
                                    stock: true
                                }
                            },
                            vendor: true
                        }
                    })
                ]);
                const formatted = repairs.map(r => ({
                    id: r.id, // Added for UI compatibility
                    repairId: r.id,
                    diamondItemId: r.diamondItemId, // Added for UI mapping
                    name: r.name, // Added for UI mapping
                    stockItemId: r.diamondItem?.itemCode || r.diamondItemId,
                    stockName: r.diamondItem?.stock?.name || r.name || 'Diamond Stock',
                    itemName: r.name || `${r.diamondItem?.clarity || ''} ${r.diamondItem?.shape || 'Unknown'}`,
                    weight: r.diamondItem ? Number(r.diamondItem.carat) : 0,
                    status: r.status,
                    repairType: r.repairType,
                    vendor: r.vendor?.name || r.vendorPartyId,
                    estCost: Number(r.cost),
                    finalCost: Number(r.cost),
                    dueDate: r.dateSent ? r.dateSent.toISOString() : '',
                    completedOn: r.dateCompleted ? r.dateCompleted.toISOString() : '',
                    restoresTo: 'ACTIVE',
                    remarks: r.remarks || '',
                }));
                res.json({ success: true, data: formatted, total });
            }
            catch (error) {
                next(error);
            }
        };
        this.createRepair = async (req, res, next) => {
            try {
                const { stockItemId, diamondItemId, repairType, vendor, estCost, name } = req.body;
                let vendorId = vendor;
                if (vendor) {
                    const partyById = await prisma_1.default.party.findUnique({ where: { id: vendor } });
                    if (partyById) {
                        vendorId = partyById.id;
                    }
                    else {
                        const partyByName = await prisma_1.default.party.findFirst({ where: { name: vendor } });
                        if (partyByName)
                            vendorId = partyByName.id;
                    }
                }
                if (!vendorId) {
                    res.status(400).json({ success: false, error: 'A valid workshop or vendor party is required to initiate a repair.' });
                    return;
                }
                const stoneRef = diamondItemId || stockItemId;
                if (!stoneRef) {
                    res.status(400).json({ success: false, error: 'A valid diamond stone reference is required to initiate a repair.' });
                    return;
                }
                let diamondItem = await prisma_1.default.diamondItem.findUnique({ where: { id: stoneRef } });
                if (!diamondItem) {
                    diamondItem = await prisma_1.default.diamondItem.findUnique({ where: { itemCode: stoneRef } });
                }
                if (!diamondItem) {
                    res.status(404).json({ success: false, error: `Diamond item "${stoneRef}" was not found in inventory.` });
                    return;
                }
                if (diamondItem.status === 'SOLD' || diamondItem.status === 'WRITTEN_OFF') {
                    res.status(400).json({ success: false, error: `Cannot send stone "${diamondItem.itemCode}" for repair because its status is ${diamondItem.status}.` });
                    return;
                }
                const repair = await repair_service_1.repairService.sendForRepair(diamondItem.id, vendorId, repairType || 'Polishing', null, (0, shared_utils_1.parseSafeNumber)(estCost, { defaultValue: 0, fieldName: 'estCost' }), 'SYSTEM');
                if (name) {
                    await prisma_1.default.repair.update({
                        where: { id: repair.id },
                        data: { name }
                    });
                }
                res.status(201).json({ success: true, message: 'Repair created successfully', data: repair });
            }
            catch (error) {
                next(error);
            }
        };
        this.updateRepair = async (req, res, next) => {
            try {
                const id = req.params.id;
                const { status, repairType, vendor, estCost, dueDate, completedOn, remarks, caratAfter } = req.body;
                const updated = await prisma_1.default.$transaction(async (tx) => {
                    const currentRepair = await tx.repair.findUnique({ where: { id } });
                    if (!currentRepair) {
                        throw new errors_1.NotFoundError('Repair record not found');
                    }
                    let vendorId = vendor;
                    if (vendor) {
                        const partyById = await tx.party.findUnique({ where: { id: vendor } });
                        if (partyById) {
                            vendorId = partyById.id;
                        }
                        else {
                            const partyByName = await tx.party.findFirst({ where: { name: vendor } });
                            if (partyByName)
                                vendorId = partyByName.id;
                        }
                    }
                    let normalizedStatus = status;
                    if (normalizedStatus === 'IN PROGRESS')
                        normalizedStatus = 'IN_PROGRESS';
                    const updateData = {};
                    if (normalizedStatus !== undefined)
                        updateData.status = normalizedStatus;
                    if (repairType !== undefined)
                        updateData.repairType = repairType;
                    if (vendorId !== undefined)
                        updateData.vendorPartyId = vendorId;
                    if (estCost !== undefined)
                        updateData.cost = (0, shared_utils_1.parseSafeNumber)(estCost, { fieldName: 'estCost' });
                    if (dueDate !== undefined)
                        updateData.dateSent = new Date(dueDate);
                    if (completedOn !== undefined)
                        updateData.dateCompleted = new Date(completedOn);
                    if (remarks !== undefined)
                        updateData.remarks = remarks;
                    if (caratAfter !== undefined)
                        updateData.caratAfter = (0, shared_utils_1.parseSafeNumber)(caratAfter, { fieldName: 'caratAfter' });
                    const repairRecord = await tx.repair.update({
                        where: { id },
                        data: updateData
                    });
                    // Status transition handling for linked diamond atomically
                    if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'CANCELLED') {
                        const diamondUpdateData = { status: 'AVAILABLE' };
                        if (normalizedStatus === 'COMPLETED' && caratAfter) {
                            diamondUpdateData.carat = (0, shared_utils_1.parseSafeNumber)(caratAfter, { fieldName: 'caratAfter' });
                        }
                        await tx.diamondItem.update({
                            where: { id: currentRepair.diamondItemId },
                            data: diamondUpdateData
                        });
                        if (normalizedStatus === 'COMPLETED') {
                            const diamond = await tx.diamondItem.findUnique({ where: { id: currentRepair.diamondItemId } });
                            await tx.inventoryMovement.create({
                                data: {
                                    diamondItemId: currentRepair.diamondItemId,
                                    movementType: 'REPAIR_IN',
                                    toStockId: diamond?.stockId,
                                    toLocationId: diamond?.locationId,
                                    caratMoved: caratAfter ? (0, shared_utils_1.parseSafeNumber)(caratAfter, { fieldName: 'caratAfter' }) : currentRepair.caratBefore,
                                    quantity: 1,
                                    movementDate: completedOn ? new Date(completedOn) : new Date(),
                                    reason: remarks || 'Completed repair returned to available inventory',
                                    createdBy: 'SYSTEM'
                                }
                            });
                            await tx.itemEvent.create({
                                data: {
                                    diamondItemId: currentRepair.diamondItemId,
                                    eventType: 'REPAIRED',
                                    eventDate: completedOn ? new Date(completedOn) : new Date(),
                                    partyId: currentRepair.vendorPartyId,
                                    caratBefore: currentRepair.caratBefore,
                                    caratAfter: caratAfter ? (0, shared_utils_1.parseSafeNumber)(caratAfter, { fieldName: 'caratAfter' }) : currentRepair.caratBefore,
                                    statusBefore: 'IN_REPAIR',
                                    statusAfter: 'AVAILABLE',
                                    createdBy: 'SYSTEM',
                                    remarks: remarks || `Completed repair: ${currentRepair.repairType}`
                                }
                            });
                        }
                    }
                    return repairRecord;
                });
                res.json({ success: true, message: 'Repair updated successfully', data: updated });
            }
            catch (error) {
                next(error);
            }
        };
        this.deleteRepair = async (req, res, next) => {
            try {
                const id = req.params.id;
                await prisma_1.default.$transaction(async (tx) => {
                    const currentRepair = await tx.repair.findUnique({ where: { id } });
                    if (!currentRepair) {
                        throw new errors_1.NotFoundError('Repair not found');
                    }
                    // Deletion semantics: COMPLETED repairs cannot be physically deleted
                    if (currentRepair.status === 'COMPLETED') {
                        throw new errors_1.ValidationError('Cannot delete a COMPLETED repair. It has already affected inventory and financial ledgers. Please create a reversing entry instead.');
                    }
                    if (currentRepair.status === 'IN_PROGRESS') {
                        await tx.diamondItem.update({
                            where: { id: currentRepair.diamondItemId },
                            data: { status: 'AVAILABLE' }
                        });
                    }
                    await tx.repair.delete({
                        where: { id }
                    });
                });
                res.json({ success: true, message: 'Repair deleted successfully' });
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.RepairController = RepairController;
//# sourceMappingURL=repair.controller.js.map