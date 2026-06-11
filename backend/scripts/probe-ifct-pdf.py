"""
Probe the IFCT 2017 PDF to understand its table structure.

Prints:
  - Total page count
  - For sample pages: text snippet + extracted tables (column count, first row)

Run: python scripts/probe-ifct-pdf.py
"""
import sys
import pdfplumber

PDF_PATH = "data/IFCT2017.pdf"

def main():
    with pdfplumber.open(PDF_PATH) as pdf:
        n_pages = len(pdf.pages)
        print(f"=== IFCT 2017 — {n_pages} pages total ===\n")

        # Sample pages: front matter (1, 5), early data (30, 50), middle (100, 150)
        sample_indices = [0, 4, 29, 49, 99, 149]
        sample_indices = [i for i in sample_indices if i < n_pages]

        for idx in sample_indices:
            page = pdf.pages[idx]
            print(f"--- Page {idx + 1} ---")

            text = page.extract_text() or ""
            snippet = text[:400].replace("\n", " | ")
            print(f"  text[:400]: {snippet}")

            tables = page.extract_tables() or []
            print(f"  tables found: {len(tables)}")
            for t_i, table in enumerate(tables):
                if not table:
                    continue
                print(f"    table[{t_i}]: rows={len(table)}, cols={len(table[0])}")
                # Show first 2 rows as a quick sanity peek
                for r_i, row in enumerate(table[:2]):
                    cells = [str(c)[:30] if c else "" for c in row]
                    print(f"      row[{r_i}]: {cells}")
            print()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)