import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { CertificateState, CertificationStatus } from '../../types/enums';
import { buildDiamondWhereClause } from '../../utils/filter.utils';

export class CertificateController {
  
  getCertificates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const diamondWhere = buildDiamondWhereClause(req.query);
      const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
      const take = req.query.take ? parseInt(req.query.take as string, 10) : 1000;

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
        id: c.id, // Added for UI compatibility
        certificateId: c.id,
        diamondItemId: c.diamondItemId, // Added for UI mapping
        name: c.name, // Added for UI mapping
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
      const take = req.query.take ? parseInt(req.query.take as string, 10) : 1000;

      const [total, certificates] = await prisma.$transaction([
        prisma.certification.count({ where: { diamondItemId: null } }),
        prisma.certification.findMany({
          where: { diamondItemId: null },
          skip,
          take
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
      
      const updated = await prisma.$transaction(async (tx) => {
        const cert = await tx.certification.update({
          where: { id },
          data: { diamondItemId }
        });
        
        await tx.diamondItem.update({
          where: { id: diamondItemId },
          data: { certificateStatus: CertificateState.RECEIVED, currentCertificateId: id }
        });
        
        return cert;
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };


  createCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { diamondItemId, labType, reportNumber, cost, laserInscription, name } = req.body;
      
      // Task 16: Certificate uniqueness rules
      if (reportNumber) {
        const existing = await prisma.certification.findFirst({ where: { reportNumber } });
        if (existing) {
          res.status(409).json({ success: false, error: `Certificate with report number ${reportNumber} already exists` });
          return;
        }
      }

      const newCert = await prisma.$transaction(async (tx) => {
        const cert = await tx.certification.create({
          data: {
            diamondItemId: diamondItemId || null,
            labType: labType || 'GIA',
            reportNumber: reportNumber || '',
            certificateStatus: CertificationStatus.PENDING,
            cost: cost || 0,
            laserInscription: laserInscription || '',
            name: name || '',
          }
        });

        if (diamondItemId) {
          await tx.diamondItem.update({
            where: { id: diamondItemId },
            data: { certificateStatus: CertificateState.PENDING }
          }).catch(() => null);
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
      
      // Task 16: Certificate uniqueness rules
      if (req.body.reportNumber) {
        const existing = await prisma.certification.findFirst({ 
          where: { 
            reportNumber: req.body.reportNumber,
            id: { not: id } // Exclude the current certificate being updated
          } 
        });
        if (existing) {
          res.status(409).json({ success: false, error: `Certificate with report number ${req.body.reportNumber} already exists` });
          return;
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const cert = await tx.certification.update({
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
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      // Magic bytes validation for PDF (%PDF-)
      const fs = require('fs');
      const buffer = Buffer.alloc(5);
      const fd = fs.openSync(req.file.path, 'r');
      fs.readSync(fd, buffer, 0, 5, 0);
      fs.closeSync(fd);
      
      if (buffer.toString('utf8') !== '%PDF-') {
        fs.unlinkSync(req.file.path);
        res.status(400).json({ success: false, error: 'Invalid file format. Only valid PDFs are allowed.' });
        return;
      }

      // Store just the filename, not the /uploads path
      const filename = req.file.filename;
      res.json({ success: true, data: { path: filename } });
    } catch (error) {
      next(error);
    }
  };

  downloadPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const cert = await prisma.certification.findUnique({ where: { id } });
      
      if (!cert || !cert.pdfPath) {
        res.status(404).json({ success: false, error: 'Certificate file not found' });
        return;
      }

      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve(__dirname, '../../../../uploads/certs', cert.pdfPath);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, error: 'File missing from storage' });
        return;
      }

      // Secure streaming
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${cert.reportNumber || 'certificate'}.pdf"`);
      
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  };
}
