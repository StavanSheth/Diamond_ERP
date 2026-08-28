"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockRepository = void 0;
/**
 * StockRepository — thin abstraction layer over the data provider.
 *
 * Receives IDataProvider via constructor injection.
 * Delegates all calls to the provider, adding any cross-provider
 * business logic or data transformation if needed.
 */
class StockRepository {
    constructor(provider) {
        this.provider = provider;
    }
    async getAll(requestId) {
        return this.provider.getAllRows(requestId);
    }
    async create(data, requestId) {
        return this.provider.addRow(data, requestId);
    }
    async update(id, data, requestId) {
        return this.provider.updateRow(id, data, requestId);
    }
    async delete(id, requestId) {
        return this.provider.deleteRow(id, requestId);
    }
}
exports.StockRepository = StockRepository;
//# sourceMappingURL=stock.repository.js.map