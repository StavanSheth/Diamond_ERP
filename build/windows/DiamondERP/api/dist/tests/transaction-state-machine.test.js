"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const enums_1 = require("../types/enums");
const transaction_state_machine_1 = require("../models/transaction-state-machine");
(0, vitest_1.describe)('Transaction State Machine (Finding 22 & Phase 2)', () => {
    (0, vitest_1.describe)('validateTransactionTransition', () => {
        (0, vitest_1.it)('allows DRAFT -> PENDING_AUTHORIZATION', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)(enums_1.TransactionStatus.DRAFT, enums_1.TransactionStatus.PENDING_AUTHORIZATION);
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('allows DRAFT -> AUTHORIZED (direct authorization path)', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)(enums_1.TransactionStatus.DRAFT, enums_1.TransactionStatus.AUTHORIZED);
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('allows DRAFT -> CANCELLED', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)(enums_1.TransactionStatus.DRAFT, enums_1.TransactionStatus.CANCELLED);
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('allows PENDING_AUTHORIZATION -> AUTHORIZED', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)(enums_1.TransactionStatus.PENDING_AUTHORIZATION, enums_1.TransactionStatus.AUTHORIZED);
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('allows AUTHORIZED -> POSTED', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)(enums_1.TransactionStatus.AUTHORIZED, enums_1.TransactionStatus.POSTED);
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('allows POSTED -> REVERSED', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)(enums_1.TransactionStatus.POSTED, enums_1.TransactionStatus.REVERSED);
            (0, vitest_1.expect)(result.valid).toBe(true);
        });
        (0, vitest_1.it)('rejects POSTED -> DRAFT (historical immutability)', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)(enums_1.TransactionStatus.POSTED, enums_1.TransactionStatus.DRAFT);
            (0, vitest_1.expect)(result.valid).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('Invalid transaction state transition');
        });
        (0, vitest_1.it)('rejects CANCELLED -> any state (terminal state)', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)(enums_1.TransactionStatus.CANCELLED, enums_1.TransactionStatus.DRAFT);
            (0, vitest_1.expect)(result.valid).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('terminal state');
        });
        (0, vitest_1.it)('rejects REVERSED -> any state (terminal state)', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)(enums_1.TransactionStatus.REVERSED, enums_1.TransactionStatus.AUTHORIZED);
            (0, vitest_1.expect)(result.valid).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('terminal state');
        });
        (0, vitest_1.it)('rejects unknown state', () => {
            const result = (0, transaction_state_machine_1.validateTransactionTransition)('NON_EXISTENT', enums_1.TransactionStatus.DRAFT);
            (0, vitest_1.expect)(result.valid).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('Unknown transaction status');
        });
    });
    (0, vitest_1.describe)('isTransactionMutable', () => {
        (0, vitest_1.it)('returns true for DRAFT and PENDING_AUTHORIZATION', () => {
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionMutable)(enums_1.TransactionStatus.DRAFT)).toBe(true);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionMutable)(enums_1.TransactionStatus.PENDING_AUTHORIZATION)).toBe(true);
        });
        (0, vitest_1.it)('returns false for POSTED, AUTHORIZED, CANCELLED, REVERSED', () => {
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionMutable)(enums_1.TransactionStatus.AUTHORIZED)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionMutable)(enums_1.TransactionStatus.POSTED)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionMutable)(enums_1.TransactionStatus.CANCELLED)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionMutable)(enums_1.TransactionStatus.REVERSED)).toBe(false);
        });
    });
    (0, vitest_1.describe)('isTransactionTerminal', () => {
        (0, vitest_1.it)('returns true for CANCELLED and REVERSED', () => {
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionTerminal)(enums_1.TransactionStatus.CANCELLED)).toBe(true);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionTerminal)(enums_1.TransactionStatus.REVERSED)).toBe(true);
        });
        (0, vitest_1.it)('returns false for non-terminal states', () => {
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionTerminal)(enums_1.TransactionStatus.DRAFT)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionTerminal)(enums_1.TransactionStatus.PENDING_AUTHORIZATION)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionTerminal)(enums_1.TransactionStatus.AUTHORIZED)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionTerminal)(enums_1.TransactionStatus.POSTED)).toBe(false);
        });
    });
    (0, vitest_1.describe)('lifecycle helper predicates', () => {
        (0, vitest_1.it)('isTransactionAuthorizable matches authorizable states', () => {
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionAuthorizable)(enums_1.TransactionStatus.DRAFT)).toBe(true);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionAuthorizable)(enums_1.TransactionStatus.PENDING_AUTHORIZATION)).toBe(true);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionAuthorizable)(enums_1.TransactionStatus.POSTED)).toBe(false);
        });
        (0, vitest_1.it)('isTransactionPostable matches only AUTHORIZED', () => {
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionPostable)(enums_1.TransactionStatus.AUTHORIZED)).toBe(true);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionPostable)(enums_1.TransactionStatus.DRAFT)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionPostable)(enums_1.TransactionStatus.POSTED)).toBe(false);
        });
        (0, vitest_1.it)('isTransactionReversible matches only POSTED', () => {
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionReversible)(enums_1.TransactionStatus.POSTED)).toBe(true);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionReversible)(enums_1.TransactionStatus.DRAFT)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionReversible)(enums_1.TransactionStatus.REVERSED)).toBe(false);
        });
        (0, vitest_1.it)('isTransactionCancellable matches pre-posted states', () => {
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionCancellable)(enums_1.TransactionStatus.DRAFT)).toBe(true);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionCancellable)(enums_1.TransactionStatus.PENDING_AUTHORIZATION)).toBe(true);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionCancellable)(enums_1.TransactionStatus.AUTHORIZED)).toBe(true);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionCancellable)(enums_1.TransactionStatus.POSTED)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionCancellable)(enums_1.TransactionStatus.REVERSED)).toBe(false);
            (0, vitest_1.expect)((0, transaction_state_machine_1.isTransactionCancellable)(enums_1.TransactionStatus.CANCELLED)).toBe(false);
        });
    });
    (0, vitest_1.describe)('getAvailableTransactionTransitions', () => {
        (0, vitest_1.it)('returns correct targets for DRAFT', () => {
            const targets = (0, transaction_state_machine_1.getAvailableTransactionTransitions)(enums_1.TransactionStatus.DRAFT);
            (0, vitest_1.expect)(targets).toContain(enums_1.TransactionStatus.PENDING_AUTHORIZATION);
            (0, vitest_1.expect)(targets).toContain(enums_1.TransactionStatus.AUTHORIZED);
            (0, vitest_1.expect)(targets).toContain(enums_1.TransactionStatus.CANCELLED);
        });
        (0, vitest_1.it)('returns empty array for terminal states', () => {
            (0, vitest_1.expect)((0, transaction_state_machine_1.getAvailableTransactionTransitions)(enums_1.TransactionStatus.CANCELLED)).toEqual([]);
            (0, vitest_1.expect)((0, transaction_state_machine_1.getAvailableTransactionTransitions)(enums_1.TransactionStatus.REVERSED)).toEqual([]);
        });
    });
});
//# sourceMappingURL=transaction-state-machine.test.js.map