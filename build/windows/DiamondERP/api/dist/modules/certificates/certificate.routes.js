"use strict";
/**
 * Certificate routes
 *
 * The multer upload middleware is sourced exclusively from FileStorageService
 * so that the uploads directory is defined in one place only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCertificateRouter = createCertificateRouter;
const express_1 = require("express");
const file_storage_service_1 = require("../../infrastructure/storage/file-storage.service");
function createCertificateRouter(controller) {
    const router = (0, express_1.Router)();
    // Multer instance owned and configured by FileStorageService — single source of truth
    const upload = file_storage_service_1.fileStorageService.createMulterUpload();
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
//# sourceMappingURL=certificate.routes.js.map