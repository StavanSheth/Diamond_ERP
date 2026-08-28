export declare class CertificationService {
    submitCertification(diamondItemId: string, labType: string, transactionId: string | null | undefined, createdBy: string, partyId?: string): Promise<{
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
export declare const certificationService: CertificationService;
//# sourceMappingURL=certification.service.d.ts.map