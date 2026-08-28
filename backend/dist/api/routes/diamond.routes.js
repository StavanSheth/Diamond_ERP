"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const diamond_controller_1 = require("../controllers/diamond.controller");
const router = (0, express_1.Router)();
const diamondController = new diamond_controller_1.DiamondController();
router.get('/', diamondController.getAllDiamonds);
router.get('/:id', diamondController.getDiamond);
exports.default = router;
//# sourceMappingURL=diamond.routes.js.map