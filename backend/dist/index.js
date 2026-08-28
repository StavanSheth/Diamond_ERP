"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const config_1 = require("./config");
const logger_1 = require("./logger");
const provider_1 = require("./providers/google/provider");
const stock_controller_1 = require("./api/controllers/stock.controller");
const health_controller_1 = require("./api/controllers/health.controller");
const dashboard_controller_1 = require("./api/controllers/dashboard.controller");
const ledger_controller_1 = require("./api/controllers/ledger.controller");
const certificate_controller_1 = require("./api/controllers/certificate.controller");
const party_controller_1 = require("./api/controllers/party.controller");
const repair_controller_1 = require("./api/controllers/repair.controller");
const settings_controller_1 = require("./api/controllers/settings.controller");
const routes_1 = require("./api/routes");
const request_id_1 = require("./middleware/request-id");
const performance_1 = require("./middleware/performance");
const error_handler_1 = require("./middleware/error-handler");
const cors_1 = require("./middleware/cors");
const prisma_1 = __importDefault(require("./providers/db/prisma"));
const draft_controller_1 = require("./api/controllers/draft.controller");
const version_controller_1 = require("./api/controllers/version.controller");
/**
 * Swagger/OpenAPI configuration for DiamondERP V3.0.
 */
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'DiamondERP V3.0 — Inventory API',
            version: '3.0.0',
            description: 'REST API for diamond stock inventory management with Google Sheets synchronization. ' +
                'Supports CRUD operations with optimistic locking, retry logic, and performance metrics.',
        },
        servers: [{ url: `http://localhost:${config_1.config.port}` }],
        components: {
            schemas: {
                StockItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: 'a1b2c3d4' },
                        stockName: { type: 'string', example: 'WHITE STAR' },
                        reportGroup: { type: 'string', example: 'Certified Mix Parcel' },
                        location: { type: 'string', example: 'Mumbai - Main Office' },
                        itemType: { type: 'string', example: 'Mix' },
                        shape: { type: 'string', example: 'Round' },
                        cut: { type: 'string', example: 'EX' },
                        clarity: { type: 'string', example: 'VS1' },
                        color: { type: 'string', example: 'D' },
                        caratWeight: { type: 'number', example: 50.25 },
                        caratRate: { type: 'number', example: 45000 },
                        totalValue: { type: 'number', example: 2261250 },
                        status: { type: 'string', enum: ['ACTIVE', 'PARTIAL', 'SOLD_OUT', 'ARCHIVED'], example: 'ACTIVE' },
                        remarks: { type: 'string', example: 'Premium quality lot' },
                        itemCount: { type: 'integer', example: 12 },
                        version: { type: 'integer', example: 1 },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                        updatedBy: { type: 'string', example: 'system' },
                    },
                },
                CreateStockDTO: {
                    type: 'object',
                    required: ['stockName', 'caratWeight', 'caratRate'],
                    properties: {
                        stockName: { type: 'string', example: 'WHITE STAR' },
                        reportGroup: { type: 'string' },
                        location: { type: 'string' },
                        itemType: { type: 'string' },
                        shape: { type: 'string' },
                        cut: { type: 'string' },
                        clarity: { type: 'string' },
                        color: { type: 'string' },
                        caratWeight: { type: 'number', minimum: 0, example: 50.25 },
                        caratRate: { type: 'number', minimum: 0, example: 45000 },
                        remarks: { type: 'string' },
                        itemCount: { type: 'integer', minimum: 1 },
                    },
                },
                UpdateStockDTO: {
                    type: 'object',
                    required: ['stockName', 'caratWeight', 'caratRate', 'version'],
                    properties: {
                        stockName: { type: 'string' },
                        reportGroup: { type: 'string' },
                        location: { type: 'string' },
                        itemType: { type: 'string' },
                        shape: { type: 'string' },
                        cut: { type: 'string' },
                        clarity: { type: 'string' },
                        color: { type: 'string' },
                        caratWeight: { type: 'number', minimum: 0 },
                        caratRate: { type: 'number', minimum: 0 },
                        remarks: { type: 'string' },
                        itemCount: { type: 'integer' },
                        status: { type: 'string' },
                        version: { type: 'integer', minimum: 1 },
                    },
                },
                ApiResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'array', items: { $ref: '#/components/schemas/StockItem' } },
                        syncStatus: { type: 'string', enum: ['success', 'error', 'partial'] },
                        googleLatency: { type: 'number' },
                        lastSyncedAt: { type: 'string', format: 'date-time' },
                        requestId: { type: 'string' },
                        performance: { $ref: '#/components/schemas/PerformanceMetrics' },
                    },
                },
                PerformanceMetrics: {
                    type: 'object',
                    properties: {
                        requestTimeMs: { type: 'number' },
                        googleApiTimeMs: { type: 'number' },
                        processingTimeMs: { type: 'number' },
                        totalTimeMs: { type: 'number' },
                    },
                },
                HealthResponse: {
                    type: 'object',
                    properties: {
                        backend: { type: 'string', enum: ['OK', 'ERROR'] },
                        google: { type: 'string', enum: ['Connected', 'Disconnected'] },
                        sheet: { type: 'string', enum: ['Reachable', 'Unreachable'] },
                        lastSync: { type: 'string', nullable: true },
                        uptime: { type: 'number' },
                        requestId: { type: 'string' },
                    },
                },
            },
        },
        paths: {
            '/api/stocks': {
                get: {
                    summary: 'Get all stock items',
                    tags: ['Stocks'],
                    responses: {
                        200: {
                            description: 'All stock items retrieved successfully',
                            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
                        },
                    },
                },
                post: {
                    summary: 'Create a new stock item',
                    tags: ['Stocks'],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateStockDTO' } } },
                    },
                    responses: {
                        201: { description: 'Stock created successfully' },
                        400: { description: 'Validation error' },
                    },
                },
            },
            '/api/stocks/{id}': {
                put: {
                    summary: 'Update a stock item',
                    tags: ['Stocks'],
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateStockDTO' } } },
                    },
                    responses: {
                        200: { description: 'Stock updated successfully' },
                        404: { description: 'Stock not found' },
                        409: { description: 'Version conflict' },
                    },
                },
                delete: {
                    summary: 'Delete a stock item',
                    tags: ['Stocks'],
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: {
                        200: { description: 'Stock deleted successfully' },
                        404: { description: 'Stock not found' },
                    },
                },
            },
            '/api/dashboard': {
                get: {
                    summary: 'Get dashboard KPIs',
                    tags: ['Dashboard'],
                    responses: {
                        200: { description: 'Dashboard data retrieved successfully' },
                    },
                },
            },
            '/health': {
                get: {
                    summary: 'Health check',
                    tags: ['Health'],
                    responses: {
                        200: { description: 'All systems healthy' },
                        503: { description: 'Google Sheets unreachable' },
                    },
                },
            },
        },
    },
    apis: [],
};
/**
 * Bootstrap and start the application.
 */
