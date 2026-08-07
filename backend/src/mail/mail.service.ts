import { Injectable, Logger } from '@nestjs/common';

/**
 * Resolved per-workspace email sender config (secrets already DECRYPTED by the
 * caller). Provider 'resend' uses a workspace's own Resend API key + from
 * address, so each practice sends from its own account.
 */
export interface EmailSendConfig {
  provider: 'resend';
  apiKey: string;
  from: string; // "Name <addr@domain>" or a bare address
}

/**
 * Minimal transactional email sender backed by Resend's REST API (no SDK —
 * just fetch).
 *
 * Two modes:
 *   - `send()` — the PLATFORM default, env-gated on RESEND_API_KEY /
 *     RESEND_FROM_EMAIL. No-ops (logs) when unset, so callers never break.
 *   - `sendWith(cfg, …)` — a PER-WORKSPACE send using that workspace's own
 *     connection (see ConnectionsService). This is the multi-tenant path.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly from = process.env.RESEND_FROM_EMAIL || 'NUSI <onboarding@resend.dev>';

  get enabled(): boolean {
    return !!this.apiKey;
  }

  async send(opts: { to: string; subject: string; html: string }): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn(`Email not sent (RESEND_API_KEY unset): "${opts.subject}" → ${opts.to}`);
      return false;
    }
    return (await this.resendSend(this.apiKey, this.from, opts)).ok;
  }

  /**
   * Send using a specific workspace's resolved email connection. Returns
   * `{ ok, error }` so the caller (settings "test") can surface the provider's
   * reason. Never throws.
   */
  async sendWith(
    cfg: EmailSendConfig,
    opts: { to: string; subject: string; html: string },
  ): Promise<{ ok: boolean; error?: string }> {
    if (cfg.provider !== 'resend') {
      return { ok: false, error: `Unsupported email provider: ${cfg.provider}` };
    }
    if (!cfg.apiKey || !cfg.from) {
      return { ok: false, error: 'Email connection is missing its API key or from-address.' };
    }
    return this.resendSend(cfg.apiKey, cfg.from, opts);
  }

  /** Low-level Resend REST call shared by both paths. */
  private async resendSend(
    apiKey: string,
    from: string,
    opts: { to: string; subject: string; html: string },
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(`Resend ${res.status}: ${body}`);
        return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`Email send failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  /** Staff/team invitation email with the accept link. */
  async sendTeamInvite(o: {
    to: string;
    inviteUrl: string;
    workspaceName: string;
    role: string;
    inviterEmail?: string | null;
  }): Promise<boolean> {
    const roleLabel = o.role.replace(/_/g, ' ');
    const by = o.inviterEmail ? ` by ${escapeHtml(o.inviterEmail)}` : '';
    const subject = `You're invited to join ${o.workspaceName} on NUSI`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 4px">Join ${escapeHtml(o.workspaceName)}</h2>
        <p style="color:#475569;font-size:14px;margin:0 0 20px">
          You've been invited${by} to join <b>${escapeHtml(o.workspaceName)}</b> as a
          <b>${escapeHtml(roleLabel)}</b> on NUSI. Click below to accept and set up your account.
        </p>
        <a href="${o.inviteUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#2563eb,#d946ef);color:#fff;
                  text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:9999px">
          Accept invitation
        </a>
        <p style="color:#94a3b8;font-size:12px;margin:20px 0 0">
          Or paste this link into your browser:<br>
          <span style="word-break:break-all">${o.inviteUrl}</span>
        </p>
      </div>`;
    return this.send({ to: o.to, subject, html });
  }

}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
