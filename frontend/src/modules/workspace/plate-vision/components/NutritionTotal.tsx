import { motion } from 'framer-motion';
import { Glass } from '@/design-system';
import type { DetectedItem } from '../types';

interface NutritionTotalProps {
  items: DetectedItem[];
}

export function NutritionTotal({ items }: NutritionTotalProps) {
  const total = items.reduce(
    (a, it) => ({
      calories: a.calories + it.macros.calories,
      protein:  +(a.protein  + it.macros.protein).toFixed(1),
      carbs:    +(a.carbs    + it.macros.carbs).toFixed(1),
      fat:      +(a.fat      + it.macros.fat).toFixed(1),
      fiber:    +(a.fiber    + (it.macros.fiber ?? 0)).toFixed(1),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );

  // Macro split for the bar (kcal contribution)
  const proteinKcal = total.protein * 4;
  const carbsKcal   = total.carbs   * 4;
  const fatKcal     = total.fat     * 9;
  const totalKcalCalc = Math.max(proteinKcal + carbsKcal + fatKcal, 1);
  const proteinPct = (proteinKcal / totalKcalCalc) * 100;
  const carbsPct   = (carbsKcal   / totalKcalCalc) * 100;
  const fatPct     = (fatKcal     / totalKcalCalc) * 100;

  return (
    <Glass className="p-5 md:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Total nutrition</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <motion.span
              key={total.calories}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="text-4xl font-semibold tabular-nums tracking-tight text-white"
            >
              {total.calories}
            </motion.span>
            <span className="text-sm text-white/45">kcal</span>
          </div>
        </div>
        <div className="text-xs text-white/55">{items.length} items detected</div>
      </div>

      {/* Stacked macro bar */}
      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
        <div className="flex h-full">
          <div className="h-full bg-emerald-400" style={{ width: `${proteinPct}%` }} />
          <div className="h-full bg-indigo-400"  style={{ width: `${carbsPct}%` }} />
          <div className="h-full bg-amber-400"   style={{ width: `${fatPct}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Macro dot="bg-emerald-400" label="Protein" value={total.protein} unit="g" />
        <Macro dot="bg-indigo-400"  label="Carbs"   value={total.carbs}   unit="g" />
        <Macro dot="bg-amber-400"   label="Fat"     value={total.fat}     unit="g" />
        <Macro dot="bg-white/40"    label="Fiber"   value={total.fiber}   unit="g" />
      </div>
    </Glass>
  );
}

function Macro({ dot, label, value, unit }: { dot: string; label: string; value: number; unit: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</span>
      </div>
      <div className="mt-1 text-lg font-medium tabular-nums text-white">
        {value} <span className="text-xs text-white/45">{unit}</span>
      </div>
    </div>
  );
}
