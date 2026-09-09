import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../../infrastructure/database/prisma';
import { CertificateState, CertificationStatus } from '../../types/enums';
import { buildDiamondWhereClause } from '../../utils/filter.utils';
import { ConflictError, NotFoundError, ValidationError } from '../../errors';

const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads/certs');

export class CertificateController {
  
  getCertificates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const diamondWhere = buildDiamondWhereClause(req.query);
      const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
      const rawTake = req.query.take ? parseInt(req.query.take as string, 10) : 100;
      const take = Math.min(Math.max(1, rawTake), 200);

      const [total, certificates] = await prisma.$transaction([
        prisma.certification.count({
          where: Object.keys(diamondWhere).length > 0 ? {
            diamondItem: diamondWhere
          } : undefined
        }),
        prisma.certification.findMany({
          where: Object.keys(diamondWhere).length > 0 ? {
            diamondItem: diamondWhere
          } : undefined,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            diamondItem: {
              include: {
                stock: true
              }
            }
          }
        })
      ]);
      
      const formatted = certificates.map(c => ({
        id: c.id,
        certificateId: c.id,
        diamondItemId: c.diamondItemId,
        name: c.name,
        stockItemId: c.diamondItem?.itemCode || c.diamondItemId,
        stockName: c.diamondItem?.stock?.name || (c.diamondItem ? 'Diamond Stock' : 'Standalone'),
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
        
      res.json({ success: true, data: formatted, total });
    } catch (error) {
      next(error);
    }
  };

  getUnlinkedCertificates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
      const rawTake = req.query.take ? parseInt(req.query.take as string, 10) : 100;
      const take = Math.min(Math.max(1, rawTake), 200);

      const [total, certificates] = await prisma.$transaction([
        prisma.certification.count({ where: { diamondItemId: null } }),
        prisma.certification.findMany({
          where: { diamondItemId: null },
          skip,
          take,
          orderBy: { createdAt: 'desc' },
        })
      ]);
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
      res.json({ success: true, data: formatted, total });
    } catch (error) {
      next(error);
    }
  };

  linkCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { diamondItemId } = req.body;

      if (!diamondItemId) {
        throw new ValidationError('diamondItemId is required to link certificate');
      }

      const updated = await prisma.$transaction(async (tx) => {
        const cert = await tx.certification.findUnique({ where: { id } });
        if (!cert) throw new NotFoundError('Certificate not found');

        const targetDiamond = await tx.diamondItem.findUnique({ where: { id: diamondItemId } });
        if (!targetDiamond) throw new NotFoundError('Target diamond not found');

        // If certificate was previously linked to another diamond, unlink it cleanly
        if (cert.diamondItemId && cert.diamondItemId !== diamondItemId) {
          await tx.diamondItem.updateMany({
            where: { currentCertificateId: id },
            data: { currentCertificateId: null, certificateStatus: CertificateState.NONE },
          });
        }

        const updatedCert = await tx.certification.update({
          where: { id },
          data: { 
            diamondItemId,
            certificateStatus: CertificationStatus.ISSUED 
          }
        });
        
        await tx.diamondItem.update({
          where: { id: diamondItemId },
          data: { certificateStatus: CertificateState.RECEIVED, currentCertificateId: id }
        });
        
        return updatedCert;
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };

  createCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { diamondItemId, labType, reportNumber, cost, laserInscription, name } = req.body;
      const normalizedReportNumber = reportNumber && typeof reportNumber === 'string' && reportNumber.trim() !== '' 
        ? reportNumber.trim() 
        : null;
      
      // Friendly pre-check before hitting DB constraint
      if (normalizedReportNumber) {
        const existing = await prisma.certification.findUnique({ where: { reportNumber: normalizedReportNumber } });
        if (existing) {
          throw new ConflictError(`Certificate with report number "${normalizedReportNumber}" already exists`);
        }
      }

      // Atomic transactional creation
      const newCert = await prisma.$transaction(async (tx) => {
        const cert = await tx.certification.create({
          data: {
            diamondItemId: diamondItemId || null,
            labType: labType || 'GIA',
            reportNumber: normalizedReportNumber,
            certificateStatus: CertificationStatus.PENDING,
            cost: cost ? parseFloat(cost) : 0,
            laserInscription: laserInscription || '',
            name: name || '',
          }
        });

        if (diamondItemId) {
          await tx.diamondItem.update({
            where: { id: diamondItemId },
            data: { certificateStatus: CertificateState.PENDING, currentCertificateId: cert.id }
          });
        }
        
        return cert;
      });
      
      res.status(201).json({ success: true, certificateId: newCert.id, data: newCert });
    } catch (error) {
      next(error);
    }
  };

  updateCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const rawReport = req.body.reportNumber;
      const normalizedReportNumber = rawReport && typeof rawReport === 'string' && rawReport.trim() !== ''
        ? rawReport.trim()
        : null;

      if (normalizedReportNumber) {
        const existing = await prisma.certification.findFirst({ 
          where: { 
            reportNumber: normalizedReportNumber,
            id: { not: id }
          } 
        });
        if (existing) {
          throw new ConflictError(`Certificate with report number "${normalizedReportNumber}" already exists`);
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const cert = await tx.certification.update({
          where: { id },
          data: {
            labType: req.body.labType,
            reportNumber: normalizedReportNumber,
            cost: req.body.cost !== undefined ? parseFloat(req.body.cost) : undefined,
            measurements: req.body.measurements,
            polish: req.body.polish,
            symmetry: req.body.symmetry,
            fluorescence: req.body.fluorescence,
            proportionDiagramPath: req.body.proportionDiagramPath,
            inclusionPlotPath: req.body.inclusionPlotPath,
            pdfPath: req.body.pdfPath,
            certificateStatus: req.body.certificateStatus || req.body.status || CertificationStatus.ISSUED,
          }
        });
        
        if (cert.diamondItemId) {
          await tx.diamondItem.update({
            where: { id: cert.diamondItemId },
            data: { certificateStatus: CertificateState.RECEIVED, currentCertificateId: id }
          });
        }
        
        return cert;
      });

      res.json({ success: true, certificateId: id, data: updated });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      
      await prisma.$transaction(async (tx) => {
        const cert = await tx.certification.findUnique({ where: { id } });
        if (!cert) throw new NotFoundError('Certificate not found');

        // Unlink any diamond items pointing to this certificate as currentCertificate
        await tx.diamondItem.updateMany({
          where: { currentCertificateId: id },
          data: { currentCertificateId: null, certificateStatus: CertificateState.NONE }
        });

        await tx.certification.delete({
          where: { id }
        });
      });

      res.json({ success: true, message: 'Certificate deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  uploadPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      // Magic bytes validation for PDF (%PDF-)
      const buffer = Buffer.alloc(5);
      let fd: number | null = null;
      try {
        fd = fs.openSync(req.file.path, 'r');
        fs.readSync(fd, buffer, 0, 5, 0);
      } finally {
        if (fd !== null) fs.closeSync(fd);
      }
      
      if (buffer.toString('utf8') !== '%PDF-') {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        throw new ValidationError('Invalid file format. File is not a valid PDF document.');
      }

      // Store just the randomized server filename, never trusting user input
      const filename = path.basename(req.file.filename);
      res.json({ success: true, data: { path: filename } });
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      next(error);
    }
  };

  downloadPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const cert = await prisma.certification.findUnique({ where: { id } });
      
      if (!cert || !cert.pdfPath) {
        throw new NotFoundError('Certificate file not found');
      }

      // Strict path traversal prevention: ensure file stays strictly inside UPLOADS_DIR
      const safeBasename = path.basename(cert.pdfPath);
      const filePath = path.resolve(UPLOADS_DIR, safeBasename);

      if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) {
        throw new NotFoundError('File missing from storage');
      }

      // Header sanitization against CRLF injection
      const safeReportNumber = (cert.reportNumber || 'certificate').replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeReportNumber}.pdf"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  };
}
