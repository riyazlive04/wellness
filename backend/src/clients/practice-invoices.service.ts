import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import {
  computeTotals,
  invoiceNumber,
  normaliseLines,
  type InvoiceLine,
} from './practice-invoice';

/**
 * Invoices a practice issues to its own clients.
 *
 * NUSI never collects this money: the client pays the practice directly and
 * the practice marks the invoice paid. See the migration for why.
 *
 * Totals are always recomputed here from the lines, never taken from the
 * caller - a browser that sends its own total is a browser that can send any
 * total.
 */
@Injectable()
export class PracticeInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly COLS = `
    id, workspace_id, client_id, number, status, items,
    subtotal_paise, tax_percent::float AS tax_percent, tax_paise, total_paise,
    notes, issued_at, due_at, paid_at, paid_method, paid_note, created_at, updated_at`;

  /** Rows for the practice's own list, newest first. */
  async list(workspaceId: string, clientId?: string): Promise<InvoiceRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<RawRow[]>(
      `SELECT ${this.COLS},
              (SELECT name FROM public.clients c WHERE c.id = i.client_id) AS client_name
         FROM public.practice_invoices i
        WHERE i.workspace_id = $1::uuid
          AND ($2::uuid IS NULL OR i.client_id = $2::uuid)
        ORDER BY i.created_at DESC
        LIMIT 500`,
      workspaceId,
      clientId ?? null,
    );
    return rows.map(toRow);
  }

  /** One invoice the practice owns. */
  async get(workspaceId: string, id: string): Promise<InvoiceRow> {
    const [row] = await this.prisma.$queryRawUnsafe<RawRow[]>(
      `SELECT ${this.COLS},
              (SELECT name FROM public.clients c WHERE c.id = i.client_id) AS client_name
         FROM public.practice_invoices i
        WHERE i.id = $1::uuid AND i.workspace_id = $2::uuid LIMIT 1`,
      id,
      workspaceId,
    );
    if (!row) throw new NotFoundException('Invoice not found.');
    return toRow(row);
  }

  /**
   * Create a draft.
   *
   * The number comes from `max + 1` inside the insert, and the table's UNIQUE
   * (workspace_id, number) is what makes that safe: two nutritionists creating
   * at the same moment cannot both take 8 - the loser hits the constraint and
   * retries, rather than quietly duplicating a number on a tax document.
   */
  async create(
    workspaceId: string,
    clientId: string,
    userId: string,
    input: { items: unknown; tax_percent?: number; notes?: string; due_at?: string },
  ): Promise<InvoiceRow> {
    const lines = normaliseLines(input.items);
    const totals = computeTotals(lines, input.tax_percent ?? 0);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [row] = await this.prisma.$queryRawUnsafe<RawRow[]>(
          `INSERT INTO public.practice_invoices
             (workspace_id, client_id, number, status, items,
              subtotal_paise, tax_percent, tax_paise, total_paise,
              notes, due_at, created_by)
           VALUES (
             $1::uuid, $2::uuid,
             (SELECT COALESCE(MAX(number), 0) + 1
                FROM public.practice_invoices WHERE workspace_id = $1::uuid),
             'draft', $3::jsonb, $4, $5, $6, $7, $8, $9::timestamptz, $10::uuid
           )
           RETURNING ${this.COLS}, NULL::text AS client_name`,
          workspaceId,
          clientId,
          JSON.stringify(lines),
          totals.subtotal_paise,
          totals.tax_percent,
          totals.tax_paise,
          totals.total_paise,
          input.notes?.trim() || null,
          input.due_at || null,
          userId,
        );
        return toRow(row);
      } catch (err) {
        // 23505 = unique_violation: another create took this number first.
        if (!isUniqueViolation(err) || attempt === 4) throw err;
      }
    }
    throw new ConflictException('Could not allocate an invoice number. Please try again.');
  }

  /** Edit a draft. Anything issued is immutable - void it and start again. */
  async update(
    workspaceId: string,
    id: string,
    input: { items?: unknown; tax_percent?: number; notes?: string; due_at?: string },
  ): Promise<InvoiceRow> {
    const current = await this.get(workspaceId, id);
    if (current.status !== 'draft') {
      throw new BadRequestException(
        'This invoice has already been issued. Void it and create a new one instead.',
      );
    }

    const lines = input.items === undefined ? current.items : normaliseLines(input.items);
    const totals = computeTotals(
      lines,
      input.tax_percent ?? current.tax_percent,
    );

    const [row] = await this.prisma.$queryRawUnsafe<RawRow[]>(
      `UPDATE public.practice_invoices
          SET items = $3::jsonb,
              subtotal_paise = $4, tax_percent = $5, tax_paise = $6, total_paise = $7,
              notes = COALESCE($8, notes),
              due_at = COALESCE($9::timestamptz, due_at)
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        RETURNING ${this.COLS}, NULL::text AS client_name`,
      id,
      workspaceId,
      JSON.stringify(lines),
      totals.subtotal_paise,
      totals.tax_percent,
      totals.tax_paise,
      totals.total_paise,
      input.notes?.trim() ?? null,
      input.due_at ?? null,
    );
    return toRow(row);
  }

  /** Issue it: the client can see it from now on. */
  async send(workspaceId: string, id: string): Promise<InvoiceRow> {
    const current = await this.get(workspaceId, id);
    if (current.status !== 'draft') {
      throw new BadRequestException('Only a draft can be sent.');
    }
    if (current.total_paise <= 0) {
      throw new BadRequestException('This invoice adds up to nothing. Add a line with a price first.');
    }
    return this.setStatus(workspaceId, id, 'sent', { issued: true });
  }

  /**
   * The practice confirms the money arrived.
   *
   * Marking paid is a claim about the real world - NUSI saw no payment - so
   * the method and any reference are recorded alongside it.
   */
  async markPaid(
    workspaceId: string,
    id: string,
    input: { method?: string; note?: string; paid_at?: string },
  ): Promise<InvoiceRow> {
    const current = await this.get(workspaceId, id);
    if (current.status === 'void') throw new BadRequestException('This invoice was voided.');
    if (current.status === 'paid') return current; // idempotent: clicking twice is harmless

    const paidAt = input.paid_at ? new Date(input.paid_at) : new Date();
    if (Number.isNaN(paidAt.getTime())) throw new BadRequestException('That payment date is not valid.');
    if (paidAt.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException('A payment date cannot be in the future.');
    }

    const [row] = await this.prisma.$queryRawUnsafe<RawRow[]>(
      `UPDATE public.practice_invoices
          SET status = 'paid', paid_at = $3::timestamptz,
              paid_method = $4, paid_note = $5,
              -- A draft marked paid directly was still issued to the client.
              issued_at = COALESCE(issued_at, now())
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        RETURNING ${this.COLS}, NULL::text AS client_name`,
      id,
      workspaceId,
      paidAt.toISOString(),
      input.method?.trim() || null,
      input.note?.trim() || null,
    );
    return toRow(row);
  }

  /** Cancel it. Kept forever: a missing number leaves a hole in the sequence. */
  async void(workspaceId: string, id: string): Promise<InvoiceRow> {
    const current = await this.get(workspaceId, id);
    if (current.status === 'paid') {
      throw new BadRequestException(
        'A paid invoice cannot be voided. Record a refund outside NUSI if you need to reverse it.',
      );
    }
    return this.setStatus(workspaceId, id, 'void');
  }

  /** What the CLIENT sees: their own issued invoices, never a draft. */
  async listForClient(clientId: string): Promise<InvoiceRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<RawRow[]>(
      `SELECT ${this.COLS}, NULL::text AS client_name
         FROM public.practice_invoices i
        WHERE i.client_id = $1::uuid AND i.status <> 'draft'
        ORDER BY i.created_at DESC
        LIMIT 200`,
      clientId,
    );
    return rows.map(toRow);
  }

  /** One of the client's own invoices, drafts excluded. */
  async getForClient(clientId: string, id: string): Promise<InvoiceRow> {
    const [row] = await this.prisma.$queryRawUnsafe<RawRow[]>(
      `SELECT ${this.COLS}, NULL::text AS client_name
         FROM public.practice_invoices i
        WHERE i.id = $1::uuid AND i.client_id = $2::uuid AND i.status <> 'draft'
        LIMIT 1`,
      id,
      clientId,
    );
    if (!row) throw new NotFoundException('Invoice not found.');
    return toRow(row);
  }

  private async setStatus(
    workspaceId: string,
    id: string,
    status: 'sent' | 'void',
    opts: { issued?: boolean } = {},
  ): Promise<InvoiceRow> {
    const [row] = await this.prisma.$queryRawUnsafe<RawRow[]>(
      `UPDATE public.practice_invoices
          SET status = $3,
              issued_at = CASE WHEN $4::boolean THEN COALESCE(issued_at, now()) ELSE issued_at END
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        RETURNING ${this.COLS}, NULL::text AS client_name`,
      id,
      workspaceId,
      status,
      !!opts.issued,
    );
    return toRow(row);
  }
}

