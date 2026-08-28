import prisma from '../providers/db/prisma';
import { 
  TransactionType, 
  ItemEventType, 
  MovementType, 
  FinancialEntryType, 
  ItemStatus,
  
  CertificateState
} from '../types/enums';

interface TransactionItemPayload {
  diamondItemId?: string;
  itemCode?: string;
  name?: string;
  displayName?: string;
  carat: number;
  color?: string;
  clarity?: string;
  cut?: string;
  shape?: string;
  ratePerCarat: number;
  totalValue: number;
  itemAction: string;
  category?: string;
  polish?: string;
  linkedCertificateId?: string;
  labType?: string;
  internalNotes?: string;
  certCost?: number;
  repairType?: string;
  repairVendorId?: string;
  repairCost?: number;
  linkedRepairId?: string;
  existingDiamondId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  toStockId?: string;
}

interface CreateTransactionPayload {
  ledgerId: string;
  transactionType: string;
  transactionDate: Date;
  partyId?: string;
  remarks?: string;
  referenceNo?: string;
  createdBy: string;
  totalCarat: number;
  totalValue: number;
  status?: string;
  expectedVersion?: number;
  paymentStatus?: string;
  paymentDone?: number;
  paymentDue?: number;
  items: TransactionItemPayload[];
}

class TransactionService {
  async createTransaction(payload: CreateTransactionPayload) {
    return await prisma.$transaction(async (tx) => {
      return await this._createTransactionLogic(tx, payload);
    });
  }

