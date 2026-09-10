/**
 * Certificate routes
 *
 * The multer upload middleware is sourced exclusively from FileStorageService
 * so that the uploads directory is defined in one place only.
 */

import { Router } from 'express';
import { CertificateController } from './certificate.controller';
import { authorize } from '../../middleware/authorize';
import { fileStorageService } from '../../infrastructure/storage/file-storage.service';

export function createCertificateRouter(controller: CertificateController): Router {
  const router = Router();

  // Multer instance owned and configured by FileStorageService — single source of truth
  const upload = fileStorageService.createMulterUpload();

  router.get('/', authorize('certificate.read'), controller.getCertificates);
  router.get('/unlinked', authorize('certificate.read'), controller.getUnlinkedCertificates);
  router.post('/', authorize('certificate.create'), controller.createCertificate);
  router.post('/upload', authorize('certificate.upload'), upload.single('file'), controller.uploadPdf);
  router.post('/:id/link', authorize('certificate.update'), controller.linkCertificate);
  router.put('/:id', authorize('certificate.update'), controller.updateCertificate);
  router.delete('/:id', authorize('certificate.delete'), controller.delete);
  router.get('/:id/file', authorize('certificate.read'), controller.downloadPdf);

  return router;
}
