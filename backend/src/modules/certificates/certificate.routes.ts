import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { CertificateController } from '../controllers/certificate.controller';

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, path.join(__dirname, '../../../../uploads/certs'));
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

export function createCertificateRouter(controller: CertificateController): Router {
  const router = Router();

  router.get('/', controller.getCertificates);
  router.get('/unlinked', controller.getUnlinkedCertificates);
  router.post('/', controller.createCertificate);
  router.post('/upload', upload.single('file'), controller.uploadPdf);
  router.post('/:id/link', controller.linkCertificate);
  router.put('/:id', controller.updateCertificate);
  router.delete('/:id', controller.delete);

  return router;
}
