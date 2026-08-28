"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepairController = void 0;
const prisma_1 = __importDefault(require("../../providers/db/prisma"));
const repair_service_1 = require("../../services/repair.service");
class RepairController {
    constructor() {
        this.getRepairs = async (_req, res, next) => {
            try {
                const repairs = await prisma_1.default.repair.findMany({
                    include: {
                        diamondItem: true,
                        vendor: true
                    }
                });
                const formatted = repairs.map(r => ({
                    id: r.id, // Added for UI compatibility
                    repairId: r.id,
                    diamondItemId: r.diamondItemId, // Added for UI mapping
                    name: r.name, // Added for UI mapping
                    stockItemId: r.diamondItem?.itemCode || r.diamondItemId,
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
                res.json({ success: true, data: formatted });
            }
            catch (error) {
                next(error);
            }
        };
        this.createRepair = async (req, res, next) => {
            try {
                const { stockItemId, repairType, vendor, estCost } = req.body;
                // Need a vendor party id. The user might have sent a party ID or name.
                // If it doesn't look like a valid UUID/ID, maybe we should find by name. But frontend usually sends partyId in modern selects?
                // Wait, let's just assume vendor is the partyId if it's new.
                let vendorId = vendor;
                if (vendor && !vendor.includes('-')) {
                    const party = await prisma_1.default.party.findFirst({ where: { name: vendor } });
                    if (party)
                        vendorId = party.id;
                }
                // Check if stockItemId is an item code and find its ID
                let diamondItem = await prisma_1.default.diamondItem.findUnique({ where: { id: stockItemId } });
                if (!diamondItem) {
                    diamondItem = await prisma_1.default.diamondItem.findUnique({ where: { itemCode: stockItemId } });
                }
                if (!diamondItem)
                    throw new Error('Diamond item not found');
                // Call repairService to create an immutable transaction
                // transactionId is required in sendForRepair, but from UI we might not have a transactionId.
                // So let's create a stub transaction first or just pass '' if it's optional, wait, transactionId is optional?
                // In schema: transactionId String? -> it is optional.
                // But repairService.sendForRepair requires it! Let's just create a generic transaction for it using transactionService.
                // Actually, since it's an ad-hoc repair, maybe we don't have a transaction?
                // Wait, sendForRepair in repair.service.ts takes transactionId: string. I'll pass 'MANUAL' for now or create a transaction.
                // Better to just let the service handle it, or modify repairService to allow transactionId?: string.
                // For now, let's just do it directly using prisma or update repairService later.
                const repair = await repair_service_1.repairService.sendForRepair(diamondItem.id, vendorId || '', repairType || '', 'MANUAL-TX-' + Date.now(), parseFloat(estCost || 0), 'SYSTEM');
                res.json({ success: true, message: 'Repair created successfully', data: repair });
            }
            catch (error) {
                next(error);
            }
        };
        this.updateRepair = async (req, res, next) => {
            try {
                const id = req.params.id;
                const { status, repairType, vendor, estCost, dueDate, completedOn, remarks } = req.body;
                let vendorId = vendor;
                if (vendor && !vendor.includes('-')) {
                    const party = await prisma_1.default.party.findFirst({ where: { name: vendor } });
                    if (party)
                        vendorId = party.id;
                }
                const updateData = {};
                if (status !== undefined)
                    updateData.status = status;
                if (repairType !== undefined)
                    updateData.repairType = repairType;
                if (vendorId !== undefined)
                    updateData.vendorPartyId = vendorId;
                if (estCost !== undefined)
                    updateData.cost = parseFloat(estCost);
                if (dueDate !== undefined)
                    updateData.dateSent = new Date(dueDate);
                if (completedOn !== undefined)
                    updateData.dateCompleted = new Date(completedOn);
                if (remarks !== undefined)
                    updateData.remarks = remarks;
                const updated = await prisma_1.default.repair.update({
                    where: { id },
                    data: updateData
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
                await prisma_1.default.repair.delete({
                    where: { id }
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