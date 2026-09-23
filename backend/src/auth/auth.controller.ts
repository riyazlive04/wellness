import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './types/auth-user.type';
import { PrismaService } from '../database/prisma.service';
import { resolveWorkspacePlan } from '../billing/resolve-plan';
import { FEATURES, featuresForPlan } from '../common/features';

@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @ApiOperation({ summary: 'Return the currently authenticated user.' })
  me(@CurrentUser() user: AuthUser): { data: AuthUser } {
    return { data: user };
  }

  /**
   * Compact scope view — useful for the frontend to decide which shell
   * (Super Admin / Workspace / Client) to render, without leaking auxiliary
   * fields. Subset of /me.
   */
  @Get('me/scope')
  @ApiOperation({
    summary: 'Compact RBAC scope of the calling user (tier + workspace + role + plan).',
  })
  async scope(@CurrentUser() user: AuthUser): Promise<{
    data: {
      userId: string;
      email?: string;
      tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated';
      workspaceId: string | null;
      workspaceRole: string | null;
      /** Effective plan key of the primary workspace. */
      plan: string | null;
      /**
       * When the workspace's free trial ends (ISO), or null if not on a trial.
       * Lets the shell show a real, counting-down "N days left" banner instead
       * of a hardcoded placeholder.
       */
      trialEndsAt: string | null;
      /**
       * Features the plan actually unlocks, resolved server-side by the SAME
       * map FeaturesGuard enforces (common/features.ts).
       *
       * The frontend used to re-derive this from `plan` via a hand-copied
       * mirror, which silently drifted: the mirror never learned the 2026 keys
       * (starter/growth/scale_pro), so every sellable plan fell through to its
       * `trial` fallback — hiding the AI Assistant from Growth customers who
       * had paid for it, while showing them a Recipes tab that 402'd on every
       * call. Shipping the resolved list means the two can never disagree.
       */
      features: string[];
      isSuperAdmin: boolean;
      isClient: boolean;
      appRoles: string[];
      /**
       * Set ONLY for tier 'unaffiliated', when this person was already invited
       * to a practice as a CLIENT.
       *
       * Without it every unaffiliated account is routed to /onboarding, which
       * is practitioner workspace creation — so an invited client who signs in
       * with Google before following their invite link would start building
       * their own practice (trial and all) instead of joining the one that
       * invited them. Google makes that a single tap, which is why it needs
       * catching here rather than being left to the user to notice.
       */
      pendingInvite: {
        /** 'preapproval' = practice pre-added this email; 'join_request' = already asked, awaiting approval. */
        kind: 'preapproval' | 'join_request';
        workspaceName: string;
        /** Usable join link, or null when the practice's link is missing/expired. */
        joinToken: string | null;
      } | null;
      /** Effective fine-grained permissions — drives permission-aware UI gating. */
      permissions: string[];
    };
  }> {
    // Order matters:
    //  1. super_admin wins outright.
    //  2. A workspace ROLE (owner / nutritionist / manager) means STAFF → the
    //     dashboard. Beats a stray legacy 'client' app-role on a staff account.
    //  3. The 'client' app-role → portal. This deliberately does NOT require a
    //     resolved workspaceId: a client's workspace comes from a SECONDARY,
    //     non-critical clients lookup that can transiently fail, lag a deploy, or
    //     be served stale from the auth cache. A real client must NEVER be
    //     bounced to onboarding just because that enrichment didn't resolve.
    //     (An account with the client role but no clients record also lands on
    //     the portal and renders empty — a rare test-account case, not worth
    //     risking every real client's routing over.)
    //  4. A workspace with no client role → workspace; nothing → unaffiliated.
    const tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated' =
      user.isSuperAdmin
        ? 'super_admin'
        : user.workspaceRole
          ? 'workspace'
          : user.isClient
            ? 'client'
            : user.workspaceId
              ? 'workspace'
              : 'unaffiliated';

    // Only for the unaffiliated case — a rare, once-per-account path, so the
    // extra lookups never touch the hot staff/client routes.
    const pendingInvite = tier === 'unaffiliated' ? await this.resolvePendingInvite(user) : null;

    const plan = user.workspaceId
      ? await resolveWorkspacePlan(this.prisma, user.workspaceId)
      : null;

    // Trial end date for the workspace, so the shell can count down for real.
    // Only meaningful while the workspace is actually on the trial plan.
    const trialEndsAt =
      user.workspaceId && plan === 'trial'
        ? (
            await this.prisma.workspaces.findUnique({
              where: { id: user.workspaceId },
              select: { trial_ends_at: true },
            })
          )?.trial_ends_at?.toISOString() ?? null
        : null;

    return {
      data: {
        userId: user.id,
        email: user.email,
        tier,
        workspaceId: user.workspaceId,
        workspaceRole: user.workspaceRole,
        plan,
        trialEndsAt,
        // Super admins and org owners/admins bypass FeaturesGuard entirely
        // (features.guard.ts), so the UI must not gate them either — hand them
        // the full catalog rather than whatever their workspace plan implies.
        features: user.isSuperAdmin ? [...FEATURES] : featuresForPlan(plan),
        isSuperAdmin: user.isSuperAdmin,
        isClient: user.isClient,
        appRoles: user.appRoles,
        permissions: user.permissions,
        pendingInvite,
      },
    };
  }

  /**
   * Has this unaffiliated account already been invited to a practice as a client?
   *
   * Checked in priority order, because they mean different things to the user:
   *   1. A PENDING join request — they have already asked; they are waiting on
   *      the practice, and must not be asked to do anything else.
   *   2. An unconsumed pre-approval — a practice added their email in advance.
   *      Sending them through the practice's join link lets the existing
   *      requestJoin() flow auto-approve them and create the client record,
   *      rather than reimplementing that (careful) logic here.
   *
   * Never throws: this only refines a redirect. If the lookup fails the caller
   * falls back to today's behaviour rather than blocking sign-in outright.
   */
  private async resolvePendingInvite(user: AuthUser): Promise<{
    kind: 'preapproval' | 'join_request';
    workspaceName: string;
    joinToken: string | null;
  } | null> {
    try {
      const [pending] = await this.prisma.$queryRawUnsafe<
        Array<{ name: string | null; display_name: string | null }>
      >(
        `SELECT w.name, w.display_name
           FROM public.client_join_requests r
           JOIN public.workspaces w ON w.id = r.workspace_id
          WHERE r.user_id = $1::uuid AND r.status = 'pending'
          ORDER BY r.created_at DESC
          LIMIT 1`,
        user.id,
      );
      if (pending) {
        return {
          kind: 'join_request',
          workspaceName: pending.display_name || pending.name || 'your practice',
          joinToken: null,
        };
      }

      const email = user.email?.trim();
      if (!email) return null;

      const [pre] = await this.prisma.$queryRawUnsafe<
        Array<{ name: string | null; display_name: string | null; join_token: string | null }>
      >(
        // Case-insensitive: a practice may type the email with different casing
        // than the identity provider returns.
        // An expired link yields joinToken null rather than dropping the invite —
        // the caller still needs to know NOT to send them to workspace creation.
        `SELECT w.name, w.display_name,
                CASE
                  WHEN w.join_token IS NOT NULL
                   AND (w.join_token_expires_at IS NULL OR w.join_token_expires_at > now())
                  THEN w.join_token
                END AS join_token
           FROM public.client_preapprovals p
           JOIN public.workspaces w ON w.id = p.workspace_id
          WHERE lower(p.email) = lower($1) AND p.consumed_at IS NULL
          ORDER BY p.created_at DESC
          LIMIT 1`,
        email,
      );
      if (!pre) return null;

      return {
        kind: 'preapproval',
        workspaceName: pre.display_name || pre.name || 'your practice',
        joinToken: pre.join_token,
      };
    } catch {
      return null;
    }
  }
}