  private async _createTransactionLogic(tx: any, payload: CreateTransactionPayload, preserveTransactionId?: string, preserveCreatedAt?: Date, preserveVersion?: number) {
    const { ledgerId, transactionType, transactionDate, partyId, items, remarks, referenceNo, createdBy, paymentStatus, paymentDone, paymentDue } = payload;
    
    const ledger = await tx.ledger.findUnique({
      where: { id: ledgerId },
      include: { stock: true }
    });
    if (!ledger) throw new Error('Ledger not found');

    // 17. TRANSACTION TOTAL RECONCILIATION
    const sumCarat = items.reduce((sum, item) => sum + Number(item.carat), 0);
    const sumValue = items.reduce((sum, item) => sum + Number(item.totalValue), 0);
    
    if (Math.abs(sumCarat - payload.totalCarat) > 0.001) {
      throw new Error(`Transaction carat reconciliation failed: Items sum ${sumCarat} != Transaction total ${payload.totalCarat}`);
    }
    if (Math.abs(sumValue - payload.totalValue) > 0.01) {
      throw new Error(`Transaction value reconciliation failed: Items sum ${sumValue} != Transaction total ${payload.totalValue}`);
    }

    const transactionNo = referenceNo || `TXN-${Date.now()}`;
    
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
        partyId,
        remarks,
        referenceNo,
        createdBy,
        paymentStatus: paymentStatus || 'PENDING',
        paymentDone: paymentDone || 0,
        paymentDue: paymentDue || 0,
      }
    });

    for (const item of items) {
      let diamondItemId = item.diamondItemId || item.existingDiamondId;
      let existingDiamond: any = null;

      if (!diamondItemId) {
        if (!item.itemCode) throw new Error('Item code is required for new items');
        
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
            status: ItemStatus.AVAILABLE,
            certificateStatus: item.linkedCertificateId ? CertificateState.RECEIVED : CertificateState.NONE
          }
        });
        diamondItemId = existingDiamond.id;
      } else {
        existingDiamond = await tx.diamondItem.findUnique({ where: { id: diamondItemId }});
        if (!existingDiamond) throw new Error(`Diamond ${diamondItemId} not found`);
      }

      const stockBeforeId = existingDiamond.stockId;
      const locationBeforeId = existingDiamond.locationId;
      const statusBefore = existingDiamond.status;

      await tx.transactionItem.create({
        data: {
          transactionId: transaction.id,
          diamondItemId: diamondItemId as string,
          name: item.name || item.displayName || null,
          quantity: 1,
          carat: item.carat,
          ratePerCarat: item.ratePerCarat,
          totalValue: item.totalValue,
          itemAction: item.itemAction
        }
      });

      let statusAfter = existingDiamond.status;
      let stockAfterId = existingDiamond.stockId;
      let locationAfterId = existingDiamond.locationId;
      let eventType = ItemEventType.ADJUSTED;
      
      if (transactionType === TransactionType.PURCHASE || transactionType === TransactionType.ADD_IN) {
        statusAfter = ItemStatus.AVAILABLE;
        eventType = transactionType === TransactionType.PURCHASE ? ItemEventType.PURCHASED : ItemEventType.ADJUSTED;
        
        await tx.inventoryMovement.create({
          data: {
            diamondItemId: diamondItemId as string,
            transactionId: transaction.id,
            movementType: transactionType === TransactionType.PURCHASE ? MovementType.PURCHASE : MovementType.ADJUSTMENT,
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
            diamondItemId: diamondItemId as string,
            entryType: FinancialEntryType.PURCHASE,
            debit: 0,
            credit: item.totalValue,
            amount: item.totalValue,
            description: remarks
          }
        });

      } else if (transactionType === TransactionType.SALE) {
        if (statusBefore === ItemStatus.SOLD) throw new Error(`Diamond ${diamondItemId} already sold`);
        statusAfter = ItemStatus.SOLD;
        eventType = ItemEventType.SOLD;

        await tx.inventoryMovement.create({
          data: {
            diamondItemId: diamondItemId as string,
            transactionId: transaction.id,
            movementType: MovementType.SALE,
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
            diamondItemId: diamondItemId as string,
            entryType: FinancialEntryType.SALE,
            debit: item.totalValue,
            credit: 0,
            amount: item.totalValue,
            description: remarks
          }
        });

      } else if (transactionType === TransactionType.RETURN) {
        statusAfter = ItemStatus.AVAILABLE;
        eventType = ItemEventType.RETURNED;

        await tx.inventoryMovement.create({
          data: {
            diamondItemId: diamondItemId as string,
            transactionId: transaction.id,
            movementType: MovementType.RETURN,
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
            diamondItemId: diamondItemId as string,
            entryType: FinancialEntryType.REFUND,
            debit: 0,
            credit: item.totalValue,
            amount: item.totalValue,
            description: remarks
          }
        });

      } else if (transactionType === TransactionType.TRANSFER) {
        stockAfterId = item.toStockId || stockBeforeId;
        locationAfterId = item.toLocationId || locationBeforeId;
        eventType = ItemEventType.TRANSFERRED;

        await tx.inventoryMovement.create({
          data: {
            diamondItemId: diamondItemId as string,
            transactionId: transaction.id,
            movementType: MovementType.TRANSFER,
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
      } else if (transactionType === TransactionType.WRITE_OFF) {
        statusAfter = ItemStatus.WRITTEN_OFF;
        eventType = ItemEventType.WRITTEN_OFF;

        await tx.inventoryMovement.create({
          data: {
            diamondItemId: diamondItemId as string,
            transactionId: transaction.id,
            movementType: MovementType.WRITE_OFF,
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
            diamondItemId: diamondItemId as string,
            entryType: FinancialEntryType.WRITE_OFF,
            debit: item.totalValue,
            credit: 0,
            amount: item.totalValue,
            description: remarks
          }
        });
      } else if (transactionType === TransactionType.REPAIR) {
        statusAfter = ItemStatus.IN_REPAIR;
        eventType = ItemEventType.ADJUSTED;
        
        await tx.inventoryMovement.create({
          data: {
            diamondItemId: diamondItemId as string,
            transactionId: transaction.id,
            movementType: MovementType.REPAIR_OUT,
            fromStockId: stockBeforeId,
            fromLocationId: locationBeforeId,
            caratMoved: item.carat,
            quantity: 1,
            movementDate: transactionDate,
            reason: remarks,
            createdBy
          }
        });
      } else if (transactionType === TransactionType.REPAIR_IN) {
        statusAfter = ItemStatus.AVAILABLE;
        eventType = ItemEventType.REPAIRED;
        
        await tx.inventoryMovement.create({
          data: {
            diamondItemId: diamondItemId as string,
            transactionId: transaction.id,
            movementType: MovementType.REPAIR_IN,
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
              diamondItemId: diamondItemId as string,
              entryType: FinancialEntryType.REPAIR_EXPENSE,
              debit: item.repairCost,
              credit: 0,
              amount: item.repairCost,
              description: remarks
            }
          });
        }
      } else if (transactionType === TransactionType.CERTIFICATION) {
        statusAfter = ItemStatus.IN_CERTIFICATION;
        eventType = ItemEventType.ADJUSTED;
        
        await tx.inventoryMovement.create({
          data: {
            diamondItemId: diamondItemId as string,
            transactionId: transaction.id,
            movementType: MovementType.CERTIFICATION_OUT,
            fromStockId: stockBeforeId,
            fromLocationId: locationBeforeId,
            caratMoved: item.carat,
            quantity: 1,
            movementDate: transactionDate,
            reason: remarks,
            createdBy
          }
        });
      } else if (transactionType === TransactionType.CERTIFICATION_IN) {
        statusAfter = ItemStatus.AVAILABLE;
        eventType = ItemEventType.CERTIFIED;
        
        await tx.inventoryMovement.create({
          data: {
            diamondItemId: diamondItemId as string,
            transactionId: transaction.id,
            movementType: MovementType.CERTIFICATION_IN,
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
              diamondItemId: diamondItemId as string,
              entryType: FinancialEntryType.CERTIFICATION_EXPENSE,
              debit: item.certCost,
              credit: 0,
              amount: item.certCost,
              description: remarks
            }
          });
        }
      }

      let currentCertificateId = item.linkedCertificateId;

      if (transactionType === TransactionType.CERTIFICATION_IN && item.linkedCertificateId) {
        await tx.certification.update({
          where: { id: item.linkedCertificateId },
          data: { 
            diamondItemId: diamondItemId as string,
            certificateStatus: 'ISSUED',
            cost: item.certCost || 0,
            dateIssued: new Date(),
            transactionId: transaction.id
          }
        });
      } else if (item.linkedCertificateId) {
        await tx.certification.update({
          where: { id: item.linkedCertificateId },
          data: { diamondItemId: diamondItemId as string }
        });
      } else if (item.labType && item.labType !== 'None' && item.labType !== '') {
        const newCert = await tx.certification.create({
          data: {
            diamondItemId: diamondItemId as string,
            labType: item.labType,
            reportNumber: item.internalNotes || '',
            certificateStatus: 'PENDING',
            cost: item.certCost || 0,
            laserInscription: item.internalNotes || '',
            name: item.name || '',
            transactionId: transaction.id
          }
        });
        currentCertificateId = newCert.id;
      }

      if (currentCertificateId) {
        await tx.diamondItem.update({
          where: { id: diamondItemId as string },
          data: { certificateStatus: CertificateState.RECEIVED, currentCertificateId }
        });
      }

      if (transactionType === TransactionType.REPAIR_IN && item.linkedRepairId) {
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
      } else if (item.repairType && item.repairType !== 'No Repair' && item.repairType !== '') {
        if (!item.repairVendorId) {
          throw new Error('Repair vendor is required when a repair is linked.');
        }
        await tx.repair.create({
          data: {
            diamondItemId: diamondItemId as string,
            repairType: item.repairType,
            vendorPartyId: item.repairVendorId,
            cost: item.repairCost || 0,
            status: 'PENDING',
            dateSent: new Date(),
            caratBefore: existingDiamond.carat,
            remarks: 'Inline linked via transaction',
            name: item.name || '',
            transactionId: transaction.id
          }
        });
      }

      await tx.diamondItem.update({
        where: { id: diamondItemId as string },
        data: { 
          status: statusAfter,
          stockId: stockAfterId,
          locationId: locationAfterId
        }
      });

      await tx.itemEvent.create({
        data: {
          diamondItemId: diamondItemId as string,
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

    return await tx.transaction.findUnique({
      where: { id: transaction.id },
      include: { items: true, inventoryMovements: true, financialEntries: true }
    });
  }
  // Higher-level business methods wrapping createTransaction
  async createPurchase(payload: Omit<CreateTransactionPayload, 'transactionType'>) {
    // Force transactionType to PURCHASE
    return this.createTransaction({ ...payload, transactionType: TransactionType.PURCHASE });
  }

  async createSale(payload: Omit<CreateTransactionPayload, 'transactionType'>) {
    // For SALE, items must transition from AVAILABLE to SOLD.
    // The items payload should only include IN/OUT rules appropriately.
    return this.createTransaction({ ...payload, transactionType: TransactionType.SALE });
  }

  async createReturn(payload: Omit<CreateTransactionPayload, 'transactionType'>) {
    return this.createTransaction({ ...payload, transactionType: TransactionType.RETURN });
  }

  /**
   * Enforce Historical Immutability
   * Transactions, movements, and events cannot be modified or deleted once posted.
   * To correct an error, a reversing entry (e.g., Return or Write-Off) must be used.
   */
  async updateTransaction(id: string, payload: CreateTransactionPayload) {
    return await prisma.$transaction(async (tx) => {
      const oldTxn = await tx.transaction.findUnique({
        where: { id },
        include: { items: true, inventoryMovements: true, financialEntries: true, events: true }
      });
      if (!oldTxn) throw new Error('Transaction not found');

      if (payload.expectedVersion !== undefined && oldTxn.version !== payload.expectedVersion) {
        throw new Error('Concurrency conflict: Transaction has been modified by another process.');
      }

      for (const item of oldTxn.items) {
        const futureEvents = await tx.itemEvent.count({
          where: {
            diamondItemId: item.diamondItemId,
            createdAt: { gt: oldTxn.createdAt }
          }
        });
        if (futureEvents > 0) {
          throw new Error('Cannot edit transaction. Some items have been modified in subsequent transactions.');
        }
      }

      for (const event of oldTxn.events) {
        const priorEventsCount = await tx.itemEvent.count({
          where: { diamondItemId: event.diamondItemId, createdAt: { lt: event.createdAt } }
        });

        if (priorEventsCount === 0) {
          await tx.certification.deleteMany({ where: { diamondItemId: event.diamondItemId } });
          await tx.repair.deleteMany({ where: { diamondItemId: event.diamondItemId } });
        } else {
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

      await tx.transaction.delete({ where: { id } });

      return await this._createTransactionLogic(tx, payload, id, oldTxn.createdAt, oldTxn.version + 1);
    });
  }

  async deleteTransaction(_id: string): Promise<never> {
    throw new Error('Historical transactions cannot be deleted. They are permanently recorded in the ledger.');
  }

  async authorizeTransaction(id: string, authorizedBy: string, authorizationReason?: string, expectedVersion?: number) {
    return await prisma.$transaction(async (tx) => {
      const oldTxn = await tx.transaction.findUnique({ where: { id } });
      if (!oldTxn) throw new Error('Transaction not found');
      if (oldTxn.status === 'AUTHORIZED' || oldTxn.status === 'POSTED') {
        throw new Error('Transaction is already authorized');
      }
      
      if (expectedVersion !== undefined && oldTxn.version !== expectedVersion) {
        throw new Error('Concurrency conflict: Transaction has been modified by another process.');
      }

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

export const transactionService = new TransactionService();
