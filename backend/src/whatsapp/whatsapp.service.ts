import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

/**
 * WhatsApp gateway client for **Evolution GO** (evoapicloud/evolution-go).
 *
 * ONE gateway is shared by the platform (EVOLUTION_API_URL / EVOLUTION_API_KEY
 * = the GLOBAL key); each workspace gets its OWN instance. Evolution GO uses
 * two auth scopes on the same `apikey` header:
 *   - ADMIN ops (create / delete / list): apikey = GLOBAL key
 *   - INSTANCE ops (connect / qr / status / send / logout): apikey = that
 *     instance's own token (returned by create).
 *
 * So callers pass the instance token for messaging, and we keep the GLOBAL key
 * for lifecycle. Env-gated: with URL+key unset, `enabled` is false and calls
 * no-op.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly url = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
  private readonly globalKey = process.env.EVOLUTION_API_KEY;

  get enabled(): boolean {
    return !!(this.url && this.globalKey);
  }

  // ── instance lifecycle (admin scope) ───────────────────────────────

  /**
   * Create an instance with a freshly-minted token (Evolution GO requires the
   * caller to supply it). Returns the instance id + token to persist.
   */
  async createInstance(name: string): Promise<{ id: string; token: string } | null> {
    const token = randomBytes(12).toString('hex');
    const res = await this.req('POST', '/instance/create', this.globalKey, { name, token });
    const d = (res.body as { data?: { id?: string; token?: string } })?.data;
    if (!res.ok || !d?.id || !d?.token) {
      this.logger.warn(`Evolution GO create failed ${res.status}: ${res.raw.slice(0, 160)}`);
      return null;
    }
    return { id: d.id, token: d.token };
  }

  /** Linked WhatsApp number for an instance id (from the admin list), or null. */
  async numberFor(id: string): Promise<string | null> {
    const res = await this.req('GET', '/instance/all', this.globalKey);
    const arr = (res.body as { data?: Array<{ id: string; jid?: string }> })?.data ?? [];
    const row = arr.find((r) => r.id === id);
    const jid = row?.jid || '';
    return jid ? jid.split('@')[0].split(':')[0] : null;
  }

  async deleteInstance(id: string): Promise<void> {
    await this.req('DELETE', `/instance/delete/${encodeURIComponent(id)}`, this.globalKey);
  }

  // ── instance session (instance-token scope) ────────────────────────

  /** Start the WhatsApp socket so a QR can be generated. */
  async startSession(token: string): Promise<void> {
    await this.req('POST', '/instance/connect', token, { immediate: true });
  }

  /** Current QR (base64 PNG data-URI + the raw code), while not yet linked. */
  async qr(token: string): Promise<{ base64: string | null; code: string | null }> {
    const res = await this.req('GET', '/instance/qr', token);
    const d = (res.body as { data?: { qrcode?: string; code?: string } })?.data;
    return { base64: d?.qrcode ?? null, code: d?.code ?? null };
  }

  /** `loggedIn` = a WhatsApp account is linked; `connected` = socket is up. */
  async status(token: string): Promise<{ connected: boolean; loggedIn: boolean }> {
    const res = await this.req('GET', '/instance/status', token);
    const d = (res.body as { data?: { Connected?: boolean; LoggedIn?: boolean } })?.data;
    return { connected: !!d?.Connected, loggedIn: !!d?.LoggedIn };
  }

  async logout(token: string): Promise<void> {
    await this.req('DELETE', '/instance/logout', token);
  }

  // ── messaging (instance-token scope) ───────────────────────────────

  /** Send a text through a workspace instance (auth = its token). Best-effort. */
  async sendText(opts: { token: string; to: string; text: string }): Promise<boolean> {
    if (!this.enabled) return false;
    const number = normalise(opts.to);
    if (!number) {
      this.logger.warn(`WhatsApp not sent (unparseable number): ${opts.to}`);
      return false;
    }
    const res = await this.req('POST', '/send/text', opts.token, { number, text: opts.text });
    if (!res.ok) this.logger.warn(`Evolution GO sendText ${res.status}: ${res.raw.slice(0, 160)}`);
    return res.ok;
  }

  // ── low-level ──────────────────────────────────────────────────────

  private async req(
    method: string,
    path: string,
    apikey: string | undefined,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; body: unknown; raw: string }> {
    if (!this.enabled) return { ok: false, status: 0, body: null, raw: 'evolution disabled' };
    try {
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers: { apikey: apikey ?? '', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const raw = await res.text().catch(() => '');
      let parsed: unknown = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* non-json */ }
      return { ok: res.ok, status: res.status, body: parsed, raw };
    } catch (err) {
      this.logger.warn(`Evolution GO ${method} ${path} failed: ${(err as Error).message}`);
      return { ok: false, status: 0, body: null, raw: (err as Error).message };
    }
  }
}

/**
 * Normalise a human number to digits (country code + number, no '+'/spaces).
 * Indian defaults: bare 10 digits → +91; leading 0 → 91.
 */
function normalise(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) d = `91${d}`;
  else if (d.length === 11 && d.startsWith('0')) d = `91${d.slice(1)}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
