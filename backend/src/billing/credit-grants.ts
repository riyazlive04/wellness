import type { PrismaService } from '../database/prisma.service';

/**
 * Purchased AI credits (1 credit = 1 AI call) for the CURRENT billing cycle.
 *
 * Credit packs are sold as "top up your AI quota for the current billing cycle",
 * so a grant lifts the allowance for the calendar month it was bought in.
 *
 * Lives here — not inside a service — because BOTH quota paths must agree:
 *   - LimitsService.assertAiQuota()  (gates Plate Vision + Voice AI)
 *   - UsageService.checkQuota()      (gates the AI Assistant)
 * They previously used different plan tables and diverged badly; anything that
 * gates or displays AI usage must resolve credits through this one function.
 *
 * Fails to 0 (never throws): if the grants table isn't migrated yet, the plan
 * allowance still applies — we just can't see purchases.
 */
export async function grantedCreditsThisCycle(
  prisma: PrismaService,
  workspaceId: string,
): Promise<number> {
  try {
    const [row] = await prisma.$queryRawUnsafe<Array<{ credits: bigint | null }>>(
      `SELECT COALESCE(SUM(credits), 0)::bigint AS credits
         FROM public.workspace_credit_grants
        WHERE workspace_id = $1::uuid
          AND granted_at >= date_trunc('month', now())`,
      workspaceId,
    );
    return Number(row?.credits ?? 0n);
  } catch {
    return 0;
  }
}
