"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartyController = void 0;
const prisma_1 = __importDefault(require("../../infrastructure/database/prisma"));
class PartyController {
    constructor() {
        this.getParties = async (req, res, next) => {
            try {
                const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
                const take = req.query.take ? parseInt(req.query.take, 10) : 1000;
                const [total, parties] = await prisma_1.default.$transaction([
                    prisma_1.default.party.count(),
                    prisma_1.default.party.findMany({
                        skip,
                        take,
                        include: {
                            transactions: true,
                            repairs: true,
                            financialEntries: true
                        }
                    })
                ]);
                const mapped = parties.map(p => {
                    let outstandingBalance = 0;
                    let lastTxDate = p.updatedAt;
                    if (p.transactions.length > 0) {
                        const latestTx = p.transactions.sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime())[0];
                        lastTxDate = latestTx.transactionDate;
                    }
                    else if (p.repairs.length > 0) {
                        const latestRepair = p.repairs.sort((a, b) => (b.dateSent?.getTime() || 0) - (a.dateSent?.getTime() || 0))[0];
                        if (latestRepair.dateSent) {
                            lastTxDate = latestRepair.dateSent;
                        }
                    }
                    // outstanding balance is sum of credit - debit for suppliers? 
                    // Actually, let's just do sum(credit) - sum(debit). If it's > 0, we owe them. If it's < 0, they owe us.
                    // Wait, for CUSTOMER, debit is what they owe us. So Customer Balance = sum(debit) - sum(credit)
                    // For SUPPLIER, credit is what we owe them. So Supplier Balance = sum(credit) - sum(debit)
                    if (p.partyType === 'SUPPLIER') {
                        outstandingBalance = p.financialEntries.reduce((acc, fe) => acc + Number(fe.credit) - Number(fe.debit), 0);
                    }
                    else if (p.partyType === 'CUSTOMER') {
                        outstandingBalance = p.financialEntries.reduce((acc, fe) => acc + Number(fe.debit) - Number(fe.credit), 0);
                    }
                    else if (p.partyType === 'WORKSHOP') {
                        // For workshops, balance might be pending repair costs
                        outstandingBalance = p.repairs.filter(r => r.status !== 'COMPLETED').reduce((acc, r) => acc + Number(r.cost), 0);
                    }
                    return {
                        id: p.id,
                        partyId: p.id,
                        name: p.name,
                        partyName: p.name,
                        type: p.partyType,
                        partyType: p.partyType,
                        partyCode: p.partyCode,
                        nickname: p.partyCode,
                        phone: p.phone || '',
                        email: p.email || '',
                        address: p.address || '',
                        gstin: p.gstin || '',
                        brokeragePercentage: p.brokeragePercentage ? Number(p.brokeragePercentage) : 0,
                        outstandingBalance,
                        lastTxDate,
                        notes: p.notes || ''
                    };
                });
                res.json({ success: true, data: mapped, total });
            }
            catch (error) {
                next(error);
            }
        };
        this.createParty = async (req, res, next) => {
            try {
                const rawCode = req.body.partyCode || req.body.nickname;
                const partyCode = rawCode ? rawCode.toUpperCase().replace(/\s+/g, '_') : `PTY-${Date.now()}`;
                // Check for duplicate party code
                const existing = await prisma_1.default.party.findUnique({ where: { partyCode } });
                if (existing) {
                    res.status(409).json({ success: false, error: `A party with code "${partyCode}" already exists.` });
                    return;
                }
                const party = await prisma_1.default.party.create({
                    data: {
                        partyCode,
                        name: req.body.partyName || req.body.name,
                        partyType: req.body.type || req.body.partyType || 'OTHER',
                        phone: req.body.phone,
                        email: req.body.email,
                        address: req.body.address,
                        gstin: req.body.gstin ? String(req.body.gstin).trim().toUpperCase() : undefined,
                        notes: req.body.notes ? String(req.body.notes).trim() : undefined,
                        brokeragePercentage: req.body.brokeragePercentage ? parseFloat(req.body.brokeragePercentage) : 0,
                    }
                });
                res.status(201).json({ success: true, data: party });
            }
            catch (error) {
                next(error);
            }
        };
        this.updateParty = async (req, res, next) => {
            try {
                const id = req.params.id;
                const data = {
                    name: req.body.partyName || req.body.name,
                    partyType: req.body.type || req.body.partyType,
                    phone: req.body.phone,
                    email: req.body.email,
                    address: req.body.address,
                };
                if (req.body.gstin !== undefined) {
                    data.gstin = req.body.gstin ? String(req.body.gstin).trim().toUpperCase() : null;
                }
                if (req.body.notes !== undefined) {
                    data.notes = req.body.notes ? String(req.body.notes).trim() : null;
                }
                if (req.body.brokeragePercentage !== undefined) {
                    data.brokeragePercentage = req.body.brokeragePercentage ? parseFloat(req.body.brokeragePercentage) : 0;
                }
                const party = await prisma_1.default.party.update({
                    where: { id },
                    data
                });
                res.json({ success: true, data: party });
            }
            catch (error) {
                next(error);
            }
        };
        this.deleteParty = async (req, res, next) => {
            try {
                const id = req.params.id;
                const existing = await prisma_1.default.party.findUnique({
                    where: { id },
                    include: {
                        transactions: { select: { id: true }, take: 1 },
                        repairs: { select: { id: true }, take: 1 },
                        financialEntries: { select: { id: true }, take: 1 }
                    }
                });
                if (!existing) {
                    res.status(404).json({ success: false, error: 'Party not found' });
                    return;
                }
                if (existing.transactions.length > 0 || existing.repairs.length > 0 || existing.financialEntries.length > 0) {
                    res.status(400).json({
                        success: false,
                        error: 'Cannot delete party because it has existing transactions, financial entries, or repairs attached to it. Please archive or deactivate instead.'
                    });
                    return;
                }
                await prisma_1.default.party.delete({
                    where: { id }
                });
                res.json({ success: true, message: 'Party deleted successfully' });
            }
            catch (error) {
                next(error);
            }
        };
    }
}
exports.PartyController = PartyController;
//# sourceMappingURL=party.controller.js.map