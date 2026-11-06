"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../infrastructure/database/prisma"));
const inventory_state_machine_1 = require("../../models/inventory-state-machine");
const transaction_state_machine_1 = require("../../models/transaction-state-machine");
const errors_1 = require("../../errors");
const enums_1 = require("../../types/enums");
class TransactionService {
    async createTransaction(payload) {
        return await prisma_1.default.$transaction(async (tx) => {
            return await this._createTransactionLogic(tx, payload);
        });
    }
    async _createTransactionLogic(tx, payload, preserveTransactionId, preserveCreatedAt, preserveVersion) {
        const { ledgerId, transactionType, transactionDate, partyId, items, remarks, referenceNo, createdBy, paymentType, paymentStatus, paymentDone, paymentDue, brokeragePercentage, brokerageAmount, brokerageType } = payload;
        const ledger = await tx.ledger.findUnique({
            where: { id: ledgerId },
            include: { stock: true }
        });
        if (!ledger)
            throw new errors_1.NotFoundError('Ledger not found');
        // 17. TRANSACTION TOTAL RECONCILIATION (Phase 11: Financial Invariants)
        let sumCarat = new client_1.Prisma.Decimal(0);
        let sumValue = new client_1.Prisma.Decimal(0);
        items.forEach(i => {
            sumCarat = sumCarat.add(new client_1.Prisma.Decimal(i.carat));
            sumValue = sumValue.add(new client_1.Prisma.Decimal(i.totalValue));
        });
        const diffCarat = sumCarat.minus(new client_1.Prisma.Decimal(payload.totalCarat)).abs();
        const diffValue = sumValue.minus(new client_1.Prisma.Decimal(payload.totalValue)).abs();
        if (diffCarat.gt(new client_1.Prisma.Decimal('0.001'))) {
            throw new errors_1.ValidationError(`Transaction carat reconciliation failed: Items sum ${sumCarat.toString()} != Transaction total ${payload.totalCarat}`);
        }
        if (diffValue.gt(new client_1.Prisma.Decimal('0.01'))) {
            throw new errors_1.ValidationError(`Transaction value reconciliation failed: Items sum ${sumValue.toString()} != Transaction total ${payload.totalValue}`);
        }
        // Phase 7 & 8: Atomic Database-Backed Sequences
        let transactionNo = referenceNo;
        if (!transactionNo) {
            const globalSeq = await tx.sequence.upsert({
                where: { id: 'global_transaction_no' },
                update: { value: { increment: 1 } },
                create: { id: 'global_transaction_no', value: 1 }
            });
            transactionNo = `TXN-${new Date().getFullYear()}-${String(globalSeq.value).padStart(6, '0')}`;
        }
        const ledgerSeqId = `ledger_seq_${ledgerId}`;
        const ledgerSeq = await tx.sequence.upsert({
            where: { id: ledgerSeqId },
            update: { value: { increment: 1 } },
            create: { id: ledgerSeqId, value: 1 }
        });
        const sequenceNumber = ledgerSeq.value;
        const transaction = await tx.transaction.create({
            data: {
                ...(preserveTransactionId ? { id: preserveTransactionId } : {}),
                ...(preserveCreatedAt ? { createdAt: preserveCreatedAt } : {}),
                ledgerId,
                transactionNo,
                transactionDate,
                transactionType,
                status: payload.status || 'DRAFT',
                version: preserveVersion || 1,
                sequenceNumber,
                partyId,
                remarks,
                referenceNo,
                createdBy,
                paymentType: paymentType || (transactionType === 'SALE' ? 'TO_COLLECT' : 'TO_PAY'),
                paymentStatus: paymentStatus || 'PENDING',
                paymentDone: paymentDone || 0,
                paymentDue: paymentDue || 0,
                brokeragePercentage: brokeragePercentage || 0,
                brokerageAmount: brokerageAmount || 0,
                brokerageType: brokerageType || 'INCLUSIVE',
            }
        });
        for (const item of items) {
            let diamondItemId = item.diamondItemId || item.existingDiamondId;
            let existingDiamond = null;
            if (!diamondItemId) {
                if (!item.itemCode)
                    throw new errors_1.ValidationError('Item code is required for new items');
                existingDiamond = await tx.diamondItem.create({
                    data: {
                        itemCode: item.itemCode,
                        stockId: ledger.stockId,
                        locationId: item.toLocationId || null,
                        displayName: item.displayName || `${item.clarity} ${item.shape}`,
                        carat: item.carat,
                        color: item.color || '',
                        clarity: item.clarity || '',
                        cut: item.cut || '',
                        shape: item.shape || '',
                        category: item.category || 'SINGLE',
                        polish: item.polish || null,
                        ratePerCarat: item.ratePerCarat,
                        currentValue: item.totalValue,
                        status: enums_1.ItemStatus.AVAILABLE,
                        certificateStatus: item.linkedCertificateId ? enums_1.CertificateState.RECEIVED : enums_1.CertificateState.NONE
                    }
                });
                diamondItemId = existingDiamond.id;
            }
            else {
                existingDiamond = await tx.diamondItem.findUnique({ where: { id: diamondItemId } });
                if (!existingDiamond)
                    throw new errors_1.NotFoundError(`Diamond ${diamondItemId} not found`);
            }
            const stockBeforeId = existingDiamond.stockId;
            const locationBeforeId = existingDiamond.locationId;
            const statusBefore = existingDiamond.status;
            await tx.transactionItem.create({
                data: {
                    transactionId: transaction.id,
                    diamondItemId: diamondItemId,
                    name: item.name || item.displayName || null,
                    quantity: 1,
                    carat: item.carat,
                    ratePerCarat: item.ratePerCarat,
                    totalValue: item.totalValue,
                    itemAction: item.itemAction
                }
            });
            let stockAfterId = existingDiamond.stockId;
            let locationAfterId = existingDiamond.locationId;
            let eventType = enums_1.ItemEventType.ADJUSTED;
            // Phase 9: State Machine Validation
            const transition = (0, inventory_state_machine_1.validateTransition)(transactionType, statusBefore);
            if (!transition.valid) {
                throw new errors_1.ValidationError(transition.error);
            }
            let statusAfter = transition.targetStatus;
            if (transactionType === enums_1.TransactionType.PURCHASE || transactionType === enums_1.TransactionType.ADD_IN) {
                statusAfter = enums_1.ItemStatus.AVAILABLE;
                eventType = transactionType === enums_1.TransactionType.PURCHASE ? enums_1.ItemEventType.PURCHASED : enums_1.ItemEventType.ADJUSTED;
                await tx.inventoryMovement.create({
                    data: {
                        diamondItemId: diamondItemId,
                        transactionId: transaction.id,
                        movementType: transactionType === enums_1.TransactionType.PURCHASE ? enums_1.MovementType.PURCHASE : enums_1.MovementType.ADJUSTMENT,
                        toStockId: ledger.stockId,
                        toLocationId: item.toLocationId,
                        caratMoved: item.carat,
                        quantity: 1,
                        movementDate: transactionDate,
                        reason: remarks,
                        createdBy
                    }
                });
                await tx.financialEntry.create({
                    data: {
                        transactionId: transaction.id,
                        partyId,
                        diamondItemId: diamondItemId,
                        entryType: enums_1.FinancialEntryType.PURCHASE,
                        debit: 0,
                        credit: item.totalValue,
                        amount: item.totalValue,
                        description: remarks
                    }
                });
            }
            else if (transactionType === enums_1.TransactionType.SALE) {
                if (statusBefore === enums_1.ItemStatus.SOLD)
                    throw new errors_1.ConflictError(`Diamond ${diamondItemId} already sold`);
                statusAfter = enums_1.ItemStatus.SOLD;
                eventType = enums_1.ItemEventType.SOLD;
                await tx.inventoryMovement.create({
                    data: {
                        diamondItemId: diamondItemId,
                        transactionId: transaction.id,
                        movementType: enums_1.MovementType.SALE,
                        fromStockId: stockBeforeId,
                        fromLocationId: locationBeforeId,
                        caratMoved: item.carat,
                        quantity: 1,
                        movementDate: transactionDate,
                        reason: remarks,
                        createdBy
                    }
                });
                await tx.financialEntry.create({
                    data: {
                        transactionId: transaction.id,
                        partyId,
                        diamondItemId: diamondItemId,
                        entryType: enums_1.FinancialEntryType.SALE,
                        debit: item.totalValue,
                        credit: 0,
                        amount: item.totalValue,
                        description: remarks
                    }
                });
            }
            else if (transactionType === enums_1.TransactionType.RETURN) {
                statusAfter = enums_1.ItemStatus.AVAILABLE;
                eventType = enums_1.ItemEventType.RETURNED;
                await tx.inventoryMovement.create({
                    data: {
                        diamondItemId: diamondItemId,
                        transactionId: transaction.id,
                        movementType: enums_1.MovementType.RETURN,
                        toStockId: stockBeforeId,
                        toLocationId: locationBeforeId,
                        caratMoved: item.carat,
                        quantity: 1,
                        movementDate: transactionDate,
                        reason: remarks,
                        createdBy
                    }
                });
                await tx.financialEntry.create({
                    data: {
                        transactionId: transaction.id,
                        partyId,
                        diamondItemId: diamondItemId,
                        entryType: enums_1.FinancialEntryType.REFUND,
                        debit: 0,
                        credit: item.totalValue,
                        amount: item.totalValue,
                        description: remarks
                    }
                });
            }
            else if (transactionType === enums_1.TransactionType.TRANSFER) {
                stockAfterId = item.toStockId || stockBeforeId;
                locationAfterId = item.toLocationId || locationBeforeId;
                eventType = enums_1.ItemEventType.TRANSFERRED;
                await tx.inventoryMovement.create({
                    data: {
                        diamondItemId: diamondItemId,
                        transactionId: transaction.id,
                        movementType: enums_1.MovementType.TRANSFER,
                        fromStockId: stockBeforeId,
                        toStockId: stockAfterId,
                        fromLocationId: locationBeforeId,
                        toLocationId: locationAfterId,
                        caratMoved: item.carat,
                        quantity: 1,
                        movementDate: transactionDate,
                        reason: remarks,
                        createdBy
                    }
                });
            }
            else if (transactionType === enums_1.TransactionType.WRITE_OFF) {
                statusAfter = enums_1.ItemStatus.WRITTEN_OFF;
                eventType = enums_1.ItemEventType.WRITTEN_OFF;
                await tx.inventoryMovement.create({
                    data: {
                        diamondItemId: diamondItemId,
                        transactionId: transaction.id,
                        movementType: enums_1.MovementType.WRITE_OFF,
                        fromStockId: stockBeforeId,
                        fromLocationId: locationBeforeId,
                        caratMoved: item.carat,
                        quantity: 1,
                        movementDate: transactionDate,
                        reason: remarks,
                        createdBy
                    }
                });
                await tx.financialEntry.create({
                    data: {
                        transactionId: transaction.id,
                        diamondItemId: diamondItemId,
                        entryType: enums_1.FinancialEntryType.WRITE_OFF,
                        debit: item.totalValue,
                        credit: 0,
                        amount: item.totalValue,
                        description: remarks
                    }
                });
            }
            else if (transactionType === enums_1.TransactionType.REPAIR) {
                statusAfter = enums_1.ItemStatus.IN_REPAIR;
                eventType = enums_1.ItemEventType.ADJUSTED;
                await tx.inventoryMovement.create({
                    data: {
                        diamondItemId: diamondItemId,
                        transactionId: transaction.id,
                        movementType: enums_1.MovementType.REPAIR_OUT,
                        fromStockId: stockBeforeId,
                        fromLocationId: locationBeforeId,
                        caratMoved: item.carat,
                        quantity: 1,
                        movementDate: transactionDate,
                        reason: remarks,
                        createdBy
                    }
                });
            }
            else if (transactionType === enums_1.TransactionType.REPAIR_IN) {
                statusAfter = enums_1.ItemStatus.AVAILABLE;
                eventType = enums_1.ItemEventType.REPAIRED;
                await tx.inventoryMovement.create({
                    data: {
                        diamondItemId: diamondItemId,
                        transactionId: transaction.id,
                        movementType: enums_1.MovementType.REPAIR_IN,
                        toStockId: stockBeforeId,
                        toLocationId: locationBeforeId,
                        caratMoved: item.carat,
                        quantity: 1,
                        movementDate: transactionDate,
                        reason: remarks,
                        createdBy
                    }
                });
                if (item.repairCost && item.repairCost > 0) {
                    await tx.financialEntry.create({
                        data: {
                            transactionId: transaction.id,
                            partyId,
                            diamondItemId: diamondItemId,
                            entryType: enums_1.FinancialEntryType.REPAIR_EXPENSE,
                            debit: item.repairCost,
                            credit: 0,
                            amount: item.repairCost,
                            description: remarks
                        }
                    });
                }
            }
            else if (transactionType === enums_1.TransactionType.CERTIFICATION) {
                statusAfter = enums_1.ItemStatus.IN_CERTIFICATION;
                eventType = enums_1.ItemEventType.ADJUSTED;
                await tx.inventoryMovement.create({
                    data: {
                        diamondItemId: diamondItemId,
                        transactionId: transaction.id,
                        movementType: enums_1.MovementType.CERTIFICATION_OUT,
                        fromStockId: stockBeforeId,
                        fromLocationId: locationBeforeId,
                        caratMoved: item.carat,
                        quantity: 1,
                        movementDate: transactionDate,
                        reason: remarks,
                        createdBy
                    }
                });
            }
            else if (transactionType === enums_1.TransactionType.CERTIFICATION_IN) {
                statusAfter = enums_1.ItemStatus.AVAILABLE;
                eventType = enums_1.ItemEventType.CERTIFIED;
                await tx.inventoryMovement.create({
                    data: {
                        diamondItemId: diamondItemId,
                        transactionId: transaction.id,
                        movementType: enums_1.MovementType.CERTIFICATION_IN,
                        toStockId: stockBeforeId,
                        toLocationId: locationBeforeId,
                        caratMoved: item.carat,
                        quantity: 1,
                        movementDate: transactionDate,
                        reason: remarks,
                        createdBy
                    }
                });
                if (item.certCost && item.certCost > 0) {
                    await tx.financialEntry.create({
                        data: {
                            transactionId: transaction.id,
                            partyId,
                            diamondItemId: diamondItemId,
                            entryType: enums_1.FinancialEntryType.CERTIFICATION_EXPENSE,
                            debit: item.certCost,
                            credit: 0,
                            amount: item.certCost,
                            description: remarks
                        }
                    });
                }
            }
            let currentCertificateId = item.linkedCertificateId;
            if (transactionType === enums_1.TransactionType.CERTIFICATION_IN && item.linkedCertificateId) {
                await tx.certification.update({
                    where: { id: item.linkedCertificateId },
                    data: {
                        diamondItemId: diamondItemId,
                        certificateStatus: 'ISSUED',
                        cost: item.certCost || 0,
                        transactionId: transaction.id
                    }
                });
            }
            else if (item.linkedCertificateId) {
                await tx.certification.update({
                    where: { id: item.linkedCertificateId },
                    data: { diamondItemId: diamondItemId }
                });
                const normalizedReportNumber = (item.internalNotes && item.internalNotes.trim() !== '') ? item.internalNotes.trim() : null;
                const newCert = await tx.certification.create({
                    data: {
                        diamondItemId: diamondItemId,
                        labType: item.labType,
                        reportNumber: normalizedReportNumber,
                        certificateStatus: 'PENDING',
                        cost: item.certCost || 0,
                        laserInscription: item.internalNotes || '',
                        name: item.name || '',
                        transactionId: transaction.id
                    }
                });
                currentCertificateId = newCert.id;
            }
            if (transactionType === enums_1.TransactionType.REPAIR_IN && item.linkedRepairId) {
                await tx.repair.update({
                    where: { id: item.linkedRepairId },
                    data: {
                        status: 'COMPLETED',
                        cost: item.repairCost || 0,
                        caratAfter: item.carat,
                        dateCompleted: new Date(),
                        transactionId: transaction.id
                    }
                });
            }
            else if (item.repairType && item.repairType !== 'No Repair' && item.repairType !== '') {
                if (!item.repairVendorId) {
                    throw new errors_1.ValidationError('Repair vendor is required when a repair is linked.');
                }
                await tx.repair.create({
                    data: {
                        diamondItemId: diamondItemId,
                        repairType: item.repairType,
                        vendorPartyId: item.repairVendorId,
                        cost: item.repairCost || 0,
                        status: 'IN_PROGRESS',
                        dateSent: new Date(),
                        caratBefore: existingDiamond.carat,
                        remarks: 'Inline linked via transaction',
                        name: item.name || '',
                        transactionId: transaction.id
                    }
                });
            }
            const updateData = {
                status: statusAfter,
                stockId: stockAfterId,
                locationId: locationAfterId,
                ...(currentCertificateId ? { certificateStatus: enums_1.CertificateState.RECEIVED, currentCertificateId } : {})
            };
            const isExistingItem = Boolean(item.diamondItemId || item.existingDiamondId);
            if (isExistingItem) {
                // Optimistic concurrency locking to prevent double movement / double sale (Finding 23)
                const diamondVersion = existingDiamond.version || 1;
                const updated = await tx.diamondItem.updateMany({
                    where: {
                        id: diamondItemId,
                        status: statusBefore,
                        version: diamondVersion,
                    },
                    data: {
                        ...updateData,
                        version: { increment: 1 },
                    }
                });
                if (updated.count === 0) {
                    throw new errors_1.ConflictError(`Concurrent modification detected for diamond ${diamondItemId}. Status changed from ${statusBefore} by another transaction.`);
                }
            }
            else {
                await tx.diamondItem.update({
                    where: { id: diamondItemId },
                    data: updateData
                });
            }
            await tx.itemEvent.create({
                data: {
                    diamondItemId: diamondItemId,
                    transactionId: transaction.id,
                    eventType,
                    eventDate: transactionDate,
                    partyId,
                    caratBefore: existingDiamond.carat,
                    caratAfter: item.carat,
                    rateBefore: existingDiamond.ratePerCarat,
                    rateAfter: item.ratePerCarat,
                    valueBefore: existingDiamond.currentValue,
                    valueAfter: item.totalValue,
                    statusBefore,
                    statusAfter,
                    stockBeforeId,
                    stockAfterId,
                    locationBeforeId,
                    locationAfterId,
                    createdBy,
                    remarks
                }
            });
        }
        // Create AuditEvent in the same transaction boundary (Findings 73 & 74)
        await tx.auditEvent.create({
            data: {
                entityType: 'TRANSACTION',
                entityId: transaction.id,
                eventType: `TRANSACTION_${transactionType}`,
                description: `${transactionType} transaction ${transactionNo} created with ${items.length} item(s)`,
                performedBy: createdBy || 'system',
            }
        });
        return await tx.transaction.findUnique({
            where: { id: transaction.id },
            include: { items: true, inventoryMovements: true, financialEntries: true }
        });
    }
    // Higher-level business methods wrapping createTransaction
    async createPurchase(payload) {
        // Force transactionType to PURCHASE
        return this.createTransaction({ ...payload, transactionType: enums_1.TransactionType.PURCHASE });
    }
    async createSale(payload) {
        // For SALE, items must transition from AVAILABLE to SOLD.
        // The items payload should only include IN/OUT rules appropriately.
        return this.createTransaction({ ...payload, transactionType: enums_1.TransactionType.SALE });
    }
    async createReturn(payload) {
        return this.createTransaction({ ...payload, transactionType: enums_1.TransactionType.RETURN });
    }
    /**
     * Enforce Historical Immutability
     * Transactions, movements, and events cannot be modified or deleted once posted.
     * To correct an error, a reversing entry (e.g., Return or Write-Off) must be used.
     */
    async updateTransaction(id, payload) {
        return await prisma_1.default.$transaction(async (tx) => {
            const oldTxn = await tx.transaction.findUnique({
                where: { id },
                include: { items: true, inventoryMovements: true, financialEntries: true, events: true }
            });
            if (!oldTxn)
                throw new Error('Transaction not found');
            // Phase 10 & Finding 22: Immutable posted / terminal transactions
            if (oldTxn.status === 'POSTED') {
                throw new errors_1.BusinessRuleError('Transaction is POSTED and immutable. Use a reversal transaction instead.');
            }
            if (!(0, transaction_state_machine_1.isTransactionMutable)(oldTxn.status)) {
                throw new errors_1.BusinessRuleError(`Transaction in status "${oldTxn.status}" is immutable. Use a reversal transaction instead.`);
            }
            if (payload.expectedVersion !== undefined && oldTxn.version !== payload.expectedVersion) {
                throw new errors_1.ConcurrencyConflictError('Concurrency conflict: Transaction has been modified by another process.', oldTxn.version, payload.expectedVersion);
            }
            for (const item of oldTxn.items) {
                const futureEvents = await tx.itemEvent.count({
                    where: {
                        diamondItemId: item.diamondItemId,
                        createdAt: { gt: oldTxn.createdAt }
                    }
                });
                if (futureEvents > 0) {
                    throw new errors_1.ConflictError('Cannot edit transaction. Some items have been modified in subsequent transactions.');
                }
            }
            for (const event of oldTxn.events) {
                const priorEventsCount = await tx.itemEvent.count({
                    where: { diamondItemId: event.diamondItemId, createdAt: { lt: event.createdAt } }
                });
                if (priorEventsCount === 0) {
                    await tx.certification.deleteMany({ where: { diamondItemId: event.diamondItemId } });
                    await tx.repair.deleteMany({ where: { diamondItemId: event.diamondItemId } });
                }
                else {
                    await tx.diamondItem.update({
                        where: { id: event.diamondItemId },
                        data: {
                            status: event.statusBefore || undefined,
                            stockId: event.stockBeforeId || undefined,
                            locationId: event.locationBeforeId || undefined,
                            carat: event.caratBefore || undefined,
                            ratePerCarat: event.rateBefore || undefined,
                            currentValue: event.valueBefore || undefined
                        }
                    });
                }
            }
            await tx.inventoryMovement.deleteMany({ where: { transactionId: id } });
            await tx.financialEntry.deleteMany({ where: { transactionId: id } });
            await tx.itemEvent.deleteMany({ where: { transactionId: id } });
            await tx.transactionItem.deleteMany({ where: { transactionId: id } });
            for (const event of oldTxn.events) {
                const priorEventsCount = await tx.itemEvent.count({
                    where: { diamondItemId: event.diamondItemId, createdAt: { lt: event.createdAt } }
                });
                if (priorEventsCount === 0) {
                    await tx.diamondItem.delete({ where: { id: event.diamondItemId } });
                }
            }
            await tx.repair.updateMany({ where: { transactionId: id }, data: { transactionId: null } });
            await tx.certification.updateMany({ where: { transactionId: id }, data: { transactionId: null } });
            await tx.transaction.delete({ where: { id } });
            return await this._createTransactionLogic(tx, payload, id, oldTxn.createdAt, oldTxn.version + 1);
        });
    }
    async deleteTransaction(_id) {
        throw new errors_1.ValidationError('Historical transactions cannot be deleted. They are permanently recorded in the ledger.');
    }
    async authorizeTransaction(id, authorizedBy, authorizationReason, expectedVersion) {
        return await prisma_1.default.$transaction(async (tx) => {
            const oldTxn = await tx.transaction.findUnique({ where: { id } });
            if (!oldTxn)
                throw new errors_1.NotFoundError('Transaction not found');
            const transition = (0, transaction_state_machine_1.validateTransactionTransition)(oldTxn.status, 'AUTHORIZED');
            if (!transition.valid) {
                throw new errors_1.ConflictError(transition.error || 'Transaction cannot be authorized in its current state');
            }
            if (expectedVersion !== undefined && oldTxn.version !== expectedVersion) {
                throw new errors_1.ConcurrencyConflictError('Concurrency conflict: Transaction has been modified by another process.', oldTxn.version, expectedVersion);
            }
            await tx.auditEvent.create({
                data: {
                    entityType: 'TRANSACTION',
                    entityId: id,
                    eventType: 'TRANSACTION_AUTHORIZED',
                    description: `Transaction ${oldTxn.transactionNo} authorized. Reason: ${authorizationReason || 'None'}`,
                    performedBy: authorizedBy || 'system',
                }
            });
            return await tx.transaction.update({
                where: { id },
                data: {
                    status: 'AUTHORIZED',
                    authorizedBy,
                    authorizedAt: new Date(),
                    authorizationReason,
                    version: oldTxn.version + 1
                }
            });
        });
    }
}
exports.transactionService = new TransactionService();
//# sourceMappingURL=transaction.service.js.map