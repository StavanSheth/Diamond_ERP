/**
 * Certificate State Machine
 *
 * Authoritative lifecycle definitions for:
 *  - CertificationStatus  (the Certification record itself)
 *  - CertificateState     (the DiamondItem's view of its certificate)
 *
 * All state transitions must go through this module.
 * No controller or service may set these enums directly without calling
 * assertCertificationTransition / assertCertificateStateTransition first.
 *
 * CertificationStatus lifecycle:
 *
 *   PENDING ──► SUBMITTED ──► ISSUED ──► REPLACED (terminal)
 *      │            │            │
 *      │            ▼            ▼
 *      │         REJECTED      EXPIRED ──► PENDING
 *      │            │
 *      ▼            ▼
 *   CANCELLED (terminal — from any non-terminal state)
 *
 * CertificateState lifecycle (DiamondItem side):
 *
 *   NONE ──► PENDING ──► RECEIVED
 *    ▲           │           │
 *    └───────────┴───────────┘  (unlink / re-certification)
 */

import { CertificateState, CertificationStatus } from '../../types/enums';
import { BusinessRuleError } from '../../errors';

// ---------------------------------------------------------------------------
// CertificationStatus transitions
// ---------------------------------------------------------------------------

/** Allowed forward transitions for CertificationStatus. */
const CERTIFICATION_STATUS_TRANSITIONS: Record<CertificationStatus, CertificationStatus[]> = {
  [CertificationStatus.PENDING]: [
    CertificationStatus.SUBMITTED,
    CertificationStatus.ISSUED,
    CertificationStatus.CANCELLED,
  ],
  [CertificationStatus.SUBMITTED]: [
    CertificationStatus.ISSUED,
    CertificationStatus.REJECTED,
    CertificationStatus.CANCELLED,
  ],
  [CertificationStatus.ISSUED]: [
    CertificationStatus.PENDING,
    CertificationStatus.REPLACED,
    CertificationStatus.EXPIRED,
    CertificationStatus.CANCELLED,
  ],
  [CertificationStatus.REJECTED]: [
    CertificationStatus.PENDING,
    CertificationStatus.CANCELLED,
  ],
  [CertificationStatus.EXPIRED]: [
    CertificationStatus.PENDING,
  ],
  // Terminal states — no outgoing transitions
  [CertificationStatus.REPLACED]: [],
  [CertificationStatus.CANCELLED]: [],
};

/**
 * Asserts that a CertificationStatus transition is valid.
 * No-ops if `from === to` (idempotent update).
 *
 * @throws {BusinessRuleError} if the transition is not permitted.
 */
export function assertCertificationTransition(
  from: CertificationStatus,
  to: CertificationStatus,
): void {
  if (from === to) return; // idempotent
  const allowed = CERTIFICATION_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BusinessRuleError(
      `Invalid certificate status transition: ${from} → ${to}. ` +
      `Allowed from ${from}: [${allowed.join(', ') || 'none — terminal state'}]`,
    );
  }
}

// ---------------------------------------------------------------------------
// CertificateState transitions (DiamondItem side)
// ---------------------------------------------------------------------------

/** Allowed forward transitions for CertificateState. */
const CERTIFICATE_STATE_TRANSITIONS: Record<CertificateState, CertificateState[]> = {
  [CertificateState.NONE]: [CertificateState.PENDING],
  [CertificateState.PENDING]: [CertificateState.RECEIVED, CertificateState.NONE],
  [CertificateState.RECEIVED]: [CertificateState.NONE, CertificateState.PENDING],
};

/**
 * Asserts that a CertificateState transition is valid.
 * No-ops if `from === to` (idempotent update).
 *
 * @throws {BusinessRuleError} if the transition is not permitted.
 */
export function assertCertificateStateTransition(
  from: CertificateState,
  to: CertificateState,
): void {
  if (from === to) return; // idempotent
  const allowed = CERTIFICATE_STATE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BusinessRuleError(
      `Invalid diamond certificate state transition: ${from} → ${to}. ` +
      `Allowed from ${from}: [${allowed.join(', ')}]`,
    );
  }
}

// ---------------------------------------------------------------------------
// Canonical state helpers — call these instead of hardcoding enum values
// ---------------------------------------------------------------------------

/** The CertificationStatus applied when a certificate is linked to a diamond. */
export const CERT_STATUS_ON_LINK: CertificationStatus = CertificationStatus.ISSUED;

/** The CertificateState applied to a DiamondItem when a certificate is linked. */
export const DIAMOND_STATE_ON_LINK: CertificateState = CertificateState.RECEIVED;

/** The CertificationStatus applied when a certificate is unlinked from a diamond. */
export const CERT_STATUS_ON_UNLINK: CertificationStatus = CertificationStatus.PENDING;

/** The CertificateState applied to a DiamondItem when its certificate is removed. */
export const DIAMOND_STATE_ON_UNLINK: CertificateState = CertificateState.NONE;
