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
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}
