import { Injectable, Logger } from '@nestjs/common';

/**
 * Minimal transactional email sender backed by Resend's REST API (no SDK —
 * just fetch). Env-gated: if RESEND_API_KEY is unset it logs and no-ops, so
 * callers never break when email isn't configured (e.g. local dev). Set
 * RESEND_API_KEY + RESEND_FROM_EMAIL (a verified sender) to enable.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly from = process.env.RESEND_FROM_EMAIL || 'SIRAH LIFE <onboarding@resend.dev>';

  get enabled(): boolean {
    return !!this.apiKey;
  }

  async send(opts: { to: string; subject: string; html: string }): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn(`Email not sent (RESEND_API_KEY unset): "${opts.subject}" → ${opts.to}`);
      return false;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [opts.to], subject: opts.subject, html: opts.html }),
      });
      if (!res.ok) {
        this.logger.warn(`Resend ${res.status}: ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Email send failed: ${(err as Error).message}`);
      return false;
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
    const subject = `You're invited to join ${o.workspaceName} on SIRAH LIFE`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 4px">Join ${escapeHtml(o.workspaceName)}</h2>
        <p style="color:#475569;font-size:14px;margin:0 0 20px">
          You've been invited${by} to join <b>${escapeHtml(o.workspaceName)}</b> as a
          <b>${escapeHtml(roleLabel)}</b> on SIRAH LIFE. Click below to accept and set up your account.
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
