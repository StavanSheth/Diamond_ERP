/**
 * Certificate routes
 *
 * The multer upload middleware is sourced exclusively from FileStorageService
 * so that the uploads directory is defined in one place only.
 */
import { Router } from 'express';
import { CertificateController } from './certificate.controller';
export declare function createCertificateRouter(controller: CertificateController): Router;
//# sourceMappingURL=certificate.routes.d.ts.map