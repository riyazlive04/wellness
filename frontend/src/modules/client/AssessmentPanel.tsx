import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Ruler } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { assessmentApi, type AnthroMetrics, type BmiCategory, type RecordMeasurementInput } from '@/modules/workspace/api/assessment';

const CATEGORY: Record<BmiCategory, { label: string; cls: string }> = {
  underweight: { label: 'Underweight', cls: 'bg-sky-500/12 text-sky-600 dark:text-sky-300' },
  normal: { label: 'Normal', cls: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300' },
  overweight: { label: 'Overweight', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
  obese: { label: 'Obese', cls: 'bg-rose-500/12 text-rose-600 dark:text-rose-300' },
};

const FIELDS: Array<{ key: keyof RecordMeasurementInput; label: string; unit: string; placeholder: string }> = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', placeholder: 'e.g. 65' },
  { key: 'height_cm', label: 'Height', unit: 'cm', placeholder: 'e.g. 170' },
  { key: 'waist_inches', label: 'Waist', unit: 'in', placeholder: 'e.g. 32' },
  { key: 'hip_inches', label: 'Hip', unit: 'in', placeholder: 'e.g. 38' },
  { key: 'arm_inches', label: 'Arm', unit: 'in', placeholder: 'e.g. 13' },
  { key: 'chest_inches', label: 'Chest', unit: 'in', placeholder: 'e.g. 38' },
  { key: 'thigh_inches', label: 'Thigh', unit: 'in', placeholder: 'e.g. 22' },
];

export function AssessmentPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'assessment'], queryFn: () => assessmentApi.mine(), retry: 1 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: (body: RecordMeasurementInput) => assessmentApi.record(body),
    onSuccess: () => {
      toast.success('Measurement saved');
      setOpen(false); setForm({});
      qc.invalidateQueries({ queryKey: ['me', 'assessment'] });
      qc.invalidateQueries({ queryKey: ['me', 'habits'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not save.'),
  });

  function submit() {
    const body: RecordMeasurementInput = {};
    for (const f of FIELDS) { const v = form[f.key as string]?.trim(); if (v) (body as Record<string, number>)[f.key as string] = Number(v); }
    if (Object.keys(body).length === 0) { toast.error('Enter at least one value.'); return; }
    mut.mutate(body);
  }

  const a = q.data;
  const m = a?.metrics;
  const needProfile = m != null && m.bmi == null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Body assessment</h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]"
        >
          <Ruler className="h-3.5 w-3.5" /> Update measurements
        </button>
      </div>

      {q.isLoading ? (
        <Glass className="flex items-center justify-center p-8 text-sm text-foreground/55">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Glass>
      ) : m ? (
        <Glass className="p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Metric label="BMI" value={m.bmi} highlight
              chip={m.bmi_category ? CATEGORY[m.bmi_category] : undefined} />
            <Metric label="BMR" value={m.bmr_kcal} unit="kcal" digits={0} />
            <Metric label="Daily need" value={m.tdee_kcal} unit="kcal" digits={0} hint="TDEE" />
            <Metric label="Body fat" value={m.body_fat_pct} unit="%" />
            <Metric label="Waist–hip" value={m.whr} risk={m.whr_risk} digits={2} />
            <Metric label="Waist ÷ height" value={m.waist_to_height} risk={m.wth_risk} digits={2} />
          </div>

          {(m.ibw_min_kg != null || m.tdee_kcal != null) && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-foreground/[0.06] pt-3 text-[11px] text-foreground/50">
              {m.ibw_min_kg != null && <span>Ideal weight <b className="text-foreground/70">{m.ibw_min_kg}–{m.ibw_max_kg} kg</b> (target {m.ibw_target_kg})</span>}
              {m.tdee_kcal != null && <span>Eat ~<b className="text-foreground/70">{m.tdee_kcal} kcal/day</b> to maintain</span>}
              {m.abdominal_obesity && <span className="text-rose-500">Waist above the healthy limit</span>}
              <span className="text-foreground/35">{m.standard} standard</span>
            </div>
          )}

          {needProfile && (
            <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              Add your <b>height, weight, age & sex</b> (in your profile) to unlock BMI, BMR and daily-calorie targets.
            </div>
          )}
        </Glass>
      ) : null}

      {open && (
        <Glass className="mt-3 p-5">
          <div className="text-xs text-foreground/60">Enter what you measured today — any field is fine. Circumferences in inches.</div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {FIELDS.map((f) => (
              <label key={f.key as string} className="text-[11px] text-foreground/60">{f.label} ({f.unit})
                <input
                  value={form[f.key as string] ?? ''}
                  inputMode="decimal"
                  placeholder={f.placeholder}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key as string]: e.target.value.replace(/[^\d.]/g, '') }))}
                  className="mt-1 h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm placeholder:text-foreground/30 focus:border-teal-400/50 focus:outline-none"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); setForm({}); }} className="rounded-full px-3 py-1.5 text-xs text-foreground/55 hover:text-foreground">Cancel</button>
            <button type="button" onClick={submit} disabled={mut.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
              {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </Glass>
      )}
    </div>
  );
}

function Metric({
  label, value, unit, digits = 1, highlight, risk, chip, hint,
}: {
  label: string; value: number | null; unit?: string; digits?: number;
  highlight?: boolean; risk?: boolean | null; chip?: { label: string; cls: string }; hint?: string;
}) {
  return (
    <div className={cn('rounded-xl border p-3', highlight ? 'border-teal-500/30 bg-teal-500/[0.06]' : 'border-foreground/[0.07] bg-foreground/[0.015]')}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-foreground/55">
        <span>{label}</span>
        {hint && <span className="text-foreground/35">{hint}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn('text-2xl font-semibold tabular-nums', risk ? 'text-rose-500' : undefined)}>
          {value == null ? '—' : value.toFixed(digits)}
        </span>
        {unit && value != null && <span className="text-[11px] text-foreground/45">{unit}</span>}
      </div>
      {chip && (
        <span className={cn('mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', chip.cls)}>{chip.label}</span>
      )}
    </div>
  );
}

export type { AnthroMetrics };
