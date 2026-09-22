import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { LeadMessengerService } from './lead-messenger.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadOtpService, type SendResult, type VerifyResult } from './lead-otp.service';
import { isForwardMove, isLeadStage, stageMessage } from './lead-stage-messages';
import { leadEmail, type LeadEmailKind } from './lead-emails';

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
  ) {}

  async createLead(
    dto: CreateLeadDto,
  ): Promise<{ ok: boolean; id: string; whatsapp_sent: boolean; email_sent: boolean }> {
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
    if (!this.otp.isEmailVerified(email)) {
      throw new BadRequestException('Please verify your email with the code we sent first.');
    }
    // The call's purpose rides in `source` like the other extras - no migration.
    const source = {
      ...(dto.source || {}),
      phone_verified: true,
      email_verified: true,
      purpose,
    };

    // 1. Insert into public.leads
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.leads (name, phone, email, city, practice_size, source, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'new')
       RETURNING id`,
      name,
      phone,
      email,
      city,
      practiceSize,
      JSON.stringify(source),
    );

    const leadId = rows[0]?.id ?? 'unknown';
    let whatsappSent = false;

    // 2. Confirmation to the lead, on WhatsApp and by email (same words).
    const leadText = [
      `Hi ${name}! 👋`,
      '',
      'Thank you for your interest in NUSI. We have received your request for a personalized demo.',
      '',
      'A practice specialist from our team will connect with you within one working day to walk you through the platform and answer all your questions.',
      '',
      'If you have any questions right now, simply reply to this message — we are happy to help! 🌿',
      '',
      '- Team NUSI',
    ].join('\n');

    const [wa, emailSent] = await Promise.all([
      this.messenger.send('lead_confirmation', phone, { customer_name: name }, leadText).catch((err) => {
        this.logger.warn(`WhatsApp send to lead failed: ${(err as Error).message}`);
        return false;
      }),
      this.emailLead('lead_confirmation', email, leadText),
    ]);
    whatsappSent = wa;
    if (whatsappSent) this.logger.log(`WhatsApp confirmation sent to lead ${phone}`);
    else this.logger.warn(`Could not send WhatsApp confirmation to lead ${phone}`);

    return { ok: true, id: leadId, whatsapp_sent: whatsappSent, email_sent: emailSent };
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
      Array<{ name: string; phone: string; email: string; status: string; source: Record<string, unknown> | null }>
    >(`SELECT name, phone, email, status, source FROM public.leads WHERE id = $1::uuid`, id);
    if (!lead) throw new NotFoundException('Lead not found.');

    await this.prisma.$executeRawUnsafe(`UPDATE public.leads SET status = $2 WHERE id = $1::uuid`, id, status);

    const waDone = (lead.source?.whatsapp_sent as Record<string, string> | undefined) ?? {};
    const emailDone = (lead.source?.email_sent as Record<string, string> | undefined) ?? {};
    const text = stageMessage(status, lead.name);
    if (status === 'new' || !text || !isForwardMove(lead.status, status)) {
      return { status, whatsapp_sent: false, email_sent: false };
    }

    const [waOk, emailOk] = await Promise.all([
      waDone[status]
        ? Promise.resolve(false)
        : this.messenger.send(status, lead.phone, { customer_name: lead.name }, text).catch(() => false),
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
    const n = await this.prisma.$executeRawUnsafe(`DELETE FROM public.leads WHERE id = $1::uuid`, id);
    if (!n) throw new NotFoundException('Lead not found.');
    this.logger.log(`Lead ${id} deleted`);
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
