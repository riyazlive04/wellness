import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (!m) continue;
  let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}
const prisma = new PrismaClient();
for (const term of ['milk', 'sugar', 'butter', 'lemon', 'bread', 'jam', 'dragon', 'butterscotch']) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT canonical_name, category FROM public.foods
      WHERE is_admin_approved AND canonical_name ILIKE $1 ORDER BY canonical_name LIMIT 6`,
    `%${term}%`);
  console.log(`\n[${term}] → ${rows.length} match(es)`);
  rows.forEach((r) => console.log(`   - ${r.canonical_name} [${r.category}]`));
}
await prisma.$disconnect();
