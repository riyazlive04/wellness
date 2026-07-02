/* eslint-disable no-console */
/**
 * Populate EMPTY recipes (0 ingredients) with AI-composed ingredients.
 *
 * Unlike import-recipes.ts (which CREATES new recipes and skips existing names),
 * this targets the name-only shells already in the DB and ADDS ingredients to
 * them in-place, so the engine can then compute calories/macros.
 *
 * Gemini picks ingredients ONLY from the workspace's approved foods catalog
 * (by index → real food_id), so nothing is hallucinated. Results are written to
 * the EXISTING recipe and left as drafts (is_published untouched) for review.
 *
 * SAFE BY DEFAULT: dry-run unless you pass --live. Dry-run still calls Gemini
 * (to show you the quality) but writes NOTHING to the database.
 *
 * Usage (from backend/):
 *   node scripts/populate-recipe-ingredients.mjs --limit=5          # dry, 5 recipes, 1 Gemini call
 *   node scripts/populate-recipe-ingredients.mjs --live             # WRITE to prod (all empty recipes, quota permitting)
 *   node scripts/populate-recipe-ingredients.mjs --live --limit=25  # WRITE first 25
 *
 * Flags: --live  --limit=N  --batch=N (default 20)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load backend/.env.local into process.env (no dotenv-cli dependency) ──
for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}

const WORKSPACE_ID = '297eb44f-2d85-49cc-81b1-d6bf05b958ce'; // Sirah Nutrition
const MODEL = 'gemini-2.5-flash';
const COOKING_METHODS = [
  'raw', 'boiled', 'steamed', 'grilled', 'roasted', 'baked',
  'sauteed', 'pan_fried', 'deep_fried', 'stir_fried', 'curried',
  'tandoor', 'pressure_cooked', 'microwaved', 'fermented',
];

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const numArg = (f) => { const a = args.find((x) => x.startsWith(`${f}=`)); return a ? Number(a.split('=')[1]) : undefined; };
const LIMIT = numArg('--limit');
const BATCH = numArg('--batch') ?? 20;

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function main() {
  // 1. Find recipes with ZERO ingredients (the shells).
  const empty = await prisma.$queryRawUnsafe(
    `SELECT r.id, r.name
       FROM public.workspace_recipes r
       LEFT JOIN public.workspace_recipe_ingredients i ON i.recipe_id = r.id
      WHERE r.workspace_id = $1::uuid
      GROUP BY r.id, r.name
     HAVING COUNT(i.id) = 0
      ORDER BY r.name`,
    WORKSPACE_ID,
  );
  const total = await prisma.workspace_recipes.count({ where: { workspace_id: WORKSPACE_ID } });

  console.log(`\n=== AUDIT ===`);
  console.log(`Workspace recipes total : ${total}`);
  console.log(`Recipes with 0 ingredients (empty shells): ${empty.length}`);
  console.log(`Recipes WITH ingredients : ${total - empty.length}`);
  console.log(`Mode: ${LIVE ? 'LIVE WRITE' : 'DRY-RUN (no writes)'} | batch=${BATCH}${LIMIT ? ` | limit=${LIMIT}` : ''}\n`);

  if (empty.length === 0) { console.log('Nothing to populate.'); await prisma.$disconnect(); return; }

  let targets = empty;
  if (LIMIT) targets = targets.slice(0, LIMIT);

  // 2. Food catalog (index → food).
  const foods = await prisma.$queryRawUnsafe(
    `SELECT id, canonical_name, category FROM public.foods WHERE is_admin_approved ORDER BY category, canonical_name`,
  );
  const catalogLines = foods.map((f, i) => `${i}: ${f.canonical_name.replace(/\s*\([^)]*\)\s*$/, '')} [${f.category}]`);
  console.log(`Food catalog: ${foods.length} approved foods. Targeting ${targets.length} recipes.\n`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env.local');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction:
      'You are a clinical dietitian building recipes for an Indian (largely South-Indian) nutrition practice. ' +
      'For each dish, output its main edible ingredients choosing ONLY from the provided FOOD CATALOG, referenced by index. ' +
      'Use realistic quantities in grams for the WHOLE recipe (all servings combined), not per serving. ' +
      'Pick the closest available catalog food when an exact match is missing (e.g. use plain rice for a rice dish). ' +
      'Omit an ingredient entirely rather than inventing a food that is not in the catalog. ' +
      'Every dish must have at least 2 ingredients.',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  });

  let populated = 0, failed = 0;
  const batches = chunk(targets, BATCH);
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    let parsed = [];
    try {
      parsed = await generateBatch(model, catalogLines, batch.map((r) => r.name));
    } catch (err) {
      console.error(`  ! batch ${b + 1}/${batches.length} Gemini error:`, err.message);
      failed += batch.length;
      continue;
    }

    for (const rec of batch) {
      const ai = parsed.find((r) => r.name?.trim().toLowerCase() === rec.name.trim().toLowerCase())
        ?? parsed.find((r) => r.name?.trim().toLowerCase().includes(rec.name.trim().toLowerCase()));
      if (!ai) { console.warn(`  ? no AI result for "${rec.name}"`); failed++; continue; }
      const ingredients = sanitizeIngredients(ai.ingredients, foods.length);
      if (ingredients.length === 0) { console.warn(`  ? "${rec.name}" — no valid ingredients matched`); failed++; continue; }
      const servings = clamp(Math.round(ai.servings ?? 2), 1, 50);

      console.log(`• ${rec.name}  [${servings} serv, ${ingredients.length} ingredients]`);
      for (const ing of ingredients) console.log(`    - ${foods[ing.food_index].canonical_name}: ${ing.quantity_g}g (${ing.cooking_method})`);

      if (LIVE) {
        await prisma.$transaction([
          prisma.workspace_recipe_ingredients.createMany({
            data: ingredients.map((ing, idx) => ({
              recipe_id: rec.id,
              food_id: foods[ing.food_index].id,
              quantity_g: ing.quantity_g,
              cooking_method: ing.cooking_method,
              quantity_state: 'as_consumed',
              sort_order: idx,
            })),
          }),
          prisma.workspace_recipes.update({
            where: { id: rec.id },
            data: { servings, notes: 'Ingredients AI-estimated — please review before publishing.' },
          }),
        ]);
      }
      populated++;
    }
    console.log(`  batch ${b + 1}/${batches.length} done — populated ${populated}, failed ${failed}`);
    await sleep(800);
  }

  console.log(`\nDONE. ${LIVE ? 'Populated' : 'Would populate'}: ${populated} | Failed: ${failed} | Remaining empty after this: ${empty.length - populated}`);
  await prisma.$disconnect();
}

async function generateBatch(model, catalogLines, names) {
  const prompt =
    `FOOD CATALOG (index: name [category]):\n${catalogLines.join('\n')}\n\n` +
    `DISHES (return one object each, name copied EXACTLY):\n${names.map((n) => `- ${n}`).join('\n')}\n\n` +
    `Allowed cooking_method values: ${COOKING_METHODS.join(', ')}.\n` +
    `Respond as JSON: {"recipes":[{"name":"...","servings":2,` +
    `"ingredients":[{"food_index":0,"quantity_g":100,"cooking_method":"boiled"}]}]}`;
  const text = await withRetry(async () => (await model.generateContent(prompt)).response.text());
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : json.recipes ?? [];
}

async function withRetry(fn, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      const msg = err.message ?? '';
      const is429 = msg.includes('429') || msg.includes('Too Many Requests');
      const is503 = msg.includes('503') || msg.includes('Service Unavailable');
      if (!is429 && !is503) throw err;
      if (i === attempts - 1) break;
      const wait = is429 ? 30_000 * (i + 1) : 4_000 * (i + 1);
      console.log(`    ...retry in ${Math.round(wait / 1000)}s (${is429 ? 'quota' : 'overload'})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function sanitizeIngredients(list, foodCount) {
  const out = [];
  const seen = new Set();
  for (const ing of list ?? []) {
    const idx = Math.trunc(Number(ing.food_index));
    if (!Number.isInteger(idx) || idx < 0 || idx >= foodCount || seen.has(idx)) continue;
    const q = Number(ing.quantity_g);
    if (!Number.isFinite(q) || q <= 0) continue;
    const method = COOKING_METHODS.includes(ing.cooking_method ?? '') ? ing.cooking_method : 'boiled';
    seen.add(idx);
    out.push({ food_index: idx, quantity_g: clamp(Math.round(q), 1, 10_000), cooking_method: method });
    if (out.length >= 40) break;
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
