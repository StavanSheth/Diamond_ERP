import { AuthenticatedUser } from '../modules/auth/auth.service';
import { AuthorizationError } from '../errors';
import { logger } from '../infrastructure/logging';

// ── Authorization Context ───────────────────────────────────────────────

/**
 * Full authorization context for policy-based resource access control.
 * 
 * This goes beyond simple RBAC ("does role have permission X") to answer:
 * "Can THIS user perform THIS action on THIS resource in THIS profile?"
 * 
 * Finding 12-13: The existing authorize() middleware answers the first question.
 * This policy layer answers the complete question including object ownership
 * and business state.
 */
export interface AuthorizationContext {
  /** The authenticated actor performing the action */
  actor: AuthenticatedUser;
  /** The action being performed (e.g., 'transaction.update') */
  action: string;
  /** The resource being acted upon */
  resource: {
    type: string;
    id: string;
    /** Profile that owns this resource (for cross-profile validation) */
    profileId?: string;
    /** Current state of the resource (e.g., transaction status) */
    status?: string;
    /** Who created the resource */
    createdBy?: string;
  };
  /** The active profile context for this request */
  requestProfileId: string;
}

/**
 * Evaluate whether an action is authorized based on full context.
 * Throws AuthorizationError if denied.
 * 
 * Enforces:
 * 1. RBAC — role has the required permission
 * 2. Profile scope — resource belongs to the active profile
 * 3. Business state — action is valid for the resource's current state
 * 4. Object ownership — certain actions restricted to resource creator
 */
export function authorizeAction(ctx: AuthorizationContext): void {
  // 1. Profile scope validation (Finding 33)
  // If the resource has an explicit profileId, it MUST match the request profile.
  // This prevents cross-profile data access even if RBAC passes.
  if (ctx.resource.profileId && ctx.resource.profileId !== ctx.requestProfileId) {
    logger.warn(
      `[AuthZ] Cross-profile access denied: user "${ctx.actor.username}" ` +
      `attempted ${ctx.action} on ${ctx.resource.type}/${ctx.resource.id} ` +
      `(resource profile: ${ctx.resource.profileId}, request profile: ${ctx.requestProfileId})`
    );
    throw new AuthorizationError(
      `Access denied: resource belongs to a different profile.`
    );
  }

  // 2. Business state validation for specific actions
  validateBusinessState(ctx);
}

import { 
  validateTransactionTransition, 
  isTransactionMutable as isTxMutable,
  getAvailableTransactionTransitions
} from '../models/transaction-state-machine';

// ── Business State Policies ─────────────────────────────────────────────

/**
 * Transaction-specific state policies.
 * Finding 22, 23: Enforce ledger immutability and valid state transitions.
 */
const IMMUTABLE_TRANSACTION_STATES = new Set(['POSTED', 'REVERSED', 'CANCELLED']);

/**
 * Certificate-specific state policies.
 * Finding 34: Prevent arbitrary status changes on immutable certificates.
 */
const IMMUTABLE_CERTIFICATE_STATES = new Set(['CANCELLED']);
const CERTIFICATE_EDIT_RESTRICTED_STATES = new Set(['ISSUED', 'REPLACED']);

function validateBusinessState(ctx: AuthorizationContext): void {
  const { action, resource } = ctx;

  // Transaction state enforcement
  if (resource.type === 'transaction' && resource.status) {
    // Reject modifications to posted/reversed/cancelled transactions
    if (
      (action === 'transaction.update' || action === 'transaction.delete') &&
      IMMUTABLE_TRANSACTION_STATES.has(resource.status)
    ) {
      throw new AuthorizationError(
        `Cannot ${action.split('.')[1]} a transaction in "${resource.status}" status. ` +
        `Posted/reversed/cancelled transactions are immutable.`
      );
    }

    // Validate state transitions
    if (action === 'transaction.post' && resource.status !== 'AUTHORIZED') {
      throw new AuthorizationError(
        `Cannot post a transaction in "${resource.status}" status. Transaction must be authorized first.`
      );
    }

    if (action === 'transaction.reverse' && resource.status !== 'POSTED') {
      throw new AuthorizationError(
        `Cannot reverse a transaction in "${resource.status}" status. Only posted transactions can be reversed.`
      );
    }

    if (action === 'transaction.authorize' && resource.status !== 'PENDING_AUTHORIZATION') {
      throw new AuthorizationError(
        `Cannot authorize a transaction in "${resource.status}" status. Transaction must be pending authorization.`
      );
    }
  }

  // Certificate state enforcement
  if (resource.type === 'certificate' && resource.status) {
    if (
      action === 'certificate.update' &&
      CERTIFICATE_EDIT_RESTRICTED_STATES.has(resource.status)
    ) {
      throw new AuthorizationError(
        `Cannot edit a certificate in "${resource.status}" status. ` +
        `Issued and replaced certificates are read-only. Create a replacement instead.`
      );
    }

    if (
      action === 'certificate.delete' &&
      IMMUTABLE_CERTIFICATE_STATES.has(resource.status)
    ) {
      throw new AuthorizationError(
        `Cannot delete a certificate in "${resource.status}" status.`
      );
    }
  }
}

// ── Convenience Policy Functions ────────────────────────────────────────

/**
 * Validate that a transaction state transition is allowed.
 * Returns the list of valid target states from the current state.
 */
export function getValidTransactionTransitions(currentStatus: string): string[] {
  return getAvailableTransactionTransitions(currentStatus);
}

/**
 * Check if a transaction state transition is valid.
 */
export function isValidTransactionTransition(fromStatus: string, toStatus: string): boolean {
  return validateTransactionTransition(fromStatus, toStatus).valid;
}

/**
 * Check if a transaction in the given status can be modified.
 */
export function isTransactionMutable(status: string): boolean {
  return isTxMutable(status);
}

/**
 * Check if a certificate in the given status can be edited.
 */
export function isCertificateEditable(status: string): boolean {
  return !CERTIFICATE_EDIT_RESTRICTED_STATES.has(status) && !IMMUTABLE_CERTIFICATE_STATES.has(status);
}
