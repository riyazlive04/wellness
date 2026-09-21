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
    const res = await this.req('GET', '/instance/status', token, undefined, 4_000);
    const d = (res.body as { data?: { Connected?: boolean; LoggedIn?: boolean } })?.data;
    return { connected: !!d?.Connected, loggedIn: !!d?.LoggedIn };
  }

  async logout(token: string): Promise<void> {
    await this.req('DELETE', '/instance/logout', token);
  }

  // ── messaging (instance-token scope) ───────────────────────────────

  /** Send a text through an instance (auth = its token). Best-effort. */
  async sendText(opts: { token: string; to: string; text: string }): Promise<boolean> {
    if (!this.enabled) return false;
    const number = normalise(opts.to);
    if (!number) {
      this.logger.warn(`WhatsApp not sent (unparseable number): ${opts.to}`);
      return false;
    }
    // 8s: long enough for a linked phone, short enough that an unlinked one
    // doesn't keep a lead's form submit hanging.
    let res = await this.req('POST', '/send/text', opts.token, { number, text: opts.text }, 8_000);
    // If Evolution Go uses /message/sendText or returns 404 on /send/text:
    if (!res.ok && res.status === 404) {
      const instance = process.env.EVOLUTION_INSTANCE_NAME;
      const fallbackPath = instance ? `/message/sendText/${encodeURIComponent(instance)}` : '/message/sendText';
      res = await this.req('POST', fallbackPath, opts.token, { number, text: opts.text }, 8_000);
    }
    if (!res.ok) this.logger.warn(`Evolution GO sendText ${res.status}: ${res.raw.slice(0, 160)}`);
    return res.ok;
  }

  // ── platform instance (NUSI's own number) ──────────────────────────
  //
  // The gateway is shared: every workspace — and other Sirah Digital clients —
  // has its own instance on it. NUSI's own messages (landing-page lead
  // confirmations) must therefore go ONLY through the instance named in env,
  // never "whichever instance is connected": guessing once sent NUSI's message
  // from an unrelated business's WhatsApp.

  /** Last known "is NUSI's phone linked?" answer, reused for a minute. */
  private platformLinked: { value: boolean; at: number } | null = null;

  /**
   * Whether NUSI's phone is linked, cached for 60s. An unlinked instance makes
   * every send and check hang until its timeout, so callers skip it up front.
   */
  private async platformReady(): Promise<boolean> {
    const platform = this.platformInstance;
    if (!this.enabled || !platform) return false;
    if (this.platformLinked && Date.now() - this.platformLinked.at < 60_000) return this.platformLinked.value;
    const { loggedIn } = await this.status(platform.token).catch(() => ({ loggedIn: false }));
    this.platformLinked = { value: loggedIn, at: Date.now() };
    return loggedIn;
  }

  /** NUSI's own instance, from EVOLUTION_INSTANCE_NAME / _TOKEN. */
  get platformInstance(): { name: string; token: string } | null {
    const name = process.env.EVOLUTION_INSTANCE_NAME;
    const token = process.env.EVOLUTION_INSTANCE_TOKEN;
    return name && token ? { name, token } : null;
  }

  /**
   * Send through NUSI's own instance. Returns false (and sends nothing) when
   * that instance isn't configured or isn't linked to a phone yet.
   */
  async sendPlatformText(opts: { to: string; text: string }): Promise<boolean> {
    if (!this.enabled) return false;
    const platform = this.platformInstance;
    if (!platform) {
      this.logger.warn('WhatsApp platform send skipped: EVOLUTION_INSTANCE_NAME / _TOKEN not set.');
      return false;
    }
    if (!(await this.platformReady())) {
      this.logger.warn('WhatsApp platform send skipped: NUSI phone not linked yet.');
      return false;
    }
    return this.sendText({ token: platform.token, to: opts.to, text: opts.text });
  }

  /**
   * Does this number have a WhatsApp account? Asked through NUSI's own
   * instance, so it only works once that phone is linked. `null` means "can't
   * tell right now" (not linked, gateway slow, odd reply) - callers must treat
   * that as unknown, never as "not on WhatsApp".
   */
  async isOnWhatsapp(phone: string): Promise<boolean | null> {
    const platform = this.platformInstance;
    const number = normalise(phone);
    if (!this.enabled || !platform || !number) return null;
    if (!(await this.platformReady())) return null;
    const res = await this.req('POST', '/user/check', platform.token, { number: [number] }, 5_000);
    if (!res.ok) return null;
    return findIsOnWhatsapp(res.body);
  }

  /** Link state of NUSI's own instance, for the admin "Link WhatsApp" card. */
  async platformStatus(): Promise<{
    configured: boolean;
    name: string | null;
    connected: boolean;
    loggedIn: boolean;
    number: string | null;
  }> {
    const platform = this.platformInstance;
    if (!this.enabled || !platform) {
      return { configured: false, name: platform?.name ?? null, connected: false, loggedIn: false, number: null };
    }
    const status = await this.status(platform.token).catch(() => ({ connected: false, loggedIn: false }));
    const list = await this.req('GET', '/instance/all', this.globalKey).catch(() => null);
    const arr = (list?.body as { data?: Array<{ name: string; jid?: string }> })?.data ?? [];
    const jid = arr.find((i) => i.name === platform.name)?.jid || '';
    return {
      configured: true,
      name: platform.name,
      connected: status.connected,
      loggedIn: status.loggedIn,
      number: jid ? jid.split('@')[0].split(':')[0] : null,
    };
  }

  /** Start NUSI's session and return a fresh QR to scan (null once linked). */
  async platformQr(): Promise<{ base64: string | null }> {
    const platform = this.platformInstance;
    if (!this.enabled || !platform) return { base64: null };
    await this.startSession(platform.token).catch(() => undefined);
    // The gateway needs a moment after connect before the first QR exists.
    for (let i = 0; i < 6; i++) {
      const { base64 } = await this.qr(platform.token).catch(() => ({ base64: null }));
      if (base64) return { base64 };
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { base64: null };
  }

  // ── low-level ──────────────────────────────────────────────────────

  /**
   * Every call is bounded. Evolution GO doesn't fail fast for an instance whose
   * phone isn't linked — it simply never answers — and an unbounded fetch then
   * holds the caller's HTTP request open until nginx gives up (a landing-page
   * visitor watching a spinner for two minutes).
   */
  private async req(
    method: string,
    path: string,
    apikey: string | undefined,
    body?: unknown,
    timeoutMs = 10_000,
  ): Promise<{ ok: boolean; status: number; body: unknown; raw: string }> {
    if (!this.enabled) return { ok: false, status: 0, body: null, raw: 'evolution disabled' };
    try {
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers: { apikey: apikey ?? '', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
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
/**
 * Pull the "is on WhatsApp" flag out of a /user/check reply. Evolution GO has
 * shipped this as data.Users[].IsInWhatsapp and as other casings, so search
 * for the flag rather than depend on one exact shape.
 */
function findIsOnWhatsapp(body: unknown): boolean | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown): boolean | null => {
    if (!v || typeof v !== 'object' || seen.has(v)) return null;
    seen.add(v);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/^(isinwhatsapp|isonwhatsapp|exists|onwhatsapp)$/i.test(k) && typeof val === 'boolean') return val;
    }
    for (const val of Object.values(v as Record<string, unknown>)) {
      const found = walk(val);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(body);
}

function normalise(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) d = `91${d}`;
  else if (d.length === 11 && d.startsWith('0')) d = `91${d.slice(1)}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
