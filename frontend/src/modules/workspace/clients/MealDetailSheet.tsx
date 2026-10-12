import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Lightbulb, Loader2, Utensils, X } from 'lucide-react';

import { Sheet } from '@/components/Sheet';
import { clientsApi, type MealDetail } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/** The four nutrients every logged meal carries, with their calories per gram. */
const MACROS = [
  { key: 'protein_g', label: 'Protein', kcalPerG: 4, bar: 'bg-[hsl(var(--brand-blue))]' },
  { key: 'carbohydrate_g', label: 'Carbs', kcalPerG: 4, bar: 'bg-amber-500' },
  { key: 'fat_g', label: 'Fat', kcalPerG: 9, bar: 'bg-rose-500' },
  { key: 'fiber_g', label: 'Fiber', kcalPerG: 0, bar: 'bg-emerald-500' },
] as const;

/** Snapshot keys that aren't nutrients, or are already shown above. */
const NOT_EXTRA = new Set(['energy_kcal', 'energy_kj', 'protein_g', 'carbohydrate_g', 'fat_g', 'fiber_g', 'serving_g', 'source', 'barcode', 'glycemic_index']);

const NAMES: Record<string, string> = {
  sugar_g: 'Sugar', starch_g: 'Starch', saturated_fat_g: 'Saturated fat', trans_fat_g: 'Trans fat',
  mufa_g: 'Monounsaturated fat', pufa_g: 'Polyunsaturated fat', cholesterol_mg: 'Cholesterol',
  sodium_mg: 'Sodium', potassium_mg: 'Potassium', calcium_mg: 'Calcium', iron_mg: 'Iron', magnesium_mg: 'Magnesium',
  phosphorus_mg: 'Phosphorus', zinc_mg: 'Zinc', copper_mg: 'Copper', manganese_mg: 'Manganese', selenium_mcg: 'Selenium',
  iodine_mcg: 'Iodine', chromium_mcg: 'Chromium', choline_mg: 'Choline', water_g: 'Water', ash_g: 'Ash',
  vit_a_mcg_rae: 'Vitamin A', vit_c_mg: 'Vitamin C', vit_d_mcg: 'Vitamin D', vit_e_mg: 'Vitamin E', vit_k_mcg: 'Vitamin K',
  vit_b1_thiamin_mg: 'Vitamin B1 (thiamin)', vit_b2_riboflavin_mg: 'Vitamin B2 (riboflavin)', vit_b3_niacin_mg: 'Vitamin B3 (niacin)',
  vit_b5_pantothenic_mg: 'Vitamin B5', vit_b6_pyridoxine_mg: 'Vitamin B6', vit_b7_biotin_mcg: 'Vitamin B7 (biotin)',
  vit_b9_folate_mcg: 'Vitamin B9 (folate)', vit_b12_cobalamin_mcg: 'Vitamin B12',
};

/** "vit_c_mg" -> { name: "Vitamin C", unit: "mg" }; unknown keys get a tidy fallback. */
function nutrientLabel(key: string): { name: string; unit: string } {
  const unit = key.endsWith('_mcg_rae') ? 'mcg' : (key.match(/_(g|mg|mcg|kcal|kj)$/)?.[1] ?? '');
  const base = key.replace(/_(mcg_rae|g|mg|mcg|kcal|kj)$/, '').replace(/_/g, ' ');
  return { name: NAMES[key] ?? base.charAt(0).toUpperCase() + base.slice(1), unit };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (v: number) => (v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());

function howLogged(m: MealDetail): string {
  if (m.plate_group_id) return 'Plate Vision photo scan';
  if (m.nutrition_snapshot?.source === 'barcode' || m.nutrition_snapshot?.barcode) return 'Barcode scan';
  if (m.resolution_status === 'manual_entry') return 'Logged by hand';
  if (m.resolution_status === 'manual_review') return 'Needs review';
  return 'Logged in the app';
}

/** A meal in full, opened from the client's Meals tab. */
export function MealDetailSheet({ clientId, mealId, onClose }: { clientId: string; mealId: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['client', clientId, 'meal', mealId],
    queryFn: () => clientsApi.clientWorkspaceMeal(clientId, mealId),
  });
  const m = q.data;

  return (
    <Sheet onClose={onClose} ariaLabel="Meal details" className="sm:max-w-xl">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
        <span className="text-sm font-bold">Meal details</span>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/[0.06]" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {q.isLoading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-foreground/55"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : q.isError || !m ? (
          <div className="p-8 text-sm text-foreground/60">Couldn't load this meal.</div>
        ) : (
          <MealBody m={m} />
        )}
      </div>
    </Sheet>
  );
}

