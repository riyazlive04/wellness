import { PrismaService } from '../database/prisma.service';
import { BILLING_GRACE_DAYS, UNPAID_CHECKOUT_HOURS } from './plans';

/**
 * Effective plan key for a workspace — an active subscription wins over
 * workspaces.plan; a failed-renewal subscription keeps its plan during the
 * grace window, then falls back to workspaces.plan ('trial' by default).
 *
 * A subscription still in 'created' means checkout was opened but never paid.
 * It counts only for UNPAID_CHECKOUT_HOURS, so abandoning the Razorpay page
 * can't buy a permanent free plan.
 *
 * Canonical resolver shared by LimitsService (quota enforcement), FeaturesGuard
 * (entitlement) and the auth scope endpoint (frontend gating), so all three
 * agree on which plan a workspace is on. Kept as a free function (not a
 * provider) so auth/ can call it without a DI cycle through tenancy/.
 */
export async function resolveWorkspacePlan(prisma: PrismaService, workspaceId: string): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ plan: string | null; sub_plan: string | null }>>(
    `SELECT w.plan,
            (SELECT s.plan_key FROM public.subscriptions s
              WHERE s.workspace_id = w.id
                AND (
                  s.status IN ('active', 'authenticated', 'trialing')
                  OR (
                    s.status = 'created'
                    AND s.created_at > now() - ($3 || ' hours')::interval
                  )
                  OR (
                    s.status IN ('halted', 'pending')
                    AND s.current_period_end IS NOT NULL
                    AND s.current_period_end > now() - ($2 || ' days')::interval
                  )
                )
              ORDER BY s.created_at DESC LIMIT 1) AS sub_plan
       FROM public.workspaces w
      WHERE w.id = $1::uuid
      LIMIT 1`,
    workspaceId,
    String(BILLING_GRACE_DAYS),
    String(UNPAID_CHECKOUT_HOURS),
  );
  return row?.sub_plan ?? row?.plan ?? 'trial';
}
