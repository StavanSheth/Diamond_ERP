import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Override the environment variable for tests
process.env.DATABASE_URL = 'file:./test.db';

export const prisma = new PrismaClient();

beforeAll(async () => {
  // Global setup handles pushing the schema.
});

afterAll(async () => {
  await prisma.$disconnect();
});
