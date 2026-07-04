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
const [{ n }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM public.barcode_products`);
const [{ off }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS off FROM public.barcode_products WHERE source = 'openfoodfacts'`);
console.log(`Total products in barcode_products: ${n}`);
console.log(`  from Open Food Facts import:      ${off}`);
await prisma.$disconnect();
