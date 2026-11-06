/**
 * Transaction State Machine (Finding 22 & Phase 2).
 *
 * Defines the authoritative lifecycle states and valid transitions for all
 * financial and operational transactions within Diamond ERP.
 *
 * State Lifecycle:
 *   DRAFT
 *     ├──> PENDING_AUTHORIZATION ──> AUTHORIZED ──> POSTED ──> REVERSED (terminal)
 *     ├──> AUTHORIZED (direct path for authorized roles)
 *     └──> CANCELLED (terminal)
 *
 * Invariants:
 * 1. Historical Immutability: Once a transaction is POSTED, CANCELLED, or REVERSED,
 *    it cannot be directly edited, amended, or deleted. Corrections require a reversing entry.
 * 2. Terminal States: CANCELLED and REVERSED are terminal states with zero valid outward transitions.
 * 3. Atomic State Changes: State changes must be validated server-side and recorded in the audit log.
 */
export interface TransactionTransitionResult {
    valid: boolean;
    fromStatus: string;
    toStatus: string;
    error?: string;
}
/**
 * Authoritative transition map.
 * Key: current status. Value: list of valid target statuses.
 */
export declare const ALLOWED_TRANSACTION_TRANSITIONS: Record<string, string[]>;
/**
 * Human-readable status labels for errors and audit logs.
 */
export declare const TRANSACTION_STATUS_LABELS: Record<string, string>;
/**
 * Validate a state transition between transaction statuses.
 */
export declare function validateTransactionTransition(fromStatus: string, toStatus: string): TransactionTransitionResult;
/**
 * Check if a transaction is mutable (can have line items, amounts, or parties updated).
 * Only DRAFT and PENDING_AUTHORIZATION transactions are mutable.
 */
export declare function isTransactionMutable(status: string): boolean;
/**
 * Check if a transaction is in a terminal state (cannot transition anywhere).
 */
export declare function isTransactionTerminal(status: string): boolean;
/**
 * Check if a transaction can be authorized.
 */
export declare function isTransactionAuthorizable(status: string): boolean;
/**
 * Check if a transaction can be posted to the general ledger.
 */
export declare function isTransactionPostable(status: string): boolean;
/**
 * Check if a transaction can be reversed with a correcting entry.
 */
export declare function isTransactionReversible(status: string): boolean;
/**
 * Check if a transaction can be cancelled.
 */
export declare function isTransactionCancellable(status: string): boolean;
/**
 * Get all valid target statuses from a given current status.
 */
export declare function getAvailableTransactionTransitions(currentStatus: string): string[];
//# sourceMappingURL=transaction-state-machine.d.ts.map