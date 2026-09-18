/**
 * Phase 5 - Business Data Export Contracts
 */

export interface ExportBusinessDataRequest {
  format: 'XLSX' | 'CSV' | 'SQLITE';
  tables?: string[];
  databasePath?: string;
  customDestinationDir?: string;
  note?: string;
}

export interface ExportManifestDto {
  formatVersion: number;
  exportId: string;
  createdAt: string;
  application: {
    name: string;
    version: string;
  };
  installation: {
    installationId: string;
  };
  database: {
    databaseId: string;
    schemaVersion: number;
    profileCode: string;
  };
  exportFormat: 'XLSX' | 'CSV' | 'SQLITE';
  format?: 'XLSX' | 'CSV' | 'SQLITE';
  tables: Array<{
    tableName: string;
    rowCount: number;
    fileName: string;
    sha256: string;
  }>;
  totalRows: number;
  totalSizeBytes: number;
  tableCount: number;
  exportedTableCount: number;
  failedTableCount: number;
}

export interface ExportVerificationDto {
  exportId: string;
  isValid: boolean;
  manifestMatches: boolean;
  fileCount: number;
  tableCount?: number;
  tablesVerified?: boolean;
  verifiedAt: string;
  error?: string | null;
}

export interface ExportResponseDto {
  success: boolean;
  exportId: string;
  filePath: string;
  format: string;
  totalRows: number;
  sizeBytes: number;
  manifest: ExportManifestDto;
}
