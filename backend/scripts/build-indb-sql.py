"""
Build backend/scripts/data/indb-2024.sql from the Indian Nutrient Databank.

Source: Indian Nutrient Databank (INDB) - Vijayakumar A, Dubasi HB, Awasthi A,
Jaacks LM. Current Developments in Nutrition, 2024. Released under a Creative
Commons Attribution (CC BY) licence:
https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-  (INDB.xlsx)

1,014 commonly consumed Indian recipes with nutrients per 100 g, computed by the
authors from IFCT 2017/2004 (gaps from UK CoFID and USDA). Imported as cooked,
as-eaten dishes (measurement_state 'cooked': the calculator adds no cooking oil
or retention losses on top).

Usage:  python build-indb-sql.py path/to/INDB.xlsx
The SQL is idempotent (upserts on foods(source, source_id)).
"""
import os
import re
import sys

import openpyxl

SOURCE = 'INDB-2024'
NOTE = 'Indian Nutrient Databank (INDB) 2024, Vijayakumar et al., CC BY'

# INDB column -> (food_nutrients column, multiplier)
NUTRIENTS = {
    'energy_kcal': ('energy_kcal', 1), 'energy_kj': ('energy_kj', 1),
    'carb_g': ('carbohydrate_g', 1), 'protein_g': ('protein_g', 1), 'fat_g': ('fat_g', 1),
    'freesugar_g': ('sugar_g', 1), 'fibre_g': ('fiber_g', 1),
    'sfa_mg': ('saturated_fat_g', 0.001), 'mufa_mg': ('mufa_g', 0.001), 'pufa_mg': ('pufa_g', 0.001),
    'cholesterol_mg': ('cholesterol_mg', 1), 'calcium_mg': ('calcium_mg', 1),
    'phosphorus_mg': ('phosphorus_mg', 1), 'magnesium_mg': ('magnesium_mg', 1),
    'sodium_mg': ('sodium_mg', 1), 'potassium_mg': ('potassium_mg', 1), 'iron_mg': ('iron_mg', 1),
    'copper_mg': ('copper_mg', 1), 'selenium_ug': ('selenium_mcg', 1), 'chromium_mg': ('chromium_mcg', 1000),
    'manganese_mg': ('manganese_mg', 1), 'zinc_mg': ('zinc_mg', 1),
    'vita_ug': ('vit_a_mcg_rae', 1), 'vite_mg': ('vit_e_mg', 1),
    'vitb1_mg': ('vit_b1_thiamin_mg', 1), 'vitb2_mg': ('vit_b2_riboflavin_mg', 1),
    'vitb3_mg': ('vit_b3_niacin_mg', 1), 'vitb5_mg': ('vit_b5_pantothenic_mg', 1),
    'vitb6_mg': ('vit_b6_pyridoxine_mg', 1), 'vitb7_ug': ('vit_b7_biotin_mcg', 1),
    'vitc_mg': ('vit_c_mg', 1),
}
# Summed / fallback columns
SUMS = {'vit_d_mcg': ['vitd2_ug', 'vitd3_ug'], 'vit_k_mcg': ['vitk1_ug', 'vitk2_ug']}

CATEGORY_RULES = [
    ('beverages', r'\b(tea|chai|coffee|juice|shake|milkshake|lassi|sherbet|sharbat|squash|smoothie|nog|soda|drink|lemonade|punch|thandai|chaas|cooler|cocktail|mocktail|espreso|espresso)\b'),
    ('baked_goods', r'\b(cake|bread|biscuit|cookie|muffin|pastry|pie|tart|bun|croissant|scone|rusk|swiss roll)\b'),
    ('fast_food', r'\b(burger|hot dog|french fries|pizza)\b'),
]

# Alternate names INDB gives in brackets that are too generic to be aliases.
STOP = {'indian style', 'english style', 'toasted', 'steamed', 'baked', 'fried', 'plain', 'boiled',
        'with', 'sweet', 'salted', 'ii', 'i', 'south indian', 'north indian'}

# Everyday words -> the food they mean on a plate (exact canonical names).
CURATED = {
    'Boiled rice (Uble chawal)': ['rice', 'white rice', 'steamed rice', 'cooked rice', 'plain rice', 'boiled rice'],
    'Chapati/Roti': ['roti', 'chapati', 'chapathi', 'phulka', 'fulka', 'wheat roti'],
    'Plain dosa': ['dosa', 'dosai', 'plain dosai'],
    'Idli': ['idly', 'idlis', 'idli'],
    'Egg, poultry, whole, boiled': ['boiled egg', 'hard-boiled egg', 'hard boiled egg', 'egg boiled'],
    'Plain omelette/omlet': ['omelette', 'omelet', 'omlet', 'egg omelette'],
    'Milk, whole, Cow': ['milk', 'cow milk', 'whole milk'],
    'Hot tea (Garam Chai)': ['tea', 'chai', 'milk tea'],
    'Steeped hot coffee': ['coffee', 'hot coffee', 'filter coffee'],
    'Semolina upma (Suji/Rava upma)': ['upma', 'rava upma', 'suji upma'],
    'Plain khitchdi (Plain khichri/khichdi)': ['khichdi', 'khichri', 'khichadi'],
    'Plain urad dal vada (Uzunne vada/Minapa garelu/Ulundu vadai/Medu vada)': ['medu vada', 'vada', 'vadai', 'ulundu vadai'],
    'Rasam with tamarind (Puli rasam/ Chintapandu rasam/ Charu/Saaru)': ['rasam'],
    'Washed moong dal (Dhuli moong ki dal)': ['dal', 'dhal', 'moong dal', 'lentil curry'],
    'Plain parantha/paratha': ['paratha', 'parantha', 'plain paratha'],
    'Paneer in butter sauce': ['paneer butter masala', 'butter paneer', 'paneer makhani'],
    # Produce: several IFCT varieties tie on the bare word; pick the everyday one.
    'Tomato, ripe, local (Lycopersicon esculentum)': ['tomato', 'tomatoes'],
    'Banana, ripe, robusta (Musa x paradisiaca)': ['banana', 'bananas'],
    'Apple, big (Malus domestica)': ['apple', 'apples'],
    'Onion, big (Allium cepa)': ['onion', 'onions'],
}


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def category(name):
    low = name.lower()
    # Condiments: the dish NAME ends in one ("Peanut chutney", "Sambar powder"),
    # not "Masala dosa" or "Fried chicken with tomato sauce".
    head = low.split('(')[0].strip()
    is_dish = ' with ' in head or ' in ' in head
    if not is_dish and re.search(r'\b(chutney|pickle|achar|sauce|dressing|ketchup|jam|dip|powder)$', head):
        return 'condiments_spices'
    if re.search(r'\b(garam|chaat|chat|sambar|rasam|tea|chai|pav bhaji|chole|biryani) masala$', head):
        return 'condiments_spices'
    for cat, rx in CATEGORY_RULES:
        if re.search(rx, low):
            return cat
    return 'cooked_dishes'


