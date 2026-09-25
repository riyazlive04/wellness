import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { LeadMessengerService, type LeadMessageKind } from './lead-messenger.service';
import { leadEmail } from './lead-emails';
import { formatSlotIST } from './call-slots';

/**
 * Reminders before a booked demo call, each with the call time and Meet link:
 *   - 1 day before  (WhatsApp + email) - only for calls booked more than a day ahead
 *   - 1 hour before (WhatsApp + email)
 *   - 5 minutes before (WhatsApp)
 *
 * Runs every minute. A lead is claimed for a reminder by the same UPDATE that
 * records it as sent, so a reminder can't go twice even if two runs overlap.
 * WhatsApp goes only once the reminder's approved template is configured;
 * email needs no approval. A reminder with neither channel available is
 * skipped without being recorded, so it starts the moment one is.
 */

export type ReminderKey = '1d' | '1h' | '5m';

export interface Reminder {
  key: ReminderKey;
  kind: Extract<LeadMessageKind, 'reminder_1d' | 'reminder_1h' | 'reminder_5m'>;
  /** Sent once the call is this close... */
  minutesBefore: number;
  /** ...unless it is already closer than this (a late run skips a stale reminder). */
  lastChanceMinutes: number;
  /** Only for calls booked at least this long before they start (skips "tomorrow" for a same-day booking). */
  bookedAheadMinutes?: number;
  /** Also sent by email. */
  email: boolean;
  text: (name: string, callTime: string, meetLink: string) => string;
}

export const REMINDERS: Reminder[] = [
  {
    key: '1d',
    kind: 'reminder_1d',
    minutesBefore: 24 * 60,
    lastChanceMinutes: 3 * 60,
    bookedAheadMinutes: 24 * 60,
    email: true,
    text: (name, callTime, meetLink) =>
      [
        `Hi ${name},`,
        '',
        `This is a friendly reminder that your NUSI demo is tomorrow, ${callTime} (45 minutes).`,
        '',
        `Join on Google Meet at that time: ${meetLink}`,
        '',
        'If you need to change the time, reply to this message and our team will help.',
        '',
        '- Team NUSI',
      ].join('\n'),
  },
  {
    key: '1h',
    kind: 'reminder_1h',
    minutesBefore: 60,
    lastChanceMinutes: 15,
    email: true,
    text: (name, callTime, meetLink) =>
      [
        `Hi ${name},`,
        '',
        `This is a reminder that your NUSI demo starts in 1 hour, at ${callTime}.`,
        '',
        `Join on Google Meet: ${meetLink}`,
        '',
        'If you need to change the time, reply to this message.',
        '',
        '- Team NUSI',
      ].join('\n'),
  },
  {
    key: '5m',
    kind: 'reminder_5m',
    minutesBefore: 5,
    lastChanceMinutes: 0,
    email: false,
    text: (name, callTime, meetLink) =>
      [
        `Hi ${name},`,
        '',
        `Your NUSI demo is about to begin. It starts in 5 minutes, at ${callTime}.`,
        '',
        `Please join the call on Google Meet using this link: ${meetLink}`,
        '',
        'Our team is ready and waiting for you.',
        '',
        '- Team NUSI',
      ].join('\n'),
  },
];

/** Older bookings were made before the Meet link was saved on the lead. */
const NO_MEET_LINK = 'the Google Meet link in your calendar invite';

@Injectable()
export class LeadRemindersService {
  private readonly logger = new Logger(LeadRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: LeadMessengerService,
    private readonly mail: MailService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'lead-call-reminders' })
  async sendDue(): Promise<void> {
    for (const reminder of REMINDERS) {
      const whatsapp = !!this.messenger.templateFor(reminder.kind);
      if (!whatsapp && !reminder.email) continue;
      await this.sendReminder(reminder, whatsapp).catch((err) =>
        this.logger.warn(`Reminder ${reminder.key} run failed: ${(err as Error).message}`),
      );
    }
  }

  async sendReminder(reminder: Reminder, whatsapp: boolean): Promise<number> {
    const due = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; name: string; phone: string; email: string | null; slot_start: Date; meet_url: string | null }>
    >(
      `UPDATE public.leads
          SET source = jsonb_set(
                coalesce(source, '{}'::jsonb), '{reminders}',
                coalesce(source->'reminders', '{}'::jsonb) || jsonb_build_object($1::text, now()))
        WHERE slot_start >  now() + make_interval(mins => $2::int)
          AND slot_start <= now() + make_interval(mins => $3::int)
          AND ($4::int IS NULL OR created_at <= slot_start - make_interval(mins => $4::int))
          AND status IN ('new', 'contacted')
          AND (source->'reminders'->>$1::text) IS NULL
      RETURNING id, name, phone, email, slot_start, source->>'meet_url' AS meet_url`,
      reminder.key,
      reminder.lastChanceMinutes,
      reminder.minutesBefore,
      reminder.bookedAheadMinutes ?? null,
    );

    for (const lead of due) {
      const callTime = formatSlotIST(new Date(lead.slot_start));
      const meetLink = lead.meet_url || NO_MEET_LINK;
      const text = reminder.text(lead.name, callTime, meetLink);
      const [waSent, emailSent] = await Promise.all([
        whatsapp
          ? this.messenger
              .send(reminder.kind, lead.phone, { customer_name: lead.name, call_time: callTime, meet_link: meetLink }, text)
              .catch(() => false)
          : Promise.resolve(false),
        reminder.email && lead.email
          ? this.mail.send({ to: lead.email, ...leadEmail(reminder.kind, text) }).catch(() => false)
          : Promise.resolve(false),
      ]);
      const channels = [waSent && 'WhatsApp', emailSent && 'email'].filter(Boolean).join(' + ');
      if (channels) this.logger.log(`Reminder ${reminder.key} sent to lead ${lead.id} (${channels})`);
      else this.logger.warn(`Reminder ${reminder.key} NOT sent to lead ${lead.id}`);
    }
    return due.length;
  }
}
