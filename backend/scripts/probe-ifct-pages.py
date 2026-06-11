"""
Targeted probe — sample text from many pages to map IFCT's table layout.

Looks for marker lines that identify which table type lives on each page:
  - Proximates: "WATER PROTCNT" or "ENERC"
  - Minerals:   "Na" / "K" / "Ca" headers or "Sodium" / "Potassium"
  - Vitamins:   "Thiamine" / "Riboflavin" / "Ascorbic"
  - Amino acids:"Tryptophan" / "Lysine"
  - Fatty acids:"FASAT" / "FATRN"

Also samples 6 page snippets per identified group to confirm the column layout.
"""
import pdfplumber
import re
from collections import defaultdict

PDF_PATH = "data/IFCT2017.pdf"

# Heuristic: header tokens that identify each table type
HEADER_PATTERNS = {
    "proximate":  re.compile(r"PROTCNT|FATCE|FIBTG|CHOAVLDF|ENERC", re.IGNORECASE),
    "carbs":      re.compile(r"STARCH|SUGAR|FRUSU|GLUSU", re.IGNORECASE),
    "minerals":   re.compile(r"\b(Na|K|Ca|Fe|Mg|P|Zn|Cu|Mn|Se|Cr)\b.*\b(Na|K|Ca|Fe|Mg)\b"),
    "vitamins":   re.compile(r"THIA|RIBF|NIAC|ASCORBIC|RETOL|TOCPHA|FOLAC|CHOCAL", re.IGNORECASE),
    "amino":      re.compile(r"TRP|LYS|LEU|ILE|VAL|MET|THR|PHE|TYR|HIS", re.IGNORECASE),
    "fatty":      re.compile(r"FASAT|FATRN|FAPU|FAMS|FALN|FATD", re.IGNORECASE),
}

# Marker that this page has actual food rows (food code pattern E017, A001, etc.)
FOOD_ROW_PATTERN = re.compile(r"^[A-Z]\d{3,4}\b", re.MULTILINE)

def main():
    by_type = defaultdict(list)
    with pdfplumber.open(PDF_PATH) as pdf:
        n = len(pdf.pages)
        print(f"Scanning {n} pages...\n")

        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            if not text.strip():
                continue
            n_food_rows = len(FOOD_ROW_PATTERN.findall(text))
            if n_food_rows < 2:
                continue
            for ttype, pattern in HEADER_PATTERNS.items():
                if pattern.search(text):
                    by_type[ttype].append((i + 1, n_food_rows))
                    break

    print(f"=== Pages classified by table type ===\n")
    for ttype, pages in by_type.items():
        if not pages:
            continue
        first_page = pages[0][0]
        last_page = pages[-1][0]
        total_rows = sum(r for _, r in pages)
        print(f"  {ttype:12s}: {len(pages):3d} pages "
              f"(p{first_page}-p{last_page}), ~{total_rows} food rows")

    # Dump the FIRST page of each type so we can see column layout
    print(f"\n=== Sample page for each table type ===\n")
    with pdfplumber.open(PDF_PATH) as pdf:
        for ttype, pages in by_type.items():
            if not pages:
                continue
            page_no = pages[0][0]
            text = pdf.pages[page_no - 1].extract_text() or ""
            print(f"--- {ttype} sample (page {page_no}) ---")
            # Print up to 30 lines so we see header + a few data rows
            lines = text.split("\n")[:30]
            for ln in lines:
                print(f"    {ln}")
            print()

if __name__ == "__main__":
    main()