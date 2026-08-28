"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionController = void 0;
const version_service_1 = require("../../services/version.service");
class VersionController {
    constructor() {
        /** GET /api/versions/:entityType/:entityId */
        this.getHistory = async (req, res, next) => {
            try {
                const entityType = req.params.entityType;
                const entityId = req.params.entityId;
                const versions = await version_service_1.versionService.getVersionHistory(entityType, entityId);
                res.json({ success: true, data: versions });
            }
            catch (err) {
                next(err);
            }
        };
        /** GET /api/versions/:id */
        this.getOne = async (req, res, next) => {
            try {
                const id = req.params.id;
                const version = await version_service_1.versionService.getVersion(id);
                if (!version) {
                    res.status(404).json({ success: false, error: 'Version not found' });
                    return;
                }
                res.json({ success: true, data: version });
            }
            catch (err) {
                next(err);
            }
        };
        /** POST /api/versions/:id/restore */
        this.restore = async (req, res, next) => {
            try {
                const id = req.params.id;
                const { createdBy } = req.body;
                const restored = await version_service_1.versionService.restoreVersion(id, createdBy || 'system');
                res.json({ success: true, data: restored });
            }
            catch (err) {
                next(err);
            }
        };
        /** GET /api/versions/:idA/diff/:idB */
        this.diff = async (req, res, next) => {
            try {
                const idA = req.params.idA;
                const idB = req.params.idB;
                const result = await version_service_1.versionService.diffVersions(idA, idB);
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.VersionController = VersionController;
//# sourceMappingURL=version.controller.js.map