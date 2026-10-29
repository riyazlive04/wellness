import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Droplet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { myLabsApi, type LabHistory } from '@/modules/workspace/api/labs';
import {
  BAND_CLASS, BAND_LABEL, SUGAR_LABEL, SUGAR_MARKERS, sugarBand, type SugarMarker,
} from './sugarBands';

/** Today in the browser's own date, as YYYY-MM-DD for a date input. */
function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Today's blood sugar, entered by the client.
 *
 * Three boxes and a date, because this is a thing someone does every morning
 * while holding a glucometer - anything longer gets abandoned by the second
 * week. Blank boxes are simply not sent, so a client who only tests fasting
 * is not nagged for two readings they never take.
 *
 * The band appears as you type, which is the whole reason a client keeps
 * logging: immediate meaning, not a number filed away for the next
 * consultation. It is worded as a range, never as a diagnosis.
 */
export function SugarLogCard({ onLogged }: { onLogged?: (h: LabHistory) => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, string>>({});

  const entered = SUGAR_MARKERS
    .map((code) => ({ code, value: Number(values[code]) }))
    .filter((r) => values[r.code]?.trim() && Number.isFinite(r.value) && r.value > 0);

  const save = useMutation({
    mutationFn: () =>
      myLabsApi.logSelf(date, entered.map((r) => ({ markerCode: r.code, value: r.value }))),
    onSuccess: (history) => {
      setValues({});
      // The practitioner's view of this client reads the same rows.
      void qc.invalidateQueries({ queryKey: ['me', 'labs'] });
      qc.setQueryData(['me', 'labs'], history);
      onLogged?.(history);
      toast.success('Saved. Your chart is updated.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save your readings.'),
  });

  return (
    <Glass className="rounded-3xl border-foreground/[0.06] p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <Droplet className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Today's blood sugar</div>
          <div className="text-[11px] text-foreground/50">
            Fill in what you tested. Leave the rest blank.
          </div>
        </div>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date of these readings"
          className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 py-1 text-[11px] tabular-nums focus:border-teal-400/60 focus:outline-none"
        />
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {SUGAR_MARKERS.map((code) => (
          <Field
            key={code}
            code={code}
            value={values[code] ?? ''}
            onChange={(v) => setValues((cur) => ({ ...cur, [code]: v }))}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={!entered.length || save.isPending}
        onClick={() => save.mutate()}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-teal-700 px-4 py-2.5 text-sm font-semibold text-teal-50 hover:bg-teal-800 disabled:opacity-40"
      >
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {entered.length
          ? `Save ${entered.length} reading${entered.length === 1 ? '' : 's'}`
          : 'Enter a reading to save'}
      </button>
    </Glass>
  );
}

function Field({
  code, value, onChange,
}: {
  code: SugarMarker; value: string; onChange: (v: string) => void;
}) {
  const n = Number(value);
  // Only band a number a meter could have produced, so a half-typed "1" does
  // not flash "below range" at someone.
  const band = value.trim() && Number.isFinite(n) && n >= 20 && n <= 600
    ? sugarBand(code, n)
    : null;

  return (
    <label className="block">
      <div className="text-[11px] font-semibold text-foreground/70">{SUGAR_LABEL[code]}</div>
      <div className="relative mt-1">
        <input
          type="number"
          inputMode="numeric"
          min={20}
          max={600}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="--"
          aria-label={`${SUGAR_LABEL[code]} in mg per decilitre`}
          className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] py-2.5 pl-3 pr-14 text-sm tabular-nums focus:border-teal-400/60 focus:outline-none"
        />
        <span className="pointer-events-none absolute right-3 top-3 text-[10px] text-foreground/40">
          mg/dL
        </span>
      </div>
      {band && (
        <span className={cn(
          'mt-1 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold',
          BAND_CLASS[band],
        )}>
          {BAND_LABEL[band]}
        </span>
      )}
    </label>
  );
}
