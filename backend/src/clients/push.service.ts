import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../database/prisma.service';

/**
 * Notification payload as the service worker (frontend/public/sirah-sw.js)
 * expects to receive it. Keep this in sync with the SW's parser.
 */
export interface PushPayload {
  title: string;
  body: string;
  /** Path inside the SPA — the SW will open /portal + url on click. */
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
  ) {}

  onModuleInit(): void {
    const pub  = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subj = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:support@sirahdigital.in';

    if (!pub || !priv) {
      this.logger.warn('VAPID keys not set — push notifications disabled.');
      return;
    }
    try {
      webpush.setVapidDetails(subj, pub, priv);
      this.configured = true;
      this.logger.log('Push notifications configured.');
    } catch (err) {
      this.logger.error(`Invalid VAPID keys — push disabled: ${(err as Error).message}`);
    }
  }

  /**
   * Send a notification to every saved subscription for a client. Returns
   * the number of successful deliveries (0 if push isn't configured).
   *
   * `clientId` is the public.clients.id (not the auth.users.id).
   */
  async sendToClient(clientId: string, payload: PushPayload): Promise<number> {
    if (!this.configured) return 0;

    const subs = await this.prisma.$queryRawUnsafe<
      Array<{ endpoint: string; p256dh: string; auth: string }>
    >(
      `SELECT endpoint, p256dh, auth
         FROM public.push_subscriptions
        WHERE client_id = $1::uuid`,
      clientId,
    );
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
        `DELETE FROM public.push_subscriptions
          WHERE client_id = $1::uuid AND endpoint = ANY($2::text[])`,
        clientId,
        dead,
      );
      this.logger.log(`Removed ${dead.length} stale push subscription(s) for client ${clientId}`);
    }
    return ok;
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
}