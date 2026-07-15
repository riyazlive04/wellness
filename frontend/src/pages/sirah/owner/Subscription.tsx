import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Sparkles, Loader2, Zap, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { billingApi, type Plan, type PlanKey, type Topup, type TopupKey } from '@/modules/workspace/billing/api';
import { PlanCard, CycleToggle, type BillingCycle } from '@/modules/workspace/billing/PlanCard';
import { UsageBar } from '@/modules/workspace/billing/components/UsageBar';
import { ChangePlanModal } from '@/modules/workspace/billing/components/ChangePlanModal';
import { tenancyApi } from '@/modules/workspace/api/tenancy';
import type { UsageMetric } from '@/modules/workspace/billing/types';
import { useRazorpayCheckout, CheckoutError } from '@/hooks/useRazorpayCheckout';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';

export default function OwnerSubscription() {
  const workspace = readWorkspace();
  const queryClient = useQueryClient();
  const { data: scope } = useScope();
  const { openCheckout } = useRazorpayCheckout();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [changeTarget, setChangeTarget] = useState<Plan | null>(null);
  // Monthly vs annual is presentation-only for now — the subscribe flow still
  // uses the monthly Razorpay plan until the annual plan IDs are provisioned.
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const plansQ = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: billingApi.listPlans,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const subQ = useQuery({
    queryKey: ['billing', 'me', 'subscription'],
    queryFn: billingApi.currentSubscription,
    retry: 1,
  });

  const limitsQ = useQuery({
    queryKey: ['tenancy', 'limits'],
    queryFn: tenancyApi.getLimits,
    retry: 1,
  });

  const usageMetrics: UsageMetric[] = limitsQ.data
    ? [
        { key: 'clients', label: 'Clients', used: limitsQ.data.usage.clients, limit: limitsQ.data.limits.maxClients },
        { key: 'aiCalls', label: 'AI calls (this month)', used: limitsQ.data.usage.aiCallsThisMonth, limit: limitsQ.data.limits.aiCallsPerMonth },
        { key: 'teamSeats', label: 'Team seats', used: limitsQ.data.usage.team, limit: limitsQ.data.limits.maxTeam },
      ]
    : [];

  const cancelMut = useMutation({
    mutationFn: billingApi.cancel,
    onSuccess: () => {
      toast.success('Subscription will end at the current cycle.');
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'subscription'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not cancel subscription.'),
  });

  // Razorpay off → local dev. Plans can be switched without payment so feature
  // gating can be exercised end-to-end. The backend 403s this once keys exist.
  const devMode = plansQ.data ? !plansQ.data.razorpayConfigured : false;

  const devActivateMut = useMutation({
    mutationFn: (planKey: string) => billingApi.devActivatePlan(planKey),
    onSuccess: (_data, planKey) => {
      toast.success(
        planKey === 'trial'
          ? 'Reset to Trial (dev — no payment).'
          : `Switched to ${planKey} (dev — no payment).`,
      );
      // Re-resolve plan-derived state everywhere: usage limits, subscription,
      // and scope (so the sidebar re-gates its feature nav immediately).
      queryClient.invalidateQueries({ queryKey: ['tenancy', 'limits'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['scope'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not switch plan.'),
  });

  // Prefer a real subscription's plan; otherwise fall back to the resolved plan
  // (covers dev-activated plans, which set workspaces.plan without a sub row).
  const resolvedPlan = limitsQ.data?.plan ?? null;
  const currentPlanKey =
    subQ.data?.subscription?.plan_key ??
    (resolvedPlan && resolvedPlan !== 'trial' ? resolvedPlan : null);

  async function handleSubscribe(plan: Plan) {
    if (!plansQ.data?.razorpayConfigured) {
      toast.error('Razorpay is not configured on the backend yet — ask the admin to set RAZORPAY_KEY_ID.');
      return;
    }
    setPendingKey(plan.key);
    try {
      // Subscribe on the cycle the buyer is actually looking at.
      const created = await billingApi.createSubscription(plan.key, cycle);
      const billed = cycle === 'annual' && plan.priceInrAnnual != null ? plan.priceInrAnnual : plan.priceInr;
      const response = await openCheckout({
        razorpayKeyId: created.razorpayKeyId,
        subscriptionId: created.subscriptionId,
        productName: `SIRAH LIFE · ${plan.name}`,
        productDescription: `₹${billed.toLocaleString('en-IN')}/${cycle === 'annual' ? 'year' : 'month'} — ${plan.tagline}`,
        prefill: { email: scope?.email, name: workspace.ownerName },
        notes: { plan_key: plan.key, billing_cycle: cycle },
      });
      await billingApi.verifySubscription({
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySubscriptionId: response.razorpay_subscription_id!,
        razorpaySignature: response.razorpay_signature,
      });
      toast.success(`Welcome to ${plan.name}! Your subscription is active.`);
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'subscription'] });
    } catch (err) {
      if (err instanceof CheckoutError && err.code === 'USER_DISMISSED') return;
      toast.error(err instanceof Error ? err.message : 'Could not complete payment.');
    } finally {
      setPendingKey(null);
    }
  }

  async function handleBuyTopup(topup: Topup) {
    if (!plansQ.data?.razorpayConfigured) {
      toast.error('Razorpay is not configured on the backend yet.');
      return;
    }
    setPendingKey(topup.key);
    try {
      const created = await billingApi.createOrder(topup.key);
      const response = await openCheckout({
        razorpayKeyId: created.razorpayKeyId,
        orderId: created.orderId,
        amountPaise: created.amountPaise,
        productName: topup.name,
        productDescription: topup.description,
        prefill: { email: scope?.email, name: workspace.ownerName },
        notes: { topup_key: topup.key },
      });
      await billingApi.verifyOrder({
        razorpayOrderId: response.razorpay_order_id!,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
        topupKey: topup.key,
      });
      toast.success(`Top-up added: ${topup.name}`);
    } catch (err) {
      if (err instanceof CheckoutError && err.code === 'USER_DISMISSED') return;
      toast.error(err instanceof Error ? err.message : 'Could not complete payment.');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={currentPlanKey ? `On ${currentPlanKey}` : 'Trial'}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          <PageHeader
            eyebrow="Account · Subscription"
            title="Plans and top-ups"
            description="Pick the plan that fits your practice — or top up AI calls and client slots without changing your plan."
          />

          {!plansQ.data?.razorpayConfigured && (
            <motion.div variants={fadeUp}>
              <Glass className="border border-amber-400/30 bg-amber-400/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-200" />
                  <div className="text-sm">
                    <div className="font-medium text-amber-800 dark:text-amber-100">Razorpay not configured — dev mode</div>
                    <div className="mt-1 text-amber-700 dark:text-amber-200/85">
                      Set <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> in the backend env for real checkout. Until then you can <strong>switch plans without payment</strong> to test feature gating — the buttons below apply instantly.
                    </div>
                    <button
                      type="button"
                      onClick={() => devActivateMut.mutate('trial')}
                      disabled={devActivateMut.isPending}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-100 transition-colors hover:bg-amber-400/20 disabled:opacity-50"
                    >
                      {devActivateMut.isPending && devActivateMut.variables === 'trial' && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      Reset to Trial
                    </button>
                  </div>
                </div>
              </Glass>
            </motion.div>
          )}

          {/* Usage meters — what's consumed against the current plan's quotas */}
          {usageMetrics.length > 0 && (
            <motion.div variants={fadeUp}>
              <Glass className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">This cycle</div>
                    <h2 className="mt-0.5 text-base font-semibold">Plan usage</h2>
                  </div>
                  <span className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[11px] capitalize text-foreground/70">
                    {limitsQ.data?.plan} plan
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {usageMetrics.map((m) => (
                    <UsageBar key={m.key} metric={m} />
                  ))}
                </div>
              </Glass>
            </motion.div>
          )}

          {/* Current subscription card */}
          {subQ.data?.subscription && (
            <motion.div variants={fadeUp}>
              <Glass variant="heavy" className="p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                      Current plan · {subQ.data.subscription.status}
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      {plansQ.data?.plans.find((p) => p.key === currentPlanKey)?.name ?? currentPlanKey}
                    </div>
                    {subQ.data.subscription.current_period_end && (
                      <div className="mt-1 text-xs text-foreground/65">
                        Renews on {new Date(subQ.data.subscription.current_period_end).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  {subQ.data.subscription.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => cancelMut.mutate()}
                      disabled={cancelMut.isPending}
                      className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2 text-xs text-foreground/75 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
                    >
                      {cancelMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Cancel at cycle end
                    </button>
                  )}
                </div>
              </Glass>
            </motion.div>
          )}

          {/* Monthly / annual switch */}
          <motion.div variants={fadeUp} className="flex justify-center">
            <CycleToggle cycle={cycle} onChange={setCycle} />
          </motion.div>

          {/* Plan tiles */}
          <motion.div variants={fadeUp} className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {plansQ.data?.plans.map((plan) => {
              const isCurrent = plan.key === currentPlanKey;
              const isPending =
                pendingKey === plan.key ||
                (devActivateMut.isPending && devActivateMut.variables === plan.key);
              const hasActive = !!currentPlanKey;
              const currentPlan = plansQ.data?.plans.find((p) => p.key === currentPlanKey);
              const isUpgrade = currentPlan ? plan.priceInr > currentPlan.priceInr : false;
              const changeLabel = isUpgrade ? 'Upgrade' : 'Downgrade';
              return (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  cycle={cycle}
                  currentKey={currentPlanKey as PlanKey | null}
                  pending={isPending}
                  ctaLabel={
                    devMode
                      ? `Switch to ${plan.name}`
                      : hasActive
                        ? changeLabel
                        : `Subscribe to ${plan.name}`
                  }
                  onSelect={(p) => {
                    if (isCurrent) return;
                    if (devMode) { devActivateMut.mutate(p.key); return; }
                    if (hasActive) setChangeTarget(p);
                    else handleSubscribe(p);
                  }}
                />
              );
            })}
          </motion.div>

          {/* Top-ups */}
          <motion.div variants={fadeUp}>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">One-time</div>
                <h2 className="mt-1 text-xl font-semibold">Top-ups</h2>
                <p className="mt-1 text-xs text-foreground/65 max-w-lg">
                  Need more capacity without changing plans? Buy a top-up — applied to your current billing cycle only.
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {plansQ.data?.topups.map((topup) => {
                const isPending = pendingKey === topup.key;
                const Icon = topup.key.startsWith('ai_calls') ? Zap : Users;
                return (
                  <Glass key={topup.key} className="flex flex-col p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)]">
                        <Icon className="h-4 w-4 text-teal-700 dark:text-teal-200" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{topup.name}</div>
                        <div className="mt-0.5 text-xs text-foreground/65">{topup.description}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-lg font-semibold">₹{topup.priceInr.toLocaleString('en-IN')}</div>
                      <button
                        type="button"
                        onClick={() => handleBuyTopup(topup)}
                        disabled={isPending || !plansQ.data?.razorpayConfigured}
                        className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
                      >
                        {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                        Buy
                      </button>
                    </div>
                  </Glass>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      </div>

      {changeTarget && (
        <ChangePlanModal target={changeTarget} onClose={() => setChangeTarget(null)} />
      )}
    </OwnerLayout>
  );
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }

/** Lightweight workspace identity for the layout chrome (same as Billing). */
function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}