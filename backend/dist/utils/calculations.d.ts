/**
 * Pure business logic calculations for diamond stock.
 * These never depend on external state — easy to test and verify.
 */
/**
 * Calculate total value of a stock parcel.
 * TotalValue = CaratWeight × CaratRate
 */
export declare function calculateTotalValue(caratWeight: number, caratRate: number): number;
/**
 * Calculate average rate per carat across multiple stock items.
 * Weighted average: sum(totalValue) / sum(caratWeight)
 */
export declare function calculateAvgRate(totalValue: number, totalCarats: number): number;
//# sourceMappingURL=calculations.d.ts.map