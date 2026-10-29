import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

/**
 * Part-payments and instalments on a practice's invoices.
 *
 * NUSI still does not take this money: the client pays the practice by UPI,
 * cash or bank and the practice records what landed. This is a ledger, not a
 * gateway.
 *
 * The invoice's own `status` and `paid_at` follow the ledger through a database
 * trigger rather than being set here, so they cannot disagree with it. See the
 * migration for why that is a trigger and not application code.
 */
@Injectable()
export class InvoicePaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Payments ───────────────────────────────────────────────────────

  async listPayments(workspaceId: string, invoiceId: string): Promise<PaymentRow[]> {
    await this.assertInvoice(workspaceId, invoiceId);
    const rows = await this.prisma.$queryRawUnsafe<RawPayment[]>(
      `SELECT p.id, p.invoice_id, p.amount_paise, p.method, p.reference, p.note,
              p.received_at, p.instalment_id, p.created_at,
              -- public.profiles exists but is empty in this deployment; names
              -- live on the auth user, as team.service and usage-detail read
              -- them. Email is the fallback so the column is never blank for
              -- a member who never set a display name.
              (SELECT COALESCE(u.raw_user_meta_data->>'name', u.email::text)
                 FROM auth.users u WHERE u.id = p.recorded_by) AS recorded_by_name
         FROM public.practice_invoice_payments p
        WHERE p.invoice_id = $1::uuid AND p.workspace_id = $2::uuid
        ORDER BY p.received_at, p.created_at`,
      invoiceId,
      workspaceId,
    );
    return rows.map(toPayment);
  }

  /**
   * Record money that arrived.
   *
   * Overpayment is refused rather than silently accepted: the usual cause is
   * typing the invoice total into a part-payment box on an invoice that is
   * already half paid, and letting it through leaves the practice's books
   * showing more received than was ever charged.
   */
  async addPayment(
    workspaceId: string,
    invoiceId: string,
    userId: string,
    input: {
      amount_paise: number;
      method?: string;
      reference?: string;
      note?: string;
      received_at?: string;
      instalment_id?: string;
    },
  ): Promise<PaymentRow> {
    const inv = await this.assertInvoice(workspaceId, invoiceId);
    if (inv.status === 'void') {
      throw new BadRequestException('This invoice was voided. Nothing is owed on it.');
    }
    if (!Number.isInteger(input.amount_paise) || input.amount_paise <= 0) {
      throw new BadRequestException('Enter an amount greater than zero.');
    }

    const outstanding = inv.total_paise - inv.paid_paise;
    if (outstanding <= 0) {
      throw new BadRequestException(
        `${display(inv.number)} is already fully paid.`,
      );
    }
    if (input.amount_paise > outstanding) {
      throw new BadRequestException(
        `That is more than the ${rupees(outstanding)} still owed on ${display(inv.number)}.`,
      );
    }
    if (input.instalment_id) {
      const [ok] = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM public.practice_invoice_instalments
          WHERE id = $1::uuid AND invoice_id = $2::uuid`,
        input.instalment_id, invoiceId,
      );
      if (Number(ok?.n ?? 0) === 0) {
        throw new BadRequestException('That instalment is not on this invoice.');
      }
    }

    const [row] = await this.prisma.$queryRawUnsafe<RawPayment[]>(
      `INSERT INTO public.practice_invoice_payments
         (invoice_id, workspace_id, amount_paise, method, reference, note,
          received_at, instalment_id, recorded_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6,
               COALESCE($7::timestamptz, now()), $8::uuid, $9::uuid)
       RETURNING id, invoice_id, amount_paise, method, reference, note,
                 received_at, instalment_id, created_at,
                 NULL::text AS recorded_by_name`,
      invoiceId,
      workspaceId,
      input.amount_paise,
      input.method?.trim() || null,
      input.reference?.trim() || null,
      input.note?.trim() || null,
      input.received_at ?? null,
      input.instalment_id ?? null,
      userId,
    );
    return toPayment(row);
  }

  /**
   * Undo a payment that was never received, or was typed wrong.
   *
   * Deleting rather than reversing: this ledger records what the practice
   * collected, and a payment that did not happen has no place in it. The
   * trigger reopens the invoice if this drops it below its total - which is
   * the un-paid path, reached by correcting the money instead of the status.
   */
  async deletePayment(workspaceId: string, invoiceId: string, paymentId: string): Promise<void> {
    await this.assertInvoice(workspaceId, invoiceId);
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `DELETE FROM public.practice_invoice_payments
        WHERE id = $1::uuid AND invoice_id = $2::uuid AND workspace_id = $3::uuid
        RETURNING id`,
      paymentId, invoiceId, workspaceId,
    );
    if (!rows.length) throw new NotFoundException('Payment not found.');
  }

  // ── Instalments ────────────────────────────────────────────────────

  async listInstalments(workspaceId: string, invoiceId: string): Promise<InstalmentRow[]> {
    await this.assertInvoice(workspaceId, invoiceId);
    return this.readInstalments(invoiceId);
  }

  /**
   * Replace the schedule on an invoice.
   *
   * The instalments must add up to the invoice total. A schedule that does not
   * is the practice's arithmetic slipping, and discovering it three months
   * later - when the last instalment is paid and the invoice still says money
   * is owed - is worse than being told now.
   */
  async setSchedule(
    workspaceId: string,
    invoiceId: string,
    parts: { amount_paise: number; due_at: string; note?: string }[],
  ): Promise<InstalmentRow[]> {
    const inv = await this.assertInvoice(workspaceId, invoiceId);
    if (inv.status === 'void') {
      throw new BadRequestException('This invoice was voided.');
    }
    if (!parts.length) {
      // An empty schedule is how a practice goes back to a single payment.
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM public.practice_invoice_instalments WHERE invoice_id = $1::uuid`,
        invoiceId,
      );
      return [];
    }
    if (parts.length > 36) {
      throw new BadRequestException('A schedule can have at most 36 instalments.');
    }
    for (const p of parts) {
      if (!Number.isInteger(p.amount_paise) || p.amount_paise <= 0) {
        throw new BadRequestException('Every instalment needs an amount greater than zero.');
      }
      if (!p.due_at || Number.isNaN(Date.parse(p.due_at))) {
        throw new BadRequestException('Every instalment needs a due date.');
      }
    }
    const sum = parts.reduce((s, p) => s + p.amount_paise, 0);
    if (sum !== inv.total_paise) {
      throw new BadRequestException(
        `The instalments add up to ${rupees(sum)}, but the invoice is ${rupees(inv.total_paise)}.`,
      );
    }

    // Replace wholesale inside one transaction: a schedule half-written is a
    // schedule whose instalments no longer sum to the invoice.
    await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(
        `DELETE FROM public.practice_invoice_instalments WHERE invoice_id = $1::uuid`,
        invoiceId,
      ),
      ...parts.map((p, n) =>
        this.prisma.$executeRawUnsafe(
          `INSERT INTO public.practice_invoice_instalments
             (invoice_id, workspace_id, seq, amount_paise, due_at, original_due_at, note)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5::timestamptz, $5::timestamptz, $6)`,
          invoiceId, workspaceId, n + 1, p.amount_paise, p.due_at, p.note?.trim() || null,
        ),
      ),
    ]);

    return this.readInstalments(invoiceId);
  }

  /**
   * Push one instalment's due date out.
   *
   * The common real request - "can I pay next month instead" - and the reason
   * the schedule is not immutable. The first due date is kept in
   * original_due_at so a practice can still see what was first agreed, and the
   * count makes a repeatedly-extended client visible.
   */
  async extendInstalment(
    workspaceId: string,
    invoiceId: string,
    instalmentId: string,
    dueAt: string,
    note?: string,
  ): Promise<InstalmentRow[]> {
    await this.assertInvoice(workspaceId, invoiceId);
    if (!dueAt || Number.isNaN(Date.parse(dueAt))) {
      throw new BadRequestException('Pick a new due date.');
    }
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `UPDATE public.practice_invoice_instalments
          SET due_at = $1::timestamptz,
              -- First extension records where the schedule started.
              original_due_at = COALESCE(original_due_at, due_at),
              extended_count = extended_count + 1,
              note = COALESCE($2, note)
        WHERE id = $3::uuid AND invoice_id = $4::uuid AND workspace_id = $5::uuid
        RETURNING id`,
      dueAt, note?.trim() || null, instalmentId, invoiceId, workspaceId,
    );
    if (!rows.length) throw new NotFoundException('Instalment not found.');
    return this.readInstalments(invoiceId);
  }

  // ── Internals ──────────────────────────────────────────────────────

  /** The invoice, with what the ledger says about it, or 404. */
  private async assertInvoice(workspaceId: string, invoiceId: string) {
    const [row] = await this.prisma.$queryRawUnsafe<
      { number: number; status: string; total_paise: number; paid_paise: number }[]
    >(
      `SELECT i.number, i.status, i.total_paise,
              (SELECT COALESCE(sum(p.amount_paise), 0)::int
                 FROM public.practice_invoice_payments p
                WHERE p.invoice_id = i.id) AS paid_paise
         FROM public.practice_invoices i
        WHERE i.id = $1::uuid AND i.workspace_id = $2::uuid
        LIMIT 1`,
      invoiceId, workspaceId,
    );
    if (!row) throw new NotFoundException('Invoice not found.');
    return row;
  }

  /** The schedule with what has been paid against each instalment. */
  private async readInstalments(invoiceId: string): Promise<InstalmentRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<RawInstalment[]>(
      `SELECT s.id, s.invoice_id, s.seq, s.amount_paise, s.due_at,
              s.original_due_at, s.extended_count, s.note,
              (SELECT COALESCE(sum(p.amount_paise), 0)::int
                 FROM public.practice_invoice_payments p
                WHERE p.instalment_id = s.id) AS paid_paise
         FROM public.practice_invoice_instalments s
        WHERE s.invoice_id = $1::uuid
        ORDER BY s.seq`,
      invoiceId,
    );
    return rows.map(toInstalment);
  }
}

