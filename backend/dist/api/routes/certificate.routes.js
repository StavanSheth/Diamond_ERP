"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCertificateRouter = createCertificateRouter;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const storage = multer_1.default.diskStorage({
    destination: function (_req, _file, cb) {
        cb(null, path_1.default.join(__dirname, '../../../../uploads/certs'));
    },
    filename: function (_req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage: storage });
function createCertificateRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getCertificates);
    router.get('/unlinked', controller.getUnlinkedCertificates);
    router.post('/', controller.createCertificate);
    router.post('/upload', upload.single('file'), controller.uploadPdf);
    router.post('/:id/link', controller.linkCertificate);
    router.put('/:id', controller.updateCertificate);
    router.delete('/:id', controller.delete);
    return router;
}
//# sourceMappingURL=certificate.routes.js.map