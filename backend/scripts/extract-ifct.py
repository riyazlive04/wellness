"""
IFCT 2017 PDF extractor — position-aware.

Reads the official IFCT 2017 PDF (528 foods, 585 pages) published by NIN/ICMR
and produces a flat CSV that backend/scripts/import-ifct.ts can ingest.

Why position-aware?
  IFCT data tables contain blank cells (values "below detectable limit"). If we
  text-parse with regex we cannot tell WHICH column is blank — we'd misalign
  every column to the right of the blank. So we extract words WITH x-positions
  using pdfplumber.extract_words(), find header x-positions from the all-caps
  abbreviation row on page 1 of each table (e.g. "AL AS CD CA CR CO CU FE PB LI"
  for minerals), and bucket each data-row word into a column by nearest header x.

Three tables joined by food code:
  - Table 1 Proximate (pages 41-68):  WATER PROTCNT ASH FATCE FIBTG FIBINS FIBSOL CHOAVLDF ENERC(kJ)
  - Table 2 Water vitamins (pages 71-110ish):  THIA RIBF NIA PANTAC VITB6A BIOT FOLSUM VITC
  - Table 5 Minerals (pages 151-491):
      Part A: AL AS CD CA CR CO CU FE PB LI
      Part B: MG MN HG MO NI P K SE NA ZN

Outputs backend/data/ifct.csv with columns matching the TS importer.
"""
from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pdfplumber

sys.stdout.reconfigure(encoding="utf-8")

PDF_PATH = "data/IFCT2017.pdf"
OUT_PATH = "data/ifct.csv"

# Energy unit conversion: IFCT publishes ENERC in kJ, our schema is kcal.
KJ_PER_KCAL = 4.184

# ───────────────────────────────────────────────────────────────────────
# Table specs — column abbreviation headers + how each maps to our CSV
# ───────────────────────────────────────────────────────────────────────

@dataclass
class TableSpec:
    name: str
    page_start: int
    page_end: int
    # Abbreviations as they appear in the all-caps header row of page_start.
    # Order matters — left-to-right column order in the PDF.
    abbrevs: list[str]
    # Where each abbrev's value lands in the output CSV (None = ignored).
    csv_field: dict[str, str | None]


PROXIMATE = TableSpec(
    name="proximate",
    page_start=41,
    page_end=68,
    abbrevs=["WATER", "PROTCNT", "ASH", "FATCE", "FIBTG", "FIBINS", "FIBSOL", "CHOAVLDF", "ENERC"],
    csv_field={
        "WATER":    "water",
        "PROTCNT":  "protein",
        "ASH":      "ash",
        "FATCE":    "fat",
        "FIBTG":    "fiber",
        "FIBINS":   None,
        "FIBSOL":   None,
        "CHOAVLDF": "carb",
        "ENERC":    "energy_kj",  # we'll convert to kcal at write time
    },
)

WATER_VITAMINS = TableSpec(
    name="water_vitamins",
    page_start=71,
    page_end=110,
    abbrevs=["THIA", "RIBF", "NIA", "PANTAC", "VITB6A", "BIOT", "FOLSUM", "VITC"],
    csv_field={
        "THIA":   "b1",
        "RIBF":   "b2",
        "NIA":    "b3",
        "PANTAC": None,
        "VITB6A": "b6",
        "BIOT":   None,
        "FOLSUM": "folate",
        "VITC":   "vit_c",
    },
)

MINERALS_A = TableSpec(
    name="minerals_a",
    page_start=151,
    page_end=492,
    abbrevs=["AL", "AS", "CD", "CA", "CR", "CO", "CU", "FE", "PB", "LI"],
    csv_field={
        "AL": None,
        "AS": None,
        "CD": None,
        "CA": "ca",
        "CR": None,
        "CO": None,
        "CU": "cu",
        "FE": "fe",
        "PB": None,
        "LI": None,
    },
)

MINERALS_B = TableSpec(
    name="minerals_b",
    page_start=152,
    page_end=492,
    abbrevs=["MG", "MN", "HG", "MO", "NI", "P", "K", "SE", "NA", "ZN"],
    csv_field={
        "MG": "mg",
        "MN": "mn",
        "HG": None,
        "MO": None,
        "NI": None,
        "P":  "p",
        "K":  "k",
        "SE": None,
        "NA": "na",
        "ZN": "zn",
    },
)

