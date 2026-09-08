import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

/**
 * Swagger/OpenAPI configuration for DiamondERP V3.0.
 */
export const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DiamondERP V3.0 — Inventory API',
      version: '3.0.0',
      description:
        'REST API for diamond stock inventory management with Google Sheets synchronization. ' +
        'Supports CRUD operations with optimistic locking, retry logic, and performance metrics.',
    },
    servers: [{ url: `http://localhost:${config.port}` }],
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

export const swaggerSpec = swaggerJsdoc(swaggerOptions);

