import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Wallet, FileText, AlertTriangle, CheckCircle2,
  Download, Loader2, Bell, BellOff, Zap, Users, AlertCircle, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { KPICard } from '@/modules/workspace/components/KPICard';
import {
  billingApi,
  type ServerInvoice, type BillingNotification, type Plan, type PlanKey, type Topup,
} from '@/modules/workspace/billing/api';
import { PlanCard, CycleToggle, type BillingCycle } from '@/modules/workspace/billing/PlanCard';
import { UsageBar } from '@/modules/workspace/billing/components/UsageBar';
import { ChangePlanModal } from '@/modules/workspace/billing/components/ChangePlanModal';
import { SubscribeConfirmModal } from '@/modules/workspace/billing/components/SubscribeConfirmModal';
import type { UsageMetric } from '@/modules/workspace/billing/types';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { tenancyApi } from '@/modules/workspace/api/tenancy';
import { policiesApi } from '@/modules/workspace/api/policies';
import { generateInvoicePdf } from '@/modules/workspace/billing/invoicePdf';
import { formatRupees, formatDate, daysUntil } from '@/modules/workspace/billing/helpers';
import { useRazorpayCheckout, CheckoutError } from '@/hooks/useRazorpayCheckout';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';

const PAST_DUE_STATUSES = new Set(['halted', 'pending']);

/** One page for everything account-level: "Plans & usage" (manage what you pay
 *  for), "Invoices" (see what you paid), and "Privacy policy" (the Sirah Digital
 *  policy governing the workspace). Deep-linkable via `?tab=invoices|privacy`. */
type BillingTab = 'plans' | 'invoices' | 'privacy';

