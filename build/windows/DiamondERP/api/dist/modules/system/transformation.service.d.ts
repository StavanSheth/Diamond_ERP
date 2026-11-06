import { Prisma } from '@prisma/client';
declare class TransformationService {
    processTransformation(diamondItemId: string, transformationType: string, caratAfter: number, cost: number, createdBy: string, remarks?: string): Promise<{
        id: string;
        status: string;
        remarks: string | null;
        createdAt: Date;
        updatedAt: Date;
        transactionId: string | null;
        cost: Prisma.Decimal;
        vendorPartyId: string | null;
        dateCompleted: Date | null;
        caratBefore: Prisma.Decimal;
        caratAfter: Prisma.Decimal | null;
        valueBefore: Prisma.Decimal;
        valueAfter: Prisma.Decimal | null;
        polishBefore: string | null;
        polishAfter: string | null;
        symmetryBefore: string | null;
        symmetryAfter: string | null;
        colorBefore: string | null;
        colorAfter: string | null;
        clarityBefore: string | null;
        clarityAfter: string | null;
        cutBefore: string | null;
        cutAfter: string | null;
        transformationType: string;
        dateStarted: Date;
    }>;
    processSplit(parentDiamondId: string, childItems: {
        itemCode: string;
        carat: number;
        value: number;
        color?: string;
        clarity?: string;
        cut?: string;
        shape?: string;
    }[], _createdBy: string, cost?: number, remarks?: string): Promise<any>;
}
export declare const transformationService: TransformationService;
export {};
//# sourceMappingURL=transformation.service.d.ts.map