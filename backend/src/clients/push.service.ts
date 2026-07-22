import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../database/prisma.service';
import { FcmService } from './fcm.service';

/**
 * Notification payload as the service worker (frontend/public/sirah-offline-sw.js)
 * expects to receive it. Keep this in sync with the SW's parser.
 */
export interface PushPayload {
  title: string;
  body: string;
  /**
   * ABSOLUTE path inside the SPA — the SW opens it verbatim (its
   * notificationclick handler does no rewriting), so include the portal prefix
   * yourself: '/portal/chat', not '/chat'.
   *
   * This comment used to promise the SW prepended '/portal'. It never did, and
   * six client notifications were written against that promise — messages sent
   * clients to '/chat' (a 404) and appointments to '/appointments' (the OWNER
   * page). Client routes all live under /portal/*.
   */
  url?: string;
  /** Optional icon URL (defaults to /icons/icon-192.png in the SW). */
  icon?: string;
  /** Optional tag for collapsing duplicate notifications. */
  tag?: string;
}

/**
 * web-push API server. Configured once at boot from VAPID_* env vars and
 * driven by other services that want to notify a client (appointments,
 * messages, etc.).
 *
 * Design notes:
 *   - If VAPID keys aren't set, the service silently no-ops every send.
 *     This keeps dev/local installs working without forcing key generation.
 *   - 404/410 responses from a push endpoint mean the subscription is
 *     dead (user uninstalled the SW, cleared site data, etc.). We delete
 *     those rows so the next call doesn't keep failing.
 *   - All sends are fire-and-forget from the caller's POV — Promise.allSettled
 *     means one stale device doesn't block a notification to the others.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private configured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    // Mobile (FCM) transport. Independent of VAPID — see sendToClient.
    private readonly fcm: FcmService,
  ) {}

  onModuleInit(): void {
    const pub  = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subj = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:support@sirahdigital.in';

    if (!pub || !priv) {
      this.logger.warn('VAPID keys not set - push notifications disabled.');
      return;
    }
    try {
      webpush.setVapidDetails(subj, pub, priv);
      this.configured = true;
      this.logger.log('Push notifications configured.');
    } catch (err) {
      this.logger.error(`Invalid VAPID keys - push disabled: ${(err as Error).message}`);
    }
  }

  /**
   * Send a notification to every saved subscription for a client. Returns
   * the number of successful deliveries (0 if push isn't configured).
   *
   * `clientId` is the public.clients.id (not the auth.users.id).
   */
  async sendToClient(clientId: string, payload: PushPayload): Promise<number> {
    // Web-push (browser) — only when VAPID is configured.
    let web = 0;
    if (this.configured) {
      const subs = await this.prisma.$queryRawUnsafe<SubRow[]>(
        `SELECT endpoint, p256dh, auth
           FROM public.push_subscriptions
          WHERE client_id = $1::uuid`,
        clientId,
      );
      web = await this.deliver(subs, payload, `client ${clientId}`);
    }
    // Mobile (FCM) — independent channel; no-ops if FCM isn't configured.
    const mobile = await this.fcm.sendToClient(clientId, payload);
    return web + mobile;
  }

  /**
   * Send to every saved subscription for a user (auth.users.id). This is the
   * staff path — workspace owners / nutritionists subscribe their own devices,
   * which are keyed by user_id (no client row).
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.configured) return 0;
    const subs = await this.prisma.$queryRawUnsafe<SubRow[]>(
      `SELECT endpoint, p256dh, auth
         FROM public.push_subscriptions
        WHERE user_id = $1::uuid`,
      userId,
    );
    return this.deliver(subs, payload, `user ${userId}`);
  }

  /**
   * Fan out to the active STAFF of a workspace. Resolves subscriptions by
   * joining push_subscriptions.user_id to workspace_members, so it reaches a
   * staff member on any device they registered, and stops once they leave the
   * workspace. Defaults to the high-signal roles (owner + nutritionist).
   *
   * `excludeUserId` skips the actor so they aren't notified about their own
   * action.
   */
  async sendToWorkspaceStaff(
    workspaceId: string,
    payload: PushPayload,
    opts: { roles?: string[]; excludeUserId?: string | null } = {},
  ): Promise<number> {
    if (!this.configured) return 0;
    const roles = opts.roles?.length ? opts.roles : ['owner', 'nutritionist'];
    const subs = await this.prisma.$queryRawUnsafe<SubRow[]>(
      `SELECT DISTINCT ps.endpoint, ps.p256dh, ps.auth
         FROM public.push_subscriptions ps
         JOIN public.workspace_members wm ON wm.user_id = ps.user_id
        WHERE wm.workspace_id = $1::uuid
          AND wm.status = 'active'
          AND wm.role = ANY($2::text[])
          AND ps.user_id IS NOT NULL
          AND ($3::uuid IS NULL OR ps.user_id <> $3::uuid)`,
      workspaceId,
      roles,
      opts.excludeUserId ?? null,
    );
    return this.deliver(subs, payload, `workspace ${workspaceId} staff`);
  }

  /**
   * Send to every client a workspace admin maps to. Used when an admin
   * action should fan out (e.g. message broadcast, new program published).
   */
  async sendToClients(clientIds: string[], payload: PushPayload): Promise<number> {
    if (!this.configured || !clientIds.length) return 0;
    const sent = await Promise.all(clientIds.map((id) => this.sendToClient(id, payload)));
    return sent.reduce((a, b) => a + b, 0);
  }

  /** Convenience — true when VAPID is configured and push will actually send. */
  isEnabled(): boolean {
    return this.configured;
  }

  /**
   * The browser subscription handshake config — VAPID public key + flag.
   *
   * `enabled` tracks `configured`, NOT the mere presence of a public key: a send
   * also needs the private key, and needs setVapidDetails() to have accepted the
   * pair. Keying this off the public key alone let a half-configured server
   * (public set, private missing) invite the browser to subscribe and then
   * silently no-op every send — the UI reported "subscribed" while nothing ever
   * arrived. Reporting enabled:false instead surfaces a real error client-side.
   */
  getPublicConfig(): { vapidPublicKey: string | null; enabled: boolean } {
    if (!this.configured) return { vapidPublicKey: null, enabled: false };
    return {
      vapidPublicKey: this.config.get<string>('VAPID_PUBLIC_KEY') ?? null,
      enabled: true,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Subscription persistence (shared by client + staff subscribe flows)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Upsert one device subscription, keyed on endpoint (the natural global key).
   * Both client (PWA portal) and staff (owner dashboard) flows funnel through
   * here so the row always carries user_id, and client_id / workspace_id when
   * known.
   */
  async saveSubscription(params: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
    clientId?: string | null;
    workspaceId?: string | null;
  }): Promise<{ subscribed: true }> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.push_subscriptions
         (client_id, user_id, workspace_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)
       ON CONFLICT (endpoint) DO UPDATE SET
         client_id    = EXCLUDED.client_id,
         user_id      = EXCLUDED.user_id,
         workspace_id = EXCLUDED.workspace_id,
         p256dh       = EXCLUDED.p256dh,
         auth         = EXCLUDED.auth,
         user_agent   = EXCLUDED.user_agent,
         last_used_at = now()`,
      params.clientId ?? null,
      params.userId,
      params.workspaceId ?? null,
      params.endpoint,
      params.p256dh,
      params.auth,
      params.userAgent ?? null,
    );
    return { subscribed: true };
  }

  /**
   * Swap a browser-rotated subscription in place, preserving ownership.
   *
   * Browsers (notably Chrome/Android) silently re-issue push endpoints — on key
   * rollover, storage pressure, or long idle. The old endpoint then 410s and the
   * device goes quiet forever, which reads to users as "push turned itself off".
   * The service worker's `pushsubscriptionchange` handler calls this to hand us
   * the new endpoint.
   *
   * Unauthenticated by necessity: a service worker has no session. `oldEndpoint`
   * IS the capability — a long, unguessable, browser-issued URL we already
   * stored. We only ever MOVE an existing row (never insert), so an unknown
   * endpoint is a silent no-op rather than a way to mint subscriptions.
   */
  async rotateSubscription(params: {
    oldEndpoint: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<{ rotated: boolean }> {
    if (params.oldEndpoint === params.endpoint) return { rotated: false };
    return this.prisma.$transaction(async (tx) => {
      // The new endpoint may already exist as a stale row (e.g. a previous
      // partial rotation). endpoint is UNIQUE, so clear it before we move.
      await tx.$executeRawUnsafe(
        `DELETE FROM public.push_subscriptions WHERE endpoint = $1`,
        params.endpoint,
      );
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE public.push_subscriptions
            SET endpoint = $2, p256dh = $3, auth = $4, last_used_at = now()
          WHERE endpoint = $1
          RETURNING id`,
        params.oldEndpoint,
        params.endpoint,
        params.p256dh,
        params.auth,
      );
      if (rows.length === 0) {
        this.logger.warn('rotateSubscription: no row matched the old endpoint - ignoring.');
      }
      return { rotated: rows.length > 0 };
    });
  }

  /**
   * Remove a subscription by endpoint, scoped to its owner (client_id OR
   * user_id) so one user can't delete another's device row.
   */
  async removeSubscription(
    owner: { userId: string; clientId?: string | null },
    endpoint: string,
  ): Promise<{ unsubscribed: true }> {
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.push_subscriptions
        WHERE endpoint = $1
          AND (user_id = $2::uuid OR ($3::uuid IS NOT NULL AND client_id = $3::uuid))`,
      endpoint,
      owner.userId,
      owner.clientId ?? null,
    );
    return { unsubscribed: true };
  }

  // ────────────────────────────────────────────────────────────────────
  // Internal — shared delivery + stale-subscription cleanup
  // ────────────────────────────────────────────────────────────────────

  /**
   * Push `payload` to a resolved set of subscriptions. Returns the number of
   * successful deliveries. Dead endpoints (404/410) are removed by endpoint —
   * the global natural key — so this is safe for client and staff rows alike.
   */
  private async deliver(
    subs: SubRow[],
    payload: PushPayload,
    label: string,
  ): Promise<number> {
    if (!subs.length) return 0;

    const body = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        ),
      ),
    );

    const dead: string[] = [];
    let ok = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        ok++;
        return;
      }
      // web-push throws WebPushError with statusCode on HTTP errors.
      const err = r.reason as { statusCode?: number; message?: string };
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        dead.push(subs[i].endpoint);
      } else {
        this.logger.warn(`Push delivery failed for ${subs[i].endpoint.slice(0, 60)}…: ${err?.message ?? err}`);
      }
    });

    if (dead.length) {
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM public.push_subscriptions WHERE endpoint = ANY($1::text[])`,
        dead,
      );
      this.logger.log(`Removed ${dead.length} stale push subscription(s) for ${label}`);
    }
    return ok;
  }
}

interface SubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}