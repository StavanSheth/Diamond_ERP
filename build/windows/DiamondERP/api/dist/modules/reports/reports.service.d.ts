import { Response } from 'express';
export declare class ReportsService {
    getKPIs(): Promise<{
        salesVsPurchases: {
            name: string;
            value: number;
        }[];
        inventoryByCategory: {
            name: string;
            value: any;
        }[];
        certificationStatus: {
            name: string;
            value: any;
        }[];
    }>;
    buildReportData(query: any): Promise<{
        title: string;
        subtitle: string;
        columns: {
            key: string;
            header: string;
            align?: "left" | "center" | "right";
            width?: number;
        }[];
        rows: any[];
        kpis: {
            label: string;
            value: string | number;
            color?: string;
        }[];
        entityProfile: any;
    }>;
    /**
     * GET /api/reports/preview
     * Live interactive table preview before export
     */
    exportExcel(query: any, res: Response): Promise<void>;
}
export declare const reportsService: ReportsService;
//# sourceMappingURL=reports.service.d.ts.map