// ── row shapes ───────────────────────────────────────────────────────

interface RawRow {
  id: string;
  workspace_id: string;
  client_id: string;
  number: number;
  status: string;
  items: unknown;
  subtotal_paise: number;
  tax_percent: number;
  tax_paise: number;
  total_paise: number;
  notes: string | null;
  issued_at: Date | null;
  due_at: Date | null;
  paid_at: Date | null;
  paid_method: string | null;
  paid_note: string | null;
  created_at: Date;
  updated_at: Date;
  client_name: string | null;
}

export interface InvoiceRow extends Omit<RawRow, 'items' | 'issued_at' | 'due_at' | 'paid_at' | 'created_at' | 'updated_at'> {
  /** Display form, e.g. "INV-0007". */
  display_number: string;
  items: InvoiceLine[];
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

function toRow(r: RawRow): InvoiceRow {
  return {
    ...r,
    display_number: invoiceNumber(r.number),
    // Postgres hands jsonb back parsed; be defensive about a hand-edited row.
    items: Array.isArray(r.items) ? (r.items as InvoiceLine[]) : [],
    issued_at: r.issued_at ? r.issued_at.toISOString() : null,
    due_at: r.due_at ? r.due_at.toISOString() : null,
    paid_at: r.paid_at ? r.paid_at.toISOString() : null,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

/** Postgres unique_violation, however the driver wrapped it. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === '23505') return true;
  return /23505|unique constraint|duplicate key/i.test(String((err as Error)?.message ?? ''));
}
