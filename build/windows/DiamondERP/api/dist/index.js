"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const path_1 = __importDefault(require("path"));
const swagger_config_1 = require("./config/swagger.config");
const config_1 = require("./config");
const file_storage_service_1 = require("./infrastructure/storage/file-storage.service");
const paths_1 = require("./infrastructure/paths");
const logging_1 = require("./infrastructure/logging");
const stock_controller_1 = require("./modules/stocks/stock.controller");
const health_controller_1 = require("./modules/system/health.controller");
const dashboard_controller_1 = require("./modules/dashboard/dashboard.controller");
const ledger_controller_1 = require("./modules/ledger/ledger.controller");
const certificate_controller_1 = require("./modules/certificates/certificate.controller");
const party_controller_1 = require("./modules/parties/party.controller");
const repair_controller_1 = require("./modules/repairs/repair.controller");
const settings_controller_1 = require("./modules/settings/settings.controller");
const routes_1 = require("./routes");
const request_id_1 = require("./middleware/request-id");
const performance_1 = require("./middleware/performance");
const error_handler_1 = require("./middleware/error-handler");
const cors_1 = require("./middleware/cors");
const content_type_1 = require("./middleware/content-type");
const auth_service_1 = require("./modules/auth/auth.service");
const database_context_service_1 = require("./infrastructure/database/database-context.service");
const prisma_1 = __importStar(require("./infrastructure/database/prisma"));
const recovery_service_1 = require("./modules/system/recovery/recovery.service");
const preservation_service_1 = require("./modules/system/preservation/preservation.service");
/**
 * Bootstrap and start the application.
 */
