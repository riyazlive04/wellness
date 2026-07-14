import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type ChannelKey = 'email' | 'push' | 'whatsapp' | 'inapp';
export type EventKey =
  | 'new_client_message'
  | 'urgent_client_silent'
  | 'meal_photo_review'
  | 'assessment_submitted'
  | 'failed_payment'
  | 'subscription_renewal'
  | 'trial_ending'
  | 'team_activity'
  | 'community_mention'
  | 'weekly_report';

export const CHANNEL_KEYS: ChannelKey[] = ['email', 'push', 'whatsapp', 'inapp'];
export const EVENT_KEYS: EventKey[] = [
  'new_client_message',
  'urgent_client_silent',
  'meal_photo_review',
  'assessment_submitted',
  'failed_payment',
  'subscription_renewal',
  'trial_ending',
  'team_activity',
  'community_mention',
  'weekly_report',
];

export type ChannelToggles = Record<ChannelKey, boolean>;

export interface QuietHours {
  enabled: boolean;
  startHour: number;
  endHour: number;
  days: number[];
}

export interface NotificationPreferences {
  channels: ChannelToggles;
  events: Partial<Record<EventKey, ChannelToggles>>;
  quietHours: QuietHours;
  tzOffsetMinutes: number | null;
}

/** Two of the delivery channels the dispatcher actually implements today. */
export interface Delivery {
  inapp: boolean;
  push: boolean;
}

/**
 * Maps a dispatched notification `type` to a preference EventKey. Only mapped
 * types can be muted PER-EVENT; anything not listed here is delivered whenever
 * its master channel is on (default-allow) — so adding a new notification type
 * never silently vanishes because nobody added a matrix row for it.
 */
export const TYPE_TO_EVENT: Record<string, EventKey> = {
  'message:client': 'new_client_message',
  'plate:create': 'meal_photo_review',
  'assessment:submit': 'assessment_submitted',
  'community:mention': 'community_mention',
  'billing:payment_failed': 'failed_payment',
  'billing:renewal': 'subscription_renewal',
  'billing:trial_ending': 'trial_ending',
};

/** Events that always bypass quiet hours (still pushed overnight). */
const URGENT_EVENTS = new Set<EventKey>(['urgent_client_silent', 'failed_payment']);

// ── Client-portal preferences ────────────────────────────────────────
// Clients pick simple category toggles (not per-channel). A category that is
// explicitly false suppresses BOTH the bell row and the push for that type.

export type ClientCategory = 'meal' | 'water' | 'appt' | 'program' | 'ai_nudge';
export const CLIENT_CATEGORY_KEYS: ClientCategory[] = ['meal', 'water', 'appt', 'program', 'ai_nudge'];

/**
 * Maps a client-facing notification `type` to a preference category. Unmapped
 * types (e.g. `message:admin` — a message from the nutritionist) are always
 * delivered, so turning off a reminder category never silences real messages.
 */
export const CLIENT_TYPE_TO_CATEGORY: Record<string, ClientCategory> = {
  'appointment:reminder': 'appt',
  'appointment:booked': 'appt',
  'appointment:scheduled': 'appt',
  'appointment:cancelled': 'appt',
  'program:create': 'program',
  // future reminder emitters:
  'meal:reminder': 'meal',
  'water:reminder': 'water',
  'ai:nudge': 'ai_nudge',
};

export type ClientCategories = Record<ClientCategory, boolean>;
const DEFAULT_CLIENT_CATEGORIES: ClientCategories = {
  meal: true, water: true, appt: true, program: true, ai_nudge: true,
};

const DEFAULT_CHANNELS: ChannelToggles = { email: true, push: true, whatsapp: true, inapp: true };
const DEFAULT_QUIET: QuietHours = { enabled: false, startHour: 22, endHour: 7, days: [0, 1, 2, 3, 4, 5, 6] };

function defaults(): NotificationPreferences {
  return { channels: { ...DEFAULT_CHANNELS }, events: {}, quietHours: { ...DEFAULT_QUIET }, tzOffsetMinutes: null };
}

interface Row {
  channels: unknown;
  events: unknown;
  quiet_hours: unknown;
  tz_offset_minutes: number | null;
}

/**
 * Per-user notification preferences: read/written by the settings page, and
 * consulted by NotificationsService before every STAFF-facing send.
 *
 * Fail-open by design: any read error (e.g. the table not migrated yet) resolves
 * to permissive defaults so notifications are never accidentally suppressed.
 */