async function bootstrap() {
    logger_1.logger.info('Starting DiamondERP V3.0 Backend...');
    // 1. Validate configuration
    (0, config_1.validateConfig)();
    logger_1.logger.info(`Port: ${config_1.config.port} | Retry: ${config_1.config.retry.maxAttempts} attempts, ${config_1.config.retry.baseDelayMs}ms base delay`);
    // 2. Database connection check
    try {
        await prisma_1.default.$connect();
        logger_1.logger.info('Connected to SQLite database via Prisma');
    }
    catch (err) {
        logger_1.logger.error('Failed to connect to database', undefined, err);
    }
    // 3. Controllers
    const stockController = new stock_controller_1.StockController();
    const healthController = new health_controller_1.HealthController(new provider_1.GoogleSheetProvider()); // Can mock or leave as is if health still checks something else
    const dashboardController = new dashboard_controller_1.DashboardController();
    const ledgerController = new ledger_controller_1.LedgerController();
    const certificateController = new certificate_controller_1.CertificateController();
    const partyController = new party_controller_1.PartyController();
    const repairController = new repair_controller_1.RepairController();
    const settingsController = new settings_controller_1.SettingsController();
    const draftController = new draft_controller_1.DraftController();
    const versionController = new version_controller_1.VersionController();
    // 4. Create Express app
    const app = (0, express_1.default)();
    // 5. Register middleware (order matters)
    app.use(request_id_1.requestIdMiddleware);
    app.use(cors_1.corsMiddleware);
    app.use(express_1.default.json());
    app.use(performance_1.performanceMiddleware);
    // Serve uploads statically
    app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
    // 6. Swagger UI
    const swaggerSpec = (0, swagger_jsdoc_1.default)(swaggerOptions);
    app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec));
    // 7. Register routes
    app.use('/', (0, routes_1.createRoutes)(stockController, healthController, dashboardController, ledgerController, certificateController, partyController, repairController, settingsController, draftController, versionController));
    // 8. Error handler (must be last)
    app.use(error_handler_1.errorHandler);
    // 9. Start listening
    app.listen(config_1.config.port, () => {
        logger_1.logger.info(`✅ DiamondERP V3.0 Backend running on http://localhost:${config_1.config.port}`);
        logger_1.logger.info(`📖 API docs at http://localhost:${config_1.config.port}/api-docs`);
        logger_1.logger.info(`❤️  Health check at http://localhost:${config_1.config.port}/health`);
        logger_1.logger.info(`💎 Stocks API at http://localhost:${config_1.config.port}/api/stocks`);
        logger_1.logger.info(`📊 Dashboard API at http://localhost:${config_1.config.port}/api/dashboard`);
        logger_1.logger.info(`📒 Ledger API at http://localhost:${config_1.config.port}/api/ledger`);
        logger_1.logger.info(`📝 Drafts API at http://localhost:${config_1.config.port}/api/drafts`);
        logger_1.logger.info(`🕐 Versions API at http://localhost:${config_1.config.port}/api/versions`);
    });
}
bootstrap().catch((error) => {
    logger_1.logger.error('Fatal: Failed to start server', undefined, error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map