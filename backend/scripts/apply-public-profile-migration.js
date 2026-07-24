const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Load backend env before PrismaClient reads DATABASE_URL.
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing after loading .env.local');
  }

  const sqlPath = path.join(
    __dirname,
    '..',
    '..',
    'supabase',
    'migrations',
    '20260724120000_workspace_public_profile.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const cleaned = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const prisma = new PrismaClient();
  try {
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
    console.log('migration_ok', statements.length, 'statements');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
