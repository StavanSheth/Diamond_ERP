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
/**
 * Asserts that a CertificationStatus transition is valid.
 * No-ops if `from === to` (idempotent update).
 *
 * @throws {BusinessRuleError} if the transition is not permitted.
 */
export declare function assertCertificationTransition(from: CertificationStatus, to: CertificationStatus): void;
/**
 * Asserts that a CertificateState transition is valid.
 * No-ops if `from === to` (idempotent update).
 *
 * @throws {BusinessRuleError} if the transition is not permitted.
 */
export declare function assertCertificateStateTransition(from: CertificateState, to: CertificateState): void;
/** The CertificationStatus applied when a certificate is linked to a diamond. */
export declare const CERT_STATUS_ON_LINK: CertificationStatus;
/** The CertificateState applied to a DiamondItem when a certificate is linked. */
export declare const DIAMOND_STATE_ON_LINK: CertificateState;
/** The CertificationStatus applied when a certificate is unlinked from a diamond. */
export declare const CERT_STATUS_ON_UNLINK: CertificationStatus;
/** The CertificateState applied to a DiamondItem when its certificate is removed. */
export declare const DIAMOND_STATE_ON_UNLINK: CertificateState;
//# sourceMappingURL=certificate-state-machine.d.ts.map