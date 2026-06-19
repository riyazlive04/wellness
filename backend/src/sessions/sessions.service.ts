import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { SESSION_REVOKED_EVENT } from '../realtime/realtime.types';

export interface SessionInfo {
  id: string;
  device: string;
  browser: string;
  ip: string | null;
  location: string | null;
  current: boolean;
  created_at: string;
  last_active_at: string;
}

interface SessionRow {
  id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  refreshed_at: Date | null;
  device_model: string | null;
  device_platform: string | null;
}

/**
 * Real login sessions, read straight from Supabase Auth's `auth.sessions`
 * table (one row per active device/browser login). Revoking = deleting the
 * session row + its refresh tokens, which signs that device out on its next
 * token refresh.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(userId: string, currentSessionId: string | null): Promise<SessionInfo[]> {
    const rows = await this.prisma.$queryRawUnsafe<SessionRow[]>(
      `SELECT s.id, s.user_agent, s.ip::text AS ip, s.created_at, s.updated_at, s.refreshed_at,
              d.model AS device_model, d.platform AS device_platform
         FROM auth.sessions s
         LEFT JOIN public.session_devices d ON d.session_id = s.id
        WHERE s.user_id = $1::uuid
        ORDER BY COALESCE(s.refreshed_at, s.updated_at, s.created_at) DESC`,
      userId,
    );
    return rows.map((r) => {
      const parsed = parseUserAgent(r.user_agent);
      // Prefer the real model captured via Client Hints; fall back to the UA.
      const device = friendlyModel(r.device_model, r.device_platform) ?? parsed.device;
      const browser = parsed.browser;
      const last = r.refreshed_at ?? r.updated_at ?? r.created_at;
      return {
        id: r.id,
        device,
        browser,
        ip: r.ip ? r.ip.replace(/\/\d+$/, '') : null,
        location: null, // geo-IP lookup intentionally omitted — show the IP instead
        current: !!currentSessionId && r.id === currentSessionId,
        created_at: (r.created_at ?? new Date()).toISOString(),
        last_active_at: (last ?? r.created_at ?? new Date()).toISOString(),
      };
    });
  }

  async revoke(userId: string, sessionId: string, currentSessionId: string | null): Promise<{ id: string }> {
    if (currentSessionId && sessionId === currentSessionId) {
      throw new BadRequestException('Use “Log out” to end your current session.');
    }
    // Confirm the session belongs to this user before touching anything.
    const owned = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM auth.sessions WHERE id = $1::uuid AND user_id = $2::uuid`,
      sessionId,
      userId,
    );
    if (owned.length === 0) throw new NotFoundException('Session not found.');

    await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(
        `DELETE FROM auth.refresh_tokens WHERE session_id = $1::uuid`,
        sessionId,
      ),
      this.prisma.$executeRawUnsafe(
        `DELETE FROM auth.sessions WHERE id = $1::uuid AND user_id = $2::uuid`,
        sessionId,
        userId,
      ),
    ]);
    // Tell that device (if it's connected) to sign out right away.
    this.events.emit(SESSION_REVOKED_EVENT, { session_id: sessionId });
    return { id: sessionId };
  }

  /**
   * Store the real device model the browser reported via User-Agent Client
   * Hints (the UA string itself no longer carries it). Keyed by the caller's
   * current session, so the sessions list can show "Pixel 7" instead of the
   * generic "Android phone". No-ops if we can't resolve the session.
   */
  async registerDevice(
    userId: string,
    sessionId: string | null,
    info: { model?: string; platform?: string; platformVersion?: string },
  ): Promise<{ ok: boolean }> {
    const model = (info.model ?? '').trim().slice(0, 80) || null;
    if (!sessionId || !model) return { ok: false };
    // Only attach to a session that actually belongs to this user.
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.session_devices (session_id, user_id, model, platform, platform_version, updated_at)
       SELECT $1::uuid, $2::uuid, $3, $4, $5, now()
        WHERE EXISTS (SELECT 1 FROM auth.sessions WHERE id = $1::uuid AND user_id = $2::uuid)
       ON CONFLICT (session_id)
       DO UPDATE SET model = EXCLUDED.model, platform = EXCLUDED.platform,
                     platform_version = EXCLUDED.platform_version, updated_at = now()`,
      sessionId,
      userId,
      model,
      (info.platform ?? '').trim().slice(0, 40) || null,
      (info.platformVersion ?? '').trim().slice(0, 40) || null,
    );
    return { ok: true };
  }
}

/** Compose a human label from a Client-Hints model (+ platform). null if none. */
function friendlyModel(model: string | null, platform: string | null): string | null {
  const m = (model ?? '').trim();
  if (!m) return null;
  // Many models already include the brand (e.g. "Pixel 7", "Redmi Note 8").
  // For bare codes, prefix the platform so it's at least recognisable.
  if (/^(android|ios|windows|macos|linux|chrome os)$/i.test(m)) return null;
  if (platform && /android/i.test(platform) && !/pixel|redmi|galaxy|sm-|moto|oneplus|vivo|oppo|realme|nokia|poco/i.test(m)) {
    return m; // show the model code as-is
  }
  return m;
}

/** Best-effort UA → human label. Keeps it short and recognisable, no deps. */
function parseUserAgent(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: 'Unknown device', browser: 'Unknown browser' };

  let os = 'Unknown device';
  if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/iPad/.test(ua)) os = 'iPad';
  else if (/Android/.test(ua)) os = /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'Mac';
  else if (/Windows NT/.test(ua)) os = 'Windows PC';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/CrOS/.test(ua)) os = 'Chromebook';

  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Brave/.test(ua)) browser = 'Brave';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Version\/.*Safari/.test(ua)) browser = 'Safari';

  const m = ua.match(/(?:Chrome|Firefox|Version|Edg)\/(\d+)/);
  if (m) browser += ` ${m[1]}`;
  return { device: os, browser };
}
