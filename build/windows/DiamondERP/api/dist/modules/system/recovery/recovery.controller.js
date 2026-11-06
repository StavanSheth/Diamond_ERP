"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoveryController = exports.RecoveryController = void 0;
const recovery_service_1 = require("./recovery.service");
class RecoveryController {
    constructor() {
        this.discoverCandidates = async (req, res, next) => {
            try {
                const additionalDir = req.query?.directory || req.body?.directory;
                const result = await recovery_service_1.recoveryService.discoverCandidates(additionalDir);
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.inspectCandidate = async (req, res, next) => {
            try {
                const candidatePath = req.body?.path || req.query?.path;
                const result = await recovery_service_1.recoveryService.inspectCandidate(candidatePath);
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.validateCandidate = async (req, res, next) => {
            try {
                const candidatePath = req.body?.path || req.query?.path;
                const result = await recovery_service_1.recoveryService.inspectCandidate(candidatePath);
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.prepareRestore = async (req, res, next) => {
            try {
                const result = await recovery_service_1.recoveryService.prepareRestore(req.body);
                res.status(201).json({
                    success: true,
                    message: 'Restore staged and validated successfully',
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.confirmRestore = async (req, res, next) => {
            try {
                const performedBy = req.user?.username || req.user?.displayName || 'admin';
                const result = await recovery_service_1.recoveryService.confirmRestore(req.body, performedBy);
                res.json({
                    success: true,
                    message: 'Restore completed successfully',
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.detectReinstallState = async (_req, res, next) => {
            try {
                const result = await recovery_service_1.recoveryService.detectReinstallState();
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.startFreshInstallation = async (_req, res, next) => {
            try {
                const result = await recovery_service_1.recoveryService.startFreshInstallation();
                res.status(201).json({
                    success: true,
                    message: 'Fresh installation initialized; existing data files preserved on disk.',
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.continueExistingInstallation = async (req, res, next) => {
            try {
                const targetInstallationId = req.body?.installationId;
                const result = await recovery_service_1.recoveryService.continueExistingInstallation(targetInstallationId);
                res.json({
                    success: true,
                    message: result.message,
                    data: result.installation,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.reconcileInterruptedRestores = async (_req, res, next) => {
            try {
                const result = await recovery_service_1.recoveryService.reconcileInterruptedRestores();
                res.json({
                    success: true,
                    message: 'Interrupted operations reconciled successfully.',
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.RecoveryController = RecoveryController;
exports.recoveryController = new RecoveryController();
//# sourceMappingURL=recovery.controller.js.map