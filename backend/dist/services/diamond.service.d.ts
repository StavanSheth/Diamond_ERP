interface RepairPayload {
    diamondItemId: string;
    vendorPartyId: string;
    repairType: string;
    cost: number;
    remarks?: string;
    dateSent: Date;
}
interface CertificationPayload {
    diamondItemId: string;
    labType: string;
    reportNumber: string;
    cost: number;
}
export declare class DiamondItemService {
    /**
     * Send a diamond out for repair.
     */
    sendForRepair(payload: RepairPayload, createdBy: string): Promise<{
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
    /**
     * Add a certification to a diamond.
     */
    addCertification(payload: CertificationPayload, createdBy: string): Promise<{
        id: string;
        name: string | null;
        createdAt: Date;
        updatedAt: Date;
        polish: string | null;
        symmetry: string | null;
        fluorescence: string | null;
        certificateStatus: string | null;
        transactionId: string | null;
        diamondItemId: string | null;
        labType: string | null;
        reportNumber: string | null;
        cost: import("@prisma/client/runtime/library").Decimal | null;
        measurements: string | null;
        laserInscription: string | null;
        naturalOrLabGrown: string | null;
        pdfPath: string | null;
        proportionDiagramPath: string | null;
        inclusionPlotPath: string | null;
    }>;
}
export declare const diamondItemService: DiamondItemService;
export {};
//# sourceMappingURL=diamond.service.d.ts.map