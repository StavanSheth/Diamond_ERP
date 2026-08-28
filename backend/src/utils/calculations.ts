/**
 * Pure business logic calculations for diamond stock.
 * These never depend on external state — easy to test and verify.
 */

/**
 * Calculate total value of a stock parcel.
 * TotalValue = CaratWeight × CaratRate
 */
export function calculateTotalValue(caratWeight: number, caratRate: number): number {
  return Math.round(caratWeight * caratRate * 100) / 100;
}

