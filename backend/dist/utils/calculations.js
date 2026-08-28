"use strict";
/**
 * Pure business logic calculations for diamond stock.
 * These never depend on external state — easy to test and verify.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateTotalValue = calculateTotalValue;
exports.calculateAvgRate = calculateAvgRate;
/**
 * Calculate total value of a stock parcel.
 * TotalValue = CaratWeight × CaratRate
 */
function calculateTotalValue(caratWeight, caratRate) {
    return Math.round(caratWeight * caratRate * 100) / 100;
}
/**
 * Calculate average rate per carat across multiple stock items.
 * Weighted average: sum(totalValue) / sum(caratWeight)
 */
function calculateAvgRate(totalValue, totalCarats) {
    if (totalCarats === 0)
        return 0;
    return Math.round((totalValue / totalCarats) * 100) / 100;
}
//# sourceMappingURL=calculations.js.map