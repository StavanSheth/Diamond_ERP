/**
 * CertificateController
 *
 * Thin HTTP adapter — validates input, delegates to CertificateService
 * and FileStorageService, then formats the response.
 *
 * This controller has NO direct `fs` or `path` imports.
 * All file I/O goes through FileStorageService.
 * All business logic and DB access goes through CertificateService.
 */
import { Request, Response, NextFunction } from 'express';
export declare class CertificateController {
    getCertificates: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getUnlinkedCertificates: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    createCertificate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    updateCertificate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    linkCertificate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    delete: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    uploadPdf: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    downloadPdf: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=certificate.controller.d.ts.map