export default function OwnerBilling() {
  const workspace = readWorkspace();
  const queryClient = useQueryClient();
  const { data: scope } = useScope();
  const { openCheckout } = useRazorpayCheckout();

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: BillingTab = rawTab === 'invoices' ? 'invoices' : rawTab === 'privacy' ? 'privacy' : 'plans';
  const setTab = (t: BillingTab) =>
    setSearchParams(t === 'plans' ? {} : { tab: t }, { replace: true });

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [changeTarget, setChangeTarget] = useState<Plan | null>(null);
  const [subscribeTarget, setSubscribeTarget] = useState<Plan | null>(null);
  // Monthly vs annual is presentation-only for now — the subscribe flow still
  // uses the monthly Razorpay plan until the annual plan IDs are provisioned.
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const plansQ = useQuery({ queryKey: ['billing', 'plans'], queryFn: billingApi.listPlans, staleTime: 5 * 60 * 1000, retry: 1 });
  const subQ = useQuery({ queryKey: ['billing', 'me', 'subscription'], queryFn: billingApi.currentSubscription, retry: 1 });
  const invQ = useQuery({ queryKey: ['billing', 'me', 'invoices'], queryFn: billingApi.listInvoices, retry: 1 });
  const notifQ = useQuery({ queryKey: ['billing', 'me', 'notifications'], queryFn: billingApi.listNotifications, retry: 1 });
  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: workspacesApi.me, retry: 1 });
  const limitsQ = useQuery({ queryKey: ['tenancy', 'limits'], queryFn: tenancyApi.getLimits, retry: 1 });
  const policyQ = useQuery({ queryKey: ['privacy-policy', 'current'], queryFn: policiesApi.current, retry: 1 });

  const subscription = subQ.data?.subscription ?? null;
  const ws = wsQ.data;

  // ── Plan + remaining-days resolution ──
  // A paid plan has a current_period_end (next renewal); otherwise we're on the
  // trial, whose end date lives on the workspace record. Prefer a real
  // subscription's plan; fall back to the resolved plan (covers dev-activated
  // plans that set workspaces.plan without a subscription row).
  const onPaidPlan = !!subscription?.current_period_end;
  const resolvedPlan = limitsQ.data?.plan ?? null;
  const currentPlanKey =
    subscription?.plan_key ??
    (resolvedPlan && resolvedPlan !== 'trial' ? resolvedPlan : null);
  // Change-plan needs a real Razorpay subscription. A workspace.plan label from
  // dev-activate (or an abandoned checkout) is not enough — those must go
  // through Subscribe / checkout instead of Upgrade.
  const ACTIVE_SUB_STATUSES = new Set(['active', 'authenticated', 'pending', 'halted']);
  const hasRazorpaySubscription = !!(
    subscription?.razorpay_subscription_id &&
    ACTIVE_SUB_STATUSES.has(subscription.status)
  );
  const trialEndsAt = ws?.trial_ends_at ?? subscription?.trial_ends_at ?? null;
  const renewsAt = onPaidPlan ? subscription!.current_period_end! : trialEndsAt;
  const daysLeft = renewsAt ? Math.max(0, daysUntil(renewsAt)) : null;
  const trialDaysLeft = !onPaidPlan && trialEndsAt ? Math.max(0, daysUntil(trialEndsAt)) : null;
  const planName =
    plansQ.data?.plans.find((p) => p.key === currentPlanKey)?.name ??
    currentPlanKey ??
    'Trial';

  const invoices = invQ.data?.invoices ?? [];
  const notifications = notifQ.data?.notifications ?? [];
  const unread = notifQ.data?.unread ?? 0;
  const isPastDue = subscription ? PAST_DUE_STATUSES.has(subscription.status) : false;

  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, inv) => {
        acc.lifetime += inv.status === 'paid' ? inv.amount_paise : 0;
        if (inv.status === 'paid') acc.paid += inv.amount_paise;
        if (inv.status === 'issued' || inv.status === 'partially_paid') acc.outstanding += inv.amount_paise;
        return acc;
      },
      { lifetime: 0, paid: 0, outstanding: 0 },
    );
  }, [invoices]);
  const outstandingCount = invoices.filter((i) => i.status === 'issued' || i.status === 'partially_paid').length;

  // ── Usage meters ──
  const usageMetrics: UsageMetric[] = limitsQ.data
    ? [
        { key: 'clients', label: 'Clients', used: limitsQ.data.usage.clients, limit: limitsQ.data.limits.maxClients },
        { key: 'aiCalls', label: 'AI calls (this month)', used: limitsQ.data.usage.aiCallsThisMonth, limit: limitsQ.data.limits.aiCallsPerMonth },
        { key: 'teamSeats', label: 'Team seats', used: limitsQ.data.usage.team, limit: limitsQ.data.limits.maxTeam },
      ]
    : [];

  // Razorpay off → local dev: plans switch without payment so feature gating can
  // be exercised end-to-end. The backend 403s this once keys exist.
  const devMode = plansQ.data ? !plansQ.data.razorpayConfigured : false;

  // ── Mutations & handlers ──
  const cancelMut = useMutation({
    mutationFn: billingApi.cancel,
    onSuccess: () => {
      toast.success('Subscription will end at the current cycle.');
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'subscription'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not cancel subscription.'),
  });

  const acceptPolicyMut = useMutation({
    mutationFn: policiesApi.accept,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-policy'] });
      toast.success('Privacy policy accepted.');
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not accept the policy.'),
  });

  const devActivateMut = useMutation({
    mutationFn: (planKey: string) => billingApi.devActivatePlan(planKey),
    onSuccess: (_data, planKey) => {
      toast.success(planKey === 'trial' ? 'Reset to Trial (dev - no payment).' : `Switched to ${planKey} (dev - no payment).`);
      // Re-resolve plan-derived state everywhere: usage limits, subscription,
      // and scope (so the sidebar re-gates its feature nav immediately).
      queryClient.invalidateQueries({ queryKey: ['tenancy', 'limits'] });
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['scope'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not switch plan.'),
  });

  async function handleDownload(inv: ServerInvoice) {
    setDownloadingId(inv.id);
    try {
      const { invoice } = await billingApi.getInvoice(inv.id);
      await generateInvoicePdf(invoice);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate the invoice PDF.');
    } finally {
      setDownloadingId(null);
    }
  }

  async function markAllRead() {
    try {
      await billingApi.markAllNotificationsRead();
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'notifications'] });
    } catch {
      toast.error('Could not mark notifications as read.');
    }
  }

  async function handleSubscribe(plan: Plan) {
    if (!plansQ.data?.razorpayConfigured) {
      toast.error('Razorpay is not configured on the backend yet - ask the admin to set RAZORPAY_KEY_ID.');
      return;
    }
    setPendingKey(plan.key);
    try {
      const created = await billingApi.createSubscription(plan.key, cycle);
      const billed = cycle === 'annual' && plan.priceInrAnnual != null ? plan.priceInrAnnual : plan.priceInr;
      const response = await openCheckout({
        razorpayKeyId: created.razorpayKeyId,
        subscriptionId: created.subscriptionId,
        productName: `SIRAH LIFE · ${plan.name}`,
        productDescription: `₹${billed.toLocaleString('en-IN')}/${cycle === 'annual' ? 'year' : 'month'} - ${plan.tagline}`,
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
      queryClient.invalidateQueries({ queryKey: ['tenancy', 'limits'] });
      queryClient.invalidateQueries({ queryKey: ['scope'] });
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
      trialDaysLeft={trialDaysLeft}
      topbarContext={currentPlanKey ? `Billing · ${planName}` : 'Billing · Trial'}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          <PageHeader
            eyebrow="Account · Billing"
            title="Billing & subscription"
            description="Manage your plan and top-ups, track usage, and download GST-compliant invoices - all in one place."
          />

          {/* Failed-payment recovery banner — always visible while past due */}
          {isPastDue && (
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden border-rose-400/30 bg-rose-400/[0.05]">
                <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-rose-400/15 text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">Payment failed - update your card</div>
                      <div className="mt-0.5 text-xs text-foreground/80 dark:text-foreground/65">
                        We couldn't charge your saved card for the latest renewal. Your plan stays active during a
                        14-day grace period; after that the workspace is downgraded to trial limits until payment resumes.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('plans')}
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-rose-500 to-rose-400 px-4 py-2 text-xs font-medium text-white"
                  >
                    Fix payment
                  </button>
                </div>
              </Glass>
            </motion.div>
          )}

          {/* Current plan strip — persistent context across both tabs */}
          <motion.div variants={fadeUp}>
            <Glass className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-teal-700 dark:text-teal-200">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Current plan</div>
                  <div className="mt-0.5 flex items-center gap-2 text-base font-medium text-foreground capitalize">
                    {planName}
                    {onPaidPlan && subscription?.amount_paise
                      ? <span className="text-foreground/70">· ₹{formatRupees(subscription.amount_paise, { fractionDigits: 0 })}/mo</span>
                      : null}
                    {daysLeft !== null && (
                      <span className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal',
                        !onPaidPlan && daysLeft <= 5
                          ? 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200'
                          : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
                      )}>
                        {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-foreground/75 dark:text-foreground/55">
                {onPaidPlan ? (
                  <span>Renews on <span className="text-foreground/85">{formatDate(renewsAt!)}</span></span>
                ) : trialEndsAt ? (
                  <span>Trial ends <span className="text-foreground/85">{formatDate(trialEndsAt)}</span></span>
                ) : null}
                {subscription?.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => cancelMut.mutate()}
                    disabled={cancelMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-foreground/75 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
                  >
                    {cancelMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Cancel at cycle end
                  </button>
                )}
              </div>
            </Glass>
          </motion.div>

          {/* Tab bar */}
          <motion.div variants={fadeUp} className="flex w-fit items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] p-1">
            <TabButton active={tab === 'plans'} onClick={() => setTab('plans')}>Plans &amp; usage</TabButton>
            <TabButton active={tab === 'invoices'} onClick={() => setTab('invoices')}>
              Invoices
              {outstandingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200">{outstandingCount}</span>
              )}
            </TabButton>
            <TabButton active={tab === 'privacy'} onClick={() => setTab('privacy')}>Privacy policy</TabButton>
          </motion.div>

          {/* ── Plans & usage tab ── */}
          {tab === 'plans' && (
            <motion.div key="plans" variants={stagger(0.05, 0.03)} initial="initial" animate="animate" className="space-y-7">
              {!plansQ.data?.razorpayConfigured && (
                <motion.div variants={fadeUp}>
                  <Glass className="border border-amber-400/30 bg-amber-400/10 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-200" />
                      <div className="text-sm">
                        <div className="font-medium text-amber-800 dark:text-amber-100">Razorpay not configured - dev mode</div>
                        <div className="mt-1 text-amber-700 dark:text-amber-200/85">
                          Set <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> in the backend env for real checkout. Until then you can <strong>switch plans without payment</strong> to test feature gating - the buttons below apply instantly.
                        </div>
                        <button
                          type="button"
                          onClick={() => devActivateMut.mutate('trial')}
                          disabled={devActivateMut.isPending}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-100 transition-colors hover:bg-amber-400/20 disabled:opacity-50"
                        >
                          {devActivateMut.isPending && devActivateMut.variables === 'trial' && <Loader2 className="h-3 w-3 animate-spin" />}
                          Reset to Trial
                        </button>
                      </div>
                    </div>
                  </Glass>
                </motion.div>
              )}

              {/* Usage meters — consumption against the current plan's quotas */}
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
                      {usageMetrics.map((m) => <UsageBar key={m.key} metric={m} />)}
                    </div>
                  </Glass>
                </motion.div>
              )}

              {/* Monthly / annual switch */}
              <motion.div variants={fadeUp} className="flex justify-center">
                <CycleToggle cycle={cycle} onChange={setCycle} />
              </motion.div>

              {/* Plan tiles (interactive) */}
              <motion.div variants={fadeUp} className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {plansQ.data?.plans.map((plan) => {
                  // Only lock a card as "Current plan" when a real Razorpay
                  // subscription exists. A soft starter label (dev-activate /
                  // trial fall-through) must still let the user open checkout
                  // for any chosen plan — including switching Starter → Growth.
                  const cardCurrentKey = hasRazorpaySubscription
                    ? (currentPlanKey as PlanKey | null)
                    : null;
                  const isCurrent = cardCurrentKey === plan.key;
                  const isPending = pendingKey === plan.key || (devActivateMut.isPending && devActivateMut.variables === plan.key);
                  const currentPlan = plansQ.data?.plans.find((p) => p.key === currentPlanKey);
                  const isUpgrade = currentPlan ? plan.priceInr > currentPlan.priceInr : false;
                  const changeLabel = isUpgrade ? 'Upgrade' : 'Downgrade';
                  const payLabel = `Pay for ${plan.name}`;
                  return (
                    <PlanCard
                      key={plan.key}
                      plan={plan}
                      cycle={cycle}
                      currentKey={cardCurrentKey}
                      pending={isPending}
                      ctaLabel={devMode ? `Switch to ${plan.name}` : hasRazorpaySubscription ? changeLabel : payLabel}
                      onSelect={(p) => {
                        if (isCurrent) return;
                        if (devMode) { devActivateMut.mutate(p.key); return; }
                        // First paid journey (or soft plan only): open Razorpay
                        // checkout for the chosen plan. Change-plan is only for
                        // real active subscriptions.
                        if (hasRazorpaySubscription) setChangeTarget(p);
                        else setSubscribeTarget(p);
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
                    <p className="mt-1 max-w-lg text-xs text-foreground/65">
                      Need more capacity without changing plans? Buy a top-up - applied to your current billing cycle only.
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
          )}

          {/* ── Invoices tab ── */}
          {tab === 'invoices' && (
            <motion.div key="invoices" variants={stagger(0.05, 0.03)} initial="initial" animate="animate" className="space-y-7">
              {/* KPI strip */}
              <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KPICard icon={Wallet} label="Lifetime paid" value={`₹${formatRupees(totals.lifetime, { fractionDigits: 0 })}`} hint={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`} accent="indigo" />
                <KPICard icon={CheckCircle2} label="Settled" value={`₹${formatRupees(totals.paid, { fractionDigits: 0 })}`} hint="all paid cycles" accent="sage" />
                <KPICard icon={FileText} label="Outstanding" value={`₹${formatRupees(totals.outstanding, { fractionDigits: 0 })}`} hint={`${outstandingCount} pending`} accent={totals.outstanding > 0 ? 'sand' : 'sage'} />
              </motion.div>

              {/* Billing activity */}
              {notifications.length > 0 && (
                <motion.div variants={fadeUp}>
                  <Glass className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-foreground/70" />
                        <div className="text-sm font-medium text-foreground">Billing activity</div>
                        {unread > 0 && (
                          <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-200">{unread} new</span>
                        )}
                      </div>
                      {unread > 0 && (
                        <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.06]">
                          <BellOff className="h-3 w-3" /> Mark all read
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-foreground/[0.04]">
                      {notifications.slice(0, 8).map((n) => <NotificationItem key={n.id} n={n} />)}
                    </ul>
                  </Glass>
                </motion.div>
              )}

              {/* Invoices table */}
              <motion.div variants={fadeUp}>
                <Glass className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                    <div>
                      <div className="text-sm font-medium text-foreground">Invoices</div>
                      <div className="text-xs text-foreground/75 dark:text-foreground/60">Download a GST-compliant PDF for any invoice</div>
                    </div>
                  </div>

                  <div className="hidden grid-cols-[1.4fr_1fr_1fr_120px_120px] gap-4 border-b border-foreground/[0.04] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55 md:grid">
                    <div>Invoice</div><div>Date</div><div>Amount</div><div>Status</div><div className="text-right">PDF</div>
                  </div>

                  {invQ.isLoading ? (
                    <div className="px-5 py-10 text-center text-sm text-foreground/55"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
                  ) : invoices.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                      <FileText className="mx-auto h-8 w-8 text-foreground/25" />
                      <div className="mt-3 text-sm text-foreground/70">No invoices yet</div>
                      <div className="mt-1 text-xs text-foreground/50">Your first invoice appears here after your first payment.</div>
                    </div>
                  ) : (
                    <ul>
                      {invoices.map((inv) => (
                        <InvoiceListRow key={inv.id} inv={inv} downloading={downloadingId === inv.id} onDownload={() => handleDownload(inv)} />
                      ))}
                    </ul>
                  )}
                </Glass>
              </motion.div>

              <motion.div variants={fadeUp} className="text-[11px] text-foreground/35">
                Invoices are GST-inclusive (CGST + SGST for intra-state, IGST for inter-state). Subscription charges are
                also invoiced by Razorpay; top-up payments are invoiced here.
              </motion.div>
            </motion.div>
          )}

          {/* ── Privacy policy tab ── */}
          {tab === 'privacy' && (
            <motion.div key="privacy" variants={stagger(0.05, 0.03)} initial="initial" animate="animate" className="space-y-5">
              <motion.div variants={fadeUp}>
                <p className="text-sm text-foreground/60">
                  The privacy policy published by Sirah Digital that governs your workspace.
                </p>
              </motion.div>

              {policyQ.isLoading ? (
                <motion.div variants={fadeUp}>
                  <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                  </Glass>
                </motion.div>
              ) : !policyQ.data?.policy ? (
                <motion.div variants={fadeUp}>
                  <Glass className="p-10 text-center text-sm text-foreground/55">
                    No privacy policy has been published yet.
                  </Glass>
                </motion.div>
              ) : (
                <motion.div variants={fadeUp}>
                  <Glass className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/[0.08] px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-teal-700 dark:text-teal-200">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold tracking-tight">{policyQ.data.policy.title}</h2>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
                            v{policyQ.data.policy.version} · {new Date(policyQ.data.policy.published_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {policyQ.data.accepted ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Accepted
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={acceptPolicyMut.isPending}
                          onClick={() => acceptPolicyMut.mutate()}
                          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-xs font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-60"
                        >
                          {acceptPolicyMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                          I accept
                        </button>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap px-6 py-6 text-sm leading-relaxed text-foreground/85">
                      {policyQ.data.policy.content}
                    </div>
                  </Glass>
                </motion.div>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>

      {changeTarget && <ChangePlanModal target={changeTarget} onClose={() => setChangeTarget(null)} />}
      {subscribeTarget && (
        <SubscribeConfirmModal
          target={subscribeTarget}
          cycle={cycle}
          softCurrentPlanName={
            currentPlanKey && currentPlanKey !== subscribeTarget.key ? planName : null
          }
          pending={pendingKey === subscribeTarget.key}
          onClose={() => setSubscribeTarget(null)}
          onConfirm={() => {
            const plan = subscribeTarget;
            setSubscribeTarget(null);
            void handleSubscribe(plan);
          }}
        />
      )}
    </OwnerLayout>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-white text-foreground shadow-sm dark:bg-white/10' : 'text-foreground/60 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

const INVOICE_CHIP: Record<string, string> = {
  paid: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
  issued: 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200',
  partially_paid: 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
  cancelled: 'border-foreground/15 bg-foreground/[0.04] text-foreground/70',
  expired: 'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200',
  draft: 'border-foreground/15 bg-foreground/[0.04] text-foreground/70',
};

function InvoiceListRow({ inv, downloading, onDownload }: { inv: ServerInvoice; downloading: boolean; onDownload: () => void }) {
  const chip = INVOICE_CHIP[inv.status] ?? INVOICE_CHIP.draft;
  return (
    <li className="grid grid-cols-2 items-center gap-4 border-b border-foreground/[0.04] px-5 py-3.5 last:border-0 md:grid-cols-[1.4fr_1fr_1fr_120px_120px]">
      <div className="min-w-0">
        <div className="truncate font-mono text-xs text-foreground/85">{inv.invoice_number ?? inv.id.slice(0, 8)}</div>
        <div className="text-[11px] capitalize text-foreground/75 dark:text-foreground/60">
          {inv.razorpay_invoice_id ? 'Subscription' : 'Top-up'}
        </div>
      </div>
      <div className="hidden text-xs text-foreground/80 dark:text-foreground/65 md:block">{formatDate(inv.issued_at ?? inv.created_at)}</div>
      <div className="tabular-nums text-sm font-medium text-foreground">₹{formatRupees(inv.amount_paise, { fractionDigits: 0 })}</div>
      <div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em]', chip)}>
          {inv.status.replace('_', ' ')}
        </span>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-foreground/[0.06] disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          PDF
        </button>
      </div>
    </li>
  );
}

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-teal-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  critical: 'bg-rose-400',
};

function NotificationItem({ n }: { n: BillingNotification }) {
  return (
    <li className={cn('flex items-start gap-3 px-5 py-3.5', !n.read_at && 'bg-foreground/[0.015]')}>
      <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', SEVERITY_DOT[n.severity] ?? SEVERITY_DOT.info)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{n.title}</div>
        {n.body && <div className="mt-0.5 text-xs text-foreground/70 dark:text-foreground/55">{n.body}</div>}
      </div>
      <div className="flex-shrink-0 text-[11px] text-foreground/40">{formatDate(n.created_at)}</div>
    </li>
  );
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }

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
