declare class RepairService {
    sendForRepair(diamondItemId: string, vendorPartyId: string, repairType: string, transactionId: string | null | undefined, cost: number, createdBy: string): Promise<{
        id: string;
        status: string;
        remarks: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        transactionId: string | null;
        diamondItemId: string;
        cost: import("@prisma/client/runtime/library").Decimal;
        repairType: string;
        vendorPartyId: string | null;
        dateSent: Date;
        dateCompleted: Date | null;
        caratBefore: import("@prisma/client/runtime/library").Decimal;
        caratAfter: import("@prisma/client/runtime/library").Decimal | null;
    }>;
}
export declare const repairService: RepairService;
export {};
//# sourceMappingURL=repair.service.d.ts.map