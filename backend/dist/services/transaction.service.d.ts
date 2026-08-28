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
    items: TransactionItemPayload[];
}
export declare class TransactionService {
    createTransaction(payload: CreateTransactionPayload): Promise<any>;
    private _createTransactionLogic;
    createPurchase(payload: Omit<CreateTransactionPayload, 'transactionType'>): Promise<any>;
    createSale(payload: Omit<CreateTransactionPayload, 'transactionType'>): Promise<any>;
    createReturn(payload: Omit<CreateTransactionPayload, 'transactionType'>): Promise<any>;
    /**
     * Enforce Historical Immutability
     * Transactions, movements, and events cannot be modified or deleted once posted.
     * To correct an error, a reversing entry (e.g., Return or Write-Off) must be used.
     */
    updateTransaction(id: string, payload: CreateTransactionPayload): Promise<any>;
    deleteTransaction(_id: string): Promise<never>;
    authorizeTransaction(id: string, authorizedBy: string, authorizationReason?: string, expectedVersion?: number): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        ledgerId: string;
        referenceNo: string | null;
        transactionDate: Date;
        transactionType: string;
        partyId: string | null;
        remarks: string | null;
        createdBy: string;
        transactionNo: string;
        authorizedBy: string | null;
        authorizedAt: Date | null;
        authorizationReason: string | null;
        version: number;
        sequenceNumber: number;
    }>;
}
export declare const transactionService: TransactionService;
export {};
//# sourceMappingURL=transaction.service.d.ts.map