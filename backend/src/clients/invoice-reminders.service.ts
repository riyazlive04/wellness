import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { skipScheduled } from '../common/schedulers';

/**
 * Reminding a client that money is due.
 *
 * Two reminders, which practices asked for by name: a week before the due
 * date, and again on the day. Chasing payment is the job nutritionists like
 * least and put off longest, so an invoice that reminds for itself is worth
 * more here than another report.
 *
 * Both go out over WhatsApp as well as the app, which notifyClient already
 * does for 'invoice:reminder' (see CLIENT_WHATSAPP_TYPES) - from the
 * practice's own linked number, and silently skipped for a practice that has
 * not linked one.
 *
 * Both run off a claim-by-UPDATE: the row is marked in the same statement that
 * selects it, so two overlapping runs cannot both send. The mark is cleared
 * when a due date moves (see the migration), so extending an instalment earns
 * a fresh pair of reminders rather than silence.
 *
 * Instalments are reminded individually; an invoice is reminded as a whole
 * only when it has no schedule, or the client would hear about the same money
 * twice.
 */
@Injectable()
export class InvoiceRemindersService {
  private readonly logger = new Logger(InvoiceRemindersService.name);

  /**
   * Days before the due date for the first nudge. A week, not five days: the
   * client needs a weekend and a salary date inside the window for the
   * reminder to be actionable rather than just early.
   */
  private static readonly LEAD_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Once a day at 09:00 IST.
   *
   * Not hourly: a payment reminder at 02:00 is a notification nobody thanks
   * you for, and the window is a day wide so one run a day cannot miss one.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'invoice-reminders',
    timeZone: 'Asia/Kolkata',
  })
  async run(): Promise<void> {
    if (skipScheduled(this.logger, 'invoiceReminders')) return;
    try {
      const n =
        (await this.remindInstalments('before')) +
        (await this.remindInstalments('due')) +
        (await this.remindInvoices('before')) +
        (await this.remindInvoices('due'));
      if (n) this.logger.log(`Sent ${n} invoice payment reminder(s).`);
    } catch (e) {
      this.logger.error(`Invoice reminders failed: ${(e as Error).message}`);
    }
  }

  /**
   * One instalment of a schedule.
   *
   * `balance` excludes instalments already settled: a client who paid part 2
   * early should not be chased for it on its due date.
   */
  private async remindInstalments(when: 'before' | 'due'): Promise<number> {
    const mark = when === 'before' ? 'reminded_before_at' : 'reminded_due_at';
    const window = when === 'before'
      // The week-ahead nudge: due inside the lead window but not yet today,
      // so this and the on-the-day reminder never fire for the same row twice.
      ? `s2.due_at::date > current_date
         AND s2.due_at::date <= current_date + ${InvoiceRemindersService.LEAD_DAYS}`
      // On the day, and anything that slipped past unreminded.
      : `s2.due_at::date <= current_date`;

    const due = await this.prisma.$queryRawUnsafe<InstalmentDue[]>(
      `UPDATE public.practice_invoice_instalments s
          SET ${mark} = now()
        WHERE s.id IN (
          SELECT s2.id
            FROM public.practice_invoice_instalments s2
            JOIN public.practice_invoices i ON i.id = s2.invoice_id
           WHERE s2.${mark} IS NULL
             AND i.status = 'sent'
             AND (${window})
             AND s2.amount_paise > (
                 SELECT COALESCE(sum(p.amount_paise), 0)
                   FROM public.practice_invoice_payments p
                  WHERE p.instalment_id = s2.id)
        )
      RETURNING s.id, s.invoice_id, s.seq, s.amount_paise, s.due_at,
                (SELECT COALESCE(sum(p.amount_paise), 0)::int
                   FROM public.practice_invoice_payments p
                  WHERE p.instalment_id = s.id) AS paid_paise,
                (SELECT client_id FROM public.practice_invoices WHERE id = s.invoice_id) AS client_id,
                (SELECT workspace_id FROM public.practice_invoices WHERE id = s.invoice_id) AS workspace_id,
                (SELECT number FROM public.practice_invoices WHERE id = s.invoice_id) AS number,
                (SELECT c.name FROM public.clients c
                   WHERE c.id = (SELECT client_id FROM public.practice_invoices
                                  WHERE id = s.invoice_id)) AS client_name`,
    );

    for (const r of due) {
      const owed = r.amount_paise - Number(r.paid_paise ?? 0);
      void this.notifications.notifyClient(r.workspace_id, r.client_id, {
        type: 'invoice:reminder',
        title: when === 'before'
          ? `Instalment ${r.seq} due in ${days(r.due_at)}`
          : `Instalment ${r.seq} is due today`,
        body: body(r.client_name, r.number, r.due_at, owed, Number(r.paid_paise ?? 0)),
        url: '/portal/invoices',
        // One tag per instalment per reminder, so the on-the-day message
        // replaces nothing and the week-ahead one is not re-shown.
        tag: `invoice-inst-${r.id}-${when}`,
      });
    }
    return due.length;
  }

  /** An invoice with a due date and no schedule of its own. */
  private async remindInvoices(when: 'before' | 'due'): Promise<number> {
    const mark = when === 'before' ? 'reminded_before_at' : 'reminded_due_at';
    const window = when === 'before'
      ? `i2.due_at::date > current_date
         AND i2.due_at::date <= current_date + ${InvoiceRemindersService.LEAD_DAYS}`
      : `i2.due_at::date <= current_date`;

    const due = await this.prisma.$queryRawUnsafe<InvoiceDue[]>(
      `UPDATE public.practice_invoices i
          SET ${mark} = now()
        WHERE i.id IN (
          SELECT i2.id
            FROM public.practice_invoices i2
           WHERE i2.${mark} IS NULL
             AND i2.status = 'sent'
             AND i2.due_at IS NOT NULL
             AND ${window}
             -- Scheduled invoices are chased per instalment instead.
             AND NOT EXISTS (SELECT 1 FROM public.practice_invoice_instalments s
                              WHERE s.invoice_id = i2.id)
             AND i2.total_paise > (
                 SELECT COALESCE(sum(p.amount_paise), 0)
                   FROM public.practice_invoice_payments p
                  WHERE p.invoice_id = i2.id)
        )
      RETURNING i.id, i.client_id, i.workspace_id, i.number, i.total_paise, i.due_at,
                (SELECT COALESCE(sum(p.amount_paise), 0)::int
                   FROM public.practice_invoice_payments p
                  WHERE p.invoice_id = i.id) AS paid_paise,
                (SELECT c.name FROM public.clients c WHERE c.id = i.client_id) AS client_name`,
    );

    for (const r of due) {
      const owed = r.total_paise - Number(r.paid_paise ?? 0);
      void this.notifications.notifyClient(r.workspace_id, r.client_id, {
        type: 'invoice:reminder',
        title: when === 'before'
          ? `Payment due in ${days(r.due_at)}`
          : 'Payment due today',
        body: body(r.client_name, r.number, r.due_at, owed, Number(r.paid_paise ?? 0)),
        url: '/portal/invoices',
        tag: `invoice-${r.id}-${when}`,
      });
    }
    return due.length;
  }
}