function MealBody({ m }: { m: MealDetail }) {
  const snap = m.nutrition_snapshot ?? {};
  const kcal = num(snap.energy_kcal) ?? m.kcal;
  const serving = num(snap.serving_g);
  const insight = (m.plate?.insight ?? null) as { summary?: string; suggestions?: string[] } | null;
  const items = m.plate?.items ?? [];
  const when = new Date(m.logged_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="space-y-5 p-5">
      {m.photo_url ? (
        // The whole photo, never cropped: tall shots get side bands instead of losing the plate.
        <div className="overflow-hidden rounded-2xl bg-foreground/[0.04]">
          <img src={m.photo_url} alt={m.meal_name ?? 'Meal photo'} className="mx-auto max-h-[65vh] w-auto max-w-full object-contain" />
        </div>
      ) : (
        <div className="grid h-28 place-items-center rounded-2xl bg-foreground/[0.03]"><Utensils className="h-6 w-6 text-foreground/30" /></div>
      )}

      <div>
        <h2 className="text-lg font-bold leading-snug">{m.meal_name || m.detected_name || 'Meal'}</h2>
        <div className="mt-0.5 text-xs text-foreground/60"><span className="capitalize">{m.meal_type.replace(/_/g, ' ')}</span> · {when}</div>
      </div>

      <div className="rounded-2xl border border-foreground/[0.06] p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-3xl font-extrabold tabular-nums">{kcal != null ? Math.round(kcal) : '—'}</span>
            <span className="ml-1 text-sm text-foreground/55">kcal</span>
          </div>
          {(serving != null || m.quantity != null) && (
            <span className="text-xs text-foreground/55">
              {m.quantity != null ? `${fmt(m.quantity)} ${m.unit ?? ''}`.trim() : `${fmt(serving!)} g serving`}
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
          {MACROS.map((x) => {
            const g = num(snap[x.key]);
            const share = g != null && kcal && x.kcalPerG ? Math.round(((g * x.kcalPerG) / kcal) * 100) : null;
            return (
              <div key={x.key}>
                <div className="text-[11px] text-foreground/55">{x.label}</div>
                <div className="text-base font-bold tabular-nums">{g != null ? `${fmt(g)} g` : '—'}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                  <div className={cn('h-full rounded-full', x.bar)} style={{ width: `${Math.min(100, share ?? (g != null ? Math.min(100, g * 5) : 0))}%` }} />
                </div>
                {share != null && <div className="mt-0.5 text-[10px] text-foreground/45">{share}% of calories</div>}
              </div>
            );
          })}
        </div>
      </div>

      {items.length > 1 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/55">On the plate</div>
          <ul className="divide-y divide-foreground/[0.05] rounded-2xl border border-foreground/[0.06]">
            {items.map((it) => {
              const s = it.nutrition_snapshot ?? {};
              return (
                <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{it.name ?? 'Food'}</div>
                    <div className="text-[11px] text-foreground/50">
                      {[it.quantity != null ? `${fmt(it.quantity)} ${it.unit ?? 'g'}` : null, it.cooking_method?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                      {num(s.protein_g) != null && ` · P ${fmt(num(s.protein_g)!)} g · C ${fmt(num(s.carbohydrate_g) ?? 0)} g · F ${fmt(num(s.fat_g) ?? 0)} g`}
                    </div>
                  </div>
                  {it.kcal != null && <span className="flex-shrink-0 tabular-nums text-foreground/75">{Math.round(it.kcal)} kcal</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {insight?.summary && (
        <div className="rounded-2xl bg-[hsl(var(--brand-magenta))]/[0.08] p-4">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--brand-blue))] dark:text-lime-300">
            <Lightbulb className="h-3.5 w-3.5" /> Plate insight
          </div>
          <p className="text-sm text-foreground/80">{insight.summary}</p>
          {insight.suggestions && insight.suggestions.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-foreground/75">
              {insight.suggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
        </div>
      )}

      {m.notes && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/55">Client's note</div>
          <p className="whitespace-pre-wrap text-sm text-foreground/80">{m.notes}</p>
        </div>
      )}

      <ExtraNutrients snap={snap} />

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-foreground/[0.06] pt-3 text-[11px] text-foreground/50">
        <span>{howLogged(m)}</span>
        {m.cooking_method && <span className="capitalize">Cooking: {m.cooking_method.replace(/_/g, ' ')}</span>}
        {m.ai_confidence != null && <span>AI confidence {Math.round(m.ai_confidence * 100)}%</span>}
        {num(snap.glycemic_index) != null && <span>Glycaemic index {fmt(num(snap.glycemic_index)!)}</span>}
      </div>
    </div>
  );
}

function ExtraNutrients({ snap }: { snap: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const extras = Object.entries(snap)
    .filter(([k, v]) => !NOT_EXTRA.has(k) && num(v) != null)
    .map(([k, v]) => ({ key: k, value: num(v)!, ...nutrientLabel(k) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!extras.length) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-foreground/55"
      >
        More nutrients ({extras.length})
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {extras.map((n) => (
            <div key={n.key} className="flex justify-between gap-3 border-b border-foreground/[0.04] py-1">
              <dt className="text-foreground/65">{n.name}</dt>
              <dd className="tabular-nums text-foreground/85">{fmt(n.value)}{n.unit ? ` ${n.unit}` : ''}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
