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
const rows = await prisma.$queryRawUnsafe(
  `SELECT r.name FROM public.workspace_recipes r
     LEFT JOIN public.workspace_recipe_ingredients i ON i.recipe_id=r.id
    WHERE r.workspace_id=$1::uuid
    GROUP BY r.id, r.name HAVING COUNT(i.id)=0 ORDER BY r.name`,
  '297eb44f-2d85-49cc-81b1-d6bf05b958ce');
console.log('Empty recipes (' + rows.length + '):');
rows.forEach((r, i) => console.log(`${i + 1}. ${r.name}`));
await prisma.$disconnect();
