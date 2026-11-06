"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPartyRouter = createPartyRouter;
const express_1 = require("express");
const validate_1 = require("../../middleware/validate");
const party_validator_1 = require("../../validation/party.validator");
function createPartyRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getParties);
    router.post('/', (0, validate_1.validateRequest)(party_validator_1.createPartySchema), controller.createParty);
    router.put('/:id', (0, validate_1.validateRequest)(party_validator_1.updatePartySchema), controller.updateParty);
    router.delete('/:id', controller.deleteParty);
    return router;
}
//# sourceMappingURL=party.routes.js.map