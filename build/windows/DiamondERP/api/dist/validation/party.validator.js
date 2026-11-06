"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePartySchema = exports.createPartySchema = void 0;
const zod_1 = require("zod");
const validPartyTypes = [
    'CUSTOMER',
    'SUPPLIER',
    'BROKER',
    'BROKER_CLIENT',
    'WORKSHOP',
    'CERTIFICATION_LAB',
    'LAB',
    'OTHER',
];
exports.createPartySchema = zod_1.z.object({
    body: zod_1.z.object({
        partyCode: zod_1.z.string().optional(),
        nickname: zod_1.z.string().optional(),
        name: zod_1.z.string().optional(),
        partyName: zod_1.z.string().optional(),
        partyType: zod_1.z.enum(validPartyTypes).optional().default('OTHER'),
        type: zod_1.z.string().optional(),
        brokeragePercentage: zod_1.z.number().min(0).max(100).optional().default(0),
        outstandingBalance: zod_1.z.number().optional().default(0),
        phone: zod_1.z.string().optional(),
        email: zod_1.z.string().email('Invalid email address').optional().or(zod_1.z.literal('')),
        address: zod_1.z.string().optional(),
        taxId: zod_1.z.string().optional(),
        gstin: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }).refine((data) => Boolean(data.name || data.partyName), {
        message: 'Name or partyName is required',
        path: ['name'],
    })
});
exports.updatePartySchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1).optional(),
        partyName: zod_1.z.string().min(1).optional(),
        partyType: zod_1.z.enum(validPartyTypes).optional(),
        type: zod_1.z.string().optional(),
        brokeragePercentage: zod_1.z.number().min(0).max(100).optional(),
        outstandingBalance: zod_1.z.number().optional(),
        phone: zod_1.z.string().optional(),
        email: zod_1.z.string().email('Invalid email address').optional().or(zod_1.z.literal('')),
        address: zod_1.z.string().optional(),
        taxId: zod_1.z.string().optional(),
        gstin: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
        isActive: zod_1.z.boolean().optional(),
    })
});
//# sourceMappingURL=party.validator.js.map