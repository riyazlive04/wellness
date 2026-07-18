/* eslint-disable no-console */
/**
 * Bulk-import Indian packaged foods into `barcode_products` so mainstream
 * Indian products resolve INSTANTLY (no live API call on first scan).
 *
 * Source is the local NDJSON slice at scripts/data/off-india.ndjson, exported
 * from the full Open Food Facts dump by barcode_meallog/export_india_slice.py.
 * It used to crawl the OFF search API page by page, which capped out at the
 * crowd-sourced `countries=india` tag (~1,751 usable products) and needed
 * rate-limit backoff, resume files and dead-chunk detection to survive OFF's
 * throttling. The dump covers 4,151 -- it adds every product carrying the GS1
 * `890` prefix, which is in the barcode itself and so can't be missing the way
 * the country tag routinely is.
 *
 * Anything outside this slice still resolves via the live OFF API in
 * BarcodeService and is cached on first scan -- this is the warm-start, not
 * the whole catalogue.
 *
 * Usage (from backend/):
 *   node scripts/import-off-india.mjs           # dry: report what would change
 *   node scripts/import-off-india.mjs --live    # write
 */
import { readFileSync, existsSync } from 'node:fs';
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
const SRC = join(__dirname, 'data', 'off-india.ndjson');
const CHUNK = 500;

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Re-validate at the boundary — the export is trusted but not authoritative. */
function toRow(p) {
  const barcode = String(p.barcode || '').replace(/\D/g, '');
  if (barcode.length < 6 || barcode.length > 18) return null;
  if (typeof p.kcal_100g !== 'number' || !Number.isFinite(p.kcal_100g)) return null;
  return {
    barcode,
    name: p.name ?? null,
    brand: p.brand ?? null,
    serving_size: p.serving_size ?? null,
    image_url: p.image_url ?? null,
    kcal_100g: p.kcal_100g,
    protein_100g: p.protein_100g ?? null,
    carb_100g: p.carb_100g ?? null,
    fat_100g: p.fat_100g ?? null,
    fiber_100g: p.fiber_100g ?? null,
    sodium_mg_100g: p.sodium_mg_100g ?? null,
    source: 'openfoodfacts',
    verified: false,
  };
}

/** Retry a DB op through transient pooler drops (P1017 / closed connection). */
async function withDbRetry(fn) {
  for (let i = 0; i < 5; i++) {
    try { return await fn(); }
    catch (e) {
      const conn = e.code === 'P1017' || /closed the connection|Can't reach|ECONNRESET|Timed out|connection pool/i.test(e.message || '');
      if (!conn || i === 4) throw e;
      console.log(`   db retry ${i + 1}/5 (${e.code || 'conn'})`);
      await sleep(3000 * (i + 1));
    }
  }
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`Missing ${SRC}\nRun: python barcode_meallog/export_india_slice.py`);
    process.exit(1);
  }
  console.log(`Mode: ${LIVE ? 'LIVE WRITE' : 'DRY-RUN (no writes)'}\nSource: ${SRC}\n`);

  const lines = readFileSync(SRC, 'utf8').split('\n').filter((l) => l.trim());
  const rows = [];
  let invalid = 0;
  for (const line of lines) {
    let row = null;
    try { row = toRow(JSON.parse(line)); } catch { /* malformed line */ }
    if (row) rows.push(row); else invalid++;
  }
  console.log(`Parsed ${rows.length} products${invalid ? ` (${invalid} invalid, skipped)` : ''}`);

  // Existing rows are never overwritten (skipDuplicates), which deliberately
  // protects manually-entered verified=true products from being reset to an
  // unverified OFF row.
  const existing = new Set(
    (await withDbRetry(() => prisma.barcode_products.findMany({ select: { barcode: true } })))
      .map((r) => r.barcode),
  );
  const fresh = rows.filter((r) => !existing.has(r.barcode));
  console.log(`Already in DB: ${existing.size} | new from this slice: ${fresh.length} | already present: ${rows.length - fresh.length}\n`);

  if (!LIVE) {
    console.log(`DRY — nothing written. Would insert ${fresh.length} rows. Re-run with --live to apply.`);
    await prisma.$disconnect();
    return;
  }

  let written = 0;
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const batch = fresh.slice(i, i + CHUNK);
    try {
      const res = await withDbRetry(() => prisma.barcode_products.createMany({ data: batch, skipDuplicates: true }));
      written += res.count;
      console.log(`  ${Math.min(i + CHUNK, fresh.length)}/${fresh.length} — +${res.count}`);
    } catch (e) {
      console.log(`  chunk at ${i} failed (${e.code || e.message}) — re-run to fill`);
    }
  }
  console.log(`\nDONE. Inserted ${written} new products.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
