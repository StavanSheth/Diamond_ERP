/**
 * Diamond ERP API Client — Domain-specific endpoint methods.
 *
 * Provides type-safe methods for every API endpoint using the
 * shared contracts package for request/response types.
 */

import { DiamondApiTransport, DiamondApiConfig } from './transport';
import {
  API_ROUTES,
  ApiResponse,
  StockItem,
  CreateStockDTO,
  UpdateStockDTO,
  PartyItem,
  LedgerEntry,
  CreateTransactionDTO,
  CertificateItem,
  RepairItem,
  DashboardData,
  LoginRequest,
  LoginResponse,
  CreateUserRequest,
  CreateUserResponse,
  ChangePasswordRequest,
  ListQueryParams,
} from '@diamond-erp/contracts';

export class DiamondApiClient {
  public readonly transport: DiamondApiTransport;

  constructor(config: DiamondApiConfig) {
    this.transport = new DiamondApiTransport(config);
  }

  // ── Auth ─────────────────────────────────────────────────────────────

  async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    return this.transport.post<LoginResponse>(API_ROUTES.AUTH.LOGIN, credentials);
  }

  async changePassword(data: ChangePasswordRequest): Promise<ApiResponse<void>> {
    return this.transport.post<void>(API_ROUTES.AUTH.CHANGE_PASSWORD, data);
  }

  async createUser(data: CreateUserRequest): Promise<ApiResponse<CreateUserResponse>> {
    return this.transport.post<CreateUserResponse>(API_ROUTES.SETTINGS.USERS, data);
  }

  // ── Dashboard ────────────────────────────────────────────────────────

  async getDashboard(): Promise<ApiResponse<DashboardData>> {
    return this.transport.get<DashboardData>(API_ROUTES.DASHBOARD.BASE);
  }

  // ── Stocks ───────────────────────────────────────────────────────────

  async getStocks(params?: ListQueryParams): Promise<ApiResponse<StockItem[]>> {
    return this.transport.get<StockItem[]>(API_ROUTES.STOCKS.BASE, params);
  }

  async getStock(id: string): Promise<ApiResponse<StockItem>> {
    return this.transport.get<StockItem>(API_ROUTES.STOCKS.BY_ID(id));
  }

  async createStock(data: CreateStockDTO): Promise<ApiResponse<StockItem>> {
    return this.transport.post<StockItem>(API_ROUTES.STOCKS.BASE, data);
  }

  async updateStock(id: string, data: UpdateStockDTO): Promise<ApiResponse<StockItem>> {
    return this.transport.put<StockItem>(API_ROUTES.STOCKS.BY_ID(id), data);
  }

  async deleteStock(id: string): Promise<ApiResponse<void>> {
    return this.transport.delete(API_ROUTES.STOCKS.BY_ID(id));
  }

  // ── Parties ──────────────────────────────────────────────────────────

  async getParties(params?: ListQueryParams): Promise<ApiResponse<PartyItem[]>> {
    return this.transport.get<PartyItem[]>(API_ROUTES.PARTIES.BASE, params);
  }

  async getParty(id: string): Promise<ApiResponse<PartyItem>> {
    return this.transport.get<PartyItem>(API_ROUTES.PARTIES.BY_ID(id));
  }

  async createParty(data: Partial<PartyItem>): Promise<ApiResponse<PartyItem>> {
    return this.transport.post<PartyItem>(API_ROUTES.PARTIES.BASE, data);
  }

  async updateParty(id: string, data: Partial<PartyItem>): Promise<ApiResponse<PartyItem>> {
    return this.transport.put<PartyItem>(API_ROUTES.PARTIES.BY_ID(id), data);
  }

  // ── Ledger & Transactions ────────────────────────────────────────────

  async getLedgers(params?: ListQueryParams): Promise<ApiResponse<any[]>> {
    return this.transport.get<any[]>(API_ROUTES.LEDGER.BASE, params);
  }

  async getLedger(id: string): Promise<ApiResponse<any>> {
    return this.transport.get<any>(API_ROUTES.LEDGER.BY_ID(id));
  }

  async getTransactions(ledgerId: string, params?: ListQueryParams): Promise<ApiResponse<LedgerEntry[]>> {
    return this.transport.get<LedgerEntry[]>(API_ROUTES.LEDGER.TRANSACTIONS(ledgerId), params);
  }

  async createTransaction(data: CreateTransactionDTO): Promise<ApiResponse<LedgerEntry>> {
    return this.transport.post<LedgerEntry>(API_ROUTES.LEDGER.BASE, data);
  }

  // ── Certificates ─────────────────────────────────────────────────────

  async getCertificates(params?: ListQueryParams): Promise<ApiResponse<CertificateItem[]>> {
    return this.transport.get<CertificateItem[]>(API_ROUTES.CERTIFICATES.BASE, params);
  }

  async getCertificate(id: string): Promise<ApiResponse<CertificateItem>> {
    return this.transport.get<CertificateItem>(API_ROUTES.CERTIFICATES.BY_ID(id));
  }

  async createCertificate(data: Partial<CertificateItem>): Promise<ApiResponse<CertificateItem>> {
    return this.transport.post<CertificateItem>(API_ROUTES.CERTIFICATES.BASE, data);
  }

  async updateCertificate(id: string, data: Partial<CertificateItem>): Promise<ApiResponse<CertificateItem>> {
    return this.transport.put<CertificateItem>(API_ROUTES.CERTIFICATES.BY_ID(id), data);
  }

  async uploadCertificateFile(id: string, formData: FormData): Promise<ApiResponse<CertificateItem>> {
    return this.transport.upload<CertificateItem>(API_ROUTES.CERTIFICATES.UPLOAD(id), formData);
  }

  // ── Repairs ──────────────────────────────────────────────────────────

  async getRepairs(params?: ListQueryParams): Promise<ApiResponse<RepairItem[]>> {
    return this.transport.get<RepairItem[]>(API_ROUTES.REPAIRS.BASE, params);
  }

  async getRepair(id: string): Promise<ApiResponse<RepairItem>> {
    return this.transport.get<RepairItem>(API_ROUTES.REPAIRS.BY_ID(id));
  }

  async createRepair(data: Partial<RepairItem>): Promise<ApiResponse<RepairItem>> {
    return this.transport.post<RepairItem>(API_ROUTES.REPAIRS.BASE, data);
  }

  async updateRepair(id: string, data: Partial<RepairItem>): Promise<ApiResponse<RepairItem>> {
    return this.transport.put<RepairItem>(API_ROUTES.REPAIRS.BY_ID(id), data);
  }

  // ── Reports ──────────────────────────────────────────────────────────

  async generateReport(params: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    return this.transport.post<unknown>(API_ROUTES.REPORTS.GENERATE, params);
  }

  // ── Settings ─────────────────────────────────────────────────────────

  async getSettings(): Promise<ApiResponse<Record<string, string>>> {
    return this.transport.get<Record<string, string>>(API_ROUTES.SETTINGS.BASE);
  }

  async getProfiles(): Promise<ApiResponse<any[]>> {
    return this.transport.get<any[]>(API_ROUTES.SETTINGS.PROFILES);
  }

  // ── System ───────────────────────────────────────────────────────────

  async healthCheck(): Promise<ApiResponse<{ status: string }>> {
    return this.transport.get<{ status: string }>(API_ROUTES.SYSTEM.HEALTH);
  }
}
