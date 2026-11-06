"use strict";
/**
 * CertificateController
 *
 * Thin HTTP adapter — validates input, delegates to CertificateService
 * and FileStorageService, then formats the response.
 *
 * This controller has NO direct `fs` or `path` imports.
 * All file I/O goes through FileStorageService.
 * All business logic and DB access goes through CertificateService.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CertificateController = void 0;
const certification_service_1 = require("./certification.service");
const file_storage_service_1 = require("../../infrastructure/storage/file-storage.service");
const errors_1 = require("../../errors");
class CertificateController {
    constructor() {
        // ── List ──────────────────────────────────────────────────────────────────
        this.getCertificates = async (req, res, next) => {
            try {
                const { total, certificates } = await certification_service_1.certificateService.listCertificates(req.query);
                const formatted = certificates.map((c) => ({
                    id: c.id,
                    certificateId: c.id,
                    diamondItemId: c.diamondItemId,
                    name: c.name,
                    stockItemId: c.diamondItem?.itemCode || c.diamondItemId,
                    stockName: c.diamondItem?.stock?.name || (c.diamondItem ? 'Diamond Stock' : 'Standalone'),
                    itemName: c.name ||
                        (c.diamondItem
                            ? `${c.diamondItem.clarity || ''} ${c.diamondItem.shape || 'Unknown'}`
                            : ''),
                    labType: c.labType,
                    certificateStatus: c.certificateStatus,
                    reportNumber: c.reportNumber,
                    cost: c.cost ? Number(c.cost) : 0,
                    measurements: c.measurements,
                    polish: c.polish,
                    symmetry: c.symmetry,
                    fluorescence: c.fluorescence,
                    proportionDiagramPath: c.proportionDiagramPath,
                    inclusionPlotPath: c.inclusionPlotPath,
                    laserInscription: c.laserInscription,
                    naturalOrLabGrown: c.naturalOrLabGrown,
                    pdfPath: c.pdfPath,
                    createdDate: c.createdAt,
                    updatedAt: c.updatedAt,
                }));
                res.json({ success: true, data: formatted, total });
            }
            catch (error) {
                next(error);
            }
        };
        this.getUnlinkedCertificates = async (req, res, next) => {
            try {
                const { total, certificates } = await certification_service_1.certificateService.listUnlinked(req.query);
                const formatted = certificates.map((c) => ({
                    certificateId: c.id,
                    labType: c.labType,
                    certificateStatus: c.certificateStatus,
                    reportNumber: c.reportNumber,
                    cost: c.cost ? Number(c.cost) : 0,
                    measurements: c.measurements,
                    polish: c.polish,
                    symmetry: c.symmetry,
                    fluorescence: c.fluorescence,
                    laserInscription: c.laserInscription,
                }));
                res.json({ success: true, data: formatted, total });
            }
            catch (error) {
                next(error);
            }
        };
        // ── Create ────────────────────────────────────────────────────────────────
        this.createCertificate = async (req, res, next) => {
            try {
                const newCert = await certification_service_1.certificateService.createCertificate(req.body);
                res.status(201).json({ success: true, certificateId: newCert.id, data: newCert });
            }
            catch (error) {
                next(error);
            }
        };
        // ── Update ────────────────────────────────────────────────────────────────
        this.updateCertificate = async (req, res, next) => {
            try {
                const id = req.params.id;
                const { cert, oldPdfPath } = await certification_service_1.certificateService.updateCertificate(id, req.body);
                // Best-effort physical file cleanup after successful DB commit
                if (oldPdfPath) {
                    file_storage_service_1.fileStorageService.delete(oldPdfPath);
                }
                res.json({ success: true, certificateId: id, data: cert });
            }
            catch (error) {
                next(error);
            }
        };
        // ── Link ──────────────────────────────────────────────────────────────────
        this.linkCertificate = async (req, res, next) => {
            try {
                const id = req.params.id;
                const { diamondItemId } = req.body;
                const updated = await certification_service_1.certificateService.linkCertificate(id, diamondItemId);
                res.json({ success: true, data: updated });
            }
            catch (error) {
                next(error);
            }
        };
        // ── Delete ────────────────────────────────────────────────────────────────
        this.delete = async (req, res, next) => {
            try {
                const id = req.params.id;
                const pdfPath = await certification_service_1.certificateService.deleteCertificate(id);
                // Best-effort physical file cleanup after successful DB commit
                if (pdfPath) {
                    file_storage_service_1.fileStorageService.delete(pdfPath);
                }
                res.json({ success: true, message: 'Certificate deleted successfully' });
            }
            catch (error) {
                next(error);
            }
        };
        // ── File upload / download ────────────────────────────────────────────────
        this.uploadPdf = async (req, res, next) => {
            try {
                if (!req.file) {
                    throw new errors_1.ValidationError('No file uploaded');
                }
                // Validate magic bytes — service throws ValidationError and cleans up temp file on failure
                file_storage_service_1.fileStorageService.validatePdfMagicBytes(req.file.path);
                // Return only the randomised server filename — never the user-supplied original name
                const filename = req.file.filename;
                res.json({ success: true, data: { path: filename } });
            }
            catch (error) {
                // Clean up temp file on any error path not already handled by validatePdfMagicBytes
                if (req.file) {
                    file_storage_service_1.fileStorageService.delete(req.file.path);
                }
                next(error);
            }
        };
        this.downloadPdf = async (req, res, next) => {
            try {
                const id = req.params.id;
                const cert = await certification_service_1.certificateService.findById(id);
                if (!cert.pdfPath) {
                    throw new errors_1.NotFoundError('Certificate has no associated file');
                }
                const stream = file_storage_service_1.fileStorageService.stream(cert.pdfPath);
                // Header sanitization against CRLF injection
                const safeReportNumber = (cert.reportNumber || 'certificate').replace(/[^a-zA-Z0-9_-]/g, '_');
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename="${safeReportNumber}.pdf"`);
                res.setHeader('X-Content-Type-Options', 'nosniff');
                stream.pipe(res);
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.CertificateController = CertificateController;
//# sourceMappingURL=certificate.controller.js.map