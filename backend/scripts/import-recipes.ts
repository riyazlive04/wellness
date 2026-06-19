/* eslint-disable no-console */
/**
 * AI-assisted recipe import.
 *
 * Reads scripts/recipe-names.json (a flat list of dish names) and, for each
 * dish, asks Gemini to compose a realistic ingredient list — but ONLY from the
 * workspace's existing approved foods catalog (Gemini picks foods by index, so
 * every ingredient maps to a real food_id; no hallucinated foods). The recipe
 * is created as a DRAFT (is_published=false) so a nutritionist reviews the
 * AI-estimated quantities before clients ever see the computed nutrition.
 *
 * Usage:
 *   npx dotenv -e .env.local -- ts-node scripts/import-recipes.ts --dry --limit=5
 *   npx dotenv -e .env.local -- ts-node scripts/import-recipes.ts            # full run
 *
 * Flags:
 *   --dry         Generate + print, but DO NOT write to the DB.
 *   --limit=N     Only process the first N names.
 *   --batch=N     Dishes per Gemini call (default 8).
 *   --publish     Create as published instead of draft (NOT recommended).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const WORKSPACE_ID = '297eb44f-2d85-49cc-81b1-d6bf05b958ce'; // Sirah Nutrition
const OWNER_USER_ID = '8c9d4c19-c183-4fcd-9045-0a3eaa8097ac';
// This project's free tier only grants quota on gemini-2.5-flash (~20 requests/
// day); gemini-2.0-flash is limit:0 (no free quota). At batch=25, ~10 requests
// finishes the remaining import within a single day's free allowance — so run
// once per day after the quota resets, or enable billing to do it all at once.
const MODEL = 'gemini-2.5-flash';

const COOKING_METHODS = [
  'raw', 'boiled', 'steamed', 'grilled', 'roasted', 'baked',
  'sauteed', 'pan_fried', 'deep_fried', 'stir_fried', 'curried',
  'tandoor', 'pressure_cooked', 'microwaved', 'fermented',
] as const;
const CATEGORIES = [
  'breakfast', 'rice', 'bread', 'gravy', 'side', 'snack',
  'beverage', 'soup', 'dessert', 'main',
] as const;

// ── args ──
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const PUBLISH = args.includes('--publish');
const NAMES_ONLY = args.includes('--names-only'); // no AI/quota: insert name + category only
const LIMIT = numArg('--limit');
const BATCH = numArg('--batch') ?? 25; // bigger batch = far fewer API calls (kinder to free quota)
function numArg(flag: string): number | undefined {
  const a = args.find((x) => x.startsWith(`${flag}=`));
  return a ? Number(a.split('=')[1]) : undefined;
}

const prisma = new PrismaClient();

interface AiIngredient { food_index: number; quantity_g: number; cooking_method?: string }
interface AiRecipe { name: string; servings?: number; category?: string; ingredients: AiIngredient[] }

async function main() {
  // 1. Load names
  let names: string[] = JSON.parse(
    readFileSync(join(__dirname, 'recipe-names.json'), 'utf8'),
  );
  if (LIMIT) names = names.slice(0, LIMIT);

  // Names-only mode: no AI, no quota — just insert the recipe header (name +
  // guessed category) as a draft. Ingredients/nutrition get filled in later.
  if (NAMES_ONLY) { await importNamesOnly(names); return; }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env.local');

  // 2. Load food catalog (index → food). Strip "(Scientific name)" for the prompt
  //    to save tokens, but keep the real id for the DB write.
  const foods = await prisma.$queryRawUnsafe<
    Array<{ id: string; canonical_name: string; category: string }>
  >(`SELECT id, canonical_name, category FROM public.foods WHERE is_admin_approved ORDER BY category, canonical_name`);
  const catalogLines = foods.map(
    (f, i) => `${i}: ${f.canonical_name.replace(/\s*\([^)]*\)\s*$/, '')} [${f.category}]`,
  );
  console.log(`Catalog: ${foods.length} foods. Names: ${names.length}. Batch=${BATCH}. ${DRY ? 'DRY-RUN' : 'LIVE WRITE'}${PUBLISH ? ' (PUBLISHED)' : ' (drafts)'}.`);

  // 3. Skip names already present in the workspace (idempotent re-runs)
  const existing = await prisma.workspace_recipes.findMany({
    where: { workspace_id: WORKSPACE_ID },
    select: { name: true },
  });
  const existingSet = new Set(existing.map((e) => e.name.trim().toLowerCase()));

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

  let created = 0, skipped = 0, failed = 0;
  const batches = chunk(names, BATCH);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const todo = batch.filter((n) => !existingSet.has(n.trim().toLowerCase()));
    skipped += batch.length - todo.length;
    if (todo.length === 0) continue;

    let parsed: AiRecipe[] = [];
    try {
      parsed = await generateBatch(model, catalogLines, todo);
    } catch (err) {
      console.error(`  ! batch ${b + 1}/${batches.length} Gemini error:`, (err as Error).message);
      failed += todo.length;
      continue;
    }

    for (const name of todo) {
      const ai = parsed.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())
        ?? parsed.find((r) => r.name.trim().toLowerCase().includes(name.trim().toLowerCase()));
      if (!ai) { console.warn(`  ? no AI result for "${name}"`); failed++; continue; }

      const ingredients = sanitizeIngredients(ai.ingredients, foods.length);
      if (ingredients.length === 0) { console.warn(`  ? "${name}" — no valid ingredients matched`); failed++; continue; }

      const category = CATEGORIES.includes((ai.category ?? '') as typeof CATEGORIES[number])
        ? ai.category! : guessCategory(name);
      const servings = clamp(Math.round(ai.servings ?? 2), 1, 50);

      if (DRY) {
        console.log(`\n• ${name}  [${category}, ${servings} serv]`);
        for (const ing of ingredients) {
          console.log(`    - ${foods[ing.food_index].canonical_name}: ${ing.quantity_g}g (${ing.cooking_method})`);
        }
        created++;
        continue;
      }

      await prisma.workspace_recipes.create({
        data: {
          workspace_id: WORKSPACE_ID,
          created_by_user_id: OWNER_USER_ID,
          name: name.trim(),
          category,
          servings,
          yield_factor: 1,
          is_published: PUBLISH,
          notes: 'Imported from recipe list — ingredients AI-estimated, please review.',
          workspace_recipe_ingredients: {
            create: ingredients.map((ing, idx) => ({
              food_id: foods[ing.food_index].id,
              quantity_g: ing.quantity_g,
              cooking_method: ing.cooking_method,
              quantity_state: 'as_consumed',
              sort_order: idx,
            })),
          },
        },
      });
      existingSet.add(name.trim().toLowerCase());
      created++;
    }
    console.log(`  batch ${b + 1}/${batches.length} done — created ${created}, skipped ${skipped}, failed ${failed}`);
    await sleep(800); // be gentle on the API
  }

  console.log(`\nDONE. ${DRY ? 'Would create' : 'Created'}: ${created} | Skipped (existing): ${skipped} | Failed: ${failed}`);
  await prisma.$disconnect();
}

async function importNamesOnly(names: string[]) {
  const existing = await prisma.workspace_recipes.findMany({
    where: { workspace_id: WORKSPACE_ID },
    select: { name: true },
  });
  const existingSet = new Set(existing.map((e) => e.name.trim().toLowerCase()));
  console.log(`Names-only import. ${names.length} names, ${existingSet.size} already present. ${DRY ? 'DRY-RUN' : 'LIVE WRITE'}.`);

  let created = 0, skipped = 0;
  for (const raw of names) {
    const name = raw.trim();
    if (existingSet.has(name.toLowerCase())) { skipped++; continue; }
    const category = guessCategory(name);
    if (DRY) { console.log(`• ${name}  [${category}]`); created++; continue; }
    await prisma.workspace_recipes.create({
      data: {
        workspace_id: WORKSPACE_ID,
        created_by_user_id: OWNER_USER_ID,
        name,
        category,
        servings: 1,
        yield_factor: 1,
        is_published: PUBLISH,
        notes: 'Imported from recipe list — add ingredients to compute nutrition.',
      },
    });
    existingSet.add(name.toLowerCase());
    created++;
  }
  console.log(`\nDONE. ${DRY ? 'Would create' : 'Created'}: ${created} | Skipped (existing): ${skipped}`);
  await prisma.$disconnect();
}

async function generateBatch(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  catalogLines: string[],
  names: string[],
): Promise<AiRecipe[]> {
  const prompt =
    `FOOD CATALOG (index: name [category]):\n${catalogLines.join('\n')}\n\n` +
    `DISHES (return one object each, name copied EXACTLY):\n${names.map((n) => `- ${n}`).join('\n')}\n\n` +
    `Allowed cooking_method values: ${COOKING_METHODS.join(', ')}.\n` +
    `Allowed category values: ${CATEGORIES.join(', ')}.\n` +
    `Respond as JSON: {"recipes":[{"name":"...","servings":2,"category":"...",` +
    `"ingredients":[{"food_index":0,"quantity_g":100,"cooking_method":"boiled"}]}]}`;

  const text = await withRetry(async () => {
    const res = await model.generateContent(prompt);
    return res.response.text();
  });
  const json = JSON.parse(text) as { recipes?: AiRecipe[] } | AiRecipe[];
  const recipes = Array.isArray(json) ? json : json.recipes ?? [];
  return recipes;
}

/**
 * Retry transient Gemini failures. 503 (overloaded) = short backoff; 429
 * (rate/quota) = long backoff. Gives up after the attempts are spent so a
 * truly-exhausted daily quota doesn't hang the run forever.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message ?? '';
      const is429 = msg.includes('429') || msg.includes('Too Many Requests');
      const is503 = msg.includes('503') || msg.includes('Service Unavailable');
      if (!is429 && !is503) throw err;          // non-transient — fail fast
      if (i === attempts - 1) break;
      const wait = is429 ? 30_000 * (i + 1) : 4_000 * (i + 1); // 30/60/90s vs 4/8/12s
      console.log(`    ...retry in ${Math.round(wait / 1000)}s (${is429 ? 'quota' : 'overload'})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function sanitizeIngredients(list: AiIngredient[], foodCount: number): Required<AiIngredient>[] {
  const out: Required<AiIngredient>[] = [];
  const seen = new Set<number>();
  for (const ing of list ?? []) {
    const idx = Math.trunc(Number(ing.food_index));
    if (!Number.isInteger(idx) || idx < 0 || idx >= foodCount || seen.has(idx)) continue;
    const q = Number(ing.quantity_g);
    if (!Number.isFinite(q) || q <= 0) continue;
    const method = (COOKING_METHODS as readonly string[]).includes(ing.cooking_method ?? '')
      ? ing.cooking_method! : 'boiled';
    seen.add(idx);
    out.push({ food_index: idx, quantity_g: clamp(Math.round(q), 1, 10_000), cooking_method: method });
    if (out.length >= 40) break;
  }
  return out;
}

function guessCategory(name: string): typeof CATEGORIES[number] {
  const n = name.toLowerCase();
  if (/juice|milkshake|lassi|buttermilk|milk|smoothie|shake/.test(n)) return 'beverage';
  if (/soup|broth/.test(n)) return 'soup';
  if (/rice|biriyani|biryani|pulao|satham|bath|pongal/.test(n)) return 'rice';
  if (/dosa|idly|idli|uthappam|vada|upma|paratha|poori|chapathi|chappathi|naan|parotta|appam|idiyappam|puttu|paniyaram|adai|pancake|bread|sandwich/.test(n)) return 'breakfast';
  if (/sambar|gravy|kolambu|kottu|chutney|thokku|dhal|curry|kuzhambu|gojju/.test(n)) return 'gravy';
  if (/poriyal|fry|palya|palaya|sundal|burji|65/.test(n)) return 'side';
  if (/chat|poori|baji|cutlet|pav|maggi|pizza|burger|noodles|pasta/.test(n)) return 'snack';
  return 'main';
}

const chunk = <T>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });
