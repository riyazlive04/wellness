import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SLOTS, MEAL_SLOTS, SLOT_LABELS, mealPlansApi, type MealPlan, type MealSlot,
} from '../api/mealPlans';

/**
 * AI drafts the week; the nutritionist edits it. The output always lands as
 * draft cards — nothing is published on their behalf, because a clinical plan
 * reaching a client unreviewed is not acceptable.
 */
export function GeneratePlanDialog({
  plan, clientName, onClose, onDone,
}: {
  plan: MealPlan;
  clientName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [slots, setSlots] = useState<MealSlot[]>(DEFAULT_SLOTS);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const hasCards = !!plan.cards?.length;
  const [replace, setReplace] = useState(hasCards);

  function toggle(s: MealSlot) {
    setSlots((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : MEAL_SLOTS.filter((m) => m === s || cur.includes(m))));
  }

  async function run() {
    if (!slots.length) {
      toast.error('Pick at least one meal slot');
      return;
    }
    setBusy(true);
    try {
      await mealPlansApi.generate(plan.id, { slots, notes: notes.trim() || undefined, replace });
      toast.success('Draft ready - review it before publishing');
      onDone();
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? 'Generation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" onClick={() => !busy && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg p-4 md:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <AIGlow intensity="soft" animated={false}>
          <Glass variant="heavy" className="max-h-[85vh] overflow-y-auto rounded-2xl">
            <header className="flex items-start justify-between px-6 pt-6">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Draft week {plan.week_number} with AI
                </h2>
                <p className="mt-1 text-xs text-foreground/60">
                  Uses {clientName}'s goals, targets, allergies and preferences.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-4 px-6 pb-6 pt-4">
              <div>
                <div className="mb-1.5 text-xs font-medium text-foreground/70">Meal slots to fill</div>
                <div className="flex flex-wrap gap-1.5">
                  {MEAL_SLOTS.map((s) => {
                    const on = slots.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggle(s)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          on
                            ? 'border-teal-400/60 bg-teal-400/10 text-foreground'
                            : 'border-foreground/10 text-foreground/60 hover:bg-foreground/[0.04]',
                        )}
                      >
                        {SLOT_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <div className="mb-1.5 text-xs font-medium text-foreground/70">
                  Anything to steer it? (optional)
                </div>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={1000}
                  placeholder="e.g. high protein, South Indian breakfasts, no dairy after 6pm"
                  className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
                />
              </label>

              {hasCards && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-amber-500"
                  />
                  <span className="text-xs text-foreground/80">
                    <span className="font-medium">Replace the {plan.cards!.length} meals already in this week.</span>
                    <br />
                    Uncheck to keep them and add the generated meals alongside - which will leave
                    two meals in some slots.
                  </span>
                </label>
              )}

              <div className="flex items-start gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3 text-[11px] leading-relaxed text-foreground/60">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                AI drafts land as a <strong className="text-foreground/80">draft</strong> for you to check.
                Review every meal against {clientName}'s allergies and conditions before publishing -
                you are the clinician, not the model.
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={busy || !slots.length}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Drafting {slots.length * 7} meals…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate draft
                    </>
                  )}
                </button>
              </div>
            </div>
          </Glass>
        </AIGlow>
      </motion.div>
    </div>
  );
}
