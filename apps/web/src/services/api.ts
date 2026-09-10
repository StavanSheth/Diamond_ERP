/**
 * API Client Facade for Diamond ERP Frontend.
 *
 * Re-exports modular domain API clients while maintaining full backward
 * compatibility with existing consumers of `api`.
 */

export * from './api/client';
export * from './api/stocks.api';
export * from './api/ledger.api';
export * from './api/certificates.api';
export * from './api/parties.api';
export * from './api/repairs.api';
export * from './api/reports.api';
export * from './api/settings.api';
export * from './api/auth.api';

import { stocksApi, buildFilterQueryString } from './api/stocks.api';
import { ledgerApi } from './api/ledger.api';
import { certificatesApi } from './api/certificates.api';
import { partiesApi } from './api/parties.api';
import { repairsApi } from './api/repairs.api';
import { reportsApi } from './api/reports.api';
import { settingsApi } from './api/settings.api';
import { authApi } from './api/auth.api';
import { AdvancedItemFilters } from '../types/stock';

export { buildFilterQueryString, type AdvancedItemFilters };

/**
 * Aggregated singleton API object conforming to the existing client interface.
 */
export const api = {
  // Stocks & Diamonds
  getStocks: stocksApi.getStocks,
  createStock: stocksApi.createStock,
  updateStock: stocksApi.updateStock,
  deleteStock: stocksApi.deleteStock,
  getDashboard: stocksApi.getDashboard,
  getHealth: stocksApi.getHealth,
  getStockItems: stocksApi.getStockItems,
  createStockItem: stocksApi.createStockItem,
  updateStockItem: stocksApi.updateStockItem,
  deleteStockItem: stocksApi.deleteStockItem,
  getDiamonds: stocksApi.getDiamonds,
  getDiamondById: stocksApi.getDiamondById,

  // Ledger
  getLedger: ledgerApi.getLedger,
  getPaymentSummary: ledgerApi.getPaymentSummary,
  getLedgerStocks: ledgerApi.getLedgerStocks,
  getLedgerParties: ledgerApi.getLedgerParties,
  postLedger: ledgerApi.postLedger,
  updateLedger: ledgerApi.updateLedger,
  deleteLedger: ledgerApi.deleteLedger,

  // Certificates
  getCertificates: certificatesApi.getCertificates,
  createCertificate: certificatesApi.createCertificate,
  updateCertificate: certificatesApi.updateCertificate,
  deleteCertificate: certificatesApi.deleteCertificate,
  uploadCertificateFile: certificatesApi.uploadCertificateFile,
  openCertificatePdf: certificatesApi.openCertificatePdf,
  getUnlinkedCertificates: certificatesApi.getUnlinkedCertificates,
  linkCertificate: certificatesApi.linkCertificate,

  // Parties
  getParties: partiesApi.getParties,
  createParty: partiesApi.createParty,
  updateParty: partiesApi.updateParty,
  deleteParty: partiesApi.deleteParty,

  // Repairs
  getRepairs: repairsApi.getRepairs,
  createRepair: repairsApi.createRepair,
  updateRepair: repairsApi.updateRepair,
  deleteRepair: repairsApi.deleteRepair,

  // Reports
  getReports: reportsApi.getReports,
  getReportPreview: reportsApi.getReportPreview,
  downloadReportExcel: reportsApi.downloadReportExcel,

  // Settings & System
  getSettings: settingsApi.getSettings,
  updateSettings: settingsApi.updateSettings,
  getProfiles: settingsApi.getProfiles,
  switchProfile: settingsApi.switchProfile,
  factoryReset: settingsApi.factoryReset,
  exportExcel: settingsApi.exportExcel,
  downloadTemplate: settingsApi.downloadTemplate,
  importExcel: settingsApi.importExcel,
  getActivationStatus: settingsApi.getActivationStatus,
  activateApp: settingsApi.activateApp,

  // Auth
  login: authApi.login,
  bootstrapUser: authApi.bootstrapUser,
  getMe: authApi.getMe,
  logout: authApi.logout,
};
