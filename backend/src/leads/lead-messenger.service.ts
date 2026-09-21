import { Injectable, Logger } from '@nestjs/common';
import { WasiService } from '../whatsapp/wasi.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

/**
 * Sends NUSI's own WhatsApp messages to landing-page leads.
 *
 * Each message goes through Wasi (official WhatsApp) once its approved template
 * is named in env; until then it falls back to the NUSI Evolution number with
 * the same wording. That makes the switch-over gradual: a template waiting on
 * Meta approval - or a Wasi hiccup - never stops a lead getting their code,
 * and so never stops them booking.
 */

export type LeadMessageKind = 'otp' | 'lead_confirmation' | 'contacted' | 'demo_done' | 'won' | 'lost';

/** Env var holding each message's Wasi template name. */
const TEMPLATE_ENV: Record<LeadMessageKind, string> = {
  otp: 'WASI_TEMPLATE_OTP',
  lead_confirmation: 'WASI_TEMPLATE_LEAD_CONFIRMATION',
  contacted: 'WASI_TEMPLATE_STAGE_CONTACTED',
  demo_done: 'WASI_TEMPLATE_STAGE_DEMO_DONE',
  won: 'WASI_TEMPLATE_STAGE_WON',
  lost: 'WASI_TEMPLATE_STAGE_LOST',
};

@Injectable()
export class LeadMessengerService {
  private readonly logger = new Logger(LeadMessengerService.name);

  constructor(
    private readonly wasi: WasiService,
    private readonly evolution: WhatsappService,
  ) {}

  /** Wasi template configured for this message, if any. */
  templateFor(kind: LeadMessageKind): string | null {
    return process.env[TEMPLATE_ENV[kind]]?.trim() || null;
  }

  /**
   * A template whose single placeholder has a different name - e.g. an
   * Authentication template using the numbered {{1}} - is mapped with
   * <TEMPLATE_ENV>_PARAM (WASI_TEMPLATE_OTP_PARAM=1 sends { "1": code }).
   */
  private paramsFor(kind: LeadMessageKind, params: Record<string, string>): Record<string, string> {
    const rename = process.env[`${TEMPLATE_ENV[kind]}_PARAM`]?.trim();
    const values = Object.values(params);
    return rename && values.length === 1 ? { [rename]: values[0] } : params;
  }

  /**
   * @param params  the template's named placeholders, e.g. { customer_name }
   * @param fallbackText  the same message as plain text, for the Evolution path
   */
  async send(
    kind: LeadMessageKind,
    to: string,
    params: Record<string, string>,
    fallbackText: string,
  ): Promise<boolean> {
    const template = this.templateFor(kind);
    if (template && this.wasi.enabled) {
      if (await this.wasi.sendTemplate(to, template, this.paramsFor(kind, params))) return true;
      this.logger.warn(`Wasi "${kind}" failed for ${to}; falling back to Evolution`);
    }
    return this.evolution.sendPlatformText({ to, text: fallbackText });
  }
}
