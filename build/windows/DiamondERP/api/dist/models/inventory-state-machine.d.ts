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
export declare function validateTransition(transactionType: string, currentStatus: string): TransitionResult;
/**
 * Get all valid transitions from a given status.
 * Useful for the UI to show available actions.
 */
export declare function getAvailableTransitions(currentStatus: string): Array<{
    transactionType: string;
    targetStatus: string;
}>;
//# sourceMappingURL=inventory-state-machine.d.ts.map