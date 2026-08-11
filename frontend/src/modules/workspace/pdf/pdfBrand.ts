import type jsPDF from 'jspdf';
import { workspacesApi } from '@/modules/workspace/api/workspaces';

/**
 * Shared PDF branding — the single source of truth for how every workspace's
 * exports (meal plans, reports, food library, invoices) are headed and footed.
 *
 * Each workspace brands its own documents from the fields it already configures
 * in Settings → Branding (logo, primary/accent colour, practice name, tagline)
 * plus two PDF-specific fields (contact line, footer note). White-label
 * workspaces drop the "Powered by NUSI" footer.
 *
 * Resolve once per document with `resolvePdfBrand()`, then call
 * `drawBrandedHeader()` / `drawBrandedFooters()`.
 */

type RGB = [number, number, number];

const DEFAULT_PRIMARY: RGB = [15, 118, 110]; // teal-700, the app's ink
const DEFAULT_ACCENT: RGB = [217, 70, 239]; // brand magenta
/** Platform fallback logo (same-origin) for non-white-label workspaces. */
const PLATFORM_LOGO = '/sirah-logo.png';

export interface PdfBrand {
  practiceName: string;
  legalName: string | null;
  logo: string | null;
  logoFmt: 'PNG' | 'JPEG';
  primary: RGB;
  accent: RGB;
  tagline: string | null;
  contactLine: string | null;
  footerNote: string | null;
  whiteLabel: boolean;
}

/** #RGB / #RRGGBB (with optional alpha) → [r,g,b]; null on anything unparseable. */
function hexToRgb(hex?: string | null): RGB | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return [r, g, b];
}

function fmtFromMime(mime: string): 'PNG' | 'JPEG' {
  return /jpe?g/i.test(mime) ? 'JPEG' : 'PNG';
}

/** Load any image URL (remote, same-origin, or data:) into a jsPDF-ready data URL. */
async function loadImage(url: string): Promise<{ data: string; fmt: 'PNG' | 'JPEG' } | null> {
  if (url.startsWith('data:')) {
    const mime = url.slice(5, url.indexOf(';') === -1 ? url.indexOf(',') : url.indexOf(';'));
    return { data: url, fmt: fmtFromMime(mime) };
  }
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(blob);
    });
    return { data, fmt: fmtFromMime(blob.type) };
  } catch {
    return null; // CORS / offline / 404 — header falls back to text-only
  }
}

/**
 * Fetch the caller's workspace brand and prepare it for PDF drawing. Never
 * throws: a missing brand row or a failed logo load degrades to sane defaults,
 * because a branding hiccup must not stop someone exporting a document.
 */
export async function resolvePdfBrand(): Promise<PdfBrand> {
  let b: Awaited<ReturnType<typeof workspacesApi.branding>> | null = null;
  try {
    b = await workspacesApi.branding();
  } catch {
    b = null;
  }

  const whiteLabel = !!b?.white_label;

  // Prefer the workspace's own logo. For non-white-label workspaces with none
  // set, fall back to the platform mark (matches the previous behaviour).
  let logo: string | null = null;
  let logoFmt: 'PNG' | 'JPEG' = 'PNG';
  const logoSource = b?.logo_url || (whiteLabel ? null : PLATFORM_LOGO);
  if (logoSource) {
    const loaded = await loadImage(logoSource);
    if (loaded) {
      logo = loaded.data;
      logoFmt = loaded.fmt;
    }
  }

  return {
    practiceName: b?.name || 'Your Practice',
    legalName: b?.legal_name ?? null,
    logo,
    logoFmt,
    primary: hexToRgb(b?.brand_color) ?? DEFAULT_PRIMARY,
    accent: hexToRgb(b?.brand_accent) ?? DEFAULT_ACCENT,
    tagline: b?.tagline || null,
    contactLine: b?.pdf_contact_line || null,
    footerNote: b?.pdf_footer_note || null,
    whiteLabel,
  };
}

export interface HeaderOpts {
  margin: number;
  /** Big document title, e.g. "Meal plan — Week 3". */
  title: string;
  /** Optional line under the title. */
  subtitle?: string;
  /** Optional small uppercase line under the subtitle (e.g. a date range). */
  meta?: string;
  /** Optional small text at the top-right (e.g. "Generated 18 Jul 2026"). */
  rightMeta?: string;
}

/**
 * Draw the branded masthead and return the Y coordinate where body content
 * should begin. Layout: logo + practice name (brand colour) top-left, contact
 * line beneath it, rightMeta top-right, a hairline rule, then title/subtitle.
 */
