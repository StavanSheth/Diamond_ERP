import { ItemStatus, TransactionType } from '../types/enums';

/**
 * Diamond Inventory State Machine.
 * 
 * Defines valid state transitions for diamond items based on transaction types.
 * This is the single source of truth for what transitions are allowed.
 * 
 * The server MUST validate all transitions against this machine.
 * The frontend MUST NOT be trusted to provide correct status values.
 */

// ── Allowed Transitions ────────────────────────────────────────────────
/**
 * Maps each transaction type to the set of valid (fromStatus → toStatus) transitions.
 * If a diamond's current status is not listed as a valid 'from' state for the given
 * transaction type, the transition must be rejected.
 */
const ALLOWED_TRANSITIONS: Record<string, Array<{ from: string; to: string }>> = {
  [TransactionType.PURCHASE]: [
    // New diamonds being purchased start as AVAILABLE (from undefined/new)
    { from: '__NEW__', to: ItemStatus.AVAILABLE },
    // If diamond is created inline before validation, it will be AVAILABLE
    { from: ItemStatus.AVAILABLE, to: ItemStatus.AVAILABLE },
  ],

  [TransactionType.ADD_IN]: [
    { from: '__NEW__', to: ItemStatus.AVAILABLE },
    { from: ItemStatus.AVAILABLE, to: ItemStatus.AVAILABLE },
  ],

  [TransactionType.SALE]: [
    { from: ItemStatus.AVAILABLE, to: ItemStatus.SOLD },
  ],

  [TransactionType.RETURN]: [
    { from: ItemStatus.SOLD, to: ItemStatus.AVAILABLE },
  ],

  [TransactionType.REPAIR]: [
    { from: ItemStatus.AVAILABLE, to: ItemStatus.IN_REPAIR },
  ],

  [TransactionType.REPAIR_IN]: [
    { from: ItemStatus.IN_REPAIR, to: ItemStatus.AVAILABLE },
  ],

  [TransactionType.CERTIFICATION]: [
    { from: ItemStatus.AVAILABLE, to: ItemStatus.IN_CERTIFICATION },
  ],

  [TransactionType.CERTIFICATION_IN]: [
    { from: ItemStatus.IN_CERTIFICATION, to: ItemStatus.AVAILABLE },
  ],

  [TransactionType.TRANSFER]: [
    // Transfer doesn't change status, only location/stock
    { from: ItemStatus.AVAILABLE, to: ItemStatus.AVAILABLE },
    { from: ItemStatus.IN_TRANSIT, to: ItemStatus.AVAILABLE },
  ],

  [TransactionType.WRITE_OFF]: [
    { from: ItemStatus.AVAILABLE, to: ItemStatus.WRITTEN_OFF },
    { from: ItemStatus.IN_REPAIR, to: ItemStatus.WRITTEN_OFF },
  ],

  [TransactionType.ADJUSTMENT]: [
    // Adjustments can change between most states
    { from: ItemStatus.AVAILABLE, to: ItemStatus.AVAILABLE },
    { from: ItemStatus.RESERVED, to: ItemStatus.AVAILABLE },
    { from: ItemStatus.AVAILABLE, to: ItemStatus.RESERVED },
  ],

  [TransactionType.TRANSFORMATION]: [
    { from: ItemStatus.AVAILABLE, to: ItemStatus.AVAILABLE },
  ],
};

// ── Human-readable State Names ──────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  [ItemStatus.AVAILABLE]: 'Available',
  [ItemStatus.SOLD]: 'Sold',
  [ItemStatus.IN_REPAIR]: 'In Repair',
  [ItemStatus.IN_CERTIFICATION]: 'In Certification',
  [ItemStatus.IN_TRANSIT]: 'In Transit',
  [ItemStatus.WRITTEN_OFF]: 'Written Off',
  [ItemStatus.RESERVED]: 'Reserved',
  '__NEW__': 'New (being created)',
};

// ── Validation Function ─────────────────────────────────────────────────

export interface TransitionResult {
  valid: boolean;
  targetStatus: string;
  error?: string;
}

/**
 * Validate and determine the target status for a diamond item state transition.
 * 
 * @param transactionType - The type of transaction being performed
 * @param currentStatus - The current status of the diamond item (or '__NEW__' for new items)
 * @returns TransitionResult with the target status or an error message
 */
export function validateTransition(
  transactionType: string,
  currentStatus: string,
): TransitionResult {
  const transitions = ALLOWED_TRANSITIONS[transactionType];

  if (!transitions) {
    return {
      valid: false,
      targetStatus: currentStatus,
      error: `Unknown transaction type: ${transactionType}`,
    };
  }

  const match = transitions.find(t => t.from === currentStatus);

  if (!match) {
    const allowedFromStates = transitions.map(t => STATUS_LABELS[t.from] || t.from).join(', ');
    const currentLabel = STATUS_LABELS[currentStatus] || currentStatus;

    return {
      valid: false,
      targetStatus: currentStatus,
      error: `Invalid state transition: Cannot perform ${transactionType} on a diamond that is "${currentLabel}". ` +
        `This operation requires the diamond to be in one of: [${allowedFromStates}].`,
    };
  }

  return {
    valid: true,
    targetStatus: match.to,
  };
}

/**
 * Get all valid transitions from a given status.
 * Useful for the UI to show available actions.
 */
export function getAvailableTransitions(currentStatus: string): Array<{
  transactionType: string;
  targetStatus: string;
}> {
  const result: Array<{ transactionType: string; targetStatus: string }> = [];

  for (const [txType, transitions] of Object.entries(ALLOWED_TRANSITIONS)) {
    for (const t of transitions) {
      if (t.from === currentStatus) {
        result.push({
          transactionType: txType,
          targetStatus: t.to,
        });
      }
    }
  }

  return result;
}
