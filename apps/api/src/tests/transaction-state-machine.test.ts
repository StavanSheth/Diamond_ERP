import { describe, it, expect } from 'vitest';
import { TransactionStatus } from '../types/enums';
import {
  validateTransactionTransition,
  isTransactionMutable,
  isTransactionTerminal,
  isTransactionAuthorizable,
  isTransactionPostable,
  isTransactionReversible,
  isTransactionCancellable,
  getAvailableTransactionTransitions,
} from '../models/transaction-state-machine';

describe('Transaction State Machine (Finding 22 & Phase 2)', () => {
  describe('validateTransactionTransition', () => {
    it('allows DRAFT -> PENDING_AUTHORIZATION', () => {
      const result = validateTransactionTransition(
        TransactionStatus.DRAFT,
        TransactionStatus.PENDING_AUTHORIZATION,
      );
      expect(result.valid).toBe(true);
    });

    it('allows DRAFT -> AUTHORIZED (direct authorization path)', () => {
      const result = validateTransactionTransition(
        TransactionStatus.DRAFT,
        TransactionStatus.AUTHORIZED,
      );
      expect(result.valid).toBe(true);
    });

    it('allows DRAFT -> CANCELLED', () => {
      const result = validateTransactionTransition(
        TransactionStatus.DRAFT,
        TransactionStatus.CANCELLED,
      );
      expect(result.valid).toBe(true);
    });

    it('allows PENDING_AUTHORIZATION -> AUTHORIZED', () => {
      const result = validateTransactionTransition(
        TransactionStatus.PENDING_AUTHORIZATION,
        TransactionStatus.AUTHORIZED,
      );
      expect(result.valid).toBe(true);
    });

    it('allows AUTHORIZED -> POSTED', () => {
      const result = validateTransactionTransition(
        TransactionStatus.AUTHORIZED,
        TransactionStatus.POSTED,
      );
      expect(result.valid).toBe(true);
    });

    it('allows POSTED -> REVERSED', () => {
      const result = validateTransactionTransition(
        TransactionStatus.POSTED,
        TransactionStatus.REVERSED,
      );
      expect(result.valid).toBe(true);
    });

    it('rejects POSTED -> DRAFT (historical immutability)', () => {
      const result = validateTransactionTransition(
        TransactionStatus.POSTED,
        TransactionStatus.DRAFT,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid transaction state transition');
    });

    it('rejects CANCELLED -> any state (terminal state)', () => {
      const result = validateTransactionTransition(
        TransactionStatus.CANCELLED,
        TransactionStatus.DRAFT,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('terminal state');
    });

    it('rejects REVERSED -> any state (terminal state)', () => {
      const result = validateTransactionTransition(
        TransactionStatus.REVERSED,
        TransactionStatus.AUTHORIZED,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('terminal state');
    });

    it('rejects unknown state', () => {
      const result = validateTransactionTransition('NON_EXISTENT', TransactionStatus.DRAFT);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown transaction status');
    });
  });

  describe('isTransactionMutable', () => {
    it('returns true for DRAFT and PENDING_AUTHORIZATION', () => {
      expect(isTransactionMutable(TransactionStatus.DRAFT)).toBe(true);
      expect(isTransactionMutable(TransactionStatus.PENDING_AUTHORIZATION)).toBe(true);
    });

    it('returns false for POSTED, AUTHORIZED, CANCELLED, REVERSED', () => {
      expect(isTransactionMutable(TransactionStatus.AUTHORIZED)).toBe(false);
      expect(isTransactionMutable(TransactionStatus.POSTED)).toBe(false);
      expect(isTransactionMutable(TransactionStatus.CANCELLED)).toBe(false);
      expect(isTransactionMutable(TransactionStatus.REVERSED)).toBe(false);
    });
  });

  describe('isTransactionTerminal', () => {
    it('returns true for CANCELLED and REVERSED', () => {
      expect(isTransactionTerminal(TransactionStatus.CANCELLED)).toBe(true);
      expect(isTransactionTerminal(TransactionStatus.REVERSED)).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      expect(isTransactionTerminal(TransactionStatus.DRAFT)).toBe(false);
      expect(isTransactionTerminal(TransactionStatus.PENDING_AUTHORIZATION)).toBe(false);
      expect(isTransactionTerminal(TransactionStatus.AUTHORIZED)).toBe(false);
      expect(isTransactionTerminal(TransactionStatus.POSTED)).toBe(false);
    });
  });

  describe('lifecycle helper predicates', () => {
    it('isTransactionAuthorizable matches authorizable states', () => {
      expect(isTransactionAuthorizable(TransactionStatus.DRAFT)).toBe(true);
      expect(isTransactionAuthorizable(TransactionStatus.PENDING_AUTHORIZATION)).toBe(true);
      expect(isTransactionAuthorizable(TransactionStatus.POSTED)).toBe(false);
    });

    it('isTransactionPostable matches only AUTHORIZED', () => {
      expect(isTransactionPostable(TransactionStatus.AUTHORIZED)).toBe(true);
      expect(isTransactionPostable(TransactionStatus.DRAFT)).toBe(false);
      expect(isTransactionPostable(TransactionStatus.POSTED)).toBe(false);
    });

    it('isTransactionReversible matches only POSTED', () => {
      expect(isTransactionReversible(TransactionStatus.POSTED)).toBe(true);
      expect(isTransactionReversible(TransactionStatus.DRAFT)).toBe(false);
      expect(isTransactionReversible(TransactionStatus.REVERSED)).toBe(false);
    });

    it('isTransactionCancellable matches pre-posted states', () => {
      expect(isTransactionCancellable(TransactionStatus.DRAFT)).toBe(true);
      expect(isTransactionCancellable(TransactionStatus.PENDING_AUTHORIZATION)).toBe(true);
      expect(isTransactionCancellable(TransactionStatus.AUTHORIZED)).toBe(true);
      expect(isTransactionCancellable(TransactionStatus.POSTED)).toBe(false);
      expect(isTransactionCancellable(TransactionStatus.REVERSED)).toBe(false);
      expect(isTransactionCancellable(TransactionStatus.CANCELLED)).toBe(false);
    });
  });

  describe('getAvailableTransactionTransitions', () => {
    it('returns correct targets for DRAFT', () => {
      const targets = getAvailableTransactionTransitions(TransactionStatus.DRAFT);
      expect(targets).toContain(TransactionStatus.PENDING_AUTHORIZATION);
      expect(targets).toContain(TransactionStatus.AUTHORIZED);
      expect(targets).toContain(TransactionStatus.CANCELLED);
    });

    it('returns empty array for terminal states', () => {
      expect(getAvailableTransactionTransitions(TransactionStatus.CANCELLED)).toEqual([]);
      expect(getAvailableTransactionTransitions(TransactionStatus.REVERSED)).toEqual([]);
    });
  });
});
