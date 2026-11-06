import { Request, Response, NextFunction } from 'express';
export declare class OnboardingController {
    getOnboardingStatus: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    initializeApp: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    setupPin: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    registerDevice: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    discoverUsers: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    selectUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    createUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    discoverDatabases: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    inspectDatabase: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    attachDatabase: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    createDatabase: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    completeDatabaseSetup: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    completeOnboarding: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    resetRecoverableStep: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const onboardingController: OnboardingController;
//# sourceMappingURL=onboarding.controller.d.ts.map