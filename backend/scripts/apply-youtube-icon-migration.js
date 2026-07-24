require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260724140000_public_profile_youtube_icon.sql'),
    'utf8',
  );
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const prisma = new PrismaClient();
  try {
    for (const stmt of statements) await prisma.$executeRawUnsafe(stmt);
    console.log('youtube_icon_migration_ok');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
