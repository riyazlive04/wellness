import type { PracticeInvoice } from '@/modules/workspace/api/clients';
import { resolvePdfBrand, drawBrandedHeader } from '@/modules/workspace/pdf/pdfBrand';

/**
 * The invoice a nutritionist hands their own client.
 *
 * Headed with the PRACTICE's name, logo and GSTIN - not NUSI's. This is the
 * practice's document, issued under their own name, for money that comes to
 * them directly. NUSI appears only in the small print.
 *
 * jsPDF is imported dynamically so it stays out of the main bundle and loads
 * only when someone actually downloads an invoice.
 */
export async function generatePracticeInvoicePdf(
  invoice: PracticeInvoice,
  practice: { gstin?: string | null; clientName?: string | null },
): Promise<void> {
  const brand = await resolvePdfBrand();
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const margin = 48;
  const right = 547;

  const rupees = (paise: number) =>
    `INR ${(paise / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
        })
      : '—';

  // A voided invoice must never be mistaken for a live one, so it is stamped
  // before anything else is drawn and the word appears behind the content.
  if (invoice.status === 'void') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(90);
    doc.setTextColor(245, 215, 215);
    doc.text('VOID', 300, 420, { align: 'center', angle: 28 });
  }

  let y = drawBrandedHeader(doc, brand, {
    margin,
    // "Tax invoice" only when tax was actually charged - calling a 0% document
    // a tax invoice is wrong, and most nutritionists are not GST-registered.
    title: invoice.tax_paise > 0 ? 'Tax invoice' : 'Invoice',
    subtitle: invoice.display_number,
    rightMeta: `Issued ${date(invoice.issued_at ?? invoice.created_at)}`,
  });

  // The practice's GSTIN, which the shared header does not carry.
  if (practice.gstin) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`GSTIN: ${practice.gstin}`, margin, y);
    y += 16;
  }

  y += 6;

  // ── Billed to ──────────────────────────────────────────────────────
  const who = practice.clientName ?? invoice.client_name;
  if (who) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text('BILLED TO', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(who, margin, y);
    y += 20;
  }

  if (invoice.due_at) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`Due ${date(invoice.due_at)}`, margin, y);
    y += 18;
  }

  y += 4;

  // ── Lines ──────────────────────────────────────────────────────────
  doc.setDrawColor(220);
  doc.line(margin, y, right, y);
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('DESCRIPTION', margin, y);
  doc.text('QTY', 360, y, { align: 'right' });
  doc.text('RATE', 450, y, { align: 'right' });
  doc.text('AMOUNT', right, y, { align: 'right' });
  y += 8;
  doc.setDrawColor(230);
  doc.line(margin, y, right, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const line of invoice.items) {
    // A long description wraps rather than running under the amounts.
    const wrapped = doc.splitTextToSize(line.description, 290) as string[];
    doc.setTextColor(30);
    doc.text(wrapped, margin, y);
    doc.setTextColor(70);
    doc.text(String(line.quantity), 360, y, { align: 'right' });
    doc.text(rupees(line.unit_paise), 450, y, { align: 'right' });
    doc.setTextColor(20);
    doc.text(rupees(line.quantity * line.unit_paise), right, y, { align: 'right' });
    y += Math.max(18, wrapped.length * 13);

    // Keep the totals off a page edge rather than splitting them.
    if (y > 690) {
      doc.addPage();
      y = margin + 20;
    }
  }

  // ── Totals ─────────────────────────────────────────────────────────
  y += 6;
  doc.setDrawColor(220);
  doc.line(360, y, right, y);
  y += 18;

  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(bold ? 20 : 90);
    doc.text(label, 450, y, { align: 'right' });
    doc.text(value, right, y, { align: 'right' });
    y += bold ? 22 : 17;
  };

  totalRow('Subtotal', rupees(invoice.subtotal_paise));
  if (invoice.tax_paise > 0) {
    totalRow(`GST (${invoice.tax_percent}%)`, rupees(invoice.tax_paise));
  }
  doc.setDrawColor(220);
  doc.line(360, y - 8, right, y - 8);
  y += 4;
  totalRow('Total', rupees(invoice.total_paise), true);

  // ── Paid stamp ─────────────────────────────────────────────────────
  if (invoice.status === 'paid') {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 120, 60);
    const how = invoice.paid_method ? ` by ${invoice.paid_method.toUpperCase()}` : '';
    doc.text(`PAID${how} on ${date(invoice.paid_at)}`, right, y, { align: 'right' });
    y += 20;
  }

  // ── Notes ──────────────────────────────────────────────────────────
  if (invoice.notes) {
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    const wrapped = doc.splitTextToSize(invoice.notes, right - margin) as string[];
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12 + 8;
  }

  // ── Footer ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    'This is a computer-generated invoice and does not require a signature.',
    margin,
    800,
  );

  const name = `${invoice.display_number}${who ? `-${who.replace(/[^a-z0-9]+/gi, '-')}` : ''}.pdf`;
  doc.save(name.toLowerCase());
}
