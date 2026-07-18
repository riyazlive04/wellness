import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

import { fadeUp, stagger } from '@/design-system';
import { billingApi } from '@/modules/workspace/billing/api';
import { PlanCard, CycleToggle, type BillingCycle } from '@/modules/workspace/billing/PlanCard';
import { useOnboarding } from '../OnboardingContext';

/**
 * Plan picker. Reads the live billing catalog rather than a local copy — the
 * hard-coded list this used to render drifted from the real pricing and showed
 * retired tiers to new signups. Same PlanCard as Billing/Subscription, so all
 * three surfaces present pricing identically.
 *
 * Note: the choice is presentational — `finish()` creates the workspace on the
 * free trial and the buyer subscribes from /subscription afterwards.
 */
export function StepPlan() {
  const { draft, set } = useOnboarding();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const plansQ = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: billingApi.listPlans,
    staleTime: 5 * 60 * 1000,
  });

  if (plansQ.isLoading) {
    return (
      <div className="flex justify-center py-16 text-foreground/50">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const plans = plansQ.data?.plans ?? [];
  if (plans.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-foreground/60">
        Plans couldn’t be loaded right now - you can pick one later from Subscription.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <CycleToggle cycle={cycle} onChange={setCycle} />
      </div>

      <motion.div
        variants={stagger(0.05, 0.06)}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {plans.map((plan) => (
          <motion.div key={plan.key} variants={fadeUp} className="h-full">
            <PlanCard
              plan={plan}
              cycle={cycle}
              currentKey={draft.planId}
              currentLabel="Selected"
              ctaLabel={`Choose ${plan.name}`}
              onSelect={(p) => set('planId', p.key)}
              className="h-full"
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
