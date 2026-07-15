import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { computeGstInclusive, resolveGstPercent, type GstBreakdown } from './billing-tax';
import type { InvoiceRow } from './billing.types';

/**
 * InvoiceService — internal (non-Razorpay) invoice generation + workspace-facing
 * reads (Module 3 — Invoice Management + Tax Architecture).
 *
 * Razorpay issues its own tax invoices for *subscription* charges, and those
 * flow in through the webhook (`invoices` rows carry a `razorpay_invoice_id`).
 * But one-time **top-up** payments have no Razorpay invoice — so we generate our
 * own GST-compliant invoice for every captured payment that isn't already
 * covered by a Razorpay invoice. Generation is idempotent (keyed on payment_id).
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly gstPercent: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.gstPercent = resolveGstPercent(config.get<string>('BILLING_GST_PERCENT'));
  }

  // ──────────────────────────────────────────────────────────────────
  // Reads (workspace-scoped)
  // ──────────────────────────────────────────────────────────────────

  /** All invoices for a workspace, newest first. */
  async listForWorkspace(workspaceId: string): Promise<InvoiceRow[]> {
    return this.prisma.$queryRawUnsafe<InvoiceRow[]>(
      `SELECT * FROM public.invoices
        WHERE workspace_id = $1::uuid
        ORDER BY COALESCE(issued_at, created_at) DESC
        LIMIT 200`,
      workspaceId,
    );
  }

  /** One invoice (workspace-scoped) plus a derived GST breakdown for rendering / PDF. */
  async getForWorkspace(
    workspaceId: string,
    invoiceId: string,
  ): Promise<InvoiceRow & { gst: GstBreakdown; supplier: SupplierDetails }> {
    const [row] = await this.prisma.$queryRawUnsafe<InvoiceRow[]>(
      `SELECT * FROM public.invoices
        WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      invoiceId,
      workspaceId,
    );
    if (!row) throw new NotFoundException('Invoice not found.');

    const gross = Number(row.amount_paise);
    const gst = computeGstInclusive(gross, { ratePercent: this.gstPercent });
    return { ...row, gst, supplier: SUPPLIER };
  }

  // ──────────────────────────────────────────────────────────────────
  // Generation (called by the webhook on payment.captured)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Ensure a GST invoice exists for a captured payment. Idempotent: a second
   * call for the same payment is a no-op. Returns the invoice id, or null when
   * generation was skipped (payment not captured / a Razorpay invoice already
   * covers it / payment not found).
   */
  async ensureInvoiceForPayment(paymentId: string): Promise<string | null> {
    const [pay] = await this.prisma.$queryRawUnsafe<PaymentLite[]>(
      `SELECT id, workspace_id, subscription_id, razorpay_invoice_id,
              amount_paise, status, captured_at, email
         FROM public.payments WHERE id = $1::uuid LIMIT 1`,
      paymentId,
    );
    if (!pay) return null;
    if (pay.status !== 'captured') return null;
    // Razorpay already invoices subscription charges — don't double up.
    if (pay.razorpay_invoice_id) return null;

    // Idempotency guard: one internal invoice per payment.
    const [existing] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.invoices WHERE payment_id = $1::uuid LIMIT 1`,
      paymentId,
    );
    if (existing) return existing.id;

    const customer = await this.resolveCustomer(pay.workspace_id, pay.email);
    const gross = Number(pay.amount_paise);
    const gst = computeGstInclusive(gross, { ratePercent: this.gstPercent });
    const number = await this.nextInvoiceNumber();
    const paidAt = pay.captured_at ?? new Date();

    const [created] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.invoices (
         workspace_id, subscription_id, payment_id, invoice_number,
         amount_paise, gst_amount_paise, status, currency,
         issued_at, paid_at,
         customer_name, customer_email, customer_gstin, metadata
       ) VALUES (
         $1::uuid, $2, $3::uuid, $4,
         $5, $6, 'paid', 'INR',
         now(), $7,
         $8, $9, $10, $11::jsonb
       )
       RETURNING id`,
      pay.workspace_id,
      pay.subscription_id,
      paymentId,
      number,
      gross,
      gst.gstPaise,
      paidAt,
      customer.name,
      customer.email,
      customer.gstin,
      JSON.stringify({
        source: 'internal',
        gst: { ratePercent: gst.ratePercent, base_paise: gst.basePaise, cgst_paise: gst.cgstPaise, sgst_paise: gst.sgstPaise, igst_paise: gst.igstPaise },
      }),
    );

    this.logger.log(`Generated invoice ${number} for payment ${paymentId} (workspace=${pay.workspace_id})`);
    return created?.id ?? null;
  }

  // ──────────────────────────────────────────────────────────────────
  // internals
  // ──────────────────────────────────────────────────────────────────

  private async resolveCustomer(
    workspaceId: string,
    fallbackEmail: string | null,
  ): Promise<{ name: string | null; email: string | null; gstin: string | null }> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ name: string | null; gstin: string | null; owner_email: string | null }>
    >(
      `SELECT w.name, w.gstin, u.email AS owner_email
         FROM public.workspaces w
         LEFT JOIN auth.users u ON u.id = w.owner_id
        WHERE w.id = $1::uuid LIMIT 1`,
      workspaceId,
    );
    return {
      name: row?.name ?? null,
      email: row?.owner_email ?? fallbackEmail ?? null,
      gstin: row?.gstin ?? null,
    };
  }

  /**
   * Sequential invoice number, scoped per calendar month: SIRAH-YYYYMM-NNNN.
   * Computed from the count of invoices already numbered for the month. Good
   * enough at our volume; a true gapless sequence would need a dedicated table.
   */
  private async nextInvoiceNumber(): Promise<string> {
    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const prefix = `SIRAH-${ym}-`;
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) AS count FROM public.invoices WHERE invoice_number LIKE $1`,
      `${prefix}%`,
    );
    const seq = Number(row?.count ?? 0n) + 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }
}

interface PaymentLite {
  id: string;
  workspace_id: string;
  subscription_id: string | null;
  razorpay_invoice_id: string | null;
  amount_paise: number | bigint;
  status: string;
  captured_at: Date | null;
  email: string | null;
}

export interface SupplierDetails {
  legalName: string;
  addressLines: string[];
  gstin: string | null;
  state: string;
  email: string;
}

/** Supplier (us) details printed on the invoice. Overridable later via config. */
const SUPPLIER: SupplierDetails = {
  legalName: 'Sirah Digital',
  addressLines: ['SIRAH LIFE', 'Karnataka, India'],
  gstin: null,
  state: 'Karnataka',
  email: 'billing@sirahdigital.com',
};
