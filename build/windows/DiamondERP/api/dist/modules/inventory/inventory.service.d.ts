declare class InventoryService {
    /**
     * Concurrency-safe item transfer between stocks and locations.
     * Enforces optimistic conditional updates to prevent race conditions during simultaneous transfers.
     */
    transferItem(diamondItemId: string, toStockId: string, toLocationId: string | null, createdBy: string, remarks?: string): Promise<{
        stockId: string;
        locationId: string | null;
        version: number;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        itemCode: string;
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
        certificateStatus: string;
        currentCertificateId: string | null;
    }>;
}
export declare const inventoryService: InventoryService;
export {};
//# sourceMappingURL=inventory.service.d.ts.map