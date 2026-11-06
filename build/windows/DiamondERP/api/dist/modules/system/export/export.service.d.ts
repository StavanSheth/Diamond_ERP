import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { ExportBusinessDataRequest, ExportVerificationDto, ExportResponseDto } from '@diamond-erp/contracts';
export declare class ExportService {
    /**
     * Sanitizes values against CSV/Excel spreadsheet formula injection.
     */
    sanitizeCellValue(value: any): any;
    calculateSha256(filePath: string): string;
    /**
     * Authoritative workbook generator from a live PrismaClient.
     * Shared by standard user export, Settings export, and preservation export.
     */
    generateWorkbook(client: PrismaClient, entityFilter?: string[]): Promise<ExcelJS.Workbook>;
    /**
     * Authoritative Business Data Export across defined entities.
     * Strictly excludes passwords, PINs, tokens, and internal security metadata.
     * All-or-nothing: never silently skips failed tables.
     * Strictly rejects template.db and system.db.
     */
    exportBusinessData(req: ExportBusinessDataRequest & {
        exactTargetDir?: string;
        bundleDirName?: string;
    }, performedBy?: string): Promise<ExportResponseDto>;
    /**
     * Verifies an export bundle against its manifest.
     */
    verifyExport(exportPathOrId: string): Promise<ExportVerificationDto>;
}
export declare const exportService: ExportService;
//# sourceMappingURL=export.service.d.ts.map