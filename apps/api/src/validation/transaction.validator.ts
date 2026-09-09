import { z } from 'zod';

const transactionItemSchema = z.object({
  diamondItemId: z.string().uuid('Invalid diamond UUID').optional(),
  itemCode: z.string().optional(),
  name: z.string().optional(),
  displayName: z.string().optional(),
  carat: z.number().positive('Carat must be greater than 0'),
  color: z.string().optional(),
  clarity: z.string().optional(),
  cut: z.string().optional(),
  shape: z.string().optional(),
  ratePerCarat: z.number().min(0, 'Rate cannot be negative'),
  totalValue: z.number().min(0, 'Total value cannot be negative'),
  itemAction: z.enum(['IN', 'OUT', 'UPDATE', 'NO_CHANGE']),
  category: z.string().optional(),
  polish: z.string().optional(),
  linkedCertificateId: z.string().uuid().optional().nullable(),
  labType: z.string().optional(),
  internalNotes: z.string().optional(),
  certCost: z.number().min(0).optional(),
  repairType: z.string().optional(),
  repairVendorId: z.string().uuid().optional().nullable(),
  repairCost: z.number().min(0).optional(),
  linkedRepairId: z.string().uuid().optional().nullable(),
  existingDiamondId: z.string().uuid().optional().nullable(),
  fromLocationId: z.string().uuid().optional().nullable(),
  toLocationId: z.string().uuid().optional().nullable(),
  toStockId: z.string().uuid().optional().nullable(),
});

export const createTransactionSchema = z.object({
  body: z.object({
    ledgerId: z.string().uuid('Ledger ID is required'),
    transactionType: z.string(), // Enums handled by state machine and logic
    transactionDate: z.string().datetime({ offset: true }).or(z.date()).transform(val => new Date(val)),
    partyId: z.string().uuid('Invalid Party ID').optional().nullable(),
    remarks: z.string().optional(),
    referenceNo: z.string().optional(),
    createdBy: z.string().min(1, 'CreatedBy is required'),
    totalCarat: z.number().nonnegative(),
    totalValue: z.number().nonnegative(),
    status: z.enum(['DRAFT', 'PENDING_AUTHORIZATION', 'AUTHORIZED', 'POSTED', 'CANCELLED', 'REVERSED']).default('DRAFT'),
    paymentStatus: z.enum(['PENDING', 'PARTIAL', 'COMPLETED']).optional().default('PENDING'),
    paymentDone: z.number().min(0).optional().default(0),
    paymentDue: z.number().min(0).optional().default(0),
    brokeragePercentage: z.number().min(0).max(100).optional().default(0),
    brokerageAmount: z.number().min(0).optional().default(0),
    brokerageType: z.enum(['INCLUSIVE', 'EXCLUSIVE']).optional().default('INCLUSIVE'),
    items: z.array(transactionItemSchema).min(1, 'At least one item is required'),
  })
});
