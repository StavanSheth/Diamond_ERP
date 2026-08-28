"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraftController = void 0;
const draft_service_1 = require("../../services/draft.service");
class DraftController {
    constructor() {
        /** GET /api/drafts */
        this.getAll = async (req, res, next) => {
            try {
                const { status, entityType, createdBy } = req.query;
                const drafts = await draft_service_1.draftService.listDrafts({
                    status: status,
                    entityType: entityType,
                    createdBy: createdBy,
                });
                res.json({ success: true, data: drafts });
            }
            catch (err) {
                next(err);
            }
        };
        /** GET /api/drafts/:id */
        this.getOne = async (req, res, next) => {
            try {
                const id = req.params.id;
                const draft = await draft_service_1.draftService.getDraft(id);
                if (!draft) {
                    res.status(404).json({ success: false, error: 'Draft not found' });
                    return;
                }
                res.json({ success: true, data: draft });
            }
            catch (err) {
                next(err);
            }
        };
        /** POST /api/drafts */
        this.create = async (req, res, next) => {
            try {
                const { entityType, entityId, ledgerId, payload, createdBy, deviceId, sessionId } = req.body;
                const draft = await draft_service_1.draftService.createDraft({
                    entityType,
                    entityId,
                    ledgerId,
                    payload: payload || {},
                    createdBy: createdBy || 'system',
                    deviceId,
                    sessionId,
                });
                res.status(201).json({ success: true, data: draft });
            }
            catch (err) {
                next(err);
            }
        };
        /** PUT /api/drafts/:id */
        this.saveRevision = async (req, res, next) => {
            try {
                const id = req.params.id;
                const { payload, changeSet, changeSummary, updatedBy, deviceId, sessionId } = req.body;
                const revision = await draft_service_1.draftService.saveDraftRevision(id, {
                    payload,
                    changeSet,
                    changeSummary,
                    updatedBy: updatedBy || 'system',
                    deviceId,
                    sessionId,
                });
                res.json({ success: true, data: revision });
            }
            catch (err) {
                next(err);
            }
        };
        /** POST /api/drafts/:id/commit */
        this.commit = async (req, res, next) => {
            try {
                const id = req.params.id;
                const { createdBy } = req.body;
                const committed = await draft_service_1.draftService.commitDraft(id, createdBy || 'system');
                res.json({ success: true, data: committed });
            }
            catch (err) {
                next(err);
            }
        };
        /** DELETE /api/drafts/:id */
        this.abandon = async (req, res, next) => {
            try {
                const id = req.params.id;
                const abandoned = await draft_service_1.draftService.abandonDraft(id);
                res.json({ success: true, data: abandoned });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.DraftController = DraftController;
//# sourceMappingURL=draft.controller.js.map