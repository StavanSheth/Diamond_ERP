import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export default function setup() {
  process.env.DATABASE_URL = 'file:./test.db';
  const dbPath = path.join(__dirname, '../../prisma/test.db');
  
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  try {
    execSync('npx prisma db push --accept-data-loss', {
      env: {
        ...process.env,
        DATABASE_URL: 'file:./test.db'
      },
      stdio: 'inherit'
    });

    const defaultDbPath = path.join(__dirname, '../../Stavan.db');
    const walPath = path.join(__dirname, '../../Stavan.db-wal');
    const shmPath = path.join(__dirname, '../../Stavan.db-shm');
    if (fs.existsSync(walPath)) try { fs.unlinkSync(walPath); } catch {}
    if (fs.existsSync(shmPath)) try { fs.unlinkSync(shmPath); } catch {}
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, defaultDbPath);
    }
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}
