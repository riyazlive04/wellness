import type { PrismaService } from '../database/prisma.service';

/**
 * Purchased AI credits (1 credit = 1 AI call) usable in the CURRENT month.
 *
 * A pack is valid for 30 days from purchase. Usage is counted per calendar
 * month and draws on the plan allowance first, so a pack bought late in a
 * month usually has credits left at month end: those carry into the next
 * month for as long as the pack is still inside its 30 days. (Packs used to
 * expire at month end, so one bought on the 30th lasted a day.)
 *
 * Lives here - not inside a service - because BOTH quota paths must agree:
 *   - LimitsService.assertAiQuota()  (gates Plate Vision + Voice AI)
 *   - UsageService.checkQuota()      (gates the AI Assistant)
 *
 * Fails to 0 (never throws): if the grants table isn't migrated yet, the plan
 * allowance still applies - we just can't see purchases.
 */
export async function grantedCreditsThisCycle(
  prisma: PrismaService,
  workspaceId: string,
  /** The plan's own monthly allowance; needed to work out last month's leftover. */
  planMonthlyAllowance?: number | null,
): Promise<number> {
  try {
    const [row] = await prisma.$queryRawUnsafe<Array<{
      this_month: bigint; last_month: bigint; last_month_valid: bigint; used_last_month: bigint;
    }>>(
      `SELECT
         (SELECT COALESCE(SUM(credits), 0) FROM public.workspace_credit_grants
           WHERE workspace_id = $1::uuid AND granted_at >= date_trunc('month', now()))::bigint AS this_month,
         (SELECT COALESCE(SUM(credits), 0) FROM public.workspace_credit_grants
           WHERE workspace_id = $1::uuid
             AND granted_at >= date_trunc('month', now()) - interval '1 month'
             AND granted_at <  date_trunc('month', now()))::bigint AS last_month,
         (SELECT COALESCE(SUM(credits), 0) FROM public.workspace_credit_grants
           WHERE workspace_id = $1::uuid
             AND granted_at >= date_trunc('month', now()) - interval '1 month'
             AND granted_at <  date_trunc('month', now())
             AND granted_at >  now() - interval '30 days')::bigint AS last_month_valid,
         (SELECT count(*) FROM public.ai_usage_events
           WHERE workspace_id = $1::uuid AND status <> 'error'
             AND created_at >= date_trunc('month', now()) - interval '1 month'
             AND created_at <  date_trunc('month', now()))::bigint AS used_last_month`,
      workspaceId,
    );
    const thisMonth = Number(row?.this_month ?? 0n);
    return thisMonth + carriedOverCredits({
      lastMonthPacks: Number(row?.last_month ?? 0n),
      lastMonthPacksStillValid: Number(row?.last_month_valid ?? 0n),
      usedLastMonth: Number(row?.used_last_month ?? 0n),
      planMonthlyAllowance: planMonthlyAllowance ?? null,
    });
  } catch {
    return 0;
  }
}

/**
 * Pack credits left over from last month that are still inside their 30 days.
 * Last month's usage came out of the plan allowance first, then the packs.
 */
export function carriedOverCredits(p: {
  lastMonthPacks: number;
  lastMonthPacksStillValid: number;
  usedLastMonth: number;
  planMonthlyAllowance: number | null;
}): number {
  if (p.planMonthlyAllowance == null || p.lastMonthPacksStillValid <= 0) return 0;
  const packCreditsUsed = Math.max(0, p.usedLastMonth - p.planMonthlyAllowance);
  const unused = Math.max(0, p.lastMonthPacks - packCreditsUsed);
  return Math.min(unused, p.lastMonthPacksStillValid);
}
