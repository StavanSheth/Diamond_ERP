export declare class RepairService {
    sendForRepair(diamondItemId: string, vendorPartyId: string, repairType: string, transactionId: string | null | undefined, cost: number, createdBy: string): Promise<{
        id: string;
        name: string | null;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        remarks: string | null;
        transactionId: string | null;
        diamondItemId: string;
        caratBefore: import("@prisma/client/runtime/library").Decimal;
        caratAfter: import("@prisma/client/runtime/library").Decimal | null;
        cost: import("@prisma/client/runtime/library").Decimal;
        repairType: string;
        vendorPartyId: string;
        dateSent: Date;
        dateCompleted: Date | null;
    }>;
}
export declare const repairService: RepairService;
//# sourceMappingURL=repair.service.d.ts.map