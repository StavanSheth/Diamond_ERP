export declare class TransformationService {
    processTransformation(diamondItemId: string, transformationType: string, caratAfter: number, cost: number, createdBy: string, remarks?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        remarks: string | null;
        transactionId: string | null;
        caratBefore: import("@prisma/client/runtime/library").Decimal;
        caratAfter: import("@prisma/client/runtime/library").Decimal | null;
        valueBefore: import("@prisma/client/runtime/library").Decimal;
        valueAfter: import("@prisma/client/runtime/library").Decimal | null;
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
        cost: import("@prisma/client/runtime/library").Decimal;
        vendorPartyId: string | null;
        dateCompleted: Date | null;
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
//# sourceMappingURL=transformation.service.d.ts.map