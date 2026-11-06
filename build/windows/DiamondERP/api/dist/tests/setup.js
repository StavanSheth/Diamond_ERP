"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = require("../infrastructure/database/prisma");
const paths_1 = require("../infrastructure/paths");
// Override the environment variable for tests
process.env.DATABASE_URL = 'file:./test.db';
exports.prisma = new client_1.PrismaClient();
(0, vitest_1.beforeAll)(async () => {
    // Global setup handles pushing the schema.
    try {
        (0, paths_1.ensureAllDataDirs)();
        const dbDir = (0, paths_1.getDatabaseRoot)();
        if (!fs_1.default.existsSync(dbDir)) {
            fs_1.default.mkdirSync(dbDir, { recursive: true });
        }
        const stavanDbPath = path_1.default.resolve(dbDir, 'Stavan.db');
        const templatePath = path_1.default.resolve(__dirname, '../../prisma/test.db');
        if (!fs_1.default.existsSync(stavanDbPath) && fs_1.default.existsSync(templatePath)) {
            fs_1.default.copyFileSync(templatePath, stavanDbPath);
        }
        else if (!fs_1.default.existsSync(stavanDbPath)) {
            fs_1.default.writeFileSync(stavanDbPath, '');
        }
        // Clean up stale test database registries pointing to non-existent files
        const staleRegistries = await prisma_1.systemPrisma.databaseRegistry.findMany({});
        for (const reg of staleRegistries) {
            if (!fs_1.default.existsSync(reg.canonicalPath)) {
                await prisma_1.systemPrisma.databaseRegistry.delete({ where: { id: reg.id } }).catch(() => { });
            }
        }
        const install = await prisma_1.systemPrisma.installation.findFirst();
        const installId = install ? install.id : 'default-test-install';
        const prof = await prisma_1.systemPrisma.profile.upsert({
            where: { code: 'Stavan' },
            update: { isActive: true },
            create: {
                code: 'Stavan',
                name: 'Stavan',
                isActive: true,
            },
        });
        const existingReg = await prisma_1.systemPrisma.databaseRegistry.findFirst({
            where: { profileId: prof.id, status: 'ACTIVE' },
        });
        if (!existingReg) {
            // Ensure installation exists if we need to create one
            let effectiveInstallId = installId;
            if (!install) {
                const newInstall = await prisma_1.systemPrisma.installation.create({
                    data: {
                        installationId: 'test-install-id',
                        appVersion: '3.0.0',
                        status: 'ACTIVE',
                        lifecycleState: 'READY',
                    },
                });
                effectiveInstallId = newInstall.id;
            }
            await prisma_1.systemPrisma.databaseRegistry.create({
                data: {
                    databaseId: 'test-stavan-db',
                    displayName: 'Stavan Test Database',
                    profileId: prof.id,
                    installationId: effectiveInstallId,
                    canonicalPath: stavanDbPath,
                    status: 'ACTIVE',
                    schemaVersion: 1,
                },
            });
        }
        (0, prisma_1.registerProfile)({
            code: 'Stavan',
            name: 'Stavan',
            dbPath: stavanDbPath,
        });
    }
    catch (err) {
        console.error('[setup.ts ERROR]', err);
    }
});
(0, vitest_1.afterAll)(async () => {
    await exports.prisma.$disconnect();
});
//# sourceMappingURL=setup.js.map