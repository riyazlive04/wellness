import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CATEGORY_LABEL,
  type FoodCategory,
  type FoodSource,
  type FoodSummary,
} from '@/modules/workspace/api/nutrition';

/**
 * Food library PDF generator — minimal, professional.
 *
 * Design language:
 *   - Sans-serif throughout (Helvetica)
 *   - Hairline rules (0.4pt grey) as the only chromatic decoration
 *   - Monospace for codes only
 *   - Generous whitespace, tight typographic rhythm
 *   - No row stripes, no heavy backgrounds — just data
 *   - NUSI logo embedded top-left
 *   - Serial numbers in the leftmost column
 *
 * The PDF reflects the current filter state — if the user filtered to
 * "Cereals" in IFCT 2017, the PDF contains only those rows.
 *
 * Output: opens the browser's Save dialog with a descriptive filename
 * like "NUSI-Food-Library-Cereals-IFCT-2017-2026-06-12.pdf".
 */
export interface GeneratePdfOptions {
  foods: FoodSummary[];
  category: FoodCategory | 'all';
  source: FoodSource | 'all';
  query: string;
  practiceName?: string;
}

export async function generateFoodLibraryPdf(opts: GeneratePdfOptions): Promise<void> {
  const { foods, category, source, query, practiceName = 'NUSI' } = opts;

  // Try to load the logo; if it fails the PDF still generates with text-only header.
  const logoDataUrl = await loadImageAsDataUrl('/sirah-logo.png').catch(() => null);

  // A4 portrait, units in points so we have fine type control.
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 48;

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Header — only on first page ───────────────────────────────────

  // Logo (left) + brand name beside it
  let brandTextX = margin;
  const headerY = margin;
  if (logoDataUrl) {
    const logoSize = 22;
    doc.addImage(logoDataUrl, 'PNG', margin, headerY - 6, logoSize, logoSize);
    brandTextX = margin + logoSize + 8;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(practiceName.toUpperCase(), brandTextX, headerY + 8);

  // Date on the right
  doc.text(dateStr, pageW - margin, headerY + 8, { align: 'right' });

  // Hairline below header
  doc.setDrawColor(220);
  doc.setLineWidth(0.4);
  doc.line(margin, headerY + 24, pageW - margin, headerY + 24);

  // Title
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(20);
  doc.setTextColor(20);
  doc.text('Food Library', margin, headerY + 56);

  // Subtitle / provenance
  doc.setFontSize(9);
  doc.setTextColor(110);
  const subtitle = 'Sourced from IFCT 2017 (NIN / ICMR) and USDA FoodData Central. Per 100g edible portion.';
  doc.text(subtitle, margin, headerY + 74);

  // Filter context line
  const contextBits: string[] = [];
  if (category !== 'all') contextBits.push(`Category: ${CATEGORY_LABEL[category]}`);
  if (source !== 'all')   contextBits.push(`Source: ${source}`);
  if (query.trim())       contextBits.push(`Search: "${query.trim()}"`);
  contextBits.push(`${foods.length} ${foods.length === 1 ? 'entry' : 'entries'}`);

  doc.setFontSize(8);
  doc.setTextColor(140);
  const contextLine = contextBits.join('  ·  ').toUpperCase();
  doc.text(contextLine, margin, headerY + 92);

  // ── Table ─────────────────────────────────────────────────────────

  // Alphabetised, then enumerated. Serial number is the first column.
  const rows = [...foods]
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
    .map((f, i) => [
      `${i + 1}.`,
      f.source_id ?? '—',
      f.canonical_name,
      CATEGORY_LABEL[f.category],
      f.source,
      f.measurement_state === 'as_consumed' ? '' : f.measurement_state,
    ]);

  autoTable(doc, {
    startY: headerY + 116,
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
    didDrawPage: (data) => {
      // Footer with hairline + page numbers + citation
      const footerY = pageH - margin + 4;
      doc.setDrawColor(230);
      doc.setLineWidth(0.4);
      doc.line(margin, footerY - 16, pageW - margin, footerY - 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(140);

      // Left: citation + small logo if loaded
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', margin, footerY - 10, 10, 10);
        doc.text(
          'Generated by NUSI · Nutrition Intelligence Engine',
          margin + 14, footerY,
        );
      } else {
        doc.text(
          'Generated by NUSI · Nutrition Intelligence Engine',
          margin, footerY,
        );
      }

      // Right: page X of Y
      const pageNumber = data.pageNumber;
      const pageCount = doc.getNumberOfPages();
      doc.text(
        `Page ${pageNumber} of ${pageCount}`,
        pageW - margin, footerY, { align: 'right' },
      );
    },
  });

  // ── Save ──────────────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);
  const slug = filenameSlug(category, source, query);
  doc.save(`NUSI-Food-Library-${slug}-${today}.pdf`);
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Fetch a static asset and return it as a base64 data URL suitable for
 * jsPDF.addImage(). Throws if the resource is missing — caller should catch.
 */
async function loadImageAsDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not fetch ${url}: ${resp.status}`);
  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read image as data URL'));
    reader.readAsDataURL(blob);
  });
}

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
