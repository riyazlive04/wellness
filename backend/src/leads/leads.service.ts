import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async createLead(dto: CreateLeadDto): Promise<{ ok: boolean; id: string; whatsapp_sent: boolean }> {
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const city = dto.city?.trim() || null;
    const practiceSize = dto.practice_size?.trim() || null;
    const source = dto.source || {};

    // Only a 10-digit Indian mobile is accepted. This endpoint is public and
    // triggers a WhatsApp send, so without this check anyone could use it to
    // message arbitrary numbers from NUSI's account (and get it banned).
    let digits = dto.phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      throw new BadRequestException('Enter a 10-digit Indian mobile number.');
    }
    const phone = `+91${digits}`;

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
}