interface InstalmentDue {
  id: string;
  invoice_id: string;
  seq: number;
  amount_paise: number;
  paid_paise: number;
  due_at: Date;
  client_id: string;
  workspace_id: string;
  number: number;
  client_name: string | null;
}

interface InvoiceDue {
  id: string;
  client_id: string;
  workspace_id: string;
  number: number;
  total_paise: number;
  paid_paise: number;
  due_at: Date;
  client_name: string | null;
}

/**
 * What the client reads, in the app and on WhatsApp.
 *
 * Name, invoice number, due date and the exact balance, because the WhatsApp
 * copy arrives with no screen around it: a bare amount from an unexpected
 * number is the kind of message a client ignores or, worse, pays twice.
 *
 * A part-paid invoice is chased for the balance, not the total - being asked
 * again for money already handed over is how a practice looks like it is not
 * keeping track.
 */
function body(
  name: string | null,
  number: number,
  due: Date,
  owed: number,
  paid: number,
): string {
  const who = name?.trim() ? `${name.trim()}, ` : '';
  const part = paid > 0 ? ' still outstanding' : '';
  return `${who}${rupees(owed)}${part} on ${display(number)}, due ${onDate(due)}.`;
}

/** "14 Nov 2026" - the date a client would read off a bank app. */
function onDate(due: Date): string {
  return new Date(due).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

/** "5 days" / "tomorrow" - the reminder reads as a sentence either way. */
function days(due: Date): string {
  const d = Math.max(
    0,
    Math.round((new Date(due).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000),
  );
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `${d} days`;
}

function display(n: number): string {
  return `INV-${String(n).padStart(4, '0')}`;
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