# Match a food code at start of a line: A001, E057, F003, etc.
CODE_RX = re.compile(r"^([A-Z])(\d{3,4})\b")
# Match a numeric mean value, optionally with ±SD. We keep the mean only.
MEAN_RX = re.compile(r"-?\d+(?:\.\d+)?")

# ───────────────────────────────────────────────────────────────────────
# Per-food accumulator
# ───────────────────────────────────────────────────────────────────────

CSV_FIELDS = [
    "code", "name", "category", "state", "edible_portion", "serving_g",
    "water", "energy_kcal", "protein", "carb", "fat", "fiber", "sugar", "ash",
    "sat_fat", "mufa", "pufa", "cholesterol", "starch",
    "na", "k", "ca", "fe", "mg", "p", "zn", "cu", "mn",
    "vit_a", "vit_c", "b1", "b2", "b3", "b6", "folate", "b12", "vit_d", "vit_e", "vit_k",
    "aliases_en", "aliases_hi", "aliases_ta", "aliases_te", "aliases_bn",
]


@dataclass
class FoodRecord:
    code: str
    name: str = ""
    category: str = "misc"
    state: str = "as_consumed"
    edible_portion: str = "1.0"
    nutrients: dict[str, Optional[float]] = field(default_factory=dict)

    def to_csv_row(self) -> dict[str, str]:
        row = {k: "" for k in CSV_FIELDS}
        row["code"] = self.code
        row["name"] = self.name.strip()
        row["category"] = self.category
        row["state"] = self.state
        row["edible_portion"] = self.edible_portion

        for field_name, value in self.nutrients.items():
            if value is None:
                continue
            if field_name == "energy_kj":
                # Convert IFCT's kJ to kcal for our schema
                row["energy_kcal"] = f"{value / KJ_PER_KCAL:.1f}"
            else:
                row[field_name] = f"{value:.4g}"

        # IFCT 2017 measurements are "as consumed" for the food in its named
        # state. We don't apply a raw/cooked transform during import — that's
        # for the engine to decide at calculate() time.
        return row


# ───────────────────────────────────────────────────────────────────────
# Category resolution — IFCT food code letter prefixes
# ───────────────────────────────────────────────────────────────────────

CATEGORY_BY_PREFIX = {
    "A": "cereals",
    "B": "pulses",
    "C": "leafy_vegetables",
    "D": "other_vegetables",
    "E": "fruits",
    "F": "roots_tubers",
    "G": "condiments_spices",
    "H": "nuts_seeds",
    "I": "sugars",
    "J": "fats_oils",
    "K": "fish_seafood",
    "L": "meat",
    "M": "poultry",
    "N": "eggs",
    "O": "milk_products",
    "P": "beverages",
    "Q": "misc",  # processed / miscellaneous
    "R": "misc",
    "S": "misc",
    "T": "misc",
}


# ───────────────────────────────────────────────────────────────────────
# Word-level page parsing
# ───────────────────────────────────────────────────────────────────────

def find_header_x_positions(page, abbrevs: list[str]) -> Optional[list[float]]:
    """Locate the all-caps abbreviation row and return x-center per column.

    Returns None if the row can't be found on this page (e.g. a table-continuation
    page without a header repeat).
    """
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
    # Group words by their y position (line)
    lines: dict[int, list[dict]] = defaultdict(list)
    for w in words:
        # Round y to integer to bucket words on the same line
        y_key = int(round(w["top"]))
        lines[y_key].append(w)

    target = set(abbrevs)
    # Find the line that contains the most abbrevs in order
    best_line = None
    best_hits = 0
    for y, lws in lines.items():
        text_words = [w["text"].upper().rstrip(".") for w in lws]
        hits = sum(1 for t in text_words if t in target)
        if hits > best_hits:
            best_hits = hits
            best_line = lws

    # Need most of the abbrevs present to trust this line
    if best_line is None or best_hits < int(len(abbrevs) * 0.6):
        return None

    # Map each abbrev → its x-center
    positions: dict[str, float] = {}
    for w in best_line:
        token = w["text"].upper().rstrip(".")
        if token in target and token not in positions:
            positions[token] = (w["x0"] + w["x1"]) / 2

    # Return in the spec's column order; missing ones get None and will be skipped
    return [positions.get(a) for a in abbrevs]