async function bootstrap() {
    logging_1.logger.info('Starting DiamondERP V3.0 Backend...');
    // 1. Fail fast on missing or insecure production configuration
    try {
        (0, config_1.validateConfig)();
        (0, auth_service_1.validateAuthConfig)();
    }
    catch (err) {
        if (process.env.NODE_ENV === 'production') {
            logging_1.logger.error('FATAL: Startup configuration validation failed in production', undefined, err);
            process.exit(1);
        }
        else {
            logging_1.logger.warn('Non-production configuration warning: ' + err.message);
        }
    }
    logging_1.logger.info(`Port: ${config_1.config.port} | Retry: ${config_1.config.retry.maxAttempts} attempts, ${config_1.config.retry.baseDelayMs}ms base delay`);
    // 2. Database connection check - MUST fail fast if database is unreachable (Finding 57)
    try {
        await prisma_1.systemPrisma.$connect();
        await database_context_service_1.databaseContextService.syncProfilesFromSystemDb();
        logging_1.logger.info('Synchronized active profile databases from system.db');
        const activeProfileCount = await prisma_1.systemPrisma.profile.count({ where: { isActive: true } });
        if (activeProfileCount > 0) {
            await prisma_1.default.$connect();
            logging_1.logger.info('Connected to SQLite database via Prisma');
        }
        else {
            logging_1.logger.info('No active profiles registered yet in system.db. Ready for onboarding / discovery.');
        }
    }
    catch (err) {
        logging_1.logger.error('FATAL: Failed to connect to database during bootstrap', undefined, err);
        process.exit(1);
    }
    // 2.1 Automated Uninstall CLI Trigger (--auto-preserve)
    if (process.argv.includes('--auto-preserve')) {
        logging_1.logger.info('Executing automated pre-uninstall preservation flow via CLI trigger...');
        try {
            const { uninstallPreflightService } = await Promise.resolve().then(() => __importStar(require('./modules/system/uninstall/uninstall-preflight.service')));
            const destIndex = process.argv.indexOf('--destination');
            const destinationDir = destIndex !== -1 && process.argv[destIndex + 1] ? process.argv[destIndex + 1] : undefined;
            const result = await uninstallPreflightService.runAutomatedUninstallPreservation({ destinationDir });
            logging_1.logger.info(`Automated uninstall preservation succeeded: ${JSON.stringify(result)}`);
            await (0, prisma_1.disconnectAllClients)();
            process.exit(0);
        }
        catch (err) {
            logging_1.logger.error('FATAL: Automated uninstall preservation failed:', undefined, err);
            await (0, prisma_1.disconnectAllClients)();
            process.exit(1);
        }
    }
    // 2.2 CLI Trigger to consume uninstall authorization in control database and local token
    if (process.argv.includes('--consume-uninstall-authorization')) {
        const authIdx = process.argv.indexOf('--consume-uninstall-authorization');
        const authId = authIdx !== -1 && process.argv[authIdx + 1] ? process.argv[authIdx + 1] : undefined;
        try {
            const { uninstallPreflightService } = await Promise.resolve().then(() => __importStar(require('./modules/system/uninstall/uninstall-preflight.service')));
            await uninstallPreflightService.consumeAuthorizationToken(authId);
            logging_1.logger.info(`Uninstall authorization consumed successfully: ${authId || 'from token file'}`);
            await (0, prisma_1.disconnectAllClients)();
            process.exit(0);
        }
        catch (err) {
            logging_1.logger.error('Failed to consume uninstall authorization via CLI:', undefined, err);
            await (0, prisma_1.disconnectAllClients)();
            process.exit(1);
        }
    }
    // 3. Seed default admin user and default profile only when explicitly enabled (e.g. automated test suites)
    // Fresh installations require user onboarding and must NOT auto-seed default profiles/users.
    if (process.env.AUTO_SEED_DEFAULT_ADMIN === 'true') {
        try {
            await auth_service_1.authService.seedDefaultAdmin();
        }
        catch (err) {
            logging_1.logger.warn(`Failed to seed default admin: ${err}`);
        }
    }
    else {
        logging_1.logger.info('Auto-seeding default admin is disabled. Fresh installations require initial setup via onboarding.');
    }
    // 4. Controllers
    const stockController = new stock_controller_1.StockController();
    const healthController = new health_controller_1.HealthController();
    const dashboardController = new dashboard_controller_1.DashboardController();
    const ledgerController = new ledger_controller_1.LedgerController();
    const certificateController = new certificate_controller_1.CertificateController();
    const partyController = new party_controller_1.PartyController();
    const repairController = new repair_controller_1.RepairController();
    const settingsController = new settings_controller_1.SettingsController();
    // 5. Create Express app
    const app = (0, express_1.default)();
    // 6. Register middleware (order matters)
    app.use(request_id_1.requestIdMiddleware);
    app.use(cors_1.corsMiddleware);
    app.use('/api', content_type_1.enforceContentType);
    // Security Headers via Helmet
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                connectSrc: ["'self'"],
                imgSrc: ["'self'", 'data:'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            },
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        crossOriginResourcePolicy: { policy: 'same-origin' },
        frameguard: { action: 'deny' },
        noSniff: true,
        xssFilter: true,
        hsts: config_1.config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    }));
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(performance_1.performanceMiddleware);
    // ── Layered Rate Limiting ──────────────────────────────────────────────
    const apiLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 600, // Reasonable ERP limit
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many requests, please try again after 15 minutes' },
    });
    app.use('/api/', apiLimiter);
    const authLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 30, // 30 login attempts per 15 minutes
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many login attempts, please try again later' },
    });
    app.use('/api/auth/login', authLimiter);
    const bootstrapLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 5, // Strict 5 requests per 15 min for bootstrap
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many bootstrap attempts, access temporarily suspended' },
    });
    app.use('/api/auth/bootstrap', bootstrapLimiter);
    const factoryResetLimiter = (0, express_rate_limit_1.default)({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many factory reset attempts' },
    });
    app.use('/api/settings/factory-reset', factoryResetLimiter);
    // Mutable directories setup — ensures databases, uploads, backups, logs, config exist
    (0, paths_1.ensureAllDataDirs)();
    file_storage_service_1.fileStorageService.ensureUploadsDir();
    await recovery_service_1.recoveryService.reconcileInterruptedRestores().catch((err) => {
        logging_1.logger.error('[Startup] Failed to reconcile interrupted operations:', err);
    });
    await preservation_service_1.preservationService.reconcileInterruptedPreservations().catch((err) => {
        logging_1.logger.error('[Startup] Failed to reconcile interrupted preservations:', err);
    });
    // 7. Swagger UI (only in development)
    if (process.env.NODE_ENV !== 'production') {
        app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_config_1.swaggerSpec));
    }
    // 8. Register routes
    app.use('/', (0, routes_1.createRoutes)(stockController, healthController, dashboardController, ledgerController, certificateController, partyController, repairController, settingsController));
    // 9. Graceful shutdown handler & desktop lifecycle management
    let server;
    const shutdown = async (signal) => {
        logging_1.logger.info(`${signal} received. Shutting down gracefully...`);
        if (server) {
            server.close(async () => {
                logging_1.logger.info('HTTP server stopped accepting new requests.');
                try {
                    await prisma_1.systemPrisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
                    logging_1.logger.info('SQLite WAL checkpoint (TRUNCATE) completed successfully.');
                }
                catch (walErr) {
                    logging_1.logger.warn('Warning: Could not flush SQLite WAL during shutdown: ' + String(walErr));
                }
                try {
                    await (0, prisma_1.disconnectAllClients)();
                    logging_1.logger.info('All database clients cleanly disconnected.');
                }
                catch (err) {
                    logging_1.logger.error('Error disconnecting database clients', undefined, err);
                }
                process.exit(0);
            });
        }
        else {
            process.exit(0);
        }
        // Force exit after 10 seconds if hanging
        setTimeout(() => {
            logging_1.logger.error('Forced shutdown after timeout.');
            process.exit(1);
        }, 10000);
    };
    // Loopback-only graceful shutdown endpoint for desktop launcher
    app.post('/api/system/shutdown', (req, res) => {
        const remoteIp = req.socket.remoteAddress;
        const isLoopback = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
        if (isLoopback) {
            res.json({ success: true, message: 'Server shutting down gracefully.' });
            setTimeout(() => shutdown('HTTP_SHUTDOWN'), 50);
        }
        else {
            res.status(403).json({ success: false, error: 'Shutdown endpoint restricted to local loopback.' });
        }
    });
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    // Stdin EOF listener for parent process crash/termination safety when spawned by desktop launcher
    if (process.env.NODE_ENV === 'production' && process.env.DIAMOND_DESKTOP_PARENT_PID && !process.stdin.isTTY) {
        process.stdin.on('end', () => shutdown('STDIN_CLOSED'));
        process.stdin.resume();
    }
    // 10. API 404 Guard — Ensure unmatched API calls return JSON error, never falling through to SPA HTML
    app.all('/api/*', (_req, res) => {
        res.status(404).json({ success: false, error: 'API endpoint not found' });
    });
    // 11. Production Static Frontend Serving & SPA Fallback
    const webDistDir = (0, paths_1.getWebDistDir)();
    if (webDistDir) {
        logging_1.logger.info(`Serving production web UI from: ${webDistDir}`);
        app.use(express_1.default.static(webDistDir, {
            maxAge: '1h',
            setHeaders: (res, filePath) => {
                if (filePath.endsWith('.html')) {
                    res.setHeader('Cache-Control', 'no-cache');
                }
                else if (filePath.includes('/assets/') || filePath.includes('\\assets\\')) {
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                }
            },
        }));
        // SPA fallback: any non-API, non-health GET returns index.html
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/api-docs')) {
                return next();
            }
            res.sendFile(path_1.default.join(webDistDir, 'index.html'));
        });
    }
    // 12. Error handler (must be last)
    app.use(error_handler_1.errorHandler);
    // 13. Start listening (strictly on local loopback by default to prevent LAN exposure)
    const host = config_1.config.host || '127.0.0.1';
    server = app.listen(config_1.config.port, host, () => {
        logging_1.logger.info(`✅ DiamondERP V3.0 Backend running on http://${host}:${config_1.config.port}`);
        logging_1.logger.info(`🔐 Authentication: ${process.env.JWT_SECRET ? 'ENABLED' : 'DESKTOP SECURE MODE'}`);
        if (process.env.NODE_ENV !== 'production') {
            logging_1.logger.info(`📖 API docs at http://${host}:${config_1.config.port}/api-docs`);
        }
        logging_1.logger.info(`❤️  Health check at http://${host}:${config_1.config.port}/health`);
    });
}
bootstrap().catch((error) => {
    logging_1.logger.error('Fatal: Failed to start server', undefined, error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map