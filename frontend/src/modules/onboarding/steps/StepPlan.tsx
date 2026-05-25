import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { useOnboarding } from '../OnboardingContext';
import { PLANS } from '../data/plans';

export function StepPlan() {
  const { draft, set } = useOnboarding();

  return (
    <motion.div
      variants={stagger(0.05, 0.06)}
      initial="initial"
      animate="animate"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      {PLANS.map((plan) => {
        const selected = draft.planId === plan.id;
        return (
          <motion.button
            key={plan.id}
            variants={fadeUp}
            onClick={() => set('planId', plan.id)}
            type="button"
            className="text-left"
          >
            <Glass
              interactive
              variant={selected ? 'heavy' : 'default'}
              className={`relative h-full p-5 transition-all duration-200 ${
                selected ? 'ring-1 ring-violet-400/60' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-violet-200">
                  <Sparkles className="h-3 w-3" />
                  Most popular
                </div>
              )}

              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-foreground/55">{plan.name}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold">₹{plan.price}</span>
                    <span className="text-xs text-foreground/55">/mo</span>
                  </div>
                </div>

                <div
                  className={`mt-1 grid h-6 w-6 place-items-center rounded-full border transition-colors ${
                    selected
                      ? 'border-emerald-400 bg-emerald-400/20'
                      : 'border-foreground/15 bg-transparent'
                  }`}
                >
                  {selected && <Check className="h-3.5 w-3.5 text-emerald-300" />}
                </div>
              </div>

              <div className="mt-3 text-xs text-foreground/55">{plan.tagline}</div>

              <ul className="mt-5 space-y-2 text-xs text-foreground/75">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />
                    {h}
                  </li>
                ))}
              </ul>
            </Glass>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
