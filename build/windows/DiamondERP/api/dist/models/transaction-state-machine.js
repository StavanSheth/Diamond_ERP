"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSACTION_STATUS_LABELS = exports.ALLOWED_TRANSACTION_TRANSITIONS = void 0;
exports.validateTransactionTransition = validateTransactionTransition;
exports.isTransactionMutable = isTransactionMutable;
exports.isTransactionTerminal = isTransactionTerminal;
exports.isTransactionAuthorizable = isTransactionAuthorizable;
exports.isTransactionPostable = isTransactionPostable;
exports.isTransactionReversible = isTransactionReversible;
exports.isTransactionCancellable = isTransactionCancellable;
exports.getAvailableTransactionTransitions = getAvailableTransactionTransitions;
const enums_1 = require("../types/enums");
/**
 * Authoritative transition map.
 * Key: current status. Value: list of valid target statuses.
 */
exports.ALLOWED_TRANSACTION_TRANSITIONS = {
    [enums_1.TransactionStatus.DRAFT]: [
        enums_1.TransactionStatus.PENDING_AUTHORIZATION,
        enums_1.TransactionStatus.AUTHORIZED,
        enums_1.TransactionStatus.CANCELLED,
    ],
    [enums_1.TransactionStatus.PENDING_AUTHORIZATION]: [
        enums_1.TransactionStatus.AUTHORIZED,
        enums_1.TransactionStatus.DRAFT,
        enums_1.TransactionStatus.CANCELLED,
    ],
    [enums_1.TransactionStatus.AUTHORIZED]: [
        enums_1.TransactionStatus.POSTED,
        enums_1.TransactionStatus.CANCELLED,
    ],
    [enums_1.TransactionStatus.POSTED]: [
        enums_1.TransactionStatus.REVERSED,
    ],
    [enums_1.TransactionStatus.CANCELLED]: [],
    [enums_1.TransactionStatus.REVERSED]: [],
};
/**
 * Human-readable status labels for errors and audit logs.
 */
exports.TRANSACTION_STATUS_LABELS = {
    [enums_1.TransactionStatus.DRAFT]: 'Draft',
    [enums_1.TransactionStatus.PENDING_AUTHORIZATION]: 'Pending Authorization',
    [enums_1.TransactionStatus.AUTHORIZED]: 'Authorized',
    [enums_1.TransactionStatus.POSTED]: 'Posted',
    [enums_1.TransactionStatus.CANCELLED]: 'Cancelled',
    [enums_1.TransactionStatus.REVERSED]: 'Reversed',
};
/**
 * Validate a state transition between transaction statuses.
 */
function validateTransactionTransition(fromStatus, toStatus) {
    const allowed = exports.ALLOWED_TRANSACTION_TRANSITIONS[fromStatus];
    if (!allowed) {
        return {
            valid: false,
            fromStatus,
            toStatus,
            error: `Unknown transaction status: "${fromStatus}".`,
        };
    }
    if (!allowed.includes(toStatus)) {
        const validTargets = allowed.map((s) => exports.TRANSACTION_STATUS_LABELS[s] || s).join(', ');
        const fromLabel = exports.TRANSACTION_STATUS_LABELS[fromStatus] || fromStatus;
        const toLabel = exports.TRANSACTION_STATUS_LABELS[toStatus] || toStatus;
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
function isTransactionMutable(status) {
    return status === enums_1.TransactionStatus.DRAFT || status === enums_1.TransactionStatus.PENDING_AUTHORIZATION;
}
/**
 * Check if a transaction is in a terminal state (cannot transition anywhere).
 */
function isTransactionTerminal(status) {
    return status === enums_1.TransactionStatus.CANCELLED || status === enums_1.TransactionStatus.REVERSED;
}
/**
 * Check if a transaction can be authorized.
 */
function isTransactionAuthorizable(status) {
    return status === enums_1.TransactionStatus.DRAFT || status === enums_1.TransactionStatus.PENDING_AUTHORIZATION;
}
/**
 * Check if a transaction can be posted to the general ledger.
 */
function isTransactionPostable(status) {
    return status === enums_1.TransactionStatus.AUTHORIZED;
}
/**
 * Check if a transaction can be reversed with a correcting entry.
 */
function isTransactionReversible(status) {
    return status === enums_1.TransactionStatus.POSTED;
}
/**
 * Check if a transaction can be cancelled.
 */
function isTransactionCancellable(status) {
    return (status === enums_1.TransactionStatus.DRAFT ||
        status === enums_1.TransactionStatus.PENDING_AUTHORIZATION ||
        status === enums_1.TransactionStatus.AUTHORIZED);
}
/**
 * Get all valid target statuses from a given current status.
 */
function getAvailableTransactionTransitions(currentStatus) {
    return exports.ALLOWED_TRANSACTION_TRANSITIONS[currentStatus] || [];
}
//# sourceMappingURL=transaction-state-machine.js.map