import { z } from 'zod';

export const createPartySchema = z.object({
  body: z.object({
    partyCode: z.string().min(1, 'Party code is required'),
    name: z.string().min(1, 'Name is required'),
    partyType: z.enum(['CUSTOMER', 'SUPPLIER', 'BROKER', 'LAB', 'OTHER']).default('OTHER'),
    brokeragePercentage: z.number().min(0).max(100).optional().default(0),
    phone: z.string().optional(),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    address: z.string().optional(),
    taxId: z.string().optional(),
  })
});

export const updatePartySchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    partyType: z.enum(['CUSTOMER', 'SUPPLIER', 'BROKER', 'LAB', 'OTHER']).optional(),
    brokeragePercentage: z.number().min(0).max(100).optional(),
    phone: z.string().optional(),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    address: z.string().optional(),
    taxId: z.string().optional(),
    isActive: z.boolean().optional(),
  })
});
