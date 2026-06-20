/* eslint-disable no-console */
/**
 * Apply a single manual-migration .sql file to the configured database.
 * Usage: npx dotenv -e .env.local -- ts-node scripts/apply-migration.ts <file.sql>
 * The file path is relative to prisma/manual-migrations/.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Pass the migration filename (relative to prisma/manual-migrations/).');
  const path = join(__dirname, '..', 'prisma', 'manual-migrations', file);
  const sql = readFileSync(path, 'utf8');
  // Strip line comments, then split into individual statements — the pooler
  // can't run multiple commands in one prepared statement.
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const prisma = new PrismaClient();
  console.log(`Applying ${file} — ${statements.length} statement(s) …`);
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log('✓ Applied.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('✗ Failed:', e.message);
  process.exit(1);
});
