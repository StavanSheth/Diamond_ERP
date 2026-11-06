"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lifecycleReadyMiddleware = lifecycleReadyMiddleware;
const installation_service_1 = require("../modules/system/installation.service");
const logging_1 = require("../infrastructure/logging");
/**
 * Lifecycle Ready Gate Middleware.
 *
 * Enforces that core ERP business operations (Stocks, Ledger, Parties, Repairs, Reports)
 * cannot be executed unless the installation lifecycle is in the authoritative 'READY' state.
 *
 * Rejects with 428 Precondition Required if installation is not fully initialized/onboarded.
 */
async function lifecycleReadyMiddleware(req, res, next) {
    try {
        const install = await installation_service_1.installationService.getOrCreateInstallation();
        if (install.lifecycleState !== 'READY') {
            logging_1.logger.warn(`[LifecycleGate] Business API call blocked: ${req.method} ${req.originalUrl}. Installation lifecycle is "${install.lifecycleState}", required: "READY"`);
            res.status(428).json({
                success: false,
                error: 'Installation lifecycle not ready',
                code: 'LIFECYCLE_NOT_READY',
                currentLifecycleState: install.lifecycleState,
                message: `The application is currently in '${install.lifecycleState}' state. The onboarding setup must be completed before accessing business records.`,
            });
            return;
        }
        next();
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=lifecycle-ready.js.map