import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

  // ── Writes (fan-in) ────────────────────────────────────────────────

  /** Persist a notification for every active staff member except the actor. */
  async notifyStaff(workspaceId: string, n: NewNotification, excludeUserId?: string | null): Promise<void> {
    try {
      const staff = await this.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
        `SELECT user_id FROM public.workspace_members
          WHERE workspace_id = $1::uuid AND status = 'active'
            AND ($2::uuid IS NULL OR user_id <> $2::uuid)`,
        workspaceId,
        excludeUserId ?? null,
      );
      for (const s of staff) {
        await this.insert({ workspaceId, recipientUserId: s.user_id, recipientClientId: null, n });
      }
    } catch (err) {
      this.logger.warn(`notifyStaff failed: ${(err as Error).message}`);
    }
  }

  /** Persist a notification for a single client. */
  async notifyClient(workspaceId: string, clientId: string, n: NewNotification): Promise<void> {
    try {
      await this.insert({ workspaceId, recipientUserId: null, recipientClientId: clientId, n });
    } catch (err) {
      this.logger.warn(`notifyClient failed: ${(err as Error).message}`);
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
