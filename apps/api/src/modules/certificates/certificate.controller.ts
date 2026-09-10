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

import { Request, Response, NextFunction } from 'express';
import { certificateService } from './certification.service';
import { fileStorageService } from '../../infrastructure/storage/file-storage.service';
import { ValidationError, NotFoundError } from '../../errors';

export class CertificateController {

  // ── List ──────────────────────────────────────────────────────────────────

  getCertificates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { total, certificates } = await certificateService.listCertificates(req.query);

      const formatted = certificates.map((c) => ({
        id: c.id,
        certificateId: c.id,
        diamondItemId: c.diamondItemId,
        name: c.name,
        stockItemId: c.diamondItem?.itemCode || c.diamondItemId,
        stockName: c.diamondItem?.stock?.name || (c.diamondItem ? 'Diamond Stock' : 'Standalone'),
        itemName:
          c.name ||
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
    } catch (error) {
      next(error);
    }
  };

  getUnlinkedCertificates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { total, certificates } = await certificateService.listUnlinked(req.query);

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
    } catch (error) {
      next(error);
    }
  };

  // ── Create ────────────────────────────────────────────────────────────────

  createCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const newCert = await certificateService.createCertificate(req.body);
      res.status(201).json({ success: true, certificateId: newCert.id, data: newCert });
    } catch (error) {
      next(error);
    }
  };

  // ── Update ────────────────────────────────────────────────────────────────

  updateCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { cert, oldPdfPath } = await certificateService.updateCertificate(id, req.body);

      // Best-effort physical file cleanup after successful DB commit
      if (oldPdfPath) {
        fileStorageService.delete(oldPdfPath);
      }

      res.json({ success: true, certificateId: id, data: cert });
    } catch (error) {
      next(error);
    }
  };

  // ── Link ──────────────────────────────────────────────────────────────────

  linkCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { diamondItemId } = req.body;
      const updated = await certificateService.linkCertificate(id, diamondItemId);
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const pdfPath = await certificateService.deleteCertificate(id);

      // Best-effort physical file cleanup after successful DB commit
      if (pdfPath) {
        fileStorageService.delete(pdfPath);
      }

      res.json({ success: true, message: 'Certificate deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  // ── File upload / download ────────────────────────────────────────────────

  uploadPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      // Validate magic bytes — service throws ValidationError and cleans up temp file on failure
      fileStorageService.validatePdfMagicBytes(req.file.path);

      // Return only the randomised server filename — never the user-supplied original name
      const filename = req.file.filename;
      res.json({ success: true, data: { path: filename } });
    } catch (error) {
      // Clean up temp file on any error path not already handled by validatePdfMagicBytes
      if (req.file) {
        fileStorageService.delete(req.file.path);
      }
      next(error);
    }
  };

  downloadPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const cert = await certificateService.findById(id);

      if (!cert.pdfPath) {
        throw new NotFoundError('Certificate has no associated file');
      }

      const stream = fileStorageService.stream(cert.pdfPath);

      // Header sanitization against CRLF injection
      const safeReportNumber = (cert.reportNumber || 'certificate').replace(
        /[^a-zA-Z0-9_-]/g,
        '_',
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeReportNumber}.pdf"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  };
}
