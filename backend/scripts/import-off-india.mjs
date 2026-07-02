/* eslint-disable no-console */
/**
 * Bulk-import Open Food Facts' India-tagged products into `barcode_products`,
 * so mainstream Indian packaged foods resolve INSTANTLY (offline, no live API
 * call). Only rows with a valid barcode AND an energy value are imported
 * ("accurate, not just big"). Idempotent upsert. DRY by default — pass --live.
 *
 * Usage (from backend/):
 *   node scripts/import-off-india.mjs                 # dry: fetch + report, no writes
 *   node scripts/import-off-india.mjs --live          # write to prod cache
 *   node scripts/import-off-india.mjs --live --pages=5 # cap pages (testing)
 */
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
const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const PAGE_SIZE = 100; // OFF search caps a page at ~100 regardless of requested size
const MAX_PAGES = (() => { const a = args.find((x) => x.startsWith('--pages=')); return a ? Number(a.split('=')[1]) : 250; })();
const UA = 'SIRAH-LIFE/1.0 (wellness platform; bulk India import)';
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const numv = (v) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function fetchPage(page) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?action=process&tagtype_0=countries&tag_contains_0=contains&tag_0=india`
    + `&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url&json=1&page_size=${PAGE_SIZE}&page=${page}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
      clearTimeout(t);
      if (res.status === 429) { const w = 10000 * (attempt + 1); console.log(`   429 — backoff ${w / 1000}s`); await sleep(w); continue; }
      if (!res.ok) { await sleep(3000); continue; }
      return await res.json();
    } catch (e) { console.log(`   fetch retry (${e.message})`); await sleep(4000); }
  }
  throw new Error(`page ${page} failed after retries`);
}

function toRow(p) {
  const barcode = String(p.code || '').replace(/\D/g, '');
  if (barcode.length < 6 || barcode.length > 18) return null;
  const n = p.nutriments ?? {};
  const kcal = numv(n['energy-kcal_100g']);
  if (kcal == null) return null; // skip products without energy — quality gate
  return {
    barcode,
    name: str(p.product_name),
    brand: str(p.brands)?.split(',')[0]?.trim() ?? null,
    serving_size: str(p.serving_size),
    image_url: str(p.image_front_small_url),
    kcal_100g: kcal,
    protein_100g: numv(n.proteins_100g),
    carb_100g: numv(n.carbohydrates_100g),
    fat_100g: numv(n.fat_100g),
    fiber_100g: numv(n.fiber_100g),
    sodium_mg_100g: n.sodium_100g != null ? numv(Number(n.sodium_100g) * 1000) : null,
  };
}

async function upsert(r) {
  await prisma.$queryRawUnsafe(
    `INSERT INTO public.barcode_products
       (barcode, name, brand, serving_size, image_url, kcal_100g, protein_100g, carb_100g, fat_100g, fiber_100g, sodium_mg_100g, source, verified)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'openfoodfacts',false)
     ON CONFLICT (barcode) DO UPDATE SET
       name=COALESCE(EXCLUDED.name, public.barcode_products.name),
       kcal_100g=COALESCE(EXCLUDED.kcal_100g, public.barcode_products.kcal_100g),
       updated_at=now()`,
    r.barcode, r.name, r.brand, r.serving_size, r.image_url,
    r.kcal_100g, r.protein_100g, r.carb_100g, r.fat_100g, r.fiber_100g, r.sodium_mg_100g);
}

async function main() {
  console.log(`Mode: ${LIVE ? 'LIVE WRITE' : 'DRY-RUN (no writes)'} | page_size=${PAGE_SIZE} | max_pages=${MAX_PAGES}\n`);
  let total = 0, withNutrition = 0, written = 0, page = 1, reported = 0;
  while (page <= MAX_PAGES) {
    const json = await fetchPage(page);
    const products = json.products ?? [];
    if (page === 1) { reported = json.count ?? 0; console.log(`OFF reports ${reported} India products. Paging ${PAGE_SIZE} at a time.\n`); }
    if (products.length === 0) break;
    total += products.length;
    for (const p of products) {
      const row = toRow(p);
      if (!row) continue;
      withNutrition++;
      if (LIVE) { await upsert(row); written++; }
    }
    if (page % 10 === 0 || page === 1) console.log(`page ${page}: scanned ${total}, usable ${withNutrition}${LIVE ? `, written ${written}` : ''}`);
    page++;
    await sleep(1200); // be gentle on OFF
  }
  console.log(`\nDONE. Scanned ${total} | usable (barcode+kcal) ${withNutrition} | ${LIVE ? `written ${written}` : 'DRY — nothing written'}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
