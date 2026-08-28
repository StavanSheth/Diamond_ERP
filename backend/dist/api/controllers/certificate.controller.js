"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CertificateController = void 0;
const prisma_1 = __importDefault(require("../../providers/db/prisma"));
const enums_1 = require("../../types/enums");
class CertificateController {
    constructor() {
        this.getCertificates = async (_req, res, next) => {
            try {
                const certificates = await prisma_1.default.certification.findMany({
                    include: {
                        diamondItem: true
                    }
                });
                const formatted = certificates.map(c => ({
                    id: c.id, // Added for UI compatibility
                    certificateId: c.id,
                    diamondItemId: c.diamondItemId, // Added for UI mapping
                    name: c.name, // Added for UI mapping
                    stockItemId: c.diamondItem?.itemCode || c.diamondItemId,
                    itemName: c.name || (c.diamondItem ? `${c.diamondItem.clarity || ''} ${c.diamondItem.shape || 'Unknown'}` : ''),
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
                    updatedAt: c.updatedAt
                }));
                res.json({ success: true, data: formatted });
            }
            catch (error) {
                next(error);
            }
        };
        this.getUnlinkedCertificates = async (_req, res, next) => {
            try {
                const certificates = await prisma_1.default.certification.findMany({
                    where: { diamondItemId: null }
                });
                const formatted = certificates.map(c => ({
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
                res.json({ success: true, data: formatted });
            }
            catch (error) {
                next(error);
            }
        };
        this.linkCertificate = async (req, res, next) => {
            try {
                const id = req.params.id;
                const { diamondItemId } = req.body;
                const updated = await prisma_1.default.certification.update({
                    where: { id },
                    data: { diamondItemId }
                });
                await prisma_1.default.diamondItem.update({
                    where: { id: diamondItemId },
                    data: { certificateStatus: enums_1.CertificateState.RECEIVED, currentCertificateId: id }
                });
                res.json({ success: true, data: updated });
            }
            catch (error) {
                next(error);
            }
        };
        this.createCertificate = async (req, res, next) => {
            try {
                const { diamondItemId, labType, reportNumber, cost, internalNotes, name } = req.body;
                const newCert = await prisma_1.default.certification.create({
                    data: {
                        diamondItemId: diamondItemId, // Assumes frontend sends actual Prisma diamondItem ID
                        labType: labType || '',
                        reportNumber: reportNumber || '',
                        certificateStatus: enums_1.CertificationStatus.PENDING,
                        cost: cost || 0,
                        laserInscription: internalNotes || '',
                        name: name || '',
                    }
                });
                res.status(201).json({ success: true, certificateId: newCert.id });
            }
            catch (error) {
                next(error);
            }
        };
        this.updateCertificate = async (req, res, next) => {
            try {
                const id = req.params.id;
                const updated = await prisma_1.default.certification.update({
                    where: { id },
                    data: {
                        labType: req.body.labType,
                        reportNumber: req.body.reportNumber,
                        cost: req.body.cost,
                        measurements: req.body.measurements,
                        polish: req.body.polish,
                        symmetry: req.body.symmetry,
                        fluorescence: req.body.fluorescence,
                        proportionDiagramPath: req.body.proportionDiagramPath,
                        inclusionPlotPath: req.body.inclusionPlotPath,
                        pdfPath: req.body.pdfPath,
                        certificateStatus: enums_1.CertificationStatus.ISSUED,
                    }
                });
                if (updated.diamondItemId) {
                    await prisma_1.default.diamondItem.update({
                        where: { id: updated.diamondItemId },
                        data: { certificateStatus: enums_1.CertificateState.RECEIVED }
                    });
                }
                res.json({ success: true, certificateId: id });
            }
            catch (error) {
                next(error);
            }
        };
        this.delete = async (req, res, next) => {
            try {
                const id = req.params.id;
                await prisma_1.default.certification.delete({
                    where: { id }
                });
                res.json({ success: true, message: 'Certificate deleted successfully' });
            }
            catch (error) {
                next(error);
            }
        };
        this.uploadPdf = async (req, res, next) => {
            try {
                if (!req.file) {
                    res.status(400).json({ success: false, error: 'No file uploaded' });
                    return;
                }
                const fileUrl = `/uploads/certs/${req.file.filename}`;
                res.json({ success: true, data: { path: fileUrl } });
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.CertificateController = CertificateController;
//# sourceMappingURL=certificate.controller.js.map