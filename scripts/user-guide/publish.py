"""Publish the built user guides into the app (Help & guides).

Run after `node build.mjs`:  python publish.py
Compresses each PDF, merges them behind a cover and contents page into one
complete guide with bookmarks, and
writes frontend/public/guides/ with a thumbnail of each guide's first page
and an index.json the help page reads.
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
COVER = '00-complete-cover.pdf'
THUMB_WIDTH = 480      # px; shown at about 240 px, so sharp on retina screens
THUMB_HEIGHT = 0.62    # top part of page 1: the green header and the first section


def save_small(doc, path):
    doc.subset_fonts()
    doc.save(path, garbage=4, deflate=True, deflate_fonts=True, deflate_images=True)


def save_thumb(page, path, height=THUMB_HEIGHT):
    r = page.rect
    zoom = THUMB_WIDTH / r.width
    clip = fitz.Rect(0, 0, r.width, r.height * height)
    page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip).save(path, jpg_quality=82)


def main():
    os.makedirs(os.path.join(DEST, 'thumbs'), exist_ok=True)
    with open(os.path.join(OUT, 'guides.json'), encoding='utf-8') as f:
        meta = json.load(f)

    full = fitz.open()
    cover = fitz.open(os.path.join(OUT, COVER))
    full.insert_pdf(cover)
    save_thumb(cover[0], os.path.join(DEST, 'thumbs', 'complete.jpg'), height=1.0)
    cover.close()
    toc = [[1, 'Contents', 1]]
    index = []
    for g in meta:
        name = f"{g['no']:02d}-{g['slug']}.pdf"
        doc = fitz.open(os.path.join(OUT, name))
        target = os.path.join(DEST, name)
        save_small(doc, target)
        thumb = f"thumbs/{g['no']:02d}-{g['slug']}.jpg"
        save_thumb(doc[0], os.path.join(DEST, thumb))
        toc.append([1, g['title'], full.page_count + 1])
        full.insert_pdf(doc)
        index.append({**g, 'file': name, 'thumb': thumb, 'pages': doc.page_count, 'kb': os.path.getsize(target) // 1024})
        doc.close()

    full.set_toc(toc)
    save_small(full, os.path.join(DEST, COMPLETE))
    complete = {'file': COMPLETE, 'thumb': 'thumbs/complete.jpg', 'parts': len(index), 'pages': full.page_count, 'kb': os.path.getsize(os.path.join(DEST, COMPLETE)) // 1024}

    with open(os.path.join(DEST, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'complete': complete, 'guides': index}, f, ensure_ascii=False, indent=2)
    print(f"{len(index)} guides + complete ({complete['pages']} pages, {complete['kb']} KB) -> {os.path.normpath(DEST)}")


if __name__ == '__main__':
    main()
