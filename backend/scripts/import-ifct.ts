/**
 * IFCT 2017 importer.
 *
 * Populates public.foods + public.food_nutrients + public.food_aliases from
 * IFCT 2017 data. The IFCT (Indian Food Composition Tables) is published by
 * the National Institute of Nutrition (ICMR) and is the canonical reference
 * for Indian-food nutrition values.
 *
 * Two run modes:
 *
 *   npm run import:ifct -- --source=csv --path=./data/ifct.csv
 *   npm run import:ifct -- --source=github
 *
 * github mode pulls the Indian Nutrient Databank (INDB) CSV — a publicly
 * available, structured form of IFCT 2017 maintained on GitHub. See:
 *   https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-
 *
 * Idempotency: re-runnable. Uses (source, source_id) UNIQUE constraint to
 * skip existing rows. UPDATE-on-conflict so corrections in upstream data
 * propagate without leaving stale rows. Aliases are inserted with ON CONFLICT
 * DO NOTHING so reruns don't multiply them.
 *
 * Run:
 *   cd backend
 *   npx dotenv-cli -e .env.local -- npx ts-node scripts/import-ifct.ts --source=csv --path=./data/ifct.csv
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';

// ─── CLI parsing ──────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const SOURCE = args.source ?? 'csv';
const CSV_PATH = args.path ?? './data/ifct.csv';
const DRY_RUN = args['dry-run'] === 'true' || args.dryRun === 'true';

if (!['csv', 'github'].includes(SOURCE)) {
  // eslint-disable-next-line no-console
  console.error(`Unknown --source=${SOURCE}. Use 'csv' or 'github'.`);
  process.exit(1);
}

// ─── IFCT row shape ──────────────────────────────────────────────────

interface IfctRow {
  /** IFCT food code, e.g. "A001" (Rice, raw, milled). Used as source_id. */
  code: string;
  name: string;
  category: string;
  measurement_state: 'raw' | 'cooked' | 'as_consumed';
  edible_portion_fraction: number;
  default_serving_g: number | null;

  // Nutrients per 100g
  water_g: number | null;
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  ash_g: number | null;
  saturated_fat_g: number | null;
  mufa_g: number | null;
  pufa_g: number | null;
  cholesterol_mg: number | null;
  starch_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  magnesium_mg: number | null;
  phosphorus_mg: number | null;
  zinc_mg: number | null;
  copper_mg: number | null;
  manganese_mg: number | null;
  vit_a_mcg_rae: number | null;
  vit_c_mg: number | null;
  vit_b1_thiamin_mg: number | null;
  vit_b2_riboflavin_mg: number | null;
  vit_b3_niacin_mg: number | null;
  vit_b6_pyridoxine_mg: number | null;
  vit_b9_folate_mcg: number | null;
  vit_b12_cobalamin_mcg: number | null;
  vit_d_mcg: number | null;
  vit_e_mg: number | null;
  vit_k_mcg: number | null;

  aliases: { alias: string; lang: string }[];
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // eslint-disable-next-line no-console
    console.error('DATABASE_URL not set. Run via: npx dotenv-cli -e .env.local -- npx ts-node scripts/import-ifct.ts');
    process.exit(1);
  }

  let rows: IfctRow[] = [];
  if (SOURCE === 'csv') {
    if (!existsSync(CSV_PATH)) {
      // eslint-disable-next-line no-console
      console.error(`CSV not found at ${CSV_PATH}.`);
      // eslint-disable-next-line no-console
      console.error('Download from https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-');
      // eslint-disable-next-line no-console
      console.error('Save as backend/data/ifct.csv, or pass --path=<location>');
      process.exit(1);
    }
    const raw = readFileSync(CSV_PATH, 'utf8');
    rows = parseCsv(raw);
  } else {
    rows = await fetchFromGithub();
  }

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.error('Parsed 0 rows. Check that the CSV has expected columns (see comments at top of parseCsv).');
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`Parsed ${rows.length} IFCT rows.`);
  if (DRY_RUN) {
    // eslint-disable-next-line no-console
    console.log('DRY RUN — first 3 rows:');
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  const prisma = new PrismaClient();
  let inserted = 0, updated = 0, aliasCount = 0;

  try {
    for (const r of rows) {
      const foodRows = await prisma.$queryRawUnsafe<Array<{ id: string; was_insert: boolean }>>(
        `INSERT INTO public.foods
           (source, source_id, canonical_name, category, measurement_state,
            edible_portion_fraction, default_serving_g, is_admin_approved)
         VALUES ('IFCT-2017', $1, $2, $3, $4, $5::numeric, $6::numeric, true)
         ON CONFLICT (source, source_id) DO UPDATE SET
           canonical_name = EXCLUDED.canonical_name,
           category = EXCLUDED.category,
           measurement_state = EXCLUDED.measurement_state,
           edible_portion_fraction = EXCLUDED.edible_portion_fraction,
           default_serving_g = EXCLUDED.default_serving_g,
           updated_at = now()
         RETURNING id, (xmax = 0) AS was_insert`,
        r.code, r.name, r.category, r.measurement_state,
        r.edible_portion_fraction, r.default_serving_g,
      );
      const foodId = foodRows[0].id;
      if (foodRows[0].was_insert) inserted++; else updated++;

      await prisma.$executeRawUnsafe(
        `INSERT INTO public.food_nutrients (
           food_id, water_g, energy_kcal, protein_g, carbohydrate_g, fat_g,
           fiber_g, sugar_g, ash_g, saturated_fat_g, mufa_g, pufa_g,
           cholesterol_mg, starch_g,
           sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg,
           phosphorus_mg, zinc_mg, copper_mg, manganese_mg,
           vit_a_mcg_rae, vit_c_mg, vit_b1_thiamin_mg, vit_b2_riboflavin_mg,
           vit_b3_niacin_mg, vit_b6_pyridoxine_mg, vit_b9_folate_mcg,
           vit_b12_cobalamin_mcg, vit_d_mcg, vit_e_mg, vit_k_mcg,
           source_version, imported_at
         ) VALUES (
           $1::uuid, $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6::numeric,
           $7::numeric, $8::numeric, $9::numeric, $10::numeric, $11::numeric, $12::numeric,
           $13::numeric, $14::numeric,
           $15::numeric, $16::numeric, $17::numeric, $18::numeric, $19::numeric,
           $20::numeric, $21::numeric, $22::numeric, $23::numeric,
           $24::numeric, $25::numeric, $26::numeric, $27::numeric,
           $28::numeric, $29::numeric, $30::numeric,
           $31::numeric, $32::numeric, $33::numeric, $34::numeric,
           'IFCT-2017', now()
         )
         ON CONFLICT (food_id) DO UPDATE SET
           water_g = EXCLUDED.water_g,
           energy_kcal = EXCLUDED.energy_kcal,
           protein_g = EXCLUDED.protein_g,
           carbohydrate_g = EXCLUDED.carbohydrate_g,
           fat_g = EXCLUDED.fat_g,
           fiber_g = EXCLUDED.fiber_g,
           sugar_g = EXCLUDED.sugar_g,
           ash_g = EXCLUDED.ash_g,
           saturated_fat_g = EXCLUDED.saturated_fat_g,
           mufa_g = EXCLUDED.mufa_g,
           pufa_g = EXCLUDED.pufa_g,
           cholesterol_mg = EXCLUDED.cholesterol_mg,
           starch_g = EXCLUDED.starch_g,
           sodium_mg = EXCLUDED.sodium_mg,
           potassium_mg = EXCLUDED.potassium_mg,
           calcium_mg = EXCLUDED.calcium_mg,
           iron_mg = EXCLUDED.iron_mg,
           magnesium_mg = EXCLUDED.magnesium_mg,
           phosphorus_mg = EXCLUDED.phosphorus_mg,
           zinc_mg = EXCLUDED.zinc_mg,
           copper_mg = EXCLUDED.copper_mg,
           manganese_mg = EXCLUDED.manganese_mg,
           vit_a_mcg_rae = EXCLUDED.vit_a_mcg_rae,
           vit_c_mg = EXCLUDED.vit_c_mg,
           vit_b1_thiamin_mg = EXCLUDED.vit_b1_thiamin_mg,
           vit_b2_riboflavin_mg = EXCLUDED.vit_b2_riboflavin_mg,
           vit_b3_niacin_mg = EXCLUDED.vit_b3_niacin_mg,
           vit_b6_pyridoxine_mg = EXCLUDED.vit_b6_pyridoxine_mg,
           vit_b9_folate_mcg = EXCLUDED.vit_b9_folate_mcg,
           vit_b12_cobalamin_mcg = EXCLUDED.vit_b12_cobalamin_mcg,
           vit_d_mcg = EXCLUDED.vit_d_mcg,
           vit_e_mg = EXCLUDED.vit_e_mg,
           vit_k_mcg = EXCLUDED.vit_k_mcg,
           imported_at = now()`,
        foodId, r.water_g, r.energy_kcal, r.protein_g, r.carbohydrate_g, r.fat_g,
        r.fiber_g, r.sugar_g, r.ash_g, r.saturated_fat_g, r.mufa_g, r.pufa_g,
        r.cholesterol_mg, r.starch_g,
        r.sodium_mg, r.potassium_mg, r.calcium_mg, r.iron_mg, r.magnesium_mg,
        r.phosphorus_mg, r.zinc_mg, r.copper_mg, r.manganese_mg,
        r.vit_a_mcg_rae, r.vit_c_mg, r.vit_b1_thiamin_mg, r.vit_b2_riboflavin_mg,
        r.vit_b3_niacin_mg, r.vit_b6_pyridoxine_mg, r.vit_b9_folate_mcg,
        r.vit_b12_cobalamin_mcg, r.vit_d_mcg, r.vit_e_mg, r.vit_k_mcg,
      );

      for (const a of r.aliases) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO public.food_aliases (food_id, alias, language_code)
           VALUES ($1::uuid, $2, $3)
           ON CONFLICT DO NOTHING`,
          foodId, a.alias, a.lang,
        );
        aliasCount++;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Import failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log(`✓ Inserted ${inserted} new foods, updated ${updated}, processed ${aliasCount} aliases.`);
}

// ─── CSV parsing ──────────────────────────────────────────────────────

/**
 * Parse INDB / IFCT 2017 CSV. Header names are case-insensitive and several
 * common variants are accepted (the INDB and IFCT publications use slightly
 * different column names). Missing optional columns become NULL.
 *
 * Expected columns (any case):
 *   code, name, category, state, edible_portion, serving_g,
 *   water, energy_kcal, protein, carb, fat, fiber, sugar, ash,
 *   sat_fat, mufa, pufa, cholesterol, starch,
 *   na, k, ca, fe, mg, p, zn, cu, mn,
 *   vit_a, vit_c, b1, b2, b3, b6, folate, b12, vit_d, vit_e, vit_k,
 *   aliases_en, aliases_hi, aliases_ta, aliases_te, aliases_bn
 *
 * Aliases are pipe-separated within a single language column.
 */
function parseCsv(raw: string): IfctRow[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: IfctRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (key: string): string => {
      const idx = headers.indexOf(key);
      return idx === -1 ? '' : (cells[idx] ?? '').trim();
    };
    const num = (key: string): number | null => {
      const v = get(key);
      if (v === '' || /^na$|^null$|^-$/i.test(v)) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const numOr = (key: string, fallback: number): number => num(key) ?? fallback;
    const aliasList = (key: string, lang: string) => {
      const v = get(key);
      if (!v) return [];
      return v.split('|').map((s) => s.trim()).filter(Boolean)
              .map((alias) => ({ alias, lang }));
    };

    const code = get('code') || get('food_code') || `IFCT-${i}`;
    const name = get('name') || get('food_name');
    if (!name) continue;

    rows.push({
      code,
      name,
      category: normaliseCategory(get('category')),
      measurement_state: normaliseState(get('state') || get('measurement_state')),
      edible_portion_fraction: numOr('edible_portion', 1),
      default_serving_g: num('serving_g'),

      water_g:                num('water'),
      energy_kcal:            numOr('energy_kcal', numOr('energy', 0)),
      protein_g:              numOr('protein', 0),
      carbohydrate_g:         numOr('carb', numOr('carbohydrate', 0)),
      fat_g:                  numOr('fat', 0),
      fiber_g:                num('fiber'),
      sugar_g:                num('sugar'),
      ash_g:                  num('ash'),
      saturated_fat_g:        num('sat_fat'),
      mufa_g:                 num('mufa'),
      pufa_g:                 num('pufa'),
      cholesterol_mg:         num('cholesterol'),
      starch_g:               num('starch'),

      sodium_mg:              num('na'),
      potassium_mg:           num('k'),
      calcium_mg:             num('ca'),
      iron_mg:                num('fe'),
      magnesium_mg:           num('mg'),
      phosphorus_mg:          num('p'),
      zinc_mg:                num('zn'),
      copper_mg:              num('cu'),
      manganese_mg:           num('mn'),

      vit_a_mcg_rae:          num('vit_a'),
      vit_c_mg:               num('vit_c'),
      vit_b1_thiamin_mg:      num('b1'),
      vit_b2_riboflavin_mg:   num('b2'),
      vit_b3_niacin_mg:       num('b3'),
      vit_b6_pyridoxine_mg:   num('b6'),
      vit_b9_folate_mcg:      num('folate'),
      vit_b12_cobalamin_mcg:  num('b12'),
      vit_d_mcg:              num('vit_d'),
      vit_e_mg:               num('vit_e'),
      vit_k_mcg:              num('vit_k'),

      aliases: [
        ...aliasList('aliases_en', 'en'),
        ...aliasList('aliases_hi', 'hi'),
        ...aliasList('aliases_ta', 'ta'),
        ...aliasList('aliases_te', 'te'),
        ...aliasList('aliases_bn', 'bn'),
      ],
    });
  }
  return rows;
}

/** Simple CSV splitter — handles double-quoted cells with embedded commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { buf += '"'; i++; continue; }
      inQuote = !inQuote;
      continue;
    }
    if (c === ',' && !inQuote) { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  out.push(buf);
  return out;
}

function normaliseCategory(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (!v) return 'misc';
  if (/cereal|grain|rice|wheat|millet/.test(v)) return 'cereals';
  if (/pulse|legume|dal|lentil|bean/.test(v)) return 'pulses';
  if (/leaf|green/.test(v)) return 'leafy_vegetables';
  if (/root|tuber|potato|carrot|onion/.test(v)) return 'roots_tubers';
  if (/veg/.test(v)) return 'other_vegetables';
  if (/fruit/.test(v)) return 'fruits';
  if (/milk|dairy|curd|yogurt|paneer/.test(v)) return 'milk_products';
  if (/meat|mutton|lamb|pork|beef/.test(v)) return 'meat';
  if (/chicken|poultry/.test(v)) return 'poultry';
  if (/fish|seafood|prawn/.test(v)) return 'fish_seafood';
  if (/egg/.test(v)) return 'eggs';
  if (/oil|ghee|butter|fat/.test(v)) return 'fats_oils';
  if (/sugar|jaggery|honey/.test(v)) return 'sugars';
  if (/beverage|drink|juice|tea|coffee/.test(v)) return 'beverages';
  if (/spice|condiment|masala/.test(v)) return 'condiments_spices';
  if (/nut|seed/.test(v)) return 'nuts_seeds';
  if (/cooked|dish|prepared/.test(v)) return 'cooked_dishes';
  if (/bread|biscuit|cake|baked/.test(v)) return 'baked_goods';
  if (/burger|pizza|fast/.test(v)) return 'fast_food';
  return 'misc';
}

function normaliseState(raw: string): 'raw' | 'cooked' | 'as_consumed' {
  const v = raw.toLowerCase().trim();
  if (v === 'raw') return 'raw';
  if (v === 'cooked' || v === 'prepared') return 'cooked';
  return 'as_consumed';
}

// ─── GitHub fetch ─────────────────────────────────────────────────────

async function fetchFromGithub(): Promise<IfctRow[]> {
  const url = 'https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/INDB_v1.csv';
  // eslint-disable-next-line no-console
  console.log(`Fetching ${url} …`);
  const resp = await fetch(url);
  if (!resp.ok) {
    // eslint-disable-next-line no-console
    console.error(`GitHub fetch failed: ${resp.status} ${resp.statusText}`);
    // eslint-disable-next-line no-console
    console.error('Tip: download manually and use --source=csv --path=...');
    return [];
  }
  const text = await resp.text();
  return parseCsv(text);
}

// ─── Utils ────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (arg.startsWith('--')) out[arg.slice(2)] = 'true';
  }
  return out;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Import failed:', err);
  process.exit(1);
});