import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, X } from 'lucide-react';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { billingApi, type Plan } from '@/modules/workspace/billing/api';

/** What the server sends with a 402 plan_limit_exceeded. */
export interface PlanLimitInfo {
  resource: string;
  limit: number;
  used: number;
  plan: string;
}

/**
 * Pull the limit details out of a failed request, or null if it was some
 * other error.
 *
 * Returning null rather than guessing is deliberate: a network blip must not
 * be reported to a practice as "you have run out of clients".
 */
export function planLimitFrom(err: unknown): PlanLimitInfo | null {
  if (!(err instanceof ApiError) || err.code !== 'plan_limit_exceeded') return null;
  const c = err.context ?? {};
  const resource = typeof c.resource === 'string' ? c.resource : null;
  if (!resource) return null;
  return {
    resource,
    limit: Number(c.limit ?? 0),
    used: Number(c.used ?? 0),
    plan: typeof c.plan === 'string' ? c.plan : 'your plan',
  };
}

const RESOURCE_LABEL: Record<string, { one: string; many: string }> = {
  clients: { one: 'client', many: 'clients' },
  team: { one: 'team member', many: 'team members' },
  managers: { one: 'manager', many: 'managers' },
  storage: { one: 'storage', many: 'storage' },
  ai_calls: { one: 'AI credit', many: 'AI credits' },
  video_minutes: { one: 'video minute', many: 'video minutes' },
};

/** The cap this resource maps to on a plan, or undefined if it has none. */
function capFor(plan: Plan, resource: string): number | null | undefined {
  const l = plan.limits;
  if (!l) return undefined;
  switch (resource) {
    case 'clients': return l.maxClients;
    case 'team': return l.maxTeam;
    case 'managers': return l.maxManagers;
    case 'ai_calls': return l.aiCallsPerMonth;
    case 'video_minutes': return l.videoMinutesPerMonth;
    default: return undefined;
  }
}

/**
 * Shown when a practice hits a plan cap.
 *
 * The server already said what was reached, how many they have and which plan
 * they are on - so this names the number rather than echoing a sentence, and
 * finds the cheapest plan that would actually raise the cap rather than
 * pointing vaguely at Billing.
 */
export function PlanLimitDialog({
  info,
  onClose,
}: {
  info: PlanLimitInfo;
  onClose: () => void;
}) {
  const plansQ = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => billingApi.plans(),
    staleTime: 10 * 60_000,
  });

  const label = RESOURCE_LABEL[info.resource] ?? { one: info.resource, many: info.resource };

  // The cheapest sellable plan whose cap on THIS resource beats the current
  // one. Suggesting a tier that does not raise the limit would be worse than
  // suggesting nothing.
  const upgrade = (plansQ.data?.plans ?? [])
    .filter((p) => !p.legacy)
    .find((p) => {
      const cap = capFor(p, info.resource);
      return cap === null || (typeof cap === 'number' && cap > info.limit);
    });

  const upgradeCap = upgrade ? capFor(upgrade, info.resource) : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-canvas/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${label.many} limit reached`}
    >
      <Glass variant="heavy" className="w-full max-w-md p-7">
        <div className="flex items-start justify-between">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <Sparkles className="h-6 w-6" />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-lg text-foreground/55 hover:bg-foreground/[0.06]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-4 text-lg font-semibold tracking-tight">
          You have used all {info.limit} {info.limit === 1 ? label.one : label.many}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-foreground/65">
          {/* The number first: a practice wants to know where they stand before
              being told what to buy. */}
          Your {info.plan} plan includes {info.limit}{' '}
          {info.limit === 1 ? label.one : label.many}, and you are using{' '}
          {info.used}.{' '}
          {upgrade && typeof upgradeCap === 'number' ? (
            <>
              {upgrade.name} raises that to {upgradeCap.toLocaleString('en-IN')}.
            </>
          ) : upgrade && upgradeCap === null ? (
            <>{upgrade.name} has no limit.</>
          ) : (
            <>Remove one you no longer need, or get in touch and we will sort it out.</>
          )}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-foreground/10 px-4 py-2 text-sm hover:bg-foreground/[0.04]"
          >
            Not now
          </button>
          <Link
            to="/billing"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-teal-50 hover:bg-teal-800"
          >
            {upgrade ? `Move to ${upgrade.name}` : 'See plans'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* An add-on pack is often cheaper than a tier jump, and a practice
            that only needs five more clients should hear about it. */}
        {(info.resource === 'clients' || info.resource === 'team') && (
          <p className="mt-4 text-[11px] leading-relaxed text-foreground/45">
            Need only a few more? Billing also sells extra {label.many} on their own,
            without changing plan.
          </p>
        )}
      </Glass>
    </div>,
    document.body,
  );
}
