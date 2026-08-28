import { Request, Response, NextFunction } from 'express';
export declare class CertificateController {
    getCertificates: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    getUnlinkedCertificates: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    linkCertificate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    createCertificate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    updateCertificate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    delete: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    uploadPdf: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=certificate.controller.d.ts.map