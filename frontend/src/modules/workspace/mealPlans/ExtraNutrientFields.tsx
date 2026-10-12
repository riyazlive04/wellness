import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { mealPlansApi, type NutrientColumn } from '../api/mealPlans';

const SLOTS_KEY = ['workspace', 'meal-plans', 'slots'];

/**
 * The practice's extra nutrient fields (Sodium, Potassium, or its own, e.g.
 * "Water, ml") on the meal form. "+ Add nutrient" and the × on a field change
 * the columns for every meal in the practice; values belong to this meal.
 */
export function ExtraNutrientFields({
  columns, catalogue, values, onChange, inputCls,
}: {
  columns: NutrientColumn[];
  catalogue: Array<Omit<NutrientColumn, 'custom'>>;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  inputCls: string;
}) {
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState({ label: '', unit: '' });

  const saveColumns = useMutation({
    mutationFn: (next: Array<{ key?: string; label?: string; unit?: string }>) => mealPlansApi.setNutrients(next),
    onSuccess: (saved) => {
      qc.setQueryData(SLOTS_KEY, (old: Record<string, unknown> | undefined) => (old ? { ...old, nutrients: saved } : old));
      // Plans carry the columns too (labels for the client's view).
      void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plan'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save your nutrients'),
  });

  const asInput = () => columns.map((c) => ({ key: c.key, label: c.label, unit: c.unit }));
  const add = (col: { key?: string; label: string; unit: string }) => {
    saveColumns.mutate([...asInput(), col], {
      onSuccess: () => toast.success(`${col.label} added to every meal`),
    });
    setMenu(false);
    setCustom({ label: '', unit: '' });
  };
  const remove = (col: NutrientColumn) => {
    if (!confirm(`Remove ${col.label} from all meals in your practice? Values already entered are kept and come back if you add it again.`)) return;
    saveColumns.mutate(asInput().filter((c) => c.key !== col.key));
  };
  const available = catalogue.filter((c) => !columns.some((x) => x.key === c.key));

  return (
    <div className="space-y-2">
      {columns.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {columns.map((c) => (
            <div key={c.key}>
              <div className="mb-1.5 flex items-center justify-between gap-1 text-xs font-medium text-foreground/70">
                <span className="truncate">{c.label}{c.unit ? ` (${c.unit})` : ''}</span>
                <button
                  type="button"
                  onClick={() => remove(c)}
                  className="grid h-4 w-4 flex-shrink-0 place-items-center rounded text-foreground/35 hover:bg-rose-500/10 hover:text-rose-600"
                  title={`Remove ${c.label} from all meals`}
                  aria-label={`Remove ${c.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <input
                type="number" min={0} step="0.1" inputMode="decimal"
                value={values[c.key] ?? ''}
                onChange={(e) => onChange({ ...values, [c.key]: e.target.value })}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          disabled={saveColumns.isPending || columns.length >= 12}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-foreground/20 px-3 py-1 text-xs font-medium text-foreground/70 hover:border-teal-400/40 hover:text-teal-600 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add nutrient
        </button>
        {menu && (
          <>
            <button type="button" aria-hidden tabIndex={-1} onClick={() => setMenu(false)} className="fixed inset-0 z-10 cursor-default" />
            <div className="absolute left-0 z-20 mt-1 w-72 rounded-xl border border-foreground/10 bg-surface-1 p-2 shadow-xl">
              {available.length > 0 && (
                <>
                  <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">From the food database</div>
                  <div className="flex flex-wrap gap-1.5 px-1 pb-2">
                    {available.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => add(c)}
                        className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs text-foreground/80 hover:bg-teal-400/[0.12] hover:text-foreground"
                      >
                        {c.label} <span className="text-foreground/45">{c.unit}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="border-t border-foreground/[0.06] px-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">Your own</div>
              <div className="mt-1.5 flex gap-1.5 px-1">
                <input
                  value={custom.label}
                  onChange={(e) => setCustom({ ...custom, label: e.target.value })}
                  placeholder="Name, e.g. Water"
                  maxLength={30}
                  className={cn(inputCls, 'flex-1 px-2.5 py-1.5 text-xs')}
                />
                <input
                  value={custom.unit}
                  onChange={(e) => setCustom({ ...custom, unit: e.target.value })}
                  placeholder="Unit"
                  maxLength={10}
                  className={cn(inputCls, 'w-16 px-2.5 py-1.5 text-xs')}
                />
                <button
                  type="button"
                  onClick={() => custom.label.trim() && add({ label: custom.label.trim(), unit: custom.unit.trim() })}
                  disabled={!custom.label.trim()}
                  className="rounded-lg bg-foreground px-2.5 text-xs font-semibold text-canvas disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <p className="mt-2 px-1 text-[10px] leading-snug text-foreground/45">Shown on every meal for all your clients.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