def assign_word_to_column(word_x: float, header_xs: list[Optional[float]]) -> Optional[int]:
    """Return the index of the nearest header x-position, or None if too far away."""
    best_idx = None
    best_dist = float("inf")
    for idx, x in enumerate(header_xs):
        if x is None:
            continue
        d = abs(word_x - x)
        if d < best_dist:
            best_dist = d
            best_idx = idx
    # Reject if more than half a typical column away (~30 pts)
    return best_idx if best_dist < 30 else None


def parse_data_lines(page, spec: TableSpec, header_xs: list[Optional[float]],
                     records: dict[str, FoodRecord]) -> int:
    """Walk every data line on the page and update records[code].nutrients.

    Lines are recognized by a leading food code. Lines without a code that
    appear immediately before/after a code line are name continuations.

    Returns the number of food rows updated on this page.
    """
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
    if not words:
        return 0

    # Bucket words by line (round y position)
    lines: dict[int, list[dict]] = defaultdict(list)
    for w in words:
        y_key = int(round(w["top"]))
        lines[y_key].append(w)

    sorted_ys = sorted(lines.keys())
    updated = 0

    for i, y in enumerate(sorted_ys):
        lws = sorted(lines[y], key=lambda w: w["x0"])
        if not lws:
            continue

        first_text = lws[0]["text"]
        m = CODE_RX.match(first_text)
        if not m:
            continue
        code = first_text  # e.g. "A001"
        prefix = m.group(1)

        # Build the food record if first sighting
        rec = records.get(code)
        if rec is None:
            rec = FoodRecord(code=code, category=CATEGORY_BY_PREFIX.get(prefix, "misc"))
            records[code] = rec

        # Extract values from this line, dropping the code itself and the n_regions
        # column (which is the small integer right after the name; we collect ALL
        # numerics and use header-x bucketing to know which is which).
        # We do not include leading code-line words as name — name comes from a
        # separate pass we run below.
        numeric_words = []
        for w in lws[1:]:
            t = w["text"]
            # Strip ±SD suffix: "9.93±0.75" → mean "9.93"
            mean = t.split("±")[0].split("±")[0]
            # Sometimes the SD got split into its own word; that's fine — we already
            # took the mean from this word.
            mm = MEAN_RX.match(mean)
            if mm:
                try:
                    numeric_words.append({
                        "x_center": (w["x0"] + w["x1"]) / 2,
                        "value": float(mm.group(0)),
                    })
                except ValueError:
                    continue

        if not numeric_words:
            continue

        # Drop the FIRST numeric (n_regions — always 1-6, integer, leftmost
        # numeric on every data row), then assign the rest to columns by x.
        # We sort by x_center first to ensure left-to-right order.
        numeric_words.sort(key=lambda w: w["x_center"])

        # Heuristic: n_regions sits well to the LEFT of all the nutrient columns.
        # We drop the leftmost word IF its x_center is well before the first
        # header column.
        first_header_x = next((x for x in header_xs if x is not None), None)
        if first_header_x is not None and numeric_words[0]["x_center"] < first_header_x - 15:
            numeric_words = numeric_words[1:]

        # Assign each remaining numeric to its column via nearest-header.
        for nw in numeric_words:
            col_idx = assign_word_to_column(nw["x_center"], header_xs)
            if col_idx is None:
                continue
            abbrev = spec.abbrevs[col_idx]
            csv_field = spec.csv_field.get(abbrev)
            if csv_field is None:
                continue
            # Don't overwrite an already-set value (first occurrence wins;
            # protects against the same code appearing twice on summary pages)
            if rec.nutrients.get(csv_field) is None:
                rec.nutrients[csv_field] = nw["value"]
        updated += 1

    return updated


