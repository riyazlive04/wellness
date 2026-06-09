import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Sparkles, Loader2, Zap, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { billingApi, type Plan, type PlanKey, type Topup, type TopupKey } from '@/modules/workspace/billing/api';
import { useRazorpayCheckout, CheckoutError } from '@/hooks/useRazorpayCheckout';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';

export default function OwnerSubscription() {
  const workspace = readWorkspace();
  const queryClient = useQueryClient();
  const { data: scope } = useScope();
  const { openCheckout } = useRazorpayCheckout();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

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

  const cancelMut = useMutation({
    mutationFn: billingApi.cancel,
    onSuccess: () => {
      toast.success('Subscription will end at the current cycle.');
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'subscription'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not cancel subscription.'),
  });

  const currentPlanKey = subQ.data?.subscription?.plan_key ?? null;

  async function handleSubscribe(plan: Plan) {
    if (!plansQ.data?.razorpayConfigured) {
      toast.error('Razorpay is not configured on the backend yet — ask the admin to set RAZORPAY_KEY_ID.');
      return;
    }
    setPendingKey(plan.key);
    try {
      const created = await billingApi.createSubscription(plan.key);
      const response = await openCheckout({
        razorpayKeyId: created.razorpayKeyId,
        subscriptionId: created.subscriptionId,
        productName: `SIRAH LIFE · ${plan.name}`,
        productDescription: `₹${plan.priceInr}/month — ${plan.tagline}`,
        prefill: { email: scope?.email, name: workspace.ownerName },
        notes: { plan_key: plan.key },
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
                    <div className="font-medium text-amber-800 dark:text-amber-100">Razorpay not configured yet</div>
                    <div className="mt-1 text-amber-700 dark:text-amber-200/85">
                      Set <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> in the backend env, then restart. Plan tiles will still render so you can preview them.
                    </div>
                  </div>
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

          {/* Plan tiles */}
          <motion.div variants={fadeUp} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plansQ.data?.plans.map((plan) => {
              const isCurrent = plan.key === currentPlanKey;
              const isPending = pendingKey === plan.key;
              return (
                <Glass
                  key={plan.key}
                  variant={plan.recommended ? 'heavy' : 'default'}
                  className={cn(
                    'relative flex flex-col p-5 transition-transform',
                    plan.recommended && 'ring-2 ring-violet-400/40',
                    isCurrent && 'ring-2 ring-emerald-400/50',
                  )}
                >
                  {plan.recommended && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-white">
                      <Sparkles className="mr-1 inline h-2.5 w-2.5" /> Most popular
                    </div>
                  )}
                  <div className="text-base font-semibold">{plan.name}</div>
                  <div className="mt-1 text-xs text-foreground/65">{plan.tagline}</div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold">₹{plan.priceInr.toLocaleString('en-IN')}</span>
                    <span className="text-xs text-foreground/55">/mo</span>
                  </div>
                  <ul className="mt-4 flex-1 space-y-2 text-xs">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-foreground/75">
                        <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan)}
                    disabled={isCurrent || isPending || !plansQ.data?.razorpayConfigured}
                    className={cn(
                      'mt-5 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all',
                      isCurrent
                        ? 'cursor-default bg-emerald-500/20 text-emerald-700 dark:text-emerald-200'
                        : plan.recommended
                          ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.55)] hover:scale-[1.03]'
                          : 'border border-foreground/10 hover:bg-foreground/[0.05]',
                      'disabled:opacity-60 disabled:hover:scale-100',
                    )}
                  >
                    {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {isCurrent ? 'Current plan' : `Subscribe to ${plan.name}`}
                  </button>
                </Glass>
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
                      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15">
                        <Icon className="h-4 w-4 text-violet-700 dark:text-violet-200" />
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
    </OwnerLayout>
  );
}