def aliases(name):
    out = set()
    for part in re.split(r'[()/,]', name):
        a = re.sub(r'\s+', ' ', part).strip(' .-')
        if len(a) >= 3 and a.lower() not in STOP and a.lower() != name.lower():
            out.add(a)
    return sorted(out)


def main(path):
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hdr = list(rows[0])
    col = {h: i for i, h in enumerate(hdr)}
    out = [
        '-- Generated by backend/scripts/build-indb-sql.py - do not edit by hand.',
        f'-- {NOTE}. https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-',
        'BEGIN;',
    ]
    n = 0
    for r in rows[1:]:
        code, name = r[col['food_code']], (r[col['food_name']] or '').strip()
        kcal = num(r[col['energy_kcal']])
        if not code or not name or kcal is None:
            continue
        serv_kcal = num(r[col['unit_serving_energy_kcal']])
        serving_g = round(serv_kcal / kcal * 100, 1) if serv_kcal and kcal > 0 else None
        unit = (r[col['servings_unit']] or '').strip()
        note = NOTE + (f'. 1 {unit} = {serving_g} g' if unit and serving_g else '')

        vals = {}
        for src, (dst, mult) in NUTRIENTS.items():
            v = num(r[col[src]])
            if v is not None:
                vals[dst] = round(max(0.0, v) * mult, 4)
        for dst, srcs in SUMS.items():
            parts = [num(r[col[s]]) for s in srcs]
            parts = [p for p in parts if p is not None]
            if parts:
                vals[dst] = round(sum(parts), 4)
        folate = num(r[col['folate_ug']])
        if folate is None:
            folate = num(r[col['vitb9_ug']])
        if folate is not None:
            vals['vit_b9_folate_mcg'] = round(folate, 4)
        for k in ('energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g'):
            vals.setdefault(k, 0)

        cols = ', '.join(vals)
        vlist = ', '.join(str(v) for v in vals.values())
        upd = ', '.join(f'{c} = EXCLUDED.{c}' for c in vals)
        out.append(
            f"WITH f AS (INSERT INTO public.foods (source, source_id, canonical_name, category, measurement_state, "
            f"edible_portion_fraction, default_serving_g, is_admin_approved, notes) VALUES ({q(SOURCE)}, {q(code)}, {q(name)}, "
            f"{q(category(name))}, 'cooked', 1, {serving_g if serving_g else 'NULL'}, true, {q(note)}) "
            f"ON CONFLICT (source, source_id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, category = EXCLUDED.category, "
            f"measurement_state = EXCLUDED.measurement_state, default_serving_g = EXCLUDED.default_serving_g, notes = EXCLUDED.notes, "
            f"updated_at = now() RETURNING id) "
            f"INSERT INTO public.food_nutrients (food_id, {cols}, source_version) SELECT id, {vlist}, 'INDB 2024' FROM f "
            f"ON CONFLICT (food_id) DO UPDATE SET {upd}, source_version = EXCLUDED.source_version;"
        )
        al = aliases(name)
        if al:
            arr = 'ARRAY[' + ', '.join(q(a) for a in al) + ']'
            out.append(
                f"INSERT INTO public.food_aliases (food_id, alias, language_code) SELECT f.id, a, 'en' FROM public.foods f, "
                f"unnest({arr}) a WHERE f.source = {q(SOURCE)} AND f.source_id = {q(code)} ON CONFLICT DO NOTHING;"
            )
        n += 1

    for target, words in CURATED.items():
        arr = 'ARRAY[' + ', '.join(q(w) for w in words) + ']'
        out.append(
            f"INSERT INTO public.food_aliases (food_id, alias, language_code) SELECT f.id, a, 'en' FROM public.foods f, "
            f"unnest({arr}) a WHERE f.canonical_name = {q(target)} AND f.is_admin_approved ON CONFLICT DO NOTHING;"
        )
    out.append('COMMIT;')

    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'indb-2024.sql')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(out) + '\n')
    print(f'{n} dishes -> {dest}')


if __name__ == '__main__':
    main(sys.argv[1])