export function drawBrandedHeader(doc: jsPDF, brand: PdfBrand, opts: HeaderOpts): number {
  const { margin, title, subtitle, meta, rightMeta } = opts;
  const pageW = doc.internal.pageSize.getWidth();
  const top = margin;

  let textX = margin;
  if (brand.logo) {
    try {
      doc.addImage(brand.logo, brand.logoFmt, margin, top - 4, 26, 26);
      textX = margin + 34;
    } catch {
      textX = margin; // a corrupt image must not abort the export
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...brand.primary);
  doc.text(brand.practiceName, textX, top + 8);

  if (brand.contactLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(brand.contactLine, textX, top + 19);
  }

  if (rightMeta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(rightMeta, pageW - margin, top + 8, { align: 'right' });
  }

  // Hairline rule in the brand accent, kept faint.
  const ruleY = top + 30;
  doc.setDrawColor(...brand.accent);
  doc.setLineWidth(0.8);
  doc.line(margin, ruleY, pageW - margin, ruleY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(25);
  doc.text(title, margin, ruleY + 30);

  let y = ruleY + 30;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(110);
    doc.text(subtitle, margin, y + 18);
    y += 18;
  }
  if (meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(meta.toUpperCase(), margin, y + 16);
    y += 16;
  }
  return y + 26;
}

/**
 * Split the workspace's single contact line into rows for a letterhead-style
 * block. Nutritionists type it free-form; we accept newlines or the common
 * separators (· | • —) between fields (address · phone · email · web).
 */
export function contactLines(brand: PdfBrand): string[] {
  if (!brand.contactLine) return [];
  return brand.contactLine
    .split(/\r?\n|\s*[·•|]\s*|\s+—\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface CoverOpts {
  margin: number;
  /** Small uppercase eyebrow, e.g. "MEAL PLAN". */
  kind: string;
  /** The document's headline, e.g. "Weekly Meal Plan". */
  title: string;
  /** Line under the title, e.g. the client's name. */
  subtitle?: string;
  /** Stacked meta lines (week, date range, kcal/day…). */
  meta?: string[];
  /** Small text bottom-left of the cover, e.g. "Generated 11 Aug 2026". */
  generatedOn?: string;
}

/**
 * Draw a full-page branded cover on the current (first) page: an accent band,
 * the centred practice logo + name + tagline, an eyebrow, the document title,
 * subtitle and meta, and a letterhead contact block near the foot. The caller
 * should `doc.addPage()` afterwards and start body content on a fresh page.
 */
export function drawCoverPage(doc: jsPDF, brand: PdfBrand, opts: CoverOpts): void {
  const { margin, kind, title, subtitle, meta, generatedOn } = opts;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cx = pageW / 2;

  // Accent band across the top and a thin echo at the foot.
  doc.setFillColor(...brand.primary);
  doc.rect(0, 0, pageW, 8, 'F');
  doc.setFillColor(...brand.accent);
  doc.rect(0, pageH - 5, pageW, 5, 'F');

  // ── Masthead: logo, practice name, tagline ─────────────────────────
  let y = pageH * 0.24;
  if (brand.logo) {
    try {
      doc.addImage(brand.logo, brand.logoFmt, cx - 30, y - 66, 60, 60);
    } catch {
      /* corrupt logo must not abort the cover */
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...brand.primary);
  doc.text(brand.practiceName, cx, y, { align: 'center' });
  if (brand.tagline) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(140);
    doc.text(brand.tagline, cx, y + 15, { align: 'center' });
  }

  // ── Title block, vertically centred ────────────────────────────────
  y = pageH * 0.46;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...brand.accent);
  doc.text(kind.toUpperCase(), cx, y, { align: 'center', charSpace: 1.5 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(25);
  const titleLines = doc.splitTextToSize(title, pageW - margin * 2) as string[];
  doc.text(titleLines, cx, y + 34, { align: 'center' });
  y += 34 + titleLines.length * 32;

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(90);
    doc.text(subtitle, cx, y, { align: 'center' });
    y += 22;
  }
  if (meta?.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(130);
    for (const line of meta) {
      doc.text(line, cx, y, { align: 'center' });
      y += 15;
    }
  }

  // ── Contact letterhead near the foot ───────────────────────────────
  const lines = contactLines(brand);
  let footY = pageH - 84;
  if (brand.legalName && brand.legalName !== brand.practiceName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(brand.legalName, cx, footY, { align: 'center' });
    footY += 13;
  }
  if (lines.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(130);
    doc.text(lines.join('   ·   '), cx, footY, { align: 'center' });
  }

  if (generatedOn) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(160);
    doc.text(generatedOn, margin, pageH - 22);
  }
  if (!brand.whiteLabel) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(175);
    doc.text('Powered by NUSI', pageW - margin, pageH - 22, { align: 'right' });
  }
}

/**
 * Stamp every page's footer: the workspace footer note (if any), a page
 * counter, and — unless white-label — a discreet platform credit. Call last,
 * after all pages exist.
 */
export function drawBrandedFooters(
  doc: jsPDF,
  brand: PdfBrand,
  margin: number,
  opts?: { coverPage?: boolean },
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  const footY = pageH - 26;
  // When there's a cover, it carries its own credit — start footers on page 2
  // and number the content pages from 1 so the count excludes the cover.
  const first = opts?.coverPage ? 2 : 1;
  const bodyPages = opts?.coverPage ? pages - 1 : pages;

  for (let p = first; p <= pages; p++) {
    doc.setPage(p);

    if (brand.footerNote) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(150);
      // Clamp to the content width so a long note never overruns the margin.
      const line = doc.splitTextToSize(brand.footerNote, pageW - margin * 2)[0] as string;
      doc.text(line, margin, footY);
    }

    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text(`Page ${opts?.coverPage ? p - 1 : p} of ${bodyPages}`, pageW - margin, footY, { align: 'right' });

    if (!brand.whiteLabel) {
      doc.setFontSize(7);
      doc.setTextColor(190);
      doc.text('Powered by NUSI', pageW / 2, footY, { align: 'center' });
    }
  }
}
