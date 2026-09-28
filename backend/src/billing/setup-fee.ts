import type { PrismaService } from '../database/prisma.service';

/**
 * One-time setup fees. A workspace pays each plan's fee at most once in
 * total: moving to a plan with a bigger fee charges only the difference.
 *
 * Paid amounts live in public.workspace_setup_fee_payments (one row per
 * subscription). Workspaces that paid before that table existed only have
 * workspaces.setup_fee_paid_at; the amount is unknown, so they are treated as
 * fully paid - under-charging is recoverable, charging twice is not.
 */

export interface SetupFeeStatus {
  /** Rupees already paid across all subscriptions. */
  paidInr: number;
  /** Paid under the old single-stamp scheme; treat every fee as covered. */
  legacyPaid: boolean;
}

export async function setupFeeStatus(prisma: PrismaService, workspaceId: string): Promise<SetupFeeStatus> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ paid_inr: number; stamped: boolean }>>(
    `SELECT COALESCE((SELECT SUM(amount_inr) FROM public.workspace_setup_fee_payments p
                       WHERE p.workspace_id = w.id), 0)::int AS paid_inr,
            (w.setup_fee_paid_at IS NOT NULL) AS stamped
       FROM public.workspaces w WHERE w.id = $1::uuid`,
    workspaceId,
  );
  if (!row) return { paidInr: 0, legacyPaid: false };
  return { paidInr: Number(row.paid_inr), legacyPaid: row.stamped && Number(row.paid_inr) === 0 };
}

/** Rupees of `planFeeInr` still to charge given what was already paid. */
export function setupFeeDue(planFeeInr: number, status: SetupFeeStatus): number {
  if (status.legacyPaid) return 0;
  return Math.max(0, planFeeInr - status.paidInr);
}

/**
 * Record the setup fee a subscription's first charge included. Idempotent per
 * subscription, so verify + webhook both calling it records it once.
 */
export async function recordSetupFeePaid(
  prisma: PrismaService,
  workspaceId: string,
  subscriptionId: string,
  planKey: string,
  amountInr: number,
): Promise<void> {
  if (!(amountInr > 0)) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO public.workspace_setup_fee_payments (razorpay_subscription_id, workspace_id, plan_key, amount_inr)
     VALUES ($1, $2::uuid, $3, $4)
     ON CONFLICT (razorpay_subscription_id) DO NOTHING`,
    subscriptionId,
    workspaceId,
    planKey,
    Math.round(amountInr),
  );
  await prisma.$executeRawUnsafe(
    `UPDATE public.workspaces SET setup_fee_paid_at = COALESCE(setup_fee_paid_at, now()) WHERE id = $1::uuid`,
    workspaceId,
  );
}
