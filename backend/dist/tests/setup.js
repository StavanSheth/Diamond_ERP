"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
// Override the environment variable for tests
process.env.DATABASE_URL = 'file:./test.db';
exports.prisma = new client_1.PrismaClient();
(0, vitest_1.beforeAll)(async () => {
    // Global setup handles pushing the schema.
});
(0, vitest_1.afterAll)(async () => {
    await exports.prisma.$disconnect();
});
//# sourceMappingURL=setup.js.map