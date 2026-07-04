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
import { readFileSync, writeFileSync } from 'node:fs';
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

// Auto-resume: remember the last page reached so re-runs continue on FRESH pages
// (OFF throttles ~12 pages/window — without this we'd re-fetch done pages forever).
const PROGRESS_FILE = join(__dirname, '.off-import-progress');
const startArg = (() => { const a = args.find((x) => x.startsWith('--start=')); return a ? Number(a.split('=')[1]) : null; })();
function readStart() {
  if (startArg) return startArg;
  if (args.includes('--restart')) return 1;
  try { const n = Number(readFileSync(PROGRESS_FILE, 'utf8').trim()); return Number.isFinite(n) && n > 0 ? n : 1; } catch { return 1; }
}
function saveProgress(p) { try { writeFileSync(PROGRESS_FILE, String(p)); } catch { /* ignore */ } }

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const numv = (v) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function fetchPage(page) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?action=process&tagtype_0=countries&tag_contains_0=contains&tag_0=india`
    + `&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url&json=1&page_size=${PAGE_SIZE}&page=${page}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
      clearTimeout(t);
      if (res.status === 429) { const w = 10000 * (attempt + 1); console.log(`   429 — backoff ${w / 1000}s`); await sleep(w); continue; }
      if (!res.ok) { await sleep(3000 * (attempt + 1)); continue; }
      return await res.json();
    } catch (e) { console.log(`   fetch retry ${attempt + 1}/6 (${e.message})`); await sleep(3000 * (attempt + 1)); }
  }
  return null; // give up on THIS page — caller retries/skips, never aborts the run
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

const CONCURRENCY = 3; // gentle — avoids OFF rate-limit blocks

async function main() {
  const startPage = readStart();
  console.log(`Mode: ${LIVE ? 'LIVE WRITE' : 'DRY-RUN (no writes)'} | page_size=${PAGE_SIZE} | concurrency=${CONCURRENCY} | resuming from page ${startPage}\n`);
  let total = 0, withNutrition = 0, written = 0, page = startPage, reachedEnd = false, deadChunks = 0;

  while (page <= MAX_PAGES && !reachedEnd) {
    const batch = [];
    for (let k = 0; k < CONCURRENCY && page + k <= MAX_PAGES; k++) batch.push(page + k);

    // Fetch this chunk of pages in parallel.
    const results = await Promise.all(batch.map((p) => fetchPage(p).then((j) => ({ p, j }))));

    const rows = [];
    let anyOk = false;
    for (const { p, j } of results) {
      if (!j) { console.log(`   page ${p}: failed (will fill on re-run)`); continue; }
      anyOk = true;
      if (page === 1 && p === 1) console.log(`OFF reports ${j.count ?? '?'} India products.\n`);
      const products = j.products ?? [];
      if (products.length === 0) { reachedEnd = true; continue; }
      total += products.length;
      for (const prod of products) {
        const row = toRow(prod);
        if (!row) continue;
        withNutrition++;
        rows.push({ ...row, source: 'openfoodfacts', verified: false });
      }
    }

    if (LIVE && rows.length) {
      try {
        const res = await withDbRetry(() => prisma.barcode_products.createMany({ data: rows, skipDuplicates: true }));
        written += res.count;
      } catch (e) {
        console.log(`   chunk db write failed (${e.code || e.message})`);
      }
    }

    console.log(`pages ${batch[0]}-${batch[batch.length - 1]}: total ${total}, usable ${withNutrition}${LIVE ? `, +new ${written}` : ''}`);
    if (!anyOk) {
      if (++deadChunks >= 4) { console.log('\nOFF throttled us — stopping. Re-run to resume from here (progress saved).'); break; }
    } else {
      deadChunks = 0;
    }
    page += CONCURRENCY;
    if (LIVE && anyOk) saveProgress(page); // remember where fresh pages continue
    await sleep(2000);
  }

  if (reachedEnd && LIVE) saveProgress(1); // swept to the end — next run re-checks from the top for newly-added products
  console.log(`\nDONE. Scanned ${total} | usable ${withNutrition} | ${LIVE ? `new rows written ${written}` : 'DRY — nothing written'} | next run resumes at page ${reachedEnd ? 1 : page}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
