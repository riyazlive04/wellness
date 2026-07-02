/* eslint-disable no-console */
/**
 * Fill the last 5 empty recipes whose ingredients aren't in IFCT, by first
 * adding the missing foods (USDA per-100g macros) to the catalog, then wiring
 * the recipe ingredients. Idempotent + DRY by default (pass --live to write).
 *
 * Usage (from backend/):  node scripts/add-five-recipes.mjs         # dry
 *                         node scripts/add-five-recipes.mjs --live  # write to prod
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
const WORKSPACE_ID = '297eb44f-2d85-49cc-81b1-d6bf05b958ce';
const LIVE = process.argv.includes('--live');
const prisma = new PrismaClient();

// New foods to add — per 100g edible portion (USDA FoodData Central).
const NEW_FOODS = [
  { name: 'Bread, white',          category: 'baked_goods', kcal: 266, protein: 8.8,  carb: 50.6, fat: 3.3,  fiber: 2.4, sugar: 5.7,  sodium: 490 },
  { name: 'Jam, mixed fruit',      category: 'sugars',      kcal: 278, protein: 0.37, carb: 68.9, fat: 0.07, fiber: 1.1, sugar: 48.5, sodium: 32 },
  { name: 'Butter, table',         category: 'fats_oils',   kcal: 717, protein: 0.85, carb: 0.06, fat: 81.1, fiber: 0,   sugar: 0.06, sodium: 643 },
  { name: 'Butterscotch syrup',    category: 'sugars',      kcal: 275, protein: 1.2,  carb: 66,   fat: 3.5,  fiber: 0,   sugar: 55,   sodium: 195 },
  { name: 'Dragon fruit (pitaya)', category: 'fruits',      kcal: 60,  protein: 1.2,  carb: 13,   fat: 0,    fiber: 3,   sugar: 8,    sodium: 0 },
  { name: 'Sugar, white (table)',  category: 'sugars',      kcal: 387, protein: 0,    carb: 100,  fat: 0,    fiber: 0,   sugar: 100,  sodium: 0 },
];

// Recipe compositions. foodName is either a NEW_FOODS name or an EXACT existing
// catalog canonical_name. quantities are for the WHOLE recipe.
const RECIPES = [
  { name: 'Bread toast',           servings: 2, ingredients: [
    { food: 'Bread, white', qty: 120, method: 'roasted' },
    { food: 'Butter, table', qty: 15, method: 'raw' } ] },
  { name: 'Bread jam',             servings: 2, ingredients: [
    { food: 'Bread, white', qty: 120, method: 'raw' },
    { food: 'Jam, mixed fruit', qty: 40, method: 'raw' } ] },
  { name: 'Bread butter jam',      servings: 2, ingredients: [
    { food: 'Bread, white', qty: 120, method: 'raw' },
    { food: 'Butter, table', qty: 15, method: 'raw' },
    { food: 'Jam, mixed fruit', qty: 40, method: 'raw' } ] },
  { name: 'Butterscotch milkshake', servings: 2, ingredients: [
    { food: 'Milk, whole, Cow', qty: 300, method: 'raw' },
    { food: 'Butterscotch syrup', qty: 40, method: 'raw' },
    { food: 'Sugar, white (table)', qty: 20, method: 'raw' } ] },
  { name: 'Dragon fruit juice',    servings: 2, ingredients: [
    { food: 'Dragon fruit (pitaya)', qty: 250, method: 'raw' },
    { food: 'Sugar, white (table)', qty: 15, method: 'raw' },
    { food: 'Lemon, juice (Citrus limon)', qty: 10, method: 'raw' } ] },
];

async function foodIdByName(name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id FROM public.foods WHERE canonical_name = $1 LIMIT 1`, name);
  return rows[0]?.id ?? null;
}

async function ensureFood(f) {
  let id = await foodIdByName(f.name);
  if (id) { console.log(`   food exists: ${f.name}`); return id; }
  if (!LIVE) { console.log(`   + WOULD ADD food: ${f.name} [${f.category}] ${f.kcal}kcal`); return `(new:${f.name})`; }
  const ins = await prisma.$queryRawUnsafe(
    `INSERT INTO public.foods (id, source, source_id, canonical_name, category, measurement_state, edible_portion_fraction, is_admin_approved)
     VALUES (gen_random_uuid(), 'USDA-FDC', NULL, $1, $2, 'as_consumed', 1.0, true) RETURNING id`,
    f.name, f.category);
  id = ins[0].id;
  await prisma.$queryRawUnsafe(
    `INSERT INTO public.food_nutrients (food_id, energy_kcal, energy_kj, protein_g, carbohydrate_g, fat_g, fiber_g, sugar_g, sodium_mg, source_version)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, 'USDA-FDC')`,
    id, f.kcal, Math.round(f.kcal * 4.184 * 10) / 10, f.protein, f.carb, f.fat, f.fiber, f.sugar, f.sodium);
  console.log(`   + ADDED food: ${f.name}`);
  return id;
}

async function main() {
  console.log(`Mode: ${LIVE ? 'LIVE WRITE' : 'DRY-RUN (no writes)'}\n`);

  console.log('== Step 1: ensure foods ==');
  const idMap = {};
  for (const f of NEW_FOODS) idMap[f.name] = await ensureFood(f);

  console.log('\n== Step 2: wire recipes ==');
  for (const r of RECIPES) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT r.id, COUNT(i.id)::int AS n FROM public.workspace_recipes r
         LEFT JOIN public.workspace_recipe_ingredients i ON i.recipe_id = r.id
        WHERE r.workspace_id = $1::uuid AND r.name = $2 GROUP BY r.id`,
      WORKSPACE_ID, r.name);
    if (!rows[0]) { console.log(`\n"${r.name}" — recipe not found, skipping`); continue; }
    if (rows[0].n > 0) { console.log(`\n"${r.name}" — already has ${rows[0].n} ingredients, skipping`); continue; }
    const recipeId = rows[0].id;

    console.log(`\n• ${r.name} (${r.servings} serv)`);
    const resolved = [];
    for (const ing of r.ingredients) {
      const fid = idMap[ing.food] ?? await foodIdByName(ing.food);
      const ok = fid && !String(fid).startsWith('(new:') || (!LIVE && String(fid).startsWith('(new:'));
      console.log(`    - ${ing.food}: ${ing.qty}g (${ing.method})  ${fid ? '' : '⚠ FOOD NOT FOUND'}`);
      if (LIVE) {
        if (!fid) throw new Error(`Food not resolved: ${ing.food}`);
        resolved.push({ food_id: fid, quantity_g: ing.qty, cooking_method: ing.method });
      }
    }
    if (LIVE) {
      await prisma.$transaction([
        prisma.workspace_recipe_ingredients.createMany({
          data: resolved.map((x, idx) => ({ recipe_id: recipeId, food_id: x.food_id, quantity_g: x.quantity_g, cooking_method: x.cooking_method, quantity_state: 'as_consumed', sort_order: idx })),
        }),
        prisma.workspace_recipes.update({ where: { id: recipeId }, data: { servings: r.servings, notes: 'Ingredients added manually (foods sourced from USDA). Review before publishing.' } }),
      ]);
      console.log(`    ✓ wired ${resolved.length} ingredients`);
    }
  }
  console.log(`\nDONE (${LIVE ? 'written' : 'dry-run'}).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
