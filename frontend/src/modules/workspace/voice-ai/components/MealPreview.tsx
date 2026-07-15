import { motion } from 'framer-motion';
import { CheckCircle2, Pencil, Sparkles, Sun, Coffee, Moon, Cookie } from 'lucide-react';

import { AIGlow, Glass } from '@/design-system';
import type { MealLogIntent } from '../types';

interface MealPreviewProps {
  intent: MealLogIntent;
  onLog: () => void;
  onEdit?: () => void;
}

const MEAL_ICON = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
} as const;

/**
 * MealPreview — structured render of a voice-parsed meal_log intent.
 * Appears after the AI reply when SIRAH LIFE has understood food entries.
 */
export function MealPreview({ intent, onLog, onEdit }: MealPreviewProps) {
  const MealIcon = MEAL_ICON[intent.mealType];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-2xl"
    >
      <AIGlow intensity="soft" animated>
        <Glass variant="heavy" className="overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-emerald-700 dark:text-emerald-200">
                <MealIcon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                  Parsed by SIRAH LIFE
                </div>
                <div className="text-sm font-medium capitalize text-foreground">
                  {intent.mealType} · {intent.items.length} {intent.items.length === 1 ? 'item' : 'items'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-semibold tabular-nums">{intent.totalCalories}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">kcal</div>
            </div>
          </div>

          {/* Items */}
          <ul className="divide-y divide-foreground/[0.04]">
            {intent.items.map((item) => (
              <li key={item.name} className="flex items-center gap-3 px-5 py-3">
                <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-teal-700 dark:text-teal-300/80" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{item.name}</div>
                  <div className="text-[11px] text-foreground/75 dark:text-foreground/60">
                    {item.portion} · {item.source}
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums text-foreground">
                  {item.calories}
                  <span className="ml-0.5 text-[10px] text-foreground/75 dark:text-foreground/55">kcal</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] px-5 py-3">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3.5 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={onLog}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-1.5 text-xs font-medium text-foreground transition-transform duration-200 hover:scale-[1.02] cta-glow active:scale-[0.97]"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Log this meal
            </button>
          </div>
        </Glass>
      </AIGlow>
    </motion.div>
  );
}
