import { TransactionStatus } from '../types/enums';

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
export const ALLOWED_TRANSACTION_TRANSITIONS: Record<string, string[]> = {
  [TransactionStatus.DRAFT]: [
    TransactionStatus.PENDING_AUTHORIZATION,
    TransactionStatus.AUTHORIZED,
    TransactionStatus.CANCELLED,
  ],
  [TransactionStatus.PENDING_AUTHORIZATION]: [
    TransactionStatus.AUTHORIZED,
    TransactionStatus.DRAFT,
    TransactionStatus.CANCELLED,
  ],
  [TransactionStatus.AUTHORIZED]: [
    TransactionStatus.POSTED,
    TransactionStatus.CANCELLED,
  ],
  [TransactionStatus.POSTED]: [
    TransactionStatus.REVERSED,
  ],
  [TransactionStatus.CANCELLED]: [],
  [TransactionStatus.REVERSED]: [],
};

/**
 * Human-readable status labels for errors and audit logs.
 */
export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  [TransactionStatus.DRAFT]: 'Draft',
  [TransactionStatus.PENDING_AUTHORIZATION]: 'Pending Authorization',
  [TransactionStatus.AUTHORIZED]: 'Authorized',
  [TransactionStatus.POSTED]: 'Posted',
  [TransactionStatus.CANCELLED]: 'Cancelled',
  [TransactionStatus.REVERSED]: 'Reversed',
};

/**
 * Validate a state transition between transaction statuses.
 */
export function validateTransactionTransition(
  fromStatus: string,
  toStatus: string,
): TransactionTransitionResult {
  const allowed = ALLOWED_TRANSACTION_TRANSITIONS[fromStatus];

  if (!allowed) {
    return {
      valid: false,
      fromStatus,
      toStatus,
      error: `Unknown transaction status: "${fromStatus}".`,
    };
  }

  if (!allowed.includes(toStatus)) {
    const validTargets = allowed.map((s) => TRANSACTION_STATUS_LABELS[s] || s).join(', ');
    const fromLabel = TRANSACTION_STATUS_LABELS[fromStatus] || fromStatus;
    const toLabel = TRANSACTION_STATUS_LABELS[toStatus] || toStatus;

    if (allowed.length === 0) {
      return {
        valid: false,
        fromStatus,
        toStatus,
        error: `Transaction in terminal state "${fromLabel}" cannot be transitioned to "${toLabel}".`,
      };
    }

    return {
      valid: false,
      fromStatus,
      toStatus,
      error: `Invalid transaction state transition from "${fromLabel}" to "${toLabel}". Allowed transitions: [${validTargets}].`,
    };
  }

  return {
    valid: true,
    fromStatus,
    toStatus,
  };
}

/**
 * Check if a transaction is mutable (can have line items, amounts, or parties updated).
 * Only DRAFT and PENDING_AUTHORIZATION transactions are mutable.
 */
export function isTransactionMutable(status: string): boolean {
  return status === TransactionStatus.DRAFT || status === TransactionStatus.PENDING_AUTHORIZATION;
}

/**
 * Check if a transaction is in a terminal state (cannot transition anywhere).
 */
export function isTransactionTerminal(status: string): boolean {
  return status === TransactionStatus.CANCELLED || status === TransactionStatus.REVERSED;
}

/**
 * Check if a transaction can be authorized.
 */
export function isTransactionAuthorizable(status: string): boolean {
  return status === TransactionStatus.DRAFT || status === TransactionStatus.PENDING_AUTHORIZATION;
}

/**
 * Check if a transaction can be posted to the general ledger.
 */
export function isTransactionPostable(status: string): boolean {
  return status === TransactionStatus.AUTHORIZED;
}

/**
 * Check if a transaction can be reversed with a correcting entry.
 */
export function isTransactionReversible(status: string): boolean {
  return status === TransactionStatus.POSTED;
}

/**
 * Check if a transaction can be cancelled.
 */
export function isTransactionCancellable(status: string): boolean {
  return (
    status === TransactionStatus.DRAFT ||
    status === TransactionStatus.PENDING_AUTHORIZATION ||
    status === TransactionStatus.AUTHORIZED
  );
}

/**
 * Get all valid target statuses from a given current status.
 */
export function getAvailableTransactionTransitions(currentStatus: string): string[] {
  return ALLOWED_TRANSACTION_TRANSITIONS[currentStatus] || [];
}
