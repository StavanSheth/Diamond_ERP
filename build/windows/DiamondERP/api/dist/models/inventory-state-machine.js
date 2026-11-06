"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTransition = validateTransition;
exports.getAvailableTransitions = getAvailableTransitions;
const enums_1 = require("../types/enums");
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
const ALLOWED_TRANSITIONS = {
    [enums_1.TransactionType.PURCHASE]: [
        // New diamonds being purchased start as AVAILABLE (from undefined/new)
        { from: '__NEW__', to: enums_1.ItemStatus.AVAILABLE },
        // If diamond is created inline before validation, it will be AVAILABLE
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.AVAILABLE },
    ],
    [enums_1.TransactionType.ADD_IN]: [
        { from: '__NEW__', to: enums_1.ItemStatus.AVAILABLE },
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.AVAILABLE },
    ],
    [enums_1.TransactionType.SALE]: [
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.SOLD },
    ],
    [enums_1.TransactionType.RETURN]: [
        { from: enums_1.ItemStatus.SOLD, to: enums_1.ItemStatus.AVAILABLE },
    ],
    [enums_1.TransactionType.REPAIR]: [
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.IN_REPAIR },
    ],
    [enums_1.TransactionType.REPAIR_IN]: [
        { from: enums_1.ItemStatus.IN_REPAIR, to: enums_1.ItemStatus.AVAILABLE },
    ],
    [enums_1.TransactionType.CERTIFICATION]: [
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.IN_CERTIFICATION },
    ],
    [enums_1.TransactionType.CERTIFICATION_IN]: [
        { from: enums_1.ItemStatus.IN_CERTIFICATION, to: enums_1.ItemStatus.AVAILABLE },
    ],
    [enums_1.TransactionType.TRANSFER]: [
        // Transfer doesn't change status, only location/stock
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.AVAILABLE },
        { from: enums_1.ItemStatus.IN_TRANSIT, to: enums_1.ItemStatus.AVAILABLE },
    ],
    [enums_1.TransactionType.WRITE_OFF]: [
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.WRITTEN_OFF },
        { from: enums_1.ItemStatus.IN_REPAIR, to: enums_1.ItemStatus.WRITTEN_OFF },
    ],
    [enums_1.TransactionType.ADJUSTMENT]: [
        // Adjustments can change between most states
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.AVAILABLE },
        { from: enums_1.ItemStatus.RESERVED, to: enums_1.ItemStatus.AVAILABLE },
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.RESERVED },
    ],
    [enums_1.TransactionType.TRANSFORMATION]: [
        { from: enums_1.ItemStatus.AVAILABLE, to: enums_1.ItemStatus.AVAILABLE },
    ],
};
// ── Human-readable State Names ──────────────────────────────────────────
const STATUS_LABELS = {
    [enums_1.ItemStatus.AVAILABLE]: 'Available',
    [enums_1.ItemStatus.SOLD]: 'Sold',
    [enums_1.ItemStatus.IN_REPAIR]: 'In Repair',
    [enums_1.ItemStatus.IN_CERTIFICATION]: 'In Certification',
    [enums_1.ItemStatus.IN_TRANSIT]: 'In Transit',
    [enums_1.ItemStatus.WRITTEN_OFF]: 'Written Off',
    [enums_1.ItemStatus.RESERVED]: 'Reserved',
    '__NEW__': 'New (being created)',
};
/**
 * Validate and determine the target status for a diamond item state transition.
 *
 * @param transactionType - The type of transaction being performed
 * @param currentStatus - The current status of the diamond item (or '__NEW__' for new items)
 * @returns TransitionResult with the target status or an error message
 */
function validateTransition(transactionType, currentStatus) {
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
function getAvailableTransitions(currentStatus) {
    const result = [];
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
//# sourceMappingURL=inventory-state-machine.js.map