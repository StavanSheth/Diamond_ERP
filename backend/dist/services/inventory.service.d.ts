export declare class InventoryService {
    transferItem(diamondItemId: string, toStockId: string, toLocationId: string | null, createdBy: string, remarks?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        itemCode: string;
        stockId: string;
        displayName: string;
        carat: import("@prisma/client/runtime/library").Decimal;
        color: string;
        clarity: string;
        cut: string;
        shape: string;
        polish: string | null;
        symmetry: string | null;
        fluorescence: string | null;
        category: string;
        lengthMm: import("@prisma/client/runtime/library").Decimal | null;
        widthMm: import("@prisma/client/runtime/library").Decimal | null;
        depthMm: import("@prisma/client/runtime/library").Decimal | null;
        ratePerCarat: import("@prisma/client/runtime/library").Decimal;
        currentValue: import("@prisma/client/runtime/library").Decimal;
        status: string;
        locationId: string | null;
        certificateStatus: string;
        currentCertificateId: string | null;
    }>;
}
export declare const inventoryService: InventoryService;
//# sourceMappingURL=inventory.service.d.ts.map