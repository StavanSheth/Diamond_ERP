const path = require('path');
const { PrismaClient } = require(path.resolve('build/windows/DiamondERP/api/node_modules/@prisma/client'));

const targetDb = process.argv[2] 
  ? path.resolve(process.argv[2])
  : path.resolve('apps/api/Stavan.db');

console.log('Probing DB:', targetDb);

process.env.DATABASE_URL = `file:${targetDb}`;
const prisma = new PrismaClient({
  datasources: { db: { url: `file:${targetDb}` } }
});

async function run() {
  const dbList = await prisma.$queryRawUnsafe('PRAGMA database_list');
  console.log('Actual DB opened by Prisma:', dbList);
  const users = await prisma.user.findMany();
  console.log('Users:', users.map(u => ({ username: u.username, role: u.role, active: u.isActive })));
  const profiles = await prisma.profile.findMany();
  console.log('Profiles:', profiles.map(p => ({ code: p.code, name: p.name })));
  const parties = await prisma.party.count();
  const stocks = await prisma.stock.count();
  console.log('Parties count:', parties, 'Stocks count:', stocks);
  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