// ── Rows ─────────────────────────────────────────────────────────────

interface RawPayment {
  id: string;
  invoice_id: string;
  amount_paise: number;
  method: string | null;
  reference: string | null;
  note: string | null;
  received_at: Date;
  instalment_id: string | null;
  created_at: Date;
  recorded_by_name: string | null;
}

export interface PaymentRow extends Omit<RawPayment, 'received_at' | 'created_at'> {
  received_at: string;
  created_at: string;
}

function toPayment(r: RawPayment): PaymentRow {
  return {
    ...r,
    received_at: r.received_at.toISOString(),
    created_at: r.created_at.toISOString(),
  };
}

interface RawInstalment {
  id: string;
  invoice_id: string;
  seq: number;
  amount_paise: number;
  due_at: Date;
  original_due_at: Date | null;
  extended_count: number;
  note: string | null;
  paid_paise: number;
}

export interface InstalmentRow
  extends Omit<RawInstalment, 'due_at' | 'original_due_at'> {
  due_at: string;
  original_due_at: string | null;
  /** Still owed on this instalment alone. */
  balance_paise: number;
  /** Due date passed with money still owed. */
  overdue: boolean;
}

function toInstalment(r: RawInstalment): InstalmentRow {
  const balance = Math.max(0, r.amount_paise - Number(r.paid_paise ?? 0));
  return {
    ...r,
    paid_paise: Number(r.paid_paise ?? 0),
    due_at: r.due_at.toISOString(),
    original_due_at: r.original_due_at ? r.original_due_at.toISOString() : null,
    balance_paise: balance,
    overdue: balance > 0 && r.due_at.getTime() < Date.now(),
  };
}

/** INV-0007 from 7, matching the invoice service. */
function display(n: number): string {
  return `INV-${String(n).padStart(4, '0')}`;
}

/** For error messages the practice reads, not for display in the UI. */
function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
