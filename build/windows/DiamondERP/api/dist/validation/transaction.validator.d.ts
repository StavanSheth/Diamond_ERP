import { z } from 'zod';
export declare const createTransactionSchema: z.ZodObject<{
    body: z.ZodObject<{
        ledgerId: z.ZodString;
        transactionType: z.ZodString;
        transactionDate: z.ZodPipe<z.ZodUnion<[z.ZodString, z.ZodDate]>, z.ZodTransform<Date, string | Date>>;
        partyId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        remarks: z.ZodOptional<z.ZodString>;
        referenceNo: z.ZodOptional<z.ZodString>;
        createdBy: z.ZodString;
        totalCarat: z.ZodNumber;
        totalValue: z.ZodNumber;
        status: z.ZodDefault<z.ZodEnum<{
            DRAFT: "DRAFT";
            PENDING_AUTHORIZATION: "PENDING_AUTHORIZATION";
            AUTHORIZED: "AUTHORIZED";
            POSTED: "POSTED";
            CANCELLED: "CANCELLED";
            REVERSED: "REVERSED";
        }>>;
        paymentType: z.ZodOptional<z.ZodEnum<{
            TO_COLLECT: "TO_COLLECT";
            TO_PAY: "TO_PAY";
        }>>;
        paymentStatus: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            PARTIAL: "PARTIAL";
            PENDING: "PENDING";
            COMPLETED: "COMPLETED";
        }>>>;
        paymentDone: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        paymentDue: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        brokeragePercentage: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        brokerageAmount: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        brokerageType: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            INCLUSIVE: "INCLUSIVE";
            EXCLUSIVE: "EXCLUSIVE";
        }>>>;
        items: z.ZodArray<z.ZodObject<{
            diamondItemId: z.ZodOptional<z.ZodString>;
            itemCode: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
            displayName: z.ZodOptional<z.ZodString>;
            carat: z.ZodNumber;
            color: z.ZodOptional<z.ZodString>;
            clarity: z.ZodOptional<z.ZodString>;
            cut: z.ZodOptional<z.ZodString>;
            shape: z.ZodOptional<z.ZodString>;
            ratePerCarat: z.ZodNumber;
            totalValue: z.ZodNumber;
            itemAction: z.ZodEnum<{
                IN: "IN";
                OUT: "OUT";
                UPDATE: "UPDATE";
                NO_CHANGE: "NO_CHANGE";
            }>;
            category: z.ZodOptional<z.ZodString>;
            polish: z.ZodOptional<z.ZodString>;
            linkedCertificateId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            labType: z.ZodOptional<z.ZodString>;
            internalNotes: z.ZodOptional<z.ZodString>;
            certCost: z.ZodOptional<z.ZodNumber>;
            repairType: z.ZodOptional<z.ZodString>;
            repairVendorId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            repairCost: z.ZodOptional<z.ZodNumber>;
            linkedRepairId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            existingDiamondId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            fromLocationId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            toLocationId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            toStockId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
//# sourceMappingURL=transaction.validator.d.ts.map