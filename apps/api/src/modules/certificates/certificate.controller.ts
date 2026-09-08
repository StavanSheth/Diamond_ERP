import { Request, Response, NextFunction } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { CertificateState, CertificationStatus } from '../../types/enums';
import { buildDiamondWhereClause } from '../../utils/filter.utils';

export class CertificateController {
  
  getCertificates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const diamondWhere = buildDiamondWhereClause(req.query);
      const certificates = await prisma.certification.findMany({
        where: Object.keys(diamondWhere).length > 0 ? {
          diamondItem: diamondWhere
        } : undefined,
        include: {
          diamondItem: {
            include: {
              stock: true
            }
          }
        }
      });
      
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
        
      res.json({ success: true, data: formatted });
    } catch (error) {
      next(error);
    }
  };

  getUnlinkedCertificates = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const certificates = await prisma.certification.findMany({
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
    } catch (error) {
      next(error);
    }
  };

  linkCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { diamondItemId } = req.body;
      
      const updated = await prisma.certification.update({
        where: { id },
        data: { diamondItemId }
      });
      
      await prisma.diamondItem.update({
        where: { id: diamondItemId },
        data: { certificateStatus: CertificateState.RECEIVED, currentCertificateId: id }
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };


  createCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { diamondItemId, labType, reportNumber, cost, laserInscription, name } = req.body;
      
      const newCert = await prisma.certification.create({
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
        await prisma.diamondItem.update({
          where: { id: diamondItemId },
          data: { certificateStatus: CertificateState.PENDING }
        }).catch(() => null);
      }
      
      res.status(201).json({ success: true, certificateId: newCert.id, data: newCert });
    } catch (error) {
      next(error);
    }
  };

  updateCertificate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      
      const updated = await prisma.certification.update({
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
      
      if (updated.diamondItemId) {
        await prisma.diamondItem.update({
          where: { id: updated.diamondItemId },
          data: { certificateStatus: CertificateState.RECEIVED, currentCertificateId: id }
        });
      }

      res.json({ success: true, certificateId: id, data: updated });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      
      // Unlink any diamond items pointing to this certificate as currentCertificate
      await prisma.diamondItem.updateMany({
        where: { currentCertificateId: id },
        data: { currentCertificateId: null, certificateStatus: CertificateState.NONE }
      });

      await prisma.certification.delete({
        where: { id }
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
      const fileUrl = `/uploads/certs/${req.file.filename}`;
      res.json({ success: true, data: { path: fileUrl } });
    } catch (error) {
      next(error);
    }
  };
}
