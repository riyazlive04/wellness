import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PushService, type PushPayload } from '../clients/push.service';
import { PrismaService } from '../database/prisma.service';
import {
  ACTIVITY_RECORDED_EVENT,
  type ActivityRecordedEvent,
} from './activity-log.types';

/**
 * NotificationHandler — Application Flow "Notification" stage.
 *
 * Subscribes to ActivityRecordedEvent and decides whether the event is
 * notification-worthy (a small allow-list of high-signal entity+action
 * combinations, NOT every mutation), then routes a Web Push to the right
 * recipients via PushService.
 *
 * Recipient model (per allow-list entry):
 *   - 'staff'  → fan out to the workspace's owner + nutritionists, EXCLUDING
 *                the actor (don't notify someone about their own action).
 *   - 'client' → notify the specific client the action concerns. The client id
 *                isn't in the activity event (create routes have no :id in the
 *                URL), so we read it from the persisted payload.
 *   - 'both'   → both of the above.
 *
 * Why load the payload here: the event is deliberately small. We re-read the
 * activity_logs row (already written before this fires) to get the request body
 * for client-id resolution and richer messages.
 *
 * Errors are swallowed — the user request already returned; a push failure must
 * never surface. If VAPID isn't configured, PushService no-ops and we log intent.
 */
type Audience = 'staff' | 'client' | 'both';

interface NotifiableRule {
  audience: Audience;
  title: (e: ActivityRecordedEvent) => string;
  body: (e: ActivityRecordedEvent) => string;
  /** SPA path opened when the recipient taps the notification. */
  url?: string;
}

@Injectable()
export class NotificationHandler {
  private readonly logger = new Logger(NotificationHandler.name);

  private static readonly RULES: Record<string, NotifiableRule> = {
    'client:create': {
      audience: 'staff',
      title: () => 'New client',
      body: () => 'A new client was added to your workspace.',
      url: '/clients',
    },
    'invite:create': {
      audience: 'staff',
      title: () => 'Invite sent',
      body: () => 'A new client invitation was created.',
      url: '/clients',
    },
    'recipe:create': {
      audience: 'staff',
      title: () => 'New recipe',
      body: () => 'A recipe was added to the workspace library.',
      url: '/dashboard/nutrition/recipes',
    },
    'appointment:create': {
      audience: 'staff',
      title: () => 'New appointment',
      body: () => 'A client booked an appointment.',
      url: '/appointments',
    },
    'plate:create': {
      audience: 'staff',
      title: () => 'Meal logged',
      body: () => 'A client logged a meal — it may need review.',
      url: '/dashboard/plate-review',
    },
    // Future: programs are assigned BY staff TO a client. Resolves the client
    // from payload.client_id; no-ops cleanly until that route exists.
    'program:create': {
      audience: 'client',
      title: () => 'New program',
      body: () => 'Your nutritionist published a new program for you.',
      url: '/portal/programs',
    },
  };

  constructor(
    private readonly push: PushService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(ACTIVITY_RECORDED_EVENT, { async: true })
  async handle(event: ActivityRecordedEvent): Promise<void> {
    if (!event.workspace_id) return;
    if (event.status_code >= 400) return;
    if (!event.entity_type) return;

    const key = `${event.entity_type}:${event.action}`;
    const rule = NotificationHandler.RULES[key];
    if (!rule) return;

    try {
      const payload: PushPayload = {
        title: rule.title(event),
        body: rule.body(event),
        url: rule.url,
        tag: key,
      };

      if (rule.audience === 'staff' || rule.audience === 'both') {
        const sent = await this.push.sendToWorkspaceStaff(event.workspace_id, payload, {
          excludeUserId: event.actor_user_id,
        });
        this.log(event, key, `staff×${sent}`);
      }

      if (rule.audience === 'client' || rule.audience === 'both') {
        const clientId = await this.resolveClientId(event);
        if (clientId) {
          const sent = await this.push.sendToClient(clientId, payload);
          this.log(event, key, `client(${clientId})×${sent}`);
        } else {
          this.log(event, key, 'client-unresolved');
        }
      }
    } catch (err) {
      this.logger.warn(`NotificationHandler failed for ${key}: ${(err as Error).message}`);
    }
  }

  /**
   * Pull the client id out of the persisted request payload. Create routes
   * don't carry the new resource id in the URL, so the activity event's
   * entity_id is null — the body is the only source.
   */
  private async resolveClientId(event: ActivityRecordedEvent): Promise<string | null> {
    const row = await this.prisma.activity_logs.findUnique({
      where: { id: event.id },
      select: { payload: true },
    });
    const p = row?.payload;
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      const obj = p as Record<string, unknown>;
      const candidate = obj.client_id ?? obj.clientId;
      if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    }
    return null;
  }

  private log(event: ActivityRecordedEvent, key: string, outcome: string): void {
    this.logger.log(
      `[notify] workspace=${event.workspace_id} ${event.actor_role} ${key} → ${outcome}`,
    );
  }
}
