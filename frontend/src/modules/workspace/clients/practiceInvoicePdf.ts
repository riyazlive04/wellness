import type { PracticeInvoice } from '@/modules/workspace/api/clients';
import { resolvePdfBrand, drawBrandedHeader, bankRows } from '@/modules/workspace/pdf/pdfBrand';

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

  // The practice's GSTIN, which the shared header does not carry. Taken from
  // the brand when the caller does not pass one - every caller omitted it,
  // so no invoice ever showed a GSTIN.
  const gstin = practice.gstin ?? brand.gstin;
  if (gstin) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`GSTIN: ${gstin}`, margin, y);
    y += 16;
  }

  y += 6;

  // ── Billed to, and the dates, side by side ─────────────────────────
  // A client needs to see who the invoice is for and the three dates that
  // govern it without hunting: issued, due, and whether it is settled.
  const who = practice.clientName ?? invoice.client_name;
  const blockTop = y;

  if (who) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('BILLED TO', margin, y);
    y += 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(20);
    doc.text(who, margin, y);
    y += 14;

    // Contact details, so the document stands on its own as a record rather
    // than relying on whoever sent it to remember who it went to.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    for (const line of [invoice.client_email, invoice.client_phone].filter(Boolean)) {
      doc.text(String(line), margin, y);
      y += 12;
    }
  }

  // Dates run down the right of the same block.
  {
    let ry = blockTop;
    const label = 330;
    const value = right;
    const row = (k: string, v: string, colour: [number, number, number] = [40, 40, 40]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(130);
      doc.text(k, label, ry);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...colour);
      doc.text(v, value, ry, { align: 'right' });
      ry += 15;
    };

    row('Invoice date', date(invoice.issued_at ?? invoice.created_at));
    if (invoice.due_at) {
      const overdue =
        invoice.status === 'sent' && new Date(invoice.due_at).getTime() < Date.now();
      // An overdue invoice says so in red: the date alone makes the reader
      // do the arithmetic, which is exactly when it gets ignored.
      row('Due date', date(invoice.due_at), overdue ? [190, 50, 50] : [40, 40, 40]);
      if (overdue) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(190, 50, 50);
        doc.text('OVERDUE', value, ry, { align: 'right' });
        ry += 14;
      }
    }
    row(
      'Status',
      invoice.status === 'paid' ? 'Paid'
        : invoice.status === 'void' ? 'Void'
        : invoice.status === 'draft' ? 'Draft'
        : 'Awaiting payment',
      invoice.status === 'paid' ? [20, 120, 70] : [40, 40, 40],
    );
    y = Math.max(y, ry);
  }

  y += 10;

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

  // ── Part-payments ──────────────────────────────────────────────────
  // A client who has paid a deposit must see it on the document, or the
  // invoice reads as though nothing has been handed over and the practice
  // looks like it is not keeping track. Only when part-paid: a fully paid
  // invoice says so in the stamp below, and an untouched one has nothing to
  // report.
  const paid = invoice.paid_paise ?? 0;
  const balance = invoice.balance_paise ?? Math.max(0, invoice.total_paise - paid);
  if (paid > 0 && balance > 0) {
    totalRow('Received', `- ${rupees(paid)}`);
    doc.setDrawColor(220);
    doc.line(360, y - 8, right, y - 8);
    y += 4;
    totalRow('Balance due', rupees(balance), true);
  }

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

  // ── How to pay ─────────────────────────────────────────────────────
  // An unpaid invoice that does not say how to pay it makes the client ask,
  // which is the delay a practice is trying to avoid. Only shown while money
  // is actually owed.
  if (invoice.status === 'sent' || invoice.status === 'draft') {
    // The bank details, when the practice has configured any. A practice that
    // takes cash in the clinic has none, and then this is the sentence-only
    // block it has always been - no empty "Bank details" heading.
    const bank = brand.bank ? bankRows(brand.bank) : [];
    const payTo = [brand.contactLine, brand.legalName].filter(Boolean)[0];
    if (payTo || bank.length) {
      // The panel holds the two text lines (44pt) and, below them, the bank
      // rows: two fields per line at 13pt, starting 16pt under the text.
      const bankH = bank.length ? 16 + Math.ceil(bank.length / 2) * 13 : 0;
      y += 12;
      doc.setFillColor(248, 249, 247);
      doc.roundedRect(margin, y - 12, right - margin, 44 + bankH, 4, 4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text('HOW TO PAY', margin + 12, y + 2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(70);
      const lines = doc.splitTextToSize(
        `Pay ${brand.legalName ?? brand.practiceName} directly and this invoice will be marked paid. ` +
          `Questions: ${brand.contactLine ?? ''}`.trim(),
        right - margin - 24,
      ) as string[];
      doc.text(lines.slice(0, 2), margin + 12, y + 16);
      y += 48;

      if (bank.length) {
        // Two columns: a client copying an account number into their banking
        // app reads label-above-value, not a run-on sentence.
        const colW = (right - margin - 24) / 2;
        let rowY = y;
        bank.forEach(([label, value], i) => {
          const x = margin + 12 + (i % 2) * colW;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(135);
          doc.text(label.toUpperCase(), x, rowY);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(60);
          // Clamp to the column so a long bank or branch name cannot run into
          // the neighbouring value.
          const v = doc.splitTextToSize(value, colW - 10)[0] as string;
          doc.text(v, x, rowY + 9);
          if (i % 2 === 1) rowY += 13;
        });
        y = rowY + (bank.length % 2 === 1 ? 13 : 0) + 12;
      }
    }
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

  // ── Terms and conditions ───────────────────────────────────────────
  // Set apart from the notes with a rule and a heading: notes are about this
  // one invoice, terms are the agreement, and a practice printing them wants
  // them to read as the agreement.
  if (invoice.terms) {
    y += 6;
    doc.setDrawColor(225);
    doc.setLineWidth(0.5);
    doc.line(margin, y, right, y);
    y += 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('TERMS & CONDITIONS', margin, y);
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    const t = doc.splitTextToSize(invoice.terms, right - margin) as string[];
    // Leave room for the footer line rather than printing over it.
    const room = Math.max(0, Math.floor((780 - y) / 10));
    doc.text(t.slice(0, room), margin, y);
    y += Math.min(t.length, room) * 10 + 6;
  }

  // ── Footer ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150);
  // The practice's own footer note first, then the standing disclaimer.
  if (brand.footerNote) {
    const note = doc.splitTextToSize(brand.footerNote, right - margin) as string[];
    doc.text(note.slice(0, 2), margin, 788);
  }
  doc.text(
    'This is a computer-generated invoice and does not require a signature.',
    margin,
    brand.footerNote ? 812 : 800,
  );

  const name = `${invoice.display_number}${who ? `-${who.replace(/[^a-z0-9]+/gi, '-')}` : ''}.pdf`;
  doc.save(name.toLowerCase());
}
