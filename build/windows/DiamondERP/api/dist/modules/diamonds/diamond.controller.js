"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiamondController = void 0;
const prisma_1 = __importDefault(require("../../infrastructure/database/prisma"));
const filter_utils_1 = require("../../utils/filter.utils");
class DiamondController {
    constructor() {
        /**
         * GET /api/diamonds/:id
         * Get full details of a single diamond item, including its lifecycle events, certs, and repairs.
         */
        this.getDiamond = async (req, res, next) => {
            try {
                const id = req.params.id;
                const diamond = await prisma_1.default.diamondItem.findUnique({
                    where: { id },
                    include: {
                        events: {
                            include: { party: true, transaction: true },
                            orderBy: { eventDate: 'desc' }
                        },
                        certifications: true,
                        repairs: { include: { vendor: true } },
                        location: true
                    }
                });
                if (!diamond) {
                    res.status(404).json({ success: false, error: 'Diamond not found' });
                    return;
                }
                res.json({ success: true, data: diamond });
            }
            catch (error) {
                next(error);
            }
        };
        /**
         * GET /api/diamonds
         * Get all diamonds with optional 4Cs and stock filters
         */
        this.getAllDiamonds = async (req, res, next) => {
            try {
                const { stockId, status } = req.query;
                const diamondWhere = (0, filter_utils_1.buildDiamondWhereClause)(req.query);
                const where = { ...diamondWhere };
                if (stockId)
                    where.stockId = stockId;
                if (status && status !== 'All')
                    where.status = status;
                const diamonds = await prisma_1.default.diamondItem.findMany({
                    where,
                    include: {
                        stock: true,
                        location: true
                    }
                });
                res.json({ success: true, data: diamonds });
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.DiamondController = DiamondController;
//# sourceMappingURL=diamond.controller.js.map