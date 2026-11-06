"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIAMOND_STATE_ON_UNLINK = exports.CERT_STATUS_ON_UNLINK = exports.DIAMOND_STATE_ON_LINK = exports.CERT_STATUS_ON_LINK = void 0;
exports.assertCertificationTransition = assertCertificationTransition;
exports.assertCertificateStateTransition = assertCertificateStateTransition;
const enums_1 = require("../../types/enums");
const errors_1 = require("../../errors");
// ---------------------------------------------------------------------------
// CertificationStatus transitions
// ---------------------------------------------------------------------------
/** Allowed forward transitions for CertificationStatus. */
const CERTIFICATION_STATUS_TRANSITIONS = {
    [enums_1.CertificationStatus.PENDING]: [
        enums_1.CertificationStatus.SUBMITTED,
        enums_1.CertificationStatus.ISSUED,
        enums_1.CertificationStatus.CANCELLED,
    ],
    [enums_1.CertificationStatus.SUBMITTED]: [
        enums_1.CertificationStatus.ISSUED,
        enums_1.CertificationStatus.REJECTED,
        enums_1.CertificationStatus.CANCELLED,
    ],
    [enums_1.CertificationStatus.ISSUED]: [
        enums_1.CertificationStatus.PENDING,
        enums_1.CertificationStatus.REPLACED,
        enums_1.CertificationStatus.EXPIRED,
        enums_1.CertificationStatus.CANCELLED,
    ],
    [enums_1.CertificationStatus.REJECTED]: [
        enums_1.CertificationStatus.PENDING,
        enums_1.CertificationStatus.CANCELLED,
    ],
    [enums_1.CertificationStatus.EXPIRED]: [
        enums_1.CertificationStatus.PENDING,
    ],
    // Terminal states — no outgoing transitions
    [enums_1.CertificationStatus.REPLACED]: [],
    [enums_1.CertificationStatus.CANCELLED]: [],
};
/**
 * Asserts that a CertificationStatus transition is valid.
 * No-ops if `from === to` (idempotent update).
 *
 * @throws {BusinessRuleError} if the transition is not permitted.
 */
function assertCertificationTransition(from, to) {
    if (from === to)
        return; // idempotent
    const allowed = CERTIFICATION_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
        throw new errors_1.BusinessRuleError(`Invalid certificate status transition: ${from} → ${to}. ` +
            `Allowed from ${from}: [${allowed.join(', ') || 'none — terminal state'}]`);
    }
}
// ---------------------------------------------------------------------------
// CertificateState transitions (DiamondItem side)
// ---------------------------------------------------------------------------
/** Allowed forward transitions for CertificateState. */
const CERTIFICATE_STATE_TRANSITIONS = {
    [enums_1.CertificateState.NONE]: [enums_1.CertificateState.PENDING],
    [enums_1.CertificateState.PENDING]: [enums_1.CertificateState.RECEIVED, enums_1.CertificateState.NONE],
    [enums_1.CertificateState.RECEIVED]: [enums_1.CertificateState.NONE, enums_1.CertificateState.PENDING],
};
/**
 * Asserts that a CertificateState transition is valid.
 * No-ops if `from === to` (idempotent update).
 *
 * @throws {BusinessRuleError} if the transition is not permitted.
 */
function assertCertificateStateTransition(from, to) {
    if (from === to)
        return; // idempotent
    const allowed = CERTIFICATE_STATE_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
        throw new errors_1.BusinessRuleError(`Invalid diamond certificate state transition: ${from} → ${to}. ` +
            `Allowed from ${from}: [${allowed.join(', ')}]`);
    }
}
// ---------------------------------------------------------------------------
// Canonical state helpers — call these instead of hardcoding enum values
// ---------------------------------------------------------------------------
/** The CertificationStatus applied when a certificate is linked to a diamond. */
exports.CERT_STATUS_ON_LINK = enums_1.CertificationStatus.ISSUED;
/** The CertificateState applied to a DiamondItem when a certificate is linked. */
exports.DIAMOND_STATE_ON_LINK = enums_1.CertificateState.RECEIVED;
/** The CertificationStatus applied when a certificate is unlinked from a diamond. */
exports.CERT_STATUS_ON_UNLINK = enums_1.CertificationStatus.PENDING;
/** The CertificateState applied to a DiamondItem when its certificate is removed. */
exports.DIAMOND_STATE_ON_UNLINK = enums_1.CertificateState.NONE;
//# sourceMappingURL=certificate-state-machine.js.map