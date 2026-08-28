import { Request, Response, NextFunction } from 'express';
export declare class PartyController {
    getParties: (_req: Request, res: Response, next: NextFunction) => Promise<void>;
    createParty: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    updateParty: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    deleteParty: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=party.controller.d.ts.map