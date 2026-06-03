import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Sparkles, ArrowRight, Receipt } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { UsageBar } from '@/modules/workspace/billing/components/UsageBar';
import { MOCK_SUBSCRIPTION } from '@/modules/workspace/billing/data/mockBilling';
import {
  SUBSCRIPTION_STATUS_META,
  daysUntil,
  formatDate,
  formatRupees,
} from '@/modules/workspace/billing/helpers';
import { PLANS } from '@/modules/onboarding/data/plans';
import { cn } from '@/lib/utils';

export default function OwnerSubscription() {
  const workspace = readWorkspace();
  const subscription = MOCK_SUBSCRIPTION;
  const meta = SUBSCRIPTION_STATUS_META[subscription.status];

  const [selectedPlanId, setSelectedPlanId] = useState<string>(subscription.planId);
  const isChanging = selectedPlanId !== subscription.planId;
  const selectedPlan = PLANS.find((p) => p.id === selectedPlanId);

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={null}
      topbarContext="Subscription"
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Subscription</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                Your plan
              </h1>
              <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
                Switch plans anytime. Changes apply immediately with prorated billing.
              </p>
            </div>

            <Link
              to="/billing"
              className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-sm text-foreground/85 transition-colors hover:bg-foreground/[0.06]"
            >
              <Receipt className="h-3.5 w-3.5" />
              View invoices
            </Link>
          </motion.div>

          {/* Current plan card */}
          <motion.div variants={fadeUp}>
            <AIGlow intensity="soft" animated={false}>
              <Glass variant="heavy" className="p-6 md:p-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-violet-700 dark:text-violet-200">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold tracking-tight">
                          {subscription.planName} plan
                        </h2>
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em]', meta.chip)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-3xl font-semibold tabular-nums">
                          ₹{formatRupees(subscription.pricePaise, { fractionDigits: 0 })}
                        </span>
                        <span className="text-sm text-foreground/75 dark:text-foreground/60">/month</span>
                      </div>
                      <div className="mt-2 text-xs text-foreground/75 dark:text-foreground/55">
                        Next invoice on{' '}
                        <span className="text-foreground/85">{formatDate(subscription.currentPeriodEnd)}</span>
                        {' · '}
                        in {daysUntil(subscription.currentPeriodEnd)} days
                      </div>
                    </div>
                  </div>

                  {/* Usage column */}
                  <div className="w-full md:max-w-md md:flex-shrink-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                      Usage this cycle
                    </div>
                    <div className="mt-3 space-y-3">
                      {subscription.usage.map((u) => (
                        <UsageBar key={u.key} metric={u} />
                      ))}
                    </div>
                  </div>
                </div>
              </Glass>
            </AIGlow>
          </motion.div>

          {/* Plan switcher */}
          <motion.div variants={fadeUp}>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Change plan</div>
                <div className="text-sm text-foreground/75 dark:text-foreground/55">
                  Click a plan to preview the change. We'll prorate based on remaining days.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((plan) => {
                const isCurrent = plan.id === subscription.planId;
                const isSelected = plan.id === selectedPlanId;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={cn(
                      'group relative h-full overflow-hidden rounded-2xl border bg-foreground/[0.02] p-5 text-left transition-all hover:-translate-y-0.5 hover:bg-foreground/[0.04]',
                      isSelected
                        ? 'border-violet-400/60 ring-1 ring-violet-400/40'
                        : 'border-foreground/[0.06]',
                    )}
                  >
                    {plan.popular && !isCurrent && (
                      <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
                        Popular
                      </div>
                    )}

                    {isCurrent && (
                      <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
                        <Check className="h-2.5 w-2.5" />
                        Current
                      </div>
                    )}

                    <div className="text-sm text-foreground/75 dark:text-foreground/55">{plan.name}</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-semibold">₹{plan.price}</span>
                      <span className="text-xs text-foreground/75 dark:text-foreground/60">/mo</span>
                    </div>
                    <div className="mt-3 text-xs text-foreground/75 dark:text-foreground/55">{plan.tagline}</div>
                    <ul className="mt-4 space-y-1.5 text-xs text-foreground/70">
                      {plan.highlights.slice(0, 3).map((h) => (
                        <li key={h} className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {/* Change preview */}
            {isChanging && selectedPlan && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="mt-5"
              >
                <AIGlow intensity="soft" animated>
                  <Glass variant="heavy" className="overflow-hidden">
                    <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-violet-700 dark:text-violet-200">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                            Preview
                          </div>
                          <div className="mt-0.5 text-sm font-medium text-foreground">
                            {subscription.planName} → {selectedPlan.name}
                          </div>
                          <div className="text-xs text-foreground/75 dark:text-foreground/55">
                            New rate ₹{selectedPlan.price}/mo · Prorated charge today, normal billing
                            resumes on {formatDate(subscription.currentPeriodEnd)}.
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedPlanId(subscription.planId)}
                          className="rounded-full border border-foreground/10 px-4 py-1.5 text-xs text-foreground/70 hover:bg-foreground/[0.04]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => toast.success(`Switched to ${selectedPlan.name}. Razorpay charge initiated.`)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-xs font-medium text-foreground"
                        >
                          Confirm switch
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </Glass>
                </AIGlow>
              </motion.div>
            )}
          </motion.div>

          {/* Danger zone */}
          <motion.div variants={fadeUp}>
            <Glass className="border-rose-400/15 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-medium text-rose-700 dark:text-rose-200/90">Cancel subscription</div>
                  <div className="mt-0.5 text-xs text-foreground/75 dark:text-foreground/55">
                    Your workspace stays active until {formatDate(subscription.currentPeriodEnd)}. After
                    that, it becomes read-only. Client data is preserved for 90 days.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toast('Cancel-subscription flow opens a confirmation dialog when wired.')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/[0.06] px-4 py-2 text-xs font-medium text-rose-100 transition-colors hover:bg-rose-400/15"
                >
                  Cancel subscription
                </button>
              </div>
            </Glass>
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

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

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
