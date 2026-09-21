import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadOtpService, type SendResult, type VerifyResult } from './lead-otp.service';

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
    // Verified only if THIS server saw the right code for this number - a
    // browser can't just claim it. Stored with the ad data, so no migration.
    const source = { ...(dto.source || {}), phone_verified: this.otp.isVerified(phone) };


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
