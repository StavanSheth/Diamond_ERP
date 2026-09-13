import { z } from 'zod';

const validPartyTypes = [
  'CUSTOMER',
  'SUPPLIER',
  'BROKER',
  'BROKER_CLIENT',
  'WORKSHOP',
  'CERTIFICATION_LAB',
  'LAB',
  'OTHER',
] as const;

export const createPartySchema = z.object({
  body: z.object({
    partyCode: z.string().optional(),
    nickname: z.string().optional(),
    name: z.string().optional(),
    partyName: z.string().optional(),
    partyType: z.enum(validPartyTypes).optional().default('OTHER'),
    type: z.string().optional(),
    brokeragePercentage: z.number().min(0).max(100).optional().default(0),
    outstandingBalance: z.number().optional().default(0),
    phone: z.string().optional(),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    address: z.string().optional(),
    taxId: z.string().optional(),
    gstin: z.string().optional(),
    notes: z.string().optional(),
  }).refine((data) => Boolean(data.name || data.partyName), {
    message: 'Name or partyName is required',
    path: ['name'],
  })
});

export const updatePartySchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    partyName: z.string().min(1).optional(),
    partyType: z.enum(validPartyTypes).optional(),
    type: z.string().optional(),
    brokeragePercentage: z.number().min(0).max(100).optional(),
    outstandingBalance: z.number().optional(),
    phone: z.string().optional(),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    address: z.string().optional(),
    taxId: z.string().optional(),
    gstin: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
  })
});

