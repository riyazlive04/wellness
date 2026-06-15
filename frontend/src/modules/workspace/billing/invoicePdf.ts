import type { InvoiceDetail } from './api';

/**
 * Render a GST-compliant invoice PDF client-side from the invoice detail payload
 * (Module 3 — Invoice Management → PDF Generation + Download Support).
 *
 * jsPDF is imported dynamically so it stays out of the main bundle and only
 * loads when a user actually downloads an invoice.
 */
export async function generateInvoicePdf(detail: InvoiceDetail): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const rupees = (paise: number) =>
    `INR ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const left = 48;
  const right = 547;
  let y = 56;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(detail.supplier.legalName, left, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  detail.supplier.addressLines.forEach((line) => {
    y += 14;
    doc.text(line, left, y);
  });
  if (detail.supplier.gstin) {
    y += 14;
    doc.text(`GSTIN: ${detail.supplier.gstin}`, left, y);
  }
  y += 14;
  doc.text(detail.supplier.email, left, y);

  // "TAX INVOICE" badge (right aligned)
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('TAX INVOICE', right, 56, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`No: ${detail.invoice_number ?? detail.id.slice(0, 8)}`, right, 74, { align: 'right' });
  doc.text(`Issued: ${fmtDate(detail.issued_at ?? detail.created_at)}`, right, 88, { align: 'right' });
  doc.text(`Status: ${detail.status.toUpperCase()}`, right, 102, { align: 'right' });

  // Divider
  y += 24;
  doc.setDrawColor(220);
  doc.line(left, y, right, y);
  y += 24;

  // Bill-to
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Billed to', left, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80);
  y += 16;
  doc.text(detail.customer_name ?? 'Customer', left, y);
  if (detail.customer_email) {
    y += 13;
    doc.text(detail.customer_email, left, y);
  }
  if (detail.customer_gstin) {
    y += 13;
    doc.text(`GSTIN: ${detail.customer_gstin}`, left, y);
  }
  if (detail.period_start || detail.period_end) {
    y += 13;
    doc.text(`Billing period: ${fmtDate(detail.period_start)} – ${fmtDate(detail.period_end)}`, left, y);
  }

  // Amounts table
  y += 32;
  doc.setDrawColor(220);
  doc.line(left, y, right, y);
  y += 20;

  const row = (label: string, value: string, opts: { bold?: boolean } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setTextColor(opts.bold ? 20 : 80);
    doc.setFontSize(opts.bold ? 12 : 10);
    doc.text(label, left, y);
    doc.text(value, right, y, { align: 'right' });
    y += opts.bold ? 22 : 18;
  };

  const g = detail.gst;
  row('Taxable value', rupees(g.basePaise));
  if (g.interState) {
    row(`IGST (${g.ratePercent}%)`, rupees(g.igstPaise));
  } else {
    row(`CGST (${g.ratePercent / 2}%)`, rupees(g.cgstPaise));
    row(`SGST (${g.ratePercent / 2}%)`, rupees(g.sgstPaise));
  }
  doc.setDrawColor(220);
  doc.line(left, y - 6, right, y - 6);
  y += 8;
  row('Total', rupees(g.grossPaise), { bold: true });

  if (detail.paid_at) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(`Paid on ${fmtDate(detail.paid_at)}`, left, y);
    y += 16;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    'This is a computer-generated tax invoice. Amounts are GST-inclusive. Thank you for your business.',
    left,
    792,
  );

  doc.save(`${detail.invoice_number ?? `invoice-${detail.id.slice(0, 8)}`}.pdf`);
}
