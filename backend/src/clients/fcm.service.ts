import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import * as admin from 'firebase-admin';

import { PrismaService } from '../database/prisma.service';

/** Minimal payload shape — structurally compatible with PushService.PushPayload. */
export interface FcmPayload {
  title: string;
  body: string;
  url?: string;
}

interface TokenRow {
  token: string;
}

/**
 * Firebase Cloud Messaging transport for the NATIVE mobile app.
 *
 * Runs alongside PushService (browser web-push): the two are independent
 * channels. This one reads device registration tokens from `fcm_tokens` and
 * sends via the Firebase Admin SDK.
 *
 * Configuration:
 *   - FIREBASE_SERVICE_ACCOUNT — path to the service-account JSON on disk
 *     (generated in Firebase → Project settings → Service accounts). If unset,
 *     the service silently no-ops every send, so dev/local installs work without
 *     credentials — exactly like PushService does when VAPID is missing.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app: admin.app.App | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const path = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (!path) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT not set — FCM (mobile push) disabled.');
      return;
    }
    try {
      const creds = JSON.parse(readFileSync(path, 'utf8')) as admin.ServiceAccount;
      // Named app so it never collides with any other firebase-admin init.
      this.app = admin.initializeApp({ credential: admin.credential.cert(creds) }, 'sirah-fcm');
      this.logger.log('FCM (mobile push) configured.');
    } catch (err) {
      this.logger.error(`FCM init failed — mobile push disabled: ${(err as Error).message}`);
    }
  }

  isEnabled(): boolean {
    return this.app !== null;
  }

  /**
   * Register (upsert) a device token for the caller. Resolves the caller's
   * client row so sends can target it. Token is the natural unique key.
   */
  async registerDevice(userId: string, token: string, platform = 'android'): Promise<{ ok: true }> {
    if (!token) return { ok: true };
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    const clientId = rows[0]?.id ?? null;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.fcm_tokens (user_id, client_id, token, platform)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT (token) DO UPDATE SET
         user_id    = EXCLUDED.user_id,
         client_id  = EXCLUDED.client_id,
         platform   = EXCLUDED.platform,
         updated_at = now()`,
      userId,
      clientId,
      token,
      platform,
    );
    return { ok: true };
  }

  async removeToken(token: string): Promise<{ ok: true }> {
    if (token) {
      await this.prisma.$executeRawUnsafe(`DELETE FROM public.fcm_tokens WHERE token = $1`, token);
    }
    return { ok: true };
  }

  /** Send to every registered device of a client. Returns successful sends. */
  async sendToClient(clientId: string, payload: FcmPayload): Promise<number> {
    return this.send(`SELECT token FROM public.fcm_tokens WHERE client_id = $1::uuid`, clientId, payload);
  }

  /** Send to every registered device of a user (staff path, if ever needed). */
  async sendToUser(userId: string, payload: FcmPayload): Promise<number> {
    return this.send(`SELECT token FROM public.fcm_tokens WHERE user_id = $1::uuid`, userId, payload);
  }

  private async send(sql: string, id: string, payload: FcmPayload): Promise<number> {
    if (!this.app) return 0;
    const rows = await this.prisma.$queryRawUnsafe<TokenRow[]>(sql, id);
    if (!rows.length) return 0;
    try {
      const res = await this.app.messaging().sendEachForMulticast({
        tokens: rows.map((r) => r.token),
        notification: { title: payload.title, body: payload.body },
        data: payload.url ? { url: payload.url } : {},
        android: { priority: 'high', notification: { channelId: 'default' } },
      });
      // Prune dead tokens (uninstalled / rotated) so we stop trying them.
      await Promise.all(
        res.responses.map((r, i) => {
          const code = r.error?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-argument'
          ) {
            return this.removeToken(rows[i].token).catch(() => undefined);
          }
          return undefined;
        }),
      );
      return res.successCount;
    } catch (err) {
      this.logger.warn(`FCM send failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
