import { Injectable, Logger } from '@nestjs/common';

/**
 * Minimal WhatsApp sender backed by an Evolution API instance (no SDK — just
 * fetch). Env-gated: if any of EVOLUTION_API_URL / EVOLUTION_API_KEY /
 * EVOLUTION_INSTANCE_NAME is unset it logs and no-ops, so callers never break
 * when WhatsApp isn't configured (e.g. local dev).
 *
 * Evolution v2 send-text contract:
 *   POST {url}/message/sendText/{instance}
 *   headers: { apikey: <key>, 'Content-Type': 'application/json' }
 *   body:    { number: <digits>, text: <string> }
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly url = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY;
  private readonly instance = process.env.EVOLUTION_INSTANCE_NAME;

  get enabled(): boolean {
    return !!(this.url && this.apiKey && this.instance);
  }

  /**
   * Normalise a human-entered phone into the digits Evolution expects (country
   * code + number, no '+', spaces, or punctuation). Indian defaults: a bare
   * 10-digit number gets a 91 prefix; a leading 0 is swapped for 91. Returns
   * null if there aren't enough digits to be a real number.
   */
  private normalise(raw: string): string | null {
    let d = (raw || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.length === 10) d = `91${d}`;
    else if (d.length === 11 && d.startsWith('0')) d = `91${d.slice(1)}`;
    return d.length >= 11 && d.length <= 15 ? d : null;
  }

  async sendText(opts: { to: string; text: string }): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn(`WhatsApp not sent (Evolution not configured): → ${opts.to}`);
      return false;
    }
    const number = this.normalise(opts.to);
    if (!number) {
      this.logger.warn(`WhatsApp not sent (unparseable number): ${opts.to}`);
      return false;
    }
    try {
      const res = await fetch(`${this.url}/message/sendText/${this.instance}`, {
        method: 'POST',
        headers: { apikey: this.apiKey as string, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, text: opts.text }),
      });
      if (!res.ok) {
        this.logger.warn(`Evolution ${res.status}: ${await res.text().catch(() => '')}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`WhatsApp send failed: ${(err as Error).message}`);
      return false;
    }
  }
}