def extract_food_names(pdf, spec: TableSpec, records: dict[str, FoodRecord]) -> None:
    """Pass over the proximate table pages to extract food names.

    Names are best captured from the proximate table (Table 1) where each
    food's name sits between the code and the n_regions column. Some names
    wrap to the next/previous line, so we look at +/- 1 line for short trailing
    fragments like "cruentus)".
    """
    for page_no in range(spec.page_start, spec.page_end + 1):
        if page_no > len(pdf.pages):
            break
        page = pdf.pages[page_no - 1]
        text = page.extract_text() or ""
        lines = text.split("\n")

        for i, line in enumerate(lines):
            stripped = line.strip()
            m = CODE_RX.match(stripped)
            if not m:
                continue
            code = m.group(0)
            if code not in records:
                continue
            if records[code].name:
                continue  # already named

            # The name is everything between the code and the first n_regions
            # integer-then-decimal pattern. Allow zero-or-more leading spaces
            # in `rest` because long wrapped names leave the inline portion empty.
            rest = stripped[len(code):].strip()
            mm = re.search(r"^(?:\s*)(\d{1,2})\s+\d+(?:\.\d+)?(?:±|\b)", rest)
            if mm:
                # Whole `rest` starts with the value block — no inline name.
                name = ""
            else:
                # Fallback: stop at first numeric ("Bajra (Pennisetum typhoideum) 6 8.97...")
                num_match = re.search(r"\s\d", rest)
                name = rest[: num_match.start()].strip() if num_match else rest

            # Look behind FIRST. Some IFCT entries wrap the name onto the line
            # before the code line ("Amaranth seed, pale brown (Amaranthus" then
            # "A002 6 9.20..." then "cruentus)").
            if (not name or name.endswith(",") or name.count("(") > name.count(")")) and i > 0:
                prev_line = lines[i - 1].strip()
                if prev_line and not CODE_RX.match(prev_line):
                    # Only attach the tail half (the actual name fragment), not
                    # column labels like "Food Name" or "edoc" (reversed "code").
                    if "(" in prev_line or len(prev_line) > 10:
                        name = f"{prev_line} {name}".strip()

            # Look ahead for a closing fragment like "cruentus)" if name still
            # has unbalanced parens after the look-behind pass.
            if name.count("(") > name.count(")") and i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if not CODE_RX.match(next_line) and ")" in next_line[:60]:
                    close_idx = next_line.index(")")
                    name = f"{name} {next_line[: close_idx + 1]}".strip()

            records[code].name = name


# ───────────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────────

def main() -> int:
    pdf_path = Path(PDF_PATH)
    if not pdf_path.exists():
        print(f"PDF not found at {pdf_path}", file=sys.stderr)
        return 1

    records: dict[str, FoodRecord] = {}

    with pdfplumber.open(pdf_path) as pdf:
        for spec in (PROXIMATE, WATER_VITAMINS, MINERALS_A, MINERALS_B):
            header_xs: Optional[list[Optional[float]]] = None
            total_rows = 0
            page_end = min(spec.page_end, len(pdf.pages))

            for page_no in range(spec.page_start, page_end + 1):
                page = pdf.pages[page_no - 1]
                # Re-learn header positions on each page that has them; carry
                # forward the most recent for continuation pages.
                here_xs = find_header_x_positions(page, spec.abbrevs)
                if here_xs and any(x is not None for x in here_xs):
                    header_xs = here_xs
                if header_xs is None:
                    continue

                rows_on_page = parse_data_lines(page, spec, header_xs, records)
                total_rows += rows_on_page

            print(f"  {spec.name:14s}: {total_rows} food rows updated "
                  f"across pages {spec.page_start}-{page_end}")

        # Names come from the proximate table where the layout is friendliest.
        extract_food_names(pdf, PROXIMATE, records)

    # Drop foods with no nutrients (header artifacts, etc.)
    real = {c: r for c, r in records.items()
            if r.nutrients and r.nutrients.get("energy_kj") not in (None, 0)}

    out_path = Path(OUT_PATH)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for code in sorted(real):
            writer.writerow(real[code].to_csv_row())

    # Quick stats
    print(f"\nWrote {len(real)} foods to {OUT_PATH}.")
    print(f"  with names:    {sum(1 for r in real.values() if r.name)}")
    print(f"  with protein:  {sum(1 for r in real.values() if r.nutrients.get('protein') is not None)}")
    print(f"  with iron:     {sum(1 for r in real.values() if r.nutrients.get('fe') is not None)}")
    print(f"  with vit C:    {sum(1 for r in real.values() if r.nutrients.get('vit_c') is not None)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())