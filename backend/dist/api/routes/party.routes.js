"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPartyRouter = createPartyRouter;
const express_1 = require("express");
function createPartyRouter(controller) {
    const router = (0, express_1.Router)();
    router.get('/', controller.getParties);
    router.post('/', controller.createParty);
    router.put('/:id', controller.updateParty);
    router.delete('/:id', controller.deleteParty);
    return router;
}
//# sourceMappingURL=party.routes.js.map