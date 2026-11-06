/**
 * CertificateService
 *
 * Business logic layer for all certificate operations.
 * Controllers must NOT access prisma or fs directly — delegate here.
 *
 * Responsibilities:
 *  - Enforce certificate state machine transitions
 *  - Manage cross-entity consistency (Certification ↔ DiamondItem)
 *  - Own all DB transaction boundaries
 *  - Return pdfPath to callers for post-commit file cleanup
 *    (file I/O is the controller/FileStorageService responsibility)
 *
 * Finding 31: Certificate DB/file lifecycle needs explicit error handling.
 * Finding 33: Profile-scoped certificate/diamond queries.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../infrastructure/database/prisma';
export interface CreateCertificateInput {
    diamondItemId?: string | null;
    labType?: string;
    reportNumber?: string | null;
    cost?: number | string;
    laserInscription?: string;
    name?: string;
}
export interface UpdateCertificateInput {
    labType?: string;
    reportNumber?: string | null;
    cost?: number | string;
    measurements?: string;
    polish?: string;
    symmetry?: string;
    fluorescence?: string;
    proportionDiagramPath?: string;
    inclusionPlotPath?: string;
    pdfPath?: string;
    /** If supplied, transition is validated against the state machine. */
    certificateStatus?: string;
    /** Alias accepted from legacy API consumers. */
    status?: string;
}
export interface ListCertificatesQuery {
    skip?: string | number;
    take?: string | number;
    [key: string]: unknown;
}
export declare class CertificateService {
    listCertificates(query: ListCertificatesQuery): Promise<{
        total: number;
        certificates: ({
            diamondItem: ({
                stock: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    name: string;
                    currency: string;
                    description: string | null;
                    stockCode: string;
                    isActive: boolean;
                };
            } & {
                version: number;
                id: string;
                status: string;
                createdAt: Date;
                updatedAt: Date;
                stockId: string;
                itemCode: string;
                displayName: string;
                carat: Prisma.Decimal;
                color: string;
                clarity: string;
                cut: string;
                shape: string;
                polish: string | null;
                symmetry: string | null;
                fluorescence: string | null;
                category: string;
                lengthMm: Prisma.Decimal | null;
                widthMm: Prisma.Decimal | null;
                depthMm: Prisma.Decimal | null;
                ratePerCarat: Prisma.Decimal;
                currentValue: Prisma.Decimal;
                locationId: string | null;
                certificateStatus: string;
                currentCertificateId: string | null;
            }) | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string | null;
            polish: string | null;
            symmetry: string | null;
            fluorescence: string | null;
            certificateStatus: string | null;
            transactionId: string | null;
            diamondItemId: string | null;
            reportNumber: string | null;
            labType: string | null;
            cost: Prisma.Decimal | null;
            measurements: string | null;
            laserInscription: string | null;
            naturalOrLabGrown: string | null;
            pdfPath: string | null;
            proportionDiagramPath: string | null;
            inclusionPlotPath: string | null;
        })[];
    }>;
    listUnlinked(query: ListCertificatesQuery): Promise<{
        total: number;
        certificates: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string | null;
            polish: string | null;
            symmetry: string | null;
            fluorescence: string | null;
            certificateStatus: string | null;
            transactionId: string | null;
            diamondItemId: string | null;
            reportNumber: string | null;
            labType: string | null;
            cost: Prisma.Decimal | null;
            measurements: string | null;
            laserInscription: string | null;
            naturalOrLabGrown: string | null;
            pdfPath: string | null;
            proportionDiagramPath: string | null;
            inclusionPlotPath: string | null;
        }[];
    }>;
    createCertificate(input: CreateCertificateInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        polish: string | null;
        symmetry: string | null;
        fluorescence: string | null;
        certificateStatus: string | null;
        transactionId: string | null;
        diamondItemId: string | null;
        reportNumber: string | null;
        labType: string | null;
        cost: Prisma.Decimal | null;
        measurements: string | null;
        laserInscription: string | null;
        naturalOrLabGrown: string | null;
        pdfPath: string | null;
        proportionDiagramPath: string | null;
        inclusionPlotPath: string | null;
    }>;
    /**
     * Updates certificate fields.
     * If `certificateStatus` is provided, validates it against the state machine.
     *
     * @returns Object containing the updated cert and the old pdfPath (if replaced),
     *          so the caller can schedule file deletion.
     */
    updateCertificate(id: string, input: UpdateCertificateInput): Promise<{
        cert: Awaited<ReturnType<typeof prisma.certification.update>>;
        oldPdfPath: string | null;
    }>;
    linkCertificate(certId: string, diamondItemId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        polish: string | null;
        symmetry: string | null;
        fluorescence: string | null;
        certificateStatus: string | null;
        transactionId: string | null;
        diamondItemId: string | null;
        reportNumber: string | null;
        labType: string | null;
        cost: Prisma.Decimal | null;
        measurements: string | null;
        laserInscription: string | null;
        naturalOrLabGrown: string | null;
        pdfPath: string | null;
        proportionDiagramPath: string | null;
        inclusionPlotPath: string | null;
    }>;
    /**
     * Deletes a certificate record and unlinks any associated diamonds.
     *
     * @returns The pdfPath of the deleted certificate (may be null) so the caller
     *          can perform best-effort physical file deletion post-commit.
     */
    deleteCertificate(id: string): Promise<string | null>;
    findById(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        polish: string | null;
        symmetry: string | null;
        fluorescence: string | null;
        certificateStatus: string | null;
        transactionId: string | null;
        diamondItemId: string | null;
        reportNumber: string | null;
        labType: string | null;
        cost: Prisma.Decimal | null;
        measurements: string | null;
        laserInscription: string | null;
        naturalOrLabGrown: string | null;
        pdfPath: string | null;
        proportionDiagramPath: string | null;
        inclusionPlotPath: string | null;
    }>;
    submitCertification(diamondItemId: string, labType: string, transactionId: string | null | undefined, createdBy: string, partyId?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        polish: string | null;
        symmetry: string | null;
        fluorescence: string | null;
        certificateStatus: string | null;
        transactionId: string | null;
        diamondItemId: string | null;
        reportNumber: string | null;
        labType: string | null;
        cost: Prisma.Decimal | null;
        measurements: string | null;
        laserInscription: string | null;
        naturalOrLabGrown: string | null;
        pdfPath: string | null;
        proportionDiagramPath: string | null;
        inclusionPlotPath: string | null;
    }>;
}
export declare const certificateService: CertificateService;
//# sourceMappingURL=certification.service.d.ts.map