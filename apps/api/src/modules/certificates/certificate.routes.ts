import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { CertificateController } from './certificate.controller';
import { authorize } from '../../middleware/authorize';

const certsUploadDir = path.resolve(__dirname, '../../../uploads/certs');
if (!fs.existsSync(certsUploadDir)) {
  fs.mkdirSync(certsUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    if (!fs.existsSync(certsUploadDir)) {
      fs.mkdirSync(certsUploadDir, { recursive: true });
    }
    cb(null, certsUploadDir);
  },
  filename: function (_req, _file, cb) {
    // Randomized 32-character hex name with forced .pdf extension
    const randomName = crypto.randomBytes(16).toString('hex');
    cb(null, `${randomName}.pdf`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max for certificate PDFs
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdfExt = ext === '.pdf';
    const isPdfMime = file.mimetype === 'application/pdf';

    // Must satisfy both extension and declared MIME
    if (isPdfExt && isPdfMime) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for certificate uploads. Both extension and MIME type must be PDF.'));
    }
  },
});

export function createCertificateRouter(controller: CertificateController): Router {
  const router = Router();

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
