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

export type LeadMessageKind =
  | 'otp'
  | 'lead_confirmation'
  | 'lead_booked'
  | 'contacted'
  | 'no_show'
  | 'demo_done'
  | 'nurturing'
  | 'won'
  | 'lost'
  | 'reminder_1d'
  | 'reminder_1h'
  | 'reminder_5m';

/** Env var holding each message's Wasi template name. */
const TEMPLATE_ENV: Record<LeadMessageKind, string> = {
  otp: 'WASI_TEMPLATE_OTP',
  lead_confirmation: 'WASI_TEMPLATE_LEAD_CONFIRMATION',
  lead_booked: 'WASI_TEMPLATE_LEAD_BOOKED',
  contacted: 'WASI_TEMPLATE_STAGE_CONTACTED',
  no_show: 'WASI_TEMPLATE_STAGE_NO_SHOW',
  demo_done: 'WASI_TEMPLATE_STAGE_DEMO_DONE',
  nurturing: 'WASI_TEMPLATE_STAGE_NURTURING',
  won: 'WASI_TEMPLATE_STAGE_WON',
  lost: 'WASI_TEMPLATE_STAGE_LOST',
  reminder_1d: 'WASI_TEMPLATE_REMINDER_1D',
  reminder_1h: 'WASI_TEMPLATE_REMINDER_1H',
  reminder_5m: 'WASI_TEMPLATE_REMINDER_5M',
};

/** Variables of the templates written for the booked, missed and reminder messages. */
const DEFAULT_VARS: Partial<Record<LeadMessageKind, string[]>> = {
  lead_booked: ['customer_name', 'call_time', 'meet_link'],
  no_show: ['customer_name', 'call_time'],
  reminder_1d: ['customer_name', 'call_time', 'meet_link'],
  reminder_1h: ['customer_name', 'call_time', 'meet_link'],
  reminder_5m: ['customer_name', 'call_time', 'meet_link'],
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
    const picked = this.templateVars(kind, params);
    const rename = process.env[`${TEMPLATE_ENV[kind]}_PARAM`]?.trim();
    const values = Object.values(picked);
    return rename && values.length === 1 ? { [rename]: values[0] } : picked;
  }

  /**
   * Only the placeholders the approved template actually has. Templates are
   * approved by Meta with a fixed set of variables, so sending an extra one
   * (e.g. meet_link to a template that only has customer_name) gets the
   * message rejected. <TEMPLATE_ENV>_VARS lists them, comma-separated
   * (WASI_TEMPLATE_LEAD_CONFIRMATION_VARS=customer_name,call_time,meet_link);
   * unset, a template gets just customer_name - what every template
   * approved so far uses - except the templates written for these messages,
   * which default to their own variables (DEFAULT_VARS).
   */
  private templateVars(kind: LeadMessageKind, params: Record<string, string>): Record<string, string> {
    const listed = process.env[`${TEMPLATE_ENV[kind]}_VARS`]?.split(',').map((v) => v.trim()).filter(Boolean);
    const keys = listed?.length
      ? listed
      : DEFAULT_VARS[kind] ?? ('customer_name' in params ? ['customer_name'] : Object.keys(params));
    return Object.fromEntries(keys.map((k) => [k, params[k] ?? '']));
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
