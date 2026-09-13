const path = require('path');
const fs = require('fs');
const { PrismaClient } = require(path.resolve('apps/api/node_modules/@prisma/client'));

const stavanDb = path.resolve('apps/api/Stavan.db');
process.env.DATABASE_URL = `file:${stavanDb}`;
const prisma = new PrismaClient();

async function main() {
  console.log('Checkpointing apps/api/Stavan.db WAL...');
  const res = await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
  console.log('WAL checkpoint result:', res);
  await prisma.$disconnect();

  // Wait briefly for file handles to close
  await new Promise(r => setTimeout(r, 500));

  const templateDbDest1 = path.resolve('apps/api/prisma/template.db');
  const templateDbDest2 = path.resolve('build/windows/DiamondERP/api/prisma/template.db');

  fs.copyFileSync(stavanDb, templateDbDest1);
  console.log('✔ Copied checkpointed Stavan.db -> apps/api/prisma/template.db');

  if (fs.existsSync(path.dirname(templateDbDest2))) {
    fs.copyFileSync(stavanDb, templateDbDest2);
    console.log('✔ Copied checkpointed Stavan.db -> build/windows/DiamondERP/api/prisma/template.db');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
