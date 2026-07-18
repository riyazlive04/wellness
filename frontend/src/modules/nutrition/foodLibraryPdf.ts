import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CATEGORY_LABEL,
  type FoodCategory,
  type FoodSource,
  type FoodSummary,
} from '@/modules/workspace/api/nutrition';
import { drawBrandedFooters, drawBrandedHeader, resolvePdfBrand } from '@/modules/workspace/pdf/pdfBrand';

/**
 * Food library PDF generator — minimal, professional.
 *
 * Design language:
 *   - Sans-serif throughout (Helvetica)
 *   - Hairline rules (0.4pt grey) as the only chromatic decoration
 *   - Monospace for codes only
 *   - Generous whitespace, tight typographic rhythm
 *   - No row stripes, no heavy backgrounds — just data
 *   - SIRAH LIFE logo embedded top-left
 *   - Serial numbers in the leftmost column
 *
 * The PDF reflects the current filter state — if the user filtered to
 * "Cereals" in IFCT 2017, the PDF contains only those rows.
 *
 * Output: opens the browser's Save dialog with a descriptive filename
 * like "SIRAH-Food-Library-Cereals-IFCT-2017-2026-06-12.pdf".
 */
export interface GeneratePdfOptions {
  foods: FoodSummary[];
  category: FoodCategory | 'all';
  source: FoodSource | 'all';
  query: string;
  practiceName?: string;
}

export async function generateFoodLibraryPdf(opts: GeneratePdfOptions): Promise<void> {
  const { foods, category, source, query } = opts;

  const brand = await resolvePdfBrand();

  // A4 portrait, units in points so we have fine type control.
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageW  = doc.internal.pageSize.getWidth();
  const margin = 48;

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // Filter context line, shown under the provenance subtitle.
  const contextBits: string[] = [];
  if (category !== 'all') contextBits.push(`Category: ${CATEGORY_LABEL[category]}`);
  if (source !== 'all')   contextBits.push(`Source: ${source}`);
  if (query.trim())       contextBits.push(`Search: "${query.trim()}"`);
  contextBits.push(`${foods.length} ${foods.length === 1 ? 'entry' : 'entries'}`);

  // ── Branded masthead ──────────────────────────────────────────────
  const tableStartY = drawBrandedHeader(doc, brand, {
    margin,
    title: 'Food Library',
    subtitle: 'Sourced from IFCT 2017 (NIN / ICMR) and USDA FoodData Central. Per 100g edible portion.',
    meta: contextBits.join('  ·  '),
    rightMeta: dateStr,
  });

  // ── Table ─────────────────────────────────────────────────────────

  // Alphabetised, then enumerated. Serial number is the first column.
  const rows = [...foods]
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
    .map((f, i) => [
      `${i + 1}.`,
      f.source_id ?? '-',
      f.canonical_name,
      CATEGORY_LABEL[f.category],
      f.source,
      f.measurement_state === 'as_consumed' ? '' : f.measurement_state,
    ]);

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin, bottom: margin + 24 },
    head: [['#', 'Code', 'Food', 'Category', 'Source', 'State']],
    body: rows,
    theme: 'plain',
    headStyles: {
      fontStyle: 'normal',
      fontSize: 7,
      textColor: 140,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 0 },
      lineWidth: { bottom: 0.4 },
      lineColor: 200,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: 40,
      cellPadding: { top: 7, right: 6, bottom: 7, left: 0 },
      lineWidth: { bottom: 0.4 },
      lineColor: 232,
    },
    columnStyles: {
      0: {
        font: 'helvetica', fontSize: 8, textColor: 130,
        cellWidth: 30, halign: 'left',
      },                                                                                       // Serial
      1: { font: 'courier', fontSize: 8, textColor: 110, cellWidth: 48 },                      // Code
      2: { fontStyle: 'normal',     cellWidth: 'auto' },                                       // Food name
      3: { textColor: 90,           cellWidth: 105 },                                          // Category
      4: { fontSize: 8, textColor: 110, cellWidth: 58 },                                       // Source
      5: { fontSize: 7, textColor: 130, cellWidth: 48 },                                       // State
    },
    didParseCell: (data) => {
      // Force header row into uppercase. autoTable has no text-transform.
      if (data.section === 'head') {
        const v = data.cell.text;
        data.cell.text = Array.isArray(v)
          ? v.map((t) => String(t).toUpperCase())
          : [String(v).toUpperCase()];
      }
    },
  });

  // ── Branded footers (post-pass, after all pages exist) ────────────
  drawBrandedFooters(doc, brand, margin);

  // ── Save ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const slug = filenameSlug(category, source, query);
  doc.save(`SIRAH-Food-Library-${slug}-${today}.pdf`);
}

// ─── Helpers ──────────────────────────────────────────────────────

function filenameSlug(
  category: FoodCategory | 'all',
  source: FoodSource | 'all',
  query: string,
): string {
  const bits: string[] = [];
  if (category !== 'all') bits.push(CATEGORY_LABEL[category].replace(/[^a-z0-9]+/gi, '-'));
  if (source !== 'all')   bits.push(source);
  if (query.trim())       bits.push(query.trim().replace(/[^a-z0-9]+/gi, '-').slice(0, 30));
  if (bits.length === 0)  bits.push('All');
  return bits.join('-');
}
