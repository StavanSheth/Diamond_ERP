import { Request, Response, NextFunction } from 'express';
export declare class UserLifecycleController {
    deactivateUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    deleteUser: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const userLifecycleController: UserLifecycleController;
//# sourceMappingURL=user-lifecycle.controller.d.ts.map