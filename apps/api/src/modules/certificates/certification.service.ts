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
import { CertificateState, CertificationStatus, ItemEventType } from '../../types/enums';
import { buildDiamondWhereClause } from '../../utils/filter.utils';
import { ConflictError, NotFoundError, ValidationError } from '../../errors';
import { parseSafeNumber } from '@diamond-erp/shared-utils';
import {
  assertCertificationTransition,
  assertCertificateStateTransition,
  CERT_STATUS_ON_LINK,
  CERT_STATUS_ON_UNLINK,
  DIAMOND_STATE_ON_LINK,
  DIAMOND_STATE_ON_UNLINK,
} from './certificate-state-machine';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePagination(query: ListCertificatesQuery): { skip: number; take: number } {
  const skip = query.skip ? parseInt(String(query.skip), 10) : 0;
  const rawTake = query.take ? parseInt(String(query.take), 10) : 100;
  return { skip, take: Math.min(Math.max(1, rawTake), 200) };
}

function normalizeReportNumber(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
  return null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CertificateService {

  // ── List ──────────────────────────────────────────────────────────────────

  async listCertificates(query: ListCertificatesQuery) {
    const { skip, take } = parsePagination(query);
    const diamondWhere = buildDiamondWhereClause(query as Record<string, unknown>);
    const where: Prisma.CertificationWhereInput =
      Object.keys(diamondWhere).length > 0 ? { diamondItem: diamondWhere } : {};

    const [total, certificates] = await prisma.$transaction([
      prisma.certification.count({ where }),
      prisma.certification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { diamondItem: { include: { stock: true } } },
      }),
    ]);

    return { total, certificates };
  }

  async listUnlinked(query: ListCertificatesQuery) {
    const { skip, take } = parsePagination(query);
    const where = { diamondItemId: null };

    const [total, certificates] = await prisma.$transaction([
      prisma.certification.count({ where }),
      prisma.certification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    ]);

    return { total, certificates };
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async createCertificate(input: CreateCertificateInput) {
    const reportNumber = normalizeReportNumber(input.reportNumber);

    if (reportNumber) {
      const existing = await prisma.certification.findUnique({ where: { reportNumber } });
      if (existing) {
        throw new ConflictError(`Certificate with report number "${reportNumber}" already exists`);
      }
    }

    return prisma.$transaction(async (tx) => {
      const cert = await tx.certification.create({
        data: {
          diamondItemId: input.diamondItemId || null,
          labType: input.labType || 'GIA',
          reportNumber,
          certificateStatus: CertificationStatus.PENDING,
          cost: input.cost !== undefined ? parseSafeNumber(input.cost, { defaultValue: 0, fieldName: 'cost' }) : 0,
          laserInscription: input.laserInscription || '',
          name: input.name || '',
        },
      });

      if (input.diamondItemId) {
        const diamond = await tx.diamondItem.findUnique({ where: { id: input.diamondItemId } });
        if (!diamond) throw new NotFoundError('Target diamond not found');

        // State machine: NONE or PENDING → PENDING (starting certification)
        const currentState = diamond.certificateStatus as CertificateState;
        if (currentState !== CertificateState.PENDING) {
          assertCertificateStateTransition(currentState, CertificateState.PENDING);
        }

        await tx.diamondItem.update({
          where: { id: input.diamondItemId },
          data: { certificateStatus: CertificateState.PENDING, currentCertificateId: cert.id },
        });
      }

      return cert;
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  /**
   * Updates certificate fields.
   * If `certificateStatus` is provided, validates it against the state machine.
   *
   * @returns Object containing the updated cert and the old pdfPath (if replaced),
   *          so the caller can schedule file deletion.
   */
  async updateCertificate(id: string, input: UpdateCertificateInput): Promise<{
    cert: Awaited<ReturnType<typeof prisma.certification.update>>;
    oldPdfPath: string | null;
  }> {
    const reportNumber = normalizeReportNumber(input.reportNumber);

    if (reportNumber) {
      const conflict = await prisma.certification.findFirst({
        where: { reportNumber, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictError(`Certificate with report number "${reportNumber}" already exists`);
      }
    }

    const existing = await prisma.certification.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Certificate not found');

    // Determine old PDF path for cleanup BEFORE the transaction modifies the record
    const oldPdfPath =
      input.pdfPath && existing.pdfPath && input.pdfPath !== existing.pdfPath
        ? existing.pdfPath
        : null;

    // Validate requested status transition if a new status is being set
    const rawStatus = input.certificateStatus || input.status;
    let newStatus: CertificationStatus | undefined;
    if (rawStatus) {
      if (!Object.values(CertificationStatus).includes(rawStatus as CertificationStatus)) {
        throw new ValidationError(`Unknown certificate status: ${rawStatus}`);
      }
      newStatus = rawStatus as CertificationStatus;
      assertCertificationTransition(
        existing.certificateStatus as CertificationStatus,
        newStatus,
      );
    }

    const cert = await prisma.$transaction(async (tx) => {
      const updated = await tx.certification.update({
        where: { id },
        data: {
          labType: input.labType,
          reportNumber,
          cost: input.cost !== undefined ? parseSafeNumber(input.cost, { fieldName: 'cost' }) : undefined,
          measurements: input.measurements,
          polish: input.polish,
          symmetry: input.symmetry,
          fluorescence: input.fluorescence,
          proportionDiagramPath: input.proportionDiagramPath,
          inclusionPlotPath: input.inclusionPlotPath,
          pdfPath: input.pdfPath,
          ...(newStatus ? { certificateStatus: newStatus } : {}),
        },
      });

      // Sync DiamondItem certificate state when a PDF arrives and status is ISSUED
      if (updated.diamondItemId && newStatus === CertificationStatus.ISSUED) {
        const diamond = await tx.diamondItem.findUnique({ where: { id: updated.diamondItemId } });
        if (diamond) {
          const currentState = diamond.certificateStatus as CertificateState;
          if (currentState !== DIAMOND_STATE_ON_LINK) {
            assertCertificateStateTransition(currentState, DIAMOND_STATE_ON_LINK);
          }
          await tx.diamondItem.update({
            where: { id: updated.diamondItemId },
            data: { certificateStatus: DIAMOND_STATE_ON_LINK, currentCertificateId: id },
          });
        }
      }

      return updated;
    });

    return { cert, oldPdfPath };
  }

  // ── Link / Unlink ─────────────────────────────────────────────────────────

  async linkCertificate(certId: string, diamondItemId: string) {
    if (!diamondItemId) {
      throw new ValidationError('diamondItemId is required to link a certificate');
    }

    return prisma.$transaction(async (tx) => {
      const cert = await tx.certification.findUnique({ where: { id: certId } });
      if (!cert) throw new NotFoundError('Certificate not found');

      const targetDiamond = await tx.diamondItem.findUnique({
        where: { id: diamondItemId },
        include: { stock: true },
      });
      if (!targetDiamond) throw new NotFoundError('Target diamond not found in this profile');

      // Validate CertificationStatus transition on the cert itself
      assertCertificationTransition(
        cert.certificateStatus as CertificationStatus,
        CERT_STATUS_ON_LINK,
      );

      // Validate CertificateState transition on the target diamond
      const targetState = targetDiamond.certificateStatus as CertificateState;
      if (targetState !== DIAMOND_STATE_ON_LINK) {
        assertCertificateStateTransition(targetState, DIAMOND_STATE_ON_LINK);
      }

      // 1. If target diamond had a different certificate, unlink the old cert
      if (targetDiamond.currentCertificateId && targetDiamond.currentCertificateId !== certId) {
        const oldCert = await tx.certification.findUnique({
          where: { id: targetDiamond.currentCertificateId },
        });
        if (oldCert) {
          assertCertificationTransition(
            oldCert.certificateStatus as CertificationStatus,
            CERT_STATUS_ON_UNLINK,
          );
        }
        await tx.certification.update({
          where: { id: targetDiamond.currentCertificateId },
          data: { diamondItemId: null, certificateStatus: CERT_STATUS_ON_UNLINK },
        });
      }

      // 2. If this cert was previously linked to a different diamond, unlink that diamond
      if (cert.diamondItemId && cert.diamondItemId !== diamondItemId) {
        await tx.diamondItem.updateMany({
          where: { id: cert.diamondItemId },
          data: { currentCertificateId: null, certificateStatus: DIAMOND_STATE_ON_UNLINK },
        });
      }

      // 3. Link cert to new diamond
      const updatedCert = await tx.certification.update({
        where: { id: certId },
        data: { diamondItemId, certificateStatus: CERT_STATUS_ON_LINK },
      });

      await tx.diamondItem.update({
        where: { id: diamondItemId },
        data: { certificateStatus: DIAMOND_STATE_ON_LINK, currentCertificateId: certId },
      });

      return updatedCert;
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  /**
   * Deletes a certificate record and unlinks any associated diamonds.
   *
   * @returns The pdfPath of the deleted certificate (may be null) so the caller
   *          can perform best-effort physical file deletion post-commit.
   */
  async deleteCertificate(id: string): Promise<string | null> {
    let pdfPath: string | null = null;

    await prisma.$transaction(async (tx) => {
      const cert = await tx.certification.findUnique({ where: { id } });
      if (!cert) throw new NotFoundError('Certificate not found');
      pdfPath = cert.pdfPath;

      await tx.diamondItem.updateMany({
        where: { currentCertificateId: id },
        data: { currentCertificateId: null, certificateStatus: DIAMOND_STATE_ON_UNLINK },
      });

      await tx.certification.delete({ where: { id } });
    });

    return pdfPath;
  }

  // ── Find ──────────────────────────────────────────────────────────────────

  async findById(id: string) {
    const cert = await prisma.certification.findUnique({ where: { id } });
    if (!cert) throw new NotFoundError('Certificate not found');
    return cert;
  }

  // ── Submit (existing) ─────────────────────────────────────────────────────

  async submitCertification(
    diamondItemId: string,
    labType: string,
    transactionId: string | null | undefined,
    createdBy: string,
    partyId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const diamondItem = await tx.diamondItem.findUnique({ where: { id: diamondItemId } });
      if (!diamondItem) throw new NotFoundError('Diamond not found');

      // State machine: diamond must be AVAILABLE or already in certification flow
      const currentState = diamondItem.certificateStatus as CertificateState;
      if (currentState !== CertificateState.PENDING) {
        assertCertificateStateTransition(currentState, CertificateState.PENDING);
      }

      const cert = await tx.certification.create({
        data: {
          diamondItemId,
          transactionId,
          labType,
          certificateStatus: CertificationStatus.PENDING,
        },
      });

      await tx.diamondItem.update({
        where: { id: diamondItemId },
        data: { certificateStatus: CertificateState.PENDING },
      });

      await tx.itemEvent.create({
        data: {
          diamondItemId,
          transactionId,
          eventType: ItemEventType.CERTIFIED,
          eventDate: new Date(),
          partyId,
          caratBefore: diamondItem.carat,
          caratAfter: diamondItem.carat,
          statusBefore: diamondItem.status,
          statusAfter: diamondItem.status,
          certificateBeforeId: diamondItem.currentCertificateId,
          createdBy,
          remarks: `Submitted to ${labType}`,
        },
      });

      return cert;
    });
  }
}

export const certificateService = new CertificateService();
