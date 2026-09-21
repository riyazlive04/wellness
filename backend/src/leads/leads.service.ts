import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadOtpService, type SendResult, type VerifyResult } from './lead-otp.service';
import { isForwardMove, isLeadStage, stageMessage } from './lead-stage-messages';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly otp: LeadOtpService,
  ) {}

  async createLead(dto: CreateLeadDto): Promise<{ ok: boolean; id: string; whatsapp_sent: boolean }> {
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
    const source = { ...(dto.source || {}), phone_verified: true };


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

    // 2. WhatsApp confirmation to the lead — the only message this form sends.
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

    try {
      if (this.whatsapp.enabled) {
        const ok = await this.whatsapp.sendPlatformText({ to: phone, text: leadText });
        whatsappSent = ok;
        if (ok) {
          this.logger.log(`WhatsApp confirmation sent to lead ${phone}`);
        } else {
          this.logger.warn(`Could not send WhatsApp confirmation to lead ${phone}`);
        }
      } else {
        this.logger.log('Evolution Go WhatsApp gateway not enabled (EVOLUTION_API_URL / EVOLUTION_API_KEY unset).');
      }
    } catch (err) {
      this.logger.warn(`WhatsApp send to lead failed: ${(err as Error).message}`);
    }

    return { ok: true, id: leadId, whatsapp_sent: whatsappSent };
  }

  /**
   * Move a lead to a new sales stage and, on a forward move, send that stage's
   * WhatsApp message - once per stage per lead. Which stages already had their
   * message is kept in source.whatsapp_sent (no migration needed).
   */
  async changeStage(id: string, status: string): Promise<{ status: string; whatsapp_sent: boolean }> {
    if (!isLeadStage(status)) throw new BadRequestException('Unknown stage.');

    const [lead] = await this.prisma.$queryRawUnsafe<
      Array<{ name: string; phone: string; status: string; source: Record<string, unknown> | null }>
    >(`SELECT name, phone, status, source FROM public.leads WHERE id = $1::uuid`, id);
    if (!lead) throw new NotFoundException('Lead not found.');

    await this.prisma.$executeRawUnsafe(`UPDATE public.leads SET status = $2 WHERE id = $1::uuid`, id, status);

    const already = (lead.source?.whatsapp_sent as Record<string, string> | undefined) ?? {};
    const text = stageMessage(status, lead.name);
    if (!text || already[status] || !isForwardMove(lead.status, status)) {
      return { status, whatsapp_sent: false };
    }

    const ok = await this.whatsapp.sendPlatformText({ to: lead.phone, text }).catch(() => false);
    if (ok) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE public.leads
            SET source = jsonb_set(coalesce(source, '{}'::jsonb), '{whatsapp_sent}',
                                   coalesce(source->'whatsapp_sent', '{}'::jsonb) || jsonb_build_object($2::text, now()))
          WHERE id = $1::uuid`,
        id,
        status,
      );
      this.logger.log(`Stage "${status}" WhatsApp sent to lead ${lead.phone}`);
    } else {
      this.logger.warn(`Stage "${status}" WhatsApp NOT sent to lead ${lead.phone}`);
    }
    return { status, whatsapp_sent: ok };
  }

  /** Send a WhatsApp verification code to this mobile. */
  sendOtp(rawPhone: string): Promise<SendResult> {
    return this.otp.send(indianMobile(rawPhone));
  }

  /** Check a verification code for this mobile. */
  verifyOtp(rawPhone: string, code: string): VerifyResult {
    return this.otp.verify(indianMobile(rawPhone), code);
  }

  /** Is this mobile on WhatsApp? `null` = can't tell (e.g. NUSI not linked). */
  async checkWhatsapp(rawPhone: string): Promise<{ onWhatsapp: boolean | null }> {
    const phone = indianMobile(rawPhone);
    return { onWhatsapp: await this.whatsapp.isOnWhatsapp(phone) };
  }
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
