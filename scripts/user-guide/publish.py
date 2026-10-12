"""Publish the built user guides into the app (Help & guides).

Run after `node build.mjs`:  python publish.py
Compresses each PDF, merges them into one complete guide with bookmarks, and
writes frontend/public/guides/ with an index.json the help page reads.
Needs PyMuPDF (pip install pymupdf).
"""
import glob
import json
import os

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
DEST = os.path.join(HERE, '..', '..', 'frontend', 'public', 'guides')
COMPLETE = 'nusi-user-guide-complete.pdf'


def save_small(doc, path):
    doc.subset_fonts()
    doc.save(path, garbage=4, deflate=True, deflate_fonts=True, deflate_images=True)


def main():
    os.makedirs(DEST, exist_ok=True)
    with open(os.path.join(OUT, 'guides.json'), encoding='utf-8') as f:
        meta = json.load(f)

    full = fitz.open()
    toc = []
    index = []
    for g in meta:
        name = f"{g['no']:02d}-{g['slug']}.pdf"
        doc = fitz.open(os.path.join(OUT, name))
        target = os.path.join(DEST, name)
        save_small(doc, target)
        toc.append([1, g['title'], full.page_count + 1])
        full.insert_pdf(doc)
        index.append({**g, 'file': name, 'pages': doc.page_count, 'kb': os.path.getsize(target) // 1024})
        doc.close()

    full.set_toc(toc)
    save_small(full, os.path.join(DEST, COMPLETE))
    complete = {'file': COMPLETE, 'pages': full.page_count, 'kb': os.path.getsize(os.path.join(DEST, COMPLETE)) // 1024}

    with open(os.path.join(DEST, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'complete': complete, 'guides': index}, f, ensure_ascii=False, indent=2)
    print(f"{len(index)} guides + complete ({complete['pages']} pages, {complete['kb']} KB) -> {os.path.normpath(DEST)}")


if __name__ == '__main__':
    main()
