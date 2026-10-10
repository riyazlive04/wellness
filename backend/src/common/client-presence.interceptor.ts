import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';

/** Stamp a client's last-active time at most this often. */
const STAMP_EVERY_MS = 60_000;

/**
 * Keeps clients.last_active_at current for EVERY client app.
 *
 * Presence used to come only from the web portal's heartbeat, so a client
 * using the mobile app showed "Never active" to their nutritionist however
 * much they used it. Any authenticated request from a client now counts,
 * written at most once a minute per client and never in the request's way.
 */
@Injectable()
export class ClientPresenceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ClientPresenceInterceptor.name);
  private readonly lastStamp = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
      if (user?.isClient && user.id) this.stamp(user.id);
    }
    return next.handle();
  }

  private stamp(userId: string): void {
    const now = Date.now();
    if (now - (this.lastStamp.get(userId) ?? 0) < STAMP_EVERY_MS) return;
    this.lastStamp.set(userId, now);
    if (this.lastStamp.size > 50_000) this.lastStamp.clear(); // bound memory
    void this.prisma.$executeRawUnsafe(
      `UPDATE public.clients SET last_active_at = now() WHERE user_id = $1::uuid`,
      userId,
    ).catch((err) => this.logger.warn(`presence stamp failed: ${(err as Error).message}`));
  }
}