@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Read / write (settings page) ───────────────────────────────────

  async getForUser(userId: string): Promise<NotificationPreferences> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT channels, events, quiet_hours, tz_offset_minutes
           FROM public.notification_preferences WHERE user_id = $1::uuid LIMIT 1`,
        userId,
      );
      if (!rows.length) return defaults();
      return this.fromRow(rows[0]);
    } catch (err) {
      // Table missing / transient — behave as "no preferences set".
      this.logger.warn(`getForUser fell back to defaults: ${(err as Error).message}`);
      return defaults();
    }
  }

  async saveForUser(userId: string, raw: unknown): Promise<NotificationPreferences> {
    const clean = this.sanitize(raw);
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.notification_preferences
         (user_id, channels, events, quiet_hours, tz_offset_minutes, updated_at)
       VALUES ($1::uuid, $2::jsonb, $3::jsonb, $4::jsonb, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         channels          = EXCLUDED.channels,
         events            = EXCLUDED.events,
         quiet_hours       = EXCLUDED.quiet_hours,
         tz_offset_minutes = EXCLUDED.tz_offset_minutes,
         updated_at        = now()`,
      userId,
      JSON.stringify(clean.channels),
      JSON.stringify(clean.events),
      JSON.stringify(clean.quietHours),
      clean.tzOffsetMinutes,
    );
    return clean;
  }

  // ── Delivery resolution (dispatcher) ───────────────────────────────

  /** Resolve in-app / push delivery for one user + event. */
  async deliveryForUser(userId: string, eventKey: EventKey | null): Promise<Delivery> {
    const prefs = await this.getForUser(userId);
    return this.resolve(prefs, eventKey);
  }

  /** Batch-resolve delivery for many users (one query). Unknown users → defaults. */
  async deliveryForUsers(userIds: string[], eventKey: EventKey | null): Promise<Map<string, Delivery>> {
    const out = new Map<string, Delivery>();
    if (!userIds.length) return out;
    let rows: Array<Row & { user_id: string }> = [];
    try {
      rows = await this.prisma.$queryRawUnsafe<Array<Row & { user_id: string }>>(
        `SELECT user_id, channels, events, quiet_hours, tz_offset_minutes
           FROM public.notification_preferences WHERE user_id = ANY($1::uuid[])`,
        userIds,
      );
    } catch (err) {
      this.logger.warn(`deliveryForUsers fell back to defaults: ${(err as Error).message}`);
    }
    const byId = new Map(rows.map((r) => [r.user_id, this.fromRow(r)]));
    for (const id of userIds) {
      out.set(id, this.resolve(byId.get(id) ?? defaults(), eventKey));
    }
    return out;
  }

  /** Translate a notification `type` string into a preference event key. */
  eventForType(type: string): EventKey | null {
    return TYPE_TO_EVENT[type] ?? null;
  }

  // ── Client-portal preferences (category toggles) ───────────────────

  async getClientForUser(userId: string): Promise<ClientCategories> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ client_categories: unknown }>>(
        `SELECT client_categories FROM public.notification_preferences WHERE user_id = $1::uuid LIMIT 1`,
        userId,
      );
      return this.toClientCategories(rows[0]?.client_categories);
    } catch (err) {
      this.logger.warn(`getClientForUser fell back to defaults: ${(err as Error).message}`);
      return { ...DEFAULT_CLIENT_CATEGORIES };
    }
  }

  async saveClientForUser(userId: string, raw: unknown): Promise<ClientCategories> {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    // Accept either { categories: {...} } or the bare category map.
    const source = (o.categories && typeof o.categories === 'object' ? o.categories : o) as unknown;
    const clean = this.toClientCategories(source);
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.notification_preferences (user_id, client_categories, updated_at)
       VALUES ($1::uuid, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE SET
         client_categories = EXCLUDED.client_categories,
         updated_at        = now()`,
      userId,
      JSON.stringify(clean),
    );
    return clean;
  }

  /**
   * Whether a client notification of `type` should be delivered to the client
   * behind `clientId`. Unmapped types and unresolved/unset clients → allowed.
   */
  async clientDeliveryAllowed(clientId: string, type: string): Promise<boolean> {
    try {
      const category = CLIENT_TYPE_TO_CATEGORY[type];
      if (!category) return true; // e.g. direct messages — never gated by a reminder toggle
      const userId = await this.userIdForClient(clientId);
      if (!userId) return true; // client not linked to an auth user → deliver
      const cats = await this.getClientForUser(userId);
      return cats[category] !== false;
    } catch (err) {
      this.logger.warn(`clientDeliveryAllowed defaulted to allow: ${(err as Error).message}`);
      return true;
    }
  }

  private async userIdForClient(clientId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ user_id: string | null }>>(
      `SELECT user_id FROM public.clients WHERE id = $1::uuid LIMIT 1`,
      clientId,
    );
    return rows[0]?.user_id ?? null;
  }

  private toClientCategories(raw: unknown): ClientCategories {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out = { ...DEFAULT_CLIENT_CATEGORIES };
    for (const k of CLIENT_CATEGORY_KEYS) {
      if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
    }
    return out;
  }

  private resolve(prefs: NotificationPreferences, eventKey: EventKey | null): Delivery {
    const ev = eventKey ? prefs.events[eventKey] : undefined;
    const inapp = prefs.channels.inapp && (ev ? ev.inapp : true);
    let push = prefs.channels.push && (ev ? ev.push : true);
    if (push && this.inQuietHours(prefs) && !(eventKey && URGENT_EVENTS.has(eventKey))) {
      push = false; // in-app row still records; only the overnight ping is held
    }
    return { inapp, push };
  }

  private inQuietHours(prefs: NotificationPreferences): boolean {
    const q = prefs.quietHours;
    if (!q.enabled || prefs.tzOffsetMinutes == null) return false;
    if (q.startHour === q.endHour) return false;
    const local = new Date(Date.now() + prefs.tzOffsetMinutes * 60_000);
    const hour = local.getUTCHours();
    const day = local.getUTCDay();
    if (q.days.length && !q.days.includes(day)) return false;
    return q.startHour < q.endHour
      ? hour >= q.startHour && hour < q.endHour
      : hour >= q.startHour || hour < q.endHour; // window crosses midnight
  }

  // ── Parsing / sanitising ───────────────────────────────────────────

  private fromRow(r: Row): NotificationPreferences {
    return {
      channels: this.toChannels(r.channels, DEFAULT_CHANNELS),
      events: this.toEvents(r.events),
      quietHours: this.toQuiet(r.quiet_hours),
      tzOffsetMinutes: typeof r.tz_offset_minutes === 'number' ? r.tz_offset_minutes : null,
    };
  }

  private sanitize(raw: unknown): NotificationPreferences {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const events: Partial<Record<EventKey, ChannelToggles>> = {};
    const rawEvents = (o.events && typeof o.events === 'object' ? o.events : {}) as Record<string, unknown>;
    for (const k of EVENT_KEYS) {
      if (k in rawEvents) events[k] = this.toChannels(rawEvents[k], DEFAULT_CHANNELS);
    }
    const tz = o.tzOffsetMinutes;
    return {
      channels: this.toChannels(o.channels, DEFAULT_CHANNELS),
      events,
      quietHours: this.toQuiet(o.quietHours),
      tzOffsetMinutes: typeof tz === 'number' && Number.isFinite(tz) ? Math.trunc(tz) : null,
    };
  }

  private toChannels(raw: unknown, fallback: ChannelToggles): ChannelToggles {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out = { ...fallback };
    for (const k of CHANNEL_KEYS) {
      if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
    }
    return out;
  }

  private toEvents(raw: unknown): Partial<Record<EventKey, ChannelToggles>> {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out: Partial<Record<EventKey, ChannelToggles>> = {};
    for (const k of EVENT_KEYS) {
      if (k in o) out[k] = this.toChannels(o[k], DEFAULT_CHANNELS);
    }
    return out;
  }

  private toQuiet(raw: unknown): QuietHours {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const clampHour = (v: unknown, d: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(23, Math.max(0, Math.trunc(v))) : d;
    const days = Array.isArray(o.days)
      ? Array.from(new Set(o.days.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6).map((d) => Math.trunc(d)))).sort()
      : [...DEFAULT_QUIET.days];
    return {
      enabled: typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_QUIET.enabled,
      startHour: clampHour(o.startHour, DEFAULT_QUIET.startHour),
      endHour: clampHour(o.endHour, DEFAULT_QUIET.endHour),
      days,
    };
  }
}
