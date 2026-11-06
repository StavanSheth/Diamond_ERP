import { z } from 'zod';
export declare const createPartySchema: z.ZodObject<{
    body: z.ZodObject<{
        partyCode: z.ZodOptional<z.ZodString>;
        nickname: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        partyName: z.ZodOptional<z.ZodString>;
        partyType: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            SUPPLIER: "SUPPLIER";
            CUSTOMER: "CUSTOMER";
            WORKSHOP: "WORKSHOP";
            OTHER: "OTHER";
            BROKER: "BROKER";
            BROKER_CLIENT: "BROKER_CLIENT";
            CERTIFICATION_LAB: "CERTIFICATION_LAB";
            LAB: "LAB";
        }>>>;
        type: z.ZodOptional<z.ZodString>;
        brokeragePercentage: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        outstandingBalance: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        phone: z.ZodOptional<z.ZodString>;
        email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
        address: z.ZodOptional<z.ZodString>;
        taxId: z.ZodOptional<z.ZodString>;
        gstin: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const updatePartySchema: z.ZodObject<{
    body: z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        partyName: z.ZodOptional<z.ZodString>;
        partyType: z.ZodOptional<z.ZodEnum<{
            SUPPLIER: "SUPPLIER";
            CUSTOMER: "CUSTOMER";
            WORKSHOP: "WORKSHOP";
            OTHER: "OTHER";
            BROKER: "BROKER";
            BROKER_CLIENT: "BROKER_CLIENT";
            CERTIFICATION_LAB: "CERTIFICATION_LAB";
            LAB: "LAB";
        }>>;
        type: z.ZodOptional<z.ZodString>;
        brokeragePercentage: z.ZodOptional<z.ZodNumber>;
        outstandingBalance: z.ZodOptional<z.ZodNumber>;
        phone: z.ZodOptional<z.ZodString>;
        email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
        address: z.ZodOptional<z.ZodString>;
        taxId: z.ZodOptional<z.ZodString>;
        gstin: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodString>;
        isActive: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>;
//# sourceMappingURL=party.validator.d.ts.map