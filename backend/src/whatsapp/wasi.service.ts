import { Injectable, Logger } from '@nestjs/common';

/**
 * Client for Wasi (wasi.sirahagents.com) — Sirah Digital's official WhatsApp
 * Business (Meta Cloud API) hub. NUSI's own messages go through it.
 *
 * Official WhatsApp only lets a business START a conversation with a template
 * Meta has approved, so every send here is a template send:
 *
 *   POST {WASI_API_URL}/api/v1/messages
 *   Authorization: Bearer {WASI_API_KEY}
 *   { client_id, to: "91XXXXXXXXXX", type: "template", template, params }
 *
 * `params` maps the template's NAMED placeholders ({{customer_name}}) to
 * values - Meta no longer accepts numbered {{1}} placeholders on new templates.
 * Env-gated: without URL + key + client id, `enabled` is false.
 */
@Injectable()
export class WasiService {
  private readonly logger = new Logger(WasiService.name);
  private readonly url = (process.env.WASI_API_URL || '').replace(/\/+$/, '');
  private readonly key = process.env.WASI_API_KEY;
  private readonly clientId = process.env.WASI_CLIENT_ID;

  get enabled(): boolean {
    return !!(this.url && this.key && this.clientId);
  }

  /** Send an approved template. Returns true only when Wasi accepted it. */
  async sendTemplate(to: string, template: string, params: Record<string, string>): Promise<boolean> {
    if (!this.enabled) return false;
    const number = toWasiNumber(to);
    if (!number) {
      this.logger.warn(`Wasi not sent (unparseable number): ${to}`);
      return false;
    }
    try {
      const res = await fetch(`${this.url}/api/v1/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: this.clientId, to: number, type: 'template', template, params }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        this.logger.warn(`Wasi send "${template}" failed ${res.status}: ${raw.slice(0, 200)}`);
      }
      return res.ok;
    } catch (err) {
      this.logger.warn(`Wasi send "${template}" failed: ${(err as Error).message}`);
      return false;
    }
  }
}

/** "+91 98765 43210" -> "919876543210" (Wasi wants digits with country code). */
function toWasiNumber(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');
  if (d.length === 10) d = `91${d}`;
  else if (d.length === 11 && d.startsWith('0')) d = `91${d.slice(1)}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
