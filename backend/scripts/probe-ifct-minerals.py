"""Dump a single mineral table page so we know the column order."""
import pdfplumber, sys
sys.stdout.reconfigure(encoding="utf-8")

with pdfplumber.open("data/IFCT2017.pdf") as pdf:
    for page_no in (151, 152, 153, 110, 111):
        print(f"\n=== Page {page_no} ===")
        text = pdf.pages[page_no - 1].extract_text() or ""
        # Print first 40 lines (covers header + ~20 food rows)
        for line in text.split("\n")[:40]:
            print(line)