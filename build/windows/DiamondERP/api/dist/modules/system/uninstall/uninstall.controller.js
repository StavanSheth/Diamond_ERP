"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uninstallController = exports.UninstallController = void 0;
const uninstall_preflight_service_1 = require("./uninstall-preflight.service");
const preservation_service_1 = require("../preservation/preservation.service");
class UninstallController {
    constructor() {
        this.getPreflight = async (_req, res, next) => {
            try {
                const result = await uninstall_preflight_service_1.uninstallPreflightService.getPreflightStatus();
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.createPreservation = async (req, res, next) => {
            try {
                const performedBy = req.user?.username || req.user?.displayName || 'admin';
                const result = await preservation_service_1.preservationService.createPreservationPackage(req.body, performedBy);
                res.status(201).json({
                    success: true,
                    message: 'Preservation package created and verified successfully',
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.verifyPreservation = async (req, res, next) => {
            try {
                const packageIdOrPath = req.body?.packageId || req.body?.path || String(req.query.packageId || '');
                const result = await preservation_service_1.preservationService.verifyPreservationPackage(packageIdOrPath);
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.authorizeUninstall = async (req, res, next) => {
            try {
                const packageId = req.body?.preservationPackageId || req.body?.packageId;
                const result = await uninstall_preflight_service_1.uninstallPreflightService.issueUninstallAuthorization(packageId);
                res.status(201).json({
                    success: true,
                    message: 'One-time uninstall authorization issued successfully',
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.checkAuthorization = async (_req, res, next) => {
            try {
                const result = await uninstall_preflight_service_1.uninstallPreflightService.checkAuthorizationToken();
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.createUninstallExport = async (req, res, next) => {
            try {
                const performedBy = req.user?.username || req.user?.displayName || 'admin';
                const result = await uninstall_preflight_service_1.uninstallPreflightService.createUninstallBackup(req.body, performedBy);
                res.status(201).json({
                    success: true,
                    message: 'Pre-uninstall backup bundle created and verified successfully',
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.validateDestination = async (req, res, next) => {
            try {
                const destinationDir = req.body?.destinationDir || req.query?.destinationDir || '';
                const result = await uninstall_preflight_service_1.uninstallPreflightService.validateDestination(String(destinationDir));
                res.json({
                    success: result.valid,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        this.browseDestination = async (_req, res, next) => {
            try {
                const result = await uninstall_preflight_service_1.uninstallPreflightService.browseDestination();
                res.json({
                    success: true,
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
        /**
         * Section 12: Standard 1-step automated uninstall flow endpoint.
         */
        this.autoPreserveAndAuthorize = async (req, res, next) => {
            try {
                const performedBy = req.user?.username || req.user?.displayName || 'admin';
                const result = await uninstall_preflight_service_1.uninstallPreflightService.runAutomatedUninstallPreservation({
                    destinationDir: req.body?.destinationDir,
                    performedBy,
                });
                res.status(201).json({
                    success: true,
                    message: 'Automated preservation and uninstall authorization completed successfully',
                    data: result,
                });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.UninstallController = UninstallController;
exports.uninstallController = new UninstallController();
//# sourceMappingURL=uninstall.controller.js.map