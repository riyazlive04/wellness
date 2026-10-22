import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../types/auth-user.type';
import { PrismaService } from '../../database/prisma.service';
import { resolveWorkspacePlan } from '../../billing/resolve-plan';

/**
 * Free-trial gate. Once a workspace's 14-day trial is over and no plan has been
 * bought, its staff get 402 instead of data — the UI lock in OwnerLayout is the
 * polite half of this, and this is the half that actually holds.
 *
 * There is no grace period (a deliberate product decision): the trial ends at
 * `workspaces.trial_ends_at`, and access stops.
 *
 * Deliberately still open while locked, so the practice can pay or leave with
 * their data:
 *   - auth (sign in, scope — the UI needs it to render the lock)
 *   - billing (see plans, start a subscription)
 *   - workspaces/me (practice name + branding for the shell)
 *   - workspaces/me/data (DPDP export of their own records)
 *   - health, push, webhooks
 *
 * Untouched: super admins, clients (a client's meal plan shouldn't vanish
 * because their dietitian is late paying), and every workspace on a paid plan —
 * `resolveWorkspacePlan` returns the subscription's plan then, never 'trial'.
 *
 * Org owners/admins are NOT exempt: the check is on the workspace they are
 * working in, so a paid branch opens and an expired trial branch stays locked
 * for them like anyone else (they used to skip the lock for good).
 */

/** Path prefixes (after /api/v1/) that keep working once the trial has ended. */
const OPEN_PREFIXES = [
  'auth',
  'billing',
  'health',
  'push',
  'webhooks',
  'workspaces/me/data',
];

/** `/api/v1/clients/123` → `clients/123`. */
function routePath(url: string): string {
  const path = url.split('?')[0];
  return path.replace(/^\/+/, '').replace(/^api\/(v\d+\/)?/, '');
}

function isOpenWhileLocked(url: string): boolean {
  const path = routePath(url);
  if (path === 'workspaces/me') return true;
  return OPEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export class TrialExpiredException extends HttpException {
  /**
   * `lapsed` distinguishes a practice that paid and lost a renewal from one
   * whose free trial simply ran out. Both end up on the trial plan and hit
   * this guard, but "your 14-day free trial has ended" is plainly wrong for
   * someone who has been paying for months.
   */
  constructor(trialEndedAt: Date, lapsed = false) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: lapsed ? 'Subscription lapsed' : 'Free trial ended',
        code: lapsed ? 'subscription_lapsed' : 'trial_expired',
        trialEndedAt: trialEndedAt.toISOString(),
        message: lapsed
          ? 'Your subscription ended after a renewal payment could not be collected. Subscribe again to get back into your workspace — your data is safe.'
          : 'Your 14-day free trial has ended. Choose a plan to get back into your workspace — your data is safe.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

@Injectable()
export class TrialGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
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
    if (!user?.workspaceId) return true;
    if (user.isSuperAdmin || user.isClient) return true;

    if (isOpenWhileLocked(String(req.originalUrl ?? req.url ?? ''))) return true;

    // Only trial workspaces can expire; a paid subscription resolves to its own
    // plan key and returns here immediately.
    const plan = await resolveWorkspacePlan(this.prisma, user.workspaceId);
    if (plan !== 'trial') return true;

    const workspace = await this.prisma.workspaces.findUnique({
      where: { id: user.workspaceId },
      select: { trial_ends_at: true },
    });
    const endsAt = workspace?.trial_ends_at;
    if (endsAt && endsAt.getTime() <= Date.now()) {
      // Only the grace-period downgrade produces an 'expired' subscription, so
      // its presence is what separates a lapsed payer from a trial that simply
      // ran out. Checked only on the locked path, never on a healthy request.
      const [row] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM public.subscriptions
          WHERE workspace_id = $1::uuid AND status = 'expired'`,
        user.workspaceId,
      );
      throw new TrialExpiredException(endsAt, Number(row?.n ?? 0) > 0);
    }
    return true;
  }
}
