import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { LeadMessengerService } from './lead-messenger.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadOtpService, type SendResult, type VerifyResult } from './lead-otp.service';
import { isForwardMove, isLeadStage, stageMessage } from './lead-stage-messages';
import { leadEmail, type LeadEmailKind } from './lead-emails';
import { GoogleCalendarService } from './google-calendar.service';
import { LeadInputCheckService, type InputVerdict } from './lead-input-check.service';
import { BREAK_MINUTES, HORIZON_DAYS, SLOT_MINUTES, clashes, formatSlotIST, isValidSlot, openSlots } from './call-slots';

/** The booking form asks for at least this many words on the call's purpose. */
const MIN_PURPOSE_WORDS = 10;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: LeadMessengerService,
    private readonly otp: LeadOtpService,
    private readonly mail: MailService,
    private readonly calendar: GoogleCalendarService,
    private readonly inputCheck: LeadInputCheckService,
  ) {}

  /** Is the "purpose of the call" a real reason? (Live check for the form.) */
  checkPurpose(purpose: string): Promise<InputVerdict> {
    return this.inputCheck.checkPurpose(purpose);
  }

  /** Is this a real person's name? (Live check for the popup and the form.) */
  checkName(name: string): Promise<InputVerdict> {
    return this.inputCheck.checkName(name);
  }

  /** Slots still free in the booking window, for the landing form. */
  async openCallSlots(): Promise<{ slots: string[] }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ slot_start: Date }>>(
      `SELECT slot_start FROM public.leads
        WHERE slot_start IS NOT NULL AND slot_start > now() - interval '1 day'`,
    );

    const now = new Date();
    const windowEnd = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60_000);
    // Also skip times already busy on the calendar itself - a meeting booked
    // by hand, not through NUSI. Best-effort: if this fails, we simply fall
    // back to only checking against other leads, same as before.
    const busyRaw = await this.calendar.freeBusy(now.toISOString(), windowEnd.toISOString()).catch(() => null);
    const busy = (busyRaw ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));

    return { slots: openSlots(rows.map((r) => new Date(r.slot_start)), now, busy) };
  }

  /**
   * Submit-time re-check: the slot the browser saw a minute ago may since have
   * been taken by another lead, or blocked by a meeting added to the calendar.
   */
  private async isSlotClear(slot: Date): Promise<boolean> {
    const pad = (SLOT_MINUTES + BREAK_MINUTES) * 60_000;
    const from = new Date(slot.getTime() - pad);
    const to = new Date(slot.getTime() + pad);
    const leads = await this.prisma.$queryRawUnsafe<Array<{ slot_start: Date }>>(
      `SELECT slot_start FROM public.leads WHERE slot_start > $1::timestamptz AND slot_start < $2::timestamptz`,
      from.toISOString(),
      to.toISOString(),
    );
    const busyRaw = await this.calendar.freeBusy(from.toISOString(), to.toISOString()).catch(() => null);
    const blocked = [
      ...(busyRaw ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
      ...leads.map((r) => {
        const start = new Date(r.slot_start);
        return { start, end: new Date(start.getTime() + SLOT_MINUTES * 60_000) };
      }),
    ];
    return !clashes(slot, blocked);
  }

  async createLead(
    dto: CreateLeadDto,
  ): Promise<{ ok: boolean; id: string; whatsapp_sent: boolean; email_sent: boolean; slot_start: string | null }> {
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const city = dto.city?.trim() || null;
    const practiceSize = dto.practice_size?.trim() || null;
    const phone = indianMobile(dto.phone);
    // A call is only booked for a number that THIS server has seen the right
    // WhatsApp code for - a browser can't just claim it.
    if (!this.otp.isVerified(phone)) {
      throw new BadRequestException('Please verify your number with the WhatsApp code first.');
    }
    const purpose = dto.purpose?.trim() ?? '';
    if (purpose.split(/\s+/).filter(Boolean).length < MIN_PURPOSE_WORDS) {
      throw new BadRequestException(`Please describe the purpose of the call in at least ${MIN_PURPOSE_WORDS} words.`);
    }
    const [nameVerdict, purposeVerdict] = await Promise.all([
      this.inputCheck.checkName(name),
      this.inputCheck.checkPurpose(purpose),
    ]);
    if (!nameVerdict.valid) throw new BadRequestException(nameVerdict.message ?? 'Please enter your real name.');
    if (!purposeVerdict.valid) {
      throw new BadRequestException(purposeVerdict.message ?? 'Please tell us the real reason for the call.');
    }
    if (!this.otp.isEmailVerified(email)) {
      throw new BadRequestException('Please verify your email with the code we sent first.');
    }
    // The call's purpose rides in `source` like the other extras - no migration.
    // The slot is re-checked here: a browser could send any time, and the one
    // it saw free a minute ago may have just been taken.
    const slot = dto.slot_start ? new Date(dto.slot_start) : null;
    // A time is required whenever one can be picked; booking without one is
    // only for when no slot is open (the team then calls back instead).
    if (!slot && (await this.openCallSlots()).slots.length > 0) {
      throw new BadRequestException('Please pick a date and time for your call.');
    }
    if (slot && !isValidSlot(slot)) {
      throw new BadRequestException('That call time is no longer available. Please pick another slot.');
    }
    if (slot && !(await this.isSlotClear(slot))) {
      throw new BadRequestException('That call time is no longer available. Please pick another slot.');
    }

    const source = {
      ...(dto.source || {}),
      phone_verified: true,
      email_verified: true,
      purpose,
    };

    // 1. Insert into public.leads
    let rows: Array<{ id: string }>;
    try {
      rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO public.leads (name, phone, email, city, practice_size, source, status, slot_start)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'new', $7::timestamptz)
         RETURNING id`,
        name,
        phone,
        email,
        city,
        practiceSize,
        JSON.stringify(source),
        slot ? slot.toISOString() : null,
      );
    } catch (err) {
      // The unique index on slot_start is what actually stops double bookings.
      if (String((err as Error).message).includes('leads_slot_start_key')) {
        throw new BadRequestException('Someone just booked that time. Please pick another slot.');
      }
      throw err;
    }

    const leadId = rows[0]?.id ?? 'unknown';
    const slotLine = slot ? formatSlotIST(slot) : null;

    // The call goes into NUSI's Google Calendar, with the lead invited.
    let meetUrl: string | null = null;
    if (slot) {
      const event = await this.calendar
        .createEvent({
          summary: `NUSI demo call - ${name}`,
          description: [
            `Lead: ${name}`,
            `Phone: ${phone}`,
            `Email: ${email}`,
            city ? `City: ${city}` : '',
            practiceSize ? `Practice size: ${practiceSize}` : '',
            purpose ? `\nPurpose of the call:\n${purpose}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          startIso: slot.toISOString(),
          endIso: new Date(slot.getTime() + SLOT_MINUTES * 60_000).toISOString(),
          attendeeEmail: email,
          attendeeName: name,
        })
        .catch(() => null);
      if (event) {
        meetUrl = event.meetUrl;
        // The Meet link rides in `source` like the other extras - no migration.
        await this.prisma
          .$executeRawUnsafe(
            `UPDATE public.leads
                SET calendar_event_id = $2,
                    source = coalesce(source, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('meet_url', $3::text))
              WHERE id = $1::uuid`,
            leadId,
            event.id,
            event.meetUrl,
          )
          .catch(() => undefined);
        this.logger.log(`Calendar event created for lead ${leadId}`);
      } else if (this.calendar.enabled) {
        this.logger.warn(`Calendar event NOT created for lead ${leadId}`);
      }
    }
    let whatsappSent = false;

    // 2. Confirmation to the lead, on WhatsApp and by email (same words).
    const leadText = [
      `Hi ${name}! 👋`,
      '',
      'Thank you for your interest in NUSI. We have received your request for a personalized demo.',
      '',
      slotLine
        ? `Your demo is booked for ${slotLine} (${SLOT_MINUTES} minutes). A practice specialist from our team will walk you through the platform and answer all your questions.`
        : 'A practice specialist from our team will connect with you within one working day to walk you through the platform and answer all your questions.',
      ...(slotLine && meetUrl ? ['', `Join on Google Meet at that time: ${meetUrl}`] : []),
      '',
      'If you have any questions right now, simply reply to this message — we are happy to help! 🌿',
      '',
      '- Team NUSI',
    ].join('\n');

    const [wa, emailSent] = await Promise.all([
      // The time + Meet link template once it's approved; until then the
      // name-only confirmation template, so a lead is never left unmessaged.
      this.messenger
        .send(
          slotLine && meetUrl && this.messenger.templateFor('lead_booked') ? 'lead_booked' : 'lead_confirmation',
          phone,
          { customer_name: name, call_time: slotLine ?? '', meet_link: meetUrl ?? '' },
          leadText,
        )
        .catch((err) => {
        this.logger.warn(`WhatsApp send to lead failed: ${(err as Error).message}`);
        return false;
      }),
      this.emailLead('lead_confirmation', email, leadText),
    ]);
    whatsappSent = wa;
    if (whatsappSent) this.logger.log(`WhatsApp confirmation sent to lead ${phone}`);
    else this.logger.warn(`Could not send WhatsApp confirmation to lead ${phone}`);

    return { ok: true, id: leadId, whatsapp_sent: whatsappSent, email_sent: emailSent, slot_start: slotLine };
  }

  /** Email copy of a lead message. Never throws - email is best-effort. */
  private async emailLead(kind: LeadEmailKind, to: string, text: string): Promise<boolean> {
    if (!to) return false;
    const { subject, html } = leadEmail(kind, text);
    const ok = await this.mail.send({ to, subject, html }).catch(() => false);
    if (ok) this.logger.log(`"${kind}" email sent to lead ${to}`);
    return ok;
  }

  /**
   * Move a lead to a new sales stage and, on a forward move, send that stage's
   * message on WhatsApp and by email - each once per stage per lead. Which
   * stages already went out is kept in source.whatsapp_sent / source.email_sent
   * (no migration needed).
   */
  async changeStage(
    id: string,
    status: string,
  ): Promise<{ status: string; whatsapp_sent: boolean; email_sent: boolean }> {
    if (!isLeadStage(status)) throw new BadRequestException('Unknown stage.');

    const [lead] = await this.prisma.$queryRawUnsafe<
      Array<{
        name: string;
        phone: string;
        email: string;
        status: string;
        source: Record<string, unknown> | null;
        slot_start: Date | null;
      }>
    >(`SELECT name, phone, email, status, source, slot_start FROM public.leads WHERE id = $1::uuid`, id);
    if (!lead) throw new NotFoundException('Lead not found.');

    await this.prisma.$executeRawUnsafe(`UPDATE public.leads SET status = $2 WHERE id = $1::uuid`, id, status);

    const waDone = (lead.source?.whatsapp_sent as Record<string, string> | undefined) ?? {};
    const emailDone = (lead.source?.email_sent as Record<string, string> | undefined) ?? {};
    const callTime = lead.slot_start ? formatSlotIST(new Date(lead.slot_start)) : null;
    const text = stageMessage(status, lead.name, { callTime });
    if (status === 'new' || !text || !isForwardMove(lead.status, status)) {
      return { status, whatsapp_sent: false, email_sent: false };
    }

    const [waOk, emailOk] = await Promise.all([
      waDone[status]
        ? Promise.resolve(false)
        : this.messenger
            .send(status, lead.phone, { customer_name: lead.name, call_time: callTime ?? 'your scheduled time' }, text)
            .catch(() => false),
      emailDone[status] ? Promise.resolve(false) : this.emailLead(status, lead.email, text),
    ]);

    if (waOk) {
      await this.markSent(id, 'whatsapp_sent', status);
      this.logger.log(`Stage "${status}" WhatsApp sent to lead ${lead.phone}`);
    } else if (!waDone[status]) {
      this.logger.warn(`Stage "${status}" WhatsApp NOT sent to lead ${lead.phone}`);
    }
    if (emailOk) await this.markSent(id, 'email_sent', status);
    return { status, whatsapp_sent: waOk, email_sent: emailOk };
  }

  /** Remember that this stage's message went out on this channel. */
  private async markSent(id: string, key: 'whatsapp_sent' | 'email_sent', status: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.leads
          SET source = jsonb_set(coalesce(source, '{}'::jsonb), ARRAY[$3::text],
                                 coalesce(source->$3, '{}'::jsonb) || jsonb_build_object($2::text, now()))
        WHERE id = $1::uuid`,
      id,
      status,
      key,
    );
  }

  /** Permanently remove a lead (test entries, spam, duplicates). */
  async deleteLead(id: string): Promise<{ deleted: true }> {
    // The slot itself needs no separate cleanup - it is simply "no lead holds
    // this timestamp", so removing the row frees it immediately. The Google
    // Calendar event is a separate object though, and is cancelled here so a
    // deleted lead doesn't leave a stale meeting on the calendar.
    const [lead] = await this.prisma.$queryRawUnsafe<Array<{ calendar_event_id: string | null }>>(
      `SELECT calendar_event_id FROM public.leads WHERE id = $1::uuid`,
      id,
    );
    if (!lead) throw new NotFoundException('Lead not found.');

    const n = await this.prisma.$executeRawUnsafe(`DELETE FROM public.leads WHERE id = $1::uuid`, id);
    if (!n) throw new NotFoundException('Lead not found.');

    if (lead.calendar_event_id) {
      const cancelled = await this.calendar.deleteEvent(lead.calendar_event_id).catch(() => false);
      this.logger.log(`Lead ${id} deleted${cancelled ? ' (calendar event cancelled)' : ' (calendar event NOT cancelled)'}`);
    } else {
      this.logger.log(`Lead ${id} deleted`);
    }
    return { deleted: true };
  }

  /** Send a WhatsApp verification code to this mobile. */
  sendOtp(rawPhone: string): Promise<SendResult> {
    return this.otp.send(indianMobile(rawPhone));
  }

  /** Check a verification code for this mobile. */
  verifyOtp(rawPhone: string, code: string): VerifyResult {
    return this.otp.verify(indianMobile(rawPhone), code);
  }

  /** Send an email verification code. */
  sendEmailOtp(rawEmail: string): Promise<SendResult> {
    return this.otp.sendEmail(leadEmailAddress(rawEmail));
  }

  /** Check an email verification code. */
  verifyEmailOtp(rawEmail: string, code: string): VerifyResult {
    return this.otp.verifyEmail(leadEmailAddress(rawEmail), code);
  }

}

/** Lower-cased and checked the same way the booking stores it, so codes match. */
function leadEmailAddress(raw: string): string {
  const email = (raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    throw new BadRequestException('Enter a valid email address.');
  }
  return email;
}

/**
 * Only a 10-digit Indian mobile is accepted, returned as +91XXXXXXXXXX. These
 * endpoints are public and one of them sends WhatsApp, so without this anyone
 * could use them to message or probe arbitrary numbers from NUSI's account.
 */
function indianMobile(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new BadRequestException('Enter a 10-digit Indian mobile number.');
  }
  return `+91${digits}`;
}
