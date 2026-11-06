"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.certificateService = exports.CertificateService = void 0;
const prisma_1 = __importDefault(require("../../infrastructure/database/prisma"));
const enums_1 = require("../../types/enums");
const filter_utils_1 = require("../../utils/filter.utils");
const errors_1 = require("../../errors");
const shared_utils_1 = require("@diamond-erp/shared-utils");
const certificate_state_machine_1 = require("./certificate-state-machine");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parsePagination(query) {
    const skip = query.skip ? parseInt(String(query.skip), 10) : 0;
    const rawTake = query.take ? parseInt(String(query.take), 10) : 100;
    return { skip, take: Math.min(Math.max(1, rawTake), 200) };
}
function normalizeReportNumber(raw) {
    if (typeof raw === 'string' && raw.trim() !== '')
        return raw.trim();
    return null;
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class CertificateService {
    // ── List ──────────────────────────────────────────────────────────────────
    async listCertificates(query) {
        const { skip, take } = parsePagination(query);
        const diamondWhere = (0, filter_utils_1.buildDiamondWhereClause)(query);
        const where = Object.keys(diamondWhere).length > 0 ? { diamondItem: diamondWhere } : {};
        const [total, certificates] = await prisma_1.default.$transaction([
            prisma_1.default.certification.count({ where }),
            prisma_1.default.certification.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: { diamondItem: { include: { stock: true } } },
            }),
        ]);
        return { total, certificates };
    }
    async listUnlinked(query) {
        const { skip, take } = parsePagination(query);
        const where = { diamondItemId: null };
        const [total, certificates] = await prisma_1.default.$transaction([
            prisma_1.default.certification.count({ where }),
            prisma_1.default.certification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        ]);
        return { total, certificates };
    }
    // ── Create ────────────────────────────────────────────────────────────────
    async createCertificate(input) {
        const reportNumber = normalizeReportNumber(input.reportNumber);
        if (reportNumber) {
            const existing = await prisma_1.default.certification.findUnique({ where: { reportNumber } });
            if (existing) {
                throw new errors_1.ConflictError(`Certificate with report number "${reportNumber}" already exists`);
            }
        }
        return prisma_1.default.$transaction(async (tx) => {
            const cert = await tx.certification.create({
                data: {
                    diamondItemId: input.diamondItemId || null,
                    labType: input.labType || 'GIA',
                    reportNumber,
                    certificateStatus: enums_1.CertificationStatus.PENDING,
                    cost: input.cost !== undefined ? (0, shared_utils_1.parseSafeNumber)(input.cost, { defaultValue: 0, fieldName: 'cost' }) : 0,
                    laserInscription: input.laserInscription || '',
                    name: input.name || '',
                },
            });
            if (input.diamondItemId) {
                const diamond = await tx.diamondItem.findUnique({ where: { id: input.diamondItemId } });
                if (!diamond)
                    throw new errors_1.NotFoundError('Target diamond not found');
                // State machine: NONE or PENDING → PENDING (starting certification)
                const currentState = diamond.certificateStatus;
                if (currentState !== enums_1.CertificateState.PENDING) {
                    (0, certificate_state_machine_1.assertCertificateStateTransition)(currentState, enums_1.CertificateState.PENDING);
                }
                await tx.diamondItem.update({
                    where: { id: input.diamondItemId },
                    data: { certificateStatus: enums_1.CertificateState.PENDING, currentCertificateId: cert.id },
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
    async updateCertificate(id, input) {
        const reportNumber = normalizeReportNumber(input.reportNumber);
        if (reportNumber) {
            const conflict = await prisma_1.default.certification.findFirst({
                where: { reportNumber, id: { not: id } },
            });
            if (conflict) {
                throw new errors_1.ConflictError(`Certificate with report number "${reportNumber}" already exists`);
            }
        }
        const existing = await prisma_1.default.certification.findUnique({ where: { id } });
        if (!existing)
            throw new errors_1.NotFoundError('Certificate not found');
        // Determine old PDF path for cleanup BEFORE the transaction modifies the record
        const oldPdfPath = input.pdfPath && existing.pdfPath && input.pdfPath !== existing.pdfPath
            ? existing.pdfPath
            : null;
        // Validate requested status transition if a new status is being set
        const rawStatus = input.certificateStatus || input.status;
        let newStatus;
        if (rawStatus) {
            if (!Object.values(enums_1.CertificationStatus).includes(rawStatus)) {
                throw new errors_1.ValidationError(`Unknown certificate status: ${rawStatus}`);
            }
            newStatus = rawStatus;
            (0, certificate_state_machine_1.assertCertificationTransition)(existing.certificateStatus, newStatus);
        }
        const cert = await prisma_1.default.$transaction(async (tx) => {
            const updated = await tx.certification.update({
                where: { id },
                data: {
                    labType: input.labType,
                    reportNumber,
                    cost: input.cost !== undefined ? (0, shared_utils_1.parseSafeNumber)(input.cost, { fieldName: 'cost' }) : undefined,
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
            if (updated.diamondItemId && newStatus === enums_1.CertificationStatus.ISSUED) {
                const diamond = await tx.diamondItem.findUnique({ where: { id: updated.diamondItemId } });
                if (diamond) {
                    const currentState = diamond.certificateStatus;
                    if (currentState !== certificate_state_machine_1.DIAMOND_STATE_ON_LINK) {
                        (0, certificate_state_machine_1.assertCertificateStateTransition)(currentState, certificate_state_machine_1.DIAMOND_STATE_ON_LINK);
                    }
                    await tx.diamondItem.update({
                        where: { id: updated.diamondItemId },
                        data: { certificateStatus: certificate_state_machine_1.DIAMOND_STATE_ON_LINK, currentCertificateId: id },
                    });
                }
            }
            return updated;
        });
        return { cert, oldPdfPath };
    }
    // ── Link / Unlink ─────────────────────────────────────────────────────────
    async linkCertificate(certId, diamondItemId) {
        if (!diamondItemId) {
            throw new errors_1.ValidationError('diamondItemId is required to link a certificate');
        }
        return prisma_1.default.$transaction(async (tx) => {
            const cert = await tx.certification.findUnique({ where: { id: certId } });
            if (!cert)
                throw new errors_1.NotFoundError('Certificate not found');
            const targetDiamond = await tx.diamondItem.findUnique({
                where: { id: diamondItemId },
                include: { stock: true },
            });
            if (!targetDiamond)
                throw new errors_1.NotFoundError('Target diamond not found in this profile');
            // Validate CertificationStatus transition on the cert itself
            (0, certificate_state_machine_1.assertCertificationTransition)(cert.certificateStatus, certificate_state_machine_1.CERT_STATUS_ON_LINK);
            // Validate CertificateState transition on the target diamond
            const targetState = targetDiamond.certificateStatus;
            if (targetState !== certificate_state_machine_1.DIAMOND_STATE_ON_LINK) {
                (0, certificate_state_machine_1.assertCertificateStateTransition)(targetState, certificate_state_machine_1.DIAMOND_STATE_ON_LINK);
            }
            // 1. If target diamond had a different certificate, unlink the old cert
            if (targetDiamond.currentCertificateId && targetDiamond.currentCertificateId !== certId) {
                const oldCert = await tx.certification.findUnique({
                    where: { id: targetDiamond.currentCertificateId },
                });
                if (oldCert) {
                    (0, certificate_state_machine_1.assertCertificationTransition)(oldCert.certificateStatus, certificate_state_machine_1.CERT_STATUS_ON_UNLINK);
                }
                await tx.certification.update({
                    where: { id: targetDiamond.currentCertificateId },
                    data: { diamondItemId: null, certificateStatus: certificate_state_machine_1.CERT_STATUS_ON_UNLINK },
                });
            }
            // 2. If this cert was previously linked to a different diamond, unlink that diamond
            if (cert.diamondItemId && cert.diamondItemId !== diamondItemId) {
                await tx.diamondItem.updateMany({
                    where: { id: cert.diamondItemId },
                    data: { currentCertificateId: null, certificateStatus: certificate_state_machine_1.DIAMOND_STATE_ON_UNLINK },
                });
            }
            // 3. Link cert to new diamond
            const updatedCert = await tx.certification.update({
                where: { id: certId },
                data: { diamondItemId, certificateStatus: certificate_state_machine_1.CERT_STATUS_ON_LINK },
            });
            await tx.diamondItem.update({
                where: { id: diamondItemId },
                data: { certificateStatus: certificate_state_machine_1.DIAMOND_STATE_ON_LINK, currentCertificateId: certId },
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
    async deleteCertificate(id) {
        let pdfPath = null;
        await prisma_1.default.$transaction(async (tx) => {
            const cert = await tx.certification.findUnique({ where: { id } });
            if (!cert)
                throw new errors_1.NotFoundError('Certificate not found');
            pdfPath = cert.pdfPath;
            await tx.diamondItem.updateMany({
                where: { currentCertificateId: id },
                data: { currentCertificateId: null, certificateStatus: certificate_state_machine_1.DIAMOND_STATE_ON_UNLINK },
            });
            await tx.certification.delete({ where: { id } });
        });
        return pdfPath;
    }
    // ── Find ──────────────────────────────────────────────────────────────────
    async findById(id) {
        const cert = await prisma_1.default.certification.findUnique({ where: { id } });
        if (!cert)
            throw new errors_1.NotFoundError('Certificate not found');
        return cert;
    }
    // ── Submit (existing) ─────────────────────────────────────────────────────
    async submitCertification(diamondItemId, labType, transactionId, createdBy, partyId) {
        return prisma_1.default.$transaction(async (tx) => {
            const diamondItem = await tx.diamondItem.findUnique({ where: { id: diamondItemId } });
            if (!diamondItem)
                throw new errors_1.NotFoundError('Diamond not found');
            // State machine: diamond must be AVAILABLE or already in certification flow
            const currentState = diamondItem.certificateStatus;
            if (currentState !== enums_1.CertificateState.PENDING) {
                (0, certificate_state_machine_1.assertCertificateStateTransition)(currentState, enums_1.CertificateState.PENDING);
            }
            const cert = await tx.certification.create({
                data: {
                    diamondItemId,
                    transactionId,
                    labType,
                    certificateStatus: enums_1.CertificationStatus.PENDING,
                },
            });
            await tx.diamondItem.update({
                where: { id: diamondItemId },
                data: { certificateStatus: enums_1.CertificateState.PENDING },
            });
            await tx.itemEvent.create({
                data: {
                    diamondItemId,
                    transactionId,
                    eventType: enums_1.ItemEventType.CERTIFIED,
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
exports.CertificateService = CertificateService;
exports.certificateService = new CertificateService();
//# sourceMappingURL=certification.service.js.map