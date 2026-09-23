import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, ChevronDown, FlaskConical,
  Loader2, Minus, Pencil, Plus, Trash2, FileInput, X, Check,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea } from 'recharts';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  labsApi, deltaTone, formatPoint, formatRange, STATUS_CLASS, STATUS_LABEL,
  type LabHistory, type LabSeries, type LabPoint, type ImportableCard,
} from '@/modules/workspace/api/labs';

/**
 * Labs tab — the client's blood work as trends rather than paperwork.
 *
 * Three jobs, in the order a practitioner actually does them:
 *   1. Pull the numbers out of a submitted lab-report form (Import).
 *   2. See what moved and what sits outside the client's own range (this list).
 *   3. Fix anything the parser could not read, or add a value by hand.
 *
 * Deliberately never interprets. Status is 'above/below range', never
 * 'abnormal'; a delta is coloured only where one direction is unambiguously
 * better for that marker, and left neutral everywhere else.
 */
export function LabsTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const historyQ = useQuery({
    queryKey: ['client', clientId, 'labs'],
    queryFn: () => labsApi.history(clientId),
  });
  const importableQ = useQuery({
    queryKey: ['client', clientId, 'labs', 'importable'],
    queryFn: () => labsApi.importable(clientId),
  });

  const history: LabHistory = historyQ.data ?? {
    series: [], totals: { markers: 0, results: 0, flagged: 0, lastTakenOn: null },
  };
  const pendingImports = (importableQ.data ?? []).filter((c) => c.alreadyImported === 0);

  const visible = useMemo(
    () => (onlyFlagged
      ? history.series.filter((s) => s.latest?.status === 'low' || s.latest?.status === 'high')
      : history.series),
    [history.series, onlyFlagged],
  );

  const byPanel = useMemo(() => {
    const groups: Array<{ panel: string; label: string; series: LabSeries[] }> = [];
    for (const s of visible) {
      let g = groups.find((x) => x.panel === s.panel);
      if (!g) { g = { panel: s.panel, label: s.panelLabel, series: [] }; groups.push(g); }
      g.series.push(s);
    }
    return groups;
  }, [visible]);

  if (historyQ.isLoading) {
    return <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Unimported reports — the whole point of the tab, so it sits above everything. */}
      {pendingImports.length > 0 && (
        <Glass className="rounded-3xl border-teal-500/25 bg-teal-500/[0.05] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <FileInput className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">
                {pendingImports.length} lab report{pendingImports.length === 1 ? '' : 's'} not imported yet
              </span>
              <span className="ml-1.5 text-foreground/60">
                {pendingImports.reduce((n, c) => n + c.rowCount, 0)} values waiting
              </span>
            </div>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-full bg-teal-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-700"
            >
              Review &amp; import
            </button>
          </div>
        </Glass>
      )}

      {/* Summary */}
      <Glass className="overflow-hidden rounded-3xl border-foreground/[0.06] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-foreground/50" />
            <span className="text-sm font-bold">Lab results</span>
            {history.totals.lastTakenOn && (
              <span className="text-[11px] text-foreground/45">
                latest {formatDate(history.totals.lastTakenOn)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-full border border-foreground/[0.12] px-3 py-1.5 text-xs font-semibold hover:bg-foreground/[0.04]"
            >
              Import from report
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-bold text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Add result
            </button>
          </div>
        </div>

        {history.totals.results === 0 ? (
          <div className="px-5 py-10 text-center">
            <FlaskConical className="mx-auto mb-2 h-7 w-7 text-foreground/20" />
            <div className="text-sm text-foreground/55">No lab results yet</div>
            <div className="mx-auto mt-1 max-w-sm text-xs text-foreground/40">
              Send the client the Lab Results assessment form, then import their answers here — or add a
              value by hand.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 divide-x divide-foreground/[0.05]">
            <Stat label="Markers" value={history.totals.markers} />
            <Stat label="Results" value={history.totals.results} />
            <Stat
              label="Outside range"
              value={history.totals.flagged}
              tone={history.totals.flagged > 0 ? 'warn' : undefined}
            />
          </div>
        )}
      </Glass>

      {history.totals.flagged > 0 && (
        <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-foreground/60">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-foreground/20"
          />
          Show only markers outside range
        </label>
      )}

      {byPanel.map((group) => (
        <Glass key={group.panel} className="overflow-hidden rounded-3xl border-foreground/[0.06] shadow-sm">
          <div className="border-b border-foreground/[0.06] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/50">
            {group.label}
          </div>
          <div className="divide-y divide-foreground/[0.05]">
            {group.series.map((s) => (
              <MarkerRow
                key={s.markerCode}
                clientId={clientId}
                series={s}
                open={expanded === s.markerCode}
                onToggle={() => setExpanded(expanded === s.markerCode ? null : s.markerCode)}
                onChanged={() => qc.invalidateQueries({ queryKey: ['client', clientId, 'labs'] })}
              />
            ))}
          </div>
        </Glass>
      ))}

      {importOpen && (
        <ImportSheet
          clientId={clientId}
          cards={importableQ.data ?? []}
          loading={importableQ.isLoading}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ['client', clientId, 'labs'] });
            setImportOpen(false);
          }}
        />
      )}

      {addOpen && (
        <AddResultSheet
          clientId={clientId}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['client', clientId, 'labs'] });
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── One marker: latest value, movement, sparkline, full history ─────────

