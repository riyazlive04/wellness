import type { PrismaService } from '../database/prisma.service';
import { canWhiteLabel } from '../common/plan-capabilities';
import { addonGrants, type ActiveAddon, type AddonKey } from './addons';

/**
 * The workspace's currently-active recurring add-ons.
 *
 * Lives here (not in a service) so every consumer resolves add-ons the same
 * way — LimitsService for quotas, capability checks for white-label, the UI for
 * "what am I paying for". Two divergent quota tables is exactly how the AI
 * Assistant ended up ungated; don't repeat it for add-ons.
 *
 * Fails to [] (never throws): if the table isn't migrated yet the base plan
 * still applies — the customer just doesn't get what they bought, which is
 * visible and fixable, unlike a crashed request.
 */
export async function activeAddons(
  prisma: PrismaService,
  workspaceId: string,
): Promise<ActiveAddon[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ addon_key: string; quantity: number }>>(
      `SELECT addon_key, quantity
         FROM public.workspace_addons
        WHERE workspace_id = $1::uuid
          AND status = 'active'
          -- A lapsed period grants nothing, even if the row wasn't cancelled yet
          -- (webhooks can be late). NULL = no period recorded → trust status.
          AND (current_period_end IS NULL OR current_period_end > now())`,
      workspaceId,
    );
    return rows.map((r) => ({ key: r.addon_key as AddonKey, quantity: Number(r.quantity) || 1 }));
  } catch {
    return [];
  }
}

/**
 * May this workspace remove SIRAH LIFE branding?
 *
 * True when the PLAN includes white-label (Scale Pro, or legacy Elite) OR the
 * workspace bought the ₹2,999/mo white_label add-on (sold to Growth).
 *
 * Use this — not the plan-only `canWhiteLabel()` — anywhere the answer gates a
 * real capability, or a paying add-on customer stays branded.
 */
export async function workspaceCanWhiteLabel(
  prisma: PrismaService,
  workspaceId: string,
  plan: string | null | undefined,
): Promise<boolean> {
  if (canWhiteLabel(plan)) return true;
  const { features } = addonGrants(await activeAddons(prisma, workspaceId));
  return features.has('white_label');
}
