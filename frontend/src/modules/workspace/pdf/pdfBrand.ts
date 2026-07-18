import type jsPDF from 'jspdf';
import { workspacesApi } from '@/modules/workspace/api/workspaces';

/**
 * Shared PDF branding — the single source of truth for how every workspace's
 * exports (meal plans, reports, food library, invoices) are headed and footed.
 *
 * Each workspace brands its own documents from the fields it already configures
 * in Settings → Branding (logo, primary/accent colour, practice name, tagline)
 * plus two PDF-specific fields (contact line, footer note). White-label
 * workspaces drop the "Powered by SIRAH LIFE" footer.
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
 * Stamp every page's footer: the workspace footer note (if any), a page
 * counter, and — unless white-label — a discreet platform credit. Call last,
 * after all pages exist.
 */
export function drawBrandedFooters(doc: jsPDF, brand: PdfBrand, margin: number): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  const footY = pageH - 26;

  for (let p = 1; p <= pages; p++) {
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
    doc.text(`Page ${p} of ${pages}`, pageW - margin, footY, { align: 'right' });

    if (!brand.whiteLabel) {
      doc.setFontSize(7);
      doc.setTextColor(190);
      doc.text('Powered by SIRAH LIFE', pageW / 2, footY, { align: 'center' });
    }
  }
}
