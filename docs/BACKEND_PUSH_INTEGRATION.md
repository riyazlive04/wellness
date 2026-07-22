# Backend: add FCM (mobile) push — deployable guide

This adds Firebase Cloud Messaging to your NestJS backend so the mobile app
receives the SAME notifications your web app already sends. It runs ALONGSIDE
your existing web-push (VAPID) — the website keeps working unchanged.

**Key design:** every notification already calls `PushService.sendToClient()` /
`sendToUser()`. We add FCM dispatch INSIDE those two methods, so every existing
notification (messages, appointments, reminders…) reaches mobile with **no
changes to any call site**.

Repo: `riyazlive04/wellness`, backend in `backend/`. Deploy = push to `main`
(the VPS autodeploys) OR your usual deploy step.

---

## 1. Service-account secret (on the VPS, not in git)

From Firebase → ⚙️ Project settings → **Service accounts** → **Generate new
private key** → download the JSON.

Put it on the VPS and point an env var at it (do NOT commit it):

```bash
# on the VPS, e.g.
mkdir -p /etc/sirah && mv sirahdigitalwellness-firebase-adminsdk-XXXX.json /etc/sirah/fcm.json
chmod 600 /etc/sirah/fcm.json
```

Add to the backend's env (`.env` / PM2 / systemd):
```
FIREBASE_SERVICE_ACCOUNT=/etc/sirah/fcm.json
FIREBASE_PROJECT_ID=sirahdigitalwellness
```

## 2. Install the SDK

```bash
cd backend
npm install firebase-admin
```

## 3. Database — store device tokens

Add a migration (raw SQL, matching how push_subscriptions is used):

```sql
-- backend migration: fcm_tokens
CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  client_id   uuid,               -- nullable: staff have no clients row
  token       text NOT NULL UNIQUE,
  platform    text NOT NULL DEFAULT 'android',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fcm_tokens_client_idx ON public.fcm_tokens(client_id);
CREATE INDEX IF NOT EXISTS fcm_tokens_user_idx   ON public.fcm_tokens(user_id);
```

## 4. FCM sender (new file `backend/src/clients/fcm.service.ts`)

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import * as admin from 'firebase-admin';
import { PrismaService } from '../database/prisma.service';
import type { PushPayload } from './push.service';

interface TokenRow { token: string }

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
    if (!path) { this.logger.warn('FIREBASE_SERVICE_ACCOUNT not set — FCM disabled.'); return; }
    try {
      const creds = JSON.parse(readFileSync(path, 'utf8'));
      this.app = admin.initializeApp({ credential: admin.credential.cert(creds) }, 'sirah-fcm');
      this.logger.log('FCM configured.');
    } catch (err) {
      this.logger.error(`FCM init failed: ${(err as Error).message}`);
    }
  }

  async upsertToken(userId: string, clientId: string | null, token: string, platform = 'android') {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.fcm_tokens (user_id, client_id, token, platform)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id,
         client_id = EXCLUDED.client_id, platform = EXCLUDED.platform, updated_at = now()`,
      userId, clientId, token, platform,
    );
  }

  async removeToken(token: string) {
    await this.prisma.$executeRawUnsafe(`DELETE FROM public.fcm_tokens WHERE token = $1`, token);
  }

  async sendToClient(clientId: string, payload: PushPayload): Promise<number> {
    return this.send(`SELECT token FROM public.fcm_tokens WHERE client_id = $1::uuid`, clientId, payload);
  }
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    return this.send(`SELECT token FROM public.fcm_tokens WHERE user_id = $1::uuid`, userId, payload);
  }

  private async send(sql: string, id: string, payload: PushPayload): Promise<number> {
    if (!this.app) return 0;
    const rows = await this.prisma.$queryRawUnsafe<TokenRow[]>(sql, id);
    if (!rows.length) return 0;
    const msg = {
      tokens: rows.map(r => r.token),
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: payload.url } : {},
      android: { priority: 'high' as const, notification: { channelId: 'default' } },
    };
    const res = await this.app.messaging().sendEachForMulticast(msg);
    // Clean up dead tokens (uninstalled / rotated).
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
        void this.removeToken(rows[i].token);
      }
    });
    return res.successCount;
  }
}
```

Register `FcmService` in the module that provides `PushService` (same
`providers`/`exports` array — likely `backend/src/clients/push.module.ts`).

## 5. Hook FCM into the existing send path

In `push.service.ts`, inject `FcmService` and fan out to it. This is the whole
integration — every existing notification now also hits mobile:

```ts
// constructor(... private readonly fcm: FcmService) {}

async sendToClient(clientId: string, payload: PushPayload): Promise<number> {
  const web = this.configured ? await this.deliver(/* existing web-push */) : 0;
  const mob = await this.fcm.sendToClient(clientId, payload);   // <-- add
  return web + mob;
}
// same one-line addition in sendToUser(...)
```

(If you prefer not to touch PushService, instead call `fcm.sendToClient` right
next to each existing `pushService.sendToClient` — but the above is one edit.)

## 6. Endpoints to register a device (`me.controller.ts`)

Next to the existing `@Post('push/subscribe')`:

```ts
@Post('push/device')
async registerDevice(@CurrentUser() user: AuthUser, @Body() body: { token: string; platform?: string }) {
  const clientId = await this.me.resolveClientId(user.id); // however you map user->client elsewhere
  await this.fcm.upsertToken(user.id, clientId ?? null, body.token, body.platform ?? 'android');
  return { data: { ok: true } };
}

@Post('push/device/remove')
async removeDevice(@Body() body: { token: string }) {
  await this.fcm.removeToken(body.token);
  return { data: { ok: true } };
}
```

(Use the same `clientId` resolution the other `/me/*` handlers use.)

## 7. Deploy & test

1. Deploy (push to `main` → VPS autodeploys, or your deploy step).
2. In the mobile app: Settings → Notifications ON → it registers its FCM token.
3. Trigger a notification (e.g. send the client a message from the web app).
4. The phone should get it **instantly, even with the app closed**.
5. Check backend logs for "FCM configured." on boot.

## Notes
- The mobile app already calls `POST /me/push/device` (and `/remove`) — it
  fails silently until these endpoints exist, so deploying the backend is what
  switches real push on.
- Web-push (VAPID) is untouched — the website keeps working in parallel.
- The app also polls `/me/notifications` every ~15 min as a fallback, so nothing
  breaks if FCM is delayed.