function MarkerRow({
  clientId, series, open, onToggle, onChanged,
}: {
  clientId: string;
  series: LabSeries;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const latest = series.latest;
  const status = latest?.status ?? 'unknown';
  const tone = deltaTone(series.delta, series.higherIsWorse);
  const range = latest ? formatRange(latest.refLow, latest.refHigh, latest.refText) : null;

  // A single reading is a point, not a trend — don't draw a line through it.
  const chartData = series.points
    .filter((p) => p.value !== null)
    .map((p) => ({ date: p.takenOn, value: p.value as number }));

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-foreground/[0.02]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{series.markerLabel}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]', STATUS_CLASS[status])}>
              {STATUS_LABEL[status]}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-foreground/45">
            {range ? `Range ${range}` : 'No reference range on the report'}
            {series.points.length > 1 && ` · ${series.points.length} readings`}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-base font-extrabold tabular-nums">
            {latest ? formatPoint(latest) : <span className="text-foreground/30">—</span>}
          </div>
          {series.delta !== null && (
            <div className={cn(
              'inline-flex items-center gap-0.5 text-[11px] tabular-nums',
              tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
              tone === 'bad' && 'text-rose-600 dark:text-rose-400',
              tone === null && 'text-foreground/45',
            )}>
              {series.delta > 0 ? <ArrowUp className="h-3 w-3" /> : series.delta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {Math.abs(series.delta)}
            </div>
          )}
        </div>

        <ChevronDown className={cn('h-4 w-4 shrink-0 text-foreground/35 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-3 bg-foreground/[0.015] px-5 pb-4 pt-1">
          {chartData.length > 1 ? (
            <div className="rounded-2xl border border-foreground/[0.06] bg-card p-3">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  {/* The in-range band, drawn from the client's own report. */}
                  {latest?.refLow !== null && latest?.refHigh !== null && latest && (
                    <ReferenceArea
                      y1={latest.refLow as number}
                      y2={latest.refHigh as number}
                      fill="#10b981"
                      fillOpacity={0.07}
                    />
                  )}
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, stroke: 'currentColor', opacity: 0.5 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(d: string) => formatDate(d, true)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, stroke: 'currentColor', opacity: 0.5 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgba(127,127,127,0.2)' }}
                    labelFormatter={(d) => formatDate(String(d))}
                    formatter={(v: number) => [series.unit ? `${v} ${series.unit}` : v, series.markerLabel]}
                  />
                  <Line type="monotone" dataKey="value" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-foreground/[0.1] px-3 py-4 text-center text-[11px] text-foreground/40">
              One reading so far — a second one will draw the trend.
            </div>
          )}

          <div className="space-y-1.5">
            {[...series.points].reverse().map((p) => (
              <PointRow key={p.id} clientId={clientId} point={p} onChanged={onChanged} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One historical reading, editable in place — the fix path for a bad parse. */
function PointRow({ clientId, point, onChanged }: { clientId: string; point: LabPoint; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(point.value !== null ? String(point.value) : '');

  const saveMut = useMutation({
    mutationFn: () => labsApi.update(clientId, point.id, { value: Number(value), valueText: value }),
    onSuccess: () => { toast.success('Result updated.'); setEditing(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not update.'),
  });

  const delMut = useMutation({
    mutationFn: () => labsApi.remove(clientId, point.id),
    onSuccess: () => { toast.success('Result deleted.'); onChanged(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not delete.'),
  });

  const numeric = value.trim() !== '' && Number.isFinite(Number(value));

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs',
      point.value === null
        ? 'border-amber-500/25 bg-amber-500/[0.05]'
        : 'border-foreground/[0.06] bg-card',
    )}>
      <span className="w-20 shrink-0 tabular-nums text-foreground/55">{formatDate(point.takenOn, true)}</span>

      {editing ? (
        <>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-foreground/15 bg-background px-2 py-1 tabular-nums"
            placeholder="Value"
          />
          <button
            type="button"
            disabled={!numeric || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="rounded-lg bg-foreground p-1.5 text-background disabled:opacity-40"
            aria-label="Save"
          >
            {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setValue(point.value !== null ? String(point.value) : ''); }}
            className="rounded-lg p-1.5 text-foreground/50 hover:bg-foreground/[0.06]"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 font-semibold tabular-nums">
            {formatPoint(point)}
            {point.value === null && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-normal text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> not read as a number
              </span>
            )}
          </span>
          {point.labName && <span className="hidden truncate text-foreground/40 sm:block">{point.labName}</span>}
          <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase', STATUS_CLASS[point.status])}>
            {point.status === 'unknown' ? '—' : STATUS_LABEL[point.status]}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg p-1.5 text-foreground/45 hover:bg-foreground/[0.06]"
            aria-label="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={delMut.isPending}
            onClick={() => delMut.mutate()}
            className="rounded-lg p-1.5 text-foreground/45 hover:bg-rose-500/10 hover:text-rose-500"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

// ─── Import ──────────────────────────────────────────────────────────────

function ImportSheet({
  clientId, cards, loading, onClose, onImported,
}: {
  clientId: string;
  cards: ImportableCard[];
  loading: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const previewQ = useQuery({
    queryKey: ['client', clientId, 'labs', 'preview', selected],
    queryFn: () => labsApi.previewImport(clientId, selected as string),
    enabled: !!selected,
  });

  const importMut = useMutation({
    mutationFn: () => labsApi.importCard(clientId, selected as string),
    onSuccess: (r) => {
      toast.success(
        `Imported ${r.imported} value${r.imported === 1 ? '' : 's'}` +
        (r.unparsed > 0 ? ` — ${r.unparsed} need a number typed in` : ''),
      );
      onImported();
    },
    onError: (e: Error) => toast.error(e.message ?? 'Import failed.'),
  });

  return (
    <Overlay title="Import lab results" onClose={onClose}>
      {loading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
      ) : cards.length === 0 ? (
        <div className="px-1 py-8 text-center text-sm text-foreground/50">
          No submitted assessment contains readable lab values yet.
          <div className="mx-auto mt-1 max-w-xs text-xs text-foreground/40">
            Send the client the <strong>Lab Results</strong> form from the Assessments tab, and their
            answers will show up here once submitted.
          </div>
        </div>
      ) : !selected ? (
        <div className="space-y-2">
          {cards.map((c) => (
            <button
              key={c.cardId}
              type="button"
              onClick={() => setSelected(c.cardId)}
              className="flex w-full items-center gap-3 rounded-2xl border border-foreground/[0.08] bg-card px-4 py-3 text-left hover:border-teal-500/40"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{c.title}</div>
                <div className="mt-0.5 text-[11px] text-foreground/50">
                  {c.reportDate ? `Report dated ${formatDate(c.reportDate)}` : `Submitted ${formatDate(c.submittedAt)}`}
                  {c.labName && ` · ${c.labName}`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold tabular-nums">{c.rowCount}</div>
                <div className="text-[10px] text-foreground/45">values</div>
              </div>
              {c.alreadyImported > 0 && (
                <span className="shrink-0 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[10px] font-semibold text-foreground/55">
                  imported
                </span>
              )}
            </button>
          ))}
        </div>
      ) : previewQ.isLoading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs font-semibold text-foreground/55 hover:text-foreground"
          >
            ← Choose a different report
          </button>

          {previewQ.data && previewQ.data.rows.some((r) => r.unparsed) && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-foreground/70">
                {previewQ.data.rows.filter((r) => r.unparsed).length} value(s) could not be read as a number.
                They are imported as-is so you can correct them in place — nothing is guessed.
              </span>
            </div>
          )}

          <div className="max-h-[45vh] space-y-1 overflow-y-auto">
            {previewQ.data?.rows.map((r, i) => (
              <div
                key={`${r.markerCode}-${r.takenOn}-${i}`}
                className="flex items-center gap-2 rounded-xl border border-foreground/[0.06] bg-card px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{r.markerLabel}</span>
                <span className="tabular-nums font-semibold">
                  {r.value !== null ? `${r.value}${r.unit ? ` ${r.unit}` : ''}` : (
                    <span className="text-amber-600 dark:text-amber-400">{r.valueText ?? '—'}</span>
                  )}
                </span>
                <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase', STATUS_CLASS[r.status])}>
                  {r.status === 'unknown' ? '—' : STATUS_LABEL[r.status]}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={importMut.isPending || !previewQ.data?.rows.length}
            onClick={() => importMut.mutate()}
            className="w-full rounded-full bg-teal-600 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {importMut.isPending
              ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              : `Import ${previewQ.data?.rows.length ?? 0} value(s)`}
          </button>
        </div>
      )}
    </Overlay>
  );
}

// ─── Manual entry ────────────────────────────────────────────────────────

function AddResultSheet({ clientId, onClose, onSaved }: { clientId: string; onClose: () => void; onSaved: () => void }) {
  const catalogueQ = useQuery({ queryKey: ['labs', 'catalogue'], queryFn: () => labsApi.catalogue(), staleTime: 3_600_000 });
  const [markerCode, setMarkerCode] = useState('');
  const [value, setValue] = useState('');
  const [takenOn, setTakenOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [refLow, setRefLow] = useState('');
  const [refHigh, setRefHigh] = useState('');
  const [labName, setLabName] = useState('');

  const marker = catalogueQ.data?.markers.find((m) => m.code === markerCode);

  const saveMut = useMutation({
    mutationFn: () => labsApi.create(clientId, {
      markerCode,
      value: Number(value),
      takenOn,
      refLow: refLow.trim() ? Number(refLow) : undefined,
      refHigh: refHigh.trim() ? Number(refHigh) : undefined,
      labName: labName.trim() || undefined,
    }),
    onSuccess: () => { toast.success('Result saved.'); onSaved(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not save.'),
  });

  const valid = markerCode && value.trim() !== '' && Number.isFinite(Number(value)) && takenOn;

  return (
    <Overlay title="Add a lab result" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Marker">
          <select
            value={markerCode}
            onChange={(e) => setMarkerCode(e.target.value)}
            className="w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a marker…</option>
            {catalogueQ.data?.panels.map((p) => {
              const inPanel = catalogueQ.data.markers.filter((m) => m.panel === p.code);
              if (!inPanel.length) return null;
              return (
                <optgroup key={p.code} label={p.label}>
                  {inPanel.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
                </optgroup>
              );
            })}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Result${marker?.unit ? ` (${marker.unit})` : ''}`}>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 6.4"
              className="w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm tabular-nums"
            />
          </Field>
          <Field label="Test date">
            <input
              type="date"
              value={takenOn}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setTakenOn(e.target.value)}
              className="w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Range low (optional)">
            <input
              value={refLow}
              onChange={(e) => setRefLow(e.target.value)}
              inputMode="decimal"
              placeholder={marker?.fallbackRef?.low != null ? String(marker.fallbackRef.low) : '—'}
              className="w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm tabular-nums"
            />
          </Field>
          <Field label="Range high (optional)">
            <input
              value={refHigh}
              onChange={(e) => setRefHigh(e.target.value)}
              inputMode="decimal"
              placeholder={marker?.fallbackRef?.high != null ? String(marker.fallbackRef.high) : '—'}
              className="w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm tabular-nums"
            />
          </Field>
        </div>

        <p className="text-[11px] leading-relaxed text-foreground/45">
          Use the range printed on this client's own report. Left blank, a conservative adult range is used
          where one exists — and no range at all means the value is stored without a flag rather than
          measured against someone else's lab.
        </p>

        <Field label="Lab (optional)">
          <input
            value={labName}
            onChange={(e) => setLabName(e.target.value)}
            placeholder="e.g. Apollo Diagnostics"
            className="w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm"
          />
        </Field>

        <button
          type="button"
          disabled={!valid || saveMut.isPending}
          onClick={() => saveMut.mutate()}
          className="w-full rounded-full bg-foreground py-2.5 text-sm font-bold text-background hover:opacity-90 disabled:opacity-40"
        >
          {saveMut.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Save result'}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Small shared pieces ────────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="px-5 py-3.5 text-center">
      <div className={cn(
        'text-xl font-extrabold tabular-nums',
        tone === 'warn' && 'text-amber-600 dark:text-amber-400',
      )}>
        {value}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/45">{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/50">{label}</span>
      {children}
    </label>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-foreground/[0.08] bg-card p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Activity className="h-4 w-4 text-foreground/50" /> {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/60 hover:bg-foreground/[0.06]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function formatDate(iso: string, short = false): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, short
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}
