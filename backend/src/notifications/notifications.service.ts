import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PushService, type PushPayload } from '../clients/push.service';
import { MailService } from '../mail/mail.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ConnectionsService } from '../connections/connections.service';
import { NotificationPreferencesService, type Delivery } from './notification-preferences.service';

/** Absolute base for links in outbound email / WhatsApp (relative SPA paths). */
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || 'https://nusi.in').replace(/\/+$/, '');

interface Contact { email: string | null; phone: string | null; }

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

interface NewNotification {
  type: string;
  title: string;
  body?: string | null;
  url?: string | null;
  /** Optional push icon (e.g. workspace logo). Not persisted — push only. */
  icon?: string | null;
  /** Optional push collapse tag. Defaults to `type`. Not persisted. */
  tag?: string | null;
}

interface Row {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: Date | null;
  created_at: Date;
}

/**
 * The in-app notification center. Rows are written by the NotificationHandler
 * fan-in (one per recipient) alongside the web-push it already sends, and read
 * back here for the bell + feed. All writes are best-effort: a failure here must
 * never break the request that triggered the notification.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly prefs: NotificationPreferencesService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsappService,
    private readonly connections: ConnectionsService,
  ) {}

  // ── Unified dispatch (persist in-app row + fan out web push) ────────
  //
  // Every method here does BOTH: writes a row to the notification center
  // (the bell/feed) AND best-effort sends a web push to the recipient's
  // devices, so a single call keeps both channels in lockstep. All writes
  // are swallowed on error — a notification failure must never break the
  // request that triggered it.

  /** Build the push payload for a notification (icon/tag are push-only). */
  private toPush(n: NewNotification): PushPayload {
    return {
      title: n.title,
      body: n.body ?? '',
      url: n.url ?? undefined,
      icon: n.icon ?? undefined,
      tag: n.tag ?? n.type,
    };
  }

  /**
   * Notify every active staff member of a workspace (optionally excluding the
   * actor). Each recipient's own notification preferences decide whether the
   * bell row is written and whether a push is sent (see NotificationPreferences).
   */
  async notifyStaff(workspaceId: string, n: NewNotification, excludeUserId?: string | null): Promise<void> {
    try {
      const staff = await this.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
        `SELECT user_id FROM public.workspace_members
          WHERE workspace_id = $1::uuid AND status = 'active'
            AND ($2::uuid IS NULL OR user_id <> $2::uuid)`,
        workspaceId,
        excludeUserId ?? null,
      );
      if (!staff.length) return;

      const eventKey = this.prefs.eventForType(n.type);
      const delivery = await this.prefs.deliveryForUsers(staff.map((s) => s.user_id), eventKey);
      const payload = this.toPush(n);
      const pushTargets: string[] = [];
      const externalTargets: string[] = []; // users wanting email and/or whatsapp

      for (const s of staff) {
        const d = delivery.get(s.user_id) ?? this.defaultDelivery();
        if (d.inapp) await this.insert({ workspaceId, recipientUserId: s.user_id, recipientClientId: null, n });
        if (d.push) pushTargets.push(s.user_id);
        if (d.email || d.whatsapp) externalTargets.push(s.user_id);
      }
      await Promise.allSettled(pushTargets.map((id) => this.push.sendToUser(id, payload)));

      // Email + WhatsApp: resolve contact info once, then fan out per user pref.
      if (externalTargets.length) {
        const contacts = await this.contactsForUsers(externalTargets);
        await Promise.allSettled(
          externalTargets.map((id) =>
            this.sendExternal(workspaceId, delivery.get(id) ?? this.defaultDelivery(), contacts.get(id) ?? { email: null, phone: null }, n),
          ),
        );
      }
    } catch (err) {
      this.logger.warn(`notifyStaff failed: ${(err as Error).message}`);
    }
  }

  /**
   * Notify a single client (bell row + push to their devices). Honours the
   * client's category preferences: a muted category (e.g. "Meal reminders")
   * suppresses both the bell row and the push. Direct messages and any type not
   * bound to a category are always delivered.
   */
  async notifyClient(workspaceId: string, clientId: string, n: NewNotification): Promise<void> {
    try {
      if (!(await this.prefs.clientDeliveryAllowed(clientId, n.type))) return;
      await this.insert({ workspaceId, recipientUserId: null, recipientClientId: clientId, n });
      await this.push.sendToClient(clientId, this.toPush(n));
    } catch (err) {
      this.logger.warn(`notifyClient failed: ${(err as Error).message}`);
    }
  }

  /**
   * Notify a single user by auth user id (a specific staff member). Honours the
   * user's notification preferences for the bell row + push.
   */
  async notifyUser(workspaceId: string, userId: string, n: NewNotification): Promise<void> {
    try {
      const d = await this.prefs.deliveryForUser(userId, this.prefs.eventForType(n.type));
      if (d.inapp) await this.insert({ workspaceId, recipientUserId: userId, recipientClientId: null, n });
      if (d.push) await this.push.sendToUser(userId, this.toPush(n));
      if (d.email || d.whatsapp) {
        const contacts = await this.contactsForUsers([userId]);
        await this.sendExternal(workspaceId, d, contacts.get(userId) ?? { email: null, phone: null }, n);
      }
    } catch (err) {
      this.logger.warn(`notifyUser failed: ${(err as Error).message}`);
    }
  }

  /**
   * Notify every platform super-admin. Used for cross-workspace, platform-level
   * events (new workspace signups, KYC submissions, payment failures, plan-limit
   * breaches). `workspaceId` anchors the row to the workspace the event concerns.
   */
  async notifySuperAdmins(workspaceId: string, n: NewNotification): Promise<void> {
    try {
      const admins = await this.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
        `SELECT DISTINCT user_id FROM public.user_roles WHERE role::text = 'super_admin'`,
      );
      if (!admins.length) return;
      const payload = this.toPush(n);
      for (const a of admins) {
        await this.insert({ workspaceId, recipientUserId: a.user_id, recipientClientId: null, n });
      }
      await Promise.allSettled(admins.map((a) => this.push.sendToUser(a.user_id, payload)));
    } catch (err) {
      this.logger.warn(`notifySuperAdmins failed: ${(err as Error).message}`);
    }
  }

  private async insert(p: {
    workspaceId: string;
    recipientUserId: string | null;
    recipientClientId: string | null;
    n: NewNotification;
  }): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.notifications
         (workspace_id, recipient_user_id, recipient_client_id, type, title, body, url)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)`,
      p.workspaceId,
      p.recipientUserId,
      p.recipientClientId,
      p.n.type,
      p.n.title.slice(0, 200),
      p.n.body ? p.n.body.slice(0, 500) : null,
      p.n.url ?? null,
    );
  }

  // ── Test send (settings page "verify these channels reach me") ─────

  /**
   * Send a test notification to the caller's OWN email and/or WhatsApp so an
   * owner can verify a channel is actually wired end-to-end (Resend domain
   * verified, Evolution instance connected). Reports, per channel, whether it
   * was configured, had an address, and was accepted by the provider.
   */
  async sendTest(userId: string, workspaceId: string | null, channels: Array<'email' | 'whatsapp'>): Promise<Record<string, { ok: boolean; reason: string }>> {
    const result: Record<string, { ok: boolean; reason: string }> = {};
    const contact = (await this.contactsForUsers([userId])).get(userId) ?? { email: null, phone: null };
    const n: NewNotification = {
      type: 'test',
      title: 'SIRAH LIFE · test notification',
      body: 'This is a test — if you received it, this channel is working. 🎉',
      url: '/notifications',
    };
    const link = this.absoluteUrl(n.url);

    if (channels.includes('email')) {
      // Prefer this workspace's own connected email sender; fall back to the
      // platform sender only if the workspace hasn't connected one.
      const wsCfg = workspaceId ? await this.connections.resolveEmail(workspaceId) : null;
      if (!contact.email) result.email = { ok: false, reason: 'No email address on your account.' };
      else if (wsCfg) {
        const r = await this.mail.sendWith(wsCfg, { to: contact.email, subject: n.title, html: this.emailHtml(n, link) });
        result.email = { ok: r.ok, reason: r.ok ? `Sent to ${contact.email} from ${wsCfg.from}.` : (r.error ?? 'Send failed.') };
      } else if (this.mail.enabled) {
        const ok = await this.mail.send({ to: contact.email, subject: n.title, html: this.emailHtml(n, link) }).catch(() => false);
        result.email = { ok, reason: ok ? `Sent to ${contact.email} (platform sender).` : 'Provider rejected the send.' };
      } else {
        result.email = { ok: false, reason: 'No email sender connected. Connect one in Settings → Integrations.' };
      }
    }
    if (channels.includes('whatsapp')) {
      const token = workspaceId ? await this.connections.resolveWhatsapp(workspaceId) : null;
      if (!this.whatsapp.enabled) result.whatsapp = { ok: false, reason: 'WhatsApp gateway is not configured on the server.' };
      else if (!token) result.whatsapp = { ok: false, reason: 'WhatsApp not linked. Connect your number in Settings → Integrations.' };
      else if (!contact.phone) result.whatsapp = { ok: false, reason: 'No phone number on your account.' };
      else {
        const ok = await this.whatsapp.sendText({ token, to: contact.phone, text: `${n.title}\n${n.body}` }).catch(() => false);
        result.whatsapp = { ok, reason: ok ? `Sent to ${contact.phone}.` : 'Send failed — is the number still linked?' };
      }
    }
    return result;
  }

  // ── Email + WhatsApp fan-out (staff channels) ──────────────────────

  /** Permissive fallback when a user has no saved preferences row. */
  private defaultDelivery(): Delivery {
    return { inapp: true, push: true, email: true, whatsapp: true };
  }

  /**
   * Resolve email + phone for staff users from auth.users. Phone comes from the
   * signup metadata ({ name, phone }); email is the account email. Best-effort:
   * a query failure yields an empty map and external sends are simply skipped.
   */
  private async contactsForUsers(userIds: string[]): Promise<Map<string, Contact>> {
    const out = new Map<string, Contact>();
    if (!userIds.length) return out;
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; email: string | null; phone: string | null }>>(
        `SELECT id,
                email,
                COALESCE(NULLIF(raw_user_meta_data->>'phone', ''), NULLIF(phone, '')) AS phone
           FROM auth.users
          WHERE id = ANY($1::uuid[])`,
        userIds,
      );
      for (const r of rows) out.set(r.id, { email: r.email, phone: r.phone });
    } catch (err) {
      this.logger.warn(`contactsForUsers failed: ${(err as Error).message}`);
    }
    return out;
  }

  /**
   * Deliver one notification over the external channels a recipient opted into.
   * Each channel is independently gated on: the user's preference (`d`), a
   * usable address, and a configured sender. Email prefers the WORKSPACE's own
   * connection (ConnectionsService) and falls back to the platform sender only
   * if the workspace hasn't connected one. All best-effort.
   */
  private async sendExternal(workspaceId: string, d: Delivery, c: Contact, n: NewNotification): Promise<void> {
    const link = this.absoluteUrl(n.url);
    if (d.email && c.email) {
      const html = this.emailHtml(n, link);
      const wsCfg = await this.connections.resolveEmail(workspaceId);
      if (wsCfg) {
        await this.mail.sendWith(wsCfg, { to: c.email, subject: n.title, html }).catch(() => ({ ok: false }));
      } else if (this.mail.enabled) {
        await this.mail.send({ to: c.email, subject: n.title, html }).catch(() => false);
      }
    }
    if (d.whatsapp && this.whatsapp.enabled && c.phone) {
      const token = await this.connections.resolveWhatsapp(workspaceId);
      if (token) {
        const parts = [n.title, n.body ?? '', link ? `\n${link}` : ''].filter(Boolean);
        await this.whatsapp.sendText({ token, to: c.phone, text: parts.join('\n') }).catch(() => false);
      }
    }
  }

  /** Turn a relative SPA path (or null) into an absolute link, if any. */
  private absoluteUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return `${APP_PUBLIC_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /** Simple, on-brand transactional email body for a notification. */
  private emailHtml(n: NewNotification, link: string | null): string {
    const esc = (s: string) => s.replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
    const body = n.body
      ? `<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px">${esc(n.body)}</p>`
      : '';
    const cta = link
      ? `<a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#0e9aa8,#d946ef);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:9999px">Open in SIRAH LIFE</a>`
      : '';
    return `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 12px;font-size:18px">${esc(n.title)}</h2>
        ${body}
        ${cta}
        <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">You're receiving this because email notifications are on in your SIRAH LIFE settings.</p>
      </div>`;
  }

  // ── Reads — staff (by user) ────────────────────────────────────────

  listForUser(userId: string, limit = 30): Promise<NotificationItem[]> {
    return this.list('recipient_user_id', userId, limit);
  }

  unreadCountForUser(userId: string): Promise<number> {
    return this.unreadCount('recipient_user_id', userId);
  }

  markReadForUser(userId: string, id: string): Promise<void> {
    return this.markRead('recipient_user_id', userId, id);
  }

  markAllForUser(userId: string): Promise<void> {
    return this.markAll('recipient_user_id', userId);
  }

  // ── Reads — client (resolve client id from the calling user) ───────

  async listForClient(userId: string, limit = 30): Promise<NotificationItem[]> {
    const clientId = await this.clientIdForUser(userId);
    return clientId ? this.list('recipient_client_id', clientId, limit) : [];
  }

  async unreadCountForClient(userId: string): Promise<number> {
    const clientId = await this.clientIdForUser(userId);
    return clientId ? this.unreadCount('recipient_client_id', clientId) : 0;
  }

  async markReadForClient(userId: string, id: string): Promise<void> {
    const clientId = await this.clientIdForUser(userId);
    if (clientId) await this.markRead('recipient_client_id', clientId, id);
  }

  async markAllForClient(userId: string): Promise<void> {
    const clientId = await this.clientIdForUser(userId);
    if (clientId) await this.markAll('recipient_client_id', clientId);
  }

  // ── Shared query helpers ───────────────────────────────────────────

  private async list(col: 'recipient_user_id' | 'recipient_client_id', id: string, limit: number): Promise<NotificationItem[]> {
    const lim = Math.min(100, Math.max(1, limit));
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, type, title, body, url, read_at, created_at
         FROM public.notifications
        WHERE ${col} = $1::uuid
        ORDER BY created_at DESC
        LIMIT ${lim}`,
      id,
    );
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      url: r.url,
      read_at: r.read_at ? r.read_at.toISOString() : null,
      created_at: r.created_at.toISOString(),
    }));
  }

  private async unreadCount(col: 'recipient_user_id' | 'recipient_client_id', id: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM public.notifications
        WHERE ${col} = $1::uuid AND read_at IS NULL`,
      id,
    );
    return Number(rows[0]?.n ?? 0n);
  }

  private async markRead(col: 'recipient_user_id' | 'recipient_client_id', id: string, notificationId: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.notifications SET read_at = now()
        WHERE id = $1::uuid AND ${col} = $2::uuid AND read_at IS NULL`,
      notificationId,
      id,
    );
  }

  private async markAll(col: 'recipient_user_id' | 'recipient_client_id', id: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.notifications SET read_at = now()
        WHERE ${col} = $1::uuid AND read_at IS NULL`,
      id,
    );
  }

  private async clientIdForUser(userId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    return rows[0]?.id ?? null;
  }
}
