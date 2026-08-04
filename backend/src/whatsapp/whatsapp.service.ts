import { Injectable, Logger } from '@nestjs/common';

/**
 * WhatsApp gateway client (Evolution API v2). ONE Evolution server is shared by
 * the platform (EVOLUTION_API_URL / EVOLUTION_API_KEY); each workspace gets its
 * OWN Evolution "instance" (a linked WhatsApp number), so sends are per-instance.
 *
 * Env-gated: with URL+key unset, `enabled` is false and every call no-ops, so
 * dev/local never breaks.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly url = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY;

  get enabled(): boolean {
    return !!(this.url && this.apiKey);
  }

  // ── instance lifecycle (per-workspace onboarding) ──────────────────

  /**
   * Create an instance and return the QR to scan. If it already exists,
   * Evolution 403s — we fall back to `connect()` to fetch a fresh QR.
   */
  async createInstance(instance: string): Promise<{ base64: string | null; code: string | null }> {
    const res = await this.req('POST', '/instance/create', {
      instanceName: instance,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    });
    if (res.ok) {
      const q = (res.body as { qrcode?: { base64?: string; code?: string } }).qrcode;
      return { base64: q?.base64 ?? null, code: q?.code ?? null };
    }
    // Already exists (or transient) → try to (re)connect for a QR.
    return this.connect(instance);
  }

  /** Fetch a fresh QR for an existing, not-yet-linked instance. */
  async connect(instance: string): Promise<{ base64: string | null; code: string | null }> {
    const res = await this.req('GET', `/instance/connect/${encodeURIComponent(instance)}`);
    if (!res.ok) return { base64: null, code: null };
    const b = res.body as { base64?: string; code?: string; qrcode?: { base64?: string; code?: string } };
    return { base64: b.base64 ?? b.qrcode?.base64 ?? null, code: b.code ?? b.qrcode?.code ?? null };
  }

  /** 'open' (linked) | 'connecting' | 'close' | 'unknown'. */
  async state(instance: string): Promise<'open' | 'connecting' | 'close' | 'unknown'> {
    const res = await this.req('GET', `/instance/connectionState/${encodeURIComponent(instance)}`);
    if (!res.ok) return 'unknown';
    const s = (res.body as { instance?: { state?: string } }).instance?.state;
    return s === 'open' || s === 'connecting' || s === 'close' ? s : 'unknown';
  }

  /** Linked number + profile name, if the instance is connected. */
  async info(instance: string): Promise<{ number: string | null; profileName: string | null }> {
    const res = await this.req('GET', `/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`);
    if (!res.ok) return { number: null, profileName: null };
    const arr = Array.isArray(res.body) ? (res.body as Array<Record<string, unknown>>) : [];
    const row = arr[0];
    if (!row) return { number: null, profileName: null };
    const jid = (row.ownerJid as string) || '';
    return {
      number: (row.number as string) || (jid ? jid.split('@')[0] : null),
      profileName: (row.profileName as string) || null,
    };
  }

  async logout(instance: string): Promise<void> {
    await this.req('DELETE', `/instance/logout/${encodeURIComponent(instance)}`);
  }

  async deleteInstance(instance: string): Promise<void> {
    await this.req('DELETE', `/instance/delete/${encodeURIComponent(instance)}`);
  }

  // ── messaging ──────────────────────────────────────────────────────

  /** Send a text through a specific workspace instance. Best-effort. */
  async sendText(opts: { instance: string; to: string; text: string }): Promise<boolean> {
    if (!this.enabled) return false;
    const number = normalise(opts.to);
    if (!number) {
      this.logger.warn(`WhatsApp not sent (unparseable number): ${opts.to}`);
      return false;
    }
    const res = await this.req('POST', `/message/sendText/${encodeURIComponent(opts.instance)}`, {
      number,
      text: opts.text,
    });
    if (!res.ok) this.logger.warn(`Evolution sendText ${res.status}: ${res.raw.slice(0, 160)}`);
    return res.ok;
  }

  // ── low-level ──────────────────────────────────────────────────────

  private async req(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; body: unknown; raw: string }> {
    if (!this.enabled) return { ok: false, status: 0, body: null, raw: 'evolution disabled' };
    try {
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers: { apikey: this.apiKey as string, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const raw = await res.text().catch(() => '');
      let parsed: unknown = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* non-json */ }
      return { ok: res.ok, status: res.status, body: parsed, raw };
    } catch (err) {
      this.logger.warn(`Evolution ${method} ${path} failed: ${(err as Error).message}`);
      return { ok: false, status: 0, body: null, raw: (err as Error).message };
    }
  }
}

/**
 * Normalise a human number to Evolution's digits (country code + number, no
 * '+'/spaces). Indian defaults: bare 10 digits → +91; leading 0 → 91.
 */
function normalise(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) d = `91${d}`;
  else if (d.length === 11 && d.startsWith('0')) d = `91${d.slice(1)}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
