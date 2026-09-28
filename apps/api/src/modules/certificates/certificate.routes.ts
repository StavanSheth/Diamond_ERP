/**
 * Certificate routes
 *
 * The multer upload middleware is sourced exclusively from FileStorageService
 * so that the uploads directory is defined in one place only.
 */

import { Router } from 'express';
import { CertificateController } from './certificate.controller';
import { fileStorageService } from '../../infrastructure/storage/file-storage.service';

export function createCertificateRouter(controller: CertificateController): Router {
  const router = Router();

  // Multer instance owned and configured by FileStorageService — single source of truth
  const upload = fileStorageService.createMulterUpload();

  router.get('/', controller.getCertificates);
  router.get('/unlinked', controller.getUnlinkedCertificates);
  router.post('/', controller.createCertificate);
  router.post('/upload', upload.single('file'), controller.uploadPdf);
  router.post('/:id/link', controller.linkCertificate);
  router.put('/:id', controller.updateCertificate);
  router.delete('/:id', controller.delete);
  router.get('/:id/file', controller.downloadPdf);

  return router;
}
