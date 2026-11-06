"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransactionSchema = void 0;
const zod_1 = require("zod");
const transactionItemSchema = zod_1.z.object({
    diamondItemId: zod_1.z.string().uuid('Invalid diamond UUID').optional(),
    itemCode: zod_1.z.string().optional(),
    name: zod_1.z.string().optional(),
    displayName: zod_1.z.string().optional(),
    carat: zod_1.z.number().positive('Carat must be greater than 0'),
    color: zod_1.z.string().optional(),
    clarity: zod_1.z.string().optional(),
    cut: zod_1.z.string().optional(),
    shape: zod_1.z.string().optional(),
    ratePerCarat: zod_1.z.number().min(0, 'Rate cannot be negative'),
    totalValue: zod_1.z.number().min(0, 'Total value cannot be negative'),
    itemAction: zod_1.z.enum(['IN', 'OUT', 'UPDATE', 'NO_CHANGE']),
    category: zod_1.z.string().optional(),
    polish: zod_1.z.string().optional(),
    linkedCertificateId: zod_1.z.string().uuid().optional().nullable(),
    labType: zod_1.z.string().optional(),
    internalNotes: zod_1.z.string().optional(),
    certCost: zod_1.z.number().min(0).optional(),
    repairType: zod_1.z.string().optional(),
    repairVendorId: zod_1.z.string().uuid().optional().nullable(),
    repairCost: zod_1.z.number().min(0).optional(),
    linkedRepairId: zod_1.z.string().uuid().optional().nullable(),
    existingDiamondId: zod_1.z.string().uuid().optional().nullable(),
    fromLocationId: zod_1.z.string().uuid().optional().nullable(),
    toLocationId: zod_1.z.string().uuid().optional().nullable(),
    toStockId: zod_1.z.string().uuid().optional().nullable(),
});
exports.createTransactionSchema = zod_1.z.object({
    body: zod_1.z.object({
        ledgerId: zod_1.z.string().uuid('Ledger ID is required'),
        transactionType: zod_1.z.string(), // Enums handled by state machine and logic
        transactionDate: zod_1.z.string().datetime({ offset: true }).or(zod_1.z.date()).transform(val => new Date(val)),
        partyId: zod_1.z.string().uuid('Invalid Party ID').optional().nullable(),
        remarks: zod_1.z.string().optional(),
        referenceNo: zod_1.z.string().optional(),
        createdBy: zod_1.z.string().min(1, 'CreatedBy is required'),
        totalCarat: zod_1.z.number().nonnegative(),
        totalValue: zod_1.z.number().nonnegative(),
        status: zod_1.z.enum(['DRAFT', 'PENDING_AUTHORIZATION', 'AUTHORIZED', 'POSTED', 'CANCELLED', 'REVERSED']).default('DRAFT'),
        paymentType: zod_1.z.enum(['TO_PAY', 'TO_COLLECT']).optional(),
        paymentStatus: zod_1.z.enum(['PENDING', 'PARTIAL', 'COMPLETED']).optional().default('PENDING'),
        paymentDone: zod_1.z.number().min(0).optional().default(0),
        paymentDue: zod_1.z.number().min(0).optional().default(0),
        brokeragePercentage: zod_1.z.number().min(0).max(100).optional().default(0),
        brokerageAmount: zod_1.z.number().min(0).optional().default(0),
        brokerageType: zod_1.z.enum(['INCLUSIVE', 'EXCLUSIVE']).optional().default('INCLUSIVE'),
        items: zod_1.z.array(transactionItemSchema).min(1, 'At least one item is required'),
    })
});
//# sourceMappingURL=transaction.validator.js.map