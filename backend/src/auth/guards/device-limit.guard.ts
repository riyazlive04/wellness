import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../types/auth-user.type';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { DeviceKind, MAX_PER_KIND, deviceKindFromUserAgent } from '../device-limit';

/**
 * One browser session and one mobile session per staff login.
 *
 * Supabase creates the session before NUSI sees the request, so a login
 * cannot be refused at the door. Instead the oldest extra session in the same
 * bucket is identified here and the request is answered with 409 and the
 * details of what is holding the slot. The UI turns that into a screen naming
 * the other device, with a button to end it - which is why this throws rather
 * than silently signing the other device out: the person deserves to know
 * what they are about to disconnect, and the practice that is sharing a login
 * finds out that is what they are doing.
 *
 * Exempt, each for its own reason:
 *   - super admins: they support several practices from several machines, and
 *     locking the NUSI team out of their own tools helps nobody
 *   - clients: a client is not a seat. They use the phone app and sometimes
 *     the web portal, and limiting them would generate complaints to the
 *     practice about a rule that protects nothing
 *   - open paths: the blocking screen itself needs auth/scope to render, and
 *     the sessions endpoints are how the user gets out of the block
 *
 * The check costs one indexed query, cached per session for a minute, so a
 * session already known to be within the limit adds nothing per request.
 */

/** Prefixes (after /api/v1/) that must work while a device is blocked. */
const OPEN_PREFIXES = [
  'auth',
  'health',
  'me/sessions',
  'push',
  'webhooks',
];

function routePath(url: string): string {
  const path = url.split('?')[0];
  return path.replace(/^\/+/, '').replace(/^api\/(v\d+\/)?/, '');
}

function isOpenWhileBlocked(url: string): boolean {
  const path = routePath(url);
  if (path === 'workspaces/me') return true;
  return OPEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** The session holding the slot, as the blocking screen needs to describe it. */
export interface BlockingSession {
  id: string;
  user_agent: string | null;
  ip: string | null;
  last_active_at: string;
  model: string | null;
}

export class DeviceLimitException extends HttpException {
  constructor(kind: DeviceKind, holder: BlockingSession) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Device limit reached',
        code: 'device_limit_reached',
        kind,
        session: holder,
        message:
          kind === 'mobile'
            ? 'This login is already in use in the NUSI app on another phone. End that session to continue here.'
            : 'This login is already in use in a browser on another device. End that session to continue here.',
      },
      HttpStatus.CONFLICT,
    );
  }
}

interface SessionRow {
  id: string;
  user_agent: string | null;
  ip: string | null;
  last_active_at: Date | null;
  model: string | null;
}

@Injectable()
export class DeviceLimitGuard implements CanActivate {
  private readonly logger = new Logger(DeviceLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user) return true;
    // Staff only. A client is not a seat, and a super admin supports many
    // practices at once.
    if (user.isSuperAdmin || user.isClient) return true;
    if (!user.workspaceRole) return true;

    if (isOpenWhileBlocked(String(req.originalUrl ?? req.url ?? ''))) return true;

    const sessionId = sessionIdFromRequest(req);
    // Without a session_id there is nothing to compare against; a legacy HS256
    // token has no such claim. Let it through rather than blocking on a
    // technicality.
    if (!sessionId) return true;

    const kind = deviceKindFromUserAgent(req.headers?.['user-agent'] as string | undefined);
    const okKey = `device-ok:${sessionId}`;
    if (await this.cache.get<boolean>(okKey)) return true;

    let rows: SessionRow[];
    try {
      rows = await this.prisma.$queryRawUnsafe<SessionRow[]>(
        `SELECT s.id, s.user_agent, s.ip::text AS ip,
                COALESCE(s.refreshed_at, s.updated_at, s.created_at) AS last_active_at,
                d.model
           FROM auth.sessions s
           LEFT JOIN public.session_devices d ON d.session_id = s.id
          WHERE s.user_id = $1::uuid
          ORDER BY s.created_at ASC`,
        user.id,
      );
    } catch (err) {
      // A device rule must never be the reason the product stops working. If
      // the session table cannot be read, let the request through.
      this.logger.warn(`session lookup failed, not enforcing: ${(err as Error).message}`);
      return true;
    }

    // Only sessions of the same kind compete for the slot.
    const sameKind = rows.filter((r) => deviceKindFromUserAgent(r.user_agent) === kind);
    if (sameKind.length <= MAX_PER_KIND) {
      await this.cache.set(okKey, true, 60);
      return true;
    }

    // Oldest sessions keep the slot, so the device that was there first is not
    // thrown off by a newcomer; the newcomer is the one asked to decide.
    const allowed = new Set(sameKind.slice(0, MAX_PER_KIND).map((r) => r.id));
    if (allowed.has(sessionId)) {
      await this.cache.set(okKey, true, 60);
      return true;
    }

    const holder = sameKind.find((r) => allowed.has(r.id));
    // Should not happen, but never block without something to name.
    if (!holder) return true;

    throw new DeviceLimitException(kind, {
      id: holder.id,
      user_agent: holder.user_agent,
      ip: holder.ip ? holder.ip.replace(/\/\d+$/, '') : null,
      last_active_at: (holder.last_active_at ?? new Date()).toISOString(),
      model: holder.model,
    });
  }
}

/**
 * The Supabase `session_id` claim, decoded from the bearer token.
 *
 * Read from the token and not from req.user for the reason CurrentSessionId
 * documents: the resolved AuthUser is cached per user id, so a cached user
 * could carry the session id of another device. The signature was already
 * verified by the JWT guard that ran before this one.
 */
function sessionIdFromRequest(req: { headers?: Record<string, unknown> }): string | null {
  const auth = req.headers?.authorization as string | undefined;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return (payload.session_id as string) ?? null;
  } catch {
    return null;
  }
}
