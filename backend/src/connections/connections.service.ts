import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MailService, type EmailSendConfig } from '../mail/mail.service';
import { encryptSecret, decryptSecret } from './secret-crypto';
import type {
  ConnectionChannel,
  ConnectionStatus,
  ConnectionView,
  SaveEmailInput,
} from './connections.types';

interface Row {
  channel: ConnectionChannel;
  provider: string | null;
  config: Record<string, unknown> | null;
  status: ConnectionStatus;
  identity: string | null;
  last_error: string | null;
  last_tested_at: Date | null;
}

/**
 * Per-workspace notification channel connections. Each workspace connects its
 * OWN email sender (and, later, WhatsApp number). Secrets in `config` are
 * encrypted at rest (see secret-crypto). Owner-only access is enforced by the
 * controller's @WorkspaceRole('owner') + workspace scoping.
 */
@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Both channels' safe status views for the settings page. */
  async list(workspaceId: string): Promise<ConnectionView[]> {
    const rows = await this.rows(workspaceId);
    const byChannel = new Map(rows.map((r) => [r.channel, r]));
    const channels: ConnectionChannel[] = ['email', 'whatsapp'];
    return channels.map((ch) => this.toView(ch, byChannel.get(ch)));
  }

  /**
   * Connect / update the workspace's Resend email sender, then verify it by
   * sending a test to `verifyTo`. Status becomes 'connected' on a successful
   * test, else 'error' with the provider's reason.
   */
  async saveEmail(
    workspaceId: string,
    input: SaveEmailInput,
    verifyTo: string | null,
  ): Promise<{ view: ConnectionView; test: { ok: boolean; error?: string } }> {
    const apiKey = (input.apiKey || '').trim();
    const fromEmail = (input.fromEmail || '').trim();
    const fromName = (input.fromName || '').trim();
    if (!apiKey) throw new BadRequestException('Resend API key is required.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail)) {
      throw new BadRequestException('A valid from-address is required.');
    }
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const config = {
      apiKey_enc: encryptSecret(apiKey),
      fromEmail,
      fromName: fromName || null,
      from,
    };
    await this.upsert(workspaceId, 'email', 'resend', config, from, 'pending');

    // Verify by sending a test to the owner (best-effort — a failure just marks
    // the connection 'error' with the reason, it doesn't reject the save).
    let test: { ok: boolean; error?: string } = { ok: false, error: 'No address to verify against.' };
    if (verifyTo) {
      test = await this.mail.sendWith(
        { provider: 'resend', apiKey, from },
        { to: verifyTo, subject: 'SIRAH LIFE · email connected', html: verifyEmailHtml(from) },
      );
    }
    await this.mark(workspaceId, 'email', test.ok ? 'connected' : 'error', test.ok ? null : test.error ?? 'Verification failed.');

    const view = this.toView('email', (await this.rows(workspaceId)).find((r) => r.channel === 'email'));
    return { view, test };
  }

  /** Re-send a verification email using the stored connection. */
  async testEmail(workspaceId: string, to: string): Promise<{ ok: boolean; error?: string }> {
    const cfg = await this.resolveEmail(workspaceId, { anyStatus: true });
    if (!cfg) return { ok: false, error: 'No email connection saved yet.' };
    const test = await this.mail.sendWith(cfg, {
      to,
      subject: 'SIRAH LIFE · email test',
      html: verifyEmailHtml(cfg.from),
    });
    await this.mark(workspaceId, 'email', test.ok ? 'connected' : 'error', test.ok ? null : test.error ?? 'Test failed.');
    return test;
  }

  async disconnect(workspaceId: string, channel: ConnectionChannel): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.workspace_connections WHERE workspace_id = $1::uuid AND channel = $2`,
      workspaceId,
      channel,
    );
  }

  /**
   * Resolve a workspace's DECRYPTED email config for the dispatcher. Returns
   * null when there's no usable connection. By default only a 'connected'
   * (verified) connection is used; pass { anyStatus } to read an unverified one
   * (for the test flow).
   */
  async resolveEmail(workspaceId: string, opts: { anyStatus?: boolean } = {}): Promise<EmailSendConfig | null> {
    try {
      const row = (await this.rows(workspaceId)).find((r) => r.channel === 'email');
      if (!row || row.provider !== 'resend') return null;
      if (!opts.anyStatus && row.status !== 'connected') return null;
      const cfg = row.config ?? {};
      const encKey = cfg['apiKey_enc'];
      const from = cfg['from'];
      if (typeof encKey !== 'string' || typeof from !== 'string') return null;
      return { provider: 'resend', apiKey: decryptSecret(encKey), from };
    } catch (err) {
      this.logger.warn(`resolveEmail failed for ${workspaceId}: ${(err as Error).message}`);
      return null;
    }
  }

  // ── internals ──────────────────────────────────────────────────────

  private async rows(workspaceId: string): Promise<Row[]> {
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT channel, provider, config, status, identity, last_error, last_tested_at
         FROM public.workspace_connections WHERE workspace_id = $1::uuid`,
      workspaceId,
    );
  }

  private async upsert(
    workspaceId: string,
    channel: ConnectionChannel,
    provider: string,
    config: Record<string, unknown>,
    identity: string | null,
    status: ConnectionStatus,
  ): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.workspace_connections
         (workspace_id, channel, provider, config, identity, status, updated_at)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, now())
       ON CONFLICT (workspace_id, channel) DO UPDATE SET
         provider = EXCLUDED.provider,
         config   = EXCLUDED.config,
         identity = EXCLUDED.identity,
         status   = EXCLUDED.status,
         updated_at = now()`,
      workspaceId,
      channel,
      provider,
      JSON.stringify(config),
      identity,
      status,
    );
  }

  private async mark(
    workspaceId: string,
    channel: ConnectionChannel,
    status: ConnectionStatus,
    lastError: string | null,
  ): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.workspace_connections
          SET status = $3, last_error = $4, last_tested_at = now(), updated_at = now()
        WHERE workspace_id = $1::uuid AND channel = $2`,
      workspaceId,
      channel,
      status,
      lastError,
    );
  }

  private toView(channel: ConnectionChannel, row?: Row): ConnectionView {
    if (!row) {
      return { channel, provider: null, status: 'disconnected', identity: null, has_secret: false, last_error: null, last_tested_at: null };
    }
    const cfg = row.config ?? {};
    return {
      channel,
      provider: row.provider,
      status: row.status,
      identity: row.identity,
      has_secret: typeof cfg['apiKey_enc'] === 'string' || typeof cfg['token_enc'] === 'string',
      last_error: row.last_error,
      last_tested_at: row.last_tested_at ? row.last_tested_at.toISOString() : null,
    };
  }
}

function verifyEmailHtml(from: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  return `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 12px;font-size:18px">Your email is connected ✅</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px">
        SIRAH LIFE will now send this practice's notifications from
        <b>${esc(from)}</b>.
      </p>
      <p style="color:#94a3b8;font-size:12px;margin:20px 0 0">If you didn't set this up, you can disconnect it in Settings → Integrations.</p>
    </div>`;
}
