"""
Direct Python → Postgres importer for the IFCT CSV.

Avoids the OOM that ts-node + Prisma hits on Windows. Uses psycopg (psycopg3)
or psycopg2 — whichever is installed — and parses DATABASE_URL from .env.local.

Idempotent: ON CONFLICT (source, source_id) UPDATE so re-runs propagate
upstream corrections without duplicating rows.

Run: python scripts/import-ifct-pg.py
"""
from __future__ import annotations

import csv
import os
import re
import sys
from pathlib import Path

# ── DATABASE_URL ────────────────────────────────────────────────────────

def load_env_file(path: Path) -> dict[str, str]:
    """Tiny .env parser — no dependencies."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        out[k] = v
    return out


env_local = load_env_file(Path(".env.local"))
env_main = load_env_file(Path(".env"))
# Prefer DIRECT_URL (no pgbouncer pooling) for bulk inserts. Fall back to
# DATABASE_URL but strip the pgbouncer parameter psycopg doesn't recognize.
raw_url = (
    os.environ.get("DIRECT_URL")
    or env_local.get("DIRECT_URL")
    or env_main.get("DIRECT_URL")
    or os.environ.get("DATABASE_URL")
    or env_local.get("DATABASE_URL")
    or env_main.get("DATABASE_URL")
)
if not raw_url:
    print("Neither DIRECT_URL nor DATABASE_URL set in env or .env.local", file=sys.stderr)
    sys.exit(1)

# Strip Supabase pooler params psycopg doesn't understand.
def _clean_url(url: str) -> str:
    if "?" not in url:
        return url
    base, _, query = url.partition("?")
    pairs = [p for p in query.split("&")
             if p and not p.startswith(("pgbouncer=", "connection_limit=", "pool_timeout="))]
    return base + ("?" + "&".join(pairs) if pairs else "")

DATABASE_URL = _clean_url(raw_url)


# ── pg driver: try psycopg3 first, fall back to psycopg2, fall back to install ─

def get_connection():
    try:
        import psycopg  # type: ignore  # psycopg3
        return ("psycopg3", psycopg.connect(DATABASE_URL))
    except ImportError:
        pass
    try:
        import psycopg2  # type: ignore
        return ("psycopg2", psycopg2.connect(DATABASE_URL))
    except ImportError:
        pass
    print("Neither psycopg nor psycopg2 is installed.")
    print("Install one with:  pip install \"psycopg[binary]\"")
    sys.exit(1)


# ── CSV → DB ────────────────────────────────────────────────────────────

CSV_PATH = "data/ifct.csv"

# Map CSV column names → food_nutrients column names
NUTRIENT_MAP = {
    "water":         "water_g",
    "energy_kcal":   "energy_kcal",
    "protein":       "protein_g",
    "carb":          "carbohydrate_g",
    "fat":           "fat_g",
    "fiber":         "fiber_g",
    "sugar":         "sugar_g",
    "ash":           "ash_g",
    "sat_fat":       "saturated_fat_g",
    "mufa":          "mufa_g",
    "pufa":          "pufa_g",
    "cholesterol":   "cholesterol_mg",
    "starch":        "starch_g",
    "na":            "sodium_mg",
    "k":             "potassium_mg",
    "ca":            "calcium_mg",
    "fe":            "iron_mg",
    "mg":            "magnesium_mg",
    "p":             "phosphorus_mg",
    "zn":            "zinc_mg",
    "cu":            "copper_mg",
    "mn":            "manganese_mg",
    "vit_a":         "vit_a_mcg_rae",
    "vit_c":         "vit_c_mg",
    "b1":            "vit_b1_thiamin_mg",
    "b2":            "vit_b2_riboflavin_mg",
    "b3":            "vit_b3_niacin_mg",
    "b6":            "vit_b6_pyridoxine_mg",
    "folate":        "vit_b9_folate_mcg",
    "b12":           "vit_b12_cobalamin_mcg",
    "vit_d":         "vit_d_mcg",
    "vit_e":         "vit_e_mg",
    "vit_k":         "vit_k_mcg",
}


def num(v: str) -> float | None:
    if v is None:
        return None
    v = v.strip()
    if not v or re.match(r"^(na|null|-)$", v, re.IGNORECASE):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def main() -> int:
    csv_path = Path(CSV_PATH)
    if not csv_path.exists():
        print(f"CSV not found at {csv_path}", file=sys.stderr)
        print("Run python scripts/extract-ifct.py first.", file=sys.stderr)
        return 1

    with csv_path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"Parsed {len(rows)} IFCT rows.")

    driver, conn = get_connection()
    print(f"Connected via {driver}.")

    inserted = 0
    updated = 0
    aliases = 0

    cur = conn.cursor()
    try:
        for r in rows:
            code = r["code"]
            name = r["name"].strip()
            if not name:
                continue
            category = r.get("category") or "misc"
            state = r.get("state") or "as_consumed"
            edible = num(r.get("edible_portion") or "1.0") or 1.0
            serving = num(r.get("serving_g") or "")

            # 1. UPSERT food
            cur.execute(
                """
                INSERT INTO public.foods
                    (source, source_id, canonical_name, category, measurement_state,
                     edible_portion_fraction, default_serving_g, is_admin_approved)
                VALUES ('IFCT-2017', %s, %s, %s, %s, %s, %s, true)
                ON CONFLICT (source, source_id) DO UPDATE SET
                    canonical_name = EXCLUDED.canonical_name,
                    category = EXCLUDED.category,
                    measurement_state = EXCLUDED.measurement_state,
                    edible_portion_fraction = EXCLUDED.edible_portion_fraction,
                    default_serving_g = EXCLUDED.default_serving_g,
                    updated_at = now()
                RETURNING id, (xmax = 0) AS was_insert
                """,
                (code, name, category, state, edible, serving),
            )
            food_id, was_insert = cur.fetchone()
            if was_insert:
                inserted += 1
            else:
                updated += 1

            # 2. UPSERT nutrient row (build column list dynamically)
            nutrient_values = {db_col: num(r.get(csv_col, ""))
                                for csv_col, db_col in NUTRIENT_MAP.items()}
            # Skip nutrients that are entirely None (keeps SQL short)
            nutrient_values = {k: v for k, v in nutrient_values.items() if v is not None}
            if nutrient_values:
                cols = list(nutrient_values.keys())
                vals = list(nutrient_values.values())
                # Required NOT NULL columns: energy_kcal, protein_g, carbohydrate_g, fat_g
                # If missing, set to 0 (their CHECK constraint requires >= 0).
                for required in ("energy_kcal", "protein_g", "carbohydrate_g", "fat_g"):
                    if required not in nutrient_values:
                        cols.append(required)
                        vals.append(0)
                # Add source_version + imported_at
                cols.extend(["source_version", "imported_at"])
                vals.extend(["IFCT-2017"])
                placeholders = ", ".join(["%s"] * (len(vals)) + ["now()"])
                set_clauses = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols
                                        if c not in ("source_version", "imported_at"))
                cols_sql = ", ".join(["food_id"] + cols)
                cur.execute(
                    f"""
                    INSERT INTO public.food_nutrients ({cols_sql})
                    VALUES (%s, {placeholders})
                    ON CONFLICT (food_id) DO UPDATE SET
                        {set_clauses},
                        imported_at = now()
                    """,
                    [food_id, *vals],
                )

            # 3. Aliases — only if columns exist in the CSV
            for lang_key, lang_code in (("aliases_en", "en"), ("aliases_hi", "hi"),
                                        ("aliases_ta", "ta"), ("aliases_te", "te"),
                                        ("aliases_bn", "bn")):
                raw = (r.get(lang_key) or "").strip()
                if not raw:
                    continue
                for alias in [a.strip() for a in raw.split("|") if a.strip()]:
                    cur.execute(
                        """
                        INSERT INTO public.food_aliases (food_id, alias, language_code)
                        VALUES (%s, %s, %s)
                        ON CONFLICT DO NOTHING
                        """,
                        (food_id, alias, lang_code),
                    )
                    aliases += 1

        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Import failed, rolled back: {e}", file=sys.stderr)
        cur.close()
        conn.close()
        return 1

    cur.close()
    conn.close()

    print(f"\nOK. Inserted {inserted} new foods, updated {updated}, with {aliases} aliases.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
