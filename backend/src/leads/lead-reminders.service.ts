import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { LeadMessengerService, type LeadMessageKind } from './lead-messenger.service';
import { formatSlotIST } from './call-slots';

/**
 * WhatsApp reminders before a booked demo call: one an hour before, one five
 * minutes before (10:00 and 10:55 for an 11:00 call), each with the Meet link.
 *
 * Runs every minute. A lead is claimed for a reminder by the same UPDATE that
 * records it as sent, so a reminder can't go twice even if two runs overlap.
 * A reminder whose template isn't configured yet is skipped without being
 * recorded, so it starts working the moment the template is approved.
 */

export interface Reminder {
  key: '1h' | '5m';
  kind: Extract<LeadMessageKind, 'reminder_1h' | 'reminder_5m'>;
  /** Sent once the call is this close... */
  minutesBefore: number;
  /** ...unless it is already closer than this (a late run skips a stale reminder). */
  lastChanceMinutes: number;
  text: (name: string, callTime: string, meetLink: string) => string;
}

export const REMINDERS: Reminder[] = [
  {
    key: '1h',
    kind: 'reminder_1h',
    minutesBefore: 60,
    lastChanceMinutes: 15,
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
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'lead-call-reminders' })
  async sendDue(): Promise<void> {
    for (const reminder of REMINDERS) {
      if (!this.messenger.templateFor(reminder.kind)) continue;
      await this.sendReminder(reminder).catch((err) =>
        this.logger.warn(`Reminder ${reminder.key} run failed: ${(err as Error).message}`),
      );
    }
  }

  async sendReminder(reminder: Reminder): Promise<number> {
    const due = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; name: string; phone: string; slot_start: Date; meet_url: string | null }>
    >(
      `UPDATE public.leads
          SET source = jsonb_set(
                coalesce(source, '{}'::jsonb), '{reminders}',
                coalesce(source->'reminders', '{}'::jsonb) || jsonb_build_object($1::text, now()))
        WHERE slot_start >  now() + make_interval(mins => $2::int)
          AND slot_start <= now() + make_interval(mins => $3::int)
          AND status IN ('new', 'contacted')
          AND (source->'reminders'->>$1::text) IS NULL
      RETURNING id, name, phone, slot_start, source->>'meet_url' AS meet_url`,
      reminder.key,
      reminder.lastChanceMinutes,
      reminder.minutesBefore,
    );

    for (const lead of due) {
      const callTime = formatSlotIST(new Date(lead.slot_start));
      const meetLink = lead.meet_url || NO_MEET_LINK;
      const sent = await this.messenger
        .send(
          reminder.kind,
          lead.phone,
          { customer_name: lead.name, call_time: callTime, meet_link: meetLink },
          reminder.text(lead.name, callTime, meetLink),
        )
        .catch(() => false);
      if (sent) this.logger.log(`Reminder ${reminder.key} sent to lead ${lead.id}`);
      else this.logger.warn(`Reminder ${reminder.key} NOT sent to lead ${lead.id}`);
    }
    return due.length;
  }